// Déroulement d'un match, pas à pas (60 pas par seconde). Point d'entrée de la logique du jeu.
import { DT, SPOTS, BENCH_Y } from './geometry.js';
import { createMatch, skatersOnRink, ownGoalX } from './state.js';
import { beginFaceoff, tickFaceoff, tickRules, startSecondPeriod, startOvertime, finish, pullGoalie, lateTrail } from './rules.js';
import { startShootout, startPenaltyShot, shootoutAI, judgeShot, endShot, afterShot } from './shootout.js';
import { TUNE, doPass, doShoot, doSteal, doFake, doMichigan, michiganSide, angleDiff, moveSkaters, moveGoalies, collide, updatePuck } from './physics.js';
import { computeAI } from './ai.js';

export { createMatch };

const hyp = Math.hypot;
const EMPTY = { mx: 0, my: 0, pass: false, shoot: false, steal: false, sw: false, skid: false, dodge: false, check: false, kneel: false, line: false, timeout: false, pull: false, sprint: false };

/** Patineur déjà dirigé par un coéquipier humain : deux joueurs d'une équipe ne dirigent jamais le même. */
const takenByMate = (state, h, id) => state.humans.some((q) => q !== h && q.team === h.team && q.selected === id);

function nearestToPuck(state, team, except = -1, human = null) {
  const k = state.puck;
  let best = null;
  let bd = Infinity;
  for (const p of skatersOnRink(state, team)) {
    if (p.id === except || (human && takenByMate(state, human, p.id))) continue;
    const d = hyp(p.x - k.x, p.y - k.y);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

/**
 * Jeu simple : trois boutons à double rôle, quelle que soit la machine. Le bouton de tir (ou de vol) tire avec le
 * palet et vole sans ; celui de passe (ou de changement de joueur) passe ou change de joueur ; celui d'esquive (ou
 * de charge) esquive ou charge. Freinage, genou, sprint, changement de ligne, temps mort et sortie du gardien ne
 * sont pas commandés. Quand le palet change de main, un bouton encore tenu ne compte pas avant d'être relâché :
 * voler le palet ne déclenche pas un tir.
 */
function simplifier(state, h, raw) {
  const a = [!!(raw.shoot || raw.steal), !!(raw.pass || raw.sw), !!(raw.dodge || raw.check)];
  const has = state.puck.carrier === h.selected && h.selected >= 0;
  if (h.sHas !== has) {
    h.sHas = has;
    h.sWait = a.slice();
  }
  h.sWait = (h.sWait ?? [false, false, false]).map((w, i) => w && a[i]);
  const [tir, passe, geste] = a.map((v, i) => v && !h.sWait[i]);
  return { ...EMPTY, mx: raw.mx, my: raw.my, shoot: tir && has, steal: tir && !has, pass: passe && has, sw: passe && !has, dodge: geste && has, check: geste && !has };
}

function readHumans(state, inputs) {
  state.humans.forEach((h, i) => {
    let raw = { ...EMPTY, ...(inputs[i] ?? EMPTY) };
    if (state.cfg.simple) raw = simplifier(state, h, raw);
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
      line: raw.line && !h.prev.line,
      timeout: raw.timeout && !h.prev.timeout,
      pull: raw.pull && !h.prev.pull,
    };
    // Temps mort demandé : pris au prochain arrêt de jeu, un par période, pas en prolongation.
    const mine = state.teams[h.team];
    if (h.edge.timeout && !mine.timeoutUsed && state.period !== 3 && !['final', 'shootout', 'timeout'].includes(state.phase)) mine.wantTimeout = !mine.wantTimeout;
    // Changement de ligne demandé : il se fera au prochain arrêt de jeu (mode manuel seulement).
    if (h.edge.line && state.cfg.lineChange === 'manuel' && state.period !== 3 && state.phase !== 'final') state.teams[h.team].wantChange = !state.teams[h.team].wantChange;
    // Fin de match, équipe menée de peu : sortir son gardien, ou le rappeler d'un second appui.
    if (h.edge.pull && state.phase === 'play' && lateTrail(state, h.team)) mine.pullWant = !mine.pullWant;
    h.prev = { pass: raw.pass, shoot: raw.shoot, steal: raw.steal, sw: raw.sw, dodge: raw.dodge, check: raw.check, line: raw.line, timeout: raw.timeout, pull: raw.pull };
    // Engagement : passe ou tir pour disputer le palet (en jeu simple, sans palet, ce sont « changer » et « voler »).
    if (state.phase === 'faceoff' && (h.edge.pass || h.edge.shootDown || (state.cfg.simple && (h.edge.sw || h.edge.steal)))) h.foPress = state.tick;
  });
}

/**
 * Deux joueurs dans la même équipe : qui prend le patineur (dirigé par l'ordinateur) qui porte ou va recevoir le
 * palet ? Le passeur ; à défaut, celui dont le patineur est le plus près.
 */
function taker(state, team, target) {
  const mates = state.humans.filter((q) => q.team === team);
  const passer = mates.find((q) => q.selected === state.puck.lastTouch && q.selected !== target);
  if (passer) return passer;
  const t = state.players[target];
  let best = null;
  let bd = Infinity;
  for (const q of mates) {
    const p = state.players[q.selected];
    const d = p && p.status === 'rink' ? hyp(p.x - t.x, p.y - t.y) : 1e6;
    if (d < bd) {
      bd = d;
      best = q;
    }
  }
  return best;
}

/** Le joueur humain contrôle le porteur du palet de son équipe, sinon le patineur choisi. */
function autoSelect(state) {
  const k = state.puck;
  const carrier = k.carrier >= 0 ? state.players[k.carrier] : null;
  const ctrl = carrier ? carrier.team : -1;
  for (const h of state.humans) {
    const cur = state.players[h.selected];
    if (state.humans.some((q) => q !== h && q.team === h.team)) {
      // Avec un coéquipier humain, chacun garde son patineur : on ne change que pour le palet (porteur ou
      // destinataire d'une passe que personne ne dirige), ou si son patineur a quitté la piste.
      const target = carrier?.team === h.team && !carrier.goalie ? carrier.id : k.carrier < 0 && k.passTarget >= 0 && state.players[k.passTarget].team === h.team && !state.players[k.passTarget].goalie ? k.passTarget : -1;
      if (target >= 0 && h.selected !== target && !takenByMate(state, h, target) && taker(state, h.team, target) === h) {
        if (cur) cur.ctl.mx = cur.ctl.my = 0;
        h.selected = target;
      } else if (!cur || cur.status !== 'rink' || takenByMate(state, h, h.selected)) {
        const n = nearestToPuck(state, h.team, -1, h);
        h.selected = n ? n.id : -1;
      }
      h.swT = 0;
      if (ctrl >= 0) h.lastCtrl = ctrl;
      continue;
    }
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
    c.sprint = !!h.in.sprint;
    c.dodge = h.edge.dodge;
    c.check = false;
    c.back = false;
    c.kneel = !!h.in.kneel && k.carrier !== p.id;
    // Après une feinte ou un tir sur réception, la touche de tir doit être relâchée avant de resservir.
    const locked = h.fakeLock;
    if (!h.in.shoot) h.fakeLock = false;
    if (k.carrier === p.id) {
      const behind = !state.cfg.simple && michiganSide(state, p) !== 0; // pas de « michigan » en jeu simple
      if (behind || p.mich > 0) {
        // Derrière la cage adverse, à l'arrêt : le tir maintenu charge un Michigan.
        p.charge = 0;
        if (chargeMichigan(state, p, h.in.shoot && !locked, h.edge.shootUp && !locked)) c.mich = true;
      } else if (state.tick === p.ai.gotTick && p.ai.recvPass && h.in.shoot && !h.edge.shootDown) {
        // Tir sur réception : la touche de tir était déjà enfoncée quand la passe est arrivée.
        c.shoot = 0.7;
        h.fakeLock = true;
      } else if (locked) p.charge = 0;
      else if (!state.cfg.simple && h.in.shoot && h.edge.pass && p.charge > 0.12) {
        // Feinte : passe pendant que le tir se charge. Le tir est annulé.
        c.fake = true;
        h.fakeLock = true;
      } else {
        if (h.in.shoot) p.charge = Math.min(1, p.charge + DT / 0.7);
        // Jeu simple : un appui bref donne quand même un vrai tir.
        if (h.edge.shootUp) c.shoot = state.cfg.simple ? Math.max(0.55, p.charge) : p.charge;
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
        const n = nearestToPuck(state, h.team, p.id, h);
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
  pullGoalie(state);
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
    p.ctl.sprint = false;
    p.ctl.dodge = false;
    p.ctl.check = false;
    p.ctl.back = false;
    p.ctl.kneel = false;
    p.ctl.fake = false;
    p.ctl.mich = false;
    p.mich = 0;
  }
  if (state.phase === 'timeout') {
    // Temps mort : chaque équipe se regroupe devant son banc.
    for (const p of state.players) {
      if (p.goalie || p.status !== 'rink') continue;
      const side = state.teams[p.team].dir > 0 ? -1 : 1;
      const dx = side * (5 + p.slot * 1.1) - p.x;
      const dy = BENCH_Y + 1.6 - p.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.8) {
        p.ctl.mx = dx / d;
        p.ctl.my = dy / d;
      }
    }
  }
  moveSkaters(state);
  collide(state);
  // Arbitre humain : rien ne reprend tant qu'il n'a pas rendu sa décision.
  if (state.ref?.wait) return;
  state.phaseT -= DT;
  if (state.phaseT > 0) return;
  if (state.phase === 'break') {
    if (state.period === 1) startSecondPeriod(state);
    else if (state.period === 2) startOvertime(state);
    else return startShootout(state);
  } else if (state.pshot && state.phase === 'whistle') return startPenaltyShot(state);
  else if (state.suddenDeath) return finish(state, 'prolongation', state.score[0] > state.score[1] ? 0 : 1);
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
 * { mx, my, pass, shoot, steal, sw, skid, dodge, check, kneel, line } (mx, my entre -1 et 1 ; le reste en booléens
 * « touche enfoncée »).
 */
/**
 * Entraînement (choix du jeu, pas une règle) : la ligne du joueur et son gardien, face au seul gardien adverse.
 * Pas de chronomètre, pas d'engagement : après un but, un palet gelé ou tout autre arrêt, le palet est rendu au
 * joueur au centre. La commande de temps mort redonne un palet tout de suite. `state.drill` compte les tirs, les
 * buts et les arrêts de la séance.
 */
function nouveauPalet(state) {
  const t = state.humans[0]?.team ?? 0;
  beginFaceoff(state, SPOTS.C, 'period');
  for (const p of state.players) if (p.team !== t && !p.goalie && p.status === 'rink') p.status = 'bench';
  // Les gardiens sont dans leur cage dès le premier palet (pas d'entrée en piste à attendre).
  for (const g of state.players) {
    const gx = ownGoalX(state, g.team);
    if (g.goalie && g.status === 'rink' && Math.hypot(g.x - gx, g.y) > 4) Object.assign(g, { x: gx * 0.96, y: 0, vx: 0, vy: 0, face: gx > 0 ? Math.PI : 0 });
  }
  const k = state.puck;
  const p = nearestToPuck(state, t) ?? state.players.find((q) => q.team === t && !q.goalie && q.status === 'rink');
  state.phase = 'play';
  state.call = null;
  state.advantage = -1;
  state.clock = state.cfg.periodLength;
  state.drill.wait = 0;
  if (!p) return;
  Object.assign(k, { carrier: p.id, x: p.x, y: p.y, z: 0, vx: 0, vy: 0, vz: 0, passTarget: -1, dead: false });
  for (const h of state.humans) h.selected = p.id;
}

function stepTraining(state, inputs) {
  state.tick++;
  state.drill ??= { tirs: 0, buts: 0, arrets: 0, wait: 0, prev: false };
  const d = state.drill;
  const t = state.humans[0]?.team ?? 0;
  const debut = state.events.length;
  const veut = !!inputs[0]?.timeout && !d.prev;
  d.prev = !!inputs[0]?.timeout;
  readHumans(state, inputs.map((i) => (i ? { ...i, timeout: false, line: false, pull: false } : i)));
  if (state.phase === 'pregame' || veut) nouveauPalet(state);
  else if (state.phase === 'play') {
    tickPlay(state);
    state.clock = state.cfg.periodLength; // le temps ne compte pas
    for (const team of state.teams) if (team.fresh) team.fresh = team.fresh.map(() => 1); // ni la fatigue des lignes
    if (state.phase !== 'play') d.wait = state.phase === 'goal' ? 1.6 : 1;
  } else if ((d.wait -= DT) <= 0) nouveauPalet(state);
  for (let i = Math.min(debut, state.events.length); i < state.events.length; i++) {
    const e = state.events[i];
    if (e.type === 'shot' && e.team === t) d.tirs++;
    else if (e.type === 'goal' && e.team === t) d.buts++;
    else if (e.type === 'save' && e.team !== t && e.kind !== 'cover') d.arrets++;
  }
  return state;
}

export function step(state, inputs = []) {
  if (state.cfg.training) return stepTraining(state, inputs);
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
    case 'timeout':
    case 'goal':
    case 'break':
      tickDead(state);
      break;
    default:
      break;
  }
  return state;
}
