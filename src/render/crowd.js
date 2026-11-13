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

// ---------------------------------------------------------------- public de Blender
// Trois cents squelettes animés coûteraient trop cher : chaque spectateur est figé dans trois poses tirées des
// animations (assis, mains jointes, debout bras levés), dessinées en lot. Seul le kop, quelques spectateurs avec
// un drapeau, est animé os par os.

const POSES = [
  ['P_Assis', 0],
  ['P_Applaudit', 0.17],
  ['P_Debout_Bras_Leves', 1.0],
];
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

/** Teinte par le masque : rouge = haut, vert = bas, bleu = coiffe. Les trois couleurs sont propres à chaque spectateur. */
function teinterPublic(material, masque, parInstance) {
  const m = material.clone();
  const u = { uMasque: { value: masque }, uHaut: { value: new THREE.Color('#888') }, uBas: { value: new THREE.Color('#333') }, uCoiffe: { value: new THREE.Color('#555') } };
  m.userData.public = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    if (parInstance) {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 iHaut;\nattribute vec3 iBas;\nattribute vec3 iCoiffe;\nvarying vec3 vHaut;\nvarying vec3 vBas;\nvarying vec3 vCoiffe;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHaut = iHaut;\nvBas = iBas;\nvCoiffe = iCoiffe;');
    }
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform sampler2D uMasque;\n${parInstance ? 'varying vec3 vHaut;\nvarying vec3 vBas;\nvarying vec3 vCoiffe;' : 'uniform vec3 uHaut;\nuniform vec3 uBas;\nuniform vec3 uCoiffe;\n#define vHaut uHaut\n#define vBas uBas\n#define vCoiffe uCoiffe'}`)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          vec4 zm = texture2D( uMasque, vMapUv );
          float gris = clamp( dot( diffuseColor.rgb, vec3( 0.3333 ) ) / 0.7, 0.0, 1.3 );
          diffuseColor.rgb = mix( diffuseColor.rgb, vHaut * gris, zm.r );
          diffuseColor.rgb = mix( diffuseColor.rgb, vBas * gris, zm.g );
          diffuseColor.rgb = mix( diffuseColor.rgb, vCoiffe * gris, zm.b );
        }`,
      );
  };
  m.customProgramCacheKey = () => `public-${parInstance ? 'lot' : 'seul'}`;
  return m;
}

/** Fige un spectateur dans une pose d'animation : renvoie une géométrie ordinaire, sans squelette. */
function figer(root, mesh, clip, t) {
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(clip).play();
  mixer.setTime(t);
  root.updateMatrixWorld(true);
  mesh.skeleton.update();
  const src = mesh.geometry;
  const pos = src.attributes.position;
  const out = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    mesh.applyBoneTransform(i, v);
    v.applyMatrix4(mesh.matrixWorld);
    out[i * 3] = v.x;
    out[i * 3 + 1] = v.y;
    out[i * 3 + 2] = v.z;
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(root);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(out, 3));
  g.setAttribute('uv', src.attributes.uv);
  if (src.index) g.setIndex(src.index);
  g.computeVertexNormals();
  return g;
}

export class Crowd {
  /** homeColour, awayColour : couleur de maillot des deux équipes (les supporters la portent). */
  /** model : public de Blender (loadDecor), facultatif ; flag : texture du drapeau du club qui reçoit, facultative. */
  constructor(scene, homeColour, awayColour, model = null, flag = null) {
    const rnd = lcg(27);
    this.people = [];
    this.model = model;
    this.kop = [];
    for (let row = model ? 1 : 0; row < 6; row++) {
      // Gradins de la salle de Blender : 0,42 m de haut et 0,85 m de profondeur. Le rang du bas reste vide : les
      // pieds seraient au sol, dans le dos des bancs des équipes.
      const y = model ? row * 0.42 : 1.175 + row * 0.55;
      const z = model ? -14.8 - row * 0.85 - 0.02 : -HW - 4 - row * 1.1;
      for (let x = -22; x <= 22; x += 0.74) {
        // Le kop : cinq places au milieu d'un rang du bas, tenues par des spectateurs animés un par un.
        if (model?.drapeau && flag && row === 2 && Math.abs(x) < 1.9) {
          this.kop.push({ x, y, z });
          continue;
        }
        if (rnd() < 0.2) continue; // places vides
        const r = rnd();
        // Environ un tiers de supporters de l'équipe qui reçoit, quelques visiteurs regroupés à droite.
        const side = x > 14 && r < 0.6 ? 'away' : r < 0.36 ? 'home' : 'neutral';
        const colour = side === 'home' ? homeColour : side === 'away' ? awayColour : PALETTE[Math.floor(rnd() * PALETTE.length)];
        this.people.push({ x: x + (rnd() - 0.5) * 0.12, y, z, side, colour, type: Math.floor(rnd() * 4), bas: PALETTE[Math.floor(rnd() * PALETTE.length)], coiffe: PALETTE[Math.floor(rnd() * PALETTE.length)], h: 0.92 + rnd() * 0.16, phase: rnd() * 6.28, lively: rnd(), up: 0, t: 0, amp: 0 });
      }
    }
    // Mélangés : réduire le nombre affiché (qualité moyenne ou basse) laisse la tribune clairsemée, pas coupée.
    for (let i = this.people.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [this.people[i], this.people[j]] = [this.people[j], this.people[i]];
    }
    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.sc = new THREE.Vector3();
    this.animated = true;
    this.active = true; // à redessiner au prochain passage
    if (model) return this.buildModel(scene, homeColour, flag);
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
    this.setLevel(1, true);
  }

  /** Public de Blender : quatre spectateurs, trois poses figées chacun, dessinés en lot ; plus le kop animé. */
  buildModel(scene, homeColour, flag) {
    const { gltf, masque, drapeau, clone } = this.model;
    const root = clone(gltf.scene);
    const clips = Object.fromEntries(gltf.animations.map((c) => [c.name, c]));
    const c = new THREE.Color();
    this.lots = []; // par type : { meshes: [une par pose], ids: [indices dans people] }
    for (const [t, lettre] of ['A', 'B', 'C', 'D'].entries()) {
      const mesh = root.getObjectByName(`Spectateur_${lettre}`);
      const ids = this.people.map((p, i) => (p.type === t ? i : -1)).filter((i) => i >= 0);
      const n = ids.length;
      const cols = ['colour', 'bas', 'coiffe'].map((k) => {
        const a = new Float32Array(n * 3);
        ids.forEach((id, j) => c.set(this.people[id][k]).toArray(a, j * 3));
        return new THREE.InstancedBufferAttribute(a, 3);
      });
      const material = teinterPublic(mesh.material, masque, true);
      const meshes = POSES.map(([nom, temps]) => {
        const g = figer(root, mesh, clips[nom], temps);
        g.setAttribute('iHaut', cols[0]);
        g.setAttribute('iBas', cols[1]);
        g.setAttribute('iCoiffe', cols[2]);
        const im = new THREE.InstancedMesh(g, material, n);
        im.frustumCulled = false;
        scene.add(im);
        return im;
      });
      ids.forEach((id, j) => (this.people[id].slot = j));
      this.lots.push({ meshes, ids });
    }
    // Le kop : debout, drapeau du club qui reçoit dans la main droite, animé os par os.
    this.kopMixers = [];
    this.kop.forEach((place, i) => {
      const k = clone(gltf.scene);
      const lettre = 'ABCD'[i % 4];
      const os = {};
      k.traverse((o) => {
        if (o.isBone) os[o.name] = o;
        if (!o.isSkinnedMesh) return;
        o.visible = o.name === `Spectateur_${lettre}`;
        o.frustumCulled = false;
        o.material = teinterPublic(o.material, masque, false);
        o.material.userData.public.uHaut.value.set(homeColour);
        o.material.userData.public.uCoiffe.value.set(homeColour);
      });
      k.position.set(place.x, place.y, place.z);
      const toile = drapeau.scene.getObjectByName('Drapeau').clone(true);
      toile.position.set(0, 0, 0);
      toile.rotation.set(0, 0, 0);
      toile.traverse((o) => {
        if (!o.isMesh) return;
        o.material = o.material.clone();
        o.material.map = flag;
        o.material.side = THREE.DoubleSide;
        o.frustumCulled = false;
      });
      os.Prop_MainDroite.add(toile);
      scene.add(k);
      // Le spectateur et sa toile jouent en phase, comme dans Blender ; chaque membre du kop a son décalage.
      const m1 = new THREE.AnimationMixer(k);
      const m2 = new THREE.AnimationMixer(toile);
      m1.clipAction(clips.P_Kop_Drapeau).play();
      const vague = drapeau.animations.find((a) => a.name === 'Drapeau_Kop');
      if (vague) m2.clipAction(vague).play();
      for (const m of [m1, m2]) m.setTime(i * 0.37);
      this.kopMixers.push(m1, m2);
      place.root = k;
    });
    this.setLevel(1, true);
  }

  /** share : part du public affichée (1, 0.5...) ; animated : faux pour un public immobile. */
  setLevel(share, animated) {
    const n = Math.round(this.people.length * share);
    if (!this.model) for (const m of [this.bodies, this.heads, this.arms]) m.count = n;
    // Le kop n'est là qu'avec un public animé (qualité haute ou moyenne).
    for (const k of this.kop) if (k.root) k.root.visible = animated;
    if (this.model) {
      // Les spectateurs affichés ont les premières places de chaque lot ; un public immobile n'a qu'une pose.
      for (const lot of this.lots) {
        const count = lot.ids.filter((id) => id < n).length;
        lot.meshes.forEach((m, k) => {
          m.count = count;
          m.visible = animated || k === 0;
        });
      }
    }
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
    if (this.model) return this.updateModel(dt, time);
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

  updateModel(dt, time) {
    if (this.animated) for (const m of this.kopMixers) m.update(dt);
    if (!this.active) return;
    let still = true;
    this.sc.set(1, 1, 1);
    for (let i = 0; i < this.people.length; i++) {
      const p = this.people[i];
      const lot = this.lots[p.type];
      let pose = -1; // caché (public réduit par la qualité)
      if (i < this.shown) {
        if (p.t > 0) {
          p.t = Math.max(0, p.t - dt);
          still = false;
        }
        const want = p.t > 0 ? p.amp : 0;
        p.up += (want - p.up) * Math.min(1, dt * 7);
        if (Math.abs(p.up - want) > 0.01) still = false;
        // Debout bras levés quand il fête ; applaudissements (mains jointes par à-coups) pour une belle action.
        pose = p.up > 0.5 ? 2 : p.up > 0.08 && Math.sin(time * 14 + p.phase) > 0 ? 1 : 0;
        const hop = pose === 2 ? Math.abs(Math.sin(time * 9 + p.phase)) * 0.1 * p.up : 0;
        this.m4.compose(this.v.set(p.x, p.y + hop, p.z), this.q, this.sc);
      }
      for (let k = 0; k < lot.meshes.length; k++) lot.meshes[k].setMatrixAt(p.slot, k === pose ? this.m4 : ZERO);
    }
    for (const lot of this.lots) for (const m of lot.meshes) m.instanceMatrix.needsUpdate = true;
    this.active = !still;
  }
}
