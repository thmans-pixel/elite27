// Contrôle un ou plusieurs .glb livrés par Blender contre le cahier de production 3D.
// Usage : node tools/modele/controle.mjs joueur.glb [--piece joueur]
import { readFileSync } from 'node:fs';
import { lireGlb, controler, rapport, pieceDe } from '../../src/render/conformite.js';

const args = process.argv.slice(2);
const i = args.indexOf('--piece');
const forcee = i >= 0 ? args.splice(i, 2)[1] : null;
if (!args.length) {
  console.error('Usage : node tools/modele/controle.mjs fichier.glb [--piece joueur]');
  process.exit(2);
}
let ko = 0;
for (const f of args) {
  const b = readFileSync(f);
  const r = controler(lireGlb(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)), forcee ?? pieceDe(f) ?? f);
  console.log(`\n== ${f}\n${rapport(r)}`);
  if (r.erreurs.length) ko++;
}
process.exit(ko ? 1 : 0);
