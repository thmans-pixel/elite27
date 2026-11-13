# Livraison — Étape 1 : patineur, maillage et squelette (3D.md § 4, § 5, § 11)

Livrée le 13/11/2026, reprise le même jour d'après les retours de Thibault (posture, mains, formes). **Validée par Thibault le 13/11/2026** (« vas y »). Les os ne changent plus.

Corps de départ : `Meshy_AI_RollerHockeyPlayer_1113003055_image-to-3d-texture.glb` (régénéré le 13/11 ; les anciens corps sont écartés, voir `BILAN_SOURCES.md`).

## Fichiers

| Fichier | Contenu |
|---|---|
| `joueur.glb` | corps `Joueur` + squelette `Squelette` + 5 actions (4,1 Mo avec les textures de l'étape 2) |
| `joueur.blend` | fichier de travail ; collection `Livraison` (exportée) et `References` (non exportée : source haute définition, tête découpée `Tete_Source` et `Tete_Ref` pour l'étape 3) ; actions d'essai `Essai_Bras_Leves`, `Essai_Accroupi` |
| `controle/joueur_vues.jpg` | face, profil, dos, trois quarts, fil de fer, gros plans de la main |
| `controle/joueur_squelette.jpg` | os visibles à travers le corps (face, profil, main, pied) |
| `controle/joueur_poses.jpg` | Pose_Patinage (avec une crosse d'essai), bras levés, accroupi |
| `controle/joueur_mains.jpg` | Main_Prise sur un manche de 3 cm (4 vues), Main_Ouverte, Main_Poing |
| `scripts/` | tout se reconstruit : `01_preparer.py` → `02_squelette.py` → `03_poses.py` → `04_exporter.py`, lancés par `blender_sans_interface.sh` (mémoire plafonnée à 12 Go) ; `verifier_glb.py` hors Blender |

## Chiffres

- Triangles : **17 314** (budget 18 000), dont ~420 pour les platines et les roues.
- Os : **55** = 52 qui déforment (noms et hiérarchie du § 4) + 3 attaches sans poids (`Prop_MainDroite`, `Prop_MainGauche`, `Prop_Tete`).
- Peau : 4 influences au plus par sommet, poids normalisés, aucun sommet sans poids.
- Actions : `Pose_T`, `Pose_Patinage`, `Main_Prise`, `Main_Ouverte`, `Main_Poing` (une image chacune ; les poses de main ne touchent que les doigts).
- Textures : aucune à cette étape (matière grise provisoire `M_Joueur`) — c'est l'étape 2.
- Repère glTF : Y en haut, le joueur regarde vers +Z ; origine au sol entre les patins ; transformations neutres. Boîte : (−0,83 ; 0 ; −0,16) → (0,82 ; 1,59 ; 0,18). `verifier_glb.py` : **conforme**.

## Convention d'orientation des os (à garder pour le gardien et l'arbitre)

- Tronc, cou, tête, jambes : axe Z local vers l'avant ; pieds et orteils : Z vers le haut.
- Épaules, bras, mains, doigts : Z vers le haut (dos de la main) ; fermer un doigt = rotation négative autour de X local.
- `Prop_Main*` : au creux de la paume, axe Y le long du manche (du petit doigt vers l'index). `Prop_Tete` : base du crâne, Y vers le haut.

## Écarts au cahier, et pourquoi

1. **Topologie** : le maillage est réduit par fusion d'arêtes (triangles et quadrilatères mêlés), pas refait en boucles propres. L'outil de remaillage en quadrilatères de Blender (QuadriFlow) produit des sommets invalides sur ce corps avec Blender 5.2. Les déformations restent correctes (voir les essais), mais une vraie retopologie à la main reste possible plus tard, avant l'étape 2 de préférence (les UV en dépendent).
2. **Bras allongés de 18 cm et manches amincies de 28 %** (demande de Thibault : bras trop larges). Détail de l'allongement : **bras allongés de 18 cm** (manche, entre l'épaule et le poignet ; gants inchangés) : chez Meshy, épaule → bout des doigts = 0,33 × la taille au lieu d'environ 0,42, et le joueur ne pouvait pas tenir la crosse à deux mains palette au sol.
3. **Patins** : Meshy n'avait mis que deux roues en anneau ; elles sont remplacées par une platine et **quatre roues de 76 mm en ligne**, rigides sur l'os du pied (le bas de la chaussure aussi).
4. **Taille** : échelle 0,95 → sommet des cheveux à 1,81 m patins aux pieds ; avec le casque (étape 3) on sera à ~1,83 m.
5. **Tête** séparée sous le col (le cou du corps s'arrête dans le col) ; elle est gardée en référence dans le .blend pour l'étape 3.
6. **Doigts** : dans le maillage Meshy, les doigts du gant se touchent ; les os des doigts sont posés sur quatre couloirs réguliers et les poids des mains calculés d'après la distance aux phalanges.
7. **Pose_Patinage** (refaite d'après les photos `models3D/2026-11-13_02-*.png` et les consignes de Thibault) : pieds écartés de 56 cm, genoux fléchis vers l'avant, buste penché ~30° dos droit, épaules de niveau, tête droite ; main du haut **paume vers le bas** sur le bout du manche devant la hanche gauche, main du bas **paume vers le haut** ~32 cm plus bas ; les deux paumes sont sur l'axe du manche ; crosse d'essai d'environ 1,45 m, palette au sol devant à droite. À reprendre quand la vraie crosse existera (étape 4).
8. Les trous ouverts du maillage Meshy (cou, bords des gants) sont bouchés, et deux faces en double retirées à l'export.
9. **Tissu lissé** (demande de Thibault : vagues et irrégularités du maillot) : lissage fort du maillot et du pantalon avant réduction, puis une passe légère après ; gants et chaussures gardent leur détail. Les petits plis ont disparu avec les vagues.
10. **Gants reproportionnés** (demande de Thibault) : largeur et épaisseur réduites de 15 % (≈ 13 cm de large), longueur inchangée ; les os des doigts et du pouce suivent.
11. Les UV sont refaites à l'étape 2 (`LIVRAISON_ETAPE2.md`).

## Points à regarder en priorité

- Les plis du pantalon ample aux genoux et à l'entrejambe quand les jambes sont très fléchies (planche des poses, accroupi).
- La prise de la main sur le manche (planche des mains).
