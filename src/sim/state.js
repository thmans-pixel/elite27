// État d'un match. Aucune dépendance au navigateur : ce module tourne aussi sous Node.
import { GOAL_X, BENCH_Y, HW } from './geometry.js';

export const DIFFICULTY = {
  facile: { speed: 0.86, steal: 0.035, shotErr: 7.0, goalie: 0.85, shootRange: 9, reckless: 1.6 },
  normal: { speed: 0.94, steal: 0.07, shotErr: 4.5, goalie: 1.0, shootRange: 11, reckless: 1.0 },
  difficile: { speed: 1.0, steal: 0.11, shotErr: 3.0, goalie: 1.12, shootRange: 12, reckless: 0.7 },
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

function makePlayer(id, team, info, slot, goalie, status) {
  return {
    id,
    team,
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
    ctl: { mx: 0, my: 0, pass: false, shoot: -1, steal: false },
    ai: { stealT: 0, think: 0, reckless: 0, lane: 0 },
    track: { x: 0, y: 0 },
    hold: 0,
  };
}

/**
 * cfg : { home, away (données d'équipe), periodLength (s), difficulty, humans: [{ team }], seed }
 */
export function createMatch(cfg) {
  const periodLength = cfg.periodLength ?? 120;
  const state = {
    cfg: {
      periodLength,
      difficulty: cfg.difficulty ?? 'normal',
      teams: [cfg.home, cfg.away],
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
    teams: [0, 1].map((t) => ({
      dir: t === 0 ? 1 : -1,
      penalties: [],
      shots: 0,
      pim: 0,
      noAdvanceWarned: false,
      ownHalfT: 0,
    })),
    players: [],
    puck: { x: 0, y: 0, vx: 0, vy: 0, carrier: -1, lastTouch: -1, prevTouch: -1, lastTeam: -1, passTarget: -1, dead: true, creaseFoul: false, wasInCrease: 0, pinT: 0, idleT: 0, lastBy: [-1, -1], prevBy: [-1, -1] },
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
      state.players.push(makePlayer(id++, t, j, i % 4, false, i < 4 ? 'rink' : 'bench'));
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
  if (p.status === 'box') return { x: side * 2.2, y: HW + 1.0 };
  return { x: side * (4 + (p.id % 9) * 0.9), y: BENCH_Y - 1.0 };
}

export function emit(state, ev) {
  state.events.push(ev);
  if (state.events.length > 400) state.events.splice(0, 200);
}
