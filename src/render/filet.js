// Filet des cages de Blender : il se gonfle là où le palet le frappe, oscille puis revient au repos.
// Affichage seulement : on lit la position du palet montré à l'écran (match, ralenti, révision vidéo, en ligne),
// le match n'en sait rien. Le maillage « Filet » porte quatre clés de forme (Fond, Gauche, Droite, Dessus), à 1
// pour le panneau poussé au maximum vers l'extérieur ; sans elles (ancienne cage), rien ne bouge.
import { GOAL_X, GOAL_HW, GOAL_DEPTH, GOAL_H } from '../sim/geometry.js';

const OMEGA = 2 * Math.PI * 3.1; // le filet oscille à 3 Hz environ
const AMORTI = 0.2; // et s'arrête en une seconde
const PRES = 0.2; // mètres : le palet touche un panneau quand il en est à moins de 20 cm
const PLEIN = 16; // m/s : un tir de cette vitesse gonfle le filet en entier
const REPOS = 0.25; // secondes entre deux coups sur le même panneau
const PAS = 1 / 120;

// Panneaux, dans le repère de la cage : d (profondeur depuis la ligne de but), l (travers, +X du fichier), h (hauteur).
// dist : distance signée au panneau (négative à l'intérieur de la cage) ; vers : vitesse vers l'extérieur ;
// dans : le palet est-il en face du panneau ?
const PANNEAUX = [
  { cle: 'Fond', dist: (d) => d - GOAL_DEPTH, vers: (vd) => vd, dans: (d, l, h) => Math.abs(l) < GOAL_HW + 0.1 && h < GOAL_H + 0.1 },
  { cle: 'Droite', dist: (d, l) => l - GOAL_HW, vers: (vd, vl) => vl, dans: (d, l, h) => d > 0.05 && d < GOAL_DEPTH + 0.1 && h < GOAL_H + 0.1 },
  { cle: 'Gauche', dist: (d, l) => -l - GOAL_HW, vers: (vd, vl) => -vl, dans: (d, l, h) => d > 0.05 && d < GOAL_DEPTH + 0.1 && h < GOAL_H + 0.1 },
  { cle: 'Dessus', dist: (d, l, h) => h - GOAL_H, vers: (vd, vl, vh) => vh, dans: (d, l) => d > 0.05 && d < GOAL_DEPTH + 0.1 && Math.abs(l) < GOAL_HW + 0.1 },
];

/** Part du gonflement complet pour un palet qui arrive à cette vitesse (m/s). */
const force = (vitesse) => Math.min(1, Math.max(0.08, vitesse / PLEIN));
function frapper(p, coup) {
  if (Math.abs(coup * OMEGA) > Math.abs(p.v)) p.v = coup * OMEGA;
  p.repos = Math.max(p.repos, REPOS);
}

export class Filets {
  /** cages : [{ side, objet }] (side : +1 ou -1, bout de la piste ; objet : la cage posée dans la scène). */
  constructor(cages) {
    this.cages = [];
    for (const { side, objet } of cages) {
      const filet = objet.getObjectByName('Filet');
      const dico = filet?.morphTargetDictionary;
      if (!filet?.morphTargetInfluences || !dico) continue;
      const panneaux = PANNEAUX.filter((p) => p.cle in dico).map((p) => ({ ...p, i: dico[p.cle], x: 0, v: 0, repos: 0, prevu: null }));
      if (panneaux.length) this.cages.push({ side, filet, panneaux });
    }
    this.avant = null;
    this.vits = [];
  }

  /**
   * x, y, z : palet montré à l'écran, dans le repère du jeu ; dt : temps de jeu écoulé depuis l'image précédente
   * (ralenti compris ; 0 si l'image est figée).
   */
  update(x, y, z, dt) {
    const a = this.avant;
    this.avant = { x, y, z };
    if (!this.cages.length || !(dt > 1e-4)) return;
    // Vitesse du palet à l'écran ; un saut (remise en jeu, début d'un ralenti) n'est pas un tir.
    const saut = !a || Math.hypot(x - a.x, y - a.y, z - a.z) > 1.5;
    const v = saut ? { x: 0, y: 0, z: 0 } : { x: (x - a.x) / dt, y: (y - a.y) / dt, z: (z - a.z) / dt };
    const vite = Math.hypot(v.x, v.y, v.z);
    // Vitesses des images précédentes. Sur un but, la logique pose le palet d'un coup dans la cage : la dernière
    // image avant l'arrêt montre ce déplacement, pas le tir. La vraie vitesse du tir est celle d'avant.
    const [v1, v2] = this.vits;
    const lance = v2 && Math.hypot(v2.x, v2.y, v2.z) > 1 ? v2 : v1 && Math.hypot(v1.x, v1.y, v1.z) > 1 ? v1 : null;
    this.vits = saut ? [] : [v, v1];
    for (const c of this.cages) {
      const d = c.side * x - GOAL_X;
      const l = c.side * y;
      if (!saut && vite > 1) {
        // Palet qui arrive sur un panneau par l'extérieur (tir à côté, au-dessus, derrière) : le filet s'enfonce,
        // plus faiblement. De l'intérieur, il n'y a que les buts, traités plus bas.
        for (const p of c.panneaux) {
          const dist = p.dist(d, l, z);
          const vers = p.vers(c.side * v.x, c.side * v.y, v.z);
          if (p.repos > 0 || dist <= 0 || vers > -1 || dist > PRES - vers * dt || !p.dans(d, l, z)) continue;
          frapper(p, -0.4 * force(-vers));
        }
      } else if (lance && vite <= 1 && !saut && d > 0 && d < GOAL_DEPTH && Math.abs(l) < GOAL_HW && z < GOAL_H) {
        // But : la logique arrête le palet sur la ligne. Le filet réagit comme si le palet avait fini sa course :
        // on prolonge sa trajectoire jusqu'au premier panneau, qui se gonfle au moment où il l'aurait touché.
        const vd = c.side * lance.x;
        const vl = c.side * lance.y;
        let premier = null;
        for (const p of c.panneaux) {
          const vers = p.vers(vd, vl, lance.z);
          if (vers <= 0.5) continue;
          const t = -p.dist(d, l, z) / vers;
          if (t >= 0 && (!premier || t < premier.t)) premier = { p, t };
        }
        if (premier && premier.p.repos <= 0) {
          premier.p.prevu = { dans: premier.t, coup: force(Math.hypot(vd, vl, lance.z)) };
          premier.p.repos = REPOS + premier.t;
        }
        this.vits = [];
      }
      for (const p of c.panneaux) {
        p.repos -= dt;
        if (p.prevu && (p.prevu.dans -= dt) <= 0) {
          frapper(p, p.prevu.coup);
          p.prevu = null;
        }
      }
      // Ressort amorti, par petits pas pour rester stable quand l'image traîne.
      for (const p of c.panneaux) {
        if (p.x === 0 && p.v === 0) continue;
        for (let t = dt; t > 0; t -= PAS) {
          const h = Math.min(PAS, t);
          p.v += (-OMEGA * OMEGA * p.x - 2 * AMORTI * OMEGA * p.v) * h;
          p.x += p.v * h;
        }
        if (Math.abs(p.x) < 0.002 && Math.abs(p.v) < 0.02) p.x = p.v = 0;
        c.filet.morphTargetInfluences[p.i] = Math.max(-0.5, Math.min(1.1, p.x));
      }
    }
  }
}
