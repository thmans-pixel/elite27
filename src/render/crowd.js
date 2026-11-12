// Le public dans la tribune : des silhouettes simples (corps, tête, bras levés) dessinées en lot, pour en
// afficher quelques centaines sans ralentir le jeu. Il réagit aux événements du match, sans jamais y toucher.
import * as THREE from 'three';
import { HW } from '../sim/geometry.js';

const PALETTE = ['#2f4f7a', '#7a3b2f', '#3d6b4a', '#5a5a66', '#8a7a4e', '#3a3f55', '#6b4a6e', '#c9c9c4', '#274a57', '#9a5b3c'];

/** Petit générateur à graine fixe : la tribune est la même d'un match à l'autre. */
function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

export class Crowd {
  /** homeColour, awayColour : couleur de maillot des deux équipes (les supporters la portent). */
  constructor(scene, homeColour, awayColour) {
    const rnd = lcg(27);
    this.people = [];
    for (let row = 0; row < 6; row++) {
      const y = 1.175 + row * 0.55;
      const z = -HW - 4 - row * 1.1;
      for (let x = -22; x <= 22; x += 0.74) {
        if (rnd() < 0.2) continue; // places vides
        const r = rnd();
        // Environ un tiers de supporters de l'équipe qui reçoit, quelques visiteurs regroupés à droite.
        const side = x > 14 && r < 0.6 ? 'away' : r < 0.36 ? 'home' : 'neutral';
        const colour = side === 'home' ? homeColour : side === 'away' ? awayColour : PALETTE[Math.floor(rnd() * PALETTE.length)];
        this.people.push({ x: x + (rnd() - 0.5) * 0.12, y, z, side, colour, h: 0.92 + rnd() * 0.16, phase: rnd() * 6.28, lively: rnd(), up: 0, t: 0, amp: 0 });
      }
    }
    // Mélangés : réduire le nombre affiché (qualité moyenne ou basse) laisse la tribune clairsemée, pas coupée.
    for (let i = this.people.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [this.people[i], this.people[j]] = [this.people[j], this.people[i]];
    }
    const n = this.people.length;
    const mat = (rough) => new THREE.MeshStandardMaterial({ roughness: rough });
    this.bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(0.46, 0.62, 0.34), mat(0.85), n);
    this.heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.15, 10, 8), mat(0.7), n);
    // Deux bras levés en V, repliés (échelle nulle) tant que le spectateur ne fête rien.
    const arm = new THREE.BoxGeometry(0.09, 0.5, 0.09);
    const geo = new THREE.BufferGeometry();
    const left = arm.clone().rotateZ(0.35).translate(-0.27, 0.25, 0);
    const right = arm.clone().rotateZ(-0.35).translate(0.27, 0.25, 0);
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([...left.attributes.position.array, ...right.attributes.position.array]), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([...left.attributes.normal.array, ...right.attributes.normal.array]), 3));
    const idx = [...left.index.array, ...Array.from(right.index.array, (i) => i + left.attributes.position.count)];
    geo.setIndex(idx);
    this.arms = new THREE.InstancedMesh(geo, mat(0.85), n);
    const skin = ['#e8c4a0', '#d2a37c', '#b98562', '#8c5f43', '#f0d2b6'];
    const c = new THREE.Color();
    this.people.forEach((p, i) => {
      this.bodies.setColorAt(i, c.set(p.colour));
      this.arms.setColorAt(i, c.set(p.colour));
      this.heads.setColorAt(i, c.set(skin[i % skin.length]));
    });
    for (const m of [this.bodies, this.heads, this.arms]) {
      m.frustumCulled = false;
      scene.add(m);
    }
    this.animated = true;
    this.active = true; // à redessiner au prochain passage
    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.sc = new THREE.Vector3();
    this.setLevel(1, true);
  }

  /** share : part du public affichée (1, 0.5...) ; animated : faux pour un public immobile. */
  setLevel(share, animated) {
    const n = Math.round(this.people.length * share);
    for (const m of [this.bodies, this.heads, this.arms]) m.count = n;
    this.shown = n;
    this.animated = animated;
    if (!animated) for (const p of this.people) p.t = 0;
    this.active = true;
  }

  /** Fait réagir une partie du public : who ('home', 'away', 'all'), durée, ampleur (1 = debout bras levés). */
  cheer(who, seconds, amp, share = 1) {
    if (!this.animated) return;
    for (const p of this.people) {
      const mine = who === 'all' || p.side === who || (p.side === 'neutral' && who === 'home' && p.lively < 0.6);
      if (!mine || p.lively > share) continue;
      p.t = seconds * (0.75 + p.lively * 0.5);
      p.amp = amp;
    }
    this.active = true;
  }

  /** Réagit aux événements du match. homeTeam : indice de l'équipe qui reçoit (0). */
  onEvent(e) {
    if (e.type === 'goal') this.cheer(e.team === 0 ? 'home' : 'away', 3.6, 1);
    else if (e.type === 'shootoutShot' && e.goal) this.cheer(e.team === 0 ? 'home' : 'away', 2.2, 1);
    else if (e.type === 'post') this.cheer('all', 0.7, 0.3, 0.5);
    else if (e.type === 'save' && e.kind === 'catch') this.cheer('all', 0.6, 0.25, 0.35);
    else if (e.type === 'final') this.cheer('all', 5, 0.8, 0.8);
  }

  update(dt, time) {
    if (!this.active) return;
    let still = true;
    for (let i = 0; i < this.shown; i++) {
      const p = this.people[i];
      if (p.t > 0) {
        p.t = Math.max(0, p.t - dt);
        still = false;
      }
      const want = p.t > 0 ? p.amp : 0;
      p.up += (want - p.up) * Math.min(1, dt * 7);
      if (Math.abs(p.up - want) > 0.01) still = false;
      // Debout en sautillant quand il fête, assis sinon.
      const hop = p.up > 0.5 ? Math.abs(Math.sin(time * 9 + p.phase)) * 0.12 * p.up : 0;
      const lift = p.up * 0.32 + hop;
      this.sc.set(1, p.h * (1 + p.up * 0.25), 1);
      this.m4.compose(this.v.set(p.x, p.y + 0.31 * this.sc.y + lift, p.z), this.q, this.sc);
      this.bodies.setMatrixAt(i, this.m4);
      const top = p.y + 0.62 * this.sc.y + lift;
      this.sc.set(1, 1, 1);
      this.m4.compose(this.v.set(p.x, top + 0.13, p.z), this.q, this.sc);
      this.heads.setMatrixAt(i, this.m4);
      const a = p.up > 0.6 ? (p.up - 0.6) / 0.4 : 0;
      this.sc.set(a, a, a);
      this.m4.compose(this.v.set(p.x, top - 0.08, p.z), this.q, this.sc);
      this.arms.setMatrixAt(i, this.m4);
    }
    for (const m of [this.bodies, this.heads, this.arms]) m.instanceMatrix.needsUpdate = true;
    this.active = !still;
  }
}
