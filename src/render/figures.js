// Joueurs stylisés et articulés : hanches, genoux, coudes, crosse tenue à deux mains.
// L'avant d'une figurine est +X, le haut +Y. Les membres sont posés à chaque image par cinématique inverse :
// on dit où vont les patins, les mains et la palette, les genoux et les coudes suivent.
import * as THREE from 'three';

const SKIN = 0xe2b596;
const V = () => new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (t) => t * t * (3 - 2 * t);

const THIGH = 0.46;
const SHIN = 0.46;
const ARM = 0.31;
const FOREARM = 0.3;
const HIP_Z = 0.12;
const ANKLE = 0.13;

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

/** Segment de membre : cylindre de hauteur 1 qu'on étire entre deux points avec place(). */
function bone(rStart, rEnd, material) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rEnd, rStart, 1, 10), material);
  m.castShadow = true;
  return m;
}
function ball(r, material) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), material);
  m.castShadow = true;
  return m;
}
const _d = V();
function place(mesh, a, b) {
  _d.subVectors(b, a);
  const len = _d.length() || 1e-4;
  mesh.position.copy(a).addScaledVector(_d, 0.5);
  mesh.scale.set(1, len, 1);
  mesh.quaternion.setFromUnitVectors(UP, _d.divideScalar(len));
}

const _bx = V();
const _by = V();
const _bz = V();
const _m = new THREE.Matrix4();
/** Comme place(), pour une pièce plate (jambière) : sa face avant regarde vers front. */
function placeFacing(mesh, a, b, front) {
  _by.subVectors(b, a);
  const len = _by.length() || 1e-4;
  mesh.position.copy(a).addScaledVector(_by, 0.5);
  _by.divideScalar(len);
  _bx.copy(front).addScaledVector(_by, -front.dot(_by));
  if (_bx.lengthSq() < 1e-6) _bx.set(0, 1, 0);
  _bx.normalize();
  _bz.crossVectors(_bx, _by);
  mesh.quaternion.setFromRotationMatrix(_m.makeBasis(_bx, _by, _bz));
  mesh.scale.set(1, len, 1);
}

const _dir = V();
const _perp = V();
/** Cinématique inverse à deux segments : place l'articulation (genou, coude) du côté indiqué par pole. */
function solve(a, target, l1, l2, pole, joint, end) {
  _dir.subVectors(target, a);
  const dist = _dir.length();
  if (dist < 1e-5) _dir.set(0, -1, 0);
  else _dir.divideScalar(dist);
  const d = clamp(dist, Math.abs(l1 - l2) + 1e-3, (l1 + l2) * 0.999);
  end.copy(a).addScaledVector(_dir, d);
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  _perp.copy(pole).addScaledVector(_dir, -pole.dot(_dir));
  if (_perp.lengthSq() < 1e-6) _perp.set(1, 0, 0);
  _perp.normalize();
  joint.copy(a).addScaledVector(_dir, x).addScaledVector(_perp, h);
}

/**
 * kit : { maillot, epaules, numero, casque, pantalon } ; opts : { num, goalie, referee }
 */
export function makeFigure(kit, opts = {}) {
  const root = new THREE.Group();
  const g = !!opts.goalie;
  const jersey = opts.referee ? new THREE.MeshStandardMaterial({ map: stripes(), roughness: 0.7 }) : mat(kit.maillot);
  const pants = mat(kit.pantalon, 0.75);
  const helmet = mat(kit.casque, 0.3);
  const dark = mat(0x1a1a1a, 0.5);
  const white = mat(0xf3f3f3, 0.5);
  const sock = opts.referee ? pants : mat(kit.maillot, 0.7);

  // Haut du corps : il pivote autour du bassin (buste penché du hockeyeur).
  const upper = new THREE.Group();
  root.add(upper);
  const hips = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), pants);
  hips.scale.set(0.9, 0.75, 1.15);
  hips.position.y = 0.02;
  hips.castShadow = true;
  upper.add(hips);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(g ? 0.27 : 0.22, 0.34, 6, 14), jersey);
  torso.position.y = 0.33;
  torso.scale.set(0.9, 1, 1.25);
  torso.castShadow = true;
  upper.add(torso);
  const shoulders = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.5, 4, 10), opts.referee ? jersey : mat(kit.epaules));
  shoulders.rotation.x = Math.PI / 2;
  shoulders.position.y = 0.58;
  shoulders.castShadow = true;
  upper.add(shoulders);
  // La tête reste relevée : elle regarde le jeu même buste penché.
  const headPivot = new THREE.Group();
  headPivot.position.set(0.02, 0.7, 0);
  upper.add(headPivot);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.125, 16, 12), mat(SKIN, 0.8));
  head.position.set(0, 0.13, 0);
  headPivot.add(head);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), helmet);
  cap.position.set(-0.02, 0.14, 0);
  cap.castShadow = true;
  headPivot.add(cap);
  if (g) {
    // Grille du masque de gardien.
    const cage = new THREE.Mesh(new THREE.SphereGeometry(0.155, 12, 8, -Math.PI / 2 + 0.3, Math.PI - 0.6, Math.PI * 0.3, Math.PI * 0.5), new THREE.MeshStandardMaterial({ color: 0xd0d0d0, wireframe: true }));
    cage.rotation.y = Math.PI / 2;
    cage.position.set(-0.02, 0.14, 0);
    headPivot.add(cage);
  } else if (!opts.referee) {
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.152, 12, 8, -Math.PI / 2 + 0.5, Math.PI - 1, Math.PI * 0.42, Math.PI * 0.3), new THREE.MeshStandardMaterial({ color: 0x9ec7e8, transparent: true, opacity: 0.55, roughness: 0.1 }));
    visor.rotation.y = Math.PI / 2;
    visor.position.set(-0.02, 0.14, 0);
    headPivot.add(visor);
  }
  // Numéro dans le dos et sur la poitrine.
  if (opts.num != null) {
    const tex = numberTexture(opts.num, kit.numero);
    for (const s of [-1, 1]) {
      const n = new THREE.Mesh(new THREE.PlaneGeometry(s < 0 ? 0.4 : 0.22, s < 0 ? 0.4 : 0.22), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      n.position.set(s * (g ? 0.26 : 0.215), s < 0 ? 0.36 : 0.44, s < 0 ? 0 : 0.1);
      n.rotation.y = (s * Math.PI) / 2;
      upper.add(n);
    }
  }

  // Jambes : cuisse, genou, tibia, patin en ligne. side = -1 (gauche) ou +1 (droite).
  const legs = [-1, 1].map((side) => {
    const L = { side, thigh: bone(0.105, 0.085, pants), shin: bone(0.075, 0.06, sock), knee: ball(0.085, g ? white : dark), skate: new THREE.Group(), pad: null, hip: V(), kneeP: V(), foot: V(), pole: V(), target: V() };
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.13, 0.1), dark);
    boot.position.set(0.04, -0.02, 0);
    boot.castShadow = true;
    L.skate.add(boot);
    for (let i = 0; i < 4; i++) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.03, 10), mat(0xe8e2c8, 0.4));
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(-0.075 + i * 0.075, -0.1, 0);
      L.skate.add(wheel);
    }
    if (g) {
      // Jambière : elle couvre le tibia et remonte au-dessus du genou.
      L.pad = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1, 0.29), white);
      L.pad.castShadow = true;
      root.add(L.pad);
    }
    root.add(L.thigh, L.shin, L.knee, L.skate);
    return L;
  });

  // Bras : épaule, coude, main gantée.
  const sleeve = opts.referee ? jersey : mat(kit.maillot);
  const arms = [-1, 1].map((side) => {
    const A = { side, upperArm: bone(0.075, 0.06, sleeve), fore: bone(0.06, 0.05, sleeve), elbow: ball(0.062, sleeve), hand: ball(0.07, dark), sh: V(), el: V(), ha: V(), pole: V(), target: V() };
    root.add(A.upperArm, A.fore, A.elbow, A.hand);
    return A;
  });
  let blocker = null;
  if (g) {
    arms[0].hand.geometry = new THREE.SphereGeometry(0.14, 10, 8); // mitaine
    arms[0].hand.material = white;
    blocker = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.36, 0.22), white); // bouclier
    blocker.castShadow = true;
    root.add(blocker);
  }

  // Crosse : un manche étiré entre la main du haut et le talon, une palette posée à plat.
  let stick = null;
  if (!opts.referee) {
    const shaftMat = mat(g ? 0xd8d8d8 : 0x2a2a2a, 0.4);
    const bladeMat = mat(g ? 0xd8d8d8 : 0xf0f0f0, 0.5);
    stick = { shaft: bone(0.02, 0.02, shaftMat), blade: new THREE.Mesh(new THREE.BoxGeometry(0.03, g ? 0.11 : 0.07, g ? 0.36 : 0.27), bladeMat), paddle: null, len: g ? 1.25 : 1.45, tip: V().set(0.62, 0.03, 0.3), top: V(), heel: V() };
    stick.blade.castShadow = true;
    root.add(stick.shaft, stick.blade);
    if (g) {
      stick.paddle = bone(0.045, 0.045, shaftMat);
      stick.paddle.scale.z = 0.4;
      root.add(stick.paddle);
    }
  }

  // Repère du joueur contrôlé par un humain.
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.52, 0.68, 32), new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  ring.visible = false;
  root.add(ring);

  root.userData = { upper, headPivot, legs, arms, stick, blocker, ring, goalie: g, referee: !!opts.referee, phase: Math.random() * 6, lean: 0.2, roll: 0, hipH: 0.84, down: 0, fall: 0, armUp: 0, first: true };
  return root;
}

const _pelvis = V();
const _t = V();
const _t2 = V();
const _want = V();
const _h = V();

/** Point exprimé dans le repère du buste → repère de la figurine. */
function fromUpper(u, x, y, z, out) {
  return out.set(x, y, z).applyMatrix4(u.upper.matrix);
}

/**
 * Anime une figurine. s : { x, y, face, vx, vy, dt, fallen, charge, down, armUp, ring,
 *   puck: {x, y} si elle porte le palet (position sur la piste),
 *   shot / pass : avancement du geste de 0 à 1, poke : { x, y, k } pointe de crosse visée et avancement }
 */
export function poseFigure(fig, s) {
  const u = fig.userData;
  const dt = s.dt;
  const k = (rate) => (u.first ? 1 : Math.min(1, dt * rate));
  const scale = fig.scale.x || 1;
  const speed = Math.hypot(s.vx, s.vy);
  const cf = Math.cos(s.face);
  const sf = Math.sin(s.face);
  fig.position.set(s.x, 0, s.y);
  fig.rotation.y = -s.face;
  const fwd = (s.vx * cf + s.vy * sf) / scale;
  const lat = (-s.vx * sf + s.vy * cf) / scale;
  const toLocal = (wx, wy, out) => out.set(((wx - s.x) * cf + (wy - s.y) * sf) / scale, 0, (-(wx - s.x) * sf + (wy - s.y) * cf) / scale);

  u.phase += speed * dt * 1.25;
  const stride = Math.min(1, speed / 5);
  const charge = s.charge ?? 0;
  u.fall += ((s.fallen ? 1 : 0) - u.fall) * k(9);
  u.down += ((s.down ? 1 : 0) - u.down) * k(s.down ? 16 : 7);
  const fall = u.fall;
  const down = u.down;

  // Bassin et buste.
  let hipH = u.goalie ? 0.74 : 0.86 - 0.07 * stride - 0.1 * charge;
  let lean = u.goalie ? 0.3 : u.referee ? 0.08 + speed * 0.02 : 0.24 + Math.min(0.26, speed * 0.035) + charge * 0.22;
  if (s.poke) lean += 0.3 * Math.sin(Math.PI * s.poke.k);
  if (s.shot != null) lean += 0.2 * Math.sin(Math.PI * s.shot);
  hipH = hipH + (0.47 - hipH) * down;
  lean = lean + (0.12 - lean) * down;
  hipH = hipH + (0.3 - hipH) * fall;
  lean = lean + (1.35 - lean) * fall;
  u.hipH += (hipH - u.hipH) * k(14);
  u.lean += (lean - u.lean) * k(10);
  u.roll += (clamp(lat * 0.07, -0.3, 0.3) - u.roll) * k(6);
  _pelvis.set(-0.1 * Math.sin(u.lean), u.hipH, 0);
  u.upper.position.copy(_pelvis);
  u.upper.rotation.set(u.roll, 0, -u.lean);
  u.upper.updateMatrix();
  u.headPivot.rotation.z = u.lean * 0.75 * (1 - fall);

  // Jambes : poussée latérale du patineur, papillon du gardien, chute.
  for (const L of u.legs) {
    const sgn = L.side;
    const ph = Math.sin(u.phase + (sgn > 0 ? Math.PI : 0));
    const push = Math.max(0, ph);
    const rec = Math.max(0, -ph);
    const wide = u.goalie ? 0.3 : 0.17;
    L.target.set(0.04 - 0.36 * stride * push + 0.14 * stride * rec, ANKLE + 0.05 * stride * rec, sgn * (wide + 0.2 * stride * push));
    L.pole.set(1, 0.1, sgn * 0.25);
    let yaw = -sgn * 0.5 * stride * push;
    if (down > 0.01) {
      // Papillon : genoux au sol serrés, patins écartés vers l'arrière, jambières à plat face au tir.
      L.target.lerp(_t.set(-0.16, ANKLE - 0.02, sgn * 0.66), down);
      L.pole.lerp(_t.set(1, -1.4, -sgn * 0.5), down);
      yaw += -sgn * 1.2 * down;
    }
    if (fall > 0.01) {
      L.target.lerp(_t.set(-0.8, ANKLE, sgn * 0.2), fall);
      L.pole.lerp(_t.set(0.3, -1, sgn * 0.2), fall);
    }
    L.hip.set(_pelvis.x, _pelvis.y, sgn * HIP_Z);
    solve(L.hip, L.target, THIGH, SHIN, L.pole, L.kneeP, L.foot);
    if (L.kneeP.y < 0.09) L.kneeP.y = 0.09;
    place(L.thigh, L.hip, L.kneeP);
    place(L.shin, L.kneeP, L.foot);
    L.knee.position.copy(L.kneeP);
    L.skate.position.copy(L.foot);
    L.skate.rotation.set(0, yaw, down > 0.5 ? sgn * 0 : 0);
    if (L.pad) {
      _t.subVectors(L.kneeP, L.foot).multiplyScalar(1.38).add(L.foot);
      _t2.copy(L.foot);
      _t2.y -= 0.06 * (1 - down);
      placeFacing(L.pad, _t2, _t, _h.set(1, 0.15 * down, 0));
      L.pad.position.x += 0.07;
    }
  }

  // Crosse : où va la palette ?
  const st = u.stick;
  const [armL, armR] = u.arms;
  fromUpper(u, 0.02, 0.56, -0.27, armL.sh);
  fromUpper(u, 0.02, 0.56, 0.27, armR.sh);
  let oneHand = false;
  if (st) {
    if (u.goalie) {
      _want.set(0.5 - 0.1 * down, 0.03, 0.12);
      if (s.puck) toLocal(s.puck.x, s.puck.y, _want).multiplyScalar(0.9).setY(0.03);
    } else {
      _want.set(0.6, 0.03, 0.32 + Math.sin(u.phase * 0.5) * 0.05 * stride);
      if (s.puck) {
        // Le palet est sur la palette : elle se place juste derrière lui.
        toLocal(s.puck.x, s.puck.y, _want);
        const l = _want.length() || 1;
        _want.multiplyScalar((l - 0.06) / l).setY(0.03);
      }
      if (charge > 0) _want.lerp(_t.set(-0.45, 0.8, 0.55), ease(Math.min(1, charge)) * 0.95); // armé du tir
      if (s.shot != null) {
        // Tir : la palette revient frapper le palet puis accompagne vers la cible.
        const a = s.shot;
        if (a < 0.3) _want.lerp(_t.set(0.74, 0.03, 0), ease(a / 0.3));
        else _want.set(0.74, 0.03, 0).lerp(_t.set(1.25, 0.55, -0.2), ease(Math.min(1, (a - 0.3) / 0.4)));
      } else if (s.pass != null) {
        _want.set(0.74, 0.03, 0).lerp(_t.set(1.12, 0.1, 0), Math.sin(Math.PI * Math.min(1, s.pass * 1.3)));
      }
      if (s.poke) {
        // Harponnage : la palette part vers la palette adverse, tenue d'une seule main.
        toLocal(s.poke.x, s.poke.y, _t);
        const l = _t.length() || 1;
        _t.multiplyScalar(Math.min(l, 1.62) / l).setY(0.04);
        _want.lerp(_t, Math.sin(Math.PI * Math.min(1, s.poke.k * 1.15)));
        oneHand = true;
      }
      if (fall > 0.3) _want.set(0.7, 0.03, 0.5);
    }
    st.tip.lerp(_want, s.shot != null || s.poke ? k(40) : k(18));

    // La main du haut se place pour que le manche, de longueur fixe, arrive à la palette.
    const top = u.goalie ? armR : armL;
    if (u.goalie) fromUpper(u, 0.26, 0.14, 0.3, _t);
    else if (oneHand) _t.copy(top.sh).lerp(st.tip, 0.3).setY(top.sh.y - 0.22);
    else fromUpper(u, 0.2 + charge * 0.05, 0.2, -0.14, _t);
    _h.subVectors(_t, st.tip).normalize();
    st.top.copy(st.tip).addScaledVector(_h, st.len);
    // Elle ne peut pas s'éloigner de l'épaule de plus que la longueur du bras.
    _t.subVectors(st.top, top.sh);
    const reach = (ARM + FOREARM) * 0.97;
    if (_t.length() > reach) st.top.copy(top.sh).addScaledVector(_t.normalize(), reach);
    _h.subVectors(st.tip, st.top).normalize();
    st.heel.copy(st.top).addScaledVector(_h, st.len);
    if (st.heel.y < 0.03) st.heel.y = 0.03;
    place(st.shaft, st.top, st.heel);
    // Palette à plat, perpendiculaire au manche vu de dessus, le talon au bout du manche.
    const hl = Math.hypot(_h.x, _h.z) || 1;
    const px = -_h.z / hl;
    const pz = _h.x / hl;
    const sideSign = u.goalie ? -1 : -1;
    st.blade.position.set(st.heel.x + px * 0.11 * sideSign, st.heel.y + 0.02, st.heel.z + pz * 0.11 * sideSign);
    st.blade.rotation.set(0, Math.atan2(px, pz), 0);
    if (st.paddle) {
      _t.copy(st.heel).addScaledVector(_h, -0.55);
      place(st.paddle, _t, st.heel);
    }
    top.target.copy(st.top);
    const low = u.goalie ? armL : armR;
    if (u.goalie) fromUpper(u, 0.34, 0.3 + 0.12 * down, -0.42, low.target); // mitaine ouverte
    else if (oneHand) fromUpper(u, 0.12, 0.05, 0.34, low.target);
    else low.target.copy(st.top).addScaledVector(_h, 0.46 - charge * 0.1);
  } else {
    // Arbitre : bras le long du corps, bras levé pour signaler (avantage, coup de sifflet).
    u.armUp += ((s.armUp ? 1 : 0) - u.armUp) * k(8);
    fromUpper(u, 0.08, 0.02, -0.3, armL.target);
    fromUpper(u, 0.08, 0.02, 0.3, armR.target).lerp(fromUpper(u, 0.1, 1.2, 0.32, _t), u.armUp);
  }
  for (const A of u.arms) {
    A.pole.set(-0.5, -1, A.side * 0.8);
    if (!st && A.side > 0 && u.armUp > 0.5) A.pole.set(-0.2, 0.2, 1);
    solve(A.sh, A.target, ARM, FOREARM, A.pole, A.el, A.ha);
    place(A.upperArm, A.sh, A.el);
    place(A.fore, A.el, A.ha);
    A.elbow.position.copy(A.el);
    A.hand.position.copy(A.ha);
  }
  if (u.blocker) {
    u.blocker.position.copy(armR.ha);
    u.blocker.position.x += 0.07;
  }

  u.ring.visible = !!s.ring;
  if (s.ring) u.ring.material.color.set(s.ring);
  u.first = false;
}
