// État d'un match. Aucune dépendance au navigateur : ce module tourne aussi sous Node.
import { GOAL_X, BENCH_Y, HW } from './geometry.js';

export const DIFFICULTY = {
  facile: { speed: 0.86, steal: 0.035, shotErr: 7.0, goalie: 0.85, shootRange: 9, reckless: 1.6, check: 0.002, dodge: 0.02, michigan: 0, block: 0.03 },
  normal: { speed: 0.94, steal: 0.07, shotErr: 4.5, goalie: 1.0, shootRange: 11, reckless: 1.0, check: 0.002, dodge: 0.06, michigan: 0, block: 0.08 },
  difficile: { speed: 1.0, steal: 0.11, shotErr: 3.0, goalie: 1.12, shootRange: 12, reckless: 0.7, check: 0.002, dodge: 0.12, michigan: 0.03, block: 0.16 },
};

/** Générateur pseudo-aléatoire déterministe (mulberry32), porté par l'état. */
export function rnd(state) {
  state.rng = (state.rng + 0x6d2b79f5) | 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Durée de jeu d'une pénalité, proportionnelle à la durée du match (2 x 25 min en vrai), arrondie à 5 s. */
export function penaltySeconds(periodLength, realMinutes) {
  const s = (realMinutes * 60 * periodLength) / 1500;
  return Math.max(5, Math.round(s / 5) * 5);
}

function makePlayer(id, team, info, slot, goalie, status, line = -1) {
  return {
    id,
    team,
    line, // 0 ou 1 pour un patineur, -1 pour le gardien
    toi: 0, // temps de jeu, en secondes
    num: info.num,
    name: info.nom,
    slot,
    goalie,
    status, // 'rink' | 'bench' | 'box' | 'out'
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    face: team === 0 ? 0 : Math.PI,
    stun: 0,
    stealCd: 0,
    stealAnim: 0,
    pickupCd: 0,
    foulCd: 0,
    charge: 0,
    hadPuckTick: -999,
    fx: 0,
    fy: 0,
    ctl: { mx: 0, my: 0, pass: false, shoot: -1, steal: false, skid: false, dodge: false, check: false, back: false, fake: false, mich: false, kneel: false },
    kneeling: false, // position de défense : un genou au sol, crosse à plat
    dodgeT: 0,
    dodgeCd: 0,
    ddx: 0,
    ddy: 0,
    checkT: 0,
    checkCd: 0,
    checkHit: false,
    offBal: 0, // déséquilibré : ne répond plus aux commandes
    skid: false,
    back: false,
    turn: 0,
    mich: 0, // chargement du Michigan, de 0 à 1
    ai: { stealT: 0, think: 0, reckless: 0, lane: 0 },
    track: { x: 0, y: 0 },
    hold: 0,
    down: 0, // gardien : temps restant en papillon
    save: null, // gardien : dernier arrêt { part: 'jambieres' | 'mitaine' | 'bouclier', lat, h, t }
  };
}

/**
 * cfg : { home, away (données d'équipe), periodLength (s), difficulty, humans: [{ team }], seed, autoSwitch,
 *         lineChange ('auto' | 'manuel' : changement de ligne des équipes jouées par un humain),
 *         overtime (vrai : prolongation puis tirs de pénalité en cas d'égalité ; faux : match nul) }
 */
export function createMatch(cfg) {
  const periodLength = cfg.periodLength ?? 120;
  const state = {
    cfg: {
      periodLength,
      difficulty: cfg.difficulty ?? 'normal',
      teams: [cfg.home, cfg.away],
      autoSwitch: cfg.autoSwitch ?? true, // changement de patineur automatique quand l'équipe n'a pas le palet
      overtime: cfg.overtime ?? false,
      lineChange: cfg.lineChange ?? 'auto', // équipes d'un joueur humain : 'auto' ou 'manuel'
      // Fatigue (choix du jeu) : une ligne passe de fraîche à épuisée en un tiers de période de jeu effectif.
      tireTime: periodLength / 3,
      // Prolongation de 5 minutes pour des périodes de 25 : même échelle que le match, 25 secondes au moins.
      overtimeLength: Math.max(25, Math.round(periodLength / 5)),
      minor: penaltySeconds(periodLength, 2),
      major: penaltySeconds(periodLength, 5),
    },
    rng: (cfg.seed ?? 20261111) | 0,
    tick: 0,
    phase: 'pregame',
    phaseT: 0,
    period: 1,
    clock: periodLength,
    score: [0, 0],
    skaters: 4, // patineurs par équipe sur la piste : 4, puis 3 en prolongation
    result: null, // à la fin : { how: 'temps' | 'prolongation' | 'tirs' | 'nul', winner, shots? }
    so: null, // série de tirs de pénalité en cours
    teams: [0, 1].map((t) => ({
      dir: t === 0 ? 1 : -1,
      line: 0, // ligne sur la piste
      fresh: [1, 1], // fraîcheur de chaque ligne, de 0 à 1
      wantChange: false, // changement de ligne demandé pour le prochain arrêt de jeu
      penalties: [],
      shots: 0,
      pim: 0,
      noAdvanceWarned: false,
      ownHalfT: 0,
    })),
    players: [],
    puck: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, carrier: -1, lastTouch: -1, prevTouch: -1, lastTeam: -1, passTarget: -1, dead: true, creaseFoul: false, wasInCrease: 0, pinT: 0, idleT: 0, lastBy: [-1, -1], prevBy: [-1, -1] },
    lastCarrier: -1,
    faceoff: null,
    pending: [],
    call: null,
    advantage: -1,
    humans: (cfg.humans ?? []).map((h) => ({ team: h.team, selected: -1, prev: {}, foPress: -99 })),
    events: [],
    sheet: [],
  };
  let id = 0;
  for (let t = 0; t < 2; t++) {
    const data = state.cfg.teams[t];
    data.joueurs.slice(0, 8).forEach((j, i) => {
      state.players.push(makePlayer(id++, t, j, i % 4, false, i < 4 ? 'rink' : 'bench', i < 4 ? 0 : 1));
    });
    state.players.push(makePlayer(id++, t, data.gardien, -1, true, 'rink'));
  }
  for (const h of state.humans) h.selected = state.players.find((p) => p.team === h.team && !p.goalie).id;
  return state;
}

export const skatersOnRink = (state, team) => state.players.filter((p) => p.team === team && !p.goalie && p.status === 'rink');
export const goalieOf = (state, team) => state.players.find((p) => p.team === team && p.goalie);
/** Abscisse de la cage défendue par une équipe. */
export const ownGoalX = (state, team) => -state.teams[team].dir * GOAL_X;
export const isHuman = (state, id) => state.humans.some((h) => h.selected === id);
export const diffOf = (state, team) => (state.humans.some((h) => h.team === team) ? DIFFICULTY.normal : DIFFICULTY[state.cfg.difficulty]);

/** Position d'attente hors piste, pour l'affichage (banc ou banc des pénalités). */
export function offRinkPos(state, p) {
  const side = state.teams[p.team].dir > 0 ? -1 : 1;
  if (p.status === 'box') {
    // Banc des pénalités : les pénalisés d'une même équipe s'y rangent côte à côte.
    const n = state.players.filter((q) => q.team === p.team && q.status === 'box' && q.id < p.id).length;
    return { x: side * (2.2 + n * 0.9), y: HW + 1.0 };
  }
  return { x: side * (4 + (p.id % 9) * 0.9), y: BENCH_Y - 1.0 };
}

/** Effet maximal de la fatigue sur la vitesse et la force de tir. */
export const TIRED = 0.1;
/** Coefficient de forme d'un joueur : 1 quand sa ligne est fraîche, 0,9 quand elle est épuisée. */
export function form(state, p) {
  if (p.goalie || p.line < 0) return 1;
  return 1 - TIRED * (1 - state.teams[p.team].fresh[p.line]);
}

/** Nom de la période en cours, pour l'affichage. */
export function periodLabel(state) {
  if (state.phase === 'shootout' || state.result?.how === 'tirs') return 'Tirs de pénalité';
  if (state.period === 3) return 'Prolongation';
  return state.period === 1 ? '1re période' : '2e période';
}

export function emit(state, ev) {
  state.events.push(ev);
  if (state.events.length > 400) state.events.splice(0, 200);
}
