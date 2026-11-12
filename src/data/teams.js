// Données des équipes. Ce fichier se modifie sans toucher au code du jeu.
// Les noms de joueurs sont inventés. Les notes du cahier des charges vont de 1 à 5 (ici de 2,5 à 4, pour un
// écart de niveau limité) ; `notes(n)` les ramène de 0 à 1 pour la logique du jeu.
// Tenues relevées sur les captures fournies par Thibault le 12 novembre 2026 (voir le cahier des charges).
// `bas` est facultatif : sans lui, les bas ont la couleur du maillot.

const notes = (n) => ({ vitesse: n / 5, tir: n / 5, gardien: n / 5 });
const NOIR = '#141414';
const BLANC = '#f4f4f4';

export const TEAMS = {
  valence: {
    id: 'valence',
    ville: 'Valence',
    surnom: 'Aiglons',
    nom: 'Aiglons de Valence',
    sigle: 'VAL',
    salle: 'Gymnase Denis Morin',
    // Maillot rouge à domicile, aigle noir et blanc, détails noirs, casque rouge (captures de Valence - Vierzon).
    domicile: { maillot: '#c8102e', epaules: '#111111', numero: '#ffffff', casque: '#c8102e', casqueGardien: '#f4f4f4', pantalon: '#141414' },
    // Maillot blanc à épaules noires à l'extérieur.
    exterieur: { maillot: '#f4f4f4', epaules: '#111111', numero: '#111111', casque: '#c8102e', casqueGardien: '#f4f4f4', pantalon: '#141414' },
    notes: notes(4),
    joueurs: [
      { num: 9, nom: 'Faure' },
      { num: 17, nom: 'Roche' },
      { num: 7, nom: 'Morel' },
      { num: 21, nom: 'Vidal' },
      { num: 11, nom: 'Giraud' },
      { num: 14, nom: 'Besson' },
      { num: 23, nom: 'Carle' },
      { num: 27, nom: 'Brun' },
    ],
    gardien: { num: 30, nom: 'Astier' },
  },
  rethel: {
    id: 'rethel',
    ville: 'Rethel',
    surnom: 'Diables',
    nom: 'Diables de Rethel',
    sigle: 'RET',
    salle: 'Gymnase André Chausson',
    // D'après les captures fournies le 12 novembre 2026 : noir à parements rouges à domicile (diable rouge),
    // blanc à l'extérieur, numéros rouges, culotte noire.
    domicile: { maillot: '#17171a', epaules: '#17171a', numero: '#e02030', casque: '#141414', pantalon: '#141414' },
    exterieur: { maillot: '#f4f4f4', epaules: '#f4f4f4', numero: '#d01f2c', casque: '#141414', pantalon: '#141414' },
    notes: notes(4),
    joueurs: [
      { num: 10, nom: 'Noël' },
      { num: 19, nom: 'Perrin' },
      { num: 4, nom: 'Lambert' },
      { num: 22, nom: 'Gaillard' },
      { num: 8, nom: 'Collin' },
      { num: 12, nom: 'Hubert' },
      { num: 16, nom: 'Maillard' },
      { num: 88, nom: 'Marchal' },
    ],
    gardien: { num: 1, nom: 'Renaud' },
  },
  villeneuve: {
    id: 'villeneuve',
    ville: 'Villeneuve',
    surnom: 'Fous du Bitume',
    nom: "Fous du Bitume de Villeneuve",
    sigle: 'VIL',
    salle: "Salle de Villeneuve",
    // Turquoise à épaules noires à domicile ; blanc à motifs noirs et turquoise à l'extérieur.
    domicile: { maillot: '#19b5b0', epaules: NOIR, numero: '#ffffff', casque: NOIR, pantalon: '#19b5b0' },
    exterieur: { maillot: BLANC, epaules: NOIR, numero: '#0f8f8b', casque: NOIR, pantalon: BLANC, bas: '#19b5b0' },
    notes: notes(3.5),
    joueurs: [
      { num: 13, nom: 'Delcourt' },
      { num: 71, nom: 'Wattel' },
      { num: 5, nom: 'Lemaire' },
      { num: 24, nom: 'Dubois' },
      { num: 18, nom: 'Caron' },
      { num: 9, nom: 'Leroy' },
      { num: 44, nom: 'Flament' },
      { num: 77, nom: 'Vasseur' },
    ],
    gardien: { num: 31, nom: 'Carpentier' },
  },
  vierzon: {
    id: 'vierzon',
    ville: 'Vierzon',
    surnom: 'Prédateurs',
    nom: "Prédateurs de Vierzon",
    sigle: 'VIE',
    salle: "Salle de Vierzon",
    // Tout rouge à domicile, casque rouge. Tenue extérieure actuelle à confirmer : blanc et noir en attendant.
    domicile: { maillot: '#d3202c', epaules: '#d3202c', numero: '#ffffff', casque: '#c8102e', pantalon: '#d3202c' },
    exterieur: { maillot: BLANC, epaules: NOIR, numero: '#d3202c', casque: '#c8102e', pantalon: NOIR },
    notes: notes(3.5),
    joueurs: [
      { num: 15, nom: 'Berthier' },
      { num: 6, nom: 'Moreau' },
      { num: 28, nom: 'Auclair' },
      { num: 91, nom: 'Pinson' },
      { num: 3, nom: 'Chollet' },
      { num: 20, nom: 'Jacquet' },
      { num: 47, nom: 'Rabier' },
      { num: 81, nom: 'Bedu' },
    ],
    gardien: { num: 33, nom: 'Guillot' },
  },
  grenoble: {
    id: 'grenoble',
    ville: 'Grenoble',
    surnom: "Yeti's",
    nom: "Yeti's de Grenoble",
    sigle: 'GRE',
    salle: "Salle de Grenoble",
    // Bleu roi à parements rouges, culotte et casque rouges à domicile ; gris très clair à l'extérieur.
    domicile: { maillot: '#1f4fc4', epaules: '#1f4fc4', numero: '#ffffff', casque: '#c8102e', pantalon: '#c8102e' },
    exterieur: { maillot: '#dcdde0', epaules: '#dcdde0', numero: '#c8102e', casque: '#c8102e', pantalon: '#1b1b1f', bas: '#c8102e' },
    notes: notes(3),
    joueurs: [
      { num: 2, nom: 'Blanc' },
      { num: 26, nom: 'Reynaud' },
      { num: 63, nom: 'Martinet' },
      { num: 8, nom: 'Charvet' },
      { num: 19, nom: 'Rey' },
      { num: 55, nom: 'Bouvier' },
      { num: 12, nom: 'Jourdan' },
      { num: 90, nom: 'Michallet' },
    ],
    gardien: { num: 35, nom: 'Perret' },
  },
  epernay: {
    id: 'epernay',
    ville: 'Épernay',
    surnom: 'Bombardiers',
    nom: "Bombardiers d'Épernay",
    sigle: 'EPE',
    salle: "Salle d'Épernay",
    // Noir à motifs vert fluo ou blanc à motifs, casque blanc. Laquelle est à domicile : à confirmer (noir en attendant).
    domicile: { maillot: '#161618', epaules: '#161618', numero: '#7ddc1f', casque: BLANC, pantalon: NOIR, bas: '#7ddc1f' },
    exterieur: { maillot: '#f1f1ee', epaules: '#f1f1ee', numero: '#161618', casque: BLANC, pantalon: NOIR, bas: '#7ddc1f' },
    notes: notes(3),
    joueurs: [
      { num: 29, nom: 'Henry' },
      { num: 7, nom: 'Lallement' },
      { num: 42, nom: 'Jacquot' },
      { num: 11, nom: 'Barbier' },
      { num: 66, nom: 'Petit' },
      { num: 17, nom: 'Chardon' },
      { num: 4, nom: 'Mangin' },
      { num: 93, nom: 'Simon' },
    ],
    gardien: { num: 40, nom: 'Royer' },
  },
  caen: {
    id: 'caen',
    ville: 'Caen',
    surnom: 'Conquérants',
    nom: "Conquérants de Caen",
    sigle: 'CAE',
    salle: "Salle de Caen",
    // Noir à parements rouges et or, bas rayés noir et or ; seconde tenue rouge à manches noires. Domicile à confirmer.
    domicile: { maillot: '#17171a', epaules: '#17171a', numero: '#d42027', casque: NOIR, pantalon: NOIR, bas: '#c9a227' },
    exterieur: { maillot: '#c8102e', epaules: NOIR, numero: '#ffffff', casque: NOIR, pantalon: NOIR },
    notes: notes(3),
    joueurs: [
      { num: 14, nom: 'Lefèvre' },
      { num: 25, nom: 'Marie' },
      { num: 9, nom: 'Duval' },
      { num: 72, nom: 'Hamel' },
      { num: 21, nom: 'Leroux' },
      { num: 36, nom: 'Fouquet' },
      { num: 10, nom: 'Lecomte' },
      { num: 58, nom: 'Vautier' },
    ],
    gardien: { num: 1, nom: 'Lebrun' },
  },
  anglet: {
    id: 'anglet',
    ville: 'Anglet',
    surnom: 'Artzak',
    nom: "Artzak d'Anglet",
    sigle: 'ANG',
    salle: "Salle d'Anglet",
    // Rouge à domicile (confirmé), culotte à confirmer (noire en attendant) ; blanc à épaules rouges à l'extérieur.
    domicile: { maillot: '#d0182b', epaules: '#d0182b', numero: '#ffffff', casque: BLANC, pantalon: NOIR },
    exterieur: { maillot: BLANC, epaules: '#d0182b', numero: '#d0182b', casque: BLANC, pantalon: BLANC },
    notes: notes(2.5),
    joueurs: [
      { num: 22, nom: 'Etcheverry' },
      { num: 8, nom: 'Duhalde' },
      { num: 64, nom: 'Lartigue' },
      { num: 16, nom: 'Darrigade' },
      { num: 5, nom: 'Mendiboure' },
      { num: 27, nom: 'Lasserre' },
      { num: 88, nom: 'Urruty' },
      { num: 13, nom: 'Sallaberry' },
    ],
    gardien: { num: 30, nom: 'Hirigoyen' },
  },
  pontdemetz: {
    id: 'pontdemetz',
    ville: 'Pont-de-Metz',
    surnom: 'Greenfalcons',
    nom: "Greenfalcons de Pont-de-Metz",
    sigle: 'PDM',
    salle: "Salle de Pont-de-Metz",
    // Noir à parements verts et blancs à domicile (déduit de la photo) ; blanc à parements verts et noirs à l'extérieur.
    domicile: { maillot: '#151716', epaules: '#151716', numero: '#ffffff', casque: NOIR, pantalon: NOIR, bas: '#1f9d55' },
    exterieur: { maillot: BLANC, epaules: BLANC, numero: '#1f9d55', casque: NOIR, pantalon: NOIR, bas: '#1f9d55' },
    notes: notes(2.5),
    joueurs: [
      { num: 13, nom: 'Devaux' },
      { num: 23, nom: 'Lenglet' },
      { num: 6, nom: 'Boulanger' },
      { num: 45, nom: 'Tellier' },
      { num: 18, nom: 'Cailleux' },
      { num: 70, nom: 'Hénon' },
      { num: 3, nom: 'Dumont' },
      { num: 96, nom: 'Sueur' },
    ],
    gardien: { num: 32, nom: 'Poiret' },
  },
  angers: {
    id: 'angers',
    ville: 'Angers',
    surnom: 'Hawks',
    nom: "Hawks d'Angers",
    sigle: 'AGS',
    salle: "Salle d'Angers",
    // Marinière blanche à rayures bleu marine (rendue en blanc, numéros et bas marine) ; seconde tenue blanche et rouge. Domicile à confirmer.
    domicile: { maillot: '#f2f2f0', epaules: '#f2f2f0', numero: '#1a2a52', casque: BLANC, pantalon: '#f2f2f0', bas: '#1a2a52' },
    exterieur: { maillot: BLANC, epaules: '#c8102e', numero: '#1a2a52', casque: BLANC, pantalon: '#c8102e' },
    notes: notes(3.5),
    joueurs: [
      { num: 16, nom: 'Brossard' },
      { num: 17, nom: 'Cesbron' },
      { num: 78, nom: 'Guérin' },
      { num: 24, nom: 'Bodin' },
      { num: 7, nom: 'Chauvin' },
      { num: 51, nom: 'Gautier' },
      { num: 9, nom: 'Poirier' },
      { num: 34, nom: 'Leduc' },
    ],
    gardien: { num: 39, nom: 'Ménard' },
  },
};

/** Les dix clubs dans l'ordre du menu. */
export const TEAM_IDS = Object.keys(TEAMS);

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
/** Écart entre deux couleurs (0 à 441). */
export function colourGap(a, b) {
  const [x, y] = [rgb(a), rgb(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

const SECOURS = [
  { maillot: BLANC, epaules: BLANC, numero: NOIR, casque: NOIR, pantalon: NOIR },
  { maillot: '#1b1b1f', epaules: '#1b1b1f', numero: '#ffffff', casque: NOIR, pantalon: NOIR },
];
export const KIT_GAP = 120;

/**
 * Tenues d'une affiche : le club qui reçoit joue dans sa tenue domicile, le visiteur dans sa tenue extérieur.
 * Si les deux maillots se ressemblent trop, le visiteur prend son autre tenue, puis une tenue de secours.
 */
export function chooseKits(home, away) {
  const mine = home.domicile;
  const kit = [away.exterieur, away.domicile, ...SECOURS].find((k) => colourGap(k.maillot, mine.maillot) >= KIT_GAP);
  return [mine, kit];
}
