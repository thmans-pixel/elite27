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
- Le rendu se contrôle dans un navigateur : `python3 tools/serveur.py` (port 8027, sans cache navigateur), puis `?demo=1`.
- Les poses des figurines se contrôlent sur `tools/poses.html` (toutes côte à côte ; `?vue=cote`, `?vue=dos`) :
  toute nouvelle pose s'y ajoute. `?planche=fautes` : gestes de crosse fautifs et réactions de la victime ;
  `?planche=arbitre` : gestes officiels ; `?seq=accrocher|cinglage|trebucher|balustrade|signal&code=CBA` : un geste
  décomposé.
- Les fichiers livrés par Blender se contrôlent avant d'entrer dans le dépôt : `node tools/modele/controle.mjs
  fichier.glb` (règles dans `src/render/conformite.js`, tirées de `docs/3d/brief-blender.md`) et
  `tools/modele.html?fichier=…` pour les voir. Lecteur .glb : `three/addons/loaders/GLTFLoader.js` (vendor).

## Repères du code

- Repère : x le long de la piste, y en travers (y positif côté caméra et table de marque), mètres.
  En 3D, y du jeu devient Z.
- `state.teams[t].dir` : +1 si l'équipe attaque vers x positif ; les équipes changent de côté à la mi-temps.
- Phases : `pregame`, `faceoff`, `play`, `whistle`, `timeout`, `goal`, `break`, `shootout`, `final`. `state.period` vaut 3 en
  prolongation ; `state.result` dit comment le match s'est fini. Un arrêt de jeu pendant un tir de pénalité
  termine le tir (`stopPlay`, `goalCrossed`) : tout nouvel arrêt doit passer par eux.
- Patinage : `moveSkaters` (physics.js) lit `p.ctl` (mx, my, skid, dodge, check, back). Le joueur roule dans
  l'axe de `p.face` ; ne pas réintroduire de glisse dans toutes les directions.
- Le palet a une hauteur (`puck.z`, `puck.vz`) : tout nouveau contact avec le palet doit en tenir compte.
- Figurines : `poseFigure` (figures.js) calcule les articulations ; `model.js` pose dessus les os du modèle 3D.
  Les longueurs du corps viennent de `userData.dims` : ne pas remettre de longueur en dur dans la pose.
- Saison : `src/sim/season.js` (calendrier, résultats, classement), sans navigateur ; l'écran et la sauvegarde
  locale sont dans `src/ui/season.js`. Un match de saison se crée par `seasonMatch`, jamais de nul.
  Phase finale dans `season.post` (séries et barrage) ; l'équipe du barrage s'obtient par `teamById('n1')`,
  elle n'est pas dans `TEAMS`.
- Lignes : `p.line` (0 ou 1), `state.teams[t].line` et `.fresh` ; les changements passent par `setLine`
  (rules.js) et n'ont lieu qu'aux arrêts de jeu, dans `beginFaceoff`.
- Ambiance : public dans `src/render/crowd.js` (silhouettes dessinées en lot) ; ralenti du but et qualité dans
  `view.js` (`record`, `startReplay`, `setQuality`). Pendant un ralenti, `main.js` n'avance pas la logique :
  le match est identique avec ou sans. Toute nouvelle donnée lue par l'affichage s'ajoute à `P_FIELDS`.
- Fautes à l'écran : la logique émet `foul` (code, fautif, victime) ; `view.js` en tire le geste du fautif
  (`foul`), la réaction de la victime (`react`, table `REACT`) et les gestes officiels des arbitres (`todo`,
  avec passage à la table de marque) ; les poses sont dans `poseFigure` et `SIGNALS` (figures.js).
  Animations enregistrées : `tools/modele/animation.py` convertit un .glb en trajectoires d'articulations
  (`assets/anim/*.json`), `assets/anim/index.json` dit quelle réaction joue laquelle ; `poseFigure` les mélange
  à la pose calculée (paramètre `clip`). Contrôle : `tools/poses.html?seq=clip&nom=essai-course`.
- Mode Arbitre : `src/sim/arbitrage.js` (sans affichage) observe les événements et en tire les situations
  (`Observateur`), note les réponses (`noter`, `bilan`) ; `src/ui/referee.js` tient le panneau, la révision et le
  rapport. Il ne touche jamais au match : `main.js` cesse d'avancer la logique tant que `arb.active`, et retient
  les événements du coup de sifflet jusqu'à la reprise (`deliver`). `cfg.rough` rend l'ordinateur plus rugueux.
  Révision vidéo dans `view.js` (`tapeT`, `clip`, `startReview`, `reviewSeek`, `pick`, `marks`).
  Arbitre réel : `cfg.referee === 'humain'` ; `callFoul` et `goalCrossed` ne sanctionnent plus, ils notent dans
  `state.seen` ; l'arbitre commande par `refWhistle`, `refArm`, `refDecide`, `refGoal` (rules.js) et rien ne reprend
  tant que `state.ref.wait` est posé ; `Journal` (arbitrage.js) rapproche `state.seen` des décisions. Toute
  nouvelle sanction automatique doit passer par `callFoul` pour rester muette en arbitre réel.
- Modèles de Blender : `assets/3d/` (notes de livraison dans `docs/3d/livraisons/`). `src/render/perso.js` les lit
  et monte un patineur (`patineur` : corps teinté par le masque de zones, texture de tenue avec numéro et nom,
  tête et casque sur `Prop_Tete`, crosse sur `Prop_MainGauche`). Contrôle : `tools/perso.html` (`?tous=1`,
  `?vue=face|dos|cote`, `?anim=…`, `?palette=0.6`). Dans le match, `loadSkaterModel` remplace le patineur de `model.js`
  avec le même contrat (`instantiate`, `drive`, `dims`) : les os de Blender sont posés sur les articulations de
  `poseFigure`. `prepare(joueurs, tenues, équipes)` charge les textures des seuls joueurs du match. Contrôle :
  `tools/poses.html?modele=blender`. `loadSkaterModel('gardien' | 'arbitre')` et `loadStick` font de même pour le
  gardien (jambières, mitaine, bouclier, casque), les arbitres et les crosses. Gestes enregistrés de Blender :
  `boneAnim` (view.js) choisit le geste d'un patineur (chute, relevé, réaction, geste fautif, tir, passe, coup de
  crosse) et le passe à `poseFigure` (`anim: { name, t, w, full }`) ; `drive` fond les os de la pose calculée vers
  le geste (`full` : corps entier, sinon le haut du corps) et la crosse suit la main du haut. Contrôle :
  `tools/poses.html?modele=blender&seq=os&nom=Chute_Avant&corps=1` (`&qui=gardien|arbitre`). De même `goalieAnim`
  (base et pas de côté devant la cage, puis `goalieGeste` : arrêts, extension, papillon, gel du palet, garde des
  poteaux et passages) et `refAnim` (gestes officiels, bras levé). Garde des poteaux : `drawPlayers` ancre le gardien
  dans le repère de la cage (`POTEAU_X`, `POTEAU_Z`, `ge.anc`), le geste porte `depl` pour que `drive` garde le
  déplacement du bassin ; regard du gardien par le cou et la tête (`look`, `regarder` dans perso.js). Restent
  calculés : patinage, gardien loin de sa cage, bancs, célébrations. Décor : `loadDecor` (salle, cage, palet) est passé à
  `MatchView` puis à `buildArena` (`arenaFromModel` dans arena.js) ; ce qui gêne la caméra du match (plafond,
  côté caméra de la balustrade, table de marque) est effacé ou rendu translucide dans le shader. Public :
  `crowd.js` garde la logique (qui réagit à quoi) ; avec le public de Blender, chaque spectateur est figé dans
  trois poses tirées des animations et dessiné en lot (`figer`, `buildModel`), seul le kop (drapeaux) est animé
  os par os. Filets : `src/render/filet.js` gonfle les clés de forme du maillage `Filet` de la cage d'après le palet
  affiché (but : trajectoire prolongée, car la logique arrête le palet dans la cage). Bancs et prison : `Assis_Banc`, `Assis_Prison`, joueurs placés sur les bancs du décor dans `view.js`.
- Jeu en ligne : `serveur/` tourne sous Node sur thnas, sans dépendance (`ws.mjs` : WebSocket écrit à la main ;
  `salon.mjs` : salons, sièges, coupures, limites ; `elite27-serveur.mjs` : point d'entrée, écoute sur 127.0.0.1).
  Le match y avance avec `step` de `src/sim/` ; `src/net/protocole.js` dit ce qui est envoyé (`instantane`) et
  comment un navigateur l'applique à son état (`appliquer`). Tout champ nouveau de l'état lu par l'affichage
  doit y être transmis. Dans le navigateur : `src/ui/enligne.js` (écrans, liaison, bandeaux, réactions) ; `main.js`
  n'avance pas la logique en ligne (`net`), il applique les instantanés. Une revanche ou un retour recharge la page
  (`?enligne=1`, partie gardée dans `sessionStorage`). Essai local : `node serveur/elite27-serveur.mjs` puis
  `?serveur=ws://127.0.0.1:8127/partie`. Réactions des spectateurs : liste fermée `REACTIONS` (protocole.js),
  vérifiée par `Salon.reagir`. Cinq places par salon (0-1 équipe qui reçoit, 2-3 visiteurs, 4 arbitre) : chaque
  joueur humain porte sa place (`h.seat`), les commandes sont rangées par place ; deux humains d'une équipe ne
  dirigent jamais le même patineur (`takenByMate`, `taker` dans match.js). Arbitre à distance : `Salon.arbitrer`
  vérifie (`lireDecision`) puis appelle `refWhistle`/`refArm`/`refDecide`/`refGoal`, tient le `Journal` et envoie le
  rapport à la fin ; `state.ref` est transmis, `state.seen` jamais ; `RefereeMode` reçoit `hooks.distant` (commandes
  vers le serveur) ou `hooks.lecture` (rapport seul). Arbitre en formation (`role`, `salon.formation`) : l'ordinateur
  arbitre, l'`Observateur` tourne sur le serveur, qui envoie chaque `situation` à la seule place 4 et note la réponse
  (`repondre`, `bilanFormation`) ; `hooks.formation` côté navigateur, `main.js` retient les instantanés pendant la
  réponse (25 s au plus, `retenus`) puis rattrape le direct. Ni discussion, ni pseudo, ni liste des parties, ni texte libre : ne pas en ajouter
  sans cahier des charges.
- Nom du porteur : `etiqueter` (view.js) écrit dans `#noms`, en bas de l'écran, le nom du porteur du palet, à défaut
  celui du joueur dirigé depuis cet écran (`view.seat`, `view.moi`) ; `view.noms` (pause) l'affiche ou le masque.
- Jeu simple (mode mobile) : `cfg.simple` ; `simplifier` (match.js) donne aux trois boutons leur double rôle,
  toute commande nouvelle doit y être rangée ou coupée. Au doigt : `src/input/tactile.js` (manche, trois boutons,
  pause), lu par `Input.read(0)` ; `estTactile()` (`?tactile=1` pour essayer) règle le menu, la qualité et les
  modèles allégés ; `index.html` ne charge `main.js` qu'après l'avis sur un écran tactile. En ligne : `simple` à la création
  (`Salons.reglages`), repris dans `depart` ; au doigt, `enligne.js` ne laisse prendre place que dans une partie simple.
- Sons : `src/audio/sound.js` écoute `state.events`, comme l'affichage ; aucun fichier audio, tout est synthétisé.
- Sanctions : toute pénalité passe par `assess` (rules.js), qui tient le cumul du joueur (`minors`, `stick`,
  `misc`) ; les méconduites sont dans `state.teams[t].misconducts` (joueur au banc mais remplacé ; les pénalités
  simultanées y sont aussi, avec leur code). Un tir de
  pénalité en cours de match réutilise la phase `shootout` avec `state.so.single`.
- Gardien sorti pendant l'avantage : `pullGoalie` (rules.js, appelé à chaque pas de jeu) fait partir le gardien
  (`g.pull` : 1 en route, 2 au banc) et entrer un patineur (`p.extra`) ; `restoreGoalies` remet tout en place à
  l'arrêt de jeu (`beginFaceoff`, tirs). Même mécanique en fin de match pour l'équipe menée de peu (`lateTrail`,
  `team.pullWant`, commande `pull` ; `g.pull` 3 : rappelé, il rentre) ; `keepLatePull` la fait repartir à cinq. Tout code qui lit `goalieOf` doit admettre un gardien hors de sa cage.
- Sprint : commande `sprint`, jauge `p.breath` (`breathe` dans physics.js : `sprinting`, `spent`, `winded`) ; il
  accélère l'usure de la ligne (`tickFatigue`). En ligne, seule la jauge arrondie est transmise.
- Fautes : `callFoul` (rules.js) gère l'avantage ; les contacts sont jugés dans `judgeContact` (physics.js),
  une charge n'existe que si le joueur l'a lancée (`checkT`),
  les vols de palet fautifs dans `doSteal`.
