// Déroulement d'un match, pas à pas (60 pas par seconde). Point d'entrée de la logique du jeu.
import { DT, SPOTS } from './geometry.js';
import { createMatch, skatersOnRink } from './state.js';
import { beginFaceoff, tickFaceoff, tickRules, startSecondPeriod } from './rules.js';
import { doPass, doShoot, doSteal, moveSkaters, moveGoalies, collide, updatePuck } from './physics.js';
import { computeAI } from './ai.js';

export { createMatch };

const hyp = Math.hypot;
const EMPTY = { mx: 0, my: 0, pass: false, shoot: false, steal: false, sw: false };

function nearestToPuck(state, team, except = -1) {
  const k = state.puck;
  let best = null;
  let bd = Infinity;
  for (const p of skatersOnRink(state, team)) {
    if (p.id === except) continue;
    const d = hyp(p.x - k.x, p.y - k.y);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

function readHumans(state, inputs) {
  state.humans.forEach((h, i) => {
    const raw = { ...EMPTY, ...(inputs[i] ?? EMPTY) };
    if (!Number.isFinite(raw.mx)) raw.mx = 0;
    if (!Number.isFinite(raw.my)) raw.my = 0;
    const l = hyp(raw.mx, raw.my);
    h.in = { ...raw, mx: l > 1 ? raw.mx / l : raw.mx, my: l > 1 ? raw.my / l : raw.my };
    h.edge = {
      pass: raw.pass && !h.prev.pass,
      shootUp: !raw.shoot && !!h.prev.shoot,
      shootDown: raw.shoot && !h.prev.shoot,
      steal: raw.steal && !h.prev.steal,
      sw: raw.sw && !h.prev.sw,
    };
    h.prev = { pass: raw.pass, shoot: raw.shoot, steal: raw.steal, sw: raw.sw };
    if (state.phase === 'faceoff' && (h.edge.pass || h.edge.shootDown)) h.foPress = state.tick;
  });
}

/** Le joueur humain contrôle le porteur du palet de son équipe, sinon le patineur choisi. */
function autoSelect(state) {
  const k = state.puck;
  const carrier = k.carrier >= 0 ? state.players[k.carrier] : null;
  const ctrl = carrier ? carrier.team : -1;
  for (const h of state.humans) {
    const cur = state.players[h.selected];
    if (carrier && carrier.team === h.team && !carrier.goalie) h.selected = carrier.id;
    else if (k.carrier < 0 && k.passTarget >= 0 && state.players[k.passTarget].team === h.team) h.selected = k.passTarget;
    else if (!cur || cur.status !== 'rink' || (ctrl >= 0 && ctrl !== h.team && h.lastCtrl === h.team)) {
      const n = nearestToPuck(state, h.team);
      if (n) h.selected = n.id;
    }
    if (ctrl >= 0) h.lastCtrl = ctrl;
  }
}

function applyHumans(state) {
  const k = state.puck;
  for (const h of state.humans) {
    const p = state.players[h.selected];
    if (!p || p.status !== 'rink') continue;
    const c = p.ctl;
    c.mx = h.in.mx;
    c.my = h.in.my;
    c.pass = false;
    c.shoot = -1;
    c.steal = false;
    c.passTo = -1;
    if (k.carrier === p.id) {
      if (h.in.shoot) p.charge = Math.min(1, p.charge + DT / 0.7);
      if (h.edge.shootUp) c.shoot = p.charge;
      else if (h.edge.pass) c.pass = true;
    } else {
      p.charge = 0;
      if (h.edge.steal) c.steal = true;
      if (h.edge.sw) {
        const n = nearestToPuck(state, h.team, p.id);
        if (n) {
          c.mx = 0;
          c.my = 0;
          h.selected = n.id;
        }
      }
    }
  }
}

function actions(state) {
  for (const p of state.players) {
    if (p.status !== 'rink' || p.goalie || p.stun > 0) continue;
    const c = p.ctl;
    if (c.shoot >= 0) doShoot(state, p, c.shoot);
    else if (c.pass) doPass(state, p, c.passTo ?? -1);
    else if (c.steal) doSteal(state, p);
    if (state.phase !== 'play') return;
  }
}

function timers(state) {
  for (const p of state.players) {
    if (p.stealCd > 0) p.stealCd -= DT;
    if (p.stealAnim > 0) p.stealAnim -= DT;
    if (p.pickupCd > 0) p.pickupCd -= DT;
    if (p.foulCd > 0) p.foulCd -= DT;
  }
  const k = state.puck;
  if (k.carrier !== state.lastCarrier) {
    if (k.carrier >= 0) state.players[k.carrier].ai.gotTick = state.tick;
    state.lastCarrier = k.carrier;
  }
}

function tickPlay(state) {
  timers(state);
  computeAI(state);
  applyHumans(state);
  actions(state);
  if (state.phase !== 'play') return;
  moveSkaters(state);
  moveGoalies(state);
  if (state.phase !== 'play') return;
  collide(state);
  updatePuck(state);
  if (state.phase === 'play') tickRules(state);
  autoSelect(state);
}

/** Arrêt de jeu : les joueurs se laissent glisser. */
function tickDead(state) {
  for (const p of state.players) {
    p.ctl.mx = 0;
    p.ctl.my = 0;
    p.ctl.shoot = -1;
    p.ctl.pass = false;
    p.ctl.steal = false;
  }
  moveSkaters(state);
  collide(state);
  state.phaseT -= DT;
  if (state.phaseT > 0) return;
  if (state.phase === 'break') startSecondPeriod(state);
  else beginFaceoff(state, state.faceoff.spot, state.faceoff.reason);
  autoSelect(state);
}

/**
 * Avance le match d'un pas. inputs[i] = commandes du joueur humain i :
 * { mx, my, pass, shoot, steal, sw } (mx, my entre -1 et 1 ; le reste en booléens « touche enfoncée »).
 */
export function step(state, inputs = []) {
  state.tick++;
  readHumans(state, inputs);
  switch (state.phase) {
    case 'pregame':
      beginFaceoff(state, SPOTS.C, 'period');
      break;
    case 'faceoff':
      tickFaceoff(state);
      if (state.phase === 'play') autoSelect(state);
      break;
    case 'play':
      tickPlay(state);
      break;
    case 'whistle':
    case 'goal':
    case 'break':
      tickDead(state);
      break;
    default:
      break;
  }
  return state;
}
