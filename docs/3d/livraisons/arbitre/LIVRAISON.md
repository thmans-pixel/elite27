# Étape 7 — arbitre (3D.md § 6.4, § 10.4)

Première partie livrée le 13/11/2026 : le corps, sa tenue, le casque et `Pose_Arbitre`. En attente de validation.
Les gestes officiels (`A_*`, § 10.4) viennent ensuite.

## Fichiers

| Fichier | Contenu |
|---|---|
| `arbitre.glb` (4,1 Mo) | corps `Arbitre` + squelette `Squelette` + `Pose_T`, `Pose_Arbitre`, `Main_Prise`, `Main_Ouverte`, `Main_Poing` |
| `casque-arbitre.glb` | `Casque_Arbitre` : le casque du joueur sans visière, noir ; s'accroche à `Prop_Tete` sans rotation |
| `textures/` | `arbitre_couleur.jpg`, `arbitre_normales.png`, `arbitre_orm.png` (2048), `casque_arbitre_couleur.jpg` (1024) |
| `arbitre.blend` | tout en place en `Pose_Arbitre`, avec `Tete_A` pour juger (non exportée) |
| `controle/` | `arbitre_pose.png` (face, profil, dos, trois quarts), `arbitre_pose_t.png` |
| `scripts/` | `01_arbitre.py → 02_exporter.py` |

## Chiffres

- `Arbitre` : 17 362 triangles (budget 18 000), dont 48 pour le sifflet. `Casque_Arbitre` : 780 (budget 2 500).
- Squelette identique à celui du joueur (55 os, écart 0) ; 4 influences au plus par sommet ; mêmes UV que le joueur.
- Les deux fichiers se rouvrent dans une scène vide. Pas de Draco.

## Ce qui est fait

- **Corps** : celui du patineur validé (mêmes os, mêmes poids, mêmes UV), sans crosse.
- **Tenue** peinte dans la texture (elle n'est pas teintable, pas de masque) : maillot à rayures verticales noires et
  blanches, continues d'un îlot à l'autre (22 autour du torse, 8 autour de chaque manche), col, épaules, poignets et bas
  du maillot noirs, brassard rouge orangé sur chaque bras au-dessus du coude, pantalon noir.
- **Sifflet à doigts** : petit sifflet métallique posé sur l'index et le majeur droits, soudé au corps, il suit l'index.
- **Casque** noir sans visière, pièce à part. La tête est l'une des quatre de `tetes.glb`, comme pour les joueurs.
- **Pose_Arbitre** : debout, pieds écartés de 30 cm, genoux à peine fléchis, bras le long du corps.

## Écarts et limites

1. Mains nues (demande de Thibault) : ce sont les gants du patineur affinés autour des os et peints couleur peau. Les doigts restent simples, sans ongles ni plis.
2. Les rayures suivent la forme du corps : elles s'élargissent un peu sur les flancs et se raccordent sous un
   empiècement noir aux épaules.
3. Le casque est livré à part (`casque-arbitre.glb`) et non dans `arbitre.glb`, comme pour les joueurs et le gardien.
4. Sifflet très simple (quatre petits blocs), prévu pour être vu de loin.
5. Aucune marque, aucun logo, pas d'écusson de fédération.

Corps et tenue validés par Thibault le 13/11/2026 (« oui c bon »), puis gants retirés à sa demande.

## Gestes officiels (§ 10.4), livrés le 13/11/2026, en attente de validation

`../animations/anim-arbitre.glb` (2,2 Mo) : squelette seul + 18 actions de 60 images (2 s à 30 images/s). Chacune part de
`Pose_Arbitre` et y revient (écart 0,4° au pire). Seuls les os sont animés, le bassin ne bouge pas à l'horizontale, les
patins restent à plat au sol. `anim-arbitre.blend` : l'arbitre habillé avec les actions. Planches et vidéos au ralenti
dans `controle/anim/`. Scripts : `cles_arbitre.py` (les poses, faciles à corriger), `03_animer.py`, `04_exporter_anim.py`.

| Action | Ce qui est fait |
|---|---|
| `A_Bras_Leve` | bras gauche levé à la verticale, main ouverte |
| `A_Accrocher` | deux poings tendus devant, ramenés vers le ventre, deux fois |
| `A_Trebucher` | penché, la main droite frappe deux fois la jambe droite sous le genou |
| `A_Cinglage` | le tranchant de la main droite frappe deux fois l'avant-bras gauche |
| `A_Charge` | les poings tournent l'un autour de l'autre, deux tours |
| `A_Balustrade` | le poing droit frappe deux fois la paume gauche |
| `A_Dos` | main gauche ouverte poussée devant le plexus, doigts vers le haut |
| `A_Obstruction` | avant-bras croisés devant la poitrine, poings fermés |
| `A_Crosse_Haute` | deux poings l'un au-dessus de l'autre, au-dessus de l'épaule droite |
| `A_Coup_Coude` | bras gauche levé plié, la main droite touche le coude gauche |
| `A_Retenir` | la main droite serre le poignet gauche devant la poitrine |
| `A_Meconduite` | les deux mains sur les hanches |
| `A_Tir_Penalite` | bras croisés au-dessus de la tête |
| `A_But` | bras gauche tendu droit devant, main ouverte |
| `A_Annulation` | deux bras écartés à l'horizontale, paumes vers le sol |
| `A_Temps_Mort` | main gauche à plat sur le bout des doigts de la main droite (T) |
| `A_Designe` | bras gauche tendu sur le côté, tête tournée du même côté |
| `A_Engagement` | penché, la main gauche avance puis s'ouvre vers le sol (pas de palet dans l'animation) |

Limites : gestes faits d'après le texte du cahier, sans image de référence, à faire relire par un arbitre ; le côté
(gauche ou droite) est un choix de ma part ; le sifflet n'est pas porté à la bouche ; `A_Bras_Leve`, `A_But`, `A_Designe`
et `A_Dos` ne sont pas répétés (gestes tenus).

Mains nues et 18 gestes validés par Thibault le 13/11/2026 (« oui c bien »). Relecture par un arbitre du club encore à faire.
