/* Canapé TV — ce qui est propre aux TV Samsung (Tizen, dans TizenBrew) : sortie, mise en arrière-plan.
   Le service de l'appli est joint uniquement par son port local (http://127.0.0.1:8095), il n'y a pas de bus « Luna ». */
(function (global) {
  'use strict';

  // Pas de bus de messages sur Samsung : les appels « Luna » de l'appli se rabattent sur le port local.
  var Luna = {
    available: function () { return false; },
    call: function (method, params, cb) {
      setTimeout(function () { cb({ returnValue: false, errorText: 'Indisponible sur Samsung' }); }, 0);
      return { cancel: function () {} };
    },
    callUri: function (uri, params, cb) { return Luna.call(uri, params, cb); }
  };

  var Platform = {
    isTizen: !!global.tizen,

    // Ferme l'appli et revient à l'écran de la TV.
    exit: function () {
      try {
        if (global.tizen && global.tizen.application) {
          global.tizen.application.getCurrentApplication().exit();
          return;
        }
      } catch (e) { /* on tente autre chose */ }
      if (global.history.length > 1) global.history.back();
      else { try { global.close(); } catch (e2) { /* rien */ } }
    },

    // Appelé quand l'appli passe en arrière-plan (bouton Accueil) ou revient au premier plan.
    onVisibility: function (cb) {
      var prop = typeof document.hidden !== 'undefined' ? 'hidden' : (typeof document.webkitHidden !== 'undefined' ? 'webkitHidden' : null);
      var evt = prop === 'webkitHidden' ? 'webkitvisibilitychange' : 'visibilitychange';
      if (!prop) return;
      document.addEventListener(evt, function () { cb(!document[prop]); });
    }
  };

  // ------------------------------------------------------------ appli installée (.wgt) ou module TizenBrew ?

  var PACKAGE_ID = 'CanapeTVsm';

  function packageId() {
    try { return global.tizen.application.getCurrentApplication().appInfo.packageId; } catch (e) { return ''; }
  }

  // Installée comme vraie appli : on fait ce que TizenBrew faisait pour nous.
  Platform.standalone = packageId() === PACKAGE_ID;

  if (Platform.standalone) {
    // 1) touches de la télécommande à recevoir (couleurs, lecture, chaînes, chiffres)
    var KEYS = ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind',
      'ChannelUp', 'ChannelDown', 'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue', 'Info',
      '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    for (var i = 0; i < KEYS.length; i++) {
      try { global.tizen.tvinputdevice.registerKey(KEYS[i]); } catch (e) { /* touche absente sur ce modèle */ }
    }
    // 2) démarrage du service de l'appli (playlists, guide des programmes)
    try {
      global.tizen.application.launchAppControl(
        new global.tizen.ApplicationControl('http://tizen.org/appcontrol/operation/service'),
        PACKAGE_ID + '.Service',
        function () { /* démarré */ },
        function (e) { if (global.console) global.console.log('[Canapé TV] service : ' + (e && e.message)); }
      );
    } catch (e) { /* pas d'API : l'appli passera en mode direct */ }
  }

  global.Luna = Luna;
  global.Platform = Platform;
  global.DevMode = null; // le mode développeur LG n'existe pas sur Samsung
})(window);
