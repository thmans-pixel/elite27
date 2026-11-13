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
export async function textureTenue(club, tenue, { numero = null, nom = null, encre = null } = {}) {
  const [img, zones, clubs] = await Promise.all([image(`clubs/tenues/${club}-${tenue}.png`), json('joueur/textures/zones-uv.json'), json('clubs/clubs.json')]);
  const c = document.createElement('canvas');
  c.width = c.height = img.width;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const cfg = clubs.clubs[club][tenue];
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
