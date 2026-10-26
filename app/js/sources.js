/* Canapé TV (Samsung Tizen) — sources (M3U, Xtream), bibliothèque, guide des programmes, données de l'utilisateur. */
(function (global) {
  'use strict';
  var U = global.U;

  // =============================================================== réseau (via le service de la TV si présent)

  // Trois façons de joindre le fournisseur, de la meilleure à la moins bonne :
  //  - 'http'  : le service de l'appli (sur la TV) répond sur http://127.0.0.1:8095, comme sur Samsung ;
  //  - 'luna'  : le service répond par le bus de messages de webOS (si le port local est refusé) ;
  //  - 'direct': pas de service, la page interroge le fournisseur elle-même (certains refusent).
  function qs(obj) {
    var out = [];
    for (var k in obj) if (obj.hasOwnProperty(k) && obj[k] !== undefined && obj[k] !== null) out.push(encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]));
    return out.join('&');
  }

  var Net = {
    service: 'http://127.0.0.1:8095',
    hasService: false,
    mode: 'direct',
    keepAlive: null,

    detect: function (cb) {
      var Luna = global.Luna;
      var done = false;
      function finish(mode) {
        if (done) return;
        done = true;
        Net.mode = mode;
        Net.hasService = mode !== 'direct';
        cb(Net.hasService);
      }
      function pingHttp(port, tries, then) {
        U.json('http://127.0.0.1:' + port + '/ping', { timeout: 2000 }, function (err, data) {
          if (!err && data && data.ok === true) return then(true);
          if (tries > 1) return setTimeout(function () { pingHttp(port, tries - 1, then); }, 500);
          then(false);
        });
      }
      if (Luna && Luna.available()) {
        // Sur la TV : on démarre le service (le 1er démarrage peut prendre plusieurs secondes)
        // et on reste abonné pour qu'il ne s'arrête pas tant que l'appli est ouverte.
        var answered = false;
        Net.keepAlive = Luna.call('start', { subscribe: true }, function (res) {
          if (answered) return;
          answered = true;
          if (!res || res.returnValue === false || !res.ok) {
            // le service ne répond pas : peut-être déjà lancé à part, on tente le port local
            return pingHttp(8095, 2, function (ok) { finish(ok ? 'http' : 'direct'); });
          }
          var port = res.port || 8095;
          Net.service = 'http://127.0.0.1:' + port;
          if (!res.http) return finish('luna');
          pingHttp(port, 3, function (ok) { finish(ok ? 'http' : 'luna'); });
        });
        setTimeout(function () {
          if (answered) return;
          answered = true;
          pingHttp(8095, 1, function (ok) { finish(ok ? 'http' : 'direct'); });
        }, 15000);
        return;
      }
      // Samsung : TizenBrew démarre le service en même temps que la page, on lui laisse quelques secondes
      var started = Date.now();
      (function ping() {
        U.json(Net.service + '/ping', { timeout: 1500 }, function (err, data) {
          if (!err && data && data.ok === true) return finish('http');
          if (Date.now() - started > 9000) return finish('direct');
          setTimeout(ping, 700);
        });
      })();
    },

    // Adresse à appeler pour récupérer target (mode 'http' ou 'direct').
    url: function (target) {
      return Net.mode === 'http' ? Net.service + '/get?url=' + encodeURIComponent(target) : target;
    },

    viaLuna: function (target, cb) {
      global.Luna.call('get', { url: target }, function (res) {
        if (!res || res.returnValue === false) return cb(new Error(res && res.errorText ? 'Connexion impossible : ' + res.errorText : 'Connexion impossible'));
        if (res.status >= 400) return cb(new Error('Erreur ' + res.status), res.body, res.status);
        cb(null, res.body || '', res.status);
      }, { timeout: 120000 });
    },

    text: function (target, cb) {
      if (Net.mode === 'luna') return Net.viaLuna(target, cb);
      U.xhr(Net.url(target), { timeout: 90000 }, function (err, text, status) {
        if (err && Net.mode === 'http') {
          // le service n'est plus joignable par le port local : on passe par le bus webOS
          if (!status && global.Luna && global.Luna.available()) return Net.viaLuna(target, cb);
          if (status === 502) {
            var msg = '';
            try { msg = JSON.parse(text).error; } catch (e) { /* rien */ }
            if (msg) return cb(new Error('Connexion impossible : ' + msg), text, status);
          }
        }
        cb(err, text, status);
      });
    },

    json: function (target, cb) {
      Net.text(target, function (err, text, status) {
        if (err) return cb(err, null, status);
        var data;
        try { data = JSON.parse(text); } catch (e) { return cb(new Error('Réponse illisible'), null, status); }
        cb(null, data, status);
      });
    },

    // Fonctions du service (guide des programmes). cb(err, données)
    api: function (path, query, cb) {
      if (Net.mode === 'http') {
        return U.json(Net.service + path + '?' + qs(query || {}), { timeout: 30000 }, function (err, data, status) {
          if (err && !status && global.Luna && global.Luna.available()) return Net.apiLuna(path, query, cb);
          cb(err, data);
        });
      }
      if (Net.mode === 'luna') return Net.apiLuna(path, query, cb);
      cb(new Error('Service absent'), null);
    },

    apiLuna: function (path, query, cb) {
      global.Luna.call('api', { path: path, query: query || {} }, function (res) {
        if (!res || res.returnValue === false) return cb(new Error((res && res.errorText) || 'Service absent'), null);
        cb(null, res.data);
      }, { timeout: 30000 });
    }
  };

  // =============================================================== profils (playlists enregistrées)

  var Profiles = {
    list: function () { return U.store.get('profiles', []); },
    save: function (list) { U.store.set('profiles', list); },
    activeId: function () { return U.store.get('activeProfile', null); },
    active: function () {
      var list = Profiles.list();
      var id = Profiles.activeId();
      return U.find(list, function (p) { return p.id === id; }) || list[0] || null;
    },
    setActive: function (id) { U.store.set('activeProfile', id); },
    upsert: function (profile) {
      var list = Profiles.list();
      if (!profile.id) profile.id = 'p' + Date.now().toString(36);
      var found = false;
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === profile.id) { list[i] = profile; found = true; }
      }
      if (!found) list.push(profile);
      Profiles.save(list);
      return profile;
    },
    remove: function (id) {
      Profiles.save(Profiles.list().filter(function (p) { return p.id !== id; }));
      if (Profiles.activeId() === id) U.store.remove('activeProfile');
    }
  };

  // =============================================================== réglages

  var Settings = {
    defaults: { hideAdult: true, pin: '', streamFormat: 'm3u8', devmodeAuto: 'launch' },
    get: function () { return U.extend({}, Settings.defaults, U.store.get('settings', {})); },
    set: function (patch) { U.store.set('settings', U.extend(Settings.get(), patch)); }
  };

  var ADULT = /(adult|adulte|xxx|\+ ?18|18 ?\+|porn|érotique|erotic|hot ?club)/i;
  function isAdult(group) { return ADULT.test(group || ''); }

  // =============================================================== analyse d'une playlist M3U

  var SERIES_RE = /^(.*?)[\s._\-|]*S(\d{1,2})[\s._\-]*E(\d{1,4})\b/i;
  var VOD_EXT = /\.(mp4|mkv|avi|mov|m4v|wmv|flv|webm)(\?|$)/i;

  function parseAttrs(s) {
    var out = {};
    var re = /([\w-]+)\s*=\s*"([^"]*)"/g;
    var m;
    while ((m = re.exec(s))) out[m[1].toLowerCase()] = m[2];
    return out;
  }

  // Coupe "#EXTINF:-1 attr="..." ...,Nom" en attributs + nom, en ignorant les virgules dans les guillemets.
  function splitExtinf(line) {
    var inQuote = false;
    for (var i = 8; i < line.length; i++) {
      var c = line.charAt(i);
      if (c === '"') inQuote = !inQuote;
      else if (c === ',' && !inQuote) return { attrs: line.slice(8, i), name: line.slice(i + 1).trim() };
    }
    return { attrs: line.slice(8), name: '' };
  }

  function parseM3U(text) {
    var lines = text.split(/\r?\n/);
    var items = [];
    var header = {};
    var cur = null;
    if (!/^\s*#EXTM3U/i.test(lines[0] || '') && !/#EXTINF/i.test(text.slice(0, 5000))) {
      throw new Error('Ce fichier n\'est pas une playlist M3U');
    }
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      if (line.charAt(0) === '#') {
        if (/^#EXTM3U/i.test(line)) header = parseAttrs(line);
        else if (/^#EXTINF/i.test(line)) {
          var parts = splitExtinf(line);
          var a = parseAttrs(parts.attrs);
          cur = {
            name: parts.name || a['tvg-name'] || 'Sans nom',
            logo: a['tvg-logo'] || a.logo || '',
            group: a['group-title'] || '',
            tvgId: a['tvg-id'] || '',
            tvgName: a['tvg-name'] || '',
            chno: a['tvg-chno'] || a['channel-number'] || ''
          };
        } else if (/^#EXTGRP:/i.test(line) && cur && !cur.group) {
          cur.group = line.slice(8).trim();
        }
        continue;
      }
      if (cur) {
        cur.url = line;
        items.push(cur);
        cur = null;
      }
    }
    return { items: items, epgUrl: header['url-tvg'] || header['x-tvg-url'] || '' };
  }

  function classifyM3U(raw) {
    var lib = newLibrary();
    var seriesMap = {};
    U.each(raw.items, function (it, idx) {
      var url = it.url;
      var group = it.group || 'Sans catégorie';
      var sm = SERIES_RE.exec(it.name);
      var isSeriesUrl = /\/series\//i.test(url);
      var isMovieUrl = /\/movies?\//i.test(url);
      if (isSeriesUrl || (sm && VOD_EXT.test(url))) {
        var sName = sm ? sm[1].trim() : it.name;
        var key = group + '|' + sName.toLowerCase();
        var s = seriesMap[key];
        if (!s) {
          s = seriesMap[key] = {
            kind: 'series', id: 'm3us:' + key, name: sName || it.name, logo: it.logo, group: group,
            seasons: {}
          };
          lib.series.push(s);
        }
        var season = sm ? +sm[2] : 1;
        var ep = sm ? +sm[3] : (s.seasons[season] ? s.seasons[season].length + 1 : 1);
        (s.seasons[season] || (s.seasons[season] = [])).push({
          kind: 'episode', id: 'm3ue:' + url, name: it.name, season: season, episode: ep,
          url: url, logo: it.logo, seriesName: s.name
        });
      } else if (isMovieUrl || VOD_EXT.test(url)) {
        lib.movies.push({ kind: 'movie', id: 'm3um:' + url, name: it.name, logo: it.logo, group: group, url: url });
      } else {
        lib.live.push({
          kind: 'live', id: 'm3ul:' + url, name: it.name, logo: it.logo, group: group, url: url,
          epgKey: it.tvgId || it.tvgName || it.name, num: +it.chno || 0, order: idx
        });
      }
    });
    U.each(lib.series, function (s) {
      for (var k in s.seasons) {
        if (s.seasons.hasOwnProperty(k)) s.seasons[k].sort(function (a, b) { return a.episode - b.episode; });
      }
    });
    return lib;
  }

  // =============================================================== Xtream Codes

  function xtreamBase(p) {
    var server = (p.server || '').trim().replace(/\/+$/, '');
    if (server && !/^https?:\/\//i.test(server)) server = 'http://' + server;
    return server;
  }

  function xtreamApi(p, params) {
    var q = 'username=' + encodeURIComponent(p.username) + '&password=' + encodeURIComponent(p.password);
    return xtreamBase(p) + '/player_api.php?' + q + (params ? '&' + params : '');
  }

  function xtreamStream(p, type, id, ext) {
    return xtreamBase(p) + '/' + type + '/' + encodeURIComponent(p.username) + '/' + encodeURIComponent(p.password) + '/' + id + '.' + ext;
  }

  function loadXtream(p, progress, cb) {
    var lib = newLibrary();
    var fmt = Settings.get().streamFormat === 'ts' ? 'ts' : 'm3u8';
    progress('Connexion au serveur…');
    Net.json(xtreamApi(p), function (err, info) {
      if (err) return cb(err);
      if (!info || !info.user_info || String(info.user_info.auth) !== '1') {
        return cb(new Error('Identifiant ou mot de passe refusé par le serveur'));
      }
      lib.account = {
        status: info.user_info.status,
        expires: info.user_info.exp_date ? +info.user_info.exp_date * 1000 : 0,
        connections: info.user_info.max_connections
      };
      var steps = [
        ['get_live_categories', 'liveCats'], ['get_live_streams', 'live'],
        ['get_vod_categories', 'vodCats'], ['get_vod_streams', 'vod'],
        ['get_series_categories', 'seriesCats'], ['get_series', 'series']
      ];
      var data = {};
      var i = 0;
      (function next() {
        if (i >= steps.length) return build();
        var st = steps[i++];
        progress('Chargement ' + ({ live: 'des chaînes', vod: 'des films', series: 'des séries' }[st[1]] || 'des catégories') + '…');
        Net.json(xtreamApi(p, 'action=' + st[0]), function (e, d) {
          data[st[1]] = (!e && d && d.length !== undefined) ? d : [];
          next();
        });
      })();

      function catMap(list) {
        var m = {};
        U.each(list || [], function (c) { m[c.category_id] = c.category_name; });
        return m;
      }

      function build() {
        var lc = catMap(data.liveCats), vc = catMap(data.vodCats), sc = catMap(data.seriesCats);
        U.each(data.live, function (s, idx) {
          lib.live.push({
            kind: 'live', id: 'xl:' + s.stream_id, streamId: s.stream_id, name: s.name || 'Sans nom',
            logo: s.stream_icon || '', group: lc[s.category_id] || 'Sans catégorie',
            url: xtreamStream(p, 'live', s.stream_id, fmt),
            epgKey: s.epg_channel_id || s.name, num: +s.num || 0, order: idx, catOrder: catIndex(data.liveCats, s.category_id)
          });
        });
        U.each(data.vod, function (s) {
          lib.movies.push({
            kind: 'movie', id: 'xm:' + s.stream_id, streamId: s.stream_id, name: s.name || 'Sans titre',
            logo: s.stream_icon || '', group: vc[s.category_id] || 'Sans catégorie',
            url: xtreamStream(p, 'movie', s.stream_id, s.container_extension || 'mp4'),
            rating: s.rating_5based ? +s.rating_5based : (s.rating ? +s.rating / 2 : 0),
            added: +s.added || 0, catOrder: catIndex(data.vodCats, s.category_id)
          });
        });
        U.each(data.series, function (s) {
          lib.series.push({
            kind: 'series', id: 'xs:' + s.series_id, seriesId: s.series_id, name: s.name || 'Sans titre',
            logo: s.cover || '', group: sc[s.category_id] || 'Sans catégorie', plot: s.plot || '',
            year: (s.releaseDate || s.release_date || '').slice(0, 4), genre: s.genre || '',
            rating: s.rating_5based ? +s.rating_5based : (s.rating ? +s.rating / 2 : 0),
            backdrop: s.backdrop_path && s.backdrop_path[0] ? s.backdrop_path[0] : '',
            added: +s.last_modified || 0, catOrder: catIndex(data.seriesCats, s.category_id)
          });
        });
        lib.epgUrl = xtreamBase(p) + '/xmltv.php?username=' + encodeURIComponent(p.username) + '&password=' + encodeURIComponent(p.password);
        cb(null, lib);
      }
    });
  }

  function catIndex(cats, id) {
    for (var i = 0; i < (cats || []).length; i++) if (cats[i].category_id === id) return i;
    return 9999;
  }

  // Détails d'un film (résumé, genre, durée) — Xtream uniquement.
  function movieInfo(p, item, cb) {
    if (!p || p.type !== 'xtream' || !item.streamId) return cb(null, {});
    Net.json(xtreamApi(p, 'action=get_vod_info&vod_id=' + item.streamId), function (err, d) {
      if (err || !d || !d.info) return cb(null, {});
      var i = d.info;
      cb(null, {
        plot: i.plot || i.description || '',
        genre: i.genre || '',
        year: (i.releasedate || i.release_date || '').slice(0, 4),
        duration: i.duration || '',
        durationSec: +i.duration_secs || U.parseDuration(i.duration),
        cast: i.cast || i.actors || '',
        director: i.director || '',
        backdrop: i.backdrop_path && i.backdrop_path[0] ? i.backdrop_path[0] : '',
        rating: i.rating ? +i.rating / 2 : 0
      });
    });
  }

  // Saisons et épisodes d'une série.
  function seriesInfo(p, series, cb) {
    if (series.seasons) return cb(null, series);
    if (!p || p.type !== 'xtream') return cb(null, series);
    Net.json(xtreamApi(p, 'action=get_series_info&series_id=' + series.seriesId), function (err, d) {
      if (err || !d) return cb(err || new Error('Série introuvable'));
      var seasons = {};
      var eps = d.episodes || {};
      for (var k in eps) {
        if (!eps.hasOwnProperty(k)) continue;
        seasons[k] = (eps[k] || []).map(function (e) {
          var info = e.info || {};
          return {
            kind: 'episode', id: 'xe:' + e.id, name: e.title || ('Épisode ' + e.episode_num),
            season: +k, episode: +e.episode_num || 0,
            url: xtreamStream(p, 'series', e.id, e.container_extension || 'mp4'),
            logo: info.movie_image || info.cover_big || info.cover || info.still_path || info.thumbnail || e.movie_image || '',
            plot: info.plot || info.overview || '', duration: info.duration || '',
            durationSec: +info.duration_secs || U.parseDuration(info.duration),
            seriesName: series.name
          };
        }).sort(function (a, b) { return a.episode - b.episode; });
      }
      if (d.info) {
        series.plot = series.plot || d.info.plot || '';
        series.genre = series.genre || d.info.genre || '';
        if (!series.backdrop && d.info.backdrop_path && d.info.backdrop_path[0]) series.backdrop = d.info.backdrop_path[0];
      }
      series.seasons = seasons;
      cb(null, series);
    });
  }

  // =============================================================== bibliothèque

  function newLibrary() { return { live: [], movies: [], series: [], epgUrl: '', account: null }; }

  // Regroupe une liste par catégorie, dans l'ordre du fournisseur.
  function groupBy(items, hideAdult) {
    var map = {}, order = [];
    U.each(items, function (it) {
      if (hideAdult && isAdult(it.group)) return;
      var g = map[it.group];
      if (!g) {
        g = map[it.group] = { name: it.group, items: [], order: it.catOrder !== undefined ? it.catOrder : order.length };
        order.push(g);
      }
      g.items.push(it);
    });
    order.sort(function (a, b) { return a.order - b.order; });
    return order;
  }

  var Library = {
    data: null,
    profile: null,

    load: function (profile, progress, cb) {
      Library.profile = profile;
      function done(err, lib) {
        if (err) return cb(err);
        // numéros de chaîne : ceux du fournisseur, sinon l'ordre de la playlist
        var hasNum = false;
        U.each(lib.live, function (c) { if (c.num) hasNum = true; });
        U.each(lib.live, function (c, i) { if (!hasNum) c.num = i + 1; });
        if (profile.epgUrl) lib.epgUrl = profile.epgUrl;
        Library.data = lib;
        Library.regroup();
        cb(null, lib);
      }
      if (profile.type === 'xtream') return loadXtream(profile, progress, done);
      progress('Téléchargement de la playlist…');
      Net.text(profile.url, function (err, text) {
        if (err) return cb(err);
        progress('Lecture de la playlist…');
        setTimeout(function () {
          var lib;
          try {
            var raw = parseM3U(text);
            lib = classifyM3U(raw);
            lib.epgUrl = raw.epgUrl;
          } catch (e) { return cb(e); }
          if (!lib.live.length && !lib.movies.length && !lib.series.length) return cb(new Error('La playlist est vide'));
          done(null, lib);
        }, 30);
      });
    },

    regroup: function () {
      var d = Library.data;
      if (!d) return;
      var hide = Settings.get().hideAdult;
      d.liveGroups = groupBy(d.live, hide);
      d.movieGroups = groupBy(d.movies, hide);
      d.seriesGroups = groupBy(d.series, hide);
      var newest = function (list) {
        return list.filter(function (x) { return x.added && !(hide && isAdult(x.group)); })
          .sort(function (a, b) { return b.added - a.added; }).slice(0, 40);
      };
      d.latestMovies = newest(d.movies);
      d.latestSeries = newest(d.series);
    },

    byId: function (id) {
      var d = Library.data;
      if (!d) return null;
      var lists = [d.live, d.movies, d.series];
      for (var l = 0; l < lists.length; l++) {
        for (var i = 0; i < lists[l].length; i++) if (lists[l][i].id === id) return lists[l][i];
      }
      return null;
    },

    search: function (q) {
      var d = Library.data;
      var res = { live: [], movies: [], series: [] };
      if (!d || !q) return res;
      var hide = Settings.get().hideAdult;
      var needle = normalize(q);
      function scan(list, out) {
        for (var i = 0; i < list.length && out.length < 60; i++) {
          var it = list[i];
          if (hide && isAdult(it.group)) continue;
          if (normalize(it.name).indexOf(needle) !== -1) out.push(it);
        }
      }
      scan(d.live, res.live);
      scan(d.movies, res.movies);
      scan(d.series, res.series);
      return res;
    },

    isAdult: isAdult,
    parseM3U: parseM3U,
    classifyM3U: classifyM3U,
    movieInfo: function (item, cb) { movieInfo(Library.profile, item, cb); },
    seriesInfo: function (s, cb) { seriesInfo(Library.profile, s, cb); }
  };

  function normalize(s) {
    s = String(s || '').toLowerCase();
    var from = 'àâäáãåçéèêëíìîïñóòôöõúùûüýÿœæ';
    var to = 'aaaaaaceeeeiiiinooooouuuuyyoa';
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var p = from.indexOf(s.charAt(i));
      out += p === -1 ? s.charAt(i) : to.charAt(p);
    }
    return out;
  }

  // =============================================================== guide des programmes

  var Epg = {
    cache: {},       // clé -> {at, list}
    ready: false,
    pending: {},

    start: function () {
      var d = Library.data;
      Epg.cache = {};
      Epg.ready = false;
      if (!d || !d.epgUrl || !Net.hasService) return;
      var token = Epg.token = {};
      Net.api('/epg/load', { url: d.epgUrl }, function () {
        (function poll() {
          if (token !== Epg.token) return;
          Net.api('/epg/status', {}, function (err, st) {
            if (!err && st && st.state === 'ready') { Epg.ready = true; Epg.cache = {}; if (Epg.onReady) Epg.onReady(); return; }
            if (!err && st && st.state === 'loading') setTimeout(poll, 3000);
          });
        })();
      });
    },

    // Programme en cours et suivant pour une liste de chaînes (rappel avec {clé: [prog, …]}).
    now: function (channels, cb) {
      var out = {}, missing = [];
      var t = Date.now();
      U.each(channels, function (c) {
        var k = c.epgKey;
        if (!k) return;
        var hit = Epg.cache[k];
        if (hit && t - hit.at < 60000 && (!hit.list[0] || hit.list[0].e > t)) out[k] = hit.list;
        else missing.push(c);
      });
      if (!missing.length) return cb(out);
      if (Net.hasService && Epg.ready) {
        var keys = missing.map(function (c) { return c.epgKey; });
        Net.api('/epg/now', { limit: 2, ids: keys.join('|') }, function (err, data) {
          U.each(keys, function (k) {
            var list = (data && data[k]) || [];
            Epg.cache[k] = { at: Date.now(), list: list };
            out[k] = list;
          });
          cb(out);
        });
        return;
      }
      // Xtream sans guide complet : on demande chaîne par chaîne (limité aux premières)
      var p = Library.profile;
      if (p && p.type === 'xtream') {
        var todo = missing.filter(function (c) { return c.streamId; }).slice(0, 6);
        var left = todo.length;
        if (!left) return cb(out);
        U.each(todo, function (c) {
          Net.json(xtreamApi(p, 'action=get_short_epg&limit=2&stream_id=' + c.streamId), function (err, d) {
            var list = [];
            if (!err && d && d.epg_listings) {
              U.each(d.epg_listings, function (e) {
                list.push({
                  s: (+e.start_timestamp) * 1000, e: (+e.stop_timestamp) * 1000,
                  t: b64(e.title), d: b64(e.description)
                });
              });
            }
            Epg.cache[c.epgKey] = { at: Date.now(), list: list };
            out[c.epgKey] = list;
            if (--left === 0) cb(out);
          });
        });
        return;
      }
      cb(out);
    }
  };

  function b64(s) {
    if (!s) return '';
    try { return decodeURIComponent(escape(global.atob(s))); } catch (e) { return s; }
  }

  // =============================================================== favoris, récents, reprise

  function scoped(key) {
    var p = Library.profile;
    return key + '.' + (p ? p.id : 'none');
  }

  function snapshot(it) {
    return {
      id: it.id, kind: it.kind, name: it.name, logo: it.logo, url: it.url, group: it.group,
      epgKey: it.epgKey, streamId: it.streamId, seriesId: it.seriesId, num: it.num,
      season: it.season, episode: it.episode, seriesName: it.seriesName, seriesRef: it.seriesRef,
      durationSec: it.durationSec
    };
  }

  var User = {
    favorites: function () { return U.store.get(scoped('fav'), []); },
    isFavorite: function (id) {
      return !!U.find(User.favorites(), function (f) { return f.id === id; });
    },
    toggleFavorite: function (it) {
      var list = User.favorites();
      var had = false;
      list = list.filter(function (f) { if (f.id === it.id) { had = true; return false; } return true; });
      if (!had) list.unshift(snapshot(it));
      U.store.set(scoped('fav'), list.slice(0, 300));
      return !had;
    },
    recents: function () { return U.store.get(scoped('recent'), []); },
    addRecent: function (it) {
      var list = User.recents().filter(function (r) { return r.id !== it.id; });
      list.unshift(snapshot(it));
      U.store.set(scoped('recent'), list.slice(0, 20));
    },
    progress: function () { return U.store.get(scoped('progress'), {}); },
    getProgress: function (id) { return User.progress()[id] || null; },
    // Position de lecture. dur peut être 0 si la TV ne connaît pas la durée : on garde quand même la position.
    setProgress: function (it, pos, dur) {
      var all = User.progress();
      // vu en entier : plus de 95 %, ou moins d'une minute avant la fin (générique) pour les vidéos de plus de 5 min
      var finished = dur > 0 && (pos / dur > 0.95 || (dur >= 300 && dur - pos < 60));
      if (finished) { delete all[it.id]; User.markWatched(it); }
      else if (pos < 15) { delete all[it.id]; }
      else all[it.id] = { pos: pos, dur: dur || 0, at: Date.now(), item: snapshot(it) };
      // ne garde que les 60 plus récents
      var keys = Object.keys(all).sort(function (a, b) { return all[b].at - all[a].at; });
      for (var i = 60; i < keys.length; i++) delete all[keys[i]];
      U.store.set(scoped('progress'), all);
    },
    continueWatching: function () {
      var all = User.progress();
      return Object.keys(all).sort(function (a, b) { return all[b].at - all[a].at; }).map(function (k) {
        var x = U.extend({}, all[k].item);
        x.progress = all[k].dur ? all[k].pos / all[k].dur : 0.02;
        return x;
      });
    },
    // Séries terminées (dernier épisode vu jusqu'au bout)
    seriesDone: function () { return U.store.get(scoped('seriesDone'), {}); },
    markSeriesDone: function (ref) {
      if (!ref) return;
      var all = User.seriesDone();
      all[ref] = Date.now();
      U.store.set(scoped('seriesDone'), all);
    },
    // Séries commencées et pas finies, la plus récente d'abord : [{ref, at, ep, pos, mode}]
    seriesInProgress: function () {
      var map = {}, k, prog = User.progress(), seen = User.watched(), done = User.seriesDone();
      function add(ref, at, info) {
        if (!ref) return;
        if (!map[ref] || at > map[ref].at) map[ref] = U.extend({ ref: ref, at: at }, info);
      }
      for (k in prog) if (prog.hasOwnProperty(k) && prog[k].item && prog[k].item.kind === 'episode') {
        add(prog[k].item.seriesRef, prog[k].at, { mode: 'resume', season: prog[k].item.season, episode: prog[k].item.episode, pos: prog[k].pos });
      }
      for (k in seen) if (seen.hasOwnProperty(k) && seen[k].seriesRef) {
        add(seen[k].seriesRef, seen[k].at, { mode: 'next', season: seen[k].season, episode: seen[k].episode });
      }
      var out = [];
      for (k in map) if (map.hasOwnProperty(k) && !(done[k] && done[k] >= map[k].at)) out.push(map[k]);
      return out.sort(function (a, b) { return b.at - a.at; });
    },

    // Épisodes (et films) vus jusqu'au bout
    watched: function () { return U.store.get(scoped('watched'), {}); },
    isWatched: function (id) { return !!User.watched()[id]; },
    markWatched: function (it) {
      if (!it || !it.id) return;
      var all = User.watched();
      all[it.id] = { at: Date.now(), seriesRef: it.seriesRef || '', season: it.season || 0, episode: it.episode || 0 };
      var keys = Object.keys(all).sort(function (a, b) { return all[b].at - all[a].at; });
      for (var i = 500; i < keys.length; i++) delete all[keys[i]];
      U.store.set(scoped('watched'), all);
    }
  };

  global.Net = Net;
  global.Profiles = Profiles;
  global.Settings = Settings;
  global.Library = Library;
  global.Epg = Epg;
  global.UserData = User;
})(window);
