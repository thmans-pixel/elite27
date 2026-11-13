# Étape 6 (première partie) — gardien : corps et matériel (3D.md § 6.3)

Livré le 13/11/2026. **En attente de validation par Thibault.** Les animations `G_*` (§ 10.3) viennent après.

## Fichiers

| Fichier | Contenu |
|---|---|
| `gardien.glb` (4,1 Mo) | `Gardien` + `Squelette` + actions `Pose_T`, `Pose_Gardien_Base`, `Main_Prise`, `Main_Ouverte`, `Main_Poing` |
| `jambiere.glb` | `Jambiere` (une, celle de la jambe gauche ; la droite est son miroir) |
| `mitaine.glb`, `bouclier.glb` | `Mitaine` (main gauche), `Bouclier` (main droite) |
| `crosse-gardien.glb` | `Crosse_Gardien` |
| `casque-gardien.glb` | `Casque_Gardien` (coque enveloppante, grille) |
| `gardien.blend` | tout en place, en position de base (avec `Tete_A` pour juger, non livrée ici) |
| `textures/` | `gardien_*` (2048, les mêmes que le joueur), `gardien_materiel_couleur.jpg` / `_masque.png` / `_orm.png` (1024, partagée jambière + mitaine + bouclier), `crosse_gardien_couleur.jpg` (512), `casque_gardien_couleur.jpg` / `_masque.png` (1024), `gardien_materiel_apercu_valence.jpg` (aperçu) |
| `controle/` | `gardien_vues.png` (corps seul + fil de fer), `gardien_equipe_repos.png`, `gardien_pose_base.png`, `casque_gardien.png`, `sources_gardien.png` (corps Meshy écartés) |
| `scripts/` | `01_corps → 02_materiel → 02a_sources (long, une fois) → 02b_mitaine → 03_casque → 04_poses → 05_exporter` |

## Chiffres

| Objet | Triangles | Budget | Texture |
|---|---|---|---|
| Gardien | 17 314 | 22 000 | 2048 : couleur, normales, rugosité/métal, masque |
| Jambiere | 632 | 3 000 | 1024 partagée |
| Mitaine | 3 000 | — | la même (+ normales) |
| Bouclier | 360 | — | la même |
| Crosse_Gardien | 220 | 1 200 | 512 |
| Casque_Gardien | 2 340 | 2 500 | 1024 + masque + normales |

- Squelette : 55 os, strictement celui du joueur (vérifié os par os à l'export) : les animations passent de l'un à l'autre.
- Rouverts dans une scène vide : conformes. Pas de Draco.
- Position de base : rien sous le sol (jambières à −0,5 cm), paumes sur leur cible à 0,0 cm, poignets pliés de 8° (droit) et 2° (gauche).

## Repères d'accrochage

- `Jambiere` : origine au genou, face avant vers +Z du glTF, longueur le long du tibia. À fixer sur `LeftLeg` (et en
  miroir sur `RightLeg`), le haut vers la tête de l'os. Elle va de 28 cm au-dessus du genou à 42 cm en dessous.
- `Mitaine` → `Prop_MainGauche`, `Bouclier` → `Prop_MainDroite`, `Casque_Gardien` → `Prop_Tete` : sans rotation.
- `Crosse_Gardien` : origine au sommet du manche, manche le long de −Y du glTF (comme la crosse du joueur). 1,35 m du
  sommet au talon, partie élargie de 9 cm sur les 59 cm du bas, palette de 36 cm. La main droite la tient à 70 cm
  du sommet, juste au-dessus de la partie élargie.
- Masques : rouge = zone qui prend la couleur du club (face des jambières, dos de la mitaine, plaque du bouclier,
  coque du casque).

## Écarts au cahier, et pourquoi

1. **Le corps ne vient pas d'un corps Meshy de gardien.** Les trois fournis sont inutilisables : l'un a tout son
   matériel soudé au corps (1,4 million de triangles), les deux autres sont en culotte courte et bas, gants fondus
   (`controle/sources_gardien.png`). Le gardien est le patineur validé, épaissi : plastron (+4 cm sur le buste et
   les épaules), protège-bras, pantalon rembourré (+3 cm). Avantage : mêmes UV que le joueur, donc **les tenues des
   dix clubs s'appliquent telles quelles au gardien**, zones de numéro comprises.
2. **Tout le matériel est modélisé par script**, formes simples, coutures et sangles peintes. La jambière Meshy
   (`Meshy_AI_A_single_ice_hockey_g…`) est plus détaillée mais sans texture ; elle peut remplacer la mienne plus tard.
3. **Jambière rigide** : comme elle suit le tibia, son bas est court et relevé, sinon il passe sous le sol quand la
   cheville plie. Elle couvre le dessus du patin sans descendre jusqu'aux roues.
4. Les gants du patineur restent sous la mitaine et le bouclier (cachés par la mitaine, visibles sous le bouclier
   puisque c'est cette main qui tient la crosse).
5. Pas de carte de normales pour le matériel. Budget triangles peu utilisé (pièces vues de loin).
6. Marques : triangle Korrigan sur jambière et bouclier, chevron Vélane sur mitaine et casque, aiguille Noroît sur
   la crosse : signes géométriques, vrais logos à dessiner à l'étape 8.
7. Pas de gros plan des mains ni de pose accroupie refaits : le maillage des mains et les poids sont ceux du joueur.

## Points à regarder en priorité

- La silhouette du gardien (assez large ? jambières assez hautes ?).
- La position de base : écartement des patins, hauteur de la mitaine, palette au sol entre les jambières.
- La mitaine et le bouclier, repris le 13/11/2026 d'après Thibault (voir plus bas).

## Reprise du 13/11/2026 (retours de Thibault)

- **Bouclier dans l'axe du bras** : la plaque suit l'axe de l'avant-bras (elle couvre le dos de la main et remonte
  de 20 cm sur l'avant-bras), et la position de base garde le poignet droit, l'avant-bras tournant avec la main.
  Le bouclier étant rigide sur la main, les animations devront garder ce poignet droit.
- **Mitaine creuse** : coque ouverte côté paume (38 × 30 cm, 7 cm de creux), poche lacée entre le pouce et l'index,
  chausson au dos qui enferme la main, manchette sur le poignet.
- Crosse : partie élargie portée de 52 à 59 cm (44 % de la longueur au lieu du tiers du cahier), sinon la main
  n'atteint pas la prise quand la palette est à plat au sol.

## Seconde reprise du 13/11/2026 : mitaine et casque Meshy fournis par Thibault, coude droit

- **Mitaine** : c'est maintenant le modèle `Meshy_AI_hockey_goalie_catcher…` (2,9 millions de triangles, sans texture),
  remaillé en une seule peau puis réduit à 3 000 triangles ; relief et ombres cuits dans la texture partagée
  (`gardien_materiel_normales.png` en plus). Teinte neutre unie : toute la mitaine prend la couleur du club.
- **Casque** : forme du modèle `Meshy_AI_hockey_goalie_helmet…` (1,1 million de triangles en 1 334 morceaux, donc
  irréductible tel quel). La coque est relevée par lancers de rayons et reconstruite (2 340 triangles avec la grille),
  la grille est refaite en barreaux neufs sur la surface de la grille d'origine, relief et ombres cuits.
  **Sa peinture n'est pas reprise** : elle porte une marque réelle (« BAUER » sur le front et le dessus) ; le mot gravé
  en relief sur le front, l'écusson du sommet et la lettre du menton sont aussi effacés du relief. Coque neutre teintable.
  Le haut du casque est à 1,845 m. L'ancien casque modélisé reste dans `scripts/03_casque_script.py.bak`.
- **Coude du bras qui tient la crosse** : il était pincé, toute la rotation de l'avant-bras se faisant au coude.
  La prise est refaite : le manche passe en biais (60°) dans la main, comme sous un vrai bouclier, ce qui laisse le
  coude plier dans son sens (vrille de 10°), le poignet droit et la plaque face au tir.
  Conséquence pour le jeu : `Crosse_Gardien` s'accroche à `Prop_MainDroite` avec un décalage fixe, position
  (−0,606 ; −0,350 ; 0) m et rotation XYZ (−90° ; 45,2° ; 120°) dans le repère de l'os (relevé dans `gardien.blend`).
- Limites : la grille du casque est un peu irrégulière sur ses bords ; le gant du patineur dépasse un peu au dos de la
  mitaine (manchette) ; les doigts de la main droite sont fermés pour un manche droit, pas en biais (cachés par le bouclier).
- Planches : `controle/gardien_pose_base.png` (avec gros plan du bras droit sans bouclier), `mitaine.png`,
  `casque_gardien.png`, `sources_mitaine_casque.png`.

## Troisième reprise du 13/11/2026 : mitaine plus petite et dans l'axe de l'avant-bras

Demande de Thibault : mitaine trop grosse, à mettre dans l'axe du bras en la tournant autour de la main.

- Échelle ramenée de 0,22 à 0,18 : la mitaine fait 34 × 33 × 18 cm (au lieu de 42 × 40 × 22).
- Tournée de 40° autour de la normale de la paume : la manchette entoure le poignet, dans le prolongement de
  l'avant-bras (réglages `MIT_S`, `MIT_ROT`, `MIT_AX`, `MIT_AZ` de `02b_mitaine.py`).
- Dans `Pose_Gardien_Base`, les doigts gauches sont ouverts et un peu tirés en arrière (`DOIGTS_G` de `04_poses.py`)
  pour ne pas percer la poche, plus petite. Les animations du gardien devront garder cette pose de doigts.
- Limite : on devine encore le bout des doigts au fond de la poche, de près.

## Gardien validé par Thibault le 13/11/2026 (« gardien validé »)

## Quatrième reprise du 13/11/2026 : jambières collées aux jambes, botte remontée

Demande de Thibault : remonter les bottes des jambières et les coller aux jambes.

- Sous le genou, la jambière suit maintenant le tibia (elle recule de 7 cm en bas) au lieu de rester droite devant.
- La botte est remontée sur le cou-de-pied : elle couvre le bout du patin au lieu de dépasser devant.
- `Jambiere` : 688 triangles (budget 3 000). En position de base, le bas de la jambière est à 3,1 cm du sol
  (avant : −0,5 cm). L'ancienne version du script est dans `scripts/02_materiel.py.avant_jambieres`.

## Animations du gardien (3D.md § 10.3)

Fichiers : `../animations/anim-gardien.glb` (squelette seul + actions `G_*`, 30 images/s), `anim-gardien.blend`
(gardien équipé + actions), planches et vidéos au ralenti dans `controle/anim/`.
Scripts : `06_animer.py` (moteur) + `cles_gardien.py` (clés) → `07_exporter_anim.py` ; contrôle : `rendu_anim.py`, `planches_anim.sh`.

| Action | Images | Durée | Déplacement | Fin |
|---|---|---|---|---|
| G_Base | 60 | 2,00 s, boucle | sur place | pose de base |
| G_Papillon_Descente | 8 | 0,27 s | bassin avance de 6 cm | papillon |
| G_Papillon_Tenue | 30 | 1,00 s, boucle | sur place | papillon |
| G_Papillon_Remontee | 15 | 0,50 s | bassin recule de 6 cm | pose de base |
| G_Mitaine_Haut | 14 | 0,47 s | sur place | pose de base |
| G_Mitaine_Bas | 14 | 0,47 s | bassin avance de 6 cm | papillon |
| G_Bouclier_Haut | 14 | 0,47 s | sur place | pose de base |
| G_Bouclier_Bas | 14 | 0,47 s | bassin avance de 6 cm | papillon |
| G_Pas_Gauche, G_Pas_Droite | 11 | 0,37 s | 1,00 m sur le côté | pose de base, un mètre plus loin |
| G_Gel_Palet | 24 | 0,80 s | bassin avance de 6 cm | en papillon, penché, mitaine posée sur le palet (pas de retour ; voir septième reprise) |
| G_Poteau_Gauche, G_Poteau_Droite | 12 | 0,40 s | bassin avance de 3 cm | garde du poteau (tenue) |
| G_Extension_Gauche, G_Extension_Droite | 14 | 0,47 s | bassin : 12 cm (10 de côté, 6 en avant) | couché sur le côté (tenue) |

- Toutes les actions partent de `Pose_Gardien_Base` (sauf Tenue et Remontee, qui partent du papillon).
- La crosse est rigide dans la main droite (`Prop_MainDroite`, décalage fixe noté plus haut) : aucun os porte-crosse animé.
- Jambières : rigides sur les tibias. En papillon, le tibia tourne de 60° autour de son axe pour que la jambière
  se dresse face au tir (le genou du maillage vrille, caché par la jambière vue de face).
- Contrôles (toutes actions) : mains sur leur cible (écart max 0,6 cm, G_Bouclier_Bas), chevilles sur leur cible,
  poignets ≤ 51°, rien sous le sol à plus de 0,2 cm près.

### Écarts et limites

1. **Durées** : à 30 images/s, 0,25 s, 0,45 s et 0,35 s tombent entre deux images ; arrondi à 8, 14 et 11 images.
2. **Arrêts bas (mitaine, bouclier)** : ils finissent en papillon et non dans la pose de base (redescendre et remonter
   en 0,45 s n'est pas crédible). Le jeu enchaîne avec `G_Papillon_Tenue` ou `G_Papillon_Remontee`.
3. **G_Gel_Palet** finit en papillon, mitaine sur le palet (pas de retour ; version de la septième reprise) ; le jeu siffle ou enchaîne `G_Papillon_Remontee` depuis une pose différente
   (petit saut à prévoir, ou fondu).
4. **Papillon** : le bassin avance de 6 cm (genoux qui tombent devant) : ce n'est pas strictement « sur place ».
5. **Hors cahier : `G_Poteau_Gauche` et `G_Poteau_Droite`**, ajoutées à la demande de Thibault (photos du 13/11) : garde du
   poteau quand l'adversaire est sur le côté ou derrière la cage (jambière du côté du poteau couchée, autre jambe
   dressée, regard vers le poteau). Le jeu doit les connaître pour s'en servir ; pas d'action de retour dédiée.
6. Remontée du papillon : les deux jambes se relèvent ensemble (un vrai gardien se relève une jambe après l'autre).
7. Les doigts ne sont pas animés pendant les actions du gardien : main droite fermée sur le manche, main gauche ouverte.

## Cinquième reprise du 13/11/2026 : bottes attachées aux patins, extensions sur le côté

- **Botte séparée** (demande de Thibault : « attache-les aux patins, elles ne doivent pas bouger ») : le bas de la jambière
  est maintenant une pièce à part, `botte.glb` (`Botte`, 276 triangles, même texture que la jambière), posée sur le
  cou-de-pied et le bout du patin. Elle s'accroche à l'os du pied (`LeftFoot`), origine à la cheville, avec la rotation
  XYZ (−24,14° ; −0,32° ; 179,28°) dans le repère de l'os ; la droite est son miroir sur `RightFoot`.
  `Jambiere` (528 triangles) s'arrête au-dessus de la cheville et reste sur le tibia.
  **Écart au cahier** : le § 6.3 prévoit une jambière d'une seule pièce ; le jeu doit accrocher une pièce de plus par jambe.
- **`G_Extension_Gauche` / `G_Extension_Droite`** (hors cahier, demande de Thibault) : arrêt couché sur le côté, dans l'axe de
  la jambière allongée (passe en travers reprise de volée). Une jambe allongée au ras du sol, l'autre genou au sol, buste
  couché de 36° du côté de la jambe, main du même côté au-dessus de la jambière. Finit en extension.
- **`G_Poteau_Gauche`** : la mitaine est posée au-dessus du bout de la jambière couchée, côté poteau (photo du gardien rouge).
- Limite : quand le patin est couché (papillon, poteau, extension), la botte suit le patin et s'écarte un peu du bas de la
  jambière : on voit un jour entre les deux.
- Contrôles des 15 actions : mains et chevilles sur leur cible (0,6 cm au pire), poignets ≤ 51°, rien sous le sol à
  plus de 0,5 cm (crosse, un instant, dans G_Gel_Palet).

## Sixième reprise du 13/11/2026 : jambière d'une seule pièce, plus près de la jambe ; G_Gel_Palet retiré

Retour de Thibault : les bottes s'ouvraient dans le papillon et les extensions (« c'est une seule et unique pièce »),
les jambières n'étaient pas encore collées aux jambes, et le mouvement où il se couche de face est à retirer.

- **La botte séparée est abandonnée** (`botte.glb` supprimé) : la jambière est de nouveau une seule pièce rigide sur le
  tibia, botte comprise (848 triangles, budget 3 000). On revient donc au § 6.3 du cahier : une pièce, un seul accrochage.
- La botte est dessinée pour tomber juste sur le patin quand le tibia penche comme dans `Pose_Gardien_Base`
  (25,5°). **En `Pose_T`, elle est donc relevée d'une dizaine de centimètres au-dessus du patin** : c'est voulu.
- Dans les poses où la jambe est couchée (papillon, poteau, extension), le patin garde la cheville de la pose de
  base : il reste sous la botte, rien ne s'ouvre. Le patin a alors la pointe vers l'avant et les roues vers l'extérieur.
- Jambière rapprochée de la jambe (7,5 mm de plus au genou, 12 mm au tibia) et rabats de mollet ajoutés de chaque
  côté, qui enveloppent la jambe sous le genou.
- **`G_Gel_Palet` est retiré** à la demande de Thibault (écart au cahier § 10.3). Il reste 14 actions : les 10 autres du
  cahier, plus `G_Poteau_Gauche/Droite` et `G_Extension_Gauche/Droite`.
- `G_Extension_Droite` : le bras gauche vrillait (captures q et q2 de Thibault). La mitaine suit maintenant l'épaule
  gauche, le bras garde la forme de la pose de base.
- Contrôles des 14 actions : mains et chevilles sur leur cible (0,6 cm au pire, G_Bouclier_Bas), poignets ≤ 51°,
  rien sous le sol à plus de 0,2 cm.

## Septième reprise du 13/11/2026 : G_Gel_Palet revient, mitaine posée sur le palet

- Précision de Thibault : pour geler le palet, le gardien pose sa mitaine dessus. `G_Gel_Palet` est donc remis
  (24 images, 0,80 s, bassin avance de 8 cm) : il tombe en papillon, se penche de 20° et pose la mitaine à plat au sol
  juste devant ses jambières, un peu à gauche ; le bouclier descend, la palette reste au sol. Finit mitaine posée.
  Il y a donc 15 actions : les 11 du cahier, plus `G_Poteau_Gauche/Droite` et `G_Extension_Gauche/Droite`.
- Le palet est supposé à environ (0,34 ; −0,54) m du bassin de la pose de base (0,34 m à sa gauche, 0,54 m devant) : c'est
  là que la mitaine se pose. Le jeu doit placer le gardien en conséquence ou accepter un petit décalage.

## Regard du gardien (pour le jeu)

Demande de Thibault : le gardien regarde le palet en permanence. Les animations ne connaissent pas la position du
palet : c'est au jeu de le faire, à l'affichage, en tournant les os `Neck` et `Head` vers le palet par-dessus
l'animation en cours (par exemple 40 % de la rotation sur `Neck`, 60 % sur `Head`, limitée à ±70° de côté et ±40° de
haut en bas, avec un lissage de 0,1 à 0,2 s). Les actions `G_*` ne donnent qu'un regard par défaut.

## Étape 6 validée par Thibault le 13/11/2026 (« oui ça ira pour la v1 ») : gardien, matériel et 15 animations.
