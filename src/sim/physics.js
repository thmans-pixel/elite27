// Patinage, palet, gardiens, contacts. Les contacts fautifs sont signalés à l'arbitrage (rules.js).
import { DT, HL, GOAL_X, GOAL_HW, GOAL_DEPTH, POST_R, PLAYER_R, GOALIE_R, PUCK_R, boardHit, boardInfo, inCrease, pushOutOfGoal, nearestSpot, defenceSpots } from './geometry.js';
import { rnd, emit, skatersOnRink, goalieOf, isHuman, diffOf } from './state.js';
import { touch, callFoul, stopPlay, goalCrossed, attackersInCrease } from './rules.js';

const hyp = Math.hypot;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const TUNE = {
  maxSpeed: 8.2,
  carry: 0.92,
  accel: 13,
  brake: 19,
  coast: 2.2,
  turn: 10,
  stick: 0.85,
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
  goalieReact: 0.26,
  goalieOut: 0.75,
  goalieTrack: 0.09,
  butterfly: 0.1,
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
  let v = TUNE.maxSpeed * (0.88 + 0.15 * notes.vitesse);
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
  ang += ((rnd(state) - rnd(state)) * errDeg * Math.PI) / 180;
  const speed = (TUNE.shotMin + (TUNE.shotMax - TUNE.shotMin) * clamp(charge, 0, 1)) * (0.92 + 0.12 * notes.tir);
  k.carrier = -1;
  k.vx = Math.cos(ang) * speed;
  k.vy = Math.sin(ang) * speed;
  k.passTarget = -1;
  p.pickupCd = 0.4;
  p.charge = 0;
  emit(state, { type: 'shot', team: p.team, by: p.id, speed });
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
  if (p.stealCd > 0 || p.stun > 0 || state.puck.carrier === p.id) return;
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
      callFoul(state, { code: 'ACC', offender: p.id, severity: 'minor' });
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
  if (k.carrier === tgt.id) {
    k.carrier = -1;
    k.vx = tgt.vx * 0.5 + (rnd(state) - 0.5) * 3;
    k.vy = tgt.vy * 0.5 + (rnd(state) - 0.5) * 3;
  }
  callFoul(state, { code: 'TRE', offender: p.id, severity: 'minor' });
}

// ---------------------------------------------------------------- déplacements

export function moveSkaters(state) {
  for (const p of state.players) {
    if (p.goalie || p.status !== 'rink') continue;
    const sp = hyp(p.vx, p.vy);
    if (p.stun > 0) {
      p.stun -= DT;
      const ns = Math.max(0, sp - 7 * DT);
      if (sp > 0) {
        p.vx *= ns / sp;
        p.vy *= ns / sp;
      }
    } else {
      const c = p.ctl;
      const want = hyp(c.mx, c.my);
      if (want < 0.05) {
        const ns = Math.max(0, sp - TUNE.coast * DT);
        if (sp > 0) {
          p.vx *= ns / sp;
          p.vy *= ns / sp;
        }
      } else {
        const top = topSpeed(state, p) * Math.min(1, want);
        const tx = (c.mx / want) * top;
        const ty = (c.my / want) * top;
        const dvx = tx - p.vx;
        const dvy = ty - p.vy;
        const dv = hyp(dvx, dvy);
        if (dv > 0) {
          const a = dvx * p.vx + dvy * p.vy < 0 ? TUNE.brake : TUNE.accel;
          const s = Math.min(dv, a * DT);
          p.vx += (dvx / dv) * s;
          p.vy += (dvy / dv) * s;
        }
        const turn = angleDiff(Math.atan2(c.my, c.mx), p.face);
        p.face += clamp(turn, -TUNE.turn * DT, TUNE.turn * DT);
      }
    }
    p.x += p.vx * DT;
    p.y += p.vy * DT;
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
    if (k.carrier < 0 && (k.vx * -d) > 7 && (k.x - g.x) * d > 0 && (k.x - g.x) * d < 11) {
      const yHit = k.y + (k.vy * (g.x - k.x)) / k.vx;
      if (Math.abs(yHit) < GOAL_HW + 0.6) {
        // Temps de réaction avant de plonger.
        g.react = (g.react ?? 0) + DT;
        if (g.react > TUNE.goalieReact) {
          g.down = 0.55;
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

function judgeContact(state, a, b, nx, ny, impact) {
  // a fonce sur b, le long de la normale (nx, ny) qui va de a vers b.
  if (a.goalie || a.stun > 0 || b.stun > 0 || a.foulCd > 0 || a.team === b.team) return;
  const k = state.puck;
  if (b.goalie) {
    const side = Math.sign(b.x);
    if (!inCrease(b.x, b.y, side)) return;
    if (impact > 4.5) callFoul(state, { code: 'INC', offender: a.id, severity: 'major' });
    else if (!inCrease(k.x, k.y, side) && impact > 0.8) callFoul(state, { code: 'OBS', offender: a.id, severity: 'minor' });
    return;
  }
  const behind = -nx * Math.cos(b.face) - ny * Math.sin(b.face) < -0.57;
  const bi = boardInfo(b.x, b.y);
  const nearBoard = bi.dist < 1.3 && bi.nx * nx + bi.ny * ny > 0.4;
  let foul = null;
  if (behind && impact > 4.6) foul = { code: 'DOS', severity: 'major', extra: nearBoard ? 'PM' : 'MPM' };
  else if (nearBoard && impact > 5) foul = { code: 'CBA', severity: impact < 8.5 ? 'minor' : 'major' };
  else if (impact > 6) foul = { code: 'INC', severity: impact < 9.5 ? 'minor' : 'major' };
  else if (impact > 5 && k.carrier !== a.id && k.carrier !== b.id && hyp(k.x - b.x, k.y - b.y) > 2.5 && hyp(k.x - a.x, k.y - a.y) > 2 && Math.abs(Math.abs(b.x) - GOAL_X) + Math.abs(b.y) > 4) {
    foul = { code: 'OBS', severity: 'minor' };
  }
  if (foul) {
    if (callFoul(state, { ...foul, offender: a.id }) && impact > 5) b.stun = 0.9;
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
      if (impact > 0 && state.phase === 'play') {
        if (va >= 0.65 * impact) judgeContact(state, a, b, nx, ny, impact);
        else if (vb >= 0.65 * impact) judgeContact(state, b, a, -nx, -ny, impact);
        // Contact franc sur le porteur : le palet lui échappe.
        if (impact > 4 && a.team !== b.team) {
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
      if (impact > 0) {
        const jImp = 1.2 * impact;
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
  k.carrier = p.id;
  k.passTarget = -1;
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
  if (apx <= plane && ax > plane) {
    const t = (plane - apx) / (ax - apx);
    const yc = py + (k.y - py) * t;
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
      k.x = c.x + Math.cos(c.face) * reach;
      k.y = c.y + Math.sin(c.face) * reach;
      k.vx = c.vx;
      k.vy = c.vy;
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
    if (sp > 0) {
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
      if (d >= GOALIE_R + PUCK_R + (g.down > 0 ? TUNE.butterfly : 0)) continue;
      const nx = dx / (d || 1);
      const ny = dy / (d || 1);
      const vn = (k.vx - g.vx) * nx + (k.vy - g.vy) * ny;
      const sp = hyp(k.vx, k.vy);
      if (vn <= 0 && sp > 1) continue;
      if (sp > 6 && k.lastTeam >= 0 && k.lastTeam !== t) state.teams[k.lastTeam].shots++;
      if (sp < 6 || rnd(state) < 0.45) {
        take(state, g);
        g.down = Math.max(g.down, 0.5);
        emit(state, { type: 'save', team: t, kind: 'catch' });
      } else {
        k.vx = (k.vx - 2 * vn * nx) * 0.35 + (rnd(state) - 0.5) * 3;
        k.vy = (k.vy - 2 * vn * ny) * 0.35 + (rnd(state) - 0.5) * 3;
        k.x = g.x - nx * (GOALIE_R + PUCK_R + 0.02);
        k.y = g.y - ny * (GOALIE_R + PUCK_R + 0.02);
        k.passTarget = -1;
        touch(state, g);
        g.down = Math.max(g.down, 0.5);
        emit(state, { type: 'save', team: t, kind: 'rebound' });
      }
      break;
    }
  }

  if (k.carrier < 0) {
    // Contrôle du palet libre, ou tir contré par un patineur.
    let best = null;
    let bd = Infinity;
    for (const p of P) {
      if (p.goalie || p.status !== 'rink' || p.stun > 0 || p.pickupCd > 0) continue;
      const dx = k.x - p.x;
      const dy = k.y - p.y;
      const d = hyp(dx, dy);
      if (d > TUNE.pickupR) continue;
      const rel = hyp(k.vx - p.vx, k.vy - p.vy);
      if (rel > (k.passTarget === p.id ? 30 : TUNE.pickupSpeed)) {
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
