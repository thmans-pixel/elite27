#!/usr/bin/env bash
# Installe le programme des parties en ligne d'Élite 27 sur le serveur : un service qui redémarre seul, et le
# passage de /partie par nginx. À lancer une fois, après une mise à jour du site (mettre-a-jour.sh) :
#
#   sudo bash /var/lib/elite27/source/tools/deploiement/installer-partie.sh [domaine]
#
# Peut être relancé sans risque. Pour tout enlever : voir la fin du fichier.
set -euo pipefail

DOMAINE="${1:-elite27.izicraft.fr}"
SOURCE="${ELITE27_SOURCE:-/var/lib/elite27/source}"
ICI="$SOURCE/tools/deploiement"
SERVICE=elite27-partie
NGINX="/etc/nginx/conf.d/$DOMAINE.d"
PORT=8127

[ "$(id -u)" = 0 ] || { echo "À lancer avec sudo." >&2; exit 1; }
[ -f "$SOURCE/serveur/elite27-serveur.mjs" ] || { echo "Le jeu n'est pas dans $SOURCE : lance d'abord la mise à jour du site." >&2; exit 1; }
[ -d "$NGINX" ] || { echo "Dossier nginx du domaine introuvable : $NGINX" >&2; exit 1; }

# Node 18 ou plus récent : celui du système, sinon ceux que YunoHost installe pour ses applications. Le service
# n'a pas accès aux dossiers personnels : un Node rangé dans /home ou /root ne lui sert à rien, on prend le
# vrai fichier (pas un lien) et on écarte ces dossiers.
NODE=""
for candidat in "$(command -v node || true)" $(ls -d /opt/node_n/n/versions/node/*/bin/node 2>/dev/null | sort -V -r); do
  [ -n "$candidat" ] || continue
  vrai="$(readlink -f "$candidat" 2>/dev/null || true)"
  [ -n "$vrai" ] && [ -x "$vrai" ] || continue
  case "$vrai" in /home/*|/root/*|/run/user/*) continue ;; esac
  majeure="$("$vrai" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  if [ "$majeure" -ge 18 ]; then NODE="$vrai"; break; fi
done
[ -n "$NODE" ] || { echo "Il faut Node 18 ou plus récent sur ce serveur, et je n'en trouve pas." >&2; exit 1; }
echo "Node : $NODE ($("$NODE" --version))"

# Le port doit être libre, ou déjà tenu par ce programme.
if ! systemctl is-active --quiet "$SERVICE" && ss -ltn 2>/dev/null | grep -q "127.0.0.1:$PORT "; then
  echo "Le port $PORT est déjà pris par un autre programme." >&2
  exit 1
fi

# Le service tourne sous un compte sans droits : il doit pouvoir lire le jeu (qui est public).
chmod a+rx "$(dirname "$SOURCE")"
chmod -R a+rX "$SOURCE"

sed "s|^ExecStart=NODE |ExecStart=$NODE |" "$ICI/$SERVICE.service" > "/etc/systemd/system/$SERVICE.service"
systemctl daemon-reload
systemctl enable --quiet "$SERVICE"
systemctl restart "$SERVICE"
sleep 2
systemctl is-active --quiet "$SERVICE" || { echo "Le programme ne démarre pas : sudo journalctl -u $SERVICE -n 30 --no-pager" >&2; exit 1; }
echo "Service $SERVICE : lancé, et relancé à chaque démarrage du serveur."

# nginx : la nouvelle règle n'est gardée que si la configuration entière reste valide.
cp "$ICI/partie.conf" "$NGINX/$SERVICE.conf"
if ! nginx -t 2>/dev/null; then
  rm -f "$NGINX/$SERVICE.conf"
  echo "nginx refuse la règle : elle a été retirée, le site n'a pas changé. Détail : sudo nginx -t" >&2
  exit 1
fi
systemctl reload nginx

if [ "$(curl -s --max-time 8 "https://$DOMAINE/partie/sante" || true)" = "ok" ]; then
  echo "Parties en ligne : prêtes sur https://$DOMAINE"
else
  echo "Le service tourne mais https://$DOMAINE/partie/sante ne répond pas « ok »." >&2
  exit 1
fi

# Pour tout enlever :
#   sudo systemctl disable --now elite27-partie
#   sudo rm /etc/systemd/system/elite27-partie.service /etc/nginx/conf.d/<domaine>.d/elite27-partie.conf
#   sudo systemctl daemon-reload && sudo systemctl reload nginx
