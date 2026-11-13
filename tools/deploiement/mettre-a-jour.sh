#!/usr/bin/env bash
# Met en ligne la branche main d'Élite 27 : à lancer sur le serveur, après avoir fusionné une demande sur GitHub.
#
#   sudo bash mettre-a-jour.sh [dossier du site]
#
# Le dossier du site est celui que sert l'application « site statique » de YunoHost
# (par défaut /var/www/my_webapp/www). Seuls les fichiers du jeu y sont copiés : ni outils, ni tests, ni documents.
set -euo pipefail

DEPOT="${ELITE27_DEPOT:-https://github.com/thmans-pixel/elite27.git}"
BRANCHE="${ELITE27_BRANCHE:-main}"
SOURCE="${ELITE27_SOURCE:-/var/lib/elite27/source}"
SITE="${1:-/var/www/my_webapp/www}"

for outil in git rsync; do
  command -v "$outil" >/dev/null || { echo "Il manque la commande $outil sur ce serveur (sudo apt install $outil)." >&2; exit 1; }
done
if [ ! -d "$SITE" ]; then
  echo "Le dossier du site n'existe pas : $SITE" >&2
  exit 1
fi

# Copie de travail du dépôt, gardée d'une fois sur l'autre pour ne télécharger que les nouveautés.
if [ ! -d "$SOURCE/.git" ]; then
  mkdir -p "$(dirname "$SOURCE")"
  git clone --quiet --branch "$BRANCHE" --depth 1 "$DEPOT" "$SOURCE"
else
  git -C "$SOURCE" fetch --quiet --depth 1 origin "$BRANCHE"
  git -C "$SOURCE" reset --quiet --hard "origin/$BRANCHE"
fi

VERSION="$(git -C "$SOURCE" rev-parse --short HEAD)"
JOUR="$(git -C "$SOURCE" log -1 --format=%cs)"

# Le jeu et rien d'autre. --checksum : un fichier inchangé n'est pas réécrit, le navigateur garde donc sa copie.
rsync --recursive --checksum --delete --delete-excluded \
  --include='/index.html' --include='/style.css' \
  --include='/src/***' --include='/vendor/***' --include='/assets/***' \
  --exclude='*' \
  "$SOURCE/" "$SITE/"

printf '{ "version": "%s", "date": "%s" }\n' "$VERSION" "$JOUR" > "$SITE/version.json"

# Les fichiers appartiennent au même compte que le dossier du site.
chown -R --reference="$SITE" "$SITE"

echo "En ligne : version $VERSION du $JOUR, dans $SITE"
