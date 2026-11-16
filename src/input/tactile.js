// Commandes au doigt (téléphone, tablette) : un manche qui apparaît sous le pouce dans la moitié gauche de
// l'écran, trois gros boutons à droite (jeu simple) et un bouton Pause. Ce fichier ne fait que lire les doigts :
// le double rôle des boutons est décidé par la logique du match (cfg.simple).

/** Vrai sur un écran qu'on touche du doigt (téléphone, tablette). `?tactile=1` le force, pour les essais. */
export function estTactile() {
  if (new URLSearchParams(location.search).has('tactile')) return new URLSearchParams(location.search).get('tactile') !== '0';
  return matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0;
}

const RAYON = 56; // course du manche, en pixels

export class Tactile {
  /** @param {HTMLElement} racine le calque #tactile (zone du manche, trois boutons, pause) */
  constructor(racine) {
    this.racine = racine;
    this.zone = racine.querySelector('.zone');
    this.socle = racine.querySelector('.socle');
    this.pouce = racine.querySelector('.pouce');
    this.mx = 0;
    this.my = 0;
    this.tenus = { tir: false, passe: false, geste: false };
    this.pause = false;
    this.doigt = null; // doigt qui tient le manche
    const stop = (e) => e.preventDefault();
    this.zone.addEventListener('pointerdown', (e) => {
      if (this.doigt != null) return;
      stop(e);
      this.doigt = e.pointerId;
      this.zone.setPointerCapture(e.pointerId);
      this.ox = e.clientX;
      this.oy = e.clientY;
      this.socle.hidden = false;
      this.socle.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      this.bouger(e);
    });
    this.zone.addEventListener('pointermove', (e) => e.pointerId === this.doigt && this.bouger(e));
    const lacher = (e) => {
      if (e.pointerId !== this.doigt) return;
      this.doigt = null;
      this.mx = this.my = 0;
      this.socle.hidden = true;
    };
    this.zone.addEventListener('pointerup', lacher);
    this.zone.addEventListener('pointercancel', lacher);
    for (const b of racine.querySelectorAll('button[data-b]')) {
      const k = b.dataset.b;
      const tenir = (v) => (e) => {
        stop(e);
        this.tenus[k] = v;
        b.classList.toggle('tenu', v);
      };
      b.addEventListener('pointerdown', (e) => {
        b.setPointerCapture(e.pointerId);
        tenir(true)(e);
      });
      b.addEventListener('pointerup', tenir(false));
      b.addEventListener('pointercancel', tenir(false));
    }
    racine.querySelector('.pause').addEventListener('click', () => (this.pause = true));
    // Pas de menu au doigt long, pas de zoom ni de défilement pendant le match.
    racine.addEventListener('contextmenu', stop);
    racine.addEventListener('touchmove', stop, { passive: false });
  }

  bouger(e) {
    let dx = e.clientX - this.ox;
    let dy = e.clientY - this.oy;
    const d = Math.hypot(dx, dy);
    if (d > RAYON) {
      // Le socle suit le pouce quand il dépasse la course : on ne « perd » jamais le manche.
      this.ox += (dx / d) * (d - RAYON);
      this.oy += (dy / d) * (d - RAYON);
      this.socle.style.transform = `translate(${this.ox}px, ${this.oy}px)`;
      dx = (dx / d) * RAYON;
      dy = (dy / d) * RAYON;
    }
    this.pouce.style.transform = `translate(${dx}px, ${dy}px)`;
    const k = Math.min(1, d / RAYON);
    this.mx = k < 0.18 ? 0 : dx / RAYON;
    this.my = k < 0.18 ? 0 : dy / RAYON;
  }

  /** Montre ou cache les commandes ; `avecPalet` change le nom des trois boutons. */
  afficher(visible, avecPalet = false) {
    this.racine.hidden = !visible;
    if (!visible) {
      this.mx = this.my = 0;
      this.tenus.tir = this.tenus.passe = this.tenus.geste = false;
      this.doigt = null;
      this.socle.hidden = true;
      return;
    }
    if (this.palet === avecPalet) return;
    this.palet = avecPalet;
    const noms = avecPalet ? { tir: 'Tir', passe: 'Passe', geste: 'Esquive' } : { tir: 'Voler', passe: 'Changer', geste: 'Charge' };
    for (const b of this.racine.querySelectorAll('button[data-b]')) b.textContent = noms[b.dataset.b];
  }

  takePause() {
    const p = this.pause;
    this.pause = false;
    return p;
  }
}
