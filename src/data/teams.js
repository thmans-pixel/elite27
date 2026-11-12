// Données des équipes. Ce fichier se modifie sans toucher au code du jeu.
// Les noms de joueurs sont inventés. Les notes vont de 0 à 1.

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
    notes: { vitesse: 0.8, tir: 0.78, gardien: 0.8 },
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
    notes: { vitesse: 0.82, tir: 0.82, gardien: 0.82 },
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
};
