# Élite 27 — repères pour Claude

Jeu de roller hockey 3D dans le navigateur. Le cahier des charges validé est `docs/specs/001-elite27.md` :
ne rien coder qui n'y figure pas sans le faire valider d'abord.

## Règles du dépôt

- **La logique ne dépend jamais de l'affichage.** `src/sim/` n'importe rien de `src/render/`, `src/ui/`,
  `src/input/`, ni `three`, ni `window`/`document`. Elle doit tourner sous Node (tests, futur serveur en ligne).
- **La logique est déterministe** : tout hasard passe par `rnd(state)` (`src/sim/state.js`), jamais `Math.random`.
  Pas d'horloge réelle dans `src/sim/` : le temps avance par pas fixes de 1/60 s (`step`).
- **L'affichage ne modifie jamais l'état du match** ; il le lit et réagit aux événements (`state.events`).
- **Les règles viennent du règlement FFRS**, avec le numéro d'article en commentaire. Ne pas inventer une
  règle : si le règlement laisse l'arbitre juger, le choix du jeu est documenté dans le README.
- Données (équipes, infractions) dans `src/data/`, textes à l'écran en français.
- Pas d'étape de construction ni de dépendance npm : modules ES servis tels quels, Three.js dans `vendor/`.

## Vérifier

- `npm test` doit passer avant toute PR.
- `npm run simulate` donne un bilan sur 10 matchs ordinateur contre ordinateur : surveiller les buts
  (4 à 8 par match en normal) et les fautes (1 à 3 par match).
- Le rendu se contrôle dans un navigateur : `python3 -m http.server 8027`, puis `?demo=1`.
- Les poses des figurines se contrôlent sur `tools/poses.html` (toutes côte à côte ; `?vue=cote`, `?vue=dos`) :
  toute nouvelle pose s'y ajoute.

## Repères du code

- Repère : x le long de la piste, y en travers (y positif côté caméra et table de marque), mètres.
  En 3D, y du jeu devient Z.
- `state.teams[t].dir` : +1 si l'équipe attaque vers x positif ; les équipes changent de côté à la mi-temps.
- Phases : `pregame`, `faceoff`, `play`, `whistle`, `goal`, `break`, `final`.
- Patinage : `moveSkaters` (physics.js) lit `p.ctl` (mx, my, skid, dodge, check, back). Le joueur roule dans
  l'axe de `p.face` ; ne pas réintroduire de glisse dans toutes les directions.
- Le palet a une hauteur (`puck.z`, `puck.vz`) : tout nouveau contact avec le palet doit en tenir compte.
- Fautes : `callFoul` (rules.js) gère l'avantage ; les contacts sont jugés dans `judgeContact` (physics.js),
  une charge n'existe que si le joueur l'a lancée (`checkT`),
  les vols de palet fautifs dans `doSteal`.
