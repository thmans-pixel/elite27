# Étape 3 — têtes et casques

Livré le 13/11/2026. Validée par Thibault le 13/11/2026 (« oui continue »), écarts acceptés en l'état.

## Fichiers

- `tetes.glb` (1,2 Mo) : `Tete_A`, `Tete_B`, `Tete_C`, `Tete_D`, une texture 1024 chacune.
- `casque.glb` (0,17 Mo) : `Casque` (demi-visière transparente) et `Casque_Grille` (grille complète).
- `textures/` : `tete_A..D.jpg`, `casque_couleur.jpg`, `casque_masque.png` (rouge = coque teintable),
  `casque_apercu_valence.jpg` (aperçu teinté, pour les contrôles seulement).
- `tetes_casque.blend` : tout en place à la hauteur du joueur.
- `controle/` : `tetes.png`, `casques.png`, `casque_sur_tetes.png`.
- `scripts/` : `01_tetes.py → 02_casque.py → 03_exporter.py`, puis `python3 -I verifier.py ../tetes.glb ../casque.glb`.

## Chiffres

| Objet | Triangles | Budget | Texture |
|---|---|---|---|
| Tete_A | 2 828 | 3 000 | 1024 |
| Tete_B | 2 830 | 3 000 | 1024 |
| Tete_C | 2 832 | 3 000 | 1024 |
| Tete_D | 2 830 | 3 000 | 1024 |
| Casque | 948 | 2 500 | 1024 + masque |
| Casque_Grille | 1 692 | 2 500 | la même |

- Origine de tous les objets : l'os `Prop_Tete` du joueur (0 ; 0,035 ; 1,615 en repère Blender). Dans les GLB
  ils sont posés à l'origine : il suffit de les accrocher à l'os.
- Base du cou identique pour les quatre têtes : coupe plane à z = 1,578 m, même contour.
- Sommet du casque à 1,83 m. Aucun cheveu ne traverse la coque (40 sommets de la tête C rentrés de 6 mm au plus).
- Pas de Draco, aucune extension glTF. La visière est en transparence (`BLEND`), le reste opaque.

## Les quatre têtes

- A : teint clair, cheveux bruns courts.
- B : teint foncé, cheveux noirs ras.
- C : teint clair, cheveux blonds plus fournis, visage plus étroit.
- D : teint mat, crâne rasé, barbe courte, mâchoire plus large.

Visages générés (Meshy), sans modèle réel.

## Écarts et limites

1. **Les quatre têtes partent du même visage.** Teint, cheveux, barbe et largeur de mâchoire changent, mais les
   traits restent proches : de près, on voit que c'est le même homme. Sous le casque et la visière, ça passe.
2. **Tête D** : la limite entre le front et l'ancien bord des cheveux reste visible (petite marche), et la barbe
   est peinte à plat.
3. **Tête B** : le bord des cheveux sur le front est irrégulier.
4. Casque modélisé à la main, formes simples ; aérations, ouïes et vis sont peintes, pas en relief.
5. La marque Vélane est un simple chevron blanc à l'arrière.
6. Pas de carte de normales ni de rugosité pour les têtes et le casque (non demandées à cette étape).
