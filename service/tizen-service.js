/*
 * Canapé TV — point d'entrée du service quand l'appli est installée sur la TV (fichier .wgt).
 * La TV appelle onStart / onRequest / onExit ; le vrai travail est dans service.js
 * (le même fichier que celui utilisé par TizenBrew), qui démarre son serveur local dès qu'il est chargé.
 */
'use strict';

var core = null;

function load() {
  if (!core) {
    try { core = require('./service.js'); } catch (e) { console.log('[Canapé TV] service : ' + e.message); }
  }
  return core;
}

module.exports.onStart = function () { load(); };
module.exports.onRequest = function () { load(); };
module.exports.onExit = function () { /* la TV arrête le service */ };

load();
