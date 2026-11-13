// Mode Arbitre : ce que le jeu a vu, ce que le joueur a sifflé, et la note. Sans affichage, testable sous Node.
// Le match lui-même n'est pas touché : ce module observe les événements de la logique et juge des réponses.
import { INFRACTIONS } from '../data/infractions.js';

/** Familles de gestes : une infraction confondue avec une autre de sa famille vaut un demi-point. */
export const FAMILLES = {
  crosse: { nom: 'Crosse', codes: ['ACC', 'CIN', 'TRE', 'HAU', 'PIQ', 'CRO'] },
  charge: { nom: 'Charge', codes: ['INC', 'CBA', 'DOS', 'DUR', 'COU', 'GEN'] },
  obstruction: { nom: 'Obstruction', codes: ['OBS', 'RET'] },
  autres: { nom: 'Autres', codes: ['JEU', 'ANT', 'SUR'] },
};
export const familleDe = (code) => Object.keys(FAMILLES).find((f) => FAMILLES[f].codes.includes(code)) ?? 'autres';

export const SANCTIONS_ARBITRE = { minor: 'Pénalité mineure', major: 'Pénalité majeure', tir: 'Tir de pénalité' };
/** Engagement après une pénalité (9.3.1 K et L). */
export const ENGAGEMENTS = { centre: 'Au centre', zone: "Dans la zone de l'équipe fautive", proche: 'Au point le plus proche' };

/** Barème : points par élément de la décision. */
export const BAREME = { faute: 2, fautif: 1, infraction: 1, sanction: 1, engagement: 1 };

/** Rugosité des équipes en mode Arbitre, selon la durée d'une période et la façon d'arbitrer. */
export const rugosite = (periodLength, reel = false) =>
  // Assisté : assez de charges et de fautes pour 8 à 12 situations, même en match court. Réel : moins, parce
  // qu'il faut tout voir en direct.
  reel ? Math.max(1, Math.min(8, 1000 / periodLength)) : Math.max(1, Math.min(26, 3000 / periodLength));
/** Nombre de situations présentées au plus, et écart minimal entre deux (secondes de jeu). */
export const MAX_SITUATIONS = 12;
export const MAX_FAUTES = 8;
export const ecartMin = (periodLength) => (periodLength <= 300 ? periodLength / 30 : periodLength / 12);

/** Générateur déterministe propre au mode Arbitre : il ne consomme pas le hasard du match. */
export function hasard(seed) {
  let s = (seed ^ 0x9e3779b9) | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Quatre infractions proposées : la bonne (s'il y en a une) et d'autres plausibles, d'abord de la même famille,
 * parmi celles que le jeu sait montrer. famille : pour une action régulière, la famille du geste vu.
 */
export function propositions(code, rnd, famille = null) {
  const jouables = Object.keys(INFRACTIONS).filter((c) => INFRACTIONS[c].jouable && c !== 'JEU');
  const fam = famille ?? familleDe(code);
  const melange = (l) => l.map((c) => [rnd(), c]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const proches = melange(jouables.filter((c) => c !== code && familleDe(c) === fam));
  const loin = melange(jouables.filter((c) => c !== code && familleDe(c) !== fam));
  const out = [...(code ? [code] : []), ...proches, ...loin].slice(0, 4);
  return melange(out);
}

/**
 * Suit un match et en tire les situations à juger.
 * observe(state, events) est appelé après chaque pas ; il renvoie une situation quand il faut arrêter l'image :
 *   { kind: 'faute', tick (de la faute), verite } au coup de sifflet d'une pénalité,
 *   { kind: 'reguliere', tick, verite } peu après une action régulière qui ressemble à une faute.
 * verite : { faute, code, fautif, victime, sanction: 'minor' | 'major' | 'tir', engagement, call, famille }
 */
export class Observateur {
  constructor(seed, periodLength) {
    this.rnd = hasard(seed);
    this.gap = ecartMin(periodLength);
    this.fautes = []; // fautes signalées, en attente de leur coup de sifflet
    this.attente = null; // action régulière retenue : { tick, a, b, famille, dans }
    this.nb = { faute: 0, reguliere: 0 };
    this.dernier = -Infinity; // temps de jeu écoulé à la dernière situation
  }

  ecoule(state) {
    return (state.period - 1) * state.cfg.periodLength + (state.cfg.periodLength - state.clock);
  }

  observe(state, events) {
    let out = null;
    const total = this.nb.faute + this.nb.reguliere;
    for (const e of events) {
      if (e.type === 'foul') {
        this.fautes.push({ tick: state.tick, code: e.code, by: e.by, victim: e.victim });
        if (this.attente && (this.attente.a === e.by || this.attente.b === e.by)) this.attente = null;
      } else if (e.type === 'whistle' || e.type === 'goal') {
        this.attente = null;
        const c = e.call;
        // Dans un match long, toutes les fautes ne sont pas présentées : le jeu siffle les autres seul.
        const place = total < MAX_SITUATIONS && this.nb.faute < MAX_FAUTES && this.ecoule(state) - this.dernier >= this.gap;
        if (e.type === 'whistle' && c?.kind === 'penalty' && state.period <= 2 && place) {
          const f = this.fautes.find((q) => q.code === c.code && state.players[q.by].num === c.num && state.cfg.teams[state.players[q.by].team].sigle === c.sigle);
          if (f) {
            const deux = (c.others ?? []).some((o) => o.sigle !== c.sigle);
            out = {
              kind: 'faute',
              tick: f.tick,
              verite: { faute: true, code: f.code, fautif: f.by, victime: f.victim, sanction: c.tir ? 'tir' : c.severity, engagement: c.tir ? null : deux ? 'proche' : 'zone', call: c, famille: familleDe(f.code) },
            };
          }
        }
        this.fautes = [];
      } else if (!this.attente && state.phase === 'play' && state.period <= 2 && total < MAX_SITUATIONS) {
        // Charge propre, ou vol de palet réussi qui fait tomber le porteur : régulier, mais à regarder de près.
        let cand = null;
        if (e.type === 'hit' && e.a != null) cand = { a: e.a, b: e.b, famille: 'charge' };
        else if (e.type === 'steal' && state.players[e.from].stun > 0) cand = { a: e.by, b: e.from, famille: 'crosse' };
        const pris = cand && events.some((q) => q.type === 'foul' && (q.by === cand.a || q.by === cand.b));
        const libre = cand && !this.fautes.some((q) => q.by === cand.a || q.by === cand.b) && state.players[cand.a].foulCd <= 0 && state.players[cand.b].foulCd <= 0;
        // Environ une situation sur trois est régulière.
        const quota = this.nb.reguliere < this.nb.faute / 2 + 1;
        if (cand && !pris && libre && quota && this.ecoule(state) - this.dernier >= this.gap && this.rnd() < 0.85) this.attente = { tick: state.tick, ...cand, dans: 48 };
      }
    }
    if (!out && this.attente && state.phase === 'play' && --this.attente.dans <= 0) {
      const a = this.attente;
      this.attente = null;
      out = { kind: 'reguliere', tick: a.tick, verite: { faute: false, code: null, fautif: -1, victime: -1, sanction: null, engagement: null, call: null, famille: a.famille, a: a.a, b: a.b } };
    }
    if (out) {
      this.nb[out.kind]++;
      this.dernier = this.ecoule(state);
      out.periode = state.period;
      out.horloge = state.clock;
    }
    return out;
  }
}

/**
 * Note une réponse. reponse : { faute, fautif, code, sanction, engagement }.
 * Renvoie { points, max, detail: { faute, fautif, infraction, sanction, engagement }, classe }.
 */
export function noter(verite, reponse) {
  const d = { faute: 0, fautif: 0, infraction: 0, sanction: 0, engagement: 0 };
  if (!verite.faute) {
    const ok = !reponse.faute;
    d.faute = ok ? BAREME.faute : 0;
    return { points: d.faute, max: BAREME.faute, detail: d, classe: ok ? 'juste' : 'sifflet-a-tort' };
  }
  const max = BAREME.faute + BAREME.fautif + BAREME.infraction + BAREME.sanction + (verite.engagement ? BAREME.engagement : 0);
  if (!reponse.faute) return { points: 0, max, detail: d, classe: 'faute-manquee' };
  d.faute = BAREME.faute;
  if (reponse.fautif === verite.fautif) d.fautif = BAREME.fautif;
  if (reponse.code === verite.code) d.infraction = BAREME.infraction;
  else if (reponse.code && familleDe(reponse.code) === verite.famille) d.infraction = BAREME.infraction / 2;
  if (reponse.sanction === verite.sanction) d.sanction = BAREME.sanction;
  if (verite.engagement && reponse.engagement === verite.engagement) d.engagement = BAREME.engagement;
  const points = d.faute + d.fautif + d.infraction + d.sanction + d.engagement;
  const classe =
    points === max ? 'juste'
    : d.fautif === 0 ? 'mauvais-fautif'
    : d.infraction < BAREME.infraction ? 'mal-nommee'
    : d.sanction === 0 ? 'mauvaise-sanction'
    : 'mauvais-engagement';
  return { points, max, detail: d, classe };
}

/** Délai pendant lequel une faute vue peut encore être sifflée (secondes) ; au-delà, elle est manquée. */
export const DELAI_SIFFLET = 6;

/**
 * Arbitre réel : rapproche ce que l'ordinateur a vu en silence (state.seen) de ce que l'humain a sifflé.
 * Chaque ligne : { kind, tick, periode, horloge, verite, rep, note, avantage? }.
 */
export class Journal {
  constructor() {
    this.lu = 0; // entrées de state.seen déjà prises en compte
    this.ouvertes = []; // fautes vues, pas encore sifflées
    this.lignes = [];
  }

  static verite(f) {
    return { faute: true, code: f.code, fautif: f.offender, victime: f.victim, sanction: f.shot ? 'tir' : f.severity, engagement: f.shot ? null : 'zone', famille: familleDe(f.code), immediate: f.immediate, call: null };
  }

  /** À appeler après chaque pas : ramasse les nouvelles fautes vues et classe « manquées » celles qui ont trop attendu. */
  suivre(state) {
    const neuves = [];
    for (; this.lu < state.seen.length; this.lu++) {
      const f = state.seen[this.lu];
      if (!f.goal) {
        this.ouvertes.push(f);
        neuves.push(f);
      }
    }
    // Tant que le bras est levé, les fautes signalées attendent l'arrêt du jeu.
    const bras = state.ref.arm >= 0 || state.ref.wait === 'decision';
    const limite = state.tick - DELAI_SIFFLET * 60;
    if (!bras) {
      for (const f of this.ouvertes.filter((q) => q.tick < limite)) this.manquee(f);
      this.ouvertes = this.ouvertes.filter((q) => q.tick >= limite);
    }
    return neuves;
  }

  manquee(f) {
    const verite = Journal.verite(f);
    this.lignes.push({ kind: 'faute', tick: f.tick, periode: f.period, horloge: f.clock, verite, rep: { faute: null }, note: { ...noter(verite, { faute: false }), classe: 'faute-manquee' } });
  }

  /** Décision rendue après un arrêt. opts : { tick, periode, horloge, bras : arrêt venu du bras levé } */
  decision(d, opts) {
    // La faute vue qui correspond : celle du joueur désigné, sinon la plus récente.
    let f = d.faute ? this.ouvertes.findLast((q) => q.offender === d.fautif) : null;
    f ??= this.ouvertes.at(-1) ?? null;
    if (f) this.ouvertes = this.ouvertes.filter((q) => q !== f);
    const base = { kind: 'faute', tick: f?.tick ?? opts.tick, periode: opts.periode, horloge: opts.horloge, rep: { ...d } };
    if (!f) {
      // Rien vu par le jeu : coup de sifflet à tort, que l'arbitre l'ait reconnu ou non.
      const verite = { faute: false, famille: d.code ? familleDe(d.code) : 'autres' };
      this.lignes.push({ ...base, verite, note: { points: 0, max: BAREME.faute + (d.faute ? 4 : 0), detail: {}, classe: 'sifflet-a-tort' } });
      return this.lignes.at(-1);
    }
    const verite = Journal.verite(f);
    const note = noter(verite, d);
    let avantage = null;
    if (!f.immediate) {
      // L'équipe non fautive avait le palet : il fallait lever le bras et laisser jouer (10.3). Un point de plus.
      avantage = d.faute && opts.bras;
      note.max += 1;
      if (avantage) note.points += 1;
      if (note.classe === 'juste' && !avantage) note.classe = 'avantage-coupe';
    }
    this.lignes.push({ ...base, verite, note, avantage });
    return this.lignes.at(-1);
  }

  /** But : refuse = ce que le jeu aurait fait (attaquant dans la zone de but), accorde = la décision de l'arbitre. */
  but(g, accorde) {
    const juste = accorde === !g.refuse;
    // Un but valable accordé va de soi : il n'entre pas dans la note.
    if (juste && !g.refuse) return null;
    const verite = { but: true, refuse: g.refuse, team: g.team };
    this.lignes.push({ kind: 'but', tick: g.tick, periode: g.period, horloge: g.clock, verite, rep: { accorde }, note: { points: juste ? BAREME.faute : 0, max: BAREME.faute, detail: {}, classe: juste ? 'juste' : accorde ? 'but-accorde-a-tort' : 'but-refuse-a-tort' } });
    return this.lignes.at(-1);
  }

  /** Fin du match : ce qui n'a pas été sifflé est manqué. Renvoie les lignes dans l'ordre du match. */
  cloture() {
    for (const f of this.ouvertes) this.manquee(f);
    this.ouvertes = [];
    this.lignes.sort((a, b) => a.tick - b.tick);
    return this.lignes;
  }
}

export const CLASSES = {
  'avantage-coupe': 'Avantage coupé',
  'but-accorde-a-tort': 'But accordé à tort',
  'but-refuse-a-tort': 'But refusé à tort',

  juste: 'Décision juste',
  'mal-nommee': 'Faute mal nommée',
  'mauvais-fautif': 'Mauvais fautif',
  'mauvaise-sanction': 'Mauvaise sanction',
  'mauvais-engagement': 'Mauvais engagement',
  'faute-manquee': 'Faute manquée',
  'sifflet-a-tort': 'Sifflet à tort',
};

/** Bilan d'un match : note sur 20, total par classe, erreurs les plus fréquentes. lignes : [{ note }] */
export function bilan(lignes) {
  let points = 0;
  let max = 0;
  const classes = {};
  for (const l of lignes) {
    points += l.note.points;
    max += l.note.max;
    classes[l.note.classe] = (classes[l.note.classe] ?? 0) + 1;
  }
  const erreurs = Object.entries(classes).filter(([c]) => c !== 'juste').sort((a, b) => b[1] - a[1]);
  return { points, max, note: max ? Math.round((points / max) * 200) / 10 : null, classes, erreurs };
}
