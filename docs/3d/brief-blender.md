# Élite 27 — cahier de production 3D pour Blender

Ce document s'adresse à l'assistant qui travaille dans Blender. Il décrit **tout ce qu'il faut produire en 3D**
pour le jeu Élite 27, dans quel ordre, sous quelle forme, et comment chaque livraison est contrôlée.
Lis-le en entier avant de commencer, puis avance **une étape à la fois** : à la fin de chaque étape, montre les
images de contrôle demandées et attends la validation de Thibault avant de passer à la suivante.

## 1. Le projet en deux phrases

Élite 27 est un jeu de roller hockey en 3D qui tourne dans un navigateur (Three.js, WebGL). On y joue des matchs
de la Ligue Élite française 2026-2027, vus par une caméra de retransmission placée en hauteur sur le côté de la
piste, avec des ralentis rapprochés après les buts.

## 2. Direction artistique

**Semi-réaliste stylisé.** Proportions humaines réalistes, matériel de roller hockey crédible, matières lisibles ;
mais des formes un peu simplifiées, des couleurs franches et des visages sobres. Ni photoréalisme, ni dessin animé.

- Les joueurs sont surtout vus de loin (ils mesurent 60 à 150 pixels à l'écran) : **la silhouette, les couleurs
  d'équipe et le numéro doivent se lire d'abord**. Les détails fins servent aux ralentis.
- Roller hockey, **pas hockey sur glace** : patins à quatre roues en ligne, pas de lames ; **pantalon long de
  roller aux couleurs du club**, ample, qui descend jusqu'aux patins (pas de culotte courte ni de bas apparents) ;
  sol en dalles sportives, pas de glace ; palet de roller. Le gardien porte des jambières, une mitaine et un bouclier comme sur glace.
- Aucune marque réelle, aucun logo officiel de club, aucun sponsor réel. Marques de matériel **inventées**
  (voir § 9) et écussons **inventés** (voir § 7).

## 3. Contraintes techniques (à respecter partout)

| Sujet | Règle |
|---|---|
| Format livré | glTF binaire **.glb**, un fichier par livraison. Garde aussi le **.blend** de travail. |
| Unités | Mètres, échelle 1. Toutes les transformations appliquées (échelle 1, rotation 0) avant export. |
| Axes | Export glTF standard : Y vers le haut. Les personnages regardent vers **+Z du glTF** (c'est-à-dire −Y dans Blender), comme les exports Meshy et Mixamo. |
| Origine | Personnages : au sol, entre les deux patins. Objets tenus : au point de prise (précisé pour chacun). Salle : au centre de la piste, au niveau du sol. |
| Maillage | Triangles ou quadrilatères propres, pas de faces doubles, pas de sommets isolés, normales cohérentes. Un seul maillage par personnage, plus les pièces séparées listées. |
| Peau | Quatre influences par sommet au plus, poids normalisés. |
| Matières | PBR métal/rugosité (Principled BSDF simple). Pas de nœuds procéduraux : tout est cuit en textures. |
| Textures | Carrées, puissance de deux. Couleur en sRGB ; normales, rugosité, métal et masques en linéaire. JPEG pour la couleur, PNG pour les masques et les normales. |
| Compression | Aucune (ni Draco ni Meshopt). |
| Noms | En ASCII, sans espace ni accent : `Joueur`, `Casque`, `Crosse`… Les noms d'os et d'actions sont **imposés** (§ 4 et § 10). |
| Cibles | PC et ordinateurs portables récents. Une scène de match montre jusqu'à 30 personnages animés. |

### Budgets

| Élément | Triangles | Textures |
|---|---|---|
| Patineur (corps, gants, patins, sans tête ni casque) | 18 000 au plus | 2048 : couleur neutre, normales, rugosité, masque de zones |
| Tête (chaque variante) | 3 000 | 1024 |
| Casque avec visière ou grille | 2 500 | 1024, masque de zone |
| Gardien (corps et plastron, sans jambières) | 22 000 | 2048 |
| Jambière de gardien (une) | 3 000 | 1024 partagée avec mitaine et bouclier |
| Arbitre | 18 000 | 2048 |
| Crosse de joueur, crosse de gardien | 1 200 chacune | 512 |
| Palet | 200 | 256 |
| Version allégée de chaque personnage (banc, tribune proche) | 5 000 | mêmes textures |
| Spectateur (chaque variante) | 600 | 512 partagée |
| Salle complète | 150 000 | 4 à 6 textures de 2048, lumière cuite |

## 4. Squelette imposé

Un **seul squelette** pour le patineur, le gardien et l'arbitre : mêmes os, mêmes noms, même hiérarchie, mêmes
orientations. Les animations doivent pouvoir passer de l'un à l'autre.

Noms à la façon Mixamo, sans préfixe. Pose de repos : **bras en T**, paumes vers le bas, jambes droites, pieds
parallèles, à plat (le patin fait partie du pied).

```
Hips
├─ Spine ─ Spine1 ─ Spine2
│   ├─ Neck ─ Head
│   ├─ LeftShoulder ─ LeftArm ─ LeftForeArm ─ LeftHand
│   │     ├─ LeftHandThumb1 ─ LeftHandThumb2 ─ LeftHandThumb3
│   │     ├─ LeftHandIndex1 ─ LeftHandIndex2 ─ LeftHandIndex3
│   │     ├─ LeftHandMiddle1 ─ LeftHandMiddle2 ─ LeftHandMiddle3
│   │     ├─ LeftHandRing1 ─ LeftHandRing2 ─ LeftHandRing3
│   │     └─ LeftHandPinky1 ─ LeftHandPinky2 ─ LeftHandPinky3
│   └─ RightShoulder ─ … (symétrique, « Right »)
├─ LeftUpLeg ─ LeftLeg ─ LeftFoot ─ LeftToeBase
└─ RightUpLeg ─ RightLeg ─ RightFoot ─ RightToeBase
```

- 52 os qui déforment le maillage. Pas d'os de torsion, pas d'os de contrôle ni de cinématique inverse dans le
  fichier exporté (ils peuvent exister dans le .blend, non exportés).
- Trois os d'attache **sans poids**, pour que le jeu y accroche le matériel :
  `Prop_MainDroite` et `Prop_MainGauche` (enfants de la main, au creux de la paume, axe Y le long du manche tenu),
  `Prop_Tete` (enfant de `Head`, à la base du crâne, pour le casque).
- Les gants sont épais : vérifie que les doigts se ferment autour d'un manche de 3 cm de diamètre sans que les
  mailles se traversent.
- Taille de référence : le patineur mesure **1,83 m** du sol au sommet du casque, patins aux pieds.

## 5. Corps de départ

Les corps viennent de Meshy (Thibault fournit les .glb). Dans Blender :

1. nettoie et, si nécessaire, refais la topologie pour tenir le budget et avoir des boucles propres aux épaules,
   coudes, poignets, hanches, genoux et chevilles ;
2. sépare la tête et le casque du corps (pièces distinctes, § 6) ;
3. refais entièrement le squelette selon le § 4, mains et doigts compris, et repeins les poids ;
4. refais le dépliage UV selon le § 7 ;
5. cuis les textures.

Si un corps Meshy est trop abîmé pour être repris (mains fondues, gants illisibles), dis-le à Thibault : il en
régénérera un meilleur plutôt que de perdre du temps à le réparer.

## 6. Pièces à produire

### 6.1 Patineur

- `joueur.glb` : corps avec maillot ample à manches longues, pantalon long de roller (ample, par-dessus les
  protections, resserré sur le haut du patin), gants, patins. Sans tête, sans casque, sans crosse. Le cou se
  termine proprement sous le col.
- `joueur-leger.glb` : version allégée, même squelette.

### 6.2 Têtes et casque

- `tetes.glb` : quatre têtes (`Tete_A` à `Tete_D`), teints et coupes de cheveux différents, visages sobres, mêmes
  dimensions à la base du cou pour être interchangeables. Pas de ressemblance avec des personnes réelles.
- `casque.glb` : casque de roller hockey avec demi-visière transparente ; coque teintable (§ 7). Origine sur
  `Prop_Tete`. Une variante `Casque_Grille` avec grille complète.

### 6.3 Gardien

- `gardien.glb` : corps avec plastron large sous le maillot, culotte rembourrée, patins. Sans jambières.
  Casque de gardien à grille dans `casque-gardien.glb`, teintable.
- `jambiere.glb` : **une** jambière, rigide. Elle ne se plie pas : dans le jeu elle est fixée le long du tibia, du
  patin jusqu'au-dessus du genou, et recouvre le dessus du patin. Origine au niveau du genou, face avant vers +Z.
- `mitaine.glb` (main gauche, poche ouverte) et `bouclier.glb` (main droite, plaque rectangulaire), rigides,
  origine au creux de la main.
- `crosse-gardien.glb` : palette large et manche élargi sur le tiers bas.

### 6.4 Arbitre

- `arbitre.glb` : maillot rayé noir et blanc à manches longues, **brassards orange** aux deux bras, pantalon noir,
  casque noir sans visière, patins, sifflet à doigts à la main droite. Même squelette. Pas de crosse.

### 6.5 Matériel commun

- `crosse.glb` : crosse de joueur, 1,50 m, palette courbée vers la gauche ; une variante miroir `Crosse_Droitier`.
  Origine au sommet du manche, manche le long de −Y du glTF.
- `palet.glb` : palet de roller hockey (diamètre 7,6 cm, épaisseur 2,2 cm), orange vif.
- `cage.glb` : cage de 1,70 m de large, 1,05 m de haut, 1,09 m de profondeur, montants rouges de 8 cm, filet blanc
  en texture à transparence découpée.

### 6.6 Public

- `public.glb` : quatre spectateurs assis (`Spectateur_A` à `_D`), très simples, vêtements teintables, plus leurs
  trois animations (§ 10.5).

## 7. Tenues : comment le jeu colore les équipes

Le jeu habille le même corps aux couleurs de n'importe quelle équipe. Pour cela :

- la texture de **couleur** du corps est peinte en **gris clair neutre** sur tout ce qui prend la couleur du club
  (ombres, plis et coutures peints en nuances de gris), et en couleurs réelles ailleurs (gants, patins, peau) ;
- une texture **masque de zones** (PNG, mêmes UV) dit quelle zone est quoi :
  rouge = maillot (torse), vert = épaules et manches, bleu = pantalon, alpha = bas de jambe du pantalon (du
  genou au patin, souvent d'une autre couleur ou à motif) ;
- le casque a son propre masque (coque teintable).

**Motifs des clubs.** Chaque club a en plus une texture de motif pour le maillot (rayures, bandes, pointes,
écusson), posée par-dessus la couleur. Pour qu'elle s'applique à tous les corps :

- le maillot (torse, épaules, manches) occupe un **îlot UV dédié, toujours au même endroit** : moitié haute de
  la texture, devant à gauche, dos à droite, manches en dessous, sans miroir (le devant et le dos sont différents) ;
- le **pantalon** a lui aussi son îlot dédié et fixe (quart bas gauche de la texture, jambe gauche et jambe droite
  séparées, sans miroir) : les clubs y portent des motifs, des bandes et parfois l'écusson sur la cuisse ;
- réserve trois rectangles **droits et non déformés** dans cet îlot, que le jeu remplit lui-même :
  `ZONE_NUMERO_DOS` (30 × 30 cm au milieu du dos), `ZONE_NOM_DOS` (bande de 35 × 8 cm au-dessus),
  `ZONE_NUMERO_MANCHE` (10 × 10 cm sur chaque manche). Fournis leurs coordonnées UV dans un fichier
  `zones-uv.json` ;
- l'écusson se place au milieu de la poitrine, dans un rectangle de 22 × 22 cm.

**Les dix clubs** (couleurs relevées sur photos ; les motifs sont à styliser, pas à copier au pixel) :

| Club | Tenue principale | Seconde tenue | Écusson inventé |
|---|---|---|---|
| Aiglons de Valence | maillot rouge, épaules noires, casque rouge (gardien : casque blanc) | blanc | tête d'aiglon de profil |
| Diables de Rethel | noir, parements rouges et blancs, culotte noire | blanc, numéros rouges, culotte noire | petit diable à cornes, de face |
| Fous du Bitume de Villeneuve | turquoise, épaules noires, culotte turquoise | blanc à motifs noirs et turquoise | bonnet de bouffon à grelots |
| Prédateurs de Vierzon | rouge, parements blancs, culotte et casque rouges | blanc et noir | tête de loup |
| Yeti's de Grenoble | bleu roi, parements rouges, culotte et casque rouges | gris très clair, parements rouges | yéti de face |
| Bombardiers d'Épernay | noir à motifs vert fluo, culotte noire à bas de jambe vert fluo, casque blanc | blanc à motifs noirs et vert fluo | étoile ailée |
| Conquérants de Caen | noir, parements rouges et or, bas rayés noir et or | rouge, manches et culotte noires | heaume normand |
| Artzak d'Anglet | rouge, parements blancs et verts | blanc, épaules rouges, culotte et casque blancs | tête d'ours |
| Greenfalcons de Pont-de-Metz | noir, parements verts et blancs, culotte noire à bande verte | blanc, parements verts et noirs | faucon en piqué, vert |
| Hawks d'Angers | marinière blanche à rayures bleu marine, culotte blanche, casque blanc | blanc, épaules et bandes rouges, culotte rouge | épervier aux ailes ouvertes |

Les écussons sont des créations originales inspirées du **surnom** du club : ne cherche pas et ne reproduis pas
les vrais logos. Deux oiseaux de proie (Pont-de-Metz et Angers) doivent rester bien distincts l'un de l'autre et
de l'aiglon de Valence.

Dans le tableau, « culotte » désigne le pantalon long : sa couleur est celle indiquée, à défaut celle du maillot.
Exemple relevé sur photo pour Valence : maillot rouge à grand motif blanc et noir sur la poitrine et les
manches, pantalon à motifs rouge, blanc et noir, casque rouge ; gardien en jambières rouges.

Livraison par club : `tenues/<club>-domicile.png` et `tenues/<club>-exterieur.png` (2048, maillot et pantalon,
fond transparent là où la couleur de base doit rester visible), plus `ecussons/<club>.png` (512).

## 8. Salle : le gymnase Denis Morin

Une seule salle pour l'instant. Thibault fournit trois photos de référence (salle vide, match vu de la tribune,
mur du fond). Ce qui suit en est tiré.

- **Piste** : 50 m × 25 m, coins arrondis de 5 m de rayon. Sol en **dalles sportives emboîtées bleu clair**
  (`#8fbfe0`, léger quadrillage des dalles visible de près, aspect satiné). Marquages : ligne médiane **orange
  large** (`#e2562c`), deux lignes de but fines rouges à 3,80 m des fonds, zones de but de 2,45 m × 1,20 m
  **remplies en rouge orangé**, cinq points d'engagement avec leurs cercles fins rouges de 3 m de rayon (centre,
  et quatre à ±15,1 m en longueur et ±6,7 m en largeur).
- **Balustrade** : 1,07 m de haut tout autour, panneaux **blancs** à **bandeau jaune** au ras du sol, main
  courante blanche. Des panneaux d'affichage rectangulaires sont posés dessus à intervalles réguliers.
  Filets de protection de 1,80 m au-dessus, derrière les cages et devant la tribune.
- **Repère** : origine au centre de la piste ; la longueur le long de X ; la caméra du jeu est du côté **+Z**.
- **Côté −Z (face à la caméra)** : les deux bancs des équipes derrière la balustrade, puis une tribune de six
  gradins en béton gris sur 46 m, avec garde-corps vitré en haut. (Dans la vraie salle, la tribune est du côté
  d'où l'on filme ; dans le jeu elle est en face, pour qu'on voie le public.)
- **Côté +Z (côté caméra)** : la table de marque au centre et les deux bancs des pénalités de part et d'autre.
  Rien de plus haut que 1,30 m de ce côté, sauf la balustrade : la caméra regarde par-dessus.
- **Bâtiment** : murs hauts en **bardage de lames de bois verticales, ton miel**, soubassement blanc percé de
  portes et de baies vitrées ; plafond clair à environ 9 m, avec poutres et rampes d'éclairage ; deux paniers de
  basket relevés contre les murs des petits côtés ; un **tableau d'affichage lumineux** noir à chiffres orange
  sur le grand mur (côté −Z), entouré de **bâches rectangulaires** accrochées en mosaïque.
- **Bâches et panneaux** : pas de vraies enseignes ni de vrais sponsors. Remplis-les avec des enseignes
  **inventées** (noms de commerces fictifs, graphismes variés) et quelques bâches aux couleurs du club qui reçoit ;
  laisse deux grandes bâches vides et un bandeau vide sur la balustrade : le jeu y écrit le nom de la salle et
  celui du club.
- **Lumière** : éclairage de gymnase, blanc neutre, sans ombres dures. Cuis l'éclairage indirect et les ombres
  du bâtiment dans une texture de lumière (second jeu d'UV). Les ombres des joueurs sont calculées par le jeu :
  ne les cuis pas.
- Objets séparés et nommés : `Piste`, `Balustrade`, `Tribune`, `Bancs`, `TableDeMarque`, `Prisons`, `Batiment`,
  `Tableau`, `Baches`. Les cages sont livrées à part (§ 6.5).

## 9. Marques inventées

Trois fabricants fictifs, à décliner en petits logos sobres sur le matériel :
**Noroît** (crosses), **Vélane** (casques et gants), **Korrigan** (patins et jambières).
Thibault a validé ces noms. Leurs logos sont des créations originales : ne t'inspire d'aucun logo de fabricant
existant.

## 10. Animations

Le jeu mélange deux choses : le **patinage est calculé** par le jeu (il doit suivre exactement la trajectoire du
joueur) ; **tout le reste vient de tes animations**. Chaque animation est une *action* Blender, exportée dans un
fichier .glb par famille (`anim-joueur.glb`, `anim-gardien.glb`, `anim-arbitre.glb`, `anim-public.glb`), sur le
squelette du § 4.

Règles communes :

- 30 images par seconde ; les noms d'actions ci-dessous sont **imposés** ;
- n'anime que les os, jamais l'objet ; les doigts sont animés (prise de crosse, main ouverte, poing) ;
- **pose de liaison** : sauf mention contraire, chaque action commence et finit dans la pose `Pose_Patinage`
  (genoux fléchis, buste penché de 20°, crosse tenue à deux mains, palette au sol devant à droite), pour
  s'enchaîner sans saut avec le patinage calculé ;
- « sur place » : l'os `Hips` ne se déplace pas horizontalement. « déplacement » : `Hips` se déplace, le jeu
  suit ce déplacement ;
- rien ne passe sous le sol ; les patins roulent, ils ne marchent pas.

### 10.1 Poses de référence (une image chacune)

`Pose_T`, `Pose_Patinage`, `Pose_Gardien_Base`, `Pose_Arbitre`, et trois poses de main :
`Main_Prise` (fermée sur un manche de 3 cm), `Main_Ouverte` (à plat, doigts joints), `Main_Poing`.

### 10.2 Joueur

| Action | Durée | Type | Description |
|---|---|---|---|
| `Tir_Poignet` | 0,5 s | sur place | fouetté rapide, transfert du poids vers la jambe avant |
| `Tir_Frappe_Arme` | 0,4 s | sur place | la crosse monte en arrière jusqu'à l'épaule ; finit crosse levée |
| `Tir_Frappe` | 0,5 s | sur place | part crosse levée, frappe le palet, accompagne vers la cible |
| `Passe` | 0,35 s | sur place | poussée sèche de la palette |
| `Reception` | 0,3 s | sur place | la palette amortit le palet |
| `Vol_Palet` | 0,4 s | sur place | harponnage à une main, bras tendu, palette au sol |
| `Charge` | 0,5 s | sur place | épaule en avant, coudes rentrés |
| `Accrocher` | 0,6 s | sur place | la palette passe derrière la taille d'un adversaire puis tire vers soi |
| `Cinglage` | 0,5 s | sur place | la crosse se lève puis s'abat sèchement à hauteur des bras adverses |
| `Faire_Trebucher` | 0,5 s | sur place | la palette balaie au ras du sol |
| `Genou_Sol` | 0,4 s | sur place | un genou au sol, crosse couchée en travers ; finit dans cette pose |
| `Chute_Avant` | 1,3 s | déplacement | fauché aux patins, tombe sur les mains puis à plat ventre |
| `Chute_Ventre` | 1,3 s | déplacement | poussé dans le dos, projeté bras en avant, glisse à plat ventre |
| `Chute_Balustrade` | 1,4 s | sur place | plaqué de côté contre une paroi (à sa droite), puis glisse assis à son pied |
| `Vacille` | 0,7 s | sur place | déporté par un coup d'épaule, se rattrape sans tomber |
| `Retenu` | 0,6 s | sur place | tiré en arrière par la taille, bras qui s'ouvrent |
| `Cingle` | 0,8 s | sur place | reçoit un coup sur l'avant-bras, lâche la crosse d'une main, se recroqueville |
| `Se_Relever` | 1,0 s | sur place | de la position à plat ventre jusqu'à `Pose_Patinage` |
| `But_Bras_Leves` | 2,0 s | sur place | les deux bras levés, crosse en l'air |
| `But_Poing` | 1,5 s | sur place | poing serré ramené vers soi |
| `Assis_Banc` | boucle 3 s | sur place | assis, crosse entre les jambes, léger mouvement |
| `Assis_Prison` | boucle 3 s | sur place | assis, penché en avant, coudes sur les genoux |

### 10.3 Gardien

| Action | Durée | Description |
|---|---|---|
| `G_Base` | boucle 2 s | position de base, jambières parallèles, mitaine ouverte, crosse au sol |
| `G_Papillon_Descente` | 0,25 s | tombe sur les deux genoux, jambières à plat sur les côtés |
| `G_Papillon_Tenue` | boucle 1 s | reste en papillon |
| `G_Papillon_Remontee` | 0,5 s | se relève jusqu'à `Pose_Gardien_Base` |
| `G_Mitaine_Haut`, `G_Mitaine_Bas` | 0,45 s | arrêt de la main gauche, en haut puis au ras du sol |
| `G_Bouclier_Haut`, `G_Bouclier_Bas` | 0,45 s | arrêt de la main droite |
| `G_Pas_Gauche`, `G_Pas_Droite` | 0,35 s | déplacement latéral d'un mètre, en poussant sur un patin |
| `G_Gel_Palet` | 0,8 s | se couche sur le palet, mitaine dessus |

### 10.4 Arbitre

Gestes officiels du règlement FFRS. Chaque action part de `Pose_Arbitre`, tient le geste environ une seconde
(répété deux fois quand il est rythmé), et y revient. Durée : 2 s.

| Action | Geste |
|---|---|
| `A_Bras_Leve` | un bras levé à la verticale (pénalité appelée, jeu en cours) |
| `A_Accrocher` | les deux bras tendus devant soi, puis ramenés comme pour tirer quelque chose |
| `A_Trebucher` | penché en avant, une main frappe la jambe sous le genou |
| `A_Cinglage` | le tranchant d'une main frappe l'avant-bras opposé |
| `A_Charge` | les poings tournent l'un autour de l'autre devant la poitrine |
| `A_Balustrade` | un poing frappe la paume de l'autre main devant la poitrine |
| `A_Dos` | une main ouverte à hauteur du plexus, doigts serrés vers le haut, coude légèrement plié |
| `A_Obstruction` | les avant-bras croisés devant la poitrine |
| `A_Crosse_Haute` | les deux poings l'un au-dessus de l'autre, levés au-dessus de l'épaule |
| `A_Coup_Coude` | une main touche le coude opposé, bras levé plié |
| `A_Retenir` | une main serre le poignet opposé devant la poitrine |
| `A_Meconduite` | les deux mains sur les hanches |
| `A_Tir_Penalite` | les bras croisés au-dessus de la tête |
| `A_But` | un bras tendu qui désigne la cage, droit devant |
| `A_Annulation` | les deux bras écartés à l'horizontale |
| `A_Temps_Mort` | les deux mains forment un T devant la poitrine |
| `A_Designe` | un bras tendu à l'horizontale sur le côté (désigne le banc des pénalités) |
| `A_Engagement` | penché, lâche le palet d'une main entre deux joueurs |

Tenue de l'arbitre relevée sur photo : maillot rayé noir et blanc, brassards rouge orangé, pantalon noir, casque
noir.

Thibault fera relire ces gestes par un arbitre du club : attends-toi à des corrections.

### 10.5 Public

`P_Assis` (boucle 4 s, petits mouvements), `P_Applaudit` (boucle 1 s), `P_Debout_Bras_Leves` (2 s, se lève, bras
en l'air, se rassoit).

## 11. Ordre de production

Une étape à la fois. Ne commence pas la suivante sans validation.

1. **Patineur : maillage et squelette.** Reprise du corps Meshy, squelette du § 4, poids, les trois poses de main,
   `Pose_T` et `Pose_Patinage`. C'est l'étape la plus importante : tout le reste en dépend.
2. **Patineur : UV, masque de zones, textures.** Avec une tenue d'essai, celle de Valence.
3. **Têtes et casques.**
4. **Crosse, palet, cage.**
5. **Animations du joueur**, dans cet ordre : tirs et passe, gestes fautifs, chutes et réactions, se relever,
   célébrations, bancs.
6. **Gardien** : corps, jambière, mitaine, bouclier, crosse, puis ses animations.
7. **Arbitre** : corps, puis les gestes officiels.
8. **Tenues et écussons des dix clubs.**
9. **Salle.**
10. **Public.**
11. **Versions allégées** des trois personnages.

## 12. Contrôle de chaque livraison

À la fin de chaque étape, fournis à Thibault :

- des **rendus de contrôle** : face, profil, dos et trois quarts, sur fond neutre ; pour un personnage, ajoute une
  vue en fil de fer et un gros plan des mains ;
- pour un squelette : une image avec les os visibles, et les poses `Pose_Patinage`, `Main_Prise`, bras levés à la
  verticale et accroupi (pour juger les déformations aux épaules, aux coudes, aux hanches et aux genoux) ;
- pour une animation : quatre à six images clés de profil, et une courte vidéo si possible ;
- les **chiffres** : nombre de triangles, nombre d'os, nombre et taille des textures, poids du fichier ;
- la liste de ce qui s'écarte de ce document, et pourquoi.

Avant chaque export, vérifie toi-même : transformations appliquées, noms d'os et d'actions exacts, pas de
maillage ou d'os en trop, textures bien embarquées, fichier rouvrable dans une scène vide.

## 13. À ne pas faire

- Renommer, ajouter ou retirer des os après la validation de l'étape 1.
- Changer les UV du maillot après la validation de l'étape 2 (les tenues des dix clubs en dépendent).
- Reproduire un vrai logo, une vraie marque ou le visage d'une personne réelle.
- Empiler des modificateurs non appliqués, des matières procédurales ou des contraintes dans le fichier exporté.
- Livrer plusieurs étapes d'un coup.
