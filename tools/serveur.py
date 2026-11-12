#!/usr/bin/env python3
"""Sert le jeu en local sans laisser le navigateur garder d'anciens fichiers.

Avec `python3 -m http.server`, le navigateur peut réutiliser un ancien module après une mise à jour :
le jeu tourne alors avec un mélange de versions. Ici, chaque fichier est redemandé à chaque chargement.

Usage, depuis le dossier du jeu : python3 tools/serveur.py [port]   (8027 par défaut)
"""
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class SansCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8027
    os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
    print(f"Élite 27 : http://localhost:{port}/  (Ctrl+C pour arrêter)")
    ThreadingHTTPServer(("", port), SansCache).serve_forever()
