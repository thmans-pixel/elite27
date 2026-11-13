# Livraison — Étape 2 : patineur, UV, masque de zones, textures (3D.md § 7, § 11)

Livrée le 13/11/2026. **Validée par Thibault le 13/11/2026** (« vas y »). Les UV du maillot ne changent plus. Tenue d'essai : Aiglons de Valence.

## Fichiers

| Fichier | Contenu |
|---|---|
| `joueur.glb` | corps avec ses UV et la matière `M_Joueur` : couleur neutre, rugosité/métal, normales (embarquées ; 4,1 Mo) |
| `textures/joueur_couleur.jpg` | 2048, sRGB : tissu gris clair (ombres cuites, coutures et bords-côtes en nuances de gris), gants et patins en couleurs réelles |
| `textures/joueur_masque.png` | 2048, linéaire : rouge = torse, vert = épaules et manches, bleu = pantalon, alpha = bas de jambe (sous le genou) |
| `textures/joueur_normales.png` | 2048 : relief cuit depuis le maillage détaillé `Corps_Detail` (gants, chaussures, plis restants) |
| `textures/joueur_orm.png` | 2048 : vert = rugosité, bleu = métal (platine des patins) |
| `textures/zones-uv.json` | échelle (0,47 UV par mètre ≈ 962 px/m) et rectangles réservés : `ZONE_NUMERO_DOS`, `ZONE_NOM_DOS`, `ZONE_NUMERO_MANCHE_GAUCHE/DROITE`, `ZONE_ECUSSON` |
| `tenues/essai-valence.png` | 2048, fond transparent : épaules noires, chevron blanc et noir sur la poitrine, bandes aux manches, au bas du maillot, sur le côté du pantalon et au bas de jambe ; sans écusson (étape 8) |
| `textures/joueur_apercu_valence.jpg` | aperçu composé (couleur neutre × rouge de Valence + tenue) : pour regarder, pas pour le jeu |
| `controle/joueur_textures.jpg`, `controle/joueur_planches_uv.jpg` | rendus texturés (repos, Pose_Patinage, gant, patin) et les quatre planches côte à côte |
| `scripts/05_textures.py` | dépliage, cuissons et peinture ; `scripts/rendu_textures.py` pour les rendus |

## Dépliage (îlots fixes)

- Moitié haute : maillot devant à gauche, dos à sa droite (projections planes, sans miroir), manches en dessous (déroulées, couture sous le bras).
- Quart bas gauche : pantalon, jambe gauche puis jambe droite (déroulées, couture à l'arrière).
- Quart bas droit : gants (dessus et paume) et patins (extérieur et intérieur).

## Matériel

Gants et patins sont en couleurs neutres, communes à tous les clubs : gants noirs, manchette anthracite, liserés blancs, paume claire ; chaussure noire, platine alu, roues claires. Marques inventées du § 9, en signe simple : chevron Vélane sur la manchette, triangle Korrigan sur le côté de la chaussure.

## Écarts au cahier, et pourquoi

1. **Dépliage par projection**, pas à la main : les flancs du torse, le dessus des épaules, le dessous des patins et la tranche des gants sont étirés. Les rectangles réservés (dos, manches, écusson) sont droits et à l'échelle.
2. Les manches sont déroulées à hauteur fixe : l'échelle est exacte au-dessus du coude (là où se trouve `ZONE_NUMERO_MANCHE`), un peu comprimée vers l'épaule.
3. Le quart haut droit de la texture est libre (le cahier impose manches sous le maillot) : la densité du maillot est d'environ 1 mm par pixel.
4. Les logos des marques sont des signes géométriques ; un vrai dessin de logo reste à faire avec les écussons (étape 8).
5. La limite maillot / pantalon est un seuil de hauteur (0,90 m), les deux pièces étant soudées dans le maillage Meshy.

## Points à regarder en priorité

- La lecture des couleurs de loin (silhouette, épaules noires, bandes).
- L'emplacement des îlots : **les UV du maillot ne doivent plus changer après validation** (les dix tenues en dépendent).
