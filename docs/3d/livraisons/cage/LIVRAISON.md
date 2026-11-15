# Cage — version adaptée au cahier du jeu

Livrée le 14/11/2026. Validée par Thibault le 15/11/2026 (« remplace »). Corrigée le 15/11/2026 : la cage tient
dans le rectangle de la logique du jeu, base et arrière droits (voir « Rectangle du jeu »).

Elle remplace `materiel/cage.glb` depuis le 15/11/2026 (copie de ce `cage.glb`). L'ancienne cage (540 triangles)
est gardée dans `materiel/work/ancienne_cage/`.

## Fichiers

- `cage.glb` : un seul objet racine `Cage` (tubes et jupe, sans clé de forme) et son enfant `Filet` (le filet,
  quatre clés de forme). Ni Draco ni Meshopt, aucune extension glTF, aucune animation.
- `textures/cage_filet.png` (512, transparence découpée, répétée) : la texture du filet.
- `textures/cage_cadre.jpg` (1 024, couleur) et `textures/cage_cadre_orm.jpg` (1 024, rugosité en vert, métal en
  bleu) : tubes, jambe arrière et jupe.
- `cage.blend`, `controle/cage.png` (repos, puis chaque clé de forme à 1), `controle/cage_dessus.png` (vue de
  dessus avec le rectangle du jeu tracé en jaune).
- `scripts/01_cage.py` reconstruit tout (textures, maillage, export) ; `scripts/rendu.py` puis `scripts/planche.sh`
  refont l'image de contrôle.

## Chiffres

| | Livré | Demandé |
|---|---|---|
| Triangles | 1 348 (564 tubes et jupe, 784 filet) | 3 000 au plus |
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

## Rectangle du jeu

Vue de dessus, toute la cage au repos tient dans le rectangle sur lequel le jeu fait rebondir le palet.
Cotes mesurées sur le maillage, dans le repère du glTF :

| | X min | X max | Z min (fond) | Z max (avant) |
|---|---|---|---|---|
| Rectangle demandé | −0,93 | +0,93 | −1,09 | +0,04 |
| Tubes et jupe | −0,930 | +0,930 | −1,090 | +0,040 |
| Filet au repos | −0,895 | +0,895 | −0,999 | 0,000 |

- La barre de base part droit vers l'arrière depuis chaque montant ; son bord extérieur est au ras du montant.
- Angles du fond à l'équerre, sans arrondi (demande de Thibault), pour la base comme pour l'arceau du dessus.
- Les clés de forme sortent du rectangle quand le filet se gonfle : c'est voulu.

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
- Sommets par panneau : fond 17 × 9, chaque côté 13 × 9, dessus 13 × 7.
- À 1, aucune clé ne passe sous le sol (le filet reste au-dessus de 17 cm) ni devant la ligne de but, et le
  filet ne traverse aucun tube : il est poussé vers l'extérieur, et la jambe arrière est à l'intérieur.

## Ce qu'on voit

- Cadre avant en un seul tube rouge cintré aux angles, barre de base rouge droite, à angles d'équerre au fond, arceau
  rouge rectangulaire qui tient le dessus du filet, jambe arrière centrale grise placée 3 cm à l'intérieur du filet.
- Filet blanc à mailles en losange sur le dessus, les côtés et le fond ; l'ouverture reste libre et le filet
  ne passe pas devant la ligne de but.
- Jupe blanche de 14 cm en bas du filet (ourlet rouge, œillets, salissure), lacets blancs sur les tubes,
  peinture écaillée et traces de palet, surtout en bas des montants.
- Marque inventée Noroît : petit losange bleu à aiguille blanche sur la jupe, un par mètre.

## Écarts et limites

1. **La cage Meshy n'est pas réutilisée telle quelle.** Elle fait 6,5 millions de triangles avec un filet modélisé
   maille par maille, et son ouverture est aux proportions du hockey sur glace. Elle a servi de modèle de forme
   (dessus court, fond incliné, jambe centrale ; sa base évasée et arrondie n'est plus reprise) ; le maillage et les textures sont refaits.
   L'import d'origine est gardé dans `materiel/work/cage_meshy.blend`.
2. **Montants à cheval sur la ligne de but** : leur axe est sur la ligne, leur face avant dépasse donc de 4 cm
   devant (comme sur la cage précédente). Le filet, lui, commence à la ligne.
3. **Base** : plus d'évasement ni d'arrondi. La cage ne ressemble donc plus à la cage Meshy vue de dessus.
4. **Angles intérieurs arrondis** : le cintrage du cadre laisse un congé de 3 cm de rayon dans les deux coins
   hauts de l'ouverture.
5. **Trois textures au lieu d'une** : filet, couleur du cadre, rugosité/métal du cadre. Toutes dans la limite
   de 1 024. Pas de carte de normales.
6. **Arceau du dessus rouge** : sur la cage Meshy le dessus du filet tient sans tube visible ; le cahier demande
   des arceaux, j'en ai mis un.
7. Le filet est fait de panneaux plans tendus, sans plis ni poche.
8. La jupe fait partie du maillage des tubes et ne bouge pas : les clés de forme s'arrêtent à son bord haut.
9. Les arêtes verticales des angles du fond sont des attaches : elles ne bougent avec aucune clé.
10. Les normales ne suivent pas les clés (case « Shape Key Normals » décochée) : l'éclairage du filet déformé
    reste celui du repos.
