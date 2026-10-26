# Canapé TV

Lecteur IPTV pour TV Samsung (2017 et plus récentes), avec une interface façon plateforme de streaming :
grande bannière, rangées par catégorie, TV en direct, films, séries, favoris et reprise de lecture.

Il lit les playlists **M3U** et les comptes **Xtream Codes** fournis par ton abonnement IPTV.
Il ne contient aucune chaîne : il faut une playlist à laquelle tu as légalement accès.

**Nouveau dans la version 1.1** (les améliorations de la version LG) : barre de commandes dans le lecteur,
épisode précédent / suivant, carte « Épisode suivant » pendant le générique, rangée « À reprendre » pour les séries,
épisodes vus marqués « ✓ Vu », miniatures des épisodes, audio et sous-titres (bouton VERT), pause automatique
quand tu quittes l'appli avec le bouton Accueil, recherche sans se soucier des accents.

---

## Mettre à jour depuis la version 1.0

1. Sur la page GitHub de ton dépôt `canape-tv`, clique sur **Add file → Upload files**.
2. Dézippe `canape-tv-samsung.zip`, ouvre le dossier `canape-tv` et glisse **tout son contenu** dans la page
   (`app`, `service`, `package.json`, `README.md`, `LICENSE`). GitHub remplace les anciens fichiers.
3. Clique sur **Commit changes**.
4. Sur la TV, rien à réinstaller : TizenBrew récupère la nouvelle version tout seul.
   Ça peut prendre jusqu'à 12 heures. Tes playlists, favoris et reprises sont conservés.

---

## Installation (une seule fois)

L'appli s'installe comme module de **TizenBrew**, ce qui évite les outils de développement Samsung.

### 1. Mettre le projet sur GitHub

1. Crée un compte gratuit sur github.com si tu n'en as pas.
2. Clique sur **New repository**, nomme-le `canape-tv`, laisse-le **Public**, puis **Create repository**.
3. Clique sur **uploading an existing file**.
4. Dézippe `canape-tv.zip` sur ton ordinateur, ouvre le dossier `canape-tv`, sélectionne **tout son contenu**
   (`app`, `service`, `package.json`, `README.md`, `LICENSE`) et glisse-le dans la page GitHub.
   Le fichier `package.json` doit être à la racine du dépôt, pas dans un sous-dossier.
5. Clique sur **Commit changes**.

### 2. Installer TizenBrew sur la TV

1. Sur la TV, ouvre **Applications**, tape **1 2 3 4 5** avec la télécommande.
2. Active **Developer mode** et saisis l'adresse IP de ton ordinateur. Redémarre la TV.
3. Sur l'ordinateur, télécharge **TizenBrew Installer** : github.com/reisxd/TizenBrewInstaller (page *Releases*).
4. Lance-le, connecte-toi à la TV avec son adresse IP (Paramètres → Général → Réseau → État du réseau),
   puis clique sur **Install TizenBrew**.
   Sur les TV de 2023 et plus récentes, il te demandera de te connecter à ton compte Samsung : c'est normal.

### 3. Ajouter Canapé TV dans TizenBrew

1. Ouvre **TizenBrew** sur la TV.
2. Appuie sur le bouton **VERT** pour ouvrir le gestionnaire de modules.
3. Choisis **Ajouter un Module GitHub** et tape : `ton-pseudo-github/canape-tv`
4. Canapé TV apparaît dans la liste : sélectionne-le.
5. Au premier lancement, ajoute ta playlist (adresse M3U ou identifiants Xtream).

Astuce : dans les réglages de TizenBrew, **AutoLaunch** peut ouvrir Canapé TV directement.

---

## Télécommande

| Touche | Dans les menus | Pendant une chaîne | Pendant un film ou un épisode |
|---|---|---|---|
| Flèches | Se déplacer | ▲▼ zapper, ◀ liste des chaînes | ◀▶ choisir un bouton de la barre, ▲ barre de lecture |
| OK | Ouvrir | Liste des chaînes | Valider le bouton choisi (Pause au départ) |
| CH ▲▼ | Défiler vite | Zapper | Épisode précédent / suivant |
| Chiffres | — | Aller à la chaîne n° | — |
| ROUGE | Ajouter / retirer de Ma liste | Ajouter / retirer de Ma liste | — |
| VERT | — | Audio et sous-titres | Audio et sous-titres |
| ◀◀ ▶▶ | — | — | Reculer / avancer d'une minute |
| RETOUR | Revenir en arrière ; depuis l'Accueil, propose de quitter | Quitter le lecteur | Quitter (la position est gardée) |

Si ta télécommande n'a pas de boutons de couleur (télécommande « Smart » fine), le bouton **« Ajouter à ma liste »**
des fiches remplace le bouton ROUGE, et le bouton « Audio et sous-titres » de la barre remplace le VERT.

## Ce que fait l'appli

- **Accueil** : reprendre la lecture, chaînes récentes, Ma liste, nouveautés, puis les catégories.
- **TV en direct** : une rangée par catégorie, programme en cours et suivant sur chaque chaîne.
- **Films / Séries** : affiches, résumé, saisons et épisodes avec leurs miniatures, reprise là où tu t'étais arrêté
  (même après avoir éteint la TV), épisode suivant enchaîné automatiquement, y compris d'une saison à l'autre.
  Les épisodes vus sont marqués « ✓ Vu », et la fiche propose « Épisode suivant » quand tu as fini un épisode.
- **Barre de commandes du lecteur** (films et épisodes), comme sur les applis de streaming : Épisode précédent,
  −10 s, Pause / Lecture, +10 s, Épisode suivant, Audio et sous-titres. ◀ ▶ pour choisir un bouton, OK pour valider,
  ▲ pour aller sur la barre de lecture (◀ ▶ avancent alors de 10 s). CH ▲ ▼ changent aussi d'épisode.
  Pendant le générique, une carte « Épisode suivant » apparaît : OK pour le lancer tout de suite, RETOUR pour continuer à regarder.
- **À reprendre** (en haut de l'onglet Séries) : les séries commencées et pas terminées, la plus récente d'abord.
- **Audio et sous-titres** : pendant un film, un épisode ou une chaîne, bouton VERT (ou le bouton
  « Audio et sous-titres » de la barre) pour choisir la langue et les sous-titres. Ton choix est retenu pour les vidéos suivantes.
- **Recherche** dans les chaînes, films et séries (sans se soucier des accents).
- **Plusieurs playlists**, avec des favoris séparés pour chacune.
- **Contrôle parental** : catégories adultes masquées par défaut, déblocage protégé par un code PIN.
- **Guide des programmes** : celui de la playlist, celui du serveur Xtream, ou une adresse XMLTV de ton choix
  (même compressée en .gz).
- Quand tu appuies sur le bouton **Accueil** de la TV, le direct est coupé et le film mis en pause ; tout reprend au retour.

## Si quelque chose ne marche pas

- **« Connexion impossible »** : vérifie l'adresse de la playlist. Dans **Réglages**, la ligne « Service de la TV »
  doit indiquer **Actif** ; sinon, quitte l'appli et relance-la depuis TizenBrew.
- **Une chaîne ne se lance pas** : dans Réglages → *Format des chaînes (Xtream)*, passe de HLS à MPEG-TS (ou l'inverse).
- **Un film ne se lance pas** : certains fichiers (.mkv, .avi) utilisent des formats que la TV ne sait pas lire.
- **Pas de choix de langue ou de sous-titres** : selon le modèle, la TV ne donne pas accès aux pistes de certaines
  vidéos ; le panneau l'indique alors (« Aucune autre langue »).
- **Une modification sur GitHub n'apparaît pas** : la TV peut mettre jusqu'à 12 heures à récupérer la nouvelle version.
