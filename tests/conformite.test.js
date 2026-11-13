import test from 'node:test';
import assert from 'node:assert/strict';
import { squelette, ATTACHES, controler, lireGlb, pieceDe, PIECES } from '../src/render/conformite.js';

/** Fabrique la description d'un personnage conforme, sans géométrie réelle. */
function personnage(change = () => {}) {
  const os = { ...squelette(), ...ATTACHES };
  const noms = Object.keys(os);
  const nodes = noms.map((name) => ({ name, children: [] }));
  for (const [n, p] of Object.entries(os)) if (p) nodes[noms.indexOf(p)].children.push(noms.indexOf(n));
  nodes.push({ name: 'Joueur', mesh: 0, skin: 0 });
  const json = {
    nodes,
    skins: [{ joints: noms.map((_, i) => i) }],
    meshes: [{ name: 'Joueur', primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [
      { count: 9000, type: 'VEC3', componentType: 5126, min: [-0.9, 0, -0.2], max: [0.9, 1.6, 0.2] },
      { count: 17000 * 3, type: 'SCALAR', componentType: 5125 },
    ],
  };
  change(json, noms);
  return { json, bin: null, poids: 1000 };
}

test('le squelette imposé compte 52 os et trois attaches', () => {
  assert.equal(Object.keys(squelette()).length, 52);
  assert.equal(Object.keys(ATTACHES).length, 3);
  assert.equal(squelette().LeftHandIndex2, 'LeftHandIndex1');
  assert.equal(squelette().RightShoulder, 'Spine2');
});

test('un personnage conforme passe sans erreur', () => {
  const r = controler(personnage(), 'joueur');
  assert.deepEqual(r.erreurs, []);
  assert.equal(r.chiffres.triangles, 17000);
});

test('os manquant, os en trop, mauvais parent et attache absente sont signalés', () => {
  const r = controler(
    personnage((j, noms) => {
      j.nodes[noms.indexOf('LeftHandPinky3')].name = 'Doigt';
      j.nodes.push({ name: 'Twist' });
      j.skins[0].joints.push(j.nodes.length - 1);
      j.nodes[noms.indexOf('Prop_Tete')].name = 'Autre';
    }),
    'joueur',
  );
  const t = r.erreurs.join('\n');
  assert.match(t, /Os manquants \(1\) : LeftHandPinky3/);
  assert.match(t, /Os en trop/);
  assert.match(t, /Twist/);
  assert.match(t, /Os d'attache manquant : Prop_Tete/);
});

test('budget de triangles, échelle, origine et compression', () => {
  const r = controler(
    personnage((j) => {
      j.accessors[1].count = 20000 * 3;
      j.accessors[0].min[1] = -0.2;
      j.nodes[0].scale = [0.01, 0.01, 0.01];
      j.extensionsRequired = ['KHR_draco_mesh_compression'];
    }),
    'joueur',
  );
  const t = r.erreurs.join('\n');
  assert.match(t, /20000 triangles, budget 18000/);
  assert.match(t, /Échelle non appliquée/);
  assert.match(t, /origine n'est pas au sol/);
  assert.match(t, /Compression interdite/);
});

test('la pièce se déduit du nom du fichier', () => {
  assert.equal(pieceDe('livraisons/joueur-leger_v3.glb'), 'joueur-leger');
  assert.equal(pieceDe('Joueur.glb'), 'joueur');
  assert.equal(pieceDe('truc.glb'), null);
  assert.ok(PIECES.salle.triangles === 150000);
});

test("un fichier qui n'est pas un .glb est refusé", () => {
  assert.throws(() => lireGlb(new ArrayBuffer(64)), /pas un \.glb/);
});
