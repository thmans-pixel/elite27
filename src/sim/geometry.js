// Terrain réglementaire (règlement des équipements sportifs FFRS, 2.2.3 à 2.2.5).
// Repère : x le long de la piste, y en travers, origine au point central, unités en mètres.

export const DT = 1 / 60;

export const HL = 25; // demi-longueur
export const HW = 12.5; // demi-largeur
export const CORNER_R = 5; // rayon des angles
export const BOARD_H = 1.07;

export const GOAL_X = HL - 3.8; // ligne de but à 3,80 m du fond
export const GOAL_HW = 0.85; // cage de 1,70 m
export const GOAL_DEPTH = 1.09;
export const GOAL_H = 1.05;
export const POST_R = 0.04;

export const CREASE_HW = 1.225; // zone de but de 2,45 m x 1,20 m
export const CREASE_DEPTH = 1.2;

export const SPOT_R = 3; // cercles d'engagement
export const ZONE_X = GOAL_X - 6.1;
export const ZONE_Y = 6.7;

export const SPOTS = {
  C: { id: 'C', x: 0, y: 0 },
  WN: { id: 'WN', x: -ZONE_X, y: -ZONE_Y },
  WS: { id: 'WS', x: -ZONE_X, y: ZONE_Y },
  EN: { id: 'EN', x: ZONE_X, y: -ZONE_Y },
  ES: { id: 'ES', x: ZONE_X, y: ZONE_Y },
};

export const PLAYER_R = 0.45;
export const GOALIE_R = 0.5;
export const PUCK_R = 0.04;

// Bancs des équipes côté y négatif, table de marque et bancs des pénalités côté y positif.
export const BENCH_Y = -HW;
export const BOX_Y = HW;

/** Ramène un disque de rayon r dans la piste. Renvoie null ou {x, y, nx, ny} (normale vers l'extérieur). */
export function boardHit(x, y, r) {
  const ix = HL - CORNER_R;
  const iy = HW - CORNER_R;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  if (ax > ix && ay > iy) {
    const cx = Math.sign(x) * ix;
    const cy = Math.sign(y) * iy;
    const dx = x - cx;
    const dy = y - cy;
    const d = Math.hypot(dx, dy);
    const lim = CORNER_R - r;
    if (d > lim) {
      const nx = dx / d;
      const ny = dy / d;
      return { x: cx + nx * lim, y: cy + ny * lim, nx, ny };
    }
    return null;
  }
  if (ax > HL - r) return { x: Math.sign(x) * (HL - r), y, nx: Math.sign(x), ny: 0 };
  if (ay > HW - r) return { x, y: Math.sign(y) * (HW - r), nx: 0, ny: Math.sign(y) };
  return null;
}

/** Distance à la balustrade la plus proche et normale sortante en ce point. */
export function boardInfo(x, y) {
  const ix = HL - CORNER_R;
  const iy = HW - CORNER_R;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  if (ax > ix && ay > iy) {
    const dx = x - Math.sign(x) * ix;
    const dy = y - Math.sign(y) * iy;
    const d = Math.hypot(dx, dy) || 1e-6;
    return { dist: CORNER_R - d, nx: dx / d, ny: dy / d };
  }
  const dxw = HL - ax;
  const dyw = HW - ay;
  if (dxw < dyw) return { dist: dxw, nx: Math.sign(x) || 1, ny: 0 };
  return { dist: dyw, nx: 0, ny: Math.sign(y) || 1 };
}

/** Vrai si le point est dans la zone de but du côté side (+1 à l'est, -1 à l'ouest). */
export function inCrease(x, y, side) {
  const ax = x * side;
  return ax <= GOAL_X && ax >= GOAL_X - CREASE_DEPTH && Math.abs(y) <= CREASE_HW;
}

/** Repousse un disque hors du volume d'une cage. Modifie p ({x, y, vx, vy}). */
export function pushOutOfGoal(p, r) {
  const s = Math.sign(p.x);
  if (!s) return false;
  const ax = p.x * s;
  const x0 = GOAL_X - r;
  const x1 = GOAL_X + GOAL_DEPTH + r;
  const yh = GOAL_HW + POST_R + r;
  const ay = Math.abs(p.y);
  if (ax <= x0 || ax >= x1 || ay >= yh) return false;
  const front = ax - x0;
  const back = x1 - ax;
  const side = yh - ay;
  if (front <= back && front <= side) {
    p.x = s * x0;
    if (p.vx * s > 0) p.vx = 0;
  } else if (back <= side) {
    p.x = s * x1;
    if (p.vx * s < 0) p.vx = 0;
  } else {
    const sy = Math.sign(p.y) || 1;
    p.y = sy * yh;
    if (p.vy * sy < 0) p.vy = 0;
  }
  return true;
}

/** Point d'engagement le plus proche d'une position, parmi une liste d'identifiants. */
export function nearestSpot(x, y, ids = Object.keys(SPOTS)) {
  let best = null;
  let bd = Infinity;
  for (const id of ids) {
    const s = SPOTS[id];
    const d = (s.x - x) ** 2 + (s.y - y) ** 2;
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return best;
}

/** Les deux points d'engagement de la zone de défense d'une équipe qui attaque vers dir. */
export function defenceSpots(dir) {
  return dir > 0 ? ['WN', 'WS'] : ['EN', 'ES'];
}
