// Joueurs stylisés : figurines avec casque, maillot du club, numéro et crosse. L'avant d'une figurine est +X.
import * as THREE from 'three';

const SKIN = 0xe2b596;

function numberTexture(num, color) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.font = '800 96px system-ui, "Segoe UI", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(num), 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function stripes() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 8;
  const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? '#111111' : '#f5f5f5';
    g.fillRect(i * 8, 0, 8, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const mat = (color, rough = 0.6) => new THREE.MeshStandardMaterial({ color, roughness: rough });

function limb(a, b, r, material) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const d = vb.clone().sub(va);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 8), material);
  m.position.copy(va).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  m.castShadow = true;
  return m;
}

/**
 * kit : { maillot, epaules, numero, casque, pantalon } ; opts : { num, goalie, referee }
 * Renvoie un groupe avec userData { body, stick, legL, legR, armR, ring }.
 */
export function makeFigure(kit, opts = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const jersey = opts.referee ? new THREE.MeshStandardMaterial({ map: stripes(), roughness: 0.7 }) : mat(kit.maillot);
  const pants = mat(kit.pantalon, 0.75);
  const helmet = mat(kit.casque, 0.3);
  const dark = mat(0x1a1a1a, 0.5);
  const g = opts.goalie;

  // Patins et jambes.
  const legs = [];
  for (const z of [-0.13, 0.13]) {
    const leg = new THREE.Group();
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.085, 0.72, 10), pants);
    thigh.position.y = 0.5;
    thigh.castShadow = true;
    leg.add(thigh);
    const skate = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.1), dark);
    skate.position.set(0.04, 0.08, 0);
    skate.castShadow = true;
    leg.add(skate);
    if (g) {
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.72, 0.26), mat(0xf3f3f3, 0.5));
      pad.position.set(0.1, 0.42, 0);
      pad.castShadow = true;
      leg.add(pad);
    }
    leg.position.z = z * (g ? 1.5 : 1);
    body.add(leg);
    legs.push(leg);
  }

  // Tronc, épaules, tête, casque.
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(g ? 0.27 : 0.22, 0.42, 6, 14), jersey);
  torso.position.y = 1.16;
  torso.scale.set(0.9, 1, 1.25);
  torso.castShadow = true;
  body.add(torso);
  const shoulders = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.5, 4, 10), opts.referee ? jersey : mat(kit.epaules));
  shoulders.rotation.x = Math.PI / 2;
  shoulders.position.y = 1.44;
  shoulders.castShadow = true;
  body.add(shoulders);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.125, 16, 12), mat(SKIN, 0.8));
  head.position.set(0.02, 1.7, 0);
  body.add(head);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), helmet);
  cap.position.set(0, 1.71, 0);
  cap.castShadow = true;
  body.add(cap);
  if (!opts.referee) {
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.152, 12, 8, -Math.PI / 2 + 0.5, Math.PI - 1, Math.PI * 0.42, Math.PI * 0.3), new THREE.MeshStandardMaterial({ color: 0x9ec7e8, transparent: true, opacity: 0.55, roughness: 0.1 }));
    visor.rotation.y = Math.PI / 2;
    visor.position.set(0, 1.71, 0);
    body.add(visor);
  }

  // Numéro dans le dos et sur la poitrine.
  if (opts.num != null) {
    const tex = numberTexture(opts.num, kit.numero);
    for (const s of [-1, 1]) {
      const n = new THREE.Mesh(new THREE.PlaneGeometry(s < 0 ? 0.4 : 0.22, s < 0 ? 0.4 : 0.22), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      n.position.set(s * (g ? 0.26 : 0.215), s < 0 ? 1.2 : 1.3, s < 0 ? 0 : 0.1);
      n.rotation.y = (s * Math.PI) / 2;
      body.add(n);
    }
  }

  // Bras : le gauche tient le haut de la crosse, le droit descend sur le manche.
  const sleeve = opts.referee ? jersey : mat(kit.maillot);
  const armL = limb([0, 1.42, -0.3], [0.2, 1.08, -0.1], 0.065, sleeve);
  body.add(armL);
  const armR = new THREE.Group();
  armR.position.set(0, 1.42, 0.3);
  const armRMesh = limb([0, 0, 0], [0.3, -0.42, -0.14], 0.065, sleeve);
  armR.add(armRMesh);
  const glove = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8), dark);
  glove.position.set(0.3, -0.42, -0.14);
  armR.add(glove);
  body.add(armR);

  // Crosse : elle pivote autour des mains pour les tirs, passes et vols de palet.
  let stick = null;
  if (!opts.referee) {
    stick = new THREE.Group();
    stick.position.set(0.2, 1.05, 0.02);
    const shaftMat = mat(g ? 0xd8d8d8 : 0x2a2a2a, 0.4);
    stick.add(limb([0, 0, 0], [0.66, -1.0, 0.1], 0.02, shaftMat));
    const blade = new THREE.Mesh(new THREE.BoxGeometry(g ? 0.1 : 0.07, g ? 0.12 : 0.075, g ? 0.36 : 0.28), shaftMat);
    blade.position.set(0.67, -1.0, 0.02);
    blade.castShadow = true;
    stick.add(blade);
    body.add(stick);
  }
  if (g) {
    const blocker = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.2), mat(0xf3f3f3, 0.5));
    blocker.position.set(0.33, 1.0, 0.34);
    body.add(blocker);
    const catcher = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), mat(0xf3f3f3, 0.5));
    catcher.position.set(0.25, 1.05, -0.4);
    body.add(catcher);
  }

  // Repère du joueur contrôlé par un humain.
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.52, 0.68, 32), new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  ring.visible = false;
  root.add(ring);

  root.userData = { body, stick, legL: legs[0], legR: legs[1], armR, ring, phase: Math.random() * 6, lean: 0, swing: 0 };
  return root;
}

/** Anime une figurine : glisse, appuis, penché dans les virages, chute, geste de crosse. */
export function poseFigure(fig, s) {
  const u = fig.userData;
  const speed = Math.hypot(s.vx, s.vy);
  fig.position.set(s.x, 0, s.y);
  fig.rotation.y = -s.face;
  u.phase += speed * s.dt * 1.5;
  const stride = Math.min(1, speed / 5);
  u.legL.rotation.z = Math.sin(u.phase) * 0.45 * stride;
  u.legR.rotation.z = -Math.sin(u.phase) * 0.45 * stride;
  u.legL.position.x = Math.sin(u.phase) * 0.08 * stride;
  u.legR.position.x = -Math.sin(u.phase) * 0.08 * stride;
  const targetLean = s.fallen ? 1.45 : Math.min(0.38, speed * 0.04) + (s.crouch ?? 0);
  u.lean += (targetLean - u.lean) * Math.min(1, s.dt * (s.fallen ? 9 : 6));
  u.body.rotation.z = -u.lean;
  u.body.position.y = s.fallen ? 0.12 : 0;
  // Penché latéral : vitesse perpendiculaire à l'orientation.
  const lat = -s.vx * Math.sin(s.face) + s.vy * Math.cos(s.face);
  u.body.rotation.x += (Math.max(-0.3, Math.min(0.3, lat * 0.06)) - u.body.rotation.x) * Math.min(1, s.dt * 6);
  if (u.stick) {
    u.swing += ((s.swing ?? 0) - u.swing) * Math.min(1, s.dt * 22);
    u.stick.rotation.y = u.swing;
    u.stick.rotation.z = -Math.abs(u.swing) * 0.5;
  }
  if (s.armUp != null) u.armR.rotation.z += ((s.armUp ? 2.5 : 0) - u.armR.rotation.z) * Math.min(1, s.dt * 8);
  u.ring.visible = !!s.ring;
  if (s.ring) u.ring.material.color.set(s.ring);
}
