/* Canapé TV — lecteur vidéo intégré des TV Samsung (« AVPlay »).
 *
 * Le lecteur web standard des TV Samsung décode mal le son multicanal (5.1, Dolby Digital) des flux IPTV :
 * le son grésille et les voix paraissent lointaines (la voie centrale, celle des dialogues, est mal mélangée).
 * Le lecteur intégré de la TV décode le son avec la puce de la TV, comme les applis du commerce.
 *
 * Cet objet se comporte comme une balise <video> (mêmes propriétés et événements) pour que le reste
 * du lecteur de Canapé TV n'ait rien à changer. Il n'est utilisé que si la TV fournit le lecteur intégré ;
 * sinon (navigateur, tests), on garde la balise <video>.
 */
(function (global) {
  'use strict';

  function api() {
    try { return global.webapis && global.webapis.avplay ? global.webapis.avplay : null; } catch (e) { return null; }
  }

  // ------------------------------------------------------------ petites listes de pistes (comme video.audioTracks)

  function trackList() {
    var list = [];
    list.addEventListener = function () { /* les pistes sont annoncées par « loadedmetadata » */ };
    list.removeEventListener = function () {};
    return list;
  }

  function parseInfo(s) {
    if (!s) return {};
    if (typeof s === 'object') return s;
    try { return JSON.parse(s); } catch (e) { return {}; }
  }

  function AvVideo() {
    this.node = document.createElement('object');
    this.node.setAttribute('type', 'application/avplayer');
    this.node.className = 'avplayer';
    this._listeners = {};
    this._src = '';
    this._token = 0;
    this._prepared = false;
    this._wantPlay = false;
    this._time = 0;
    this._dur = NaN;
    this._curText = null;
    this.paused = true;
    this.preload = 'auto';
    this.error = null;
    this.audioTracks = trackList();
    this.textTracks = trackList();
    this.isAvPlay = true;
  }

  var P = AvVideo.prototype;

  // --- événements
  P.addEventListener = function (name, fn) { (this._listeners[name] || (this._listeners[name] = [])).push(fn); };
  P.removeEventListener = function (name, fn) {
    var l = this._listeners[name] || [];
    for (var i = l.length - 1; i >= 0; i--) if (l[i] === fn) l.splice(i, 1);
  };
  P._emit = function (name) {
    var l = (this._listeners[name] || []).slice();
    for (var i = 0; i < l.length; i++) { try { l[i].call(this, { type: name }); } catch (e) { if (global.console) global.console.log(e); } }
  };
  P._emitLater = function (name) { var self = this; setTimeout(function () { self._emit(name); }, 0); };

  // --- attributs
  P.setAttribute = function (k, v) { if (k === 'src') this.src = v; };
  P.getAttribute = function (k) { return k === 'src' ? (this._src || null) : null; };
  P.removeAttribute = function (k) { if (k === 'src') this._src = ''; };

  Object.defineProperty(P, 'src', {
    get: function () { return this._src; },
    set: function (v) { this._src = v || ''; }
  });
  Object.defineProperty(P, 'currentSrc', { get: function () { return this._src; } });
  Object.defineProperty(P, 'duration', { get: function () { return this._dur; } });
  Object.defineProperty(P, 'currentTime', {
    get: function () {
      var av = api();
      if (av && this._prepared) {
        try { var ms = av.getCurrentTime(); if (ms >= 0) this._time = ms / 1000; } catch (e) { /* on garde la dernière valeur */ }
      }
      return this._time;
    },
    set: function (sec) {
      var av = api(), self = this, tok = this._token;
      if (!av || !this._prepared) throw new Error('pas encore prêt');
      sec = Math.max(0, +sec || 0);
      this._time = sec;
      try {
        av.seekTo(Math.floor(sec * 1000), function () {
          if (tok !== self._token) return;
          self._emit('seeked');
          self._emit('timeupdate');
        }, function () { /* flux sans avance possible (direct) */ });
      } catch (e) { /* rien */ }
    }
  });

  // --- zone d'affichage : tout l'écran
  P._rect = function () {
    var av = api();
    if (!av) return;
    var w = global.innerWidth || 1920, h = global.innerHeight || 1080;
    try { av.setDisplayRect(0, 0, w, h); } catch (e) { /* rien */ }
    try { av.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX'); } catch (e2) { /* rien */ }
  };

  P._close = function () {
    var av = api();
    if (!av) return;
    try { av.stop(); } catch (e) { /* rien */ }
    try { av.close(); } catch (e2) { /* rien */ }
  };

  // --- ouverture du flux (comme video.load())
  P.load = function () {
    var av = api(), self = this;
    var tok = ++this._token;
    this._close();
    this._prepared = false;
    this._time = 0;
    this._dur = NaN;
    this.paused = true;
    this.error = null;
    this._setCue(null, '');
    this._curText = null;
    this.audioTracks = trackList();
    this.textTracks = trackList();
    if (!this._src || !av) return;
    try {
      av.open(this._src);
      av.setListener({
        onbufferingstart: function () { if (tok === self._token) self._emit('waiting'); },
        onbufferingprogress: function () {},
        onbufferingcomplete: function () { if (tok === self._token && !self.paused) self._emit('playing'); },
        oncurrentplaytime: function (ms) {
          if (tok !== self._token) return;
          self._time = (+ms || 0) / 1000;
          self._emit('timeupdate');
        },
        onstreamcompleted: function () {
          if (tok !== self._token) return;
          self.paused = true;
          self._emit('ended');
        },
        onerror: function (e) {
          if (tok !== self._token) return;
          self.error = { message: String(e) };
          self._emit('error');
        },
        onevent: function () {},
        onsubtitlechange: function (duration, text) { if (tok === self._token) self._subtitle(duration, text); },
        ondrmevent: function () {}
      });
      this._rect();
      av.prepareAsync(function () {
        if (tok !== self._token) return;
        self._prepared = true;
        var d = 0;
        try { d = av.getDuration(); } catch (e) { d = 0; }
        self._dur = d > 0 ? d / 1000 : NaN;
        self._readTracks();
        self._emit('loadedmetadata');
        self._emit('canplay');
        if (self._wantPlay) self._doPlay();
      }, function (err) {
        if (tok !== self._token) return;
        self.error = { message: String(err) };
        self._emit('error');
      });
    } catch (e) {
      this.error = { message: e.message };
      this._emitLater('error');
    }
  };

  P._doPlay = function () {
    var av = api();
    if (!av || !this._prepared) return;
    try { av.play(); } catch (e) { this.error = { message: e.message }; this._emitLater('error'); return; }
    this.paused = false;
    this._emit('play');
    this._emit('playing');
  };

  P.play = function () {
    this._wantPlay = true;
    if (this._prepared && this.paused) this._doPlay();
    return undefined;
  };

  P.pause = function () {
    this._wantPlay = false;
    var av = api();
    if (!av || !this._prepared || this.paused) return;
    try { av.pause(); } catch (e) { /* rien */ }
    this.paused = true;
    this._emit('pause');
  };

  // --- pistes audio et sous-titres
  var LANG_KEYS = ['language', 'lang', 'track_lang'];
  function langOf(info) {
    for (var i = 0; i < LANG_KEYS.length; i++) if (info[LANG_KEYS[i]]) return String(info[LANG_KEYS[i]]);
    return '';
  }

  P._readTracks = function () {
    var av = api(), self = this;
    var all = [], current = [];
    try { all = av.getTotalTrackInfo() || []; } catch (e) { all = []; }
    try { current = av.getCurrentStreamInfo() || []; } catch (e2) { current = []; }
    var curAudio = -1;
    for (var c = 0; c < current.length; c++) if (current[c].type === 'AUDIO') curAudio = +current[c].index;
    var audio = trackList(), text = trackList();
    for (var i = 0; i < all.length; i++) {
      var t = all[i], info = parseInfo(t.extra_info);
      if (t.type === 'AUDIO') audio.push(this._audioTrack(+t.index, info, +t.index === curAudio || (curAudio < 0 && audio.length === 0)));
      else if (t.type === 'TEXT') text.push(this._textTrack(+t.index, info));
    }
    this.audioTracks = audio;
    this.textTracks = text;
    // pas de sous-titres tant qu'on n'en choisit pas
    try { av.setSilentSubtitle(true); } catch (e3) { /* rien */ }
    return self;
  };

  P._audioTrack = function (index, info, on) {
    var self = this;
    var label = info.fourCC ? String(info.fourCC) + (info.channels ? ' ' + info.channels + ' canaux' : '') : '';
    var tr = { language: langOf(info), label: label, kind: 'main', id: String(index), _on: !!on };
    Object.defineProperty(tr, 'enabled', {
      get: function () { return tr._on; },
      set: function (v) {
        v = !!v;
        if (v && !tr._on) {
          try { api().setSelectTrack('AUDIO', index); } catch (e) { return; }
          for (var i = 0; i < self.audioTracks.length; i++) if (self.audioTracks[i] !== tr) self.audioTracks[i]._on = false;
        }
        tr._on = v;
      }
    });
    return tr;
  };

  P._textTrack = function (index, info) {
    var self = this;
    var tr = { kind: 'subtitles', language: langOf(info), label: '', id: String(index),
      activeCues: [], _mode: 'disabled', _l: [] };
    tr.addEventListener = function (n, fn) { if (n === 'cuechange') tr._l.push(fn); };
    tr.removeEventListener = function (n, fn) { for (var i = tr._l.length - 1; i >= 0; i--) if (tr._l[i] === fn) tr._l.splice(i, 1); };
    Object.defineProperty(tr, 'mode', {
      get: function () { return tr._mode; },
      set: function (m) {
        var av = api();
        tr._mode = m;
        if (m === 'hidden' || m === 'showing') {
          try { av.setSelectTrack('TEXT', index); av.setSilentSubtitle(false); } catch (e) { /* rien */ }
          self._curText = tr;
        } else if (self._curText === tr) {
          try { av.setSilentSubtitle(true); } catch (e2) { /* rien */ }
          self._curText = null;
          self._setCue(tr, '');
        }
      }
    });
    return tr;
  };

  P._setCue = function (tr, text) {
    if (!tr) return;
    tr.activeCues = text ? [{ text: text }] : [];
    var l = tr._l.slice();
    for (var i = 0; i < l.length; i++) { try { l[i](); } catch (e) { /* rien */ } }
  };

  P._subtitle = function (duration, text) {
    var tr = this._curText, self = this;
    if (!tr) return;
    clearTimeout(this._cueTimer);
    this._setCue(tr, String(text || ''));
    var ms = +duration || 3000;
    this._cueTimer = setTimeout(function () { if (self._curText === tr) self._setCue(tr, ''); }, ms);
  };

  global.AvPlay = {
    available: function () { return !!api(); },
    create: function () { return new AvVideo(); }
  };
})(window);
