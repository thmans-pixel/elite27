// Commandes clavier et manette. Les touches sont repérées par leur position physique :
// Z Q S D d'un clavier AZERTY sont les mêmes touches que W A S D d'un clavier QWERTY.
const KEYS = [
  { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], pass: ['KeyF'], shoot: ['KeyG'], steal: ['KeyH'], sw: ['KeyR'] },
  { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], pass: ['KeyK'], shoot: ['KeyL'], steal: ['Semicolon', 'KeyM'], sw: ['KeyI'] },
];
const DEAD = 0.22;

export class Input {
  constructor() {
    this.down = new Set();
    this.solo = true;
    this.pausePressed = false;
    this._kd = (e) => {
      if (e.repeat) return;
      this.down.add(e.code);
      if (e.code === 'Escape' || e.code === 'KeyP') this.pausePressed = true;
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    };
    this._ku = (e) => this.down.delete(e.code);
    this._blur = () => this.down.clear();
    window.addEventListener('keydown', this._kd);
    window.addEventListener('keyup', this._ku);
    window.addEventListener('blur', this._blur);
  }

  any(codes) {
    return codes.some((c) => this.down.has(c));
  }

  /** Commandes du joueur i (0 ou 1), au format attendu par la logique. « Haut » éloigne de la caméra. */
  read(i) {
    const k = KEYS[i];
    let mx = (this.any(k.right) ? 1 : 0) - (this.any(k.left) ? 1 : 0);
    let my = (this.any(k.down) ? 1 : 0) - (this.any(k.up) ? 1 : 0);
    let pass = this.any(k.pass);
    let shoot = this.any(k.shoot);
    let steal = this.any(k.steal);
    let sw = this.any(k.sw);
    if (i === 0 && this.solo) {
      // Seul, le joueur 1 peut aussi se déplacer avec les flèches.
      const a = KEYS[1];
      mx += (this.any(a.right) ? 1 : 0) - (this.any(a.left) ? 1 : 0);
      my += (this.any(a.down) ? 1 : 0) - (this.any(a.up) ? 1 : 0);
      mx = Math.max(-1, Math.min(1, mx));
      my = Math.max(-1, Math.min(1, my));
    }
    const pad = (navigator.getGamepads ? navigator.getGamepads() : [])[i];
    if (pad && pad.connected) {
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      const b = (n) => !!pad.buttons[n]?.pressed;
      if (Math.hypot(ax, ay) > DEAD) {
        mx = ax;
        my = ay;
      } else if (b(12) || b(13) || b(14) || b(15)) {
        mx = (b(15) ? 1 : 0) - (b(14) ? 1 : 0);
        my = (b(13) ? 1 : 0) - (b(12) ? 1 : 0);
      }
      pass = pass || b(0);
      shoot = shoot || b(2);
      steal = steal || b(1);
      sw = sw || b(4);
      if (b(9) && !this._startHeld) this.pausePressed = true;
      this._startHeld = b(9);
    }
    return { mx, my, pass, shoot, steal, sw };
  }

  takePause() {
    const p = this.pausePressed;
    this.pausePressed = false;
    return p;
  }

  padCount() {
    return [...(navigator.getGamepads ? navigator.getGamepads() : [])].filter((p) => p && p.connected).length;
  }
}
