# Étape 1 — bilan des corps Meshy fournis (13/11/2026)

Images : `controle/sources_corps.png`, `controle/sources_mains.png`.

| Fichier | Triangles | Verdict |
|---|---|---|
| `..._roller_hockey_player_1112081601_image-to-3d-texture.glb` | 972 000 | joueur, pose en A |
| `..._roller_hockey_player_rigged_..._mixamo_All_animation.glb` | 20 700 | même joueur réduit, rig Mixamo de 24 os (sans doigts) |
| `..._Full_body_inline_roll_1112110210_texture.glb` | 30 000 | masque et gants de gardien : pas un patineur |

Bloquants (3D.md § 2, § 5, § 6.1) :
1. **Culotte courte noire et bas blancs** (tenue de hockey sur glace) au lieu du pantalon long de roller, ample, jusqu'aux patins.
2. **Gants fondus** : doigts soudés en poing à moitié fermé, impossibles à ouvrir (Main_Ouverte) ou à refermer proprement (Main_Prise).

Rattrapable : pose en A (on la ramène en T), visière et casque (on les découpe).

## Consigne proposée pour régénérer dans Meshy (en anglais, Meshy la comprend mieux)

Full body inline roller hockey player, strict T-pose, arms horizontal, palms facing down, legs straight,
feet parallel. Long loose roller hockey pants covering the legs down to the top of the skates (no shorts,
no socks visible). Plain light grey long-sleeve loose jersey, no logo, no number, no text. Thick hockey
gloves with fingers clearly separated and straight, open hand. Black inline skates with four wheels in a
line. No helmet, short hair, neutral face. Realistic proportions, 1.83 m, clean simple shapes.
