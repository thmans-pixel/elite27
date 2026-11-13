// Personnages livrés par Blender (docs/3d/brief-blender.md) : lecture des .glb, tenue du club, tête, casque, crosse.
// Les fichiers sont dans assets/3d/ ; rien ici ne touche à la logique du match.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const BASE = new URL('../../assets/3d/', import.meta.url).href;
const loader = new GLTFLoader();
const textures = new THREE.TextureLoader();
const cache = new Map();

/** Charge un fichier une seule fois (les suivants reçoivent la même promesse). */
function once(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}
export const glb = (path) => once(path, () => loader.loadAsync(BASE + path));
export const json = (path) => once(path, () => fetch(BASE + path).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${path} introuvable`)))));
function image(path) {
  return once(`img:${path}`, () => new Promise((ok, ko) => {
    const im = new Image();
    im.onload = () => ok(im);
    im.onerror = () => ko(new Error(`${path} introuvable`));
    im.src = BASE + path;
  }));
}
function texture(path, srgb) {
  return once(`tex:${path}`, async () => {
    const t = await textures.loadAsync(BASE + path);
    t.flipY = false; // repère UV du glTF
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    return t;
  });
}

const srgb = (c) => new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);

/**
 * Tenue d'un joueur : la texture du club, plus le numéro et le nom écrits dans les rectangles réservés
 * (zones-uv.json). Renvoie une texture prête pour `habiller`.
 */
export async function textureTenue(club, tenue, { numero = null, nom = null, encre = null, taille = 2048, fond = [0.5, 0.5, 0.5] } = {}) {
  // Sans club (tenue de secours, équipe du barrage) : pas de motif, seulement le numéro et le nom.
  const [img, zones, clubs] = await Promise.all([club ? image(`clubs/tenues/${club}-${tenue}.png`) : null, json('joueur/textures/zones-uv.json'), json('clubs/clubs.json')]);
  const c = document.createElement('canvas');
  c.width = c.height = taille;
  const g = c.getContext('2d');
  if (img) g.drawImage(img, 0, 0, taille, taille);
  const cfg = club ? clubs.clubs[club][tenue] : { maillot: fond };
  // Encre lisible sur le maillot : celle du club si elle est donnée, sinon blanc sur foncé et noir sur clair.
  const m = cfg.maillot;
  const ink = encre ?? (cfg.numeros ? `rgb(${cfg.numeros.map((v) => Math.round(v * 255)).join(',')})` : m[0] * 0.3 + m[1] * 0.6 + m[2] * 0.1 > 0.5 ? '#14161c' : '#f4f4f0');
  const S = c.width;
  const write = (zone, text, k, font = '800') => {
    const z = zones.zones[zone];
    if (!z || text == null || text === '') return;
    // Rectangle en UV de Blender (v vers le haut) ; l'image a son origine en haut.
    const x = z[0] * S, y = (1 - z[3]) * S, w = (z[2] - z[0]) * S, h = (z[3] - z[1]) * S;
    g.save();
    g.fillStyle = ink;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let px = h * k;
    g.font = `${font} ${px}px "Arial Narrow", "Helvetica Neue", Arial, sans-serif`;
    const tw = g.measureText(text).width;
    if (tw > w * 0.96) px *= (w * 0.96) / tw;
    g.font = `${font} ${px}px "Arial Narrow", "Helvetica Neue", Arial, sans-serif`;
    g.fillText(text, x + w / 2, y + h / 2 + px * 0.04);
    g.restore();
  };
  write('ZONE_NUMERO_DOS', numero == null ? null : String(numero), 1.0);
  write('ZONE_NOM_DOS', nom ? nom.toUpperCase() : null, 0.78, '700');
  write('ZONE_NUMERO_MANCHE_GAUCHE', numero == null ? null : String(numero), 0.95);
  write('ZONE_NUMERO_MANCHE_DROITE', numero == null ? null : String(numero), 0.95);
  const t = new THREE.CanvasTexture(c);
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * Habille une matière : le tissu neutre est teinté zone par zone d'après le masque (rouge = maillot,
 * vert = épaules et manches, bleu = pantalon, alpha = bas de jambe), puis la texture de tenue est posée dessus.
 * couleurs : { maillot, manches, pantalon, bas_de_jambe } en sRGB 0-1. tenue peut être null (casque, matériel).
 */
export function habiller(material, masque, couleurs, tenue = null) {
  const mat = material.clone();
  const u = {
    uMasque: { value: masque },
    uTenue: { value: tenue },
    uAvecTenue: { value: tenue ? 1 : 0 },
    uC: { value: [couleurs.maillot, couleurs.manches ?? couleurs.maillot, couleurs.pantalon ?? couleurs.maillot, couleurs.bas_de_jambe ?? couleurs.pantalon ?? couleurs.maillot].map(srgb) },
  };
  mat.userData.tenue = u;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uMasque;\nuniform sampler2D uTenue;\nuniform float uAvecTenue;\nuniform vec3 uC[4];')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          vec4 zm = texture2D( uMasque, vMapUv );
          // Le tissu neutre est gris clair : sa valeur porte les ombres cuites et les coutures.
          vec3 neutre = diffuseColor.rgb;
          float ombre = clamp( dot( neutre, vec3( 0.3333 ) ) / 0.62, 0.0, 1.25 );
          vec3 teinte = neutre;
          teinte = mix( teinte, uC[0] * ombre, zm.r );
          teinte = mix( teinte, uC[1] * ombre, zm.g );
          teinte = mix( teinte, uC[2] * ombre, zm.b );
          #ifdef MASQUE_ALPHA
          teinte = mix( teinte, uC[3] * ombre, zm.a );
          #endif
          vec4 tn = texture2D( uTenue, vMapUv );
          teinte = mix( teinte, tn.rgb * ombre, tn.a * uAvecTenue );
          diffuseColor.rgb = teinte;
        }`,
      );
  };
  mat.defines = { ...(mat.defines ?? {}), ...(couleurs.bas_de_jambe ? { MASQUE_ALPHA: 1 } : {}) };
  mat.customProgramCacheKey = () => `tenue-${couleurs.bas_de_jambe ? 'a' : 'x'}`;
  return mat;
}

/** Copie indépendante d'un personnage à squelette (chaque joueur a ses propres os). */
function cloneSkinned(source) {
  const map = new Map();
  const root = source.clone(true);
  const a = [];
  const b = [];
  source.traverse((o) => a.push(o));
  root.traverse((o) => b.push(o));
  a.forEach((o, i) => map.set(o, b[i]));
  root.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const src = a[b.indexOf(o)];
    o.skeleton = new THREE.Skeleton(src.skeleton.bones.map((bone) => map.get(bone)), src.skeleton.boneInverses);
    o.bind(o.skeleton, src.bindMatrix);
  });
  return root;
}

/**
 * Monte un patineur : corps habillé, tête, casque teinté, crosse dans la main du haut.
 * opts : { club, tenue: 'domicile' | 'exterieur', numero, nom, tete: 'A'..'D', grille, leger }
 * Renvoie { root, os (nom → os), clips (nom → AnimationClip), mixer }.
 */
export async function patineur(opts) {
  const { club, tenue = 'domicile', tete = 'A', grille = false, leger = false } = opts;
  const [corps, tetes, casques, crosses, anims, clubs, masque, masqueCasque, tex] = await Promise.all([
    glb(leger ? 'joueur/joueur-leger.glb' : 'joueur/joueur.glb'),
    glb('tetes/tetes.glb'),
    glb('tetes/casque.glb'),
    glb('materiel/crosse.glb'),
    glb('animations/anim-joueur.glb'),
    json('clubs/clubs.json'),
    texture('joueur/textures/joueur_masque.png', false),
    texture('tetes/textures/casque_masque.png', false),
    textureTenue(club, tenue, opts),
  ]);
  const poses = leger ? (await glb('joueur/joueur.glb')).animations : corps.animations;
  const cfg = clubs.clubs[club][tenue];
  const root = cloneSkinned(corps.scene);
  const os = {};
  root.traverse((o) => {
    if (o.isBone) os[o.name] = o;
    if (o.isSkinnedMesh) {
      o.material = habiller(o.material, masque, cfg, tex);
      o.frustumCulled = false; // la boîte d'un maillage à squelette ne suit pas la pose
      o.castShadow = true;
    }
  });
  const piece = (scene, name) => {
    const src = scene.getObjectByName(name);
    if (!src) throw new Error(`Objet « ${name} » absent du fichier`);
    const o = src.clone(true);
    o.position.set(0, 0, 0);
    o.rotation.set(0, 0, 0);
    o.traverse((m) => m.isMesh && (m.castShadow = true));
    return o;
  };
  const head = piece(tetes.scene, `Tete_${tete}`);
  const helmet = piece(casques.scene, grille ? 'Casque_Grille' : 'Casque');
  helmet.traverse((m) => {
    // Seule la coque est teintée : la visière transparente garde sa matière.
    if (m.isMesh && !m.material.transparent) m.material = habiller(m.material, masqueCasque, { maillot: cfg.casque ?? cfg.maillot });
  });
  os.Prop_Tete.add(head, helmet);
  // Pose_Patinage : main droite en bas, donc crosse de droitier, tenue par la main du haut (gauche).
  const stick = piece(crosses.scene, 'Crosse_Droitier');
  // La crosse a son origine au sommet du manche, qui descend le long de −Y ; l'attache de la main a son axe Y
  // du petit doigt vers l'index : la crosse est donc retournée pour partir vers la main du bas.
  stick.rotation.z = Math.PI;
  os.Prop_MainGauche.add(stick);
  const clips = {};
  for (const c of [...poses, ...anims.animations]) clips[c.name] = c;
  return { root, os, clips, mixer: new THREE.AnimationMixer(root), stick, head, helmet };
}

// ---------------------------------------------------------------- patineur dans le match

/** Nom du club dans les fichiers de Blender, d'après l'identifiant de l'équipe (data/teams.js). */
const clubDe = (id) => (id === 'pontdemetz' ? 'pont-de-metz' : id);
const hex = (h) => {
  const c = new THREE.Color(h);
  return c.toArray().map((v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)); // linéaire → sRGB 0-1
};

const BRAS = ['Left', 'Right']; // indice 0 de la figurine : son côté gauche (z négatif)

/**
 * Patineur de Blender piloté par la pose calculée de figures.js : même contrat que loadPlayerModel (model.js).
 * prepare(joueurs, kits) charge les tenues des joueurs du match (textures avec numéro et nom) ; instantiate
 * est ensuite immédiat.
 */
export async function loadSkaterModel() {
  const [corps, tetes, casques, clubs, masque, masqueCasque] = await Promise.all([
    glb('joueur/joueur.glb'),
    glb('tetes/tetes.glb'),
    glb('tetes/casque.glb'),
    json('clubs/clubs.json'),
    texture('joueur/textures/joueur_masque.png', false),
    texture('tetes/textures/casque_masque.png', false),
  ]);
  const prise = corps.animations.find((c) => c.name === 'Main_Prise');

  // Squelette au repos, mesuré dans le repère de la figurine (face vers +x) : le modèle regarde vers +z.
  const sonde = new THREE.Group();
  sonde.rotation.y = Math.PI / 2;
  sonde.add(cloneSkinned(corps.scene));
  sonde.updateMatrixWorld(true);
  const rest = {};
  sonde.traverse((o) => {
    if (!o.isBone) return;
    rest[o.name] = { p: o.getWorldPosition(new THREE.Vector3()), q: o.getWorldQuaternion(new THREE.Quaternion()) };
  });
  const armature = sonde.getObjectByName('Hips').parent;
  const armQ = armature.getWorldQuaternion(new THREE.Quaternion());
  const armP = armature.getWorldPosition(new THREE.Vector3());
  const dir = (a, b) => rest[b].p.clone().sub(rest[a].p).normalize();
  const len = (a, b) => rest[a].p.distanceTo(rest[b].p);
  const hanches = rest.LeftUpLeg.p.clone().add(rest.RightUpLeg.p).multiplyScalar(0.5);
  const D0 = {};
  for (const c of BRAS) {
    D0[`${c}Arm`] = dir(`${c}Arm`, `${c}ForeArm`);
    D0[`${c}ForeArm`] = dir(`${c}ForeArm`, `${c}Hand`);
    D0[`${c}UpLeg`] = dir(`${c}UpLeg`, `${c}Leg`);
    D0[`${c}Leg`] = dir(`${c}Leg`, `${c}Foot`);
  }
  const dims = {
    thigh: len('LeftUpLeg', 'LeftLeg'),
    shin: len('LeftLeg', 'LeftFoot'),
    arm: len('LeftArm', 'LeftForeArm'),
    fore: len('LeftForeArm', 'LeftHand'),
    hipZ: Math.abs(rest.LeftUpLeg.p.z - rest.RightUpLeg.p.z) / 2,
    ankle: rest.LeftFoot.p.y,
    shX: rest.LeftArm.p.x - hanches.x,
    shY: rest.LeftArm.p.y - hanches.y,
    shZ: Math.abs(rest.LeftArm.p.z - rest.RightArm.p.z) / 2,
    neckY: rest.Neck.p.y - hanches.y,
    grip: 0.32,
  };
  dims.k = (dims.thigh + dims.shin + dims.ankle) / 1.05;

  const pretes = new Map(); // identifiant du joueur → { texture, couleurs }
  /** Charge les tenues des joueurs du match : seules celles des deux équipes sont en mémoire. */
  async function prepare(players, kits, teams) {
    for (const t of pretes.values()) t.texture.dispose();
    pretes.clear();
    await Promise.all(
      players.filter((p) => !p.goalie).map(async (p) => {
        const kit = kits[p.team];
        const team = teams[p.team];
        const tenue = kit === team.domicile ? 'domicile' : kit === team.exterieur ? 'exterieur' : null; // sinon : tenue de secours
        const k = { club: clubDe(team.id), tenue };
        const connu = tenue && clubs.clubs[k.club];
        const couleurs = connu
          ? clubs.clubs[k.club][k.tenue]
          : { maillot: hex(kit.maillot), manches: hex(kit.epaules ?? kit.maillot), pantalon: hex(kit.pantalon), bas_de_jambe: hex(kit.bas ?? kit.pantalon), casque: hex(kit.casque) };
        const tex = await textureTenue(connu ? k.club : null, connu ? k.tenue : null, { numero: p.num, nom: p.name, taille: 1024, fond: couleurs.maillot, encre: connu ? null : kit.numero });
        pretes.set(p.id, { texture: tex, couleurs });
      }),
    );
  }

  const _d = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const _qi = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const UPQ = new THREE.Quaternion();

  function instantiate(kit, plain, who = {}) {
    const pret = pretes.get(who.id);
    const couleurs = pret?.couleurs ?? { maillot: hex(kit?.maillot ?? '#888888') };
    const inst = cloneSkinned(corps.scene);
    const mesh = new THREE.Group();
    mesh.rotation.y = Math.PI / 2;
    mesh.add(inst);
    const os = {};
    inst.traverse((o) => {
      if (o.isBone) os[o.name] = o;
      if (o.isSkinnedMesh) {
        o.material = habiller(o.material, masque, couleurs, pret?.texture ?? null);
        o.frustumCulled = false;
        o.castShadow = true;
      }
    });
    // Mains refermées sur le manche : la pose de main de Blender ne touche que les doigts.
    if (prise) {
      for (const t of prise.tracks) {
        const [nom, prop] = t.name.split('.');
        if (prop === 'quaternion' && /Hand(Thumb|Index|Middle|Ring|Pinky)/.test(nom) && os[nom]) os[nom].quaternion.fromArray(t.values);
      }
    }
    const piece = (scene, name) => {
      const o = scene.getObjectByName(name).clone(true);
      o.position.set(0, 0, 0);
      o.rotation.set(0, 0, 0);
      o.traverse((m) => m.isMesh && (m.castShadow = true));
      return o;
    };
    const n = who.id ?? 0;
    const casque = piece(casques.scene, n % 3 === 2 ? 'Casque_Grille' : 'Casque');
    casque.traverse((m) => {
      if (m.isMesh && !m.material.transparent) m.material = habiller(m.material, masqueCasque, { maillot: couleurs.casque ?? couleurs.maillot });
    });
    os.Prop_Tete.add(piece(tetes.scene, `Tete_${'ABCD'[n % 4]}`), casque);

    // Pose d'un os dans le repère de la figurine, connaissant celle de son parent.
    const W = {}; // nom → { q, p } de l'image en cours
    const cell = (name) => (W[name] ??= { q: new THREE.Quaternion(), p: new THREE.Vector3() });
    const put = (name, parent, q, p) => {
      const w = cell(name);
      w.q.copy(q);
      w.p.copy(p);
      _qi.copy(parent.q).invert();
      os[name].quaternion.copy(_qi).multiply(q);
      os[name].position.copy(p).sub(parent.p).applyQuaternion(_qi);
      return w;
    };
    // Os non piloté : il suit rigidement un ancêtre piloté (delta d appliqué à sa pose de repos).
    const rigid = (name, anc, ancRest) => {
      const w = cell(name);
      _q.copy(anc.q).multiply(_qi.copy(rest[ancRest].q).invert()); // rotation de l'ancêtre depuis le repos
      w.q.copy(_q).multiply(rest[name].q);
      w.p.copy(rest[name].p).sub(rest[ancRest].p).applyQuaternion(_q).add(anc.p);
      return w;
    };
    const ARM = { q: armQ, p: armP };
    const aim = (name, parent, from, to) => {
      _d.subVectors(to, from);
      const l = _d.length() || 1e-4;
      _q.setFromUnitVectors(D0[name], _d.divideScalar(l)).multiply(rest[name].q);
      return put(name, parent, _q.clone(), from);
    };
    const tmpQ = new THREE.Quaternion();
    const tmpP = new THREE.Vector3();

    /** Pose les os d'après les articulations calculées par poseFigure (u = userData de la figurine). */
    function drive(u) {
      UPQ.copy(u.upper.quaternion);
      // Bassin : le milieu des hanches du modèle vient sur le bassin de la figurine.
      tmpQ.copy(UPQ).multiply(rest.Hips.q);
      tmpP.copy(rest.Hips.p).sub(hanches).applyQuaternion(UPQ).add(u.upper.position);
      const hips = put('Hips', ARM, tmpQ, tmpP);
      // Tête : elle suit le buste, plus le hochement de la figurine.
      const neck = rigid('Neck', hips, 'Hips');
      tmpQ.copy(UPQ).multiply(_q.setFromEuler(_e.set(0, 0, u.headPivot.rotation.z))).multiply(rest.Head.q);
      const hw = rigid('Head', hips, 'Hips');
      put('Head', neck, tmpQ, tmpP.copy(hw.p));
      u.legs.forEach((L, i) => {
        const c = BRAS[i];
        const thigh = aim(`${c}UpLeg`, hips, L.hip, L.kneeP);
        const shin = aim(`${c}Leg`, thigh, L.kneeP, L.foot);
        // Patin à plat sur la piste, tourné comme la foulée ; au sol (chute, genou) il suit le tibia.
        if (L.flat) tmpQ.setFromEuler(_e.set(0, L.yaw, 0)).multiply(rest[`${c}Foot`].q);
        else tmpQ.copy(shin.q).multiply(_qi.copy(rest[`${c}Leg`].q).invert()).multiply(rest[`${c}Foot`].q);
        put(`${c}Foot`, shin, tmpQ, L.foot);
      });
      u.arms.forEach((A, i) => {
        const c = BRAS[i];
        const clav = rigid(`${c}Shoulder`, hips, 'Hips');
        const arm = aim(`${c}Arm`, clav, A.sh, A.el);
        const fore = aim(`${c}ForeArm`, arm, A.el, A.ha);
        tmpQ.copy(fore.q).multiply(_qi.copy(rest[`${c}ForeArm`].q).invert()).multiply(rest[`${c}Hand`].q);
        put(`${c}Hand`, fore, tmpQ, A.ha);
      });
    }

    // Le numéro et le nom sont dans la texture de la tenue : la figurine n'a pas à poser les siens.
    return { mesh, bones: [], dims, drive, numeros: true, backX: 0, chestX: 0, numY: 0 };
  }

  return { instantiate, prepare, dims };
}
