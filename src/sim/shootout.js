// Série de tirs de pénalité qui départage un match encore à égalité après la prolongation.
// Règlement sportif FFRS, format éliminatoire (5.4.3) : trois tirs par équipe, tirés en alternance par des
// joueurs différents, puis mort subite où un même joueur peut retirer.
// Choix du jeu (voir README) : l'équipe qui reçoit tire la première ; chaque tir est limité à 8 secondes.
import { DT, GOAL_X, GOAL_HW, GOAL_DEPTH } from './geometry.js';
import { rnd, emit, goalieOf, diffOf } from './state.js';
import { finish } from './rules.js';

const hyp = Math.hypot;
export const SHOT_LIMIT = 8;

/** Lance la série. Les tireurs sont les patineurs disponibles, dans l'ordre de la feuille de match. */
export function startShootout(state) {
  state.so = {
    roster: [0, 1].map((t) => state.players.filter((p) => p.team === t && !p.goalie && p.status !== 'out' && p.status !== 'box').map((p) => p.id)),
    shots: [[], []], // true : but, false : manqué
    team: 0,
    shooter: -1,
    stage: 'setup',
    t: 0,
    over: null,
  };
  state.phase = 'shootout';
  state.clock = 0;
  state.advantage = -1;
  state.pending = [];
  state.call = null;
  emit(state, { type: 'shootout' });
  setupShot(state);
}

/** Place le tireur au point central avec le palet, seul face au gardien adverse. */
function setupShot(state) {
  const so = state.so;
  const t = so.team;
  const d = state.teams[t].dir;
  const list = so.roster[t];
  const shooter = state.players[list[so.shots[t].length % list.length]];
  for (const p of state.players) {
    if (!p.goalie && (p.status === 'rink' || p.status === 'bench')) p.status = p.id === shooter.id ? 'rink' : 'bench';
    Object.assign(p, { vx: 0, vy: 0, stun: 0, charge: 0, mich: 0, down: 0, checkT: 0, dodgeT: 0, offBal: 0, skid: false, back: false, kneeling: false, pickupCd: 0, save: null, react: 0 });
    Object.assign(p.ctl, { mx: 0, my: 0, pass: false, shoot: -1, steal: false, skid: false, dodge: false, check: false, back: false, fake: false, mich: false, kneel: false });
  }
  for (let u = 0; u < 2; u++) {
    const g = goalieOf(state, u);
    const gd = state.teams[u].dir;
    g.x = -gd * (GOAL_X - 0.9);
    g.y = 0;
    g.face = gd > 0 ? 0 : Math.PI;
    g.track.x = 0;
    g.track.y = 0;
  }
  shooter.slot = 0;
  shooter.x = -d * 0.7;
  shooter.y = 0;
  shooter.face = d > 0 ? 0 : Math.PI;
  shooter.ai.recvPass = false;
  const k = state.puck;
  Object.assign(k, { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, carrier: shooter.id, passTarget: -1, dead: false, creaseFoul: false, wasInCrease: 0, pinT: 0, idleT: 0, lastTeam: t, lastTouch: shooter.id, prevTouch: -1 });
  k.lastBy = [-1, -1];
  k.prevBy = [-1, -1];
  k.lastBy[t] = shooter.id;
  for (const h of state.humans) if (h.team === t) h.selected = shooter.id;
  Object.assign(so, {
    shooter: shooter.id,
    stage: 'setup',
    t: 1.6,
    over: null,
    released: false,
    far: 0,
    // Plan de l'ordinateur : de quel côté il s'écarte, d'où il tire, avec quelle force.
    aiY: (rnd(state) - 0.5) * 5,
    aiDist: 4.5 + rnd(state) * 4,
    aiCharge: 0.3 + rnd(state) * 0.6,
  });
  emit(state, { type: 'shootoutSetup', team: t, by: shooter.id });
}

/** Commandes du tireur quand l'ordinateur tire : il s'avance, s'écarte un peu, arme et tire. */
export function shootoutAI(state) {
  const so = state.so;
  const p = state.players[so.shooter];
  const k = state.puck;
  if (k.carrier !== p.id) return;
  const d = state.teams[p.team].dir;
  const c = p.ctl;
  const dist = GOAL_X - p.x * d;
  const tx = d * GOAL_X;
  const ty = dist > so.aiDist + 2 ? so.aiY : 0;
  const l = hyp(tx - p.x, ty - p.y) || 1;
  c.mx = (tx - p.x) / l;
  c.my = (ty - p.y) / l;
  c.shoot = -1;
  if (dist < so.aiDist + 2.5) {
    p.charge = Math.min(1, p.charge + DT / 0.7);
    // Le niveau de difficulté joue sur le sang-froid : en facile, il tire sans trop armer.
    const want = so.aiCharge * (0.6 + 0.4 * Math.min(1, 1 / diffOf(state, p.team).shotErr * 3));
    if (p.charge >= want && dist < so.aiDist) c.shoot = p.charge;
    if (dist < 2.2) c.shoot = p.charge;
  }
}

/** Le tir en cours est-il terminé ? Renseigne so.over ('goal' ou 'miss'). À appeler après chaque pas. */
export function judgeShot(state) {
  const so = state.so;
  const k = state.puck;
  const p = state.players[so.shooter];
  const d = state.teams[p.team].dir;
  const x = k.x * d;
  so.t += DT;
  if (so.over) return;
  const g = goalieOf(state, 1 - p.team);
  if (k.carrier === g.id) so.over = 'miss'; // arrêté
  else if (!so.released) {
    if (k.carrier !== p.id) so.released = true;
    else {
      so.far = Math.max(so.far, x);
      if (x < so.far - 1.5) so.over = 'miss'; // le palet recule
      if (so.t > SHOT_LIMIT) so.over = 'miss';
    }
  } else if (k.carrier >= 0) so.over = 'miss'; // pas de rebond : le tireur ne reprend pas le palet
  else {
    const sp = hyp(k.vx, k.vy);
    const inGoalMouth = Math.abs(k.y) < GOAL_HW && x > GOAL_X - 0.2;
    if (sp < 0.5 && k.z <= 0.05) so.over = 'miss';
    else if (x > GOAL_X + 0.3 && !inGoalMouth) so.over = 'miss'; // à côté ou au-dessus
    else if (x > GOAL_X + GOAL_DEPTH + 0.6) so.over = 'miss';
    else if (k.vx * d < -0.5 && x < GOAL_X - 2.5) so.over = 'miss'; // repoussé
    else if (so.t > SHOT_LIMIT + 2) so.over = 'miss';
  }
}

/** Qui a gagné la série, ou -1 si elle continue. */
export function shootoutWinner(shots) {
  const goals = shots.map((s) => s.filter(Boolean).length);
  const n = shots.map((s) => s.length);
  if (n[0] <= 3 && n[1] <= 3 && !(n[0] === 3 && n[1] === 3)) {
    // Série de trois : elle s'arrête dès qu'une équipe ne peut plus être rattrapée.
    for (let t = 0; t < 2; t++) if (goals[t] > goals[1 - t] + (3 - n[1 - t])) return t;
    return -1;
  }
  if (n[0] !== n[1]) return -1; // mort subite : on compare à nombre de tirs égal
  return goals[0] === goals[1] ? -1 : goals[0] > goals[1] ? 0 : 1;
}

/** Enregistre le tir terminé, puis prépare le suivant ou termine le match. */
export function endShot(state) {
  const so = state.so;
  const k = state.puck;
  const goal = so.over === 'goal';
  so.shots[so.team].push(goal);
  Object.assign(k, { carrier: -1, vx: 0, vy: 0, vz: 0, dead: true });
  so.stage = 'result';
  so.t = 1.8;
  emit(state, { type: 'shootoutShot', team: so.team, by: so.shooter, goal });
}

export function afterShot(state) {
  const so = state.so;
  const w = shootoutWinner(so.shots);
  if (w >= 0) {
    // Le vainqueur des tirs gagne d'un but au score final.
    state.score[w]++;
    return finish(state, 'tirs', w, { shots: so.shots.map((s) => [...s]) });
  }
  so.team = 1 - so.team;
  setupShot(state);
}
