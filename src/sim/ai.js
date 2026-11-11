// Ordinateur : pilote tous les patineurs qu'un humain ne contrôle pas, dans les deux équipes.
import { DT, GOAL_X, HW, HL, inCrease } from './geometry.js';
import { rnd, skatersOnRink, goalieOf, isHuman, diffOf } from './state.js';
import { segDist, topSpeed, angleDiff } from './physics.js';

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
      const allowed = Math.max(o.goalie ? 0.35 : 0.8, 2.2 + slack + away + (od - 1) * 1.2);
      want = Math.min(want, allowed / top);
      // On ne touche pas au gardien adverse dans sa zone (10.4.14) : il s'en écarte franchement.
      const keep = o.goalie && o.team !== p.team ? 1.5 : 1.05;
      if (od < keep) {
        dx -= (ox / od) * (o.goalie ? 1.3 : 0.6);
        dy -= (oy / od) * (o.goalie ? 1.3 : 0.6);
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

  // Jeu derrière la cage : bloqué sur un côté, il contourne la cage pour servir un coéquipier devant le but
  // ou ressortir de l'autre côté.
  let plan = p.ai.behind && p.ai.behind.got === p.ai.gotTick && state.tick - p.ai.behind.start < 330 ? p.ai.behind : null;
  if (!plan && ready && u > GOAL_X - 7 && u < GOAL_X + 0.5 && Math.abs(p.y) > 2.6 && rnd(state) < (nd < 2.6 ? 0.03 : 0.008)) {
    plan = p.ai.behind = { got: p.ai.gotTick, start: state.tick, side: Math.sign(p.y) || 1, stage: 0 };
  }
  if (plan) {
    const v = p.y * plan.side;
    if (plan.stage === 0 && u > GOAL_X + 1.1) plan.stage = 1;
    if (plan.stage === 1 && v < -1.9) plan.stage = 2;
    if (plan.stage === 2 && u < GOAL_X - 0.4) plan = p.ai.behind = null;
  }
  if (plan && plan.stage > 0 && ready && rnd(state) < 0.07) {
    // Passe vers l'enclave, sans traverser la cage.
    let best = null;
    let bs = -Infinity;
    for (const m of mine) {
      if (m.id === p.id || m.stun > 0 || m.x * d > GOAL_X - 0.8) continue;
      if (segDist(gx + d * 0.55, 0, k.x, k.y, m.x, m.y) < 1.15) continue;
      let lane = Infinity;
      for (const o of others) lane = Math.min(lane, segDist(o.x, o.y, k.x, k.y, m.x, m.y));
      if (lane < 0.8) continue;
      const sc = -hyp(gx - m.x, m.y) + lane;
      if (sc > bs) {
        bs = sc;
        best = m;
      }
    }
    if (best) {
      c.passTo = best.id;
      c.pass = true;
      p.ai.think = 0.3;
      p.ai.behind = null;
      return;
    }
  }

  // Porte le palet vers la cage en contournant les adversaires placés devant.
  let tx = d * (GOAL_X - 4.5);
  let ty = clamp(p.y * 0.5, -3.5, 3.5);
  if (plan) {
    const pts = [[GOAL_X + 1.95, 2.7], [GOAL_X + 1.95, -2.7], [GOAL_X - 1.4, -2.4]];
    tx = d * pts[plan.stage][0];
    ty = plan.side * pts[plan.stage][1];
  } else if (u > GOAL_X + 0.3) {
    // Il s'est retrouvé derrière la ligne de but : il ressort par le côté où il est.
    tx = d * (GOAL_X - 1.5);
    ty = (Math.sign(p.y) || 1) * 2.6;
  } else if (u > GOAL_X - 6) {
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

/**
 * Position de soutien d'un patineur sans palet quand son équipe attaque ou que le palet est libre.
 * Dans la zone d'attaque, l'équipe s'installe en carré : deux arrières en haut de zone, deux avants en bas
 * (un devant la cage, un sur le côté ou derrière la cage pour offrir le relais).
 */
function supportSpot(state, p, d, pu, pv, back, role) {
  let u;
  let v;
  const s = Math.sign(pv) || 1;
  if (pu > 8 && !back) {
    if (role.high) {
      // Arrières : en haut de zone, celui du côté du palet un peu plus bas.
      v = role.side * 5;
      u = GOAL_X - (role.side === s ? 9 : 10.5);
      if (pu > GOAL_X) u += 2;
    } else if (pu > GOAL_X - 0.5) {
      // Palet derrière la cage : un avant devant le but, l'autre à l'opposé près du poteau.
      u = role.first ? GOAL_X - 3.3 : GOAL_X - 2.2;
      v = role.first ? -s * 0.6 : -s * 2.9;
    } else if (role.first) {
      u = GOAL_X - 3.2;
      v = -s * 1.6;
    } else {
      // Relais bas, du côté du palet : derrière la ligne de but si le porteur est plus haut.
      u = pu < GOAL_X - 5 ? GOAL_X + 1.7 : GOAL_X - 4.5;
      v = pu < GOAL_X - 5 ? s * 3.2 : -s * 5;
    }
    v += Math.sin(state.tick * 0.02 + p.id) * 0.5;
    u += Math.cos(state.tick * 0.017 + p.id * 2) * 0.4;
  } else {
    if (!role.high) {
      u = clamp(pu + 6 + (role.first ? 0 : 2) - back, -6, GOAL_X - 3.5);
      v = role.side * 4.5;
      if (Math.abs(pv - v) < 3) v += v > pv ? 3 : -3;
    } else {
      u = clamp(pu - 7 - back, -GOAL_X + 5, GOAL_X - 12);
      v = role.side * 4.5;
    }
    v += Math.sin(state.tick * 0.02 + p.id) * 1.2;
    u += Math.cos(state.tick * 0.017 + p.id * 2) * 1.0;
  }
  let tx = u * d;
  const ty = clamp(v, -HW + 1.5, HW - 1.5);
  if (inCrease(tx, ty, d)) tx -= d * 1.6;
  return [clamp(tx, -HL + 1.2, HL - 1.2), ty];
}

/** Rôles en attaque : les deux patineurs les plus hauts placés (hors porteur) sont les avants. */
function attackRoles(mine, carrier) {
  const roles = new Map();
  const rest = mine.filter((p) => p !== carrier).sort((a, b) => a.slot - b.slot);
  const carrierLow = carrier ? carrier.slot <= 1 : false;
  const lows = rest.filter((p) => p.slot <= 1);
  const highs = rest.filter((p) => p.slot > 1);
  // Si un arrière porte le palet, un avant recule tenir son poste ; si un avant le porte, rien ne change.
  while (highs.length > 2) lows.push(highs.shift());
  while (lows.length > (carrierLow ? 1 : 2)) highs.push(lows.pop());
  lows.forEach((p, i) => roles.set(p.id, { high: false, first: i === 0, side: i === 0 ? -1 : 1 }));
  highs.forEach((p, i) => roles.set(p.id, { high: true, first: i === 0, side: highs.length === 1 ? (carrier && carrier.y > 0 ? -1 : 1) : i === 0 ? -1 : 1 }));
  return roles;
}

/**
 * Défense en carré devant la cage (zone) : deux joueurs bas près des poteaux, deux joueurs hauts.
 * Le carré coulisse du côté du palet ; à trois c'est un triangle, à deux une ligne basse.
 */
function boxCorners(n, pv) {
  const sh = clamp(pv * 0.22, -1.6, 1.6);
  const low = [[2.3, -2.3 + sh], [2.3, 2.3 + sh]];
  if (n >= 4) return [...low, [7.2, -3.3 + sh * 1.5], [7.2, 3.3 + sh * 1.5]];
  if (n === 3) return [...low, [6.6, sh * 2]];
  return low;
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

    // Défense : en carré devant la cage quand le palet est dans la zone, marquage individuel plus haut.
    const marks = new Map();
    const posts = new Map();
    if (mode === 'defend') {
      const cu = -carrier.x * d; // distance du porteur à la ligne médiane, vers notre cage
      if (cu > 7 && !carrier.goalie) {
        const corners = boxCorners(mine.length, carrier.y).map(([du, v]) => ({ x: ownGx + d * du, y: v }));
        const pool = mine.filter((p) => p !== presser);
        // Le coin le plus proche du porteur est celui que le joueur au pressing a quitté.
        if (presser && corners.length > pool.length) corners.splice(corners.indexOf([...corners].sort(byDist(carrier.x, carrier.y))[0]), 1);
        for (const q of corners) {
          if (!pool.length) break;
          pool.sort(byDist(q.x, q.y));
          const m = pool.shift();
          // Chaque coin se resserre sur l'attaquant qui s'y présente.
          let tx = q.x;
          let ty = q.y;
          for (const o of opps) {
            if (o.id === k.carrier || hyp(o.x - q.x, o.y - q.y) > 2.6) continue;
            tx = q.x + (o.x - q.x) * 0.55;
            ty = q.y + (o.y - q.y) * 0.55;
            break;
          }
          if (inCrease(tx, ty, -d)) tx += d * 1.4;
          posts.set(m.id, [tx, ty]);
        }
      } else {
        const targets = opps.filter((o) => o.id !== k.carrier).sort((a, b) => hyp(a.x - ownGx, a.y) - hyp(b.x - ownGx, b.y));
        const markers = free.filter((p) => p !== presser).sort((a, b) => b.slot - a.slot);
        for (const o of targets) {
          if (!markers.length) break;
          markers.sort(byDist(o.x, o.y));
          marks.set(markers.shift().id, o);
        }
      }
    }
    const roles = attackRoles(mine, carrier && carrier.team === t ? carrier : null);

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
        const dc = hyp(carrier.x - p.x, carrier.y - p.y) || 1;
        const fx = Math.cos(carrier.face);
        const fy = Math.sin(carrier.face);
        const front = ((p.x - carrier.x) * fx + (p.y - carrier.y) * fy) / dc;
        if (humanTeam) {
          // Dans l'équipe d'un humain, l'ordinateur ferme le chemin de la cage et laisse le vol de palet au joueur.
          steer(state, p, carrier.x + (gxv / gl) * 2.2 + carrier.vx * 0.2, carrier.y + (gyv / gl) * 2.2 + carrier.vy * 0.2, mine, others);
          continue;
        }
        if (rnd(state) < 0.0003 * diff.reckless) p.ai.reckless = 0.9;
        const still = hyp(carrier.vx, carrier.vy) < 1.5;
        const pd = hyp(k.x - p.x, k.y - p.y);
        if (pd < 1.55 && p.stealCd <= 0) {
          const aimed = Math.abs(angleDiff(Math.atan2(k.y - p.y, k.x - p.x), p.face)) < 0.95;
          const clear = segDist(carrier.x, carrier.y, p.x, p.y, k.x, k.y) > 0.4;
          if (aimed && clear && (p.ai.reckless > 0 || hyp(p.vx, p.vy) < 6)) c.steal = rnd(state) < diff.steal * (still ? 3 : 0.45);
          else if (!clear) c.steal = rnd(state) < 0.0007 * diff.reckless;
        }
        if (front < 0.05 && dc < 4) {
          // Il est dans le dos ou sur le côté du porteur : il le contourne pour se présenter devant la palette.
          const side = Math.sign(fx * (p.y - carrier.y) - fy * (p.x - carrier.x)) || 1;
          let wx = carrier.x + fx * 1.0 - fy * side * 1.15 + carrier.vx * 0.25;
          let wy = carrier.y + fy * 1.0 + fx * side * 1.15 + carrier.vy * 0.25;
          wx = clamp(wx, -HL + 0.6, HL - 0.6);
          wy = clamp(wy, -HW + 0.6, HW - 0.6);
          steer(state, p, wx, wy, mine, others, 1);
        } else {
          // Il vise le palet, côté cage.
          const pgx = ownGx - k.x;
          const pgy = -k.y;
          const pl = hyp(pgx, pgy) || 1;
          steer(state, p, k.x + (pgx / pl) * 0.3 + carrier.vx * 0.2, k.y + (pgy / pl) * 0.3 + carrier.vy * 0.2, mine, others, still ? 1 : 0);
        }
        // À l'arrêt devant le porteur, il se tourne vers le palet.
        if (hyp(c.mx, c.my) < 0.3 && pd < 2.2) {
          const l = pd || 1;
          c.mx = ((k.x - p.x) / l) * 0.12;
          c.my = ((k.y - p.y) / l) * 0.12;
        }
        continue;
      }
      if (mode === 'defend') {
        const post = posts.get(p.id);
        if (post) {
          steer(state, p, post[0], post[1], mine, others);
          continue;
        }
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
      const [tx, ty] = supportSpot(state, p, d, ref.x * d, ref.y, back, roles.get(p.id) ?? { high: p.slot > 1, first: p.slot % 2 === 0, side: p.slot % 2 ? 1 : -1 });
      steer(state, p, tx, ty, mine, others);
    }
  }
}
