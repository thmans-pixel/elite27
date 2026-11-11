# Élite 27

Jeu de roller hockey en 3D dans le navigateur, avec les équipes de la Ligue Élite 2026-2027.
Cahier des charges validé : [docs/specs/001-elite27.md](docs/specs/001-elite27.md).

État : **étape 1 — le match** (Aiglons de Valence contre Diables de Rethel, 1 ou 2 joueurs sur le même écran).

## Lancer le jeu

Le jeu est fait de fichiers statiques, sans étape de construction ni dépendance à installer.

```sh
python3 -m http.server 8027
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
| Tir (maintenir pour tirer plus fort) | G | L | X |
| Vol de palet | H | M | B |
| Changer de patineur | R | I | LB |
| Pause | Échap | Échap | Start |

Les touches sont repérées par leur position : sur un clavier QWERTY, Z Q S D devient W A S D.
Seul, le joueur 1 peut aussi se déplacer avec les flèches. La première manette pilote le joueur 1, la
seconde le joueur 2.

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
- Placement de l'ordinateur : carré défensif devant la cage quand le palet est dans la zone (triangle à trois),
  carré offensif en zone d'attaque (deux arrières en haut, un avant devant le but, un relais bas), et jeu
  derrière la cage pour servir l'enclave ou ressortir de l'autre côté.
