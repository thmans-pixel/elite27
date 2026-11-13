# Étape 11 — versions allégées des trois personnages (3D.md § 3, § 6.1)

Livrée le 13/11/2026, en attente de validation.

| Fichier | Triangles | Poids |
|---|---|---|
| `../joueur/joueur-leger.glb` (`Joueur_Leger`) | 4 948 (complet : 17 314) | 3,6 Mo |
| `../gardien/gardien-leger.glb` (`Gardien_Leger`) | 4 948 (complet : 17 314) | 3,6 Mo |
| `../arbitre/arbitre-leger.glb` (`Arbitre_Leger`) | 4 948 (complet : 17 362) | 3,1 Mo |

Chaque fichier : le corps allégé + le squelette de 55 os, sans animation (elles viennent des fichiers `anim-*.glb`,
qui vont tels quels puisque les os sont les mêmes). À côté de chacun, un `-leger.blend`.
`controle/alleges.png` : pour chaque personnage, de trois quarts avant puis arrière, complet, allégé, allégé en fil de fer.
Script : `scripts/01_alleger.py` (`PERSO=joueur|gardien|arbitre`).

- Mêmes UV, mêmes matières et mêmes textures 2048 que la version complète : tenues des clubs et masques vont sans changement.
- Simplification par fusion d'arêtes ; 4 influences au plus par sommet, poids normalisés. Pas de Draco.
- Les fichiers se rouvrent dans une scène vide.

## Écarts et limites

1. Simplification automatique, pas de retouche à la main : les doigts, les roues des patins et le sifflet de l'arbitre
   sont les plus abîmés. Prévu pour le banc et la tribune proche, pas pour un gros plan.
2. Les textures sont embarquées à nouveau dans chaque fichier (d'où le poids) ; le jeu peut réutiliser celles du
   personnage complet.
3. Têtes, casques et matériel du gardien (jambières, mitaine, bouclier, crosse) n'ont pas de version allégée : le
   cahier n'en demande pas.
4. Les poses de référence ne sont pas dans ces fichiers (elles sont dans les fichiers complets).
