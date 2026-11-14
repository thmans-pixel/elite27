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

## Affichage

Réglage « Qualité » au menu : Haute, Moyenne, Basse, ou Automatique (départ en Haute, un cran de moins si le
jeu ne tient pas 40 images par seconde sur quatre secondes de jeu ; pas de remontée en cours de match).
La touche F3 affiche les images par seconde. Après un but, les trois dernières secondes sont rejouées à
mi-vitesse (réglage « Ralentis ») ; la logique du match attend pendant ce temps.

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

## En ligne

Le jeu est en ligne à https://elite27.izicraft.fr (site statique YunoHost sur thnas, copie de la branche `main`).
Pour mettre à jour le site après avoir fusionné une demande, sur thnas :

```bash
sudo bash ~/elite27-mettre-a-jour.sh /var/www/my_webapp__3/www
```

Le script (`tools/deploiement/mettre-a-jour.sh`) ne copie que le jeu : ni outils, ni tests, ni documents. La
version en ligne est affichée en bas du menu. Un simple rechargement de la page suffit à la voir.

### Jouer en ligne

« Jouer en ligne » au menu : celui qui crée la partie reçoit un code de quatre lettres ; les autres le tapent pour
rejoindre, et jusqu'à six personnes peuvent regarder avec le même code. Une partie a cinq places : deux joueurs par
équipe et un arbitre. Chacun choisit la sienne dans l'écran d'attente ; une équipe vide est jouée par l'ordinateur,
et sans arbitre c'est l'ordinateur qui arbitre. Deux coéquipiers dirigent chacun un patineur différent.

Choix du jeu pour l'arbitre à distance (le règlement ne dit rien d'un arbitre qui ne répond pas) : il a
45 secondes pour décider après son coup de sifflet ; passé ce délai le jeu reprend par un engagement sans
sanction, et un but en attente est accordé ou refusé comme l'ordinateur l'aurait fait. Le match tourne dans `serveur/` (Node,
sans dépendance) avec la logique de `src/sim/`. Ni compte, ni pseudo, ni discussion : les spectateurs n'ont que six
réactions toutes faites (« Bien joué ! », « Bouh ! », « Prison ! »…), que chacun peut masquer depuis le menu
ouvert par Échap. Tant que le programme de match n'est pas installé sur thnas, le bouton répond que le jeu en
ligne n'est pas disponible ; le reste du jeu n'en dépend pas.

Sur thnas, le programme de match est le service `elite27-partie` (compte sans droits, écoute sur 127.0.0.1:8127,
relancé seul) ; nginx lui passe `/partie`. Il s'installe une fois par
`sudo bash /var/lib/elite27/source/tools/deploiement/installer-partie.sh`, et la mise à jour du site le relance
quand la version change (les parties en cours sont alors coupées). Journal : `journalctl -u elite27-partie`. Le service garde le chemin
du Node trouvé à l'installation : si YunoHost retire cette version de Node, relancer le script d'installation.

Essai sur une seule machine : `node serveur/elite27-serveur.mjs`, `python3 tools/serveur.py`, puis ouvrir
`http://localhost:8027/?serveur=ws://127.0.0.1:8127/partie` dans deux fenêtres.

## Modèles 3D

Les personnages, les tenues des dix clubs, les animations, la salle et le public sont produits dans Blender
d'après `docs/3d/brief-blender.md` et rangés dans `assets/3d/` (notes de livraison dans `docs/3d/livraisons/`).
Un match charge environ 30 Mo, 37 Mo en qualité basse (budget : 40 Mo). Si un fichier manque, l'ancien modèle
correspondant le remplace.

Choix du jeu :

- La caméra du match est plus haute que le plafond de la salle : plafond, poutres et rampes ne sont pas dessinés
  pour elle, et la balustrade côté caméra est translucide.
- Le public est figé dans trois poses tirées des animations (assis, mains jointes, debout bras levés) ; seul le
  kop, avec les drapeaux du club qui reçoit, est animé en continu.
- Le match n'immobilise un joueur que 0,7 à 0,9 seconde après une chute : l'animation de chute est accélérée pour
  tenir dans ce temps, et le relevé dure 0,55 seconde.
- Écussons, enseignes et marques de matériel sont inventés.

## Mode Arbitre

Bouton « Arbitrer » du menu : deux équipes de l'ordinateur jouent, tu tiens le sifflet.

- **Arbitre assisté** (disponible) : le jeu s'arrête sur chaque faute qu'il a vue et sur quelques actions
  régulières qui y ressemblent. Tu décides : faute ou pas, le fautif (clic sur le joueur ou liste), l'infraction,
  la sanction, l'engagement. Le jeu corrige avec l'article, le code et le geste, puis le match reprend avec la
  décision correcte : tes réponses ne changent pas le match.
- **Arbitre réel** : le jeu ne siffle plus aucune faute et n'accorde plus aucun but. Pendant le jeu, une barre
  en bas de l'écran : **Siffler** (Espace), ou **signaler une faute bras levé** contre l'une des deux équipes
  (B ou N) : le jeu continue jusqu'à ce que cette équipe contrôle le palet (avantage, 10.3). Une fois le jeu
  arrêté, tu désignes le fautif, l'infraction (liste complète, par famille), la sanction et l'engagement : c'est
  appliqué tel quel, même si c'est faux. À chaque palet dans la cage, tu accordes ou refuses le but. Le jeu
  gère seul le reste (gardien qui bloque le palet, fin de période, changements, temps morts). Pendant ce temps
  l'ordinateur note en silence ce qu'il voit ; rien n'est corrigé avant le rapport.
- **Revoir l'action** : les 8 dernières secondes sous quatre points de vue, avec pause, ralenti et image par
  image (Espace, flèches, R pour le début, V pour changer de vue ; chiffres pour répondre, Entrée pour reprendre).
- **Rapport de fin de match** : ce que le jeu a vu en face de ce que tu as sifflé, une note sur 20, et chaque
  ligne se rejoue. En réel s'y ajoutent les fautes manquées, les sifflets à tort, les avantages coupés et les
  buts accordés ou refusés à tort. La meilleure note de chaque façon d'arbitrer est gardée dans le navigateur.

Choix du jeu, à connaître :

- Le règlement FFRS ne prévoit pas d'arbitrage vidéo. La révision est une aide du jeu pour apprendre à voir
  les fautes, pas une règle.
- En mode Arbitre, les équipes de l'ordinateur jouent plus rugueux (plus de charges et de vols de palet
  risqués), d'autant plus que le match est court, pour qu'il y ait de quoi juger : 10 à 12 situations à partir
  de 2 × 5 min, 5 à 11 en 2 × 2 min. En arbitre réel elles le sont nettement moins, parce qu'il faut tout voir
  en direct. Dans un match long, le jeu ne
  présente pas toutes les fautes : 12 situations au plus, les autres sont sifflées sans question.
- Une faute suivie d'un but de l'équipe non fautive (mineure non purgée, 10.3 D) n'est pas présentée.
- En réel, la révision vidéo n'est disponible qu'une fois le jeu arrêté ; le rapport dit combien de fois elle a
  servi. Une faute vue par le jeu et pas sifflée dans les six secondes est « manquée ». Quand l'équipe non
  fautive avait le palet, il fallait lever le bras : l'avantage bien laissé vaut un point de plus.
- En réel, le tireur d'un tir de pénalité est la victime vue par le jeu, ou à défaut l'adversaire le plus
  proche du fautif. Un but valable accordé n'entre pas dans la note.
- Barème : faute ou pas 2 points, fautif 1, infraction 1 (un demi-point pour une infraction de la même
  famille de geste), sanction 1, engagement 1.

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
| `vendor/three/` | Three.js r187 embarqué (licence MIT) ; dans `addons/`, le lecteur de fichiers .glb de la même version. |
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
- Tir de pénalité en cours de match (10.4.11) : « plus que le gardien devant lui » veut dire qu'aucun patineur
  adverse n'est plus près de la ligne de but que le porteur, et « par l'arrière » que le fautif est derrière lui.
  Fautes concernées : accrocher, faire trébucher, charge dans le dos. Le jeu siffle tout de suite, sans laisser
  l'avantage. Cumul (10.1.7) : les fautes de crosse comptées sont crosse haute, cinglage, accrocher, charge avec
  la crosse et piquage (`STICK_FOULS`). Le gardien n'est pas concerné par le cumul, faute de gardien remplaçant.
  Une équipe réduite à deux patineurs en état de jouer ne perd plus personne : la pénalité est notée, pas purgée.
- Temps mort (9.3.2) : cinq secondes à l'écran quelle que soit la durée du match. Son effet est un choix du
  jeu : l'équipe qui le demande retrouve toute sa fraîcheur, l'adversaire la moitié de ce qui lui manque.
  L'ordinateur le prend quand ses deux lignes sont sous 70 %, dans le dernier tiers de la période, s'il ne
  mène pas. Pénalités simultanées (10.1.9) : seules les pénalités de même gravité se compensent, par paires.
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
