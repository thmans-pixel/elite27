# Cage — version adaptée au cahier du jeu

Livrée le 14/11/2026. Validée par Thibault le 15/11/2026 (« remplace »).

Elle remplace `materiel/cage.glb` depuis le 15/11/2026 (copie de ce `cage.glb`). L'ancienne cage (540 triangles)
est gardée dans `materiel/work/ancienne_cage/`.

## Fichiers

- `cage.glb` : un seul objet racine `Cage` (tubes et jupe, sans clé de forme) et son enfant `Filet` (le filet,
  quatre clés de forme). Ni Draco ni Meshopt, aucune extension glTF, aucune animation.
- `textures/cage_filet.png` (512, transparence découpée, répétée) : la texture du filet.
- `textures/cage_cadre.jpg` (1 024, couleur) et `textures/cage_cadre_orm.jpg` (1 024, rugosité en vert, métal en
  bleu) : tubes, jambe arrière et jupe.
- `cage.blend`, `controle/cage.png` (repos, puis chaque clé de forme à 1).
- `scripts/01_cage.py` reconstruit tout (textures, maillage, export) ; `scripts/rendu.py` puis `scripts/planche.sh`
  refont l'image de contrôle.

## Chiffres

| | Livré | Demandé |
|---|---|---|
| Triangles | 2 180 (1 300 tubes et jupe, 880 filet) | 3 000 au plus |
| Textures | 2 × 1 024 + 1 × 512 | 1 024 au plus |
| Ouverture intérieure | 1,700 × 1,050 m | 1,70 × 1,05 m |
| Profondeur (ligne de but → fond) | 1,090 m | 1,09 m |
| Montants et transversale | tubes ronds de 8 cm, rouges | 8 cm, rouges |
| Hauteur hors tout | 1,13 m | environ 1,13 m |
| Angle montants / transversale | 90,0° des deux côtés | 90° |
| Point le plus bas | 0 (rien sous le sol) | y ≥ 0 |
| Poids | 0,6 Mo | — |

- Origine au sol, au milieu de la ligne de but, sur le plan de l'ouverture. Y en haut, ouverture vers +Z du glTF.
- Matières : `M_Cage_Cadre` (opaque, métal/rugosité en texture) et `M_Cage_Filet` (alpha `MASK`). Les deux sont
  visibles des deux côtés.
- `node tools/modele/controle.mjs cage.glb` : « Conforme au cahier ».

## Filet animé (clés de forme)

`Filet` porte quatre clés de forme, exportées en « morph targets » (positions seules, sans normales) :

| Clé | Effet à 1 | Maximum mesuré | Où |
|---|---|---|---|
| `Fond` | fond poussé vers l'arrière (−Z du glTF) | 25,0 cm | centre du panneau du fond |
| `Gauche` | côté −X poussé vers l'extérieur | 20,0 cm | milieu du panneau |
| `Droite` | côté +X poussé vers l'extérieur | 20,0 cm | milieu du panneau |
| `Dessus` | dessus poussé vers le haut | 15,0 cm | milieu du dessus |

- Déformation en cloche ; les sommets attachés (arceau, transversale, montants, haut de la jupe) ne bougent
  pas : déplacement mesuré 0 pour les quatre clés.
- Valeur 0 au repos. Aucune animation enregistrée : c'est le jeu qui mélange et fait osciller.
- Sommets par panneau : fond 9 × 9, chaque côté 11 × 9 (plus les angles arrondis), dessus 21 × 7.
- À 1, aucune clé ne passe sous le sol (le filet reste au-dessus de 17 cm) ni devant la ligne de but, et le
  filet ne traverse aucun tube : il est poussé vers l'extérieur, et la jambe arrière est à l'intérieur.

## Ce qu'on voit

- Cadre avant en un seul tube rouge cintré aux angles, barre de base rouge évasée puis arrondie au fond, arceau
  rouge qui tient le dessus du filet, jambe arrière centrale grise placée 3 cm à l'intérieur du filet.
- Filet blanc à mailles en losange sur le dessus, les côtés et le fond ; l'ouverture reste libre et le filet
  ne passe pas devant la ligne de but.
- Jupe blanche de 14 cm en bas du filet (ourlet rouge, œillets, salissure), lacets blancs sur les tubes,
  peinture écaillée et traces de palet, surtout en bas des montants.
- Marque inventée Noroît : petit losange bleu à aiguille blanche sur la jupe, un par mètre.

## Écarts et limites

1. **La cage Meshy n'est pas réutilisée telle quelle.** Elle fait 6,5 millions de triangles avec un filet modélisé
   maille par maille, et son ouverture est aux proportions du hockey sur glace. Elle a servi de modèle de forme
   (base évasée, dessus court, fond incliné, jambe centrale) ; le maillage et les textures sont refaits.
   L'import d'origine est gardé dans `materiel/work/cage_meshy.blend`.
2. **Montants à cheval sur la ligne de but** : leur axe est sur la ligne, leur face avant dépasse donc de 4 cm
   devant (comme sur la cage précédente). Le filet, lui, commence à la ligne.
3. **Base plus large que le cadre** : 2,04 m hors tout au plus large, contre 1,86 m pour le cadre avant
   (+9 cm par côté). L'évasement de la cage Meshy était plus fort (+16 %), je l'ai réduit. Si le jeu calcule les
   chocs sur une boîte de 1,86 m, le bas de la cage dépasse un peu de cette boîte.
4. **Angles intérieurs arrondis** : le cintrage du cadre laisse un congé de 3 cm de rayon dans les deux coins
   hauts de l'ouverture.
5. **Trois textures au lieu d'une** : filet, couleur du cadre, rugosité/métal du cadre. Toutes dans la limite
   de 1 024. Pas de carte de normales.
6. **Arceau du dessus rouge** : sur la cage Meshy le dessus du filet tient sans tube visible ; le cahier demande
   des arceaux, j'en ai mis un.
7. Le filet est une nappe tendue, sans plis ni poche.
8. La jupe fait partie du maillage des tubes et ne bouge pas : les clés de forme s'arrêtent à son bord haut.
9. Dans les angles arrondis du fond, `Fond` et les clés de côté se recouvrent un peu (colonnes communes) ; jouées
   ensemble, leurs déplacements s'ajoutent dans l'angle (non mesuré).
10. Les normales ne suivent pas les clés (case « Shape Key Normals » décochée) : l'éclairage du filet déformé
    reste celui du repos.
