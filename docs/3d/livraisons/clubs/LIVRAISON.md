# Étape 8 — tenues et écussons des dix clubs (3D.md § 7)

Livrée le 13/11/2026, en attente de validation.

## Fichiers

| Fichier | Contenu |
|---|---|
| `tenues/<club>-domicile.png`, `tenues/<club>-exterieur.png` | 20 textures 2048, fond transparent là où la couleur de base reste visible ; maillot, pantalon, écusson sur la poitrine |
| `ecussons/<club>.png` | 10 écussons 512, fond transparent |
| `clubs.json` | par club et par tenue : couleur de base du maillot, des manches, du pantalon, du bas de jambe, du casque (sRGB 0-1) ; `casque_gardien` pour Valence, `numeros` pour Rethel à l'extérieur |
| `clubs.blend` | les vingt tenues côte à côte sur le patineur (domicile devant, extérieur derrière), pour regarder |
| `controle/tenues_1.png`, `tenues_2.png`, `ecussons.png` | planches : face et dos de chaque tenue, les dix écussons |
| `scripts/` | `ecussons.py` (python3 -I), `01_tenues.py` (peinture, aperçus, clubs.json), `02_scene.py`, `planche_tenues.py` |

Clubs : `valence`, `rethel`, `villeneuve`, `vierzon`, `grenoble`, `epernay`, `caen`, `anglet`, `pont-de-metz`, `angers`.

## Comment le jeu s'en sert

1. teinter la texture neutre du corps, zone par zone du masque, avec les couleurs de `clubs.json` ;
2. poser la texture de tenue par-dessus (son alpha) ;
3. écrire numéro et nom dans les rectangles de `joueur/textures/zones-uv.json`.

Les UV du joueur n'ont pas changé ; les mêmes textures vont sur le gardien.

## Ce qui est fait

- Motifs stylisés d'après le tableau du cahier, peints en coordonnées du corps : épaules, liserés, chevrons, bandes de
  poitrine, écharpe, éclair, flancs, marinière, bandes de manche, bas de maillot, bande de côté du pantalon, bas de jambe.
- Le numéro du dos et les numéros de manche restent sur un fond uni. Seules les épaules de couleur passent sous le haut
  du rectangle du nom (sinon elles seraient entaillées).
- Écussons : dessins géométriques originaux, tirés du seul surnom du club. Aucun vrai logo regardé ni repris, aucun
  sponsor, aucune marque. Les trois oiseaux sont distincts : tête d'aiglon blanche de profil (Valence), faucon vert en
  piqué (Pont-de-Metz), épervier bleu marine de face ailes ouvertes (Angers).

## Écarts et limites

1. Les motifs sont inventés à partir d'une ligne de texte par club, sans photo : à corriger club par club si besoin.
2. Quand le cahier ne dit rien du pantalon, il prend la couleur du maillot.
3. Écussons simples, sans nom de club ni lettres.
4. L'écusson est déjà posé dans la texture de tenue (22 × 22 cm sur la poitrine) ; le fichier séparé sert aux menus.
5. Pas d'écusson sur la cuisse.
6. Les aperçus sont rendus sans tête ni casque.

Validée par Thibault le 13/11/2026 (« tres bien »).
