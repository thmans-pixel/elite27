// La salle : piste, marquages réglementaires, balustrades, cages, bancs, tribune, tableau d'affichage.
// Repère : x du jeu = X, y du jeu = Z, hauteur = Y. La caméra est côté table de marque (Z positif).
import * as THREE from 'three';
import { HL, HW, CORNER_R, BOARD_H, GOAL_X, GOAL_HW, GOAL_DEPTH, GOAL_H, CREASE_HW, CREASE_DEPTH, SPOTS, SPOT_R } from '../sim/geometry.js';

const PX = 44; // pixels par mètre pour la texture de la piste

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function rinkTexture(court) {
  const c = document.createElement('canvas');
  c.width = HL * 2 * PX;
  c.height = HW * 2 * PX;
  const g = c.getContext('2d');
  const X = (x) => (x + HL) * PX;
  const Y = (y) => (y + HW) * PX;
  g.fillStyle = '#8f8674';
  g.fillRect(0, 0, c.width, c.height);
  roundedRect(g, 0, 0, c.width, c.height, CORNER_R * PX);
  g.fillStyle = court;
  g.fill();
  // Dalles de sol sportif : un léger quadrillage.
  g.save();
  g.clip();
  g.strokeStyle = 'rgba(255,255,255,0.09)';
  g.lineWidth = 1;
  for (let x = 0; x < c.width; x += PX / 2) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, c.height);
    g.stroke();
  }
  for (let y = 0; y < c.height; y += PX / 2) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(c.width, y);
    g.stroke();
  }
  // Marquages orange-rouge, comme à Denis Morin.
  const red = '#e2562c';
  g.strokeStyle = red;
  g.fillStyle = red;
  g.lineWidth = Math.max(3, 0.08 * PX);
  const line = (x1, y1, x2, y2) => {
    g.beginPath();
    g.moveTo(X(x1), Y(y1));
    g.lineTo(X(x2), Y(y2));
    g.stroke();
  };
  // Ligne médiane : large bande.
  g.lineWidth = 0.45 * PX;
  line(0, -HW, 0, HW);
  g.lineWidth = Math.max(3, 0.08 * PX);
  for (const s of [-1, 1]) {
    line(s * GOAL_X, -HW, s * GOAL_X, HW);
    g.fillStyle = red; // zone de but pleine
    const cx = s > 0 ? GOAL_X - CREASE_DEPTH : -GOAL_X;
    g.fillRect(X(cx), Y(-CREASE_HW), CREASE_DEPTH * PX, CREASE_HW * 2 * PX);
    g.strokeRect(X(cx), Y(-CREASE_HW), CREASE_DEPTH * PX, CREASE_HW * 2 * PX);
  }
  g.fillStyle = red;
  for (const s of Object.values(SPOTS)) {
    g.beginPath();
    g.arc(X(s.x), Y(s.y), SPOT_R * PX, 0, Math.PI * 2);
    g.stroke();
    // Point d'engagement : un carré plein.
    g.fillRect(X(s.x - 0.3), Y(s.y - 0.2), 0.6 * PX, 0.4 * PX);
  }
  // Zone des arbitres : demi-cercle devant la table de marque.
  g.beginPath();
  g.arc(X(0), Y(HW), 3 * PX, Math.PI, Math.PI * 2);
  g.stroke();
  g.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Contour de la piste, dans le sens trigonométrique, avec la normale sortante en chaque point. */
function perimeter(arcSteps = 14) {
  const ix = HL - CORNER_R;
  const iy = HW - CORNER_R;
  const pts = [];
  const arc = (cx, cy, a0) => {
    for (let i = 0; i <= arcSteps; i++) {
      const a = a0 + (i / arcSteps) * (Math.PI / 2);
      pts.push({ x: cx + Math.cos(a) * CORNER_R, y: cy + Math.sin(a) * CORNER_R, nx: Math.cos(a), ny: Math.sin(a) });
    }
  };
  arc(ix, -iy, -Math.PI / 2);
  arc(ix, iy, 0);
  arc(-ix, iy, Math.PI / 2);
  arc(-ix, -iy, Math.PI);
  return pts;
}

/** Mur vertical le long d'une suite de points, de h0 à h1, épais de th vers l'extérieur. */
function wallGeometry(segs, h0, h1, th) {
  const pos = [];
  const quad = (a, b, c, d) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (const [p, q] of segs) {
    const pi = [p.x, 0, p.y];
    const qi = [q.x, 0, q.y];
    const po = [p.x + p.nx * th, 0, p.y + p.ny * th];
    const qo = [q.x + q.nx * th, 0, q.y + q.ny * th];
    const at = (v, h) => [v[0], h, v[2]];
    quad(at(pi, h0), at(qi, h0), at(qi, h1), at(pi, h1)); // face intérieure
    quad(at(qo, h0), at(po, h0), at(po, h1), at(qo, h1)); // face extérieure
    quad(at(pi, h1), at(qi, h1), at(qo, h1), at(po, h1)); // dessus
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

function textTexture(lines, opts = {}) {
  const c = document.createElement('canvas');
  c.width = opts.w ?? 1024;
  c.height = opts.h ?? 128;
  const g = c.getContext('2d');
  if (opts.bg) {
    g.fillStyle = opts.bg;
    g.fillRect(0, 0, c.width, c.height);
  }
  g.fillStyle = opts.color ?? '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  lines.forEach((t, i) => {
    g.font = `${opts.weight ?? 700} ${opts.size ?? 80}px system-ui, "Segoe UI", Arial, sans-serif`;
    g.fillText(t, c.width / 2, (c.height * (i + 0.5)) / lines.length);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildGoal(side) {
  const grp = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: 0xe0301e, roughness: 0.4, metalness: 0.3 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 });
  const r = 0.04;
  const post = new THREE.CylinderGeometry(r, r, GOAL_H, 12);
  for (const z of [-GOAL_HW, GOAL_HW]) {
    const m = new THREE.Mesh(post, red);
    m.position.set(0, GOAL_H / 2, z);
    m.castShadow = true;
    grp.add(m);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(r, r, GOAL_HW * 2 + r * 2, 12), red);
  bar.rotation.x = Math.PI / 2;
  bar.position.set(0, GOAL_H, 0);
  bar.castShadow = true;
  grp.add(bar);
  // Armature arrière, simplifiée.
  const baseGeo = new THREE.TorusGeometry(GOAL_HW, 0.025, 8, 24, Math.PI);
  baseGeo.rotateX(Math.PI / 2);
  baseGeo.rotateY(Math.PI / 2);
  const base = new THREE.Mesh(baseGeo, white);
  base.scale.set(GOAL_DEPTH / GOAL_HW, 1, 1);
  base.position.set(0, 0.03, 0);
  grp.add(base);
  // Filet.
  const nc = document.createElement('canvas');
  nc.width = nc.height = 64;
  const g = nc.getContext('2d');
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 3;
  g.strokeRect(0, 0, 64, 64);
  const ntex = new THREE.CanvasTexture(nc);
  ntex.wrapS = ntex.wrapT = THREE.RepeatWrapping;
  ntex.repeat.set(14, 9);
  const net = new THREE.MeshBasicMaterial({ map: ntex, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
  const shape = new THREE.Shape();
  shape.moveTo(0, -GOAL_HW);
  shape.lineTo(0, GOAL_HW);
  shape.absellipse(0, 0, GOAL_DEPTH, GOAL_HW, Math.PI / 2, -Math.PI / 2, true);
  const top = new THREE.Mesh(new THREE.ShapeGeometry(shape, 16), net);
  top.rotation.x = Math.PI / 2;
  top.position.y = GOAL_H;
  grp.add(top);
  const back = new THREE.Mesh(new THREE.CylinderGeometry(GOAL_HW, GOAL_HW, GOAL_H, 24, 1, true, 0, Math.PI), net);
  back.scale.set(GOAL_DEPTH / GOAL_HW, 1, 1);
  back.position.y = GOAL_H / 2;
  grp.add(back);
  grp.position.set(side * GOAL_X, 0, 0);
  if (side < 0) grp.rotation.y = Math.PI;
  return grp;
}

/**
 * Construit la salle dans la scène. Renvoie { setScore(texte), dispose }.
 * opts : { salle (nom du gymnase), court (couleur du sol) }
 */
export function buildArena(scene, opts = {}) {
  const court = opts.court ?? '#8fbfe0';

  // Sol du gymnase et piste.
  const gym = new THREE.Mesh(new THREE.PlaneGeometry(90, 60), new THREE.MeshStandardMaterial({ color: 0x8f8674, roughness: 0.85 }));
  gym.rotation.x = -Math.PI / 2;
  gym.position.y = -0.12;
  gym.receiveShadow = true;
  scene.add(gym);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HL * 2, HW * 2), new THREE.MeshStandardMaterial({ map: rinkTexture(court), roughness: 0.32, metalness: 0.05 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Balustrades : plinthe et panneaux. Le côté caméra est translucide pour ne rien cacher.
  const pts = perimeter();
  const far = [];
  const near = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    if (Math.hypot(p.x - q.x, p.y - q.y) < 1e-6) continue;
    ((p.y + q.y) / 2 > HW - CORNER_R * 0.75 ? near : far).push([p, q]);
  }
  const boardMat = new THREE.MeshStandardMaterial({ color: 0xf4f5f7, roughness: 0.45 });
  const kickMat = new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.5 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, transparent: true, opacity: 0.22, depthWrite: false });
  const add = (geo, mat, shadow) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow;
    m.receiveShadow = true;
    scene.add(m);
  };
  add(wallGeometry(far, 0, 0.2, 0.1), kickMat, false);
  add(wallGeometry(far, 0.2, BOARD_H, 0.1), boardMat, true);
  add(wallGeometry(near, 0, 0.2, 0.1), kickMat, false);
  add(wallGeometry(near, 0.2, BOARD_H, 0.1), glassMat, false);
  // Protections supérieures derrière les cages (2.2.3.6).
  const netMat = new THREE.MeshStandardMaterial({ color: 0xdfe8f0, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide });
  const ends = far.filter(([p, q]) => Math.abs((p.x + q.x) / 2) > HL - CORNER_R - 0.5);
  add(wallGeometry(ends, BOARD_H, BOARD_H + 1.8, 0.02), netMat, false);

  scene.add(buildGoal(1), buildGoal(-1));

  // Bancs des équipes (côté opposé à la caméra) et tribune.
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x30343b, roughness: 0.7 });
  for (const s of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(9, 0.45, 0.5), benchMat);
    b.position.set(s * 7.5, 0.22, -HW - 1.9);
    b.castShadow = true;
    scene.add(b);
  }
  const standMat = new THREE.MeshStandardMaterial({ color: 0x55606e, roughness: 0.8 });
  for (let i = 0; i < 6; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(46, 0.55, 1.1), standMat);
    step.position.set(0, 0.9 + i * 0.55, -HW - 4 - i * 1.1);
    step.receiveShadow = true;
    scene.add(step);
  }
  // Table de marque et bancs des pénalités, côté caméra.
  const table = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.8, 0.7), new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.6 }));
  table.position.set(0, 0.4, HW + 1.1);
  scene.add(table);
  for (const s of [-1, 1]) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.45, 0.5), benchMat);
    box.position.set(s * 3.4, 0.22, HW + 1.3);
    scene.add(box);
  }

  // Murs, plafond, luminaires.
  const hall = new THREE.Mesh(new THREE.BoxGeometry(84, 14, 56), new THREE.MeshStandardMaterial({ color: 0xc9a66b, roughness: 0.9, side: THREE.BackSide }) /* bardage bois */);
  hall.position.y = 6.7; // le sol de la boîte passe sous la piste
  scene.add(hall);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (let ix = -3; ix <= 3; ix++) {
    for (const z of [-7, 0, 7]) {
      const lamp = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.7), lampMat);
      lamp.rotation.x = Math.PI / 2;
      lamp.position.set(ix * 9, 13.9, z);
      scene.add(lamp);
    }
  }

  // Nom du gymnase et tableau d'affichage sur le mur du fond.
  const name = new THREE.Mesh(
    new THREE.PlaneGeometry(26, 2.2),
    new THREE.MeshBasicMaterial({ map: textTexture([(opts.salle ?? '').toUpperCase()], { w: 2048, h: 172, size: 120, color: '#1c2a3a' }), transparent: true }),
  );
  name.position.set(-12, 9.6, -27.9);
  scene.add(name);

  // Le nom de la salle est aussi peint sur la balustrade du fond, bien visible à l'écran.
  for (const x of [-10.5, 10.5]) {
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 0.62),
      new THREE.MeshBasicMaterial({ map: textTexture([(opts.salle ?? '').toUpperCase()], { w: 1024, h: 64, size: 46, color: '#1c2a3a' }), transparent: true }),
    );
    sign.position.set(x, 0.64, -HW + 0.012);
    scene.add(sign);
  }

  const sc = document.createElement('canvas');
  sc.width = 1024;
  sc.height = 320;
  const sg = sc.getContext('2d');
  const stex = new THREE.CanvasTexture(sc);
  stex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(11, 3.4), new THREE.MeshBasicMaterial({ map: stex }));
  board.position.set(16, 9.4, -27.9);
  scene.add(board);
  let last = '';
  const setScore = (home, away, score, clock, period) => {
    const key = `${score[0]}-${score[1]}-${clock}-${period}`;
    if (key === last) return;
    last = key;
    sg.fillStyle = '#0b0d10';
    sg.fillRect(0, 0, 1024, 320);
    sg.textAlign = 'center';
    sg.textBaseline = 'middle';
    sg.fillStyle = '#ffb300';
    sg.font = '700 70px system-ui, Arial, sans-serif';
    sg.fillText(home, 200, 80);
    sg.fillText(away, 824, 80);
    sg.font = '700 170px system-ui, Arial, sans-serif';
    sg.fillStyle = '#ff3b30';
    sg.fillText(String(score[0]), 200, 215);
    sg.fillText(String(score[1]), 824, 215);
    sg.fillStyle = '#ffffff';
    sg.font = '700 110px system-ui, Arial, sans-serif';
    sg.fillText(clock, 512, 200);
    sg.font = '600 50px system-ui, Arial, sans-serif';
    sg.fillStyle = '#9aa4b1';
    sg.fillText(period, 512, 80);
    stex.needsUpdate = true;
  };

  return { setScore };
}
