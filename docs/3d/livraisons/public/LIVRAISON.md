# Étape 10 — public (3D.md § 6.6, § 10.5)

Livrée le 13/11/2026, en attente de validation.

## Fichiers

| Fichier | Contenu |
|---|---|
| `public.glb` (0,9 Mo) | `Squelette` (55 os, le même que les joueurs) + `Spectateur_A` à `_D` + `P_Assis`, `P_Applaudit`, `P_Debout_Bras_Leves`, `P_Kop_Drapeau` |
| `../animations/anim-public.glb` | le squelette seul avec les quatre actions |
| `textures/public_couleur.png` | 512, partagée : cases de couleur (4 peaux, 4 cheveux, haut, bas, coiffe en gris clair neutre, chaussures) |
| `textures/public_masque.png` | 512 : rouge = haut, vert = bas, bleu = coiffe (bonnet, casquette) |
| `public.blend`, `controle/public.png` | fichier de travail ; planche des quatre spectateurs (assis, profil, applaudit, se lève, debout) avec des teintes d'essai |
| `scripts/` | `01_public.py` (maillages, texture, animations), `02_exporter.py`, `rendu_public.py` |

## Chiffres

- Triangles : A 450, B 488, C 466, D 500 (budget 600 chacun). 4 influences au plus par sommet. Pas de Draco.
- `P_Assis` 120 images (4 s, boucle), `P_Applaudit` 30 images (1 s, boucle, trois claquements), `P_Debout_Bras_Leves` 60 images
  (2 s, part de la pose assise et y revient). 30 images/s, seuls les os sont animés.

## Les quatre spectateurs

A : cheveux courts bruns. B : cheveux longs blonds, plus mince. C : plus fort, bonnet. D : casquette, manches courtes.
Le jeu teinte le haut, le bas et la coiffe par le masque (une couleur par spectateur posé), ce qui multiplie les variantes.

## Où poser un spectateur

Il regarde vers +Z glTF (−Y Blender). Son origine est sur la marche où il pose les pieds, au pied de la contremarche de
son siège ; le siège est 0,42 m plus haut et derrière lui (gradins de la salle : 0,42 m de haut, 0,85 m de profondeur).
Il faut donc toujours jouer une des trois actions : sans animation il est debout bras en croix, 10 cm au-dessus du sol.

## Écarts et limites

1. Personnages faits de tubes à peu de côtés, sans visage : prévus pour être vus de loin.
2. Les quatre partagent le même squelette, donc la même taille ; pas d'enfant.
3. En se levant, le spectateur avance de 43 cm (il se met debout sur sa marche).
4. Les deux boucles ne reviennent pas à la même pose : passer de l'une à l'autre demande un fondu dans le jeu.

## Drapeaux du kop (ajout demandé par Thibault le 13/11/2026)

| Fichier | Contenu |
|---|---|
| `drapeau.glb` | `Drapeau` : hampe de 1,70 m et toile de 110 × 72 cm, 156 triangles, deux faces visibles, 15 formes (`F00` à `F14`) et l'action `Drapeau_Kop` ; s'accroche à `Prop_MainDroite` sans rotation, comme la crosse |
| `textures/drapeau_couleur.png`, `drapeau_masque.png` | 512 : toile gris clair à plis peints ; masque rouge = fond, vert = les deux bandes (à teinter aux couleurs de l'équipe) |
| `drapeaux/<club>.png` | 10 textures toutes prêtes, même dépliage : fond de la couleur du maillot à domicile, deux bandes de la seconde couleur, écusson inventé au centre |
| `controle/drapeaux.png` | les dix drapeaux ; dernière ligne de `controle/public.png` : le kop |

`P_Kop_Drapeau` (hors cahier) : boucle de 60 images (2 s), debout sur sa marche, le bras droit balance le drapeau de
44° de chaque côté, le bras gauche levé, petit rebond. Elle va à n'importe lequel des quatre spectateurs.

**Toile souple** (demande de Thibault) : la toile a été simulée comme un tissu, accrochée à la hampe et entraînée par le
bras pendant `P_Kop_Drapeau` (5 boucles de mise en route, puis une boucle enregistrée et refermée). Le résultat est
stocké dans le drapeau : 15 formes, une toutes les 4 images, que l'action `Drapeau_Kop` (60 images, boucle) enchaîne.
Dans le jeu : jouer `Drapeau_Kop` sur le drapeau **en même temps et en phase** avec `P_Kop_Drapeau` sur le spectateur
(dans Three.js ce sont des « morph targets », l'action anime leurs poids). Script : `scripts/03_drapeau_souple.py`,
à relancer après `02_exporter.py`.

Limites : le mouvement du tissu est enregistré, pas calculé en direct : il ne vaut que pour `P_Kop_Drapeau` (sans
l'action, la toile reste dans sa forme figée) ; la toile s'étire un peu trop par moments (jusqu'à 54 % sur une arête) et
se replie parfois à travers la hampe ; l'écusson se lit à
l'endroit vu de la piste et à l'envers vu de derrière ; pas d'action pour se lever avec le drapeau (fondu dans le jeu).

Effet amplifié à la demande de Thibault (13/11/2026) : balancement passé de 28° à 44°, toile agrandie (110 × 72 cm),
tissu plus mou et plus freiné par l'air. La version d'avant est gardée dans `work/avant_amplification/`.

Version amplifiée retenue et public validé par Thibault le 13/11/2026 (« la 2 c bon »).
