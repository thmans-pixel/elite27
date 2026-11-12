// Modèle 3D de joueur : maillage allégé et squelette préparés par tools/modele/convertir.py.
// Le corps est animé par la même pose que les figurines stylisées (figures.js) : chaque os est posé à
// l'articulation calculée (hanche, genou, épaule, coude…) et orienté vers la suivante.
import * as THREE from 'three';

const HEIGHT = 1.83; // hauteur d'un joueur debout, en unités de la figurine (agrandie ensuite de 1,15 dans la vue)
const lin = (v) => Math.pow(v, 2.2);

/** Charge assets/<nom>.json et .bin. Renvoie un gabarit dont instantiate(kit) donne un corps par joueur. */
export async function loadPlayerModel(base = 'assets/joueur') {
  const [meta, buf] = await Promise.all([
    fetch(`${base}.json`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${base}.json introuvable`)))),
    fetch(`${base}.bin`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${base}.bin introuvable`)))),
  ]);
  const SCALE = HEIGHT / (meta.hauteur ?? 1.902); // unités du modèle → unités de la figurine
  const n = meta.sommets;
  const t = meta.triangles;
  let o = 0;
  const pos = new Float32Array(buf, o, n * 3);
  o += n * 12;
  const idx = new Uint16Array(buf, o, t * 3);
  o += Math.ceil((t * 6) / 4) * 4;
  const col = new Uint8Array(buf, o, n * 3);
  o += n * 3;
  const zone = new Uint8Array(buf, o, n);
  o += n;
  const skinI = new Uint8Array(buf, o, n * 4);
  o += n * 4;
  const skinW = new Uint8Array(buf, o, n * 4);
  o += n * 4;
  // Modèle livré déjà allégé : il garde sa texture, plus fine que des couleurs par sommet.
  let texture = null;
  let uvs = null;
  if (meta.texture) {
    uvs = new Float32Array(buf, Math.ceil(o / 4) * 4, n * 2);
    texture = await new THREE.TextureLoader().loadAsync(base.replace(/[^/]*$/, '') + meta.texture);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false;
    texture.anisotropy = 4;
  }

  // Du repère du modèle (face vers +z, sol à meta.sol) à celui de la figurine (face vers +x, sol à 0).
  const conv = ([x, y, z]) => new THREE.Vector3(z * SCALE, (y - meta.sol) * SCALE, -x * SCALE);
  const positions = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    positions[i * 3] = pos[i * 3 + 2] * SCALE;
    positions[i * 3 + 1] = (pos[i * 3 + 1] - meta.sol) * SCALE;
    positions[i * 3 + 2] = -pos[i * 3] * SCALE;
  }
  const weights = new Float32Array(n * 4);
  for (let i = 0; i < n * 4; i++) weights[i] = skinW[i] / 255;
  const base0 = new THREE.BufferGeometry();
  base0.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  base0.setIndex(new THREE.BufferAttribute(idx, 1));
  base0.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(Array.from(skinI), 4));
  base0.setAttribute('skinWeight', new THREE.BufferAttribute(weights, 4));
  if (uvs) base0.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  base0.computeVertexNormals();

  // Articulations au repos, des deux côtés. Le côté x > 0 du modèle est le côté -1 de la figurine (indice 0).
  const joint = (name, cote) => {
    const [x, y, z] = meta.reperes[name];
    return conv([x * (cote || 1), y, z]);
  };
  const bonesDef = meta.os.map((b) => {
    const from = joint(b.de, b.cote);
    const to = joint(b.vers, b.cote);
    return { name: b.nom, from, dir: to.clone().sub(from).normalize(), len: to.distanceTo(from) };
  });
  const R = meta.reperes;
  const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * SCALE;
  const pelvisY = (R.hanche[1] - meta.sol) * SCALE;
  const dims = {
    thigh: d3(R.hanche, R.genou),
    shin: d3(R.genou, R.cheville),
    arm: d3(R.epaule, R.coude),
    fore: d3(R.coude, R.poignet),
    hipZ: R.hanche[0] * SCALE,
    ankle: (R.cheville[1] - meta.sol) * SCALE,
    shX: R.epaule[2] * SCALE,
    shY: (R.epaule[1] - R.hanche[1]) * SCALE,
    shZ: R.epaule[0] * SCALE,
    neckY: (R.cou[1] - R.hanche[1]) * SCALE,
    grip: 0.26,
  };
  dims.k = (dims.thigh + dims.shin + dims.ankle) / 1.05;
  const rest = Object.fromEntries(bonesDef.map((b) => [b.name, b]));
  const chestUp = rest.buste.from.y - pelvisY;

  // Couleurs par équipe : le maillot blanc du modèle est teinté, le reste garde ses couleurs.
  const cache = new Map();
  function geometryFor(kit, plain = []) {
    const key = kit ? [kit.maillot, kit.epaules, kit.casque, kit.pantalon, ...plain].join('|') : '';
    if (cache.has(key)) return cache.get(key);
    const g = base0.clone();
    const out = new Float32Array(n * 3);
    const Z = meta.zones;
    // Sans tenue (arbitre), rien n'est teinté. Avec une texture, la teinte multiplie la texture : seules les
    // zones claires (maillot, bas, épaules) peuvent changer de couleur.
    const tint = !kit ? {} : texture ? { [Z.maillot]: kit.maillot, [Z.bas]: kit.maillot, [Z.epaules]: kit.epaules } : { [Z.maillot]: kit.maillot, [Z.bas]: kit.maillot, [Z.epaules]: kit.epaules, [Z.pantalon]: kit.pantalon, [Z.casque]: kit.casque };
    for (const z of plain) delete tint[Z[z]]; // zones laissées telles quelles (jambières du gardien)
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const r = col[i * 3] / 255;
      const gg = col[i * 3 + 1] / 255;
      const b = col[i * 3 + 2] / 255;
      const z = zone[i];
      if (texture) {
        c.set(tint[z] ?? 0xffffff);
        out[i * 3] = c.r;
        out[i * 3 + 1] = c.g;
        out[i * 3 + 2] = c.b;
      } else if (tint[z] != null) {
        const lum = 0.299 * r + 0.587 * gg + 0.114 * b;
        const dark = z === Z.pantalon || z === Z.casque;
        // Tissu clair : la teinte suit les plis du maillot. Pièces sombres : on garde un peu de relief.
        const shade = dark ? Math.min(1.2, 0.6 + lum * 2.2) : Math.min(1.1, lin(lum) / lin(0.88));
        c.set(tint[z]);
        out[i * 3] = c.r * shade;
        out[i * 3 + 1] = c.g * shade;
        out[i * 3 + 2] = c.b * shade;
      } else {
        out[i * 3] = lin(r);
        out[i * 3 + 1] = lin(gg);
        out[i * 3 + 2] = lin(b);
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(out, 3));
    cache.set(key, g);
    return g;
  }

  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, map: texture });
  const _q = new THREE.Quaternion();
  const _v = new THREE.Vector3();
  const _e = new THREE.Euler();
  const UPQ = new THREE.Quaternion();

  /** kit : tenue de l'équipe (null : rien n'est teinté) ; plain : zones à ne pas teinter. */
  function instantiate(kit, plain = []) {
    const bones = bonesDef.map((b) => {
      const bone = new THREE.Bone();
      bone.name = b.name;
      bone.position.copy(b.from);
      return bone;
    });
    const by = Object.fromEntries(bones.map((b) => [b.name, b]));
    const skeleton = new THREE.Skeleton(bones, bonesDef.map((b) => new THREE.Matrix4().makeTranslation(-b.from.x, -b.from.y, -b.from.z)));
    const mesh = new THREE.SkinnedMesh(geometryFor(kit, plain), material);
    mesh.castShadow = true;
    mesh.frustumCulled = false; // la boîte englobante au repos ne suit pas la pose
    mesh.bind(skeleton, new THREE.Matrix4());

    const aim = (name, at, to) => {
      const b = by[name];
      b.position.copy(at);
      _v.subVectors(to, at);
      const len = _v.length() || 1e-4;
      b.quaternion.setFromUnitVectors(rest[name].dir, _v.divideScalar(len));
      return b;
    };

    /** Pose les os d'après les articulations calculées par poseFigure (u = userData de la figurine). */
    function drive(u) {
      UPQ.copy(u.upper.quaternion);
      by.bassin.position.copy(u.upper.position);
      by.bassin.quaternion.copy(UPQ);
      by.buste.position.set(0, chestUp, 0).applyMatrix4(u.upper.matrix);
      by.buste.quaternion.copy(UPQ);
      by.tete.position.set(0, u.dims.neckY, 0).applyMatrix4(u.upper.matrix);
      by.tete.quaternion.copy(UPQ).multiply(_q.setFromEuler(_e.set(0, 0, u.headPivot.rotation.z)));
      u.legs.forEach((L, i) => {
        const sfx = i === 0 ? 'A' : 'B';
        aim('cuisse' + sfx, L.hip, L.kneeP);
        const shin = aim('tibia' + sfx, L.kneeP, L.foot);
        const foot = by['patin' + sfx];
        foot.position.copy(L.foot);
        // Patin à plat sur la piste, tourné comme la foulée ; au sol (chute, papillon, genou) il suit le tibia.
        if (L.flat) foot.quaternion.setFromEuler(_e.set(0, L.yaw, 0));
        else foot.quaternion.copy(shin.quaternion);
      });
      u.arms.forEach((A, i) => {
        const sfx = i === 0 ? 'A' : 'B';
        aim('bras' + sfx, A.sh, A.el);
        const fore = aim('avantbras' + sfx, A.el, A.ha);
        const hand = by['main' + sfx];
        hand.position.copy(A.ha);
        hand.quaternion.copy(fore.quaternion);
      });
    }

    // Emplacement du numéro, d'après la carrure : milieu du dos et haut de la poitrine.
    return { mesh, bones, dims, drive, backX: 0.1 * HEIGHT, chestX: 0.092 * HEIGHT, numY: dims.shY * 0.6 };
  }

  return { instantiate, dims, triangles: t };
}
