# Canapé TV pour Fire TV Stick 4K Select — port Vega en développement

Le 4K Select utilise **Vega OS**, pas Android/Fire OS : ni le `.wgt` Samsung,
ni un `.apk` Android ne conviennent. La cible est un paquet **ARMv7 `.vpkg`**.

## État réel

Le dépôt contient une première adaptation, **pas encore compilée avec le SDK Vega ni testée sur un Stick**.
L’interface Samsung est réutilisée : M3U, Xtream, films, séries, favoris, reprise,
contrôle parental et commandes du lecteur. La lecture passe par la vidéo HTML5 de Vega,
et les téléchargements de playlists/API passent par un pont réseau React Native.
Le port n’est pas une application prête à installer aujourd’hui.

Limites à valider avant de considérer le port terminé :

- Compilation avec le modèle officiel du SDK installé et essais sur le matériel réel.
- HLS, MPEG-TS, codecs, audio et sous-titres selon ce que la WebView expose.
- Guide XMLTV complet (y compris `.gz`) non porté ; le guide court Xtream reste disponible.
- Fournisseurs HTTPS uniquement par défaut. Pour un fournisseur HTTP, ajouter son domaine
  dans la politique réseau du manifeste, selon la documentation Amazon. Ne pas désactiver TLS.
- Images et vidéos chargées directement par la WebView : leurs restrictions réseau/CORS restent applicables.
- Réponses réseau limitées à 16 Mo annoncés et 8 millions de caractères ; grands catalogues à tester.
- Réglages Samsung conservant quelques mentions de touches de couleur ; utiliser les boutons
  visibles pour les favoris et les pistes audio/sous-titres. Tester les touches multimédias réelles.
- Le stockage est local à cette nouvelle application ; les réglages Samsung ne sont pas transférés.

## Préparer et compiler sur un ordinateur

### Compiler sur GitHub depuis Windows

Le workflow [Compiler Canape TV pour Fire TV](../.github/workflows/appli-fire-tv.yml)
installe le SDK Vega 0.24.12112 sur une machine Ubuntu GitHub et utilise Node.js 22.22.1.
Il se lance lors des modifications de la branche `fire-tv-vega`. La compilation n’utilise
pas le stockage de la clé USB. Une exécution réussie fournit l’archive
`Canape-TV-Fire-TV-Select` dans les artefacts de l’onglet Actions, avec le `.vpkg`,
le manifeste, les instructions et une somme SHA-256. Un échec ne produit aucun paquet.

La compilation distante ne remplace pas l’essai matériel : le mode développeur et
l’installation sur le Stick restent à effectuer depuis les outils Vega. Le PC Windows
peut servir à consulter les journaux et télécharger le résultat ; Ubuntu déjà préparé
sur la clé peut ensuite servir au transfert sur le Stick.

### Compiler localement

Installer les [Vega Developer Tools](https://developer.amazon.com/docs/vega/0.24/install-vega-sdk)
sur une configuration prise en charge par Amazon (instructions macOS ou Ubuntu).
Le SDK et son registre npm doivent être configurés. Utiliser une version récente de Node.js 22
(au moins 22.18) pour les dépendances RN 0.83 du modèle SDK 0.24. Aucune modification du compte Amazon
ou du Stick n’est faite par les scripts de ce dépôt.

Depuis la racine du dépôt :

```bash
vega project generate --template vegaWebview --name CanapeFireTV --packageId tv.canape.firetv --outputDir vega-build
node fire-tv/prepare.mjs vega-build
cd vega-build
vega project update-manifest --os-min 1.2 --os-version 1.2
npm install
npm run build:app
```

Le script applique les sources au modèle officiel, sans inventer les dépendances natives
ou la configuration de compilation du SDK. Le modèle doit contenir `src/App.tsx`,
un dossier `assets` empaqueté par sa configuration, et `manifest.toml`.
Si le SDK utilise un autre agencement, adapter le script après inspection du modèle.
Choisir le paquet de `build/armv7-release/` pour le Stick, pas celui du simulateur.
Le SDK récent peut nécessiter d’adapter les versions OS du manifeste à sa matrice de compatibilité.

## Activer le mode développeur sur la TV

1. Paramètres → Ma Fire TV → À propos.
2. Sélectionner le nom de l’appareil et appuyer **7 fois sur OK**.
3. Revenir dans Ma Fire TV → Options développeur → Mode développeur → Continuer.
4. Sur l’ordinateur, lancer `vega devmode login` et se connecter à son compte **Amazon Developer**.
5. Autoriser le Stick avec le code affiché sur la TV (à saisir localement) :

```bash
vega devmode enable-device --code CODE_AFFICHE_SUR_LA_TV
vega device list
```

Le Stick redémarre. Il doit être sur le même réseau que l’ordinateur.
Le compte Amazon grand public ne suffit pas : il faut un compte Amazon Developer.
Si l’appareil n’est pas détecté, suivre la procédure réseau officielle ; son numéro
de série seul ne permet aucune connexion à distance depuis ChatGPT.

## Installer après une compilation réussie

```bash
vega device install-app --packagePath CHEMIN_DU_PAQUET_ARMV7.vpkg
vega device installed-apps
vega device launch-app --appName IDENTIFIANT_DU_COMPOSANT
```

Prendre l’identifiant du composant dans le manifeste généré ou la liste des applications
installées. Ne pas confondre le package ID et le component ID.
Ouvrir Canapé TV et ajouter sa playlist M3U ou son compte Xtream.

## Vérifications locales disponibles

```bash
node --test fire-tv/network.test.mjs
```

Ces tests vérifient le pont réseau et la préparation des sources, **pas** la lecture vidéo
ou l’installation sur Vega. Sur le Stick, vérifier saisie avec le clavier système,
flèches/OK/Retour, direct, VOD, reprise après Accueil, favoris, séries et guide court Xtream.

## Références Amazon

- [WebView Vega](https://developer.amazon.com/docs/vega/0.24/overview-of-webview)
- [Intégration WebView et touches](https://developer.amazon.com/docs/vega/0.24/develop-your-app-with-webview)
- [Créer et compiler](https://developer.amazon.com/docs/vega/0.24/build-an-app)
- [Activer le mode développeur](https://developer.amazon.com/docs/vega/0.23/developer-mode)

Sources Samsung : commit `eef1b83b64acfe20909156abc3d0f8206648462f`, licence MIT du dépôt conservée.
