// Patinage, palet, gardiens, contacts. Les contacts fautifs sont signalés à l'arbitrage (rules.js).
import { DT, HL, GOAL_X, GOAL_HW, GOAL_DEPTH, GOAL_H, POST_R, PLAYER_R, GOALIE_R, PUCK_R, boardHit, boardInfo, inCrease, pushOutOfGoal, nearestSpot, defenceSpots } from './geometry.js';
import { rnd, emit, skatersOnRink, goalieOf, isHuman, diffOf, form } from './state.js';
import { touch, callFoul, stopPlay, goalCrossed, attackersInCrease } from './rules.js';

const hyp = Math.hypot;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const TUNE = {
  maxSpeed: 8.2,
  carry: 0.92,
  accel: 11,
  coast: 1.5,
  slow: 10, // ralentissement voulu (la commande demande moins de vitesse)
  // Patinage sur roues : les roues accrochent, on tourne en carre sur un arc de cercle.
  latAccel: 21, // accélération en virage : à pleine vitesse, le cercle le plus serré fait environ 3 m de rayon
  turnMax: 9, // rad/s à basse vitesse
  grip: 14, // amortissement de la glisse latérale
  skidBrake: 17, // dérapage : freinage en m/s²
  skidTurn: 13,
  backSpeed: 0.72, // patinage arrière : part de la vitesse maximale
  backAccel: 10,
  dodgeDist: 1.5,
  dodgeT: 0.2,
  dodgeCd: 1.5,
  checkT: 0.32,
  checkBoost: 3.2,
  checkCd: 1.3,
  gravity: 9.8,
  liftFrom: 0.45, // charge du tir à partir de laquelle le palet se lève
  michiganT: 1.0,
  kneelBar: 1.0, // position de défense : demi-largeur barrée par la crosse à plat
  kneelAhead: 0.7,
  kneelUp: 0.33, // temps pour se relever
  kneelTurn: 2.5, // rad/s : il pivote lentement sur son genou
  stick: 0.95, // le palet est porté devant le joueur…
  stickSide: 0.4, // …et sur le côté, là où la palette se pose
  passMin: 11,
  passMax: 17,
  shotMin: 16,
  shotMax: 30,
  puckFriction: 1.7,
  puckBounce: 0.55,
  pickupR: 0.95,
  pickupSpeed: 13.5,
  goalieSpeed: 3.0,
  goalieSlide: 1.0,
  goalieReact: 0.18,
  goalieOut: 0.75,
  goalieTrack: 0.09,
  butterfly: 0.14,
  highGap: 0.2, // en papillon, le haut de la cage est découvert
  lowGap: 0.06, // debout, les tirs à ras passent plus facilement
  topGap: 0.12, // lucarnes
  stealReach: 1.7,
  stealCone: 1.0,
};

export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy || 1e-9;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
  return hyp(px - ax - dx * t, py - ay - dy * t);
}
export { segDist };

export function topSpeed(state, p) {
  const notes = state.cfg.teams[p.team].notes;
  let v = TUNE.maxSpeed * (0.88 + 0.15 * notes.vitesse) * form(state, p);
  if (!isHuman(state, p.id)) v *= diffOf(state, p.team).speed;
  if (state.puck.carrier === p.id) v *= TUNE.carry;
  return v;
}

// ---------------------------------------------------------------- actions

export function pickPassTarget(state, p) {
  const c = p.ctl;
  const useInput = hyp(c.mx, c.my) > 0.3;
  const ang = useInput ? Math.atan2(c.my, c.mx) : p.face;
  let best = null;
  let bs = Infinity;
  for (const m of skatersOnRink(state, p.team)) {
    if (m.id === p.id || m.stun > 0) continue;
    const dx = m.x - p.x;
    const dy = m.y - p.y;
    const d = hyp(dx, dy);
    if (d < 1.5) continue;
    const s = Math.abs(angleDiff(Math.atan2(dy, dx), ang)) + d * 0.03;
    if (s < bs) {
      bs = s;
      best = m;
    }
  }
  return best;
}

export function doPass(state, p, targetId = -1) {
  const k = state.puck;
  if (k.carrier !== p.id) return;
  const mate = targetId >= 0 ? state.players[targetId] : pickPassTarget(state, p);
  let dx = Math.cos(p.face);
  let dy = Math.sin(p.face);
  let speed = 12;
  if (mate) {
    const d = hyp(mate.x - k.x, mate.y - k.y);
    speed = clamp(9 + d * 0.55, TUNE.passMin, TUNE.passMax);
    const t = (d / speed) * 0.85;
    const ax = mate.x + mate.vx * t - k.x;
    const ay = mate.y + mate.vy * t - k.y;
    const l = hyp(ax, ay) || 1;
    dx = ax / l;
    dy = ay / l;
  }
  k.carrier = -1;
  k.vx = dx * speed;
  k.vy = dy * speed;
  k.passTarget = mate ? mate.id : -1;
  p.pickupCd = 0.35;
  p.charge = 0;
  p.hold = 0;
  emit(state, { type: 'pass', team: p.team, from: p.id, to: k.passTarget });
}

export function doShoot(state, p, charge) {
  const k = state.puck;
  if (k.carrier !== p.id) return;
  const d = state.teams[p.team].dir;
  const gx = d * GOAL_X;
  const notes = state.cfg.teams[p.team].notes;
  const c = p.ctl;
  const aim = hyp(c.mx, c.my) > 0.3 ? Math.atan2(c.my, c.mx) : p.face;
  const toGoal = Math.atan2(-k.y, gx - k.x);
  let ang = aim;
  let errDeg = 1.5;
  if (Math.abs(angleDiff(aim, toGoal)) < 1.4 && k.x * d < GOAL_X - 0.3) {
    // Aide à la visée : le tir part vers le coin que le gardien couvre le moins.
    const g = goalieOf(state, 1 - p.team);
    let bestY = 0;
    let bs = -1;
    for (const ty of [-0.66, 0, 0.66]) {
      const s = segDist(g.x, g.y, k.x, k.y, gx, ty);
      if (s > bs) {
        bs = s;
        bestY = ty;
      }
    }
    ang = Math.atan2(bestY - k.y, gx - k.x);
    const base = isHuman(state, p.id) ? 3.2 : diffOf(state, p.team).shotErr;
    errDeg = base * (1.15 - 0.5 * notes.tir) * (0.8 + 0.5 * charge) * (1 + hyp(p.vx, p.vy) / 16);
  }
  // Tir sur réception : frappé sans contrôle, donc moins précis.
  const oneTimer = p.ai.recvPass && state.tick - (p.ai.gotTick ?? -99) <= 2;
  if (oneTimer) errDeg *= 1.5;
  ang += ((rnd(state) - rnd(state)) * errDeg * Math.PI) / 180;
  const speed = (TUNE.shotMin + (TUNE.shotMax - TUNE.shotMin) * clamp(charge, 0, 1)) * (0.92 + 0.12 * notes.tir) * form(state, p);
  k.carrier = -1;
  k.vx = Math.cos(ang) * speed;
  k.vy = Math.sin(ang) * speed;
  // Tir court : à ras du sol. Tir chargé : le palet se lève, d'autant plus haut que la charge est forte.
  k.z = 0;
  k.vz = 0;
  if (charge >= TUNE.liftFrom) {
    const high = 0.35 + 0.6 * ((charge - TUNE.liftFrom) / (1 - TUNE.liftFrom)) + (rnd(state) - rnd(state)) * 0.06 * errDeg;
    const t = Math.max(0.12, Math.min(hyp(gx - k.x, k.y), 14) / speed);
    k.vz = Math.max(0, (high + 0.5 * TUNE.gravity * t * t) / t);
    k.z = 0.02;
  }
  k.passTarget = -1;
  p.pickupCd = 0.4;
  p.charge = 0;
  emit(state, { type: 'shot', team: p.team, by: p.id, speed, oneTimer });
}

/** La crosse d'un patineur passe-t-elle à travers le corps de o avant d'arriver au point (ex, ey) ? */
function stickThrough(p, o, ex, ey) {
  return segDist(o.x, o.y, p.x, p.y, ex, ey) < (o.goalie ? GOALIE_R : PLAYER_R) - 0.1;
}

/**
 * Vol de palet : la palette va chercher la palette adverse (harponnage, autorisé : 10.4.25 ne vise que le corps).
 * Tout dépend de ce que la crosse rencontre : le palet, ou le corps d'un adversaire. Par l'arrière, elle
 * traverse le porteur : accrocher. Sur un joueur sans palet : cinglage. Lancée trop vite : faire trébucher.
 */
export function doSteal(state, p) {
  if (p.stealCd > 0 || p.stun > 0 || p.kneeling || state.puck.carrier === p.id) return;
  p.stealCd = 0.7;
  p.stealAnim = 0.25;
  const k = state.puck;
  const speed = hyp(p.vx, p.vy);
  const carrier = k.carrier >= 0 ? state.players[k.carrier] : null;
  // Si le palet est devant et à portée, la palette le vise ; sinon elle part droit devant.
  const pdx = k.x - p.x;
  const pdy = k.y - p.y;
  const pd = hyp(pdx, pdy);
  const aimed = pd < TUNE.stealReach && Math.abs(angleDiff(Math.atan2(pdy, pdx), p.face)) < TUNE.stealCone;
  const ang = aimed ? Math.atan2(pdy, pdx) : p.face;
  const reach = aimed ? pd : TUNE.stealReach * 0.85;
  const ex = p.x + Math.cos(ang) * reach;
  const ey = p.y + Math.sin(ang) * reach;
  emit(state, { type: 'poke', by: p.id, x: ex, y: ey });

  // Premier adversaire que la crosse rencontre en chemin.
  let hit = null;
  let hd = Infinity;
  for (const o of state.players) {
    if (o.team === p.team || o.status !== 'rink' || !stickThrough(p, o, ex, ey)) continue;
    const d = hyp(o.x - p.x, o.y - p.y);
    if (d < hd) {
      hd = d;
      hit = o;
    }
  }
  if (hit) {
    if (hit.goalie) return;
    if (carrier !== hit) {
      // La crosse touche un joueur qui n'a pas le palet : cinglage (10.4.22).
      const recent = state.tick - hit.hadPuckTick < 20 || hyp(k.x - hit.x, k.y - hit.y) < 1.2;
      if (hd < 1.3 && !recent) callFoul(state, { code: 'CIN', offender: p.id, severity: speed > 6.8 ? 'major' : 'minor' });
      return;
    }
    const front = ((p.x - hit.x) * Math.cos(hit.face) + (p.y - hit.y) * Math.sin(hit.face)) / (hd || 1);
    if (front < -0.3) {
      // Par l'arrière, la crosse accroche le porteur (10.4.25).
      hit.vx *= 0.6;
      hit.vy *= 0.6;
      callFoul(state, { code: 'ACC', offender: p.id, severity: 'minor', victim: hit.id, hadPuck: true });
    } else if (speed > 6.2) trip(state, p, hit);
    return;
  }
  if (!aimed) return;
  if (!carrier) {
    // Palet libre à portée de crosse : il le ramène à lui.
    if (p.pickupCd <= 0 && hyp(k.vx, k.vy) < TUNE.pickupSpeed) take(state, p);
    return;
  }
  if (carrier.team === p.team || carrier.goalie) return;
  if (carrier.dodgeT > 0) return; // esquivé
  const cd = hyp(carrier.x - p.x, carrier.y - p.y) || 1;
  const front = ((p.x - carrier.x) * Math.cos(carrier.face) + (p.y - carrier.y) * Math.sin(carrier.face)) / cd;
  const fast = speed > 6.2 && cd < 1.3;
  // Palette contre palette : plus facile de face, et contre un porteur à l'arrêt qui ne protège pas son palet.
  const win = rnd(state) < 0.5 + (front > 0.4 ? 0.15 : 0) + (hyp(carrier.vx, carrier.vy) < 1.5 ? 0.2 : 0);
  if (win) {
    // Palet gagné : pas de faute, même si l'adversaire tombe (10.4.26 A).
    k.carrier = p.id;
    k.passTarget = -1;
    touch(state, p);
    carrier.pickupCd = 0.7;
    carrier.stealCd = 1.2;
    if (fast) carrier.stun = 0.7;
    emit(state, { type: 'steal', team: p.team, by: p.id, from: carrier.id });
  } else if (fast) trip(state, p, carrier);
}

/** Vol de palet manqué à pleine vitesse : l'adversaire tombe, faire trébucher (10.4.26). */
function trip(state, p, tgt) {
  const k = state.puck;
  tgt.stun = 0.8;
  const hadPuck = k.carrier === tgt.id;
  if (k.carrier === tgt.id) {
    k.carrier = -1;
    k.vx = tgt.vx * 0.5 + (rnd(state) - 0.5) * 3;
    k.vy = tgt.vy * 0.5 + (rnd(state) - 0.5) * 3;
  }
  callFoul(state, { code: 'TRE', offender: p.id, severity: 'minor', victim: tgt.id, hadPuck });
}

// ---------------------------------------------------------------- déplacements

/** Feinte de tir : le gardien adverse peut s'y laisser prendre et descendre trop tôt. */
export function doFake(state, p) {
  const k = state.puck;
  if (k.carrier !== p.id) return;
  p.charge = 0;
  const g = goalieOf(state, 1 - p.team);
  const d = state.teams[p.team].dir;
  if ((g.x - p.x) * d > 0 && hyp(g.x - p.x, g.y - p.y) < 10 && rnd(state) < 0.6 / diffOf(state, g.team).goalie) g.down = 0.75;
  emit(state, { type: 'fake', by: p.id });
}

/** Poteau derrière lequel un Michigan peut partir : renvoie le côté (+1 ou -1) ou 0 si les conditions manquent. */
export function michiganSide(state, p) {
  const k = state.puck;
  if (k.carrier !== p.id || p.goalie) return 0;
  const d = state.teams[p.team].dir;
  const u = p.x * d;
  // Derrière la ligne de but adverse, près d'un poteau, presque à l'arrêt, sans adversaire à moins de 1,5 m.
  if (u < GOAL_X + 0.2 || Math.abs(p.y) > 3.2 || hyp(p.vx, p.vy) > 2.5) return 0;
  if (nearestOpp(state, p.team, p.x, p.y) < 1.5) return 0;
  return Math.sign(p.y) || 1;
}

/** Michigan : le palet, ramassé sur la palette, est déposé dans la lucarne en contournant le poteau. */
export function doMichigan(state, p) {
  const side = michiganSide(state, p);
  p.mich = 0;
  if (!side) return;
  const k = state.puck;
  const d = state.teams[p.team].dir;
  k.carrier = -1;
  k.passTarget = -1;
  k.x = d * (GOAL_X - 0.35);
  k.y = side * 1.0;
  k.z = 0.9;
  const ang = Math.atan2(side * 0.45 - k.y, d * (GOAL_X + 0.6) - k.x) + (rnd(state) - rnd(state)) * 0.1;
  k.vx = Math.cos(ang) * 9;
  k.vy = Math.sin(ang) * 9;
  k.vz = 0.4;
  p.pickupCd = 0.6;
  emit(state, { type: 'michigan', team: p.team, by: p.id });
}

function friction(p, a) {
  const sp = hyp(p.vx, p.vy);
  if (sp <= 0) return;
  const ns = Math.max(0, sp - a * DT);
  p.vx *= ns / sp;
  p.vy *= ns / sp;
}

/**
 * Patinage sur roues. Le joueur roule dans l'axe de ses patins : pour tourner il se penche et décrit un arc
 * (virage en carre, la vitesse est conservée) ; pour s'arrêter ou repartir à l'opposé il dérape, patins en travers.
 * Commandes lues dans p.ctl : mx, my (direction, l'amplitude donne l'inclinaison), skid, dodge, check,
 * back + fx, fy (patinage arrière, le regard vers ce point).
 */
export function moveSkaters(state) {
  const k = state.puck;
  for (const p of state.players) {
    if (p.goalie || p.status !== 'rink') continue;
    const c = p.ctl;
    const sp = hyp(p.vx, p.vy);
    if (p.dodgeCd > 0) p.dodgeCd -= DT;
    if (p.checkCd > 0) p.checkCd -= DT;
    if (p.offBal > 0) p.offBal -= DT;
    p.skid = false;
    p.back = false;
    p.turn = 0;
    const wasKneeling = p.kneeling;
    p.kneeling = p.stun <= 0 && p.offBal <= 0 && p.checkT <= 0 && !!c.kneel && k.carrier !== p.id;
    if (wasKneeling && !p.kneeling && p.stun <= 0) p.offBal = Math.max(p.offBal, TUNE.kneelUp);
    if (p.stun > 0) {
      p.stun -= DT;
      p.checkT = 0;
      friction(p, 7);
    } else if (p.kneeling) {
      // Position de défense : il glisse sur son élan puis s'arrête, et pivote lentement vers la commande,
      // ou à défaut vers le palet.
      friction(p, 6);
      const want = hyp(c.mx, c.my);
      const aim = want > 0.3 ? Math.atan2(c.my, c.mx) : Math.atan2(k.y - p.y, k.x - p.x);
      p.face += clamp(angleDiff(aim, p.face), -TUNE.kneelTurn * DT, TUNE.kneelTurn * DT);
    } else {
      const free = p.offBal <= 0 && p.checkT <= 0;
      let mx = free ? c.mx : 0;
      let my = free ? c.my : 0;
      const want = hyp(mx, my);
      if (free && c.dodge && p.dodgeCd <= 0) {
        // Esquive : un pas de côté, dans la direction demandée ou à défaut perpendiculaire au patinage.
        const a = want > 0.3 ? Math.atan2(my, mx) : p.face + Math.PI / 2;
        p.ddx = Math.cos(a);
        p.ddy = Math.sin(a);
        p.dodgeT = TUNE.dodgeT;
        p.dodgeCd = TUNE.dodgeCd;
        emit(state, { type: 'dodge', by: p.id });
      }
      if (free && c.check && p.checkCd <= 0 && k.carrier !== p.id) {
        // Charge volontaire : coup d'épaule vers l'avant.
        p.checkT = TUNE.checkT;
        p.checkCd = TUNE.checkCd;
        p.checkHit = false;
        const f = Math.min(sp + TUNE.checkBoost, TUNE.maxSpeed * 1.15);
        p.vx = Math.cos(p.face) * f;
        p.vy = Math.sin(p.face) * f;
        emit(state, { type: 'check', by: p.id });
      } else if (p.checkT > 0) {
        p.checkT -= DT;
        // Charge dans le vide : il lui faut un instant pour retrouver son équilibre.
        if (p.checkT <= 0 && !p.checkHit) p.offBal = 0.35;
      }
      if (want < 0.05) {
        friction(p, c.skid && free ? TUNE.skidBrake : p.checkT > 0 ? 0.5 : TUNE.coast);
        p.skid = !!c.skid && free && sp > 1.5;
      } else if (c.back) {
        // Patinage arrière : il recule en gardant le jeu devant lui.
        p.back = true;
        const top = topSpeed(state, p) * TUNE.backSpeed * Math.min(1, want);
        const dvx = (mx / want) * top - p.vx;
        const dvy = (my / want) * top - p.vy;
        const dv = hyp(dvx, dvy);
        if (dv > 0) {
          const st = Math.min(dv, TUNE.backAccel * DT);
          p.vx += (dvx / dv) * st;
          p.vy += (dvy / dv) * st;
        }
        const turn = angleDiff(Math.atan2((c.fy ?? k.y) - p.y, (c.fx ?? k.x) - p.x), p.face);
        p.face += clamp(turn, -8 * DT, 8 * DT);
      } else {
        const diff = angleDiff(Math.atan2(my, mx), p.face);
        // L'ordinateur dérape de lui-même pour un demi-tour à pleine vitesse.
        const skid = (c.skid || (!isHuman(state, p.id) && Math.abs(diff) > 2.3 && sp > 4.5)) && sp > 1.5;
        if (skid) {
          p.skid = true;
          friction(p, TUNE.skidBrake);
          p.face += clamp(diff, -TUNE.skidTurn * DT, TUNE.skidTurn * DT);
        } else {
          // Virage en carre : plus le joueur se penche (amplitude de la commande), plus l'arc est serré.
          const lean = clamp(want, 0.35, 1);
          const wmax = Math.min(TUNE.turnMax, TUNE.latAccel / Math.max(sp, 0.5)) * lean;
          const dth = clamp(diff, -wmax * DT, wmax * DT);
          p.face += dth;
          p.turn = dth / DT;
          const cs = Math.cos(dth);
          const sn = Math.sin(dth);
          const rx = p.vx * cs - p.vy * sn;
          const ry = p.vx * sn + p.vy * cs;
          const cf = Math.cos(p.face);
          const sf = Math.sin(p.face);
          let f = rx * cf + ry * sf;
          let l = (-rx * sf + ry * cf) * Math.max(0, 1 - TUNE.grip * DT);
          const top = topSpeed(state, p) * Math.min(1, want);
          if (f < top) f = Math.min(top, f + TUNE.accel * DT * (Math.abs(diff) < 1.6 ? 1 : 0.35));
          else f = Math.max(top, f - TUNE.slow * DT);
          p.vx = f * cf - l * sf;
          p.vy = f * sf + l * cf;
        }
      }
      while (p.face > Math.PI) p.face -= 2 * Math.PI;
      while (p.face < -Math.PI) p.face += 2 * Math.PI;
    }
    p.x += p.vx * DT;
    p.y += p.vy * DT;
    if (p.dodgeT > 0) {
      p.dodgeT -= DT;
      p.x += p.ddx * (TUNE.dodgeDist / TUNE.dodgeT) * DT;
      p.y += p.ddy * (TUNE.dodgeDist / TUNE.dodgeT) * DT;
    }
    const b = boardHit(p.x, p.y, PLAYER_R);
    if (b) {
      p.x = b.x;
      p.y = b.y;
      const vn = p.vx * b.nx + p.vy * b.ny;
      if (vn > 0) {
        p.vx -= vn * b.nx;
        p.vy -= vn * b.ny;
      }
    }
    pushOutOfGoal(p, PLAYER_R);
  }
}

function nearestOpp(state, team, x, y) {
  let bd = Infinity;
  for (const o of state.players) {
    if (o.team === team || o.goalie || o.status !== 'rink') continue;
    bd = Math.min(bd, hyp(o.x - x, o.y - y));
  }
  return bd;
}

export function moveGoalies(state) {
  const k = state.puck;
  for (let t = 0; t < 2; t++) {
    const g = goalieOf(state, t);
    const d = state.teams[t].dir;
    const gx = -d * GOAL_X;
    g.track.x += (k.x - g.track.x) * TUNE.goalieTrack;
    g.track.y += (k.y - g.track.y) * TUNE.goalieTrack;
    let tx;
    let ty;
    const front = (g.track.x - gx) * d;
    if (front > 0.2) {
      const dx = g.track.x - gx;
      const dy = g.track.y;
      const l = hyp(dx, dy) || 1;
      const out = Math.min(TUNE.goalieOut, l * 0.5);
      tx = gx + d * Math.max(0.35, ((dx / l) * out) * d);
      ty = clamp((dy / l) * out, -0.75, 0.75);
    } else {
      tx = gx + d * 0.35;
      ty = (Math.sign(g.track.y) || 1) * 0.7;
    }
    let sp = TUNE.goalieSpeed * (0.8 + 0.3 * state.cfg.teams[t].notes.gardien) * diffOf(state, t).goalie;
    // Tir en route vers la cage : il descend en papillon, jambières au sol, et glisse sur la trajectoire.
    if (g.down > 0) g.down -= DT;
    if (g.save && (g.save.t -= DT) <= 0) g.save = null;
    if (k.carrier < 0 && (k.vx * -d) > 7 && (k.x - g.x) * d > 0 && (k.x - g.x) * d < 11) {
      const tHit = (g.x - k.x) / k.vx;
      const yHit = k.y + k.vy * tHit;
      const zHit = k.z + k.vz * tHit - 0.5 * TUNE.gravity * tHit * tHit;
      if (Math.abs(yHit) < GOAL_HW + 0.6) {
        // Temps de réaction avant de plonger. Sur un tir haut, il reste debout.
        g.react = (g.react ?? 0) + DT;
        if (g.react > TUNE.goalieReact) {
          if (zHit < 0.55) g.down = 0.55;
          tx = g.x;
          ty = clamp(yHit, -GOAL_HW, GOAL_HW);
          sp *= TUNE.goalieSlide;
        }
      } else g.react = 0;
    } else g.react = 0;
    const dx = tx - g.x;
    const dy = ty - g.y;
    const l = hyp(dx, dy);
    const s = Math.min(l, sp * DT);
    g.vx = l > 0 ? ((dx / l) * s) / DT : 0;
    g.vy = l > 0 ? ((dy / l) * s) / DT : 0;
    g.x += g.vx * DT;
    g.y += g.vy * DT;
    g.face = Math.atan2(k.y - g.y, k.x - g.x);

    if (k.carrier !== g.id) {
      g.hold = 0;
      continue;
    }
    // Le gardien a le palet : il le gèle sous la pression (zone privilégiée, 2.2.5.1), sinon il relance.
    g.hold += DT;
    const near = nearestOpp(state, t, g.x, g.y);
    const freeze = (near < 4 && g.hold > 0.35) || g.hold > 2.6;
    if (freeze) {
      stopPlay(state, 'freeze', {
        spot: nearestSpot(g.x, g.y, defenceSpots(d)),
        call: { kind: 'info', titre: 'Arrêt du gardien', detail: `${state.cfg.teams[t].sigle} n° ${g.num} gèle le palet`, article: '9.3.1', team: t },
      });
      return;
    }
    if (g.hold > 0.7) {
      let best = null;
      let bs = -Infinity;
      for (const m of skatersOnRink(state, t)) {
        const open = nearestOpp(state, t, m.x, m.y);
        if (open < 2.2) continue;
        const s = open - hyp(m.x - g.x, m.y - g.y) * 0.15;
        if (s > bs) {
          bs = s;
          best = m;
        }
      }
      if (best) doPass(state, g, best.id);
    }
  }
}

// ---------------------------------------------------------------- contacts

function judgeContact(state, a, b, nx, ny, impact, charged) {
  // a fonce sur b, le long de la normale (nx, ny) qui va de a vers b. charged : a a lancé une charge.
  // Sans charge lancée, un choc n'est jamais une charge (INC, CBA, DOS) ; l'obstruction reste jugée.
  if (a.goalie || a.stun > 0 || b.stun > 0 || a.foulCd > 0 || a.team === b.team) return;
  const k = state.puck;
  if (b.goalie) {
    const side = Math.sign(b.x);
    if (!inCrease(b.x, b.y, side)) return;
    if (charged && impact > 4.5) callFoul(state, { code: 'INC', offender: a.id, severity: 'major' });
    else if (!inCrease(k.x, k.y, side) && impact > 1.5) callFoul(state, { code: 'OBS', offender: a.id, severity: 'minor' });
    return;
  }
  const behind = -nx * Math.cos(b.face) - ny * Math.sin(b.face) < -0.57;
  const bi = boardInfo(b.x, b.y);
  const nearBoard = bi.dist < 1.3 && bi.nx * nx + bi.ny * ny > 0.4;
  let foul = null;
  if (charged && behind && impact > 4.6) foul = { code: 'DOS', severity: 'major', extra: nearBoard ? 'PM' : 'MPM' };
  else if (charged && nearBoard && impact > 5) foul = { code: 'CBA', severity: impact < 8.5 ? 'minor' : 'major' };
  else if (charged && impact > 6) foul = { code: 'INC', severity: impact < 9.5 ? 'minor' : 'major' };
  else if (charged && impact > 4 && k.carrier !== a.id && k.carrier !== b.id && hyp(k.x - b.x, k.y - b.y) > 2.5 && hyp(k.x - a.x, k.y - a.y) > 2 && Math.abs(Math.abs(b.x) - GOAL_X) + Math.abs(b.y) > 4) {
    foul = { code: 'OBS', severity: 'minor' };
  }
  if (foul) {
    if (callFoul(state, { ...foul, offender: a.id, victim: b.id, hadPuck: k.carrier === b.id }) && charged && impact > 5) b.stun = 0.9;
  }
}

export function collide(state) {
  const list = state.players.filter((p) => p.status === 'rink');
  const k = state.puck;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const min = (a.goalie ? GOALIE_R : PLAYER_R) + (b.goalie ? GOALIE_R : PLAYER_R);
      const d = hyp(dx, dy);
      if (d >= min || d === 0) continue;
      const nx = dx / d;
      const ny = dy / d;
      const va = a.vx * nx + a.vy * ny; // vitesse de a vers b
      const vb = -(b.vx * nx + b.vy * ny); // vitesse de b vers a
      const impact = va + vb;
      const dodged = a.team !== b.team && (a.dodgeT > 0 || b.dodgeT > 0);
      let charged = false;
      if (dodged) {
        // Charge esquivée : le chargeur est emporté par son élan.
        for (const q of [a, b]) {
          if (q.checkT > 0) {
            q.checkT = 0;
            q.checkHit = true;
            q.offBal = 0.6;
          }
        }
      } else if (impact > 0 && state.phase === 'play') {
        const agg = va >= 0.65 * impact ? a : vb >= 0.65 * impact ? b : null;
        charged = !!agg && agg.checkT > 0;
        if (charged) agg.checkHit = true;
        if (agg === a) judgeContact(state, a, b, nx, ny, impact, charged);
        else if (agg === b) judgeContact(state, b, a, -nx, -ny, impact, charged);
        // Charge franche sur le porteur : le palet lui échappe.
        if (charged && impact > 4 && a.team !== b.team) {
          const c = k.carrier === a.id ? a : k.carrier === b.id ? b : null;
          if (c && !c.goalie) {
            k.carrier = -1;
            k.vx = c.vx * 0.4 + (rnd(state) - 0.5) * 4;
            k.vy = c.vy * 0.4 + (rnd(state) - 0.5) * 4;
            c.pickupCd = 0.4;
          }
          if (impact > 3) emit(state, { type: 'hit', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, force: impact });
        }
      }
      // Séparation et échange de quantité de mouvement.
      const over = min - d;
      const wa = a.goalie ? 0 : b.goalie ? 1 : 0.5;
      a.x -= nx * over * wa;
      a.y -= ny * over * wa;
      b.x += nx * over * (1 - wa);
      b.y += ny * over * (1 - wa);
      if (impact > 0 && !dodged) {
        // Sans charge, les deux joueurs se freinent l'un l'autre au lieu de rebondir.
        const jImp = (charged ? 1.2 : 1.0) * impact;
        if (!a.goalie) {
          a.vx -= nx * jImp * (b.goalie ? 1 : 0.5);
          a.vy -= ny * jImp * (b.goalie ? 1 : 0.5);
        }
        if (!b.goalie) {
          b.vx += nx * jImp * (a.goalie ? 1 : 0.5);
          b.vy += ny * jImp * (a.goalie ? 1 : 0.5);
        }
      }
    }
  }
}

// ---------------------------------------------------------------- palet

function take(state, p) {
  const k = state.puck;
  p.ai.recvPass = k.passTarget === p.id;
  k.carrier = p.id;
  k.passTarget = -1;
  k.z = 0;
  k.vz = 0;
  p.hold = 0;
  touch(state, p);
  emit(state, { type: 'pickup', team: p.team, by: p.id });
}

/** Cage : but si le palet franchit entièrement la ligne entre les poteaux, rebond sinon. Renvoie true si le jeu s'arrête. */
function goalFrame(state, px, py) {
  const k = state.puck;
  const s = Math.sign(k.x);
  if (!s) return false;
  const plane = GOAL_X + PUCK_R;
  const ax = k.x * s;
  const apx = px * s;
  // Au-dessus de la barre transversale, le palet survole la cage.
  if (k.z > GOAL_H + 0.05) return false;
  if (apx <= plane && ax > plane) {
    const t = (plane - apx) / (ax - apx);
    const yc = py + (k.y - py) * t;
    if (k.z > GOAL_H - 0.05 && Math.abs(yc) < GOAL_HW + POST_R + PUCK_R) {
      // Barre transversale.
      k.x = s * (GOAL_X - 0.06);
      k.y = yc;
      k.vx = -k.vx * 0.4;
      k.vz = Math.abs(k.vz) * 0.5 + 1.5;
      emit(state, { type: 'post' });
      return false;
    }
    if (Math.abs(yc) < GOAL_HW - PUCK_R) {
      const foul = k.wasInCrease === s ? k.creaseFoul : attackersInCrease(state, s);
      k.x = s * (GOAL_X + 0.45);
      k.y = yc * 0.8;
      goalCrossed(state, s, foul);
      return true;
    }
    if (Math.abs(yc) < GOAL_HW + POST_R + PUCK_R) {
      // Poteau.
      k.carrier = -1;
      k.x = s * (GOAL_X - 0.06);
      k.y = yc;
      k.vx = -k.vx * 0.5;
      k.vy = k.vy * 0.5 + Math.sign(yc) * Math.abs(k.vx) * 0.35;
      emit(state, { type: 'post' });
      return false;
    }
  }
  if (k.carrier < 0 && ax > plane && ax < GOAL_X + GOAL_DEPTH && Math.abs(k.y) < GOAL_HW + POST_R) {
    if (k.z > GOAL_H) return false;
    // Le palet heurte la cage par le côté ou par l'arrière.
    if (Math.abs(py) >= GOAL_HW + POST_R) {
      k.y = Math.sign(py) * (GOAL_HW + POST_R + 0.02);
      k.vy = -k.vy * 0.4;
    } else {
      k.x = s * (GOAL_X + GOAL_DEPTH + 0.02);
      k.vx = -k.vx * 0.4;
    }
  }
  return false;
}

export function updatePuck(state) {
  const k = state.puck;
  if (k.dead) return;
  const P = state.players;
  const px = k.x;
  const py = k.y;

  if (k.carrier >= 0) {
    const c = P[k.carrier];
    if (c.status !== 'rink' || c.stun > 0) {
      k.carrier = -1;
      k.vx = c.vx * 0.6;
      k.vy = c.vy * 0.6;
    } else {
      const reach = c.goalie ? 0.45 : TUNE.stick;
      const side = c.goalie ? 0 : TUNE.stickSide;
      k.x = c.x + Math.cos(c.face) * reach - Math.sin(c.face) * side;
      k.y = c.y + Math.sin(c.face) * reach + Math.cos(c.face) * side;
      k.vx = c.vx;
      k.vy = c.vy;
      k.z = (c.mich ?? 0) * 0.75; // Michigan : le palet monte sur la palette
      k.vz = 0;
      const b = boardHit(k.x, k.y, PUCK_R);
      if (b) {
        k.x = b.x;
        k.y = b.y;
      }
      c.hadPuckTick = state.tick;
      if (!c.goalie) {
        // Le gardien adverse couvre un palet amené dans ses jambières.
        const og = goalieOf(state, 1 - c.team);
        if (hyp(k.x - og.x, k.y - og.y) < GOALIE_R + 0.12) {
          c.pickupCd = 0.5;
          take(state, og);
          emit(state, { type: 'save', team: og.team, kind: 'cover' });
        }
      }
    }
  }

  if (k.carrier < 0) {
    const sp = hyp(k.vx, k.vy);
    if (k.z > 0 || k.vz > 0) {
      // En l'air : pas de frottement, il retombe.
      k.vz -= TUNE.gravity * DT;
      k.z += k.vz * DT;
      if (k.z <= 0) {
        k.z = 0;
        k.vz = 0;
      }
    } else if (sp > 0) {
      const ns = Math.max(0, sp - TUNE.puckFriction * DT);
      k.vx *= ns / sp;
      k.vy *= ns / sp;
    }
    k.x += k.vx * DT;
    k.y += k.vy * DT;
    const b = boardHit(k.x, k.y, PUCK_R);
    if (b) {
      k.x = b.x;
      k.y = b.y;
      const vn = k.vx * b.nx + k.vy * b.ny;
      if (vn > 0) {
        k.vx -= (1 + TUNE.puckBounce) * vn * b.nx;
        k.vy -= (1 + TUNE.puckBounce) * vn * b.ny;
        k.vx *= 0.94;
        k.vy *= 0.94;
        if (vn > 4) emit(state, { type: 'board', force: vn });
      }
    }
  }

  if (goalFrame(state, px, py)) return;

  if (k.carrier < 0) {
    // Arrêts des gardiens.
    for (let t = 0; t < 2; t++) {
      const g = goalieOf(state, t);
      const dx = g.x - k.x;
      const dy = g.y - k.y;
      const d = hyp(dx, dy);
      // Le papillon ferme le bas de la cage mais découvre le haut ; debout, le gardien couvre mieux le haut.
      if (k.z > (g.down > 0 ? 1.1 : 1.6)) continue;
      const cover = g.down > 0 ? (k.z < 0.5 ? TUNE.butterfly : -TUNE.highGap) : k.z < 0.25 ? -TUNE.lowGap : k.z > 0.8 ? -TUNE.topGap : 0;
      if (d >= GOALIE_R + PUCK_R + cover) continue;
      const nx = dx / (d || 1);
      const ny = dy / (d || 1);
      const vn = (k.vx - g.vx) * nx + (k.vy - g.vy) * ny;
      const sp = hyp(k.vx, k.vy);
      if (vn <= 0 && sp > 1) continue;
      if (sp > 6 && k.lastTeam >= 0 && k.lastTeam !== t) state.teams[k.lastTeam].shots++;
      // Avec quoi arrête-t-il ? Tir bas : les jambières. Tir haut : la mitaine (main gauche, elle capte le
      // palet) ou le bouclier (main droite, il le renvoie), selon le côté où passe le palet.
      const hz = k.z;
      const lat = (k.y - g.y) * state.teams[t].dir; // > 0 : à la droite du gardien
      const part = hz < 0.5 ? 'jambieres' : lat < 0 ? 'mitaine' : 'bouclier';
      g.save = { part, lat, h: hz, t: 0.5 };
      if (sp < 6 || (part === 'jambieres' ? rnd(state) < 0.45 : part === 'mitaine')) {
        take(state, g);
        if (part === 'jambieres') g.down = Math.max(g.down, 0.5);
        emit(state, { type: 'save', team: t, kind: 'catch', part });
      } else {
        k.vx = (k.vx - 2 * vn * nx) * 0.35 + (rnd(state) - 0.5) * 3;
        k.vy = (k.vy - 2 * vn * ny) * 0.35 + (rnd(state) - 0.5) * 3;
        k.x = g.x - nx * (GOALIE_R + PUCK_R + 0.02);
        k.y = g.y - ny * (GOALIE_R + PUCK_R + 0.02);
        k.passTarget = -1;
        touch(state, g);
        if (part === 'jambieres') g.down = Math.max(g.down, 0.5);
        emit(state, { type: 'save', team: t, kind: 'rebound', part });
      }
      break;
    }
  }

  if (k.carrier < 0 && k.z < 0.2) {
    // Position de défense : la crosse à plat barre le passage au ras du sol.
    for (const p of P) {
      if (!p.kneeling || p.goalie || p.status !== 'rink' || p.pickupCd > 0) continue;
      const fx = Math.cos(p.face);
      const fy = Math.sin(p.face);
      const cx = p.x + fx * TUNE.kneelAhead;
      const cy = p.y + fy * TUNE.kneelAhead;
      // Le palet a-t-il franchi la ligne de la crosse pendant ce pas, entre ses deux bouts ?
      const before = (px - cx) * fx + (py - cy) * fy;
      const after = (k.x - cx) * fx + (k.y - cy) * fy;
      const along = -(k.x - cx) * fy + (k.y - cy) * fx;
      const crossed = before * after <= 0 && before !== after;
      if (Math.abs(along) > TUNE.kneelBar || !(crossed || Math.abs(after) < 0.12)) continue;
      const sp = hyp(k.vx, k.vy);
      touch(state, p);
      k.passTarget = -1;
      if (sp < 8) {
        // Palet lent : il le contrôle et se relève.
        take(state, p);
        p.kneeling = false;
        p.offBal = TUNE.kneelUp;
      } else {
        const vn = k.vx * fx + k.vy * fy;
        k.vx = (k.vx - 2 * vn * fx) * 0.35 + (rnd(state) - 0.5) * 2;
        k.vy = (k.vy - 2 * vn * fy) * 0.35 + (rnd(state) - 0.5) * 2;
        k.x = cx - fy * along + fx * 0.1 * Math.sign(before || 1);
        k.y = cy + fx * along + fy * 0.1 * Math.sign(before || 1);
        p.pickupCd = 0.25;
      }
      emit(state, { type: 'block', team: p.team, by: p.id, kneel: true });
      break;
    }
  }

  if (k.carrier < 0) {
    // Contrôle du palet libre, ou tir contré par un patineur.
    let best = null;
    let bd = Infinity;
    for (const p of P) {
      if (p.goalie || p.status !== 'rink' || p.stun > 0 || p.pickupCd > 0 || k.z > (p.kneeling ? 0.9 : 1.4)) continue;
      const dx = k.x - p.x;
      const dy = k.y - p.y;
      const d = hyp(dx, dy);
      if (d > TUNE.pickupR) continue;
      const rel = hyp(k.vx - p.vx, k.vy - p.vy);
      if (k.z > 0.35 || rel > (k.passTarget === p.id ? 30 : TUNE.pickupSpeed)) {
        if (d < PLAYER_R) {
          const nx = dx / (d || 1);
          const ny = dy / (d || 1);
          const vn = (k.vx - p.vx) * nx + (k.vy - p.vy) * ny;
          if (vn < 0) {
            k.vx = (k.vx - 2 * vn * nx) * 0.3;
            k.vy = (k.vy - 2 * vn * ny) * 0.3;
            k.x = p.x + nx * (PLAYER_R + 0.06);
            k.y = p.y + ny * (PLAYER_R + 0.06);
            k.passTarget = -1;
            touch(state, p);
            emit(state, { type: 'block', team: p.team });
          }
        }
        continue;
      }
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    if (best) take(state, best);
  }

  // Zone de but : on retient si un attaquant s'y trouvait quand le palet y est entré (9.3.9 L).
  const cs = inCrease(k.x, k.y, 1) ? 1 : inCrease(k.x, k.y, -1) ? -1 : 0;
  if (cs !== 0 && k.wasInCrease !== cs) k.creaseFoul = attackersInCrease(state, cs);
  if (cs === 0) k.creaseFoul = false;
  k.wasInCrease = cs;
  if (Math.abs(k.x) > HL || Math.abs(k.y) > 13) {
    k.x = clamp(k.x, -HL + 1, HL - 1);
    k.y = clamp(k.y, -11, 11);
  }
}
