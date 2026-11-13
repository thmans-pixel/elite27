# Étape 4 — crosse, palet, cage

Livré le 13/11/2026. Validée par Thibault le 13/11/2026 (« vas y »).

## Fichiers

- `crosse.glb` : `Crosse` (palette courbée vers la gauche) et `Crosse_Droitier` (miroir).
- `palet.glb` : `Palet`.
- `cage.glb` : `Cage`.
- `textures/` : `crosse_couleur.jpg` (512), `palet_couleur.jpg` (256), `cage_filet.png` (256, transparence découpée, répétée).
- `materiel.blend`, `controle/` (`crosse.png`, `palet.png`, `cage.png`, `echelle.png`).
- `scripts/01_materiel.py` reconstruit tout ; `python3 -I verifier.py ../crosse.glb ../palet.glb ../cage.glb`.

## Chiffres

| Objet | Triangles | Budget | Texture |
|---|---|---|---|
| Crosse | 252 | 1 200 | 512 |
| Crosse_Droitier | 252 | 1 200 | la même |
| Palet | 188 | 200 | 256 |
| Cage | 540 | (non fixé) | 256 pour le filet |

- **Crosse** : origine au sommet du manche, manche le long de −Y du glTF, 1,50 m du sommet au talon, palette de
  26 cm à 45° du manche. Marque inventée Noroît : aiguille de boussole bleu et blanc sur le manche.
- **Palet** : diamètre 7,6 cm, épaisseur 2,2 cm, orange vif. Origine au centre de la face posée au sol.
- **Cage** : ouverture intérieure 1,70 × 1,05 m, profondeur 1,09 m, montants rouges de 8 cm, filet blanc en
  transparence découpée (`MASK`), visible des deux côtés. Origine au sol, au milieu de la ligne de but ;
  l'ouverture regarde vers +Z du glTF.
- Pas de Draco, aucune extension glTF.

## Écarts et limites

1. Cage : « 1,70 m de large, 1,05 m de haut » est pris comme l'ouverture intérieure. Hors tout, la cage fait donc
   1,86 × 1,13 m. Si la cote voulue est hors tout, c'est une ligne à changer.
2. Cage : les montants n'ont pas de texture (couleur unie rouge dans la matière). Les mailles du filet sont
   étirées sur les côtés inclinés.
3. Crosse : formes simples, pas de carte de normales ni de rugosité. La palette est peinte en ruban noir uni.
4. Essai dans les mains du joueur (`echelle.png`) : le joueur tient main droite en bas, c'est donc
   `Crosse_Droitier` qui va avec la Pose_Patinage. Le talon de la pose est à 2 cm du sol : la palette flotte de
   2 cm, à rattraper à l'étape 5.
