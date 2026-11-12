# Élite 27

Jeu de roller hockey en 3D dans le navigateur, avec les équipes de la Ligue Élite 2026-2027.
Cahier des charges validé : [docs/specs/001-elite27.md](docs/specs/001-elite27.md).

État : **étape 1 — le match** (Aiglons de Valence contre Diables de Rethel, 1 ou 2 joueurs sur le même écran).

## Lancer le jeu

Le jeu est fait de fichiers statiques, sans étape de construction ni dépendance à installer.

```sh
python3 tools/serveur.py
```

Puis ouvrir http://localhost:8027 dans Firefox ou Chrome. N'importe quel serveur de fichiers statiques
convient ; ouvrir `index.html` directement depuis le disque ne marche pas (les modules JavaScript demandent
un serveur).

Adresses utiles :

- `?demo=1` : match de démonstration, ordinateur contre ordinateur.
- `?go=1&humans=2&difficulty=difficile&period=300` : démarre sans passer par le menu.

## Commandes

| Action | Joueur 1 | Joueur 2 | Manette |
| --- | --- | --- | --- |
| Se déplacer | Z Q S D | Flèches | Stick gauche |
| Passe | F | K | A |
| Tir (maintenir pour tirer plus fort ; chargé, le palet se lève) | G | L | X |
| Feinte de tir | F pendant que G charge | K pendant L | A pendant X |
| Tir sur réception | G enfoncé avant que la passe arrive | L | X |
| Michigan | maintenir G une seconde derrière la cage adverse, à l'arrêt, puis relâcher | L | X |
| Vol de palet | H | M | B |
| Charge | E | O | RT |
| Esquive (avec une direction) | Espace | Entrée | Y |
| Défense à genou (maintenir) | C | U | LT |
| Dérapage (maintenir) | Maj gauche | Maj droite | RB |
| Changer de patineur | R | I | LB |
| Pause | Échap | Échap | Start |

Les touches sont repérées par leur position : sur un clavier QWERTY, Z Q S D devient W A S D.
Seul, le joueur 1 peut aussi se déplacer avec les flèches. La première manette pilote le joueur 1, la
seconde le joueur 2.

## Modèle 3D des patineurs

Les patineurs et les arbitres utilisent `assets/joueur.*` et `assets/arbitre.*` : des personnages générés avec Meshy (le gardien, sans jambières : `assets/gardien.*` ; ses jambières : `assets/jambiere.*`, posées sur les tibias)
(debout bras écartés, maillot blanc uni), allégé de 970 000 à moins de 20 000 triangles et doté d'un squelette
par `tools/modele/convertir.py` (numpy et Pillow seulement). Le fichier d'origine, 49 Mo, n'est pas dans le dépôt.

    python3 tools/modele/convertir.py chemin/vers/joueur.glb assets/joueur

Le jeu teinte le maillot aux couleurs de l'équipe et anime le corps avec la même pose que les joueurs
simplifiés (`src/render/model.js`). Au menu, « Joueurs :
Simplifiés » revient aux figurines ; c'est aussi ce qui s'affiche si le modèle ne se charge pas.
`tools/poses.html?modele=1` montre toutes les poses avec le modèle.

## Saison

Le bouton « Saison » du menu lance les 18 journées de la phase de qualification avec « Ton équipe », la
difficulté et la durée choisies. La saison est gardée dans le navigateur (mémoire locale, clé `elite27.saison`) :
une seule à la fois, sans compte. Le calendrier est fabriqué par le jeu (`schedule`, `src/sim/season.js`), ce
n'est pas le calendrier officiel. Les matchs des autres équipes sont joués par l'ordinateur sans affichage,
avec la même logique que les vrais matchs. Après la 18e journée viennent les play-offs (quarts, demi-finales,
finale, au meilleur des trois matchs) et le barrage du 9e contre « 2e de Nationale 1 », une équipe sans nom de
club (`N1_TEAM`, `src/data/teams.js`). Une nouvelle saison repart toujours avec les dix mêmes clubs.

Choix du jeu : le goal-average particulier est la différence de buts dans les matchs entre les équipes à
égalité de points ; un match gagné aux tirs de pénalité compte pour un but d'écart.

## Tests

```sh
npm test            # tests automatiques de la logique (Node 22, aucune dépendance)
npm run simulate    # 10 matchs ordinateur contre ordinateur, avec un bilan
```

## Organisation

| Dossier | Contenu |
| --- | --- |
| `src/sim/` | Logique du match, sans navigateur : terrain, patinage, palet, gardiens, arbitrage, ordinateur. Tournera telle quelle sur le serveur pour le jeu en ligne. |
| `src/render/` | Affichage 3D (Three.js) : salle, figurines, caméra. Ne fait que lire l'état de la logique. |
| `src/ui/`, `src/input/` | Affichage du score et des décisions, clavier et manette. |
| `src/data/` | Équipes (couleurs, salles, joueurs, notes) et infractions (codes, articles, gestes). Modifiable sans toucher au code. |
| `vendor/three/` | Three.js r187 embarqué (licence MIT). |
| `tests/` | Tests de la logique et simulateur de matchs. |

## Règles appliquées

Règlement sportif Roller Hockey FFRS (partie III, édition 2023-2024), règlement particulier des
compétitions 2026-2027 et règlement des équipements sportifs 2024-2025. Le détail, article par article,
est dans le cahier des charges.

Choix du jeu là où le règlement laisse l'arbitre juger :

- La gravité d'une charge dépend de la vitesse du choc (seuils dans `src/sim/physics.js`, `judgeContact`).
- « Une équipe en possession dans son camp doit avancer » (9.3.6) : le jeu siffle après 10 secondes sans
  adversaire à moins de 3 m.
- Durées de pénalité proportionnelles à la durée du match, arrondies à 5 secondes.
- Vol de palet : la palette va chercher la palette adverse, ce qui est permis. Ce que la crosse rencontre
  décide de la suite (`doSteal`) : de face ou de côté elle atteint le palet ; par l'arrière elle traverse le
  porteur, accrocher (10.4.25) ; sur un joueur sans palet, cinglage (10.4.22) ; manqué à pleine vitesse,
  faire trébucher (10.4.26).
- Gardien : il lui faut environ un quart de seconde pour réagir à un tir, puis il descend en papillon et
  glisse sur la trajectoire (réglages `goalieReact` et `butterfly`).
- Deux lignes de quatre patineurs, changées aux arrêts de jeu seulement. La fatigue est un choix du jeu : une
  ligne passe de fraîche à épuisée en un tiers de période de jeu, récupère aussi vite sur le banc, et perd au
  plus 10 % de vitesse et de force de tir (`form`, `src/sim/state.js`). En automatique, la ligne la plus fraîche
  entre quand l'écart dépasse un quart (`LINE_GAP`). Chaque période commence avec la ligne 1 ; en
  prolongation, les trois premiers de la ligne la plus fraîche jouent sans changer.
- Match à égalité (réglage « Égalité » du menu) : prolongation en mort subite à 3 contre 3, puis trois tirs de
  pénalité par équipe et mort subite (`src/sim/shootout.js`). Le texte des articles 5.4.1 et 5.4.3 du règlement
  sportif, auxquels renvoie le règlement particulier, n'a pas pu être relu en ligne : le déroulement suit le
  cahier des charges. Choix du jeu : l'équipe qui reçoit tire la première ; un tir de pénalité est limité à
  8 secondes ; la prolongation dure un cinquième d'une période (25 secondes au moins) ; le vainqueur des tirs
  gagne d'un but au score final.
- Patinage sur roues (`moveSkaters`) : le joueur roule dans l'axe de ses patins et tourne en carre, sur un
  arc d'environ 3 m de rayon à pleine vitesse ; le dérapage l'arrête en une demi-seconde ; un défenseur qui
  s'éloigne d'un porteur proche recule en lui faisant face.
- La charge est volontaire : sans la touche de charge, un choc ne donne ni chute ni pénalité pour charge.
  Une charge sur un joueur sans palet est une obstruction ; le contact avec le gardien dans sa zone reste jugé.
- Palet levé : à partir de 45 % de charge le tir monte. Le papillon ferme le bas et découvre le haut ; debout,
  le gardien couvre mieux le haut. Un palet en l'air ne se contrôle pas à la crosse, donc la crosse haute ne
  se présente pas dans le jeu.
- Michigan : derrière la ligne de but adverse, à moins de 3,2 m de l'axe, presque à l'arrêt, sans adversaire à
  moins de 1,5 m, tir maintenu une seconde. L'ordinateur le tente rarement, en difficile seulement.
- Changement de patineur automatique (réglage au menu, activé par défaut) : sans le palet, le joueur prend le
  patineur plus proche du palet d'au moins 1,5 m, après une demi-seconde et jamais au milieu d'un geste.
- Position de défense : un genou au sol, la crosse à plat barre 2 m au ras du sol ; le corps contre jusqu'à
  0,90 m de haut. Le joueur glisse puis s'arrête, pivote lentement, met un tiers de seconde à se relever.
  Un palet lent arrêté ainsi est contrôlé et le joueur se relève : il ne peut pas l'immobiliser.
- Placement de l'ordinateur : carré défensif devant la cage quand le palet est dans la zone (triangle à trois),
  carré offensif en zone d'attaque (deux arrières en haut, un avant devant le but, un relais bas), et jeu
  derrière la cage pour servir l'enclave ou ressortir de l'autre côté.
