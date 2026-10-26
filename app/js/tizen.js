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

  global.Luna = Luna;
  global.Platform = Platform;
  global.DevMode = null; // le mode développeur LG n'existe pas sur Samsung
})(window);
