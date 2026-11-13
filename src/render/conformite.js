// Contrôle de conformité d'un fichier .glb au cahier de production 3D (docs/3d/brief-blender.md).
// Ne dépend ni de Three.js ni du navigateur : sert à la page tools/modele.html, à l'outil en ligne de
// commande tools/modele/controle.mjs et aux tests.

const DOIGTS = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];

/** Squelette imposé (§ 4) : nom de l'os → nom du parent (null pour la racine). */
export function squelette() {
  const os = { Hips: null, Spine: 'Hips', Spine1: 'Spine', Spine2: 'Spine1', Neck: 'Spine2', Head: 'Neck' };
  for (const c of ['Left', 'Right']) {
    os[`${c}Shoulder`] = 'Spine2';
    os[`${c}Arm`] = `${c}Shoulder`;
    os[`${c}ForeArm`] = `${c}Arm`;
    os[`${c}Hand`] = `${c}ForeArm`;
    for (const d of DOIGTS) {
      os[`${c}Hand${d}1`] = `${c}Hand`;
      os[`${c}Hand${d}2`] = `${c}Hand${d}1`;
      os[`${c}Hand${d}3`] = `${c}Hand${d}2`;
    }
    os[`${c}UpLeg`] = 'Hips';
    os[`${c}Leg`] = `${c}UpLeg`;
    os[`${c}Foot`] = `${c}Leg`;
    os[`${c}ToeBase`] = `${c}Foot`;
  }
  return os;
}

/** Os d'attache sans poids (§ 4) : nom → parent. */
export const ATTACHES = { Prop_MainDroite: 'RightHand', Prop_MainGauche: 'LeftHand', Prop_Tete: 'Head' };

/** Budgets par pièce (§ 3) : triangles, côté de texture, squelette attendu, hauteur attendue en mètres. */
export const PIECES = {
  joueur: { triangles: 18000, texture: 2048, squelette: true, hauteur: [1.45, 1.75] },
  'joueur-leger': { triangles: 5000, texture: 2048, squelette: true, hauteur: [1.45, 1.75] },
  gardien: { triangles: 22000, texture: 2048, squelette: true, hauteur: [1.45, 1.8] },
  arbitre: { triangles: 18000, texture: 2048, squelette: true, hauteur: [1.45, 1.75] },
  tetes: { triangles: 3000, texture: 1024, parMaillage: true },
  casque: { triangles: 2500, texture: 1024, parMaillage: true },
  jambiere: { triangles: 3000, texture: 1024 },
  mitaine: { triangles: 3000, texture: 1024 },
  bouclier: { triangles: 3000, texture: 1024 },
  crosse: { triangles: 1200, texture: 512, parMaillage: true },
  palet: { triangles: 200, texture: 256 },
  cage: { triangles: 3000, texture: 1024 },
  public: { triangles: 600, texture: 512, parMaillage: true },
  salle: { triangles: 150000, texture: 2048, textures: 6 },
};

/** Pièce du cahier d'après le nom du fichier (« joueur.glb », « joueur_v2.glb »…), ou null. */
export function pieceDe(nom) {
  const n = nom.toLowerCase().replace(/^.*[\\/]/, '').replace(/\.glb$/, '');
  return Object.keys(PIECES).sort((a, b) => b.length - a.length).find((p) => n.startsWith(p)) ?? null;
}

/** Sépare un .glb (ArrayBuffer) en description JSON et bloc binaire. */
export function lireGlb(buffer) {
  const v = new DataView(buffer);
  if (v.byteLength < 20 || v.getUint32(0, true) !== 0x46546c67) throw new Error("Ce fichier n'est pas un .glb.");
  let json = null;
  let bin = null;
  for (let o = 12; o + 8 <= v.byteLength; ) {
    const len = v.getUint32(o, true);
    const type = v.getUint32(o + 4, true);
    const part = new Uint8Array(buffer, o + 8, len);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(part));
    else if (type === 0x004e4942) bin = part;
    o += 8 + len;
  }
  if (!json) throw new Error('Le .glb ne contient pas de description.');
  return { json, bin, poids: v.byteLength };
}

const COMPOSANTES = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const LECTURE = {
  5120: ['getInt8', 1], 5121: ['getUint8', 1], 5122: ['getInt16', 2], 5123: ['getUint16', 2],
  5125: ['getUint32', 4], 5126: ['getFloat32', 4],
};

function accesseur(json, bin, i) {
  const a = json.accessors?.[i];
  const bv = a && json.bufferViews?.[a.bufferView];
  if (!a || !bv || !bin) return null;
  const [lire, taille] = LECTURE[a.componentType];
  const n = COMPOSANTES[a.type];
  const pas = bv.byteStride || n * taille;
  const v = new DataView(bin.buffer, bin.byteOffset + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0));
  const out = new Array(a.count * n);
  for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) out[k * n + c] = v[lire](k * pas + c * taille, true);
  return out;
}

/** Largeur et hauteur d'une image PNG ou JPEG d'après son en-tête. */
function tailleImage(o) {
  const v = new DataView(o.buffer, o.byteOffset, o.byteLength);
  if (o[0] === 0x89 && o[1] === 0x50) return [v.getUint32(16), v.getUint32(20)];
  if (o[0] === 0xff && o[1] === 0xd8) {
    for (let p = 2; p + 9 < o.length; ) {
      if (o[p] !== 0xff) return null;
      const m = o[p + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [v.getUint16(p + 7), v.getUint16(p + 5)];
      p += 2 + v.getUint16(p + 2);
    }
  }
  return null;
}

const ascii = (s) => /^[A-Za-z0-9_.-]+$/.test(s);
const pow2 = (n) => n > 0 && (n & (n - 1)) === 0;

/**
 * Contrôle un .glb déjà lu. Renvoie { piece, chiffres, erreurs, avertissements, animations }.
 * Une erreur empêche le jeu d'utiliser le fichier ; un avertissement est à corriger mais ne bloque pas.
 */
export function controler({ json, bin, poids }, piece) {
  const erreurs = [];
  const avertissements = [];
  const regle = PIECES[piece] ?? null;
  if (!regle) avertissements.push(`Pièce « ${piece} » inconnue du cahier : seuls les contrôles généraux sont faits.`);
  const noeuds = json.nodes ?? [];
  const parent = new Map();
  noeuds.forEach((n, i) => (n.children ?? []).forEach((c) => parent.set(c, i)));
  const nom = (i) => noeuds[i]?.name ?? `(nœud ${i})`;

  // Compression et extensions (§ 3).
  for (const e of json.extensionsRequired ?? json.extensionsUsed ?? []) {
    if (/draco|meshopt/i.test(e)) erreurs.push(`Compression interdite : ${e}.`);
  }

  // Triangles, par maillage et au total.
  const parMaillage = [];
  let triangles = 0;
  let influences8 = false;
  for (const m of json.meshes ?? []) {
    let t = 0;
    for (const p of m.primitives ?? []) {
      const mode = p.mode ?? 4;
      const n = json.accessors?.[p.indices ?? p.attributes?.POSITION]?.count ?? 0;
      t += mode === 4 ? n / 3 : mode === 5 || mode === 6 ? Math.max(0, n - 2) : 0;
      if (p.attributes?.JOINTS_1 !== undefined) influences8 = true;
    }
    parMaillage.push({ nom: m.name ?? '(sans nom)', triangles: Math.round(t) });
    triangles += Math.round(t);
  }
  if (influences8) erreurs.push('Plus de quatre influences par sommet (attribut JOINTS_1 présent).');
  if (regle) {
    if (regle.parMaillage) {
      for (const m of parMaillage) {
        if (m.triangles > regle.triangles) erreurs.push(`Maillage « ${m.nom} » : ${m.triangles} triangles, budget ${regle.triangles}.`);
      }
    } else if (triangles > regle.triangles) erreurs.push(`${triangles} triangles, budget ${regle.triangles}.`);
  }

  // Noms (§ 3) : ASCII, sans espace ni accent.
  const mauvais = [...noeuds, ...(json.meshes ?? []), ...(json.materials ?? []), ...(json.animations ?? [])]
    .map((x) => x.name)
    .filter((n) => n && !ascii(n));
  if (mauvais.length) avertissements.push(`Noms avec espace, accent ou caractère spécial : ${[...new Set(mauvais)].slice(0, 8).join(', ')}.`);

  // Échelle appliquée.
  const echelle = noeuds.filter((n) => n.scale && n.scale.some((s) => Math.abs(s - 1) > 1e-3)).map((n) => n.name ?? '?');
  if (echelle.length) erreurs.push(`Échelle non appliquée sur : ${echelle.slice(0, 6).join(', ')}.`);

  // Textures (§ 3 et budgets).
  const textures = [];
  for (const im of json.images ?? []) {
    const bv = json.bufferViews?.[im.bufferView];
    if (!bv || !bin) {
      erreurs.push(`Texture « ${im.name ?? im.uri ?? '?'} » non embarquée dans le fichier.`);
      continue;
    }
    const t = tailleImage(bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength));
    if (!t) {
      avertissements.push(`Texture « ${im.name ?? '?'} » : format non reconnu (PNG ou JPEG attendu).`);
      continue;
    }
    textures.push({ nom: im.name ?? '(sans nom)', largeur: t[0], hauteur: t[1], type: im.mimeType ?? '' });
    if (t[0] !== t[1] || !pow2(t[0])) erreurs.push(`Texture « ${im.name ?? '?'} » : ${t[0]} × ${t[1]}, il faut un carré en puissance de deux.`);
    else if (regle && t[0] > regle.texture) erreurs.push(`Texture « ${im.name ?? '?'} » : ${t[0]} px, budget ${regle.texture}.`);
  }
  if (regle?.textures && textures.length > regle.textures) avertissements.push(`${textures.length} textures, ${regle.textures} prévues.`);

  // Hauteur et pose au sol, d'après les bornes des positions (valable pour un fichier aux transformations appliquées).
  let bas = Infinity;
  let haut = -Infinity;
  for (const m of json.meshes ?? []) {
    for (const p of m.primitives ?? []) {
      const a = json.accessors?.[p.attributes?.POSITION];
      if (a?.min && a?.max) {
        bas = Math.min(bas, a.min[1]);
        haut = Math.max(haut, a.max[1]);
      }
    }
  }
  const hauteur = haut > bas ? haut - bas : null;
  if (regle?.hauteur && hauteur !== null) {
    if (Math.abs(bas) > 0.03) erreurs.push(`L'origine n'est pas au sol : le point le plus bas est à ${bas.toFixed(3)} m.`);
    if (hauteur < regle.hauteur[0] || hauteur > regle.hauteur[1]) {
      erreurs.push(`Hauteur ${hauteur.toFixed(2)} m : attendu entre ${regle.hauteur[0]} et ${regle.hauteur[1]} m sans tête ni casque (1,83 m casqué).`);
    }
  }

  // Squelette (§ 4).
  let os = 0;
  if (regle?.squelette) {
    const voulu = squelette();
    const skins = json.skins ?? [];
    if (skins.length !== 1) erreurs.push(`${skins.length} squelette(s) dans le fichier, il en faut un seul.`);
    const joints = skins[0]?.joints ?? [];
    const noms = joints.map(nom);
    const index = new Map(noeuds.map((n, i) => [n.name, i]));

    // Quels os portent des poids ?
    const pese = new Set();
    let lu = false;
    for (const m of json.meshes ?? []) {
      for (const p of m.primitives ?? []) {
        const j = accesseur(json, bin, p.attributes?.JOINTS_0);
        const w = accesseur(json, bin, p.attributes?.WEIGHTS_0);
        if (!j || !w) continue;
        lu = true;
        for (let k = 0; k < j.length; k++) if (w[k] > 0) pese.add(noms[j[k]]);
      }
    }
    os = lu ? [...pese].length : joints.length;

    const manquants = Object.keys(voulu).filter((n) => !index.has(n));
    if (manquants.length) erreurs.push(`Os manquants (${manquants.length}) : ${manquants.slice(0, 10).join(', ')}${manquants.length > 10 ? '…' : ''}.`);
    for (const [n, p] of Object.entries({ ...voulu, ...ATTACHES })) {
      if (!index.has(n) || p === null) continue;
      const reel = parent.has(index.get(n)) ? nom(parent.get(index.get(n))) : null;
      if (reel !== p) erreurs.push(`Os « ${n} » : parent « ${reel ?? 'aucun'} », attendu « ${p} ».`);
    }
    for (const n of Object.keys(ATTACHES)) {
      if (!index.has(n)) erreurs.push(`Os d'attache manquant : ${n}.`);
      else if (pese.has(n)) erreurs.push(`L'os d'attache ${n} ne doit porter aucun poids.`);
    }
    const enTrop = noms.filter((n) => !(n in voulu) && !(n in ATTACHES));
    if (enTrop.length) erreurs.push(`Os en trop dans le squelette (${enTrop.length}) : ${enTrop.slice(0, 10).join(', ')}${enTrop.length > 10 ? '…' : ''}.`);
    if (lu) {
      const sansPoids = Object.keys(voulu).filter((n) => index.has(n) && noms.includes(n) && !pese.has(n));
      if (sansPoids.length) avertissements.push(`Os sans aucun poids (${sansPoids.length}) : ${sansPoids.slice(0, 10).join(', ')}${sansPoids.length > 10 ? '…' : ''}.`);
    }
    if (parMaillage.length > 1) avertissements.push(`${parMaillage.length} maillages : un seul est attendu par personnage.`);
  }

  // Poids des sommets normalisés (échantillon).
  for (const m of json.meshes ?? []) {
    for (const p of m.primitives ?? []) {
      const w = accesseur(json, bin, p.attributes?.WEIGHTS_0);
      if (!w) continue;
      const max = json.accessors[p.attributes.WEIGHTS_0].componentType === 5126 ? 1 : json.accessors[p.attributes.WEIGHTS_0].componentType === 5121 ? 255 : 65535;
      let faux = 0;
      for (let k = 0; k < w.length; k += 4) if (Math.abs((w[k] + w[k + 1] + w[k + 2] + w[k + 3]) / max - 1) > 0.02) faux++;
      if (faux) avertissements.push(`Maillage « ${m.name ?? '?'} » : ${faux} sommets aux poids non normalisés.`);
    }
  }

  const animations = (json.animations ?? []).map((a) => {
    let duree = 0;
    for (const s of a.samplers ?? []) duree = Math.max(duree, json.accessors?.[s.input]?.max?.[0] ?? 0);
    return { nom: a.name ?? '(sans nom)', duree };
  });

  return {
    piece,
    chiffres: { triangles, maillages: parMaillage, os, textures, hauteur, poids, animations: animations.length },
    erreurs,
    avertissements,
    animations,
  };
}

/** Compte rendu en clair, une ligne par constat. */
export function rapport(r) {
  const c = r.chiffres;
  const l = [
    `Pièce : ${r.piece}`,
    `Poids : ${(c.poids / 1048576).toFixed(2)} Mo — triangles : ${c.triangles} — os porteurs de poids : ${c.os} — textures : ${c.textures.length}` +
      (c.hauteur !== null ? ` — hauteur : ${c.hauteur.toFixed(2)} m` : '') + ` — animations : ${c.animations}`,
    ...c.textures.map((t) => `  texture ${t.nom} : ${t.largeur} × ${t.hauteur} ${t.type}`),
    ...r.erreurs.map((e) => `ERREUR  ${e}`),
    ...r.avertissements.map((a) => `à revoir  ${a}`),
    r.erreurs.length ? `Non conforme : ${r.erreurs.length} erreur(s).` : 'Conforme au cahier.',
  ];
  return l.join('\n');
}
