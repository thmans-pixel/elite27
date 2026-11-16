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
| G_Poteau_Gauche | 12 | 0,40 s | bassin se déplace de 27 cm vers sa gauche | garde du poteau, version du 15/11 : roues et épaule contre le poteau, mitaine sur la jambière (tenue) |
| G_Poteau_Droite | 12 | 0,40 s | bassin se déplace de 27 cm vers sa droite | garde du poteau, version du 15/11 : miroir de la gauche, bouclier sur la jambière (tenue) |
| G_Poteau_Gauche_Droite | 24 | 0,80 s | bassin se déplace de 76 cm vers sa droite | passage du poteau gauche au poteau droit (finit dans la tenue de droite, origine à décaler de 22 cm) |
| G_Poteau_Droite_Gauche | 24 | 0,80 s | bassin se déplace de 76 cm vers sa gauche | retour du poteau droit au poteau gauche (finit dans la tenue de gauche, origine à décaler de 22 cm) |
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
  **Remplacé le 15/11/2026** (Thibault : « la mitaine plus près du poteau […] et c'est parfait ») par `g_poteau_gauche()` dans
  `scripts/cles_gardien.py` : jambière gauche dressée sur sa tranche le long de la ligne, patin couché, roues contre la face
  intérieure du poteau ; bassin rapproché du poteau de 27 cm, buste penché, épaule gauche à 2 cm du poteau ; mitaine posée
  sur la jambière, contre les côtes et tout près du poteau. Essayé devant la nouvelle cage (`scripts/essai_poteau.sh`) :
  aucun sommet dans les tubes, palette au sol. Pour que les roues touchent le poteau, le jeu doit placer le gardien :
  dans l'essai, l'origine du gardien est à 0,11 m du centre de la cage vers sa gauche (+X) et 0,094 m derrière la ligne
  de but (−Z du glTF, cage ouverte vers +Z) ; c'est l'animation qui amène ensuite le bassin vers le poteau.
  Version d'avant : `work/avant_poteau/`.
- **`G_Poteau_Droite`** refait le 15/11/2026 en miroir (`poteau_droite_tenue()`) : roues du patin droit contre le poteau droit,
  épaule droite penchée vers lui, bouclier posé sur la jambière couchée ; la crosse reste dans la main droite, palette au sol
  devant lui, le bout du manche dépasse à l'extérieur du poteau. La mitaine reste levée, ouverte. Placement de l'essai :
  origine du gardien à 0,11 m du centre de la cage vers sa droite (−X) et 0,093 m derrière la ligne de but. Écart connu :
  l'épaule droite ne touche pas le poteau, c'est le haut du bras qui passe juste devant lui (6 cm plus à l'extérieur).
- **`G_Poteau_Gauche_Droite`** (hors cahier, demande de Thibault du 15/11, 24 images) : part de la tenue du poteau gauche ;
  la jambe droite se tend jusqu'au poteau droit (roues au poteau à l'image 12), puis le corps glisse et reprend la garde à
  droite. L'animation déplace le bassin de 76 cm ; à la fin, le gardien est dans la pose de `G_Poteau_Droite` avec son
  origine décalée de 22 cm vers sa droite : le jeu doit déplacer le gardien de 22 cm (−X) en fin d'animation, comme pour
  `G_Pas`. Contrôlé image par image devant la cage (`scripts/essai_passage.sh`) : rien dans les tubes ni sous le sol.
- **`G_Poteau_Droite_Gauche`** (hors cahier, demande de Thibault du 15/11, 24 images) : le retour, en miroir. Part de la
  tenue du poteau droit ; la jambe gauche se tend jusqu'au poteau gauche (roues au poteau à l'image 12), puis le corps suit.
  Finit dans la pose de `G_Poteau_Gauche`, origine à décaler de 22 cm vers sa gauche (+X). Contrôlé image par image
  (`ACTION=G_Poteau_Droite_Gauche scripts/essai_passage.sh`) : rien dans les tubes ni sous le sol. Il y a donc 17 actions.
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

## Reprise du 15/11/2026 (soir) : dos du maillot, crosse au sol, butées d'articulation

Retours de Thibault : « à droite la position du coude ne va pas », « la palette doit protéger la zone au sol entre la
botte du patin contre le poteau et l'autre jambe », « le gardien semble avoir un sac à dos sous son tee-shirt ».

- **Dos du maillot (modèle `gardien.glb` et `gardien-leger.glb` refaits).** Le corps était épaissi autant derrière que
  devant : le dos dépassait de 5,5 cm celui du joueur (buste de 37 cm d'épaisseur). Le plastron n'épaissit plus que le
  devant : le dos est à 1 cm de celui du joueur (buste de 32 cm à 1,30 m). Les poids du dos et du dessus des épaules
  sont adoucis : la plaque rigide du dos ne fait plus de marche avec les épaules. Mêmes 55 os, mêmes sommets
  (8 835), mêmes UV et textures ; 887 sommets déplacés (4,7 cm au plus), poids changés sur 1 463 sommets.
  `scripts/01_corps.py` fait la correction ; `scripts/01b_reporter_corps.py` la reporte dans `work/04_poses.blend` et
  `work/06_anim.blend` sans refaire les cuissons du matériel. Ancienne version : `work/avant_dos/`.
- **Crosse.** Dans les deux gardes, la palette est à plat au sol entre la jambière couchée et le patin planté :
  à gauche du talon (0,00 ; −0,24) vers le patin droit, à droite du talon (−0,03 ; −0,43) vers le patin gauche
  (repère du gardien). Nouveaux canaux `cr_on, cr_talon, cr_cap, cr_phi` : on vise la palette, la main suit.
- **Bras droit de `G_Poteau_Droite`.** Coude plié à 102°, sous l'épaule, sans vrille (19°) ; l'épaule du côté haut est
  abaissée de 20° dans les deux gardes (`leb`, `reb`).
- **Butées.** `06_animer.py` mesure à chaque image le pli du coude (5 à 150°), la vrille du bras (90° au plus), le bras
  en arrière (45°) ou levé (80°) et le poignet, et écrit `articulations <action> : dans les limites | HORS LIMITE …`.
  Le poignet a une vraie butée à 58° : au-delà, la main revient vers l'axe de l'avant-bras. Les quatre actions de
  poteau sont « dans les limites ». Pendant un passage, la palette se lève de 10 cm et pivote par l'arrière.
- Contrôles : rien dans les tubes de la cage, image par image, pour les quatre actions ; `controle.mjs` : « Conforme »
  pour `gardien.glb`, `gardien-leger.glb` (4 946 triangles), les cinq pièces et `anim-gardien.glb` (17 actions, 1,37 Mo).
- **Limites connues.** (1) La vrille des tibias (jambière couchée, papillon) dépasse l'anatomie et n'est pas contrôlée :
  la jambière rigide la cache. (2) `G_Bouclier_Bas` : coude gauche tendu à 0° à l'image 8, non corrigé. (3) Le maillot
  garde sa coupe droite dans le dos, avec un ourlet : c'est celle du joueur. (4) Les 13 autres actions n'ont pas été
  recalculées (la butée du poignet ne les touche pas : 51° au plus). (5) Les pièces (jambière, mitaine, bouclier,
  crosse, casque) n'ont pas été modifiées mais `05_exporter.py` les a réécrites : jambière, mitaine et bouclier pèsent
  364 octets de plus qu'avant (différence non analysée ; contrôle « Conforme »).

## Reprise du 16/11/2026 : mouvements impossibles, jambes

Contrôle : `scripts/limites.py` (sur `anim-gardien.blend` ou `work/06_anim.blend`) mesure hanche, genou et cheville à
chaque image des 17 animations et dit « possible » ou « IMPOSSIBLE ». Résultat : 0 dépassement.

Plages (degrés, mêmes à gauche et à droite) : hanche vers l'avant 120 / arrière 20, écartée 60 / resserrée 30, tournée 50 ;
genou plié 0 à 150 (vers l'arrière seulement), jeu sur le côté 10 et rotation du tibia 30 quand il est plié à 60° ou plus ;
cheville relevée 25 / pointée 40, ouverte ou fermée 20, roulée 25.

- L'os du tibia porte la jambière : sa vrille (`ltib` / `rtib`) est la jambière qui tourne autour de la jambe (décision de
  Thibault, le mollet est caché). Le pied, lui, reste sur la vraie jambe : butée de cheville dans `06_animer.py`
  (`butee_cheville`), qui cherche aussi une orientation hors du sol.
- Réglages : papillon, pieds 1,5 cm plus en arrière ; poteaux, bassin tourné de 13° (buste retourné d'autant), bassin 4 cm
  plus près du poteau, cheville couchée 2,5 cm plus haut, jambière tournée de 66° au lieu de 90°.
- **Placement aux poteaux changé** : origine du gardien en X = ±0,09 (au lieu de ±0,11), 0,102 m derrière la ligne (au lieu
  de 0,094). Passages : bassin 80 cm, origine à décaler de 18 cm à la fin (au lieu de 22).
- Épaule gauche à 2,6 cm du poteau en garde gauche. Patin jusqu'à 0,6 cm sous le sol, jambière 1,1 cm pendant un passage.
- Pas encore contrôlés : buste, tête, épaules, doigts. Les bras le sont par `06_animer.py` (`G_Bouclier_Bas` : coude
  gauche tendu à l'image 8, non corrigé).
- Seul `animations/anim-gardien.glb` change (et `anim-gardien.blend`). Version d'avant : `work/avant_limites/`.

### Suite du 16/11/2026 : buste, tête et bras

`scripts/anatomie.py` (mesures et plages, partagé) ; `scripts/limites.py` contrôle maintenant tout le corps : 0 dépassement
sur les 17 animations.

Plages ajoutées (degrés) : épaule haussée −15 à 40, avancée −25 à 35 ; bras en arrière 45, croisé devant 45 ; bras tourné
vers l'intérieur 95 / vers l'extérieur 80 (lu depuis le bras pendant, coude pliant vers l'avant) ; coude 0 à 150 ;
avant-bras de −165 (paume retournée) à +25 par rapport à la pose en T ; poignet 60 ; buste penché en avant −30 à 75, sur le
côté 35, tourné 45 ; tête en avant ou en arrière 60, sur le côté 40, tournée 75.

Dans `06_animer.py`, à chaque calcul :
1. un bras hors limites voit sa tenue relâchée (main qui suit l'avant-bras, coude déplacé) ;
2. s'il reste impossible, il est guidé articulation par articulation de la dernière image possible à la suivante ;
3. la palette ne passe jamais sous le sol (le bras se lève d'un rien) ;
4. le bilan « anatomie <action> : possible » est imprimé pour chaque action.

Changements visibles :
- Garde gauche : la crosse était tenue bras tourné de 143° et avant-bras vrillé de 152°. Nouvelle tenue (talon −0,35 ; −0,30,
  cap 195, manche incliné de 20°) : bras tourné de 42°, poignet 10°. Palette au sol du milieu jusqu'au patin planté.
- Garde droite : talon 0,36 ; −0,44, cap 10 ; le manche part vers l'arrière, dans l'ouverture de la cage.
- Entrées en garde et passages : la palette glisse au ras du sol jusqu'à sa nouvelle place (`crosse_glisse`, `crosse_passage`
  dans `cles_gardien.py`) au lieu de tournoyer en l'air ; dans les passages elle pivote par l'avant.
- Buste couché de 33° au lieu de 36° aux poteaux. Mitaine haute, bouclier haut, gel du palet, extension droite : bras relâchés
  de quelques degrés. `G_Bouclier_Bas` : le coude gauche n'est plus tendu à l'envers.
- Rien ne traverse les tubes de la cage dans les quatre animations de poteau.
- Épaule à 3,0 cm du poteau en garde gauche, 4,7 cm en garde droite.

### Suite du 16/11/2026 (soir) : bouclier et crosse aux poteaux (demande de Thibault)

- **Garde droite** : le bouclier est devant le buste côté poteau, au-dessus de la botte de la jambière couchée (centre à
  17 cm du poteau, bas du bouclier à 45 cm du sol) ; la palette est à plat au sol entre les jambes (talon −0,08 ; −0,34,
  cap 0, manche droit). Le bras ne part plus dans le dos.
- **Garde gauche** : la main droite n'atteint pas la botte de la jambe dressée (buste couché vers le poteau, il manque
  environ 10 cm). Crosse couchée au sol (accord de Thibault) : le manche barre le trou entre les jambes, le bouclier est
  bas, devant le genou de la jambière couchée (talon −0,60 ; −0,55, cap 150, manche incliné de 55°).
- Entrées en garde : la palette glisse au sol et arrive en même temps que le corps (`crosse_glisse`).
- Passages : dans `G_Poteau_Gauche_Droite`, le bras droit reprend à l'envers le chemin de `G_Poteau_Droite_Gauche`
  (`BRAS_INVERSE` dans `06_animer.py`). Limite connue : images 13 à 15, le bouclier frôle le poteau droit (12 sommets au plus).
- `scripts/limites.py` : 0 dépassement sur les 17 animations. Épaule à 3,0 cm du poteau à gauche, 0,2 cm à droite.

### Suite du 16/11/2026 (nuit) : tenues aux poteaux refaites sur les indications de Thibault

Remplace les tenues de la section précédente.
- **Garde droite** : crosse plaquée au sol, le manche couché le long de la ligne entre les deux jambes, palette pointée
  vers l'avant (talon 0,40 ; −0,32, cap 285, manche couché de 64°). Bouclier en bas contre le poteau, devant la botte de la
  jambière couchée : de 1 à 38 cm du sol.
- **Garde gauche** : bras droit plié naturellement (coude 99°, poignet 20°), bouclier devant le buste ; palette au sol
  pointée vers le poteau gauche, devant la jambière couchée (talon 0,05 ; −0,55, cap −30).
- `scripts/limites.py` : 0 dépassement. Cage : rien dans les deux gardes ; pendant les passages, 3 sommets du corps au
  contact du poteau droit (0 mm) et la crosse touche le poteau gauche à l'image 13 du retour.

### Suite du 16/11/2026 : mouvements parasites dans les passages

- `scripts/saccades.py` mesure, image par image, la vitesse de chaque os et des mains, pieds, tête, bassin.
- Avant : la vitesse du corps sautait à chaque clé (bassin 7 → 3 cm par image) et la main droite avançait par à-coups.
- `06_animer.py`, pour les deux passages : lissage dans le temps (`LISSE`), et bras droit conduit en un seul geste, tenue de
  départ → crosse portée comme dans la pose de base → tenue d'arrivée (`BRAS_PORTE`). La levée de sécurité de la palette
  est faite avant le lissage. Main droite : 13 cm par image au plus, sans à-coup.
- Conséquence du lissage : une jambière passe 1,4 cm sous le sol à l'image 5 (1,1 avant).
- Non traité : les arrêts nets des genoux au sol dans le papillon et ses dérivés (choc voulu), `G_Mitaine_Haut` (retour du bras).

### Suite du 16/11/2026 : bouclier sur le patin, contre le poteau droit (demande de Thibault)

Remplace la tenue droite de la section « tenues aux poteaux refaites ».
- **Garde droite** : bouclier reculé de 8 à 14 cm vers le patin droit, collé au poteau (boîte dans le repère du gardien :
  x −0,77 à −0,33 ; y −0,40 à −0,11 ; z 0,01 à 0,38 ; le patin va de y −0,24 à 0,08 et monte à 0,17). Crosse plaquée au
  sol, palette vers l'avant (talon 0,37 ; −0,40, cap 270, manche couché de 64°). Coude relevé côté cage (`DAUTO 0`,
  pôle 0,5 ; 0 ; 0,3) : avec le coude dans le prolongement de la main, le bras entrait dans le poteau.
- Entrées en garde : la crosse arrive à sa place à 70 % du mouvement (`CGT 0.7`) ; bras lissé dans `G_Poteau_Droite`
  (`LISSE`), sinon le coude sautait de 63° à la dernière image.
- `scripts/ou_patin.py` : boîtes des patins, jambières, bouclier à la dernière image d'une action.
- Contrôles : 0 dépassement, rien dans la cage (gardes et passages), aucun à-coup mesuré dans les quatre animations de poteau.
