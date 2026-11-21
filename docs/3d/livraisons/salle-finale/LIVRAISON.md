# Salle de finale — arène de 4 000 places

> **Mise à jour du 20/11/2026 — habillage Denis Morin** (demande de Thibault). Les gradins, les 4 000 places, les
> loges et le bandeau lumineux ne changent pas. Murs : soubassement blanc (portes, baies) sur 3,5 m puis bardage de
> lames de bois miel jusqu'au plafond, repris de `T_Batiment` de Denis Morin. Plafond clair, poutres claires,
> **quatre rampes d'éclairage** à la place des seize projecteurs, deux paniers de basket relevés sur les murs des
> petits côtés. Le **cube central** et les huit bannières sont retirés. **Tableau** noir à chiffres orange
> (`T_Habillage`, 10,4 × 2,6 m), **au-dessus des bâches** (8,6 à 11,2 m). **Bâches** en mosaïque comme à Denis Morin
> (`T_Baches` : 2 grandes vides, 18 enseignes inventées, 6 du club), sur le mur côté caméra, disposées comme à Denis Morin. Lumière recuite sous les rampes (blanc neutre).
> Chiffres : 68 008 triangles, 6 textures (T_Arene, T_Lumiere, T_Baches, T_Habillage, T_Piste, T_Filet), 10,5 Mo.
> `verifier_glb.py` : conforme ; `controle.mjs` : conforme au cahier. Rendus : `controle/vue_*.png`.
> **Écart** : le plafond reste à 19 m (Denis Morin : 9 m), car l'étage haut des gradins monte à 10,7 m.
> Sauvegarde de la version précédente : `../salle-finale.sauvegarde-20261120-1601/`.

Livrée le 17/11/2026. Refaite le même jour pour suivre les critères de la salle déjà installée (gymnase
Denis Morin) : elle se pose à la place de `salle.glb` sans rien changer au code du jeu. En attente de
validation de Thibault. Pas encore copiée dans le jeu.

Inspirée de l'ambiance des grandes arènes de hockey (gradins raides, sièges rouges, bandeau lumineux, cube
sous le toit). Tout est inventé : aucun nom, logo ni enseigne réels.

## Fichiers

| Fichier | Contenu |
|---|---|
| `salle-finale.glb` | l'arène, 10 objets, textures embarquées (9,5 Mo) |
| `salle-finale.blend` | fichier de travail (scène « Salle » ; collection `Cuisson` non exportée) |
| `places.json` | les 4 000 places : position, orientation, étage, rang, bloc (repère du glTF) |
| `textures/` | `T_Arene.jpg` (2048, couleur), `T_Lumiere.png` (2048, lumière cuite) |
| `controle/salle_finale.jpg` | six vues prises dans le jeu ; `controle/jeu_*.jpg` : toutes les vues |
| `scripts/` | `01_textures.py` → `02_construire.py` → `03_lumiere.py` → `04_exporter.py` |
| `scripts/essai_jeu/` | page d'essai qui charge l'arène avec le vrai code du jeu, sur une copie du jeu |

## Chiffres

- Triangles : **67 978** (budget 150 000) — Tribune 63 540 (dont 56 000 pour les sièges), Balustrade 2 272,
  Charpente 1 420, Batiment 316, Piste 118, TableDeMarque 110, Bancs 80, Prisons 80, Baches 32, Tableau 10.
- Textures : 4 × 2048 + 1 × 512 (cinq textures, limite six). Ni Draco ni Meshopt.
- Places : **4 000** exactement — 1 132 à l'étage bas (6 rangs), 2 868 à l'étage haut (12 rangs).
- Boîte englobante glTF : (−45,15 ; 0 ; −32,65) → (45,15 ; 19 ; 19,5). Origine au centre de la piste.
- `verifier_glb.py` : « conforme ». `node tools/modele/controle.mjs` : « Conforme au cahier ».

## Ce qui est fait pour marcher dans le jeu actuel

Chaque point a été vérifié en chargeant l'arène avec `arena.js`, `crowd.js` et `perso.js` du jeu (copie du
dépôt, rien modifié), aux positions de caméra de `view.js`, en 16:9 et en fenêtre étroite (4:3).

| Ce que fait le jeu | Ce que fait l'arène |
|---|---|
| Public posé sur des rangs fixes, côté bancs : hauteur 0,42 m par rang, recul 0,85 m, x de −22 à +22 tous les 0,74 m | L'étage bas du côté des bancs a le même profil que la tribune Denis Morin. Ses fauteuils sont larges de 0,74 m et placés aux mêmes x : chaque spectateur est assis sur un siège. Ni allée ni tunnel dans cette zone |
| Score posé sur la face de `Tableau` tournée vers la piste | `Tableau` est sur le mur du côté caméra, au-dessus de la table de marque (10,4 × 3,4 m). On le voit dans les ralentis filmés depuis le côté des bancs |
| Caméra du match en (x ; 13,2 ; 28), ralentis rapprochés à 4,6 m de haut jusqu'à 11 m derrière la balustrade | Côté caméra : un seul rang de sièges (1,3 m de haut), puis un mur à 16,5 m du centre, comme dans la salle actuelle. Rien derrière |
| Le haut de `Batiment` est effacé | `Batiment` ne contient que le sol. Murs, toit, poutres, projecteurs et cube sont dans `Charpente`, que le jeu dessine normalement |
| `Tableau` et `Baches` ne sont dessinés que caméra à l'intérieur | Sans effet gênant : ils sont hors du cadre de la caméra du match |
| Nom de la salle écrit sur le bandeau vide de la balustrade | Balustrade reprise telle quelle |
| Bancs, table de marque, prisons, piste | Repris tels quels |

**Intérieur seul** : les matières `M_Arene` et `M_Ecran` n'ont qu'une face. Le mur du côté caméra, les murs
du fond et le toit ne sont dessinés que vus de l'intérieur ; une caméra placée derrière voit à travers.

## Contenu

- **Gradins** en fer à cheval sur trois côtés : étage bas de 6 rangs, façade de loges, bandeau lumineux,
  étage haut de 12 rangs en surplomb de 0,8 m. Allées à nez de marche jaune.
- **Deux tunnels « vestiaires »** au milieu des petits côtés.
- **Mur du côté caméra** : portes « sortie », bandeau lumineux, tableau d'affichage.
- **Sous le toit** (19 m) : cube central à quatre faces (écrans vides, décor), huit bannières (dont deux
  vides), poutres en treillis, seize projecteurs.
- **Tribune de presse** en haut du côté des bancs : 144 places remplacées par des pupitres.
- **Lumière cuite** : piste très éclairée, gradins plus sombres. Le bord de piste a la plus grande part de la
  texture.

## À savoir côté jeu

1. **Le public ne remplit que la zone prévue par le jeu** : 5 rangs de 60 places côté bancs. Les autres
   sièges restent vides tant que le jeu ne lit pas `places.json`. Dans la vue du match, on voit surtout
   cette zone ; les fonds et les coins apparaissent vides sur les côtés de l'image.
2. **Choix de la salle** : le jeu charge toujours `salle/salle.glb`. Pour jouer la finale ici, il doit
   charger ce fichier à la place (ou on le copie sous ce nom).
3. **Objet en plus** : `Charpente` (dixième objet). Le jeu le dessine sans traitement particulier.
4. **Le bandeau du nom de la salle** paraît plus sombre que dans la salle actuelle : le jeu perce déjà la
   balustrade à cet endroit et on voit le sol derrière, plus sombre ici.
5. **Fenêtre étroite (4:3)** : le rang de sièges du côté caméra apparaît en bas de l'image, devant la
   table de marque. Il ne cache pas la piste.

## Écarts et limites

1. Ce n'est pas une copie du centre Bell : même esprit, formes et habillage inventés.
2. Le côté caméra n'a pas de gradins : c'est la règle de la salle actuelle (rien de haut de ce côté), et
   une première version avec des gradins tout autour mettait la caméra des ralentis dans les sièges.
3. Les loges sont peintes sur la façade, sans volume.
4. Les sièges sont simples (14 triangles chacun) ; le dessous de l'assise n'est pas modélisé.
5. La zone du public du jeu n'a pas d'allée sur 46 m : c'est le prix de l'alignement sur les rangs du jeu.
6. `scripts/05_rendu.py` (rendus dans Blender) n'a pas été relancé sur cette version ; les images de
   contrôle viennent du jeu.

## Refaire l'essai dans le jeu

Copier le dépôt du jeu dans un dossier `jeu/` à côté de `serveur_essai.py`, y copier `essai.html` et
remplacer `jeu/assets/3d/salle/salle.glb` par `salle-finale.glb`. Lancer `python3 serveur_essai.py`, puis
`./essais.sh "essai.html?nom=finale" 1600 900`. Les captures arrivent dans `captures/`.
