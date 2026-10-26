#!/bin/bash
# Fabrique dist/CanapeTV.wgt, signé avec un certificat Tizen (accepté tel quel par les TV Samsung 2017-2022 ;
# TizenBrew Installer le re-signe avec le compte Samsung sur les TV 2023 et plus récentes).
# Utilise les outils officiels Samsung (Tizen Studio en ligne de commande). Lancé par GitHub (voir .github/workflows).
set -e
exec < /dev/null
set -x
cd "$(dirname "$0")/.."
ROOT=$(pwd)
TS=$HOME/tizen-studio
DATA=$HOME/tizen-studio-data

echo "== 1. Outils Samsung (Tizen Studio, ligne de commande)"
if [ ! -x "$TS/tools/ide/bin/tizen" ]; then
  sudo apt-get -qq update >/dev/null && sudo apt-get -qq install -y expect zip libwebkit2gtk-4.0-37 >/dev/null 2>&1 || true
  got=""
  for v in 6.1 6.0 5.6 5.5 5.1; do
    url="https://download.tizen.org/sdk/Installer/tizen-studio_${v}/web-cli_Tizen_Studio_${v}_ubuntu-64.bin"
    if curl -fsSL -o /tmp/tizen-cli.bin "$url"; then got=$v; break; fi
  done
  [ -n "$got" ] || { echo "Impossible de télécharger Tizen Studio"; exit 1; }
  echo "Tizen Studio $got téléchargé"
  chmod +x /tmp/tizen-cli.bin
  /tmp/tizen-cli.bin --accept-license "$TS" > /tmp/tizen-install.log 2>&1 || { tail -30 /tmp/tizen-install.log; exit 1; }
  tail -3 /tmp/tizen-install.log
fi
export PATH="$TS/tools/ide/bin:$TS/tools:$PATH"
timeout 60 tizen version || true

echo "== 2. Certificat d'auteur"
mkdir -p "$DATA/keystore/author"
AUTHOR="$DATA/keystore/author/canapetv.p12"
if [ -n "$AUTHOR_P12" ] && [ -n "$AUTHOR_PWD" ]; then
  echo "$AUTHOR_P12" | base64 -d > "$AUTHOR"
  PWD_AUTHOR="$AUTHOR_PWD"
  echo "Certificat fourni par le dépôt (secret TIZEN_AUTHOR_P12)"
else
  PWD_AUTHOR="canapetv-$(date +%s)"
  if ! timeout 180 tizen certificate -a canapetv -p "$PWD_AUTHOR" -c FR -s "Rhone Alpes" -ct Lyon -o "Canape TV" -n "Anthony Parra" -f canapetv; then
    # l'outil des certificats n'est pas toujours inclus : on l'installe
    timeout 300 "$TS/package-manager/package-manager-cli.bin" install --accept-license certificate-manager cert-add-on 2>&1 | tail -5 || true
    timeout 180 tizen certificate -a canapetv -p "$PWD_AUTHOR" -c FR -s "Rhone Alpes" -ct Lyon -o "Canape TV" -n "Anthony Parra" -f canapetv
  fi
  echo "Nouveau certificat créé pour cette fabrication"
fi
ls -la "$DATA/keystore/author/"

echo "== 3. Profil de signature"
timeout 180 tizen security-profiles add -n canape -a "$AUTHOR" -p "$PWD_AUTHOR" || true
PROFILES="$DATA/profile/profiles.xml"
timeout 120 tizen cli-config "profiles.path=$PROFILES" || true
# Sans trousseau de mots de passe sur le serveur : on écrit les mots de passe en clair dans le profil
if [ -f "$PROFILES" ]; then
  python3 - "$PROFILES" "$PWD_AUTHOR" <<'EOF'
import re, sys
p, pwd = sys.argv[1], sys.argv[2]
s = open(p).read()
def fix(m):
    item = m.group(0)
    if 'author' in item.lower() and 'distributor="0"' in item:
        return re.sub(r'password="[^"]*"', 'password="%s"' % pwd, item)
    if 'tizen-distributor-signer.p12' in item:
        return re.sub(r'password="[^"]*"', 'password="tizenpkcs12passfordsigner"', item)
    return item
s = re.sub(r'<profileitem [^>]*/>', fix, s)
open(p, 'w').write(s)
EOF
  sed 's/password="[^"]*"/password="***"/g' "$PROFILES"
fi

echo "== 4. Paquet"
rm -rf build dist && mkdir -p build/wgt dist
cp -r app service build/wgt/
cp tizen/config.xml tizen/icon.png build/wgt/
timeout 300 tizen package -t wgt -s canape -o "$ROOT/dist" -- "$ROOT/build/wgt"
WGT=$(ls dist/*.wgt | head -1)
mv "$WGT" dist/CanapeTV.wgt
unzip -l dist/CanapeTV.wgt | grep -E "signature|config.xml|index.html"
unzip -l dist/CanapeTV.wgt | grep -q author-signature.xml || { echo "Le paquet n'est pas signé"; exit 1; }
unzip -l dist/CanapeTV.wgt | grep -q signature1.xml || { echo "Signature du distributeur absente"; exit 1; }
echo "== Terminé : dist/CanapeTV.wgt ($(du -k dist/CanapeTV.wgt | cut -f1) Ko)"
