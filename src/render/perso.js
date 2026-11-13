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

// Crosse du gardien dans le repère de Prop_MainDroite (livraison du gardien) : position (−0,606 ; −0,350 ; 0) m,
// rotation XYZ de Blender (−90° ; 45,2° ; 120°) ; le manche descend de 1,35 m le long de −Y du fichier.
const G_CROSSE = new THREE.Matrix4()
  .makeRotationFromEuler(new THREE.Euler((-90 * Math.PI) / 180, (45.2 * Math.PI) / 180, (120 * Math.PI) / 180, 'ZYX'))
  .setPosition(-0.606, -0.35, 0)
  .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
const G_HAUT = new THREE.Vector3(0, 0, 0).applyMatrix4(G_CROSSE);
const G_TALON = new THREE.Vector3(0, -1.35, 0).applyMatrix4(G_CROSSE);
const BRAS = ['Left', 'Right']; // indice 0 de la figurine : son côté gauche (z négatif)

/**
 * Patineur de Blender piloté par la pose calculée de figures.js : même contrat que loadPlayerModel (model.js).
 * prepare(joueurs, kits) charge les tenues des joueurs du match (textures avec numéro et nom) ; instantiate
 * est ensuite immédiat.
 */
export async function loadSkaterModel(kind = 'joueur') {
  const gardien = kind === 'gardien';
  const arbitre = kind === 'arbitre';
  const [corps, tetes, casques, clubs, masque, masqueCasque, materiel] = await Promise.all([
    glb(`${kind}/${kind}.glb`),
    glb('tetes/tetes.glb'),
    glb(gardien ? 'gardien/casque-gardien.glb' : arbitre ? 'arbitre/casque-arbitre.glb' : 'tetes/casque.glb'),
    json('clubs/clubs.json'),
    arbitre ? null : texture(`${kind}/textures/${kind}_masque.png`, false),
    arbitre ? null : texture(gardien ? 'gardien/textures/casque_gardien_masque.png' : 'tetes/textures/casque_masque.png', false),
    gardien ? Promise.all([glb('gardien/jambiere.glb'), glb('gardien/mitaine.glb'), glb('gardien/bouclier.glb'), texture('gardien/textures/gardien_materiel_masque.png', false)]) : null,
  ]);
  const prise = corps.animations.find((c) => c.name === 'Main_Prise');
  // Gestes enregistrés dans Blender (mêmes os) : par geste, la rotation de chaque os au fil du temps.
  const clips = {};
  {
    const anims = await glb(`animations/anim-${kind}.glb`);
    for (const c of anims.animations) {
      const os = new Map();
      for (const t of c.tracks) {
        const [nom, prop] = t.name.split('.');
        if (prop === 'scale') continue;
        if (!os.has(nom)) os.set(nom, {});
        os.get(nom)[prop === 'quaternion' ? 'q' : 'p'] = t;
      }
      clips[c.name] = { duration: c.duration, os };
    }
  }
  const JAMBES = /UpLeg|Leg$|Foot|ToeBase/;
  const DOIGTS = /Hand(Thumb|Index|Middle|Ring|Pinky)/;
  /** Valeur d'une piste à l'instant t (interpolation entre les deux images voisines). */
  const qa = new THREE.Quaternion();
  const qb = new THREE.Quaternion();
  const lire = (track, t, out, n) => {
    const T = track.times;
    let i = 0;
    while (i < T.length - 2 && T[i + 1] <= t) i++;
    const k = T.length < 2 ? 0 : Math.max(0, Math.min(1, (t - T[i]) / (T[i + 1] - T[i] || 1)));
    const j = Math.min(T.length - 1, i + 1);
    if (n === 4) out.copy(qa.fromArray(track.values, i * 4)).slerp(qb.fromArray(track.values, j * 4), k);
    else out.fromArray(track.values, i * 3).lerp(_lp.fromArray(track.values, j * 3), k);
    return out;
  };
  const _lp = new THREE.Vector3();

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
  // Orientation des os au repos dans le repère du modèle lui-même (avant la rotation vers la figurine).
  const versModele = sonde.getWorldQuaternion(new THREE.Quaternion()).invert();
  const restModele = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, { q: versModele.clone().multiply(v.q) }]));
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

  let arbitres = 0; // chaque arbitre a sa tête
  const pretes = new Map(); // identifiant du joueur → { texture, couleurs }
  /** Charge les tenues des joueurs du match : seules celles des deux équipes sont en mémoire. */
  async function prepare(players, kits, teams) {
    for (const t of pretes.values()) t.texture.dispose();
    pretes.clear();
    await Promise.all(
      players.filter((p) => !!p.goalie === gardien).map(async (p) => {
        const kit = kits[p.team];
        const team = teams[p.team];
        const tenue = kit === team.domicile ? 'domicile' : kit === team.exterieur ? 'exterieur' : null; // sinon : tenue de secours
        const k = { club: clubDe(team.id), tenue };
        const connu = tenue && clubs.clubs[k.club];
        const couleurs = connu
          ? clubs.clubs[k.club][k.tenue]
          : { maillot: hex(kit.maillot), manches: hex(kit.epaules ?? kit.maillot), pantalon: hex(kit.pantalon), bas_de_jambe: hex(kit.bas ?? kit.pantalon), casque: hex(kit.casque) };
        const tex = await textureTenue(connu ? k.club : null, connu ? k.tenue : null, { numero: p.num, nom: p.name, taille: 1024, fond: couleurs.maillot, encre: connu ? null : kit.numero });
        pretes.set(p.id, { texture: tex, couleurs: gardien && couleurs.casque_gardien ? { ...couleurs, casque: couleurs.casque_gardien } : couleurs });
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
    if (arbitre) who = { id: ++arbitres };
    const inst = cloneSkinned(corps.scene);
    const mesh = new THREE.Group();
    mesh.rotation.y = Math.PI / 2;
    mesh.add(inst);
    const os = {};
    const local0 = {}; // position de repos de chaque os dans son parent
    inst.traverse((o) => {
      if (o.isBone) {
        os[o.name] = o;
        local0[o.name] = o.position.clone();
      }
      if (o.isSkinnedMesh) {
        // L'arbitre a sa tenue peinte dans sa texture : rien à teinter.
        if (masque) o.material = habiller(o.material, masque, couleurs, pret?.texture ?? null);
        o.frustumCulled = false;
        o.castShadow = true;
      }
    });
    // Mains refermées sur le manche : la pose de main de Blender ne touche que les doigts. L'arbitre n'a pas de
    // crosse, et la main gauche du gardien est dans sa mitaine.
    if (prise && !arbitre) {
      for (const t of prise.tracks) {
        const [nom, prop] = t.name.split('.');
        if (gardien && nom.startsWith('Left')) continue;
        if (prop === 'quaternion' && /Hand(Thumb|Index|Middle|Ring|Pinky)/.test(nom) && os[nom]) os[nom].quaternion.fromArray(t.values);
      }
    }
    // Doigts de base (prise ou main au repos), repris à chaque image avant un geste enregistré.
    const doigts = Object.keys(os).filter((n) => DOIGTS.test(n)).map((n) => [os[n], os[n].quaternion.clone()]);
    const piece = (scene, name) => {
      const o = scene.getObjectByName(name).clone(true);
      o.position.set(0, 0, 0);
      o.rotation.set(0, 0, 0);
      o.traverse((m) => m.isMesh && (m.castShadow = true));
      return o;
    };
    const n = who.id ?? 0;
    const casque = piece(casques.scene, gardien ? 'Casque_Gardien' : arbitre ? 'Casque_Arbitre' : n % 3 === 2 ? 'Casque_Grille' : 'Casque');
    const teinter = (objet, m) =>
      objet.traverse((o) => {
        if (o.isMesh && !o.material.transparent) o.material = habiller(o.material, m, { maillot: couleurs.casque ?? couleurs.maillot });
      });
    if (masqueCasque) teinter(casque, masqueCasque);
    os.Prop_Tete.add(piece(tetes.scene, `Tete_${'ABCD'[n % 4]}`), casque);
    if (gardien) {
      // Jambières sur les tibias (la droite est le miroir de la gauche), mitaine à gauche, bouclier à droite.
      const [jamb, mit, bou, masqueMat] = materiel;
      const eq = { maillot: couleurs.maillot };
      for (const c of BRAS) {
        const j = piece(jamb.scene, 'Jambiere');
        j.traverse((o) => o.isMesh && (o.material = habiller(o.material, masqueMat, eq)));
        // La pièce est en repère du monde au repos (face vers +Z) : on la ramène dans le repère de l'os.
        const holder = new THREE.Group();
        holder.quaternion.copy(restModele[`${c}Leg`].q).invert();
        if (c === 'Right') j.scale.x = -1;
        holder.add(j);
        os[`${c}Leg`].add(holder);
      }
      const m = piece(mit.scene, 'Mitaine');
      const b = piece(bou.scene, 'Bouclier');
      for (const o of [m, b]) o.traverse((x) => x.isMesh && (x.material = habiller(x.material, masqueMat, eq)));
      os.Prop_MainGauche.add(m);
      os.Prop_MainDroite.add(b);
    }

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
    // Comme aim, mais la face avant de l'os (jambière) reste tournée vers l'avant du joueur.
    const X0 = new THREE.Vector3(), Z0 = new THREE.Vector3(), X1 = new THREE.Vector3(), Z1 = new THREE.Vector3(), D1 = new THREE.Vector3();
    const M0 = new THREE.Matrix4(), M1 = new THREE.Matrix4();
    const aimFacing = (name, parent, from, to) => {
      const d0 = D0[name];
      D1.subVectors(to, from).normalize();
      X0.set(1, 0, 0).addScaledVector(d0, -d0.x).normalize();
      Z0.crossVectors(X0, d0);
      X1.set(1, 0, 0).addScaledVector(D1, -D1.x);
      if (X1.lengthSq() < 1e-6) X1.set(0, 1, 0);
      X1.normalize();
      Z1.crossVectors(X1, D1);
      M0.makeBasis(X0, d0, Z0).transpose();
      M1.makeBasis(X1, D1, Z1).multiply(M0);
      _q.setFromRotationMatrix(M1).multiply(rest[name].q);
      return put(name, parent, _q.clone(), from);
    };
    const tmpQ = new THREE.Quaternion();
    const tmpP = new THREE.Vector3();

    /** Pose les os d'après les articulations calculées par poseFigure (u = userData de la figurine). */
    function drive(u) {
      UPQ.copy(u.upper.quaternion);
      const an = u.anim && clips[u.anim.name] ? u.anim : null;
      const clip = an && clips[an.name];
      for (const [b, q] of doigts) b.quaternion.copy(q);
      // Bassin : le milieu des hanches du modèle vient sur le bassin de la figurine.
      tmpQ.copy(UPQ).multiply(rest.Hips.q);
      tmpP.copy(rest.Hips.p).sub(hanches).applyQuaternion(UPQ).add(u.upper.position);
      if (clip?.os.get('Hips')) {
        // Geste enregistré : le bassin prend son inclinaison ; pour un geste du corps entier (chute), sa hauteur aussi.
        // Le déplacement horizontal de l'animation est laissé de côté : c'est le match qui place le joueur.
        const h = clip.os.get('Hips');
        tmpQ.slerp(lire(h.q, an.t, cq, 4).premultiply(armQ), an.w);
        if (an.full && h.p) {
          lire(h.p, an.t, cp, 3);
          cp.x = h.p.values[0];
          cp.z = h.p.values[2];
          tmpP.lerp(cp.applyQuaternion(armQ).add(armP), an.w);
        }
      }
      const hips = put('Hips', ARM, tmpQ, tmpP);
      // Tête : elle suit le buste, plus le hochement de la figurine.
      const neck = rigid('Neck', hips, 'Hips');
      tmpQ.copy(UPQ).multiply(_q.setFromEuler(_e.set(0, 0, u.headPivot.rotation.z))).multiply(rest.Head.q);
      const hw = rigid('Head', hips, 'Hips');
      put('Head', neck, tmpQ, tmpP.copy(hw.p));
      u.legs.forEach((L, i) => {
        const c = BRAS[i];
        const thigh = aim(`${c}UpLeg`, hips, L.hip, L.kneeP);
        const shin = (gardien ? aimFacing : aim)(`${c}Leg`, thigh, L.kneeP, L.foot);
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
      if (clip) {
        // Les autres os glissent de la pose calculée vers le geste enregistré ; un geste du haut du corps
        // laisse les jambes patiner.
        for (const [nom, tr] of clip.os) {
          const b = os[nom];
          if (!b || nom === 'Hips' || (!an.full && JAMBES.test(nom))) continue;
          if (tr.q) b.quaternion.slerp(lire(tr.q, an.t, cq, 4), an.w);
          b.position.lerp(local0[nom], an.w);
        }
        // La crosse suit la main du haut, comme dans Blender.
        const st = u.stick;
        if (st?.mesh && st.model?.place) {
          mesh.parent.updateWorldMatrix(true, false);
          // Patineur : main du haut (gauche), au sommet du manche. Gardien : main droite, à 70 cm du sommet,
          // le manche dépassant au-dessus de la main.
          const prop = gardien ? os.Prop_MainDroite : os.Prop_MainGauche;
          prop.updateWorldMatrix(true, false);
          cm.copy(mesh.parent.matrixWorld).invert().multiply(prop.matrixWorld);
          if (gardien) {
            // Crosse du gardien : décalage fixe dans la main droite, relevé dans gardien.blend.
            st.top.lerp(cp.copy(G_HAUT).applyMatrix4(cm), an.w);
            st.heel.lerp(cp.copy(G_TALON).applyMatrix4(cm), an.w);
          } else {
            cp.setFromMatrixPosition(cm);
            cd.set(0, 1, 0).transformDirection(cm);
            st.top.lerp(cp, an.w);
            st.heel.lerp(cd.multiplyScalar(st.full ?? st.len).add(cp), an.w);
          }
          st.model.place(st.mesh, st.top, st.heel, st.full ?? st.len);
        }
      }
    }
    const cq = new THREE.Quaternion();
    const cp = new THREE.Vector3();
    const cd = new THREE.Vector3();
    const cm = new THREE.Matrix4();

    // Le numéro et le nom sont dans la texture de la tenue : la figurine n'a pas à poser les siens.
    return { mesh, bones: [], dims, drive, numeros: true, equipe: gardien, backX: 0, chestX: 0, numY: 0 };
  }

  return { instantiate, prepare, dims, clips: Object.fromEntries(Object.entries(clips).map(([k, v]) => [k, v.duration])) };
}

/**
 * Crosse de Blender (objet rigide), avec le même contrat que loadStickModel : place(mesh, haut, talon, longueur).
 * Dans le fichier, l'origine est au sommet du manche, qui descend le long de −Y.
 */
export async function loadStick(gardien = false) {
  const { stickRig } = await import('./model.js');
  const g = await glb(gardien ? 'gardien/crosse-gardien.glb' : 'materiel/crosse.glb');
  const src = g.scene.getObjectByName(gardien ? 'Crosse_Gardien' : 'Crosse_Droitier');
  // Talon : le point le plus bas de l'axe du manche ; pointe : le sommet le plus éloigné de cet axe.
  let bas = 0;
  let loin = 0;
  const tip = new THREE.Vector3();
  const v = new THREE.Vector3();
  src.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(src.matrixWorld).invert();
  src.traverse((o) => {
    if (!o.isMesh) return;
    const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      const d = Math.hypot(v.x, v.z);
      if (d < 0.03) bas = Math.min(bas, v.y);
      if (d > loin) {
        loin = d;
        tip.copy(v);
      }
    }
  });
  const rig = stickRig(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, bas, 0), tip, 1);
  function instantiate() {
    const mesh = new THREE.Group();
    const o = src.clone(true);
    o.position.set(0, 0, 0);
    o.rotation.set(0, 0, 0);
    o.scale.set(1, 1, 1);
    o.traverse((m) => m.isMesh && ((m.castShadow = true), (m.frustumCulled = false)));
    mesh.add(o);
    mesh.matrixAutoUpdate = false;
    return mesh;
  }
  return { instantiate, place: rig.place };
}
