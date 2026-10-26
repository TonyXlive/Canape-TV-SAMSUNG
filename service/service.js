/*
 * Canapé TV — service d'arrière-plan (tourne sur la TV Samsung, dans TizenBrew).
 *
 * Rôle :
 *  1. Récupérer les playlists, l'API Xtream, le guide des programmes et les sous-titres à la place de la page,
 *     car beaucoup de fournisseurs bloquent les requêtes faites directement depuis une page web (CORS).
 *  2. Télécharger et lire le guide des programmes XMLTV (même compressé .gz) sans faire ramer l'interface.
 *
 * Petit serveur local http://127.0.0.1:8095. Le même fichier sert pour la version LG (où il répond aussi
 * par le bus webOS) ; sur Samsung, la partie webOS reste simplement inactive.
 * Écrit en JavaScript "ancien" (ES5) : les TV de 2017 embarquent Node.js 4.
 */
'use strict';

var http = require('http');
var https = require('https');
var urlLib = require('url');
var zlib = require('zlib');
var StringDecoder = require('string_decoder').StringDecoder;
var fs = require('fs');

var SERVICE_ID = 'com.canapetv.app.service';
var PORT = 8095;
var VERSION = 1;
var MAX_BODY = 80 * 1024 * 1024; // au-delà, la TV risque de manquer de mémoire
var DEFAULT_UA = 'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/6.0 TV Safari/537.36';

// ---------------------------------------------------------------- outils HTTP

function request(target, ua, redirects, done) {
  var parsed;
  try { parsed = urlLib.parse(target); } catch (e) { return done(e); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return done(new Error('Adresse non prise en charge : ' + target));
  }
  var lib = parsed.protocol === 'https:' ? https : http;
  var opts = {
    protocol: parsed.protocol,
    hostname: parsed.hostname,
    port: parsed.port,
    path: parsed.path,
    method: 'GET',
    headers: {
      'User-Agent': ua || DEFAULT_UA,
      'Accept': '*/*',
      'Accept-Encoding': 'gzip, deflate'
    },
    rejectUnauthorized: false
  };
  if (parsed.protocol === 'https:') opts.servername = parsed.hostname; // nécessaire avec le Node.js des vieilles TV
  var req = lib.request(opts, function (res) {
    var code = res.statusCode;
    if (code >= 300 && code < 400 && res.headers.location) {
      res.resume();
      if (redirects <= 0) return done(new Error('Trop de redirections'));
      var next = urlLib.resolve(target, res.headers.location);
      return request(next, ua, redirects - 1, done);
    }
    var stream = res;
    var enc = (res.headers['content-encoding'] || '').toLowerCase();
    if (enc === 'gzip') stream = res.pipe(zlib.createGunzip());
    else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());
    done(null, res, stream);
  });
  req.setTimeout(30000, function () { req.abort(); });
  req.on('error', function (e) { done(e); });
  req.end();
}

// Décompresse un .gz même quand le serveur ne le signale pas (fichiers XMLTV .xml.gz).
function sniffGzip(stream, onData, onEnd, onError) {
  var first = true;
  var gunzip = null;
  stream.on('data', function (chunk) {
    if (first) {
      first = false;
      if (chunk.length > 1 && chunk[0] === 0x1f && chunk[1] === 0x8b) {
        gunzip = zlib.createGunzip();
        gunzip.on('data', onData);
        gunzip.on('end', onEnd);
        gunzip.on('error', onError);
      }
    }
    if (gunzip) gunzip.write(chunk); else onData(chunk);
  });
  stream.on('end', function () { if (gunzip) gunzip.end(); else onEnd(); });
  stream.on('error', onError);
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Cache-Control', 'no-store');
}

function sendJson(res, code, obj) {
  cors(res);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

// ---------------------------------------------------------------- guide des programmes (XMLTV)

var epg = {
  state: 'idle',      // idle | loading | ready | error
  url: '',
  error: '',
  loadedAt: 0,
  programmes: {},     // id de chaîne -> [{s, e, t, d}]
  names: {},          // nom de chaîne en minuscules -> id
  count: 0
};

var ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decodeXml(s) {
  if (!s) return '';
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, function (m, e) {
      if (e.charAt(0) === '#') {
        var n = e.charAt(1) === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return isNaN(n) ? m : String.fromCharCode(n);
      }
      return ENTITIES.hasOwnProperty(e) ? ENTITIES[e] : m;
    })
    .trim();
}

function attr(tag, name) {
  var m = new RegExp('\\s' + name + '\\s*=\\s*"([^"]*)"').exec(tag) || new RegExp('\\s' + name + "\\s*=\\s*'([^']*)'").exec(tag);
  return m ? decodeXml(m[1]) : '';
}

// "20261022093000 +0200" -> millisecondes UTC
function xmltvTime(v) {
  var m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{2})?:?(\d{2})?/.exec(v || '');
  if (!m) return 0;
  var t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  if (m[7]) {
    var sign = m[7].charAt(0) === '-' ? -1 : 1;
    var off = (Math.abs(+m[7]) * 60 + +(m[8] || 0)) * 60000 * sign;
    t -= off;
  }
  return t;
}

function loadEpg(url, ua) {
  if (epg.state === 'loading' && epg.url === url) return;
  epg.state = 'loading';
  epg.url = url;
  epg.error = '';
  var programmes = {};
  var names = {};
  var count = 0;
  var now = Date.now();
  var minEnd = now - 2 * 3600000;
  var maxStart = now + 36 * 3600000;
  var buf = '';
  var decoder = new StringDecoder('utf8');
  var token = {};
  epg.token = token;

  function parse(final) {
    // chaînes
    var re = /<channel\b([^>]*)>([\s\S]*?)<\/channel>/g;
    var m;
    var lastIndex = 0;
    while ((m = re.exec(buf))) {
      var id = attr(m[1], 'id');
      var dn = /<display-name[^>]*>([\s\S]*?)<\/display-name>/g;
      var d;
      while ((d = dn.exec(m[2]))) {
        var n = decodeXml(d[1]).toLowerCase();
        if (n && !names[n]) names[n] = id;
      }
      lastIndex = re.lastIndex;
    }
    // programmes
    var rp = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/g;
    rp.lastIndex = 0;
    var lastP = 0;
    while ((m = rp.exec(buf))) {
      lastP = rp.lastIndex;
      var s = xmltvTime(attr(m[1], 'start'));
      var e = xmltvTime(attr(m[1], 'stop')) || s + 3600000;
      if (e < minEnd || s > maxStart) continue;
      var ch = attr(m[1], 'channel');
      var t = /<title[^>]*>([\s\S]*?)<\/title>/.exec(m[2]);
      var de = /<desc[^>]*>([\s\S]*?)<\/desc>/.exec(m[2]);
      var list = programmes[ch] || (programmes[ch] = []);
      list.push({ s: s, e: e, t: t ? decodeXml(t[1]) : '', d: de ? decodeXml(de[1]).slice(0, 400) : '' });
      count++;
    }
    var cut = Math.max(lastIndex, lastP);
    if (final) { buf = ''; return; }
    if (cut > 0) buf = buf.slice(cut);
    // garde-fou : un bloc incomplet ne peut pas faire plus de quelques centaines de Ko
    else if (buf.length > 4000000) buf = buf.slice(buf.length - 200000);
  }

  request(url, ua, 5, function (err, res, stream) {
    if (token !== epg.token) return;
    if (err) { epg.state = 'error'; epg.error = err.message; return; }
    if (res.statusCode >= 400) { res.resume(); epg.state = 'error'; epg.error = 'Erreur ' + res.statusCode; return; }
    sniffGzip(stream, function (chunk) {
      if (token !== epg.token) return;
      buf += decoder.write(chunk);
      if (buf.length > 512000) parse(false);
    }, function () {
      if (token !== epg.token) return;
      buf += decoder.end();
      parse(true);
      for (var k in programmes) {
        if (programmes.hasOwnProperty(k)) programmes[k].sort(function (a, b) { return a.s - b.s; });
      }
      epg.programmes = programmes;
      epg.names = names;
      epg.count = count;
      epg.loadedAt = Date.now();
      epg.state = 'ready';
    }, function (e) {
      if (token !== epg.token) return;
      epg.state = 'error';
      epg.error = e.message;
    });
  });
}

function epgFor(key) {
  if (!key) return null;
  if (epg.programmes[key]) return epg.programmes[key];
  var id = epg.names[String(key).toLowerCase()];
  return id ? epg.programmes[id] || null : null;
}

function upcoming(list, limit) {
  var now = Date.now();
  var out = [];
  for (var i = 0; i < list.length && out.length < limit; i++) {
    if (list[i].e > now) out.push(list[i]);
  }
  return out;
}

// ---------------------------------------------------------------- mode développeur LG

var APP_ID = 'com.canapetv.app';
var ENV = (typeof process !== 'undefined' && process.env) || {};
var DEVMODE_TOKEN = ENV.CANAPE_DEVMODE_TOKEN || '/var/luna/preferences/devmode_enabled';
var DEVMODE_CHECK = ENV.CANAPE_DEVMODE_CHECK || 'https://developer.lge.com/secure/CheckDevModeSession.dev?sessionToken=';
var RELAUNCH_DELAY = +(ENV.CANAPE_RELAUNCH_DELAY || 5000);
var webosService = null; // rempli quand le service tourne sur la TV

var VERIFY_TIMEOUT = +(ENV.CANAPE_VERIFY_TIMEOUT || 12000); // temps max pour constater la prolongation
var VERIFY_STEP = +(ENV.CANAPE_VERIFY_STEP || 1000);

// "998:30:12" -> secondes
function sessionSeconds(text) {
  var m = /^(\d+):(\d\d)(?::(\d\d))?/.exec(String(text || ''));
  return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+(m[3] || 0)) : -1;
}

// Temps restant de la session (demandé à LG avec le jeton de la TV). cb({known, hours, seconds, text})
function devmodeStatus(cb) {
  fs.readFile(DEVMODE_TOKEN, 'utf8', function (err, token) {
    token = String(token || '').trim();
    if (err || !token) return cb({ known: false, reason: 'jeton introuvable' });
    fetchText(DEVMODE_CHECK + encodeURIComponent(token), null, function (e, status, body) {
      var d = null;
      try { d = JSON.parse(body); } catch (x) { d = null; }
      var sec = d ? sessionSeconds(d.errorMsg) : -1;
      if (e || sec < 0) return cb({ known: false, reason: e ? e.message : 'réponse inattendue' });
      cb({ known: true, hours: Math.floor(sec / 3600), seconds: sec, text: d.errorMsg });
    });
  });
}

// Même effet que le bouton EXTEND : ouvre Developer Mode avec la demande de prolongation,
// attend que LG confirme que le compteur est reparti (quand on peut le lire), puis remet Canapé TV au premier plan.
// cb({ok, verified, hours, error})
function devmodeExtend(cb) {
  if (!webosService || !webosService.call) return cb({ ok: false, error: 'hors TV' });
  var answered = false;
  function answer(obj) { if (!answered) { answered = true; cb(obj); } }
  function relaunch(result) {
    webosService.call('luna://com.webos.applicationManager/launch', { id: APP_ID }, function () {});
    answer(result);
  }
  devmodeStatus(function (before) {
    var guard = setTimeout(function () { answer({ ok: false, error: 'pas de réponse' }); }, 10000);
    webosService.call('luna://com.webos.applicationManager/launch', { id: 'com.palmdts.devmode', params: { extend: true } }, function (m) {
      clearTimeout(guard);
      if (answered) return;
      var r = (m && m.payload) || {};
      if (r.returnValue === false) return answer({ ok: false, error: r.errorText || 'refusé' });
      // compteur illisible : on laisse quelques secondes à Developer Mode, sans pouvoir vérifier
      if (!before.known) return setTimeout(function () { relaunch({ ok: true, verified: false }); }, RELAUNCH_DELAY);
      var start = Date.now();
      (function poll() {
        setTimeout(function () {
          devmodeStatus(function (st) {
            if (st.known && st.seconds > before.seconds) return relaunch({ ok: true, verified: true, hours: st.hours });
            if (Date.now() - start >= VERIFY_TIMEOUT) {
              return relaunch({ ok: false, verified: false, hours: st.known ? st.hours : before.hours, error: 'compteur inchangé' });
            }
            poll();
          });
        }, VERIFY_STEP);
      })();
    });
  });
}

// ---------------------------------------------------------------- fonctions communes (HTTP local et webOS)

// reply(code, objet)
function api(path, q, reply) {
  q = q || {};
  if (path === '/ping') return reply(200, { ok: true, v: VERSION });

  if (path === '/devmode/status') return devmodeStatus(function (st) { reply(200, st); });
  if (path === '/devmode/extend') return devmodeExtend(function (r) { reply(200, r); });

  if (path === '/epg/load') {
    if (!q.url) return reply(400, { error: 'url manquante' });
    var fresh = epg.url === q.url && epg.state === 'ready' && Date.now() - epg.loadedAt < 6 * 3600000;
    if (!fresh || q.force) loadEpg(q.url, q.ua);
    return reply(200, { state: epg.state });
  }

  if (path === '/epg/status') {
    return reply(200, { state: epg.state, error: epg.error, programmes: epg.count, url: epg.url });
  }

  if (path === '/epg/now') {
    var keys = String(q.ids || '').split('|');
    var out = {};
    for (var i = 0; i < keys.length; i++) {
      var list = epgFor(keys[i]);
      if (list) out[keys[i]] = upcoming(list, +(q.limit || 2));
    }
    return reply(200, out);
  }

  if (path === '/epg/channel') {
    var l = epgFor(q.id);
    return reply(200, l ? upcoming(l, 40) : []);
  }

  reply(404, { error: 'introuvable' });
}

// Télécharge une adresse en entier (pour l'accès par le bus webOS). done(err, statut, texte, type)
function fetchText(url, ua, done) {
  var finished = false;
  function finish(err, status, body, type) {
    if (finished) return;
    finished = true;
    done(err, status, body, type);
  }
  request(url, ua, 5, function (err, res, stream) {
    if (err) return finish(err);
    var decoder = new StringDecoder('utf8');
    var parts = [];
    var size = 0;
    stream.on('data', function (chunk) {
      if (finished) return;
      size += chunk.length;
      if (size > MAX_BODY) {
        try { res.destroy(); } catch (e) { /* rien */ }
        return finish(new Error('Playlist trop volumineuse pour la TV'));
      }
      parts.push(decoder.write(chunk));
    });
    stream.on('end', function () {
      parts.push(decoder.end());
      finish(null, res.statusCode, parts.join(''), res.headers['content-type'] || '');
    });
    stream.on('error', function (e) { finish(e); });
  });
}

// ---------------------------------------------------------------- serveur local

function handle(req, res) {
  var u = urlLib.parse(req.url, true);
  var q = u.query;
  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); return res.end(); }

  if (u.pathname === '/get') {
    if (!q.url) return sendJson(res, 400, { error: 'url manquante' });
    return request(q.url, q.ua, 5, function (err, up, stream) {
      if (err) return sendJson(res, 502, { error: err.message });
      cors(res);
      res.writeHead(up.statusCode, { 'Content-Type': up.headers['content-type'] || 'text/plain; charset=utf-8' });
      stream.pipe(res);
      stream.on('error', function () { res.end(); });
    });
  }

  api(u.pathname, q, function (code, obj) { sendJson(res, code, obj); });
}

var server = null;
var serverState = 'off'; // off | starting | on | failed
var serverWaiters = [];

// Démarre le serveur local une seule fois. cb(port ou 0 si impossible)
function startHttp(cb) {
  if (serverState === 'on') return cb(listenPort);
  if (serverState === 'failed') return cb(0);
  serverWaiters.push(cb);
  if (serverState === 'starting') return;
  serverState = 'starting';
  function settle(ok) {
    serverState = ok ? 'on' : 'failed';
    var w = serverWaiters;
    serverWaiters = [];
    for (var i = 0; i < w.length; i++) w[i](ok ? listenPort : 0);
  }
  server = http.createServer(function (req, res) {
    try { handle(req, res); } catch (e) { try { sendJson(res, 500, { error: e.message }); } catch (e2) { /* rien */ } }
  });
  server.on('error', function (e) {
    // Port déjà pris : un service Canapé TV tourne sans doute déjà (on le vérifie), sinon on passera par webOS.
    console.log('[Canapé TV] service : ' + e.message);
    if (serverState !== 'starting') return;
    if (e.code === 'EADDRINUSE') {
      return http.get({ host: '127.0.0.1', port: listenPort, path: '/ping' }, function (r) {
        r.resume();
        settle(r.statusCode === 200);
      }).on('error', function () { settle(false); });
    }
    settle(false);
  });
  server.listen(listenPort, '127.0.0.1', function () {
    console.log('[Canapé TV] service prêt sur le port ' + listenPort);
    settle(true);
  });
}

var listenPort = +(typeof process !== 'undefined' && process.env && process.env.CANAPE_PORT) || PORT;

// ---------------------------------------------------------------- service webOS

function startWebOS(Service) {
  var service = new Service(SERVICE_ID);
  webosService = service;
  // Tant que l'appli est ouverte, elle reste abonnée à « start » : webOS garde alors le service en vie
  // (chaque abonnement ouvert compte comme une activité en cours).
  var subscribers = {};

  service.register('start', function (message) {
    if (message.isSubscription) subscribers[message.uniqueToken] = message;
    startHttp(function (port) {
      message.respond({ returnValue: true, ok: true, v: VERSION, http: !!port, port: port || 0, subscribed: !!message.isSubscription });
    });
  }, function (message) {
    // l'appli s'est fermée : webOS arrêtera le service quelques secondes plus tard
    delete subscribers[message.uniqueToken];
  });

  service.register('ping', function (message) {
    message.respond({ returnValue: true, ok: true, v: VERSION, http: serverState === 'on', port: serverState === 'on' ? listenPort : 0 });
  });

  service.register('get', function (message) {
    var p = message.payload || {};
    if (!p.url) return message.respond({ returnValue: false, errorText: 'url manquante' });
    fetchText(p.url, p.ua, function (err, status, body, type) {
      if (err) return message.respond({ returnValue: false, errorText: err.message });
      message.respond({ returnValue: true, status: status, body: body, contentType: type });
    });
  });

  service.register('api', function (message) {
    var p = message.payload || {};
    api(p.path, p.query || {}, function (code, obj) {
      message.respond({ returnValue: code < 400, status: code, data: obj, errorText: code >= 400 ? (obj && obj.error) || 'Erreur' : undefined });
    });
  });

  return service;
}

var Service = null;
try { Service = require('webos-service'); } catch (e) { Service = null; }

var webos = null;
if (Service) webos = startWebOS(Service);
else startHttp(function () {}); // ordinateur de test : on démarre directement le serveur local

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    sessionSeconds: sessionSeconds, xmltvTime: xmltvTime, decodeXml: decodeXml, api: api, fetchText: fetchText, startHttp: startHttp,
    getServer: function () { return server; }, webos: webos
  };
}
