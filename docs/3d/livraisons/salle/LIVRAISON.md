# Livraison — Salle : gymnase Denis Morin (3D.md § 8)

Livrée le 13/11/2026. **Validée par Thibault le 13/11/2026.**

## Fichiers

| Fichier | Contenu |
|---|---|
| `salle.glb` | la salle, 9 objets, textures embarquées (5,9 Mo) |
| `salle.blend` | fichier de travail (scène « Salle » ; lumières de cuisson dans la collection `Eclairage_cuisson`, non exportées) |
| `textures/` | `T_Piste.jpg`, `T_Habillage.jpg`, `T_Baches.jpg`, `T_Batiment.jpg` (2048, sRGB), `T_Filet.png` (512, transparence), `T_Lumiere.png` (2048, linéaire) |
| `controle/salle_controle.jpg` | rendus de contrôle « couleur × lumière cuite » : caméra du jeu, vue d'ensemble, tribune, mur des bâches, coin, vue de ralenti |
| `scripts/` | tout se reconstruit : `textures_salle.py` (hors Blender) → `construire_salle.py` → `uv_lumiere.py` → `cuire_lumiere.py` → `export_headless.py` (Blender sans interface) → `verifier_glb.py` (hors Blender) |

## Chiffres

- Triangles : **3 470** (budget 150 000) — Piste 118, Balustrade 2 272, Tribune 260, Bancs 80, TableDeMarque 110, Prisons 80, Batiment 488, Tableau 10, Baches 52.
- Textures : 5 × 2048 (dont la lumière) + 1 × 512 (filet). Aucune compression (ni Draco ni Meshopt).
- Matières : `M_Piste` (satiné, rugosité 0,45), `M_Habillage`, `M_Baches`, `M_Batiment`, `M_Filet` (alpha découpé, double face), `M_Verre` (alpha mélangé, double face). Rugosité et métal en valeurs constantes.
- Os : aucun. Origine au centre de la piste, au sol. Transformations neutres. Noms ASCII.
- Repère glTF : longueur sur X ; caméra du jeu côté **+Z** (bancs et tribune côté −Z) ; boîte englobante (−30, 0, −22) → (30, 9, 16,5).

## Contenu

- **Piste** 50 × 25 m, coins de 5 m ; dalles bleu clair `#8fbfe0` avec quadrillage discret de 30,5 cm ; ligne médiane orange `#e2562c` (30 cm) ; lignes de but rouges à 3,80 m des fonds ; zones de but 2,45 × 1,20 m rouge orangé ; 5 points et cercles d'engagement (rayon 3 m) au centre et à (±15,1 ; ±6,7).
- **Balustrade** 1,07 m, panneaux blancs à bandeau jaune, main courante blanche ; panneaux publicitaires (enseignes inventées) sur la face piste des parties droites ; **bandeau vide** de 6 m au milieu du long côté tribune ; filets de 1,80 m avec poteaux derrière les cages (fonds et coins) et devant la tribune.
- **Bancs** des équipes côté −Z, puis **Tribune** de six gradins en béton sur 46 m avec garde-corps vitré en haut.
- Côté +Z : **TableDeMarque** au centre (1,0 m) et **Prisons** de part et d'autre (1,25 m) — rien au-dessus de 1,30 m.
- **Batiment** : sol gris du gymnase autour de la piste, soubassement blanc (portes, baies vitrées) jusqu'à 3,5 m, bardage de lames de bois miel jusqu'au plafond (9 m), plafond clair, poutres, quatre rampes d'éclairage, deux paniers de basket relevés contre les petits côtés.
- **Tableau** noir à chiffres orange et **Baches** en mosaïque (18 enseignes inventées, 6 bâches aux couleurs du club qui reçoit, **2 grandes bâches vides**).
- **Lumière cuite** (`T_Lumiere.png`, second jeu d'UV) : éclairage de gymnase blanc neutre, sources longues et douces sous les rampes, ombres douces du bâtiment et de la balustrade ; aucune ombre de joueur.

## Écarts au cahier, et pourquoi

1. **Ordre de production** : la salle (étape 9) est faite avant le patineur (étape 1), à la demande de Thibault.
2. **Bâches et tableau d'affichage sur le mur en face de la tribune** (côté +Z, derrière la caméra du jeu), comme dans la vraie salle — correction demandée par Thibault ; 3D.md les plaçait côté tribune. Conséquence : ils ne sont pas vus par la caméra de retransmission, seulement dans les ralentis et les vues rapprochées ; les deux grandes bâches vides que le jeu remplit sont donc aussi de ce côté. **Confirmé par Thibault le 13/11/2026.**
3. **Texture de lumière** : glTF n'a pas d'emplacement « lightmap ». Elle est embarquée comme **occlusionTexture sur le second jeu d'UV (texCoord 1)** et livrée aussi à part. Dans le jeu (Three.js) : `material.lightMap = material.aoMap; material.lightMap.channel = 1; material.aoMap = null;` (ou garder en aoMap si l'éclairage reste surtout ambiant). Valeurs : 1,0 = pleine lumière ; plancher à 0,22 pour éviter les noirs francs.
4. **Garde-corps vitré** placé au bord supérieur des gradins (lecture de « en haut »).
5. **Panneaux d'affichage de la balustrade** posés sur la face côté piste (comme sur les photos), pas au-dessus de la main courante.
6. **Panneau de basket** : la texture est dessinée en portrait et étirée sur un panneau paysage (détail invisible à distance).
7. Cuisson faite **sur le processeur** (le Blender Flatpak ne voit pas la carte graphique) : 128 échantillons, léger flou de débruitage.

## Points connus de l'outil

- L'export glTF lancé depuis l'addon MCP avec une surcharge de contexte (`temp_override`) fait planter Blender 5.2 (SIGSEGV dans l'évaluation du depsgraph). Exporter avec `export_headless.py` (Blender sans interface), sans surcharge.
