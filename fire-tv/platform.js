/* Vega-only platform; loaded instead of tizen.js. */
(function (global) {
  'use strict';
  var callbacks = {}, serial = 0;
  global.FireTVReply = function (reply) {
    var entry = callbacks[reply.id];
    if (!entry) return;
    delete callbacks[reply.id];
    clearTimeout(entry.timer);
    entry.cb(reply.error ? new Error(reply.error) : null, reply.body, reply.status);
  };
  global.FireTVGet = function (url, cb) {
    if (!global.ReactNativeWebView) return cb(new Error('Ouvre cette application sur Vega OS'));
    var id = ++serial;
    callbacks[id] = { cb: cb, timer: setTimeout(function () {
      global.FireTVReply({id: id, error: 'Délai dépassé'});
    }, 95000) };
    global.ReactNativeWebView.postMessage(JSON.stringify({type: 'get', id: id, url: url}));
  };
  global.Platform = {
    isVega: true,
    exit: function () { global.ReactNativeWebView.postMessage('{"type":"exit"}'); },
    onVisibility: function (cb) {
      var previous = true;
      function change(visible) { if (visible !== previous) { previous = visible; cb(visible); } }
      document.addEventListener('visibilitychange', function () { change(!document.hidden); });
      global.addEventListener('firetvvisibility', function (event) { change(event.detail); });
    }
  };
  global.Luna = { available: function () { return false; } };
  global.DevMode = null;
  // WebView supplies D-pad/Enter/Escape. Accept named media keys as well.
  var original = global.U.keyName;
  global.U.keyName = function (event) {
    var names = {MediaPlayPause: 'playpause', MediaPlay: 'play', MediaPause: 'pause',
      MediaFastForward: 'ff', MediaRewind: 'rw', ContextMenu: 'info', BrowserBack: 'back'};
    return names[event.key] || original(event);
  };
})(window);
