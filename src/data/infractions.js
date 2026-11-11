// Infractions du règlement sportif Roller Hockey FFRS (partie III, article 10.4) et gestes de l'annexe A.5.
// `jouable` : l'infraction peut se produire dans un match. Les autres n'apparaîtront que dans le mode Arbitre.
// `aConfirmer` : geste peu lisible sur les photos de l'annexe, à valider auprès d'un arbitre.

export const INFRACTIONS = {
  ACC: { nom: 'Accrocher', article: '10.4.25', jouable: true, geste: 'Les deux bras tendus devant soi, comme pour tirer quelque chose vers soi' },
  TRE: { nom: 'Faire trébucher', article: '10.4.26', jouable: true, geste: 'Penché en avant, une main frappe la jambe sous le genou' },
  CIN: { nom: 'Cinglage', article: '10.4.22', jouable: true, geste: "Le tranchant d'une main frappe l'avant-bras opposé" },
  INC: { nom: 'Charge', article: '10.4.16', jouable: true, geste: "Les poings tournent l'un autour de l'autre devant la poitrine" },
  CBA: { nom: 'Charge contre la balustrade', article: '10.4.17', jouable: true, geste: "Un poing frappe la paume de l'autre main devant la poitrine" },
  DOS: { nom: 'Charge dans le dos', article: '10.4.18', jouable: true, geste: 'Une main ouverte à hauteur du plexus, doigts serrés pointés vers le haut, coude légèrement plié' },
  OBS: { nom: 'Obstruction', article: '10.4.28', jouable: true, geste: 'Les avant-bras croisés devant la poitrine' },
  JEU: { nom: 'Retard de jeu', article: '9.3.6', jouable: true, geste: 'Une main ouverte posée sur la poitrine, puis tendue devant soi', aConfirmer: true },
  ANT: { nom: 'Attitude antisportive', article: '10.4.6', geste: 'Les deux mains forment un T devant la poitrine' },
  CRO: { nom: 'Charge avec la crosse', article: '10.4.19', geste: "Les deux poings poussés vers l'avant à hauteur de poitrine" },
  COU: { nom: 'Coup de coude', article: '10.4.27', geste: 'Une main touche le coude opposé, bras levé plié' },
  GEN: { nom: 'Coup de genou', article: '10.4.27', geste: 'Penché en avant, une main touche le genou' },
  HAU: { nom: 'Crosse haute', article: '10.4.20', geste: "Les deux poings l'un au-dessus de l'autre, levés au-dessus de l'épaule" },
  DUR: { nom: 'Dureté excessive', article: '10.4.23', geste: 'Un bras tendu sur le côté, poing fermé' },
  PIQ: { nom: 'Piquage', article: '10.4.21', geste: "Un mouvement de piqué des deux mains vers l'avant, puis les mains retombent sur les côtés" },
  RET: { nom: 'Retenir', article: '10.4.24', geste: 'Une main serre le poignet opposé devant la poitrine' },
  SUR: { nom: 'Surnombre', article: '10.4.4', geste: 'Un bras levé, main ouverte, doigts écartés', aConfirmer: true },
  MEC: { nom: 'Méconduite', article: '10.1.4', geste: 'Les deux mains sur les hanches' },
  MPM: { nom: 'Méconduite pour le match', article: '10.1.5', geste: 'Les deux mains sur les hanches' },
  PM: { nom: 'Pénalité de match', article: '10.1.6', geste: 'Une main à plat sur le dessus de la tête' },
  TP: { nom: 'Tir de pénalité', article: '10.4.11', geste: 'Les bras croisés au-dessus de la tête' },
};

export const AUTRES_GESTES = {
  ANNULATION: { nom: 'Annulation', geste: "Les deux bras écartés à l'horizontale" },
  BUT: { nom: 'But', geste: 'Un bras tendu qui désigne la cage' },
  APPELEE: { nom: 'Pénalité appelée', geste: 'Un bras levé à la verticale, jeu en cours' },
  ENGAGEMENT: { nom: "Procédure d'engagement", geste: "Un bras levé à la verticale, pendant l'arrêt de jeu" },
  TEMPS_MORT: { nom: 'Temps mort', geste: 'Les deux mains forment un T devant la poitrine' },
  PASSE_MAIN: { nom: 'Passe à la main', geste: 'Un bras le long du corps, paume ouverte vers l\'avant' },
};

export const SANCTIONS = {
  minor: { nom: 'Pénalité mineure', minutes: 2 },
  major: { nom: 'Pénalité majeure', minutes: 5 },
};
