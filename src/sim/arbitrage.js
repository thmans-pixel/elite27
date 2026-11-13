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

/** Rugosité des équipes selon la durée d'une période : de quoi voir 6 à 9 fautes par match. */
export const rugosite = (periodLength) => Math.max(1, Math.min(12, 1400 / periodLength));
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

export const CLASSES = {
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
