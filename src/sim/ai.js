// Ordinateur : pilote tous les patineurs qu'un humain ne contrôle pas, dans les deux équipes.
import { DT, GOAL_X, HW, HL, inCrease } from './geometry.js';
import { rnd, skatersOnRink, goalieOf, isHuman, diffOf } from './state.js';
import { segDist, topSpeed } from './physics.js';

const hyp = Math.hypot;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Dirige un patineur vers un point, en évitant coéquipiers et charges sur l'adversaire. */
function steer(state, p, tx, ty, mine, others, slack = 0) {
  const c = p.ctl;
  let dx = tx - p.x;
  let dy = ty - p.y;
  const dist = hyp(dx, dy);
  if (dist < 0.25) {
    c.mx = 0;
    c.my = 0;
    return;
  }
  dx /= dist;
  dy /= dist;
  let want = dist > 2.5 ? 1 : Math.max(0.25, dist / 2.5);
  for (const m of mine) {
    if (m.id === p.id) continue;
    const ox = p.x - m.x;
    const oy = p.y - m.y;
    const od = hyp(ox, oy);
    if (od < 1.7 && od > 0.01) {
      const w = ((1.7 - od) / 1.7) * 0.9;
      dx += (ox / od) * w;
      dy += (oy / od) * w;
    }
  }
  if (p.ai.reckless <= 0) {
    // Ralentit à l'approche d'un adversaire pour ne pas le charger.
    const top = topSpeed(state, p);
    for (const o of others) {
      const ox = o.x - p.x;
      const oy = o.y - p.y;
      const od = hyp(ox, oy);
      if (od > 2.4 || od < 0.01) continue;
      const toward = (ox * dx + oy * dy) / od;
      if (toward < 0.3) continue;
      const away = (o.vx * ox + o.vy * oy) / od;
      const allowed = Math.max(0.8, 2.2 + slack + away + (od - 1) * 1.2);
      want = Math.min(want, allowed / top);
      if (od < 1.05) {
        dx -= (ox / od) * 0.6;
        dy -= (oy / od) * 0.6;
      }
    }
  }
  const l = hyp(dx, dy) || 1;
  c.mx = (dx / l) * want;
  c.my = (dy / l) * want;
}

function carrierAI(state, p, d, diff, mine, opps, others) {
  const c = p.ctl;
  const k = state.puck;
  const u = p.x * d;
  const gx = d * GOAL_X;
  const gd = hyp(gx - p.x, p.y);
  let nd = Infinity;
  for (const o of opps) nd = Math.min(nd, hyp(o.x - p.x, o.y - p.y));
  p.ai.think -= DT;
  const ready = p.ai.think <= 0 && state.tick - (p.ai.gotTick ?? 0) > 14;

  if (ready && u < GOAL_X - 1 && Math.abs(p.y) < (GOAL_X - u) * 1.6 + 1.5 && gd < diff.shootRange) {
    const blocked = opps.some((o) => (o.x - p.x) * d > 0 && segDist(o.x, o.y, k.x, k.y, gx, 0) < 0.7);
    const prob = gd < 6.5 ? 0.22 : blocked ? 0.008 : 0.04 + (nd < 2.2 ? 0.07 : 0);
    if (rnd(state) < prob) {
      c.shoot = 0.3 + rnd(state) * 0.65;
      p.ai.think = 0.3;
      return;
    }
  }

  if (ready) {
    const pressured = nd < 2.3;
    if (rnd(state) < (pressured ? 0.08 : 0.008)) {
      let best = null;
      let bs = -Infinity;
      for (const m of mine) {
        if (m.id === p.id || m.stun > 0) continue;
        const dist = hyp(m.x - p.x, m.y - p.y);
        if (dist < 3 || dist > 22) continue;
        let open = Infinity;
        let lane = Infinity;
        for (const o of opps) {
          open = Math.min(open, hyp(o.x - m.x, o.y - m.y));
          lane = Math.min(lane, segDist(o.x, o.y, k.x, k.y, m.x, m.y));
        }
        if (open < 1.8 || lane < 1) continue;
        const s = (m.x - p.x) * d * 0.6 + Math.min(open, 6) * 0.5 - dist * 0.1 + (hyp(gx - m.x, m.y) < 9 ? 3 : 0);
        if (s > bs) {
          bs = s;
          best = m;
        }
      }
      if (best && (pressured || bs > 2)) {
        c.passTo = best.id;
        c.pass = true;
        p.ai.think = 0.3;
        return;
      }
    }
  }

  // Porte le palet vers la cage en contournant les adversaires placés devant.
  let tx = d * (GOAL_X - 4.5);
  let ty = clamp(p.y * 0.5, -3.5, 3.5);
  if (u > GOAL_X - 6) {
    tx = d * (GOAL_X - 2.4);
    ty = clamp(p.y, -2, 2) * 0.3;
  }
  let dx = tx - p.x;
  let dy = ty - p.y;
  const l = hyp(dx, dy) || 1;
  dx /= l;
  dy /= l;
  let sx = 0;
  let sy = 0;
  for (const o of others) {
    const ox = o.x - p.x;
    const oy = o.y - p.y;
    const od = hyp(ox, oy);
    if (od > 4.5 || od < 0.01) continue;
    const ahead = (ox * dx + oy * dy) / od;
    if (ahead < 0.2) continue;
    const side = Math.sign(dx * oy - dy * ox) || p.ai.lane || 1;
    const w = ((4.5 - od) / 4.5) * ahead * 1.6;
    sx += side * dy * w;
    sy += -side * dx * w;
  }
  dx += sx;
  dy += sy;
  const n = hyp(dx, dy) || 1;
  c.mx = dx / n;
  c.my = dy / n;
}

/** Position de soutien d'un patineur sans palet quand son équipe attaque ou que le palet est libre. */
function supportSpot(state, p, d, pu, pv, back) {
  let u;
  let v;
  if (p.slot <= 1) {
    u = clamp(pu + 6 + p.slot * 2 - back, -6, GOAL_X - 3.5);
    v = p.slot === 0 ? -4.5 : 4.5;
    if (pu > 9 && !back) {
      const s = Math.sign(pv) || 1;
      if (p.slot === 0) {
        u = GOAL_X - 4.4;
        v = -s * 2.4;
      } else {
        u = GOAL_X - 7.5;
        v = -s * 5.5;
      }
    } else if (Math.abs(pv - v) < 3) v += v > pv ? 3 : -3;
  } else {
    u = clamp(pu - 7 - back, -GOAL_X + 5, GOAL_X - 12);
    v = p.slot === 2 ? -4.5 : 4.5;
  }
  v += Math.sin(state.tick * 0.02 + p.id) * 1.2;
  u += Math.cos(state.tick * 0.017 + p.id * 2) * 1.0;
  let tx = u * d;
  const ty = clamp(v, -HW + 1.5, HW - 1.5);
  if (inCrease(tx, ty, d)) tx -= d * 1.6;
  return [clamp(tx, -HL + 2, HL - 2), ty];
}

export function computeAI(state) {
  const k = state.puck;
  const P = state.players;
  const carrier = k.carrier >= 0 ? P[k.carrier] : null;
  for (let t = 0; t < 2; t++) {
    const d = state.teams[t].dir;
    const diff = diffOf(state, t);
    const mine = skatersOnRink(state, t);
    const opps = skatersOnRink(state, 1 - t);
    const others = [...opps, goalieOf(state, 1 - t), goalieOf(state, t)];
    const humanTeam = state.humans.some((h) => h.team === t);
    const ownGx = -d * GOAL_X;
    const receiving = !carrier && k.passTarget >= 0 && P[k.passTarget].team === t && P[k.passTarget].status === 'rink';
    const mode = carrier ? (carrier.team === t ? 'attack' : 'defend') : receiving ? 'attack' : 'loose';

    const px = k.x + k.vx * 0.3;
    const py = k.y + k.vy * 0.3;
    const free = mine.filter((p) => p.stun <= 0 && !isHuman(state, p.id));
    const byDist = (x, y) => (a, b) => hyp(a.x - x, a.y - y) - hyp(b.x - x, b.y - y);
    let chaser = null;
    if (mode === 'loose') chaser = [...free].sort(byDist(px, py))[0] ?? null;
    if (mode === 'attack' && receiving) chaser = P[k.passTarget];
    let presser = null;
    if (mode === 'defend' && !carrier.goalie) presser = [...free].sort(byDist(carrier.x, carrier.y))[0] ?? null;

    // Marquage : chaque défenseur libre prend l'adversaire sans palet le plus dangereux.
    const marks = new Map();
    if (mode === 'defend') {
      const targets = opps.filter((o) => o.id !== k.carrier).sort((a, b) => hyp(a.x - ownGx, a.y) - hyp(b.x - ownGx, b.y));
      const markers = free.filter((p) => p !== presser).sort((a, b) => b.slot - a.slot);
      for (const o of targets) {
        if (!markers.length) break;
        markers.sort(byDist(o.x, o.y));
        marks.set(markers.shift().id, o);
      }
    }

    for (const p of mine) {
      const c = p.ctl;
      if (isHuman(state, p.id)) continue;
      c.pass = false;
      c.shoot = -1;
      c.steal = false;
      c.passTo = -1;
      p.ai.reckless -= DT;
      if (p.stun > 0) {
        c.mx = 0;
        c.my = 0;
        continue;
      }
      if (carrier && carrier.id === p.id) {
        carrierAI(state, p, d, diff, mine, opps, others);
        continue;
      }
      if (p === chaser) {
        const lead = Math.min(0.5, hyp(k.x - p.x, k.y - p.y) / 12);
        steer(state, p, k.x + k.vx * lead, k.y + k.vy * lead, mine, others, mode === 'loose' ? 1.5 : 0);
        continue;
      }
      if (p === presser) {
        const gxv = ownGx - carrier.x;
        const gyv = -carrier.y;
        const gl = hyp(gxv, gyv) || 1;
        const gap = humanTeam ? 2.2 : 0.9;
        const dc = hyp(carrier.x - p.x, carrier.y - p.y);
        if (!humanTeam) {
          if (rnd(state) < 0.0003 * diff.reckless) p.ai.reckless = 0.9;
          if (dc < 1.5 && p.stealCd <= 0) {
            const front = ((p.x - carrier.x) * Math.cos(carrier.face) + (p.y - carrier.y) * Math.sin(carrier.face)) / (dc || 1);
            if (front > -0.3) c.steal = rnd(state) < diff.steal;
            else c.steal = rnd(state) < 0.0007 * diff.reckless;
          }
        }
        steer(state, p, carrier.x + (gxv / gl) * gap + carrier.vx * 0.2, carrier.y + (gyv / gl) * gap + carrier.vy * 0.2, mine, others);
        continue;
      }
      if (mode === 'defend') {
        const o = marks.get(p.id);
        if (o) {
          const gxv = ownGx - o.x;
          const gyv = -o.y;
          const gl = hyp(gxv, gyv) || 1;
          const off = Math.max(1.7, gl * 0.3);
          let tx = o.x + (gxv / gl) * off;
          const ty = o.y + (gyv / gl) * off;
          if (inCrease(tx, ty, -d)) tx += d * 1.6;
          steer(state, p, tx, ty, mine, others);
        } else {
          steer(state, p, ownGx + d * 4.5, p.slot % 2 ? 2.2 : -2.2, mine, others);
        }
        continue;
      }
      const ref = carrier ?? k;
      const back = mode === 'loose' ? (k.x * d < 0 ? 5 : 2) : 0;
      const [tx, ty] = supportSpot(state, p, d, ref.x * d, ref.y, back);
      steer(state, p, tx, ty, mine, others);
    }
  }
}
