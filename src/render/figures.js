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
const ARM = 0.34;
const FOREARM = 0.32;
// Où la palette repose, devant et sur le côté du joueur (même point que le palet porté dans la logique).
const REST = [0.83, 0.03, 0.35];
const HIP_Z = 0.12;
const ANKLE = 0.13;
// Proportions d'une figurine stylisée. Un modèle 3D apporte les siennes (voir model.js) : la pose est calculée
// avec les longueurs du corps qu'elle anime, pour que les membres ne s'étirent pas.
const DIMS = { thigh: THIGH, shin: SHIN, arm: ARM, fore: FOREARM, hipZ: HIP_Z, ankle: ANKLE, k: 1, shX: 0.02, shY: 0.56, shZ: 0.27, neckY: 0.7, grip: 0.32 };

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
 * kit : { maillot, epaules, numero, casque, casqueGardien (facultatif), pantalon } ; opts : { num, goalie, referee }
 */
export function makeFigure(kit, opts = {}) {
  const root = new THREE.Group();
  const g = !!opts.goalie;
  // Modèle 3D : il remplace le corps stylisé des patineurs ; la crosse, le numéro et les repères restent.
  // Le gardien garde ses jambières blanches : seuls son maillot et ses épaules prennent les couleurs.
  const model = opts.model ? opts.model.instantiate(opts.referee ? null : kit, g ? ['bas'] : []) : null;
  const body = [];
  const jersey = opts.referee ? new THREE.MeshStandardMaterial({ map: stripes(), roughness: 0.7 }) : mat(kit.maillot);
  const pants = mat(kit.pantalon, 0.75);
  const helmet = mat(g && kit.casqueGardien ? kit.casqueGardien : kit.casque, 0.3);
  const dark = mat(0x1a1a1a, 0.5);
  const white = mat(0xf3f3f3, 0.5);
  const sock = opts.referee ? pants : mat(kit.maillot, 0.7);

  // Haut du corps : il pivote autour du bassin (buste penché du hockeyeur).
  const upper = new THREE.Group();
  root.add(upper);
  const headPivot = new THREE.Group();
  headPivot.position.set(0.02, 0.7, 0);
  const hips = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), pants);
  hips.scale.set(0.9, 0.75, 1.15);
  hips.position.y = 0.02;
  hips.castShadow = true;
  upper.add(hips);
  body.push(hips);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(g ? 0.27 : 0.22, 0.34, 6, 14), jersey);
  torso.position.y = 0.33;
  torso.scale.set(0.9, 1, 1.25);
  torso.castShadow = true;
  upper.add(torso);
  body.push(torso);
  const shoulders = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.5, 4, 10), opts.referee ? jersey : mat(kit.epaules));
  shoulders.rotation.x = Math.PI / 2;
  shoulders.position.y = 0.58;
  shoulders.castShadow = true;
  upper.add(shoulders);
  body.push(shoulders, headPivot);
  // La tête reste relevée : elle regarde le jeu même buste penché.
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
      if (model) {
        n.scale.setScalar(0.8);
        n.position.set(s < 0 ? -model.backX : model.chestX, s < 0 ? model.numY : model.numY + 0.06, s < 0 ? 0 : 0.07);
      }
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
      body.push(L.pad);
    }
    root.add(L.thigh, L.shin, L.knee, L.skate);
    body.push(L.thigh, L.shin, L.knee, L.skate);
    return L;
  });

  // Bras : épaule, coude, main gantée.
  const sleeve = opts.referee ? jersey : mat(kit.maillot);
  const arms = [-1, 1].map((side) => {
    const A = { side, upperArm: bone(0.075, 0.06, sleeve), fore: bone(0.06, 0.05, sleeve), elbow: ball(0.062, sleeve), hand: ball(0.07, dark), sh: V(), el: V(), ha: V(), pole: V(), target: V() };
    root.add(A.upperArm, A.fore, A.elbow, A.hand);
    body.push(A.upperArm, A.fore, A.elbow, A.hand);
    return A;
  });
  let blocker = null;
  if (g) {
    arms[0].hand.geometry = new THREE.SphereGeometry(0.14, 10, 8); // mitaine
    arms[0].hand.material = white;
    blocker = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.36, 0.22), white); // bouclier
    blocker.castShadow = true;
    root.add(blocker);
    body.push(blocker);
  }

  // Crosse : un manche étiré entre la main du haut et le talon, une palette posée à plat.
  let stick = null;
  if (!opts.referee) {
    const shaftMat = mat(g ? 0xd8d8d8 : 0x2a2a2a, 0.4);
    const bladeMat = mat(g ? 0xd8d8d8 : 0xf0f0f0, 0.5);
    stick = { shaft: bone(0.02, 0.02, shaftMat), blade: new THREE.Mesh(new THREE.BoxGeometry(0.03, g ? 0.11 : 0.07, g ? 0.36 : 0.27), bladeMat), paddle: null, len: g ? 1.2 : 1.3, tip: V().set(...REST), top: V(), heel: V() };
    stick.blade.castShadow = true;
    root.add(stick.shaft, stick.blade);
    if (opts.stickModel) {
      // Crosse en modèle 3D : elle remplace le manche et la palette simplifiés.
      stick.model = opts.stickModel;
      stick.mesh = opts.stickModel.instantiate();
      // Le gardien tient sa crosse en haut de la partie large, à mi-manche : le manche dépasse au-dessus de la main.
      stick.full = g ? 1.35 : stick.len;
      if (g) stick.len = 0.66;
      stick.shaft.visible = stick.blade.visible = false;
      root.add(stick.mesh);
    }
    if (g) {
      stick.paddle = bone(0.045, 0.045, shaftMat);
      stick.paddle.scale.z = 0.4;
      root.add(stick.paddle);
      if (stick.mesh) stick.paddle.visible = false;
    }
  }

  // Repère du joueur contrôlé par un humain.
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.52, 0.68, 32), new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  ring.visible = false;
  root.add(ring);
  // Flèche au-dessus de la tête : on repère son joueur même quand il est caché derrière un autre.
  const marker = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 4), new THREE.MeshBasicMaterial({ color: 0xffe14d }));
  marker.rotation.x = Math.PI;
  marker.position.y = 2.15;
  marker.visible = false;
  root.add(marker);

  if (model) {
    marker.position.y = 2.0; // le modèle 3D est un peu moins grand que la figurine
    for (const m of body) m.visible = false;
    root.add(model.mesh, ...model.bones);
  }
  root.userData = { dims: model ? model.dims : DIMS, model, upper, headPivot, legs, arms, stick, blocker, ring, marker, goalie: g, referee: !!opts.referee, phase: Math.random() * 6, lean: 0.2, roll: 0, skid: 0, kneel: 0, twist: 0, hipH: 0.84, down: 0, fall: 0, armUp: 0, first: true };
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
 *   shot / pass : avancement du geste de 0 à 1, poke : { x, y, k } pointe de crosse visée et avancement,
 *   turn (rad/s, virage en cours), skid, back, check, kneel (booléens), dodge (-1, 0, 1 : côté du pas d'esquive),
 *   puckZ : hauteur du palet porté (Michigan), sit : assis (banc des pénalités) }
 */
export function poseFigure(fig, s) {
  const u = fig.userData;
  const D = u.dims;
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
  const stride = Math.min(1, speed / 5) * (u.referee ? 0.45 : 1); // l'arbitre patine sans forcer
  const charge = s.charge ?? 0;
  u.fall += ((s.fallen ? 1 : 0) - u.fall) * k(9);
  u.down += ((s.down ? 1 : 0) - u.down) * k(s.down ? 16 : 7);
  const fall = u.fall;
  u.kneel += ((s.kneel ? 1 : 0) - u.kneel) * k(14);
  const kneel = u.kneel;
  const down = u.down;

  // Bassin et buste.
  const skid = s.skid ? 1 : 0;
  u.skid += (skid - u.skid) * k(14);
  const lowered = Math.max(u.skid * 0.12, s.check ? 0.08 : 0);
  let hipH = u.goalie ? 0.7 : 0.95 - 0.06 * stride - 0.1 * charge - lowered;
  let lean = u.goalie ? 0.42 : u.referee ? 0.08 + speed * 0.02 : 0.34 + Math.min(0.2, speed * 0.03) + charge * 0.22;
  if (s.poke) lean += 0.45 * Math.sin(Math.PI * s.poke.k);
  if (s.check) lean += 0.35; // charge : épaule en avant
  if (s.back) lean -= 0.12;
  lean -= 0.22 * u.skid; // dérapage : le corps se retient en arrière
  if (s.shot != null) lean += 0.38 * Math.sin(Math.PI * Math.min(1, s.shot * 1.2));
  hipH = hipH + (0.5 - hipH) * down;
  lean = lean + (0.1 - lean) * down;
  // Position de défense : un genou au sol, buste penché sur la crosse.
  hipH = hipH + (0.5 - hipH) * kneel;
  lean = lean + (0.85 - lean) * kneel;
  if (s.sit) {
    // Assis sur le banc des pénalités.
    hipH = 0.5;
    lean = 0.2;
  }
  hipH = hipH + (0.3 - hipH) * fall;
  lean = lean + (1.35 - lean) * fall;
  u.hipH += (hipH * D.k - u.hipH) * k(14);
  u.lean += (lean - u.lean) * k(10);
  // Virage en carre : le corps se couche vers l'intérieur de l'arc, d'autant plus que le virage est serré et rapide.
  // Le joueur s'incline d'un bloc, des patins à la tête : le bassin se décale de ce qu'il faut pour que les
  // jambes aient la même inclinaison que le buste, qui n'en rajoute qu'un peu.
  const carve = clamp((s.turn ?? 0) * (speed / scale) * 0.018, -0.36, 0.36);
  const rollTarget = s.back ? 0 : clamp(lat * 0.05, -0.2, 0.2) * (1 - u.skid) + carve + (s.dodge ?? 0) * 0.35;
  u.roll += (clamp(rollTarget, -0.45, 0.45) - u.roll) * k(8);
  _pelvis.set(-0.1 * Math.sin(u.lean) - 0.1 * u.skid, u.hipH * Math.cos(u.roll), u.hipH * Math.sin(u.roll));
  u.upper.position.copy(_pelvis);
  // Le buste tourne vers la crosse à l'armé, puis se déroule vers la cible au tir.
  let twist = 0.75 * ease(Math.min(1, charge));
  if (s.shot != null) twist = s.shot < 0.25 ? 0.75 * (1 - s.shot / 0.25) : -0.6 * Math.sin(Math.PI * Math.min(1, (s.shot - 0.25) / 0.75) * 0.5 + 0) * (s.shot < 0.8 ? 1 : (1 - s.shot) / 0.2);
  u.twist += (twist - u.twist) * k(s.shot != null ? 30 : 12);
  u.upper.rotation.set(u.roll * 1.12, -u.twist, -u.lean);
  u.upper.updateMatrix();
  u.headPivot.rotation.z = u.lean * 0.75 * (1 - fall);

  // Jambes : poussée latérale du patineur, papillon du gardien, chute.
  for (const L of u.legs) {
    const sgn = L.side;
    const ph = Math.sin(u.phase + (sgn > 0 ? Math.PI : 0));
    const push = Math.max(0, ph);
    const rec = Math.max(0, -ph);
    const wide = u.goalie ? 0.42 : 0.17;
    L.target.set(0.04 - 0.36 * stride * push + 0.14 * stride * rec, ANKLE + 0.05 * stride * rec, sgn * (wide + 0.2 * stride * push));
    L.pole.set(1, 0.1, u.goalie ? -sgn * 0.5 : sgn * 0.25); // gardien : genoux rentrés, jambières en V
    let yaw = -sgn * 0.5 * stride * push;
    if (Math.abs(u.roll) > 0.18 && !u.goalie) {
      // Croisé : dans un virage serré, le patin extérieur passe par-dessus l'autre.
      const outside = sgn * Math.sign(u.roll) < 0;
      const amt = Math.min(1, (Math.abs(u.roll) - 0.18) * 3) * stride;
      if (outside) L.target.z += Math.sign(u.roll) * 0.26 * amt * push;
      L.target.x += (outside ? 0.12 : -0.06) * amt;
    }
    if (u.skid > 0.01) {
      // Dérapage : les deux patins en travers, devant le corps.
      L.target.lerp(_t.set(0.3 + (sgn > 0 ? 0.08 : -0.08), ANKLE, sgn * 0.2), u.skid);
      yaw = yaw * (1 - u.skid) + 1.35 * u.skid;
    }
    if (down > 0.01) {
      // Papillon : les deux genoux au sol, serrés au centre ; les jambières partent droit sur les côtés, à plat,
      // face au tir, et ferment toute la largeur au ras du sol.
      // Le patin se pose à une longueur de tibia du genou, lui-même presque au centre : les genoux se touchent.
      L.target.lerp(_t.set(-0.06, ANKLE - 0.03, (sgn * (D.hipZ * 0.45 + D.shin * 0.99)) / D.k), down);
      L.pole.lerp(_t.set(1, -0.6, -sgn * 3), down);
      yaw += -sgn * 1.2 * down;
    }
    if (kneel > 0.01) {
      // Genou gauche au sol, patin en arrière ; jambe droite pliée, patin à plat devant.
      if (sgn < 0) {
        L.target.lerp(_t.set(-0.42, ANKLE, -0.16), kneel);
        L.pole.lerp(_t.set(1, -1.6, 0), kneel);
      } else {
        L.target.lerp(_t.set(0.3, ANKLE, 0.24), kneel);
        L.pole.lerp(_t.set(1, 0.6, 0.2), kneel);
      }
      yaw *= 1 - kneel;
    }
    if (s.sit) {
      L.target.set(0.42, ANKLE, sgn * 0.16);
      L.pole.set(1, 1, 0);
      yaw = 0;
    }
    if (fall > 0.01) {
      L.target.lerp(_t.set(-0.8, ANKLE, sgn * 0.2), fall);
      L.pole.lerp(_t.set(0.3, -1, sgn * 0.2), fall);
    }
    // Les cibles sont écrites pour la figurine stylisée ; elles sont ramenées aux proportions du corps animé.
    L.target.set(L.target.x * D.k, D.ankle + (L.target.y - ANKLE) * D.k, L.target.z * D.k);
    L.hip.set(_pelvis.x, _pelvis.y, sgn * D.hipZ);
    solve(L.hip, L.target, D.thigh, D.shin, L.pole, L.kneeP, L.foot);
    if (L.kneeP.y < 0.09 * D.k) L.kneeP.y = 0.09 * D.k;
    L.yaw = yaw;
    L.flat = !(fall > 0.5 || down > 0.5 || (kneel > 0.5 && sgn < 0));
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
  fromUpper(u, D.shX, D.shY, -D.shZ, armL.sh);
  fromUpper(u, D.shX, D.shY, D.shZ, armR.sh);
  let oneHand = false;
  if (st) {
    if (u.goalie) {
      _want.set(0.5 - 0.1 * down, 0.03, 0.12);
      if (s.puck) toLocal(s.puck.x, s.puck.y, _want).multiplyScalar(0.9).setY(0.03);
    } else {
      _want.set(REST[0], REST[1], REST[2] + Math.sin(u.phase * 0.5) * 0.05 * stride);
      if (s.puck) {
        // Le palet est sur la palette : elle se place juste derrière lui.
        toLocal(s.puck.x, s.puck.y, _want);
        const l = _want.length() || 1;
        _want.multiplyScalar((l - 0.06) / l).setY(0.03 + (s.puckZ ?? 0) / scale);
      }
      if (charge > 0) _want.lerp(_t.set(-0.75, 1.15 + 0.35 * charge, 0.7), ease(Math.min(1, charge * 1.6)) * 0.97); // armé du tir : palette haut derrière
      if (s.shot != null) {
        // Tir : la palette revient frapper le palet puis accompagne vers la cible.
        const a = s.shot;
        if (a < 0.25) _want.set(-0.5, 0.9, 0.7).lerp(_t.set(...REST), ease(a / 0.25));
        else _want.set(...REST).lerp(_t.set(1.3, 1.05, -0.45), ease(Math.min(1, (a - 0.25) / 0.3)));
      } else if (s.pass != null) {
        _want.set(...REST).lerp(_t.set(1.15, 0.1, 0.2), Math.sin(Math.PI * Math.min(1, s.pass * 1.3)));
      }
      if (s.poke) {
        // Harponnage : la palette part vers la palette adverse, tenue d'une seule main.
        toLocal(s.poke.x, s.poke.y, _t);
        const l = _t.length() || 1;
        _t.multiplyScalar(Math.min(l, 1.62) / l).setY(0.04);
        _want.lerp(_t, Math.sin(Math.PI * Math.min(1, s.poke.k * 1.15)));
        oneHand = true;
      }
      if (kneel > 0.01) _want.lerp(_t.set(0.62, 0.03, 0.85), kneel); // crosse à plat, en travers
      if (fall > 0.3) _want.set(0.7, 0.03, 0.5);
    }
    st.tip.lerp(_want, s.shot != null || s.poke ? k(40) : k(18));

    // La main du haut se place pour que le manche, de longueur fixe, arrive à la palette.
    const top = u.goalie ? armR : armL;
    if (u.goalie) fromUpper(u, 0.26, 0.14, 0.3, _t);
    else if (oneHand) _t.copy(top.sh).lerp(st.tip, 0.45).setY(Math.max(0.55, top.sh.y - 0.55)); // bras tendu vers l'avant, crosse couchée
    else if (kneel > 0.5) _t.set(0.5, 0.26, -0.35);
    else _t.set(_pelvis.x + 0.13 + 0.1 * Math.sin(u.lean), _pelvis.y + 0.1 + 0.25 * charge, -0.08 + 0.3 * u.roll); // main du haut : devant la hanche
    _h.subVectors(_t, st.tip).normalize();
    st.top.copy(st.tip).addScaledVector(_h, st.len);
    // Elle ne peut pas s'éloigner de l'épaule de plus que la longueur du bras.
    _t.subVectors(st.top, top.sh);
    const reach = (D.arm + D.fore) * 0.97;
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
    if (st.mesh) st.model.place(st.mesh, st.top, st.heel, st.full);
    top.target.copy(st.top);
    const low = u.goalie ? armL : armR;
    if (u.goalie) fromUpper(u, 0.34, 0.3 + 0.12 * down, -0.42, low.target); // mitaine ouverte
    else if (oneHand) fromUpper(u, 0.12, 0.05, 0.34, low.target);
    else low.target.copy(st.top).addScaledVector(_h, D.grip);
  } else {
    // Arbitre : bras le long du corps, bras levé pour signaler (avantage, coup de sifflet).
    u.armUp += ((s.armUp ? 1 : 0) - u.armUp) * k(8);
    fromUpper(u, 0.08, 0.02, -0.3, armL.target);
    fromUpper(u, 0.08, 0.02, 0.3, armR.target).lerp(fromUpper(u, 0.1, 1.2, 0.32, _t), u.armUp);
  }
  for (const A of u.arms) {
    A.pole.set(-0.6, -0.8, A.side * 0.5); // coudes vers l'arrière et l'extérieur
    if (!st && A.side > 0 && u.armUp > 0.5) A.pole.set(-0.2, 0.2, 1);
    solve(A.sh, A.target, D.arm, D.fore, A.pole, A.el, A.ha);
    place(A.upperArm, A.sh, A.el);
    place(A.fore, A.el, A.ha);
    A.elbow.position.copy(A.el);
    A.hand.position.copy(A.ha);
  }
  if (u.blocker) {
    u.blocker.position.copy(armR.ha);
    u.blocker.position.x += 0.07;
  }

  if (u.model) u.model.drive(u);

  u.ring.visible = !!s.ring;
  u.marker.visible = !!s.ring;
  if (s.ring) {
    u.ring.material.color.set(s.ring);
    u.marker.material.color.set(s.ring);
  }
  u.first = false;
}
