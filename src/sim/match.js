// Déroulement d'un match, pas à pas (60 pas par seconde). Point d'entrée de la logique du jeu.
import { DT, SPOTS } from './geometry.js';
import { createMatch, skatersOnRink } from './state.js';
import { beginFaceoff, tickFaceoff, tickRules, startSecondPeriod, startOvertime, finish } from './rules.js';
import { startShootout, shootoutAI, judgeShot, endShot, afterShot } from './shootout.js';
import { TUNE, doPass, doShoot, doSteal, doFake, doMichigan, michiganSide, angleDiff, moveSkaters, moveGoalies, collide, updatePuck } from './physics.js';
import { computeAI } from './ai.js';

export { createMatch };

const hyp = Math.hypot;
const EMPTY = { mx: 0, my: 0, pass: false, shoot: false, steal: false, sw: false, skid: false, dodge: false, check: false, kneel: false };

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
      dodge: raw.dodge && !h.prev.dodge,
      check: raw.check && !h.prev.check,
    };
    h.prev = { pass: raw.pass, shoot: raw.shoot, steal: raw.steal, sw: raw.sw, dodge: raw.dodge, check: raw.check };
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
      h.swT = 0;
    } else if (state.cfg.autoSwitch && ctrl !== h.team) {
      // Changement automatique : l'équipe n'a pas le palet, le joueur prend le patineur nettement plus proche
      // du palet, après une demi-seconde, et jamais au milieu d'un geste.
      const n = nearestToPuck(state, h.team);
      const busy = cur.checkT > 0 || cur.dodgeT > 0 || cur.stealAnim > 0 || cur.kneeling || cur.offBal > 0 || cur.stun > 0;
      if (n && n !== cur && hyp(n.x - k.x, n.y - k.y) + 1.5 < hyp(cur.x - k.x, cur.y - k.y)) {
        h.swT = (h.swT ?? 0) + DT;
        if (h.swT >= 0.5 && !busy) {
          cur.ctl.mx = 0;
          cur.ctl.my = 0;
          h.selected = n.id;
          h.swT = 0;
        }
      } else h.swT = 0;
    } else h.swT = 0;
    if (ctrl >= 0) h.lastCtrl = ctrl;
  }
}

/** Chargement du Michigan : tir maintenu une seconde derrière la cage, conditions réunies. Renvoie true s'il part. */
function chargeMichigan(state, p, holding, released) {
  if (!michiganSide(state, p)) {
    p.mich = 0;
    return false;
  }
  if (holding) p.mich = Math.min(1, p.mich + DT / TUNE.michiganT);
  else if (released && p.mich >= 1) return true;
  else p.mich = 0;
  return false;
}

function applyHumans(state) {
  const k = state.puck;
  const carrier = k.carrier >= 0 ? state.players[k.carrier] : null;
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
    c.fake = false;
    c.mich = false;
    c.skid = !!h.in.skid;
    c.dodge = h.edge.dodge;
    c.check = false;
    c.back = false;
    c.kneel = !!h.in.kneel && k.carrier !== p.id;
    // Après une feinte ou un tir sur réception, la touche de tir doit être relâchée avant de resservir.
    const locked = h.fakeLock;
    if (!h.in.shoot) h.fakeLock = false;
    if (k.carrier === p.id) {
      const behind = michiganSide(state, p) !== 0;
      if (behind || p.mich > 0) {
        // Derrière la cage adverse, à l'arrêt : le tir maintenu charge un Michigan.
        p.charge = 0;
        if (chargeMichigan(state, p, h.in.shoot && !locked, h.edge.shootUp && !locked)) c.mich = true;
      } else if (state.tick === p.ai.gotTick && p.ai.recvPass && h.in.shoot && !h.edge.shootDown) {
        // Tir sur réception : la touche de tir était déjà enfoncée quand la passe est arrivée.
        c.shoot = 0.7;
        h.fakeLock = true;
      } else if (locked) p.charge = 0;
      else if (h.in.shoot && h.edge.pass && p.charge > 0.12) {
        // Feinte : passe pendant que le tir se charge. Le tir est annulé.
        c.fake = true;
        h.fakeLock = true;
      } else {
        if (h.in.shoot) p.charge = Math.min(1, p.charge + DT / 0.7);
        if (h.edge.shootUp) c.shoot = p.charge;
        else if (h.edge.pass) c.pass = true;
      }
    } else {
      p.charge = 0;
      p.mich = 0;
      if (h.edge.steal) c.steal = true;
      if (h.edge.check) c.check = true;
      // Patinage arrière : face à un porteur adverse proche, s'en éloigner se fait à reculons.
      if (carrier && carrier.team !== p.team && !carrier.goalie) {
        const dx = carrier.x - p.x;
        const dy = carrier.y - p.y;
        const d = hyp(dx, dy) || 1;
        if (d < 9 && (c.mx * dx + c.my * dy) / d < -0.35 && Math.abs(angleDiff(Math.atan2(dy, dx), p.face)) < 1.3) {
          c.back = true;
          c.fx = carrier.x;
          c.fy = carrier.y;
        }
      }
      if (h.edge.sw) {
        const n = nearestToPuck(state, h.team, p.id);
        if (n) {
          c.mx = 0;
          c.my = 0;
          c.skid = false;
          c.kneel = false;
          h.selected = n.id;
          h.swT = 0;
        }
      }
    }
  }
}

function actions(state) {
  for (const p of state.players) {
    if (p.status !== 'rink' || p.goalie || p.stun > 0) continue;
    const c = p.ctl;
    if (c.mich) doMichigan(state, p);
    else if (c.fake) doFake(state, p);
    else if (c.shoot >= 0) doShoot(state, p, c.shoot);
    else if (c.pass) doPass(state, p, c.passTo ?? -1);
    else if (c.steal) doSteal(state, p);
    if (state.phase !== 'play' && state.phase !== 'shootout') return;
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
    p.ctl.skid = false;
    p.ctl.dodge = false;
    p.ctl.check = false;
    p.ctl.back = false;
    p.ctl.kneel = false;
    p.ctl.fake = false;
    p.ctl.mich = false;
    p.mich = 0;
  }
  moveSkaters(state);
  collide(state);
  state.phaseT -= DT;
  if (state.phaseT > 0) return;
  if (state.phase === 'break') {
    if (state.period === 1) startSecondPeriod(state);
    else if (state.period === 2) startOvertime(state);
    else return startShootout(state);
  } else if (state.suddenDeath) return finish(state, 'prolongation', state.score[0] > state.score[1] ? 0 : 1);
  else beginFaceoff(state, state.faceoff.spot, state.faceoff.reason);
  autoSelect(state);
}

/** Tirs de pénalité : mise en place, tir (commandes habituelles pour un humain), puis résultat. */
function tickShootout(state) {
  const so = state.so;
  if (so.stage !== 'run') {
    so.t -= DT;
    if (so.t > 0) return;
    if (so.stage === 'setup') {
      so.stage = 'run';
      so.t = 0;
    } else afterShot(state);
    return;
  }
  timers(state);
  const human = state.humans.some((h) => h.team === so.team);
  if (human) applyHumans(state);
  else shootoutAI(state);
  // Seul face au gardien : ni passe ni feinte de passe.
  const c = state.players[so.shooter].ctl;
  c.pass = false;
  c.fake = false;
  c.mich = false;
  actions(state);
  moveSkaters(state);
  moveGoalies(state);
  collide(state);
  if (!so.over) updatePuck(state);
  judgeShot(state);
  if (so.over) endShot(state);
}

/**
 * Avance le match d'un pas. inputs[i] = commandes du joueur humain i :
 * { mx, my, pass, shoot, steal, sw, skid, dodge, check, kneel } (mx, my entre -1 et 1 ; le reste en booléens
 * « touche enfoncée »).
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
    case 'shootout':
      tickShootout(state);
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
