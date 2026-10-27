/* Loaded after the shared UI and player, before main.js. */
(function (global) {
  'use strict';
  var Net = global.Net;
  Net.detect = function (cb) { Net.mode = 'vega'; Net.hasService = true; cb(true); };
  Net.text = global.FireTVGet;
  Net.url = function (url) { return url; };
  // Full XMLTV service has not yet been ported. Keep short Xtream EPG working
  // and report the limitation rather than claiming that the guide was loaded.
  Net.api = function (path, query, cb) { cb(new Error('Guide XMLTV complet non disponible dans cette version Vega')); };
  global.Epg.start = function () { global.Epg.cache = {}; global.Epg.ready = false; };

  // Vega releases the hardware decoder when another app takes the foreground.
  var prototype = global.Player.Screen.prototype;
  prototype.suspend = function () {
    if (this.suspended) return;
    this.suspended = true;
    this.saveProgress();
    this.resumeAt = this.isLive() ? 0 : (this.video.currentTime || 0);
    this.wasPaused = this.video.paused;
    clearTimeout(this.stallTimer);
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
  };
  prototype.resume = function () {
    if (!this.suspended) return;
    this.suspended = false;
    this.startPos = this.resumeAt;
    this.startTries = 0;
    this.loading(true);
    this.playUrl(this.currentUrl || this.item.url);
    if (this.wasPaused && !this.isLive()) {
      var video = this.video;
      video.addEventListener('playing', function pauseOnce() {
        video.removeEventListener('playing', pauseOnce);
        video.pause();
      });
    }
    this.showOsd(true);
  };
})(window);
