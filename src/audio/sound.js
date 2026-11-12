// Sons du match, fabriqués à la volée (Web Audio) : aucun fichier son. Le module écoute les événements de la
// logique (state.events) et ne modifie jamais l'état du match.

export class Sound {
  constructor() {
    this.ctx = null;
    this.on = true;
    this.crowd = null;
    this.excite = 0;
  }

  /** À appeler sur un geste du joueur (clic, touche) : le navigateur n'autorise le son qu'à ce moment-là. */
  start(on = true) {
    this.on = on;
    if (!on) return this.stop();
    try {
      this.ctx ??= new (window.AudioContext || window.webkitAudioContext)();
      this.ctx.resume();
    } catch {
      this.ctx = null; // pas de son sur ce navigateur : le jeu continue sans
      return;
    }
    if (!this.master) {
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.ctx.destination);
      this.noiseBuf = this.makeNoise(2);
      this.startCrowd();
    }
    this.master.gain.setTargetAtTime(1, this.ctx.currentTime, 0.05);
  }

  stop() {
    if (this.master) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
  }

  makeNoise(seconds) {
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * seconds, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; // hasard d'affichage, pas de la logique
    return buf;
  }

  /** Souffle filtré : la matière des chocs, des patins et du public. */
  noise(t, dur, { freq = 1000, q = 1, gain = 0.3, type = 'bandpass', attack = 0.003, to = null } = {}) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  tone(t, dur, { freq = 440, to = null, gain = 0.2, type = 'sine', attack = 0.005, vibrato = 0, vibRate = 0 } = {}) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    if (vibrato) {
      const l = this.ctx.createOscillator();
      const lg = this.ctx.createGain();
      l.frequency.value = vibRate;
      lg.gain.value = vibrato;
      l.connect(lg).connect(o.frequency);
      l.start(t);
      l.stop(t + dur + 0.05);
    }
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.setValueAtTime(gain, t + Math.max(attack, dur - 0.04));
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Sifflet à roulette : deux notes proches qui battent, avec un trille. */
  whistle(t, dur) {
    this.tone(t, dur, { freq: 2850, gain: 0.11, type: 'square', vibrato: 140, vibRate: 34 });
    this.tone(t, dur, { freq: 3020, gain: 0.08, type: 'square', vibrato: 140, vibRate: 34 });
    this.noise(t, dur, { freq: 3000, q: 4, gain: 0.05 });
  }

  /** Trompe de but : accord grave et rauque. */
  horn(t, dur) {
    for (const f of [146, 185, 220, 293]) this.tone(t, dur, { freq: f, gain: 0.07, type: 'sawtooth', attack: 0.04 });
  }

  startCrowd() {
    // Rumeur du gymnase : souffle grave en continu, dont le volume suit l'action.
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 520;
    f.Q.value = 0.5;
    const g = this.ctx.createGain();
    g.gain.value = 0.03;
    src.connect(f).connect(g).connect(this.master);
    src.start();
    this.crowd = g;
    this.crowdFilter = f;
  }

  /** Le public réagit : n de 0 (calme) à 1 (but). */
  cheer(n) {
    this.excite = Math.max(this.excite, n);
  }

  /** À appeler à chaque image : fait retomber la rumeur du public. */
  update(dt, playing) {
    if (!this.ctx || !this.crowd) return;
    this.excite = Math.max(0, this.excite - dt * 0.35);
    const t = this.ctx.currentTime;
    this.crowd.gain.setTargetAtTime((playing ? 0.03 : 0.018) + this.excite * 0.2, t, 0.25);
    this.crowdFilter.frequency.setTargetAtTime(520 + this.excite * 900, t, 0.3);
  }

  /** Réagit à un événement de la logique. */
  onEvent(e) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime;
    switch (e.type) {
      case 'shot': {
        // Claquement de la palette sur le palet, d'autant plus sec que le tir est fort.
        const p = Math.min(1, (e.speed ?? 20) / 30);
        this.noise(t, 0.09, { freq: 1800 + 1400 * p, q: 1.2, gain: 0.25 + 0.3 * p });
        this.tone(t, 0.06, { freq: 190, to: 90, gain: 0.2 * p });
        if (p > 0.6) this.cheer(0.15);
        break;
      }
      case 'michigan':
        this.noise(t, 0.12, { freq: 2400, q: 2, gain: 0.3 });
        this.cheer(0.5);
        break;
      case 'pass':
        this.noise(t, 0.05, { freq: 1500, q: 1.5, gain: 0.16 });
        break;
      case 'pickup':
        this.noise(t, 0.035, { freq: 1100, q: 2, gain: 0.08 });
        break;
      case 'poke':
        this.noise(t, 0.04, { freq: 2600, q: 3, gain: 0.1 });
        break;
      case 'steal':
        this.noise(t, 0.05, { freq: 2100, q: 3, gain: 0.2 });
        break;
      case 'board':
        // Le palet tape la balustrade : coup sourd.
        this.noise(t, 0.12, { freq: 320, q: 1.2, gain: 0.3, type: 'lowpass' });
        this.tone(t, 0.1, { freq: 120, to: 70, gain: 0.22 });
        break;
      case 'post':
        // Poteau : tintement métallique.
        this.tone(t, 0.5, { freq: 1240, gain: 0.16, attack: 0.001 });
        this.tone(t, 0.4, { freq: 2710, gain: 0.08, attack: 0.001 });
        this.cheer(0.4);
        break;
      case 'save':
        this.noise(t, 0.1, { freq: e.part === 'mitaine' ? 700 : 420, q: 1, gain: 0.3, type: 'lowpass' });
        this.cheer(0.3);
        break;
      case 'block':
        this.noise(t, 0.08, { freq: 500, q: 1, gain: 0.25, type: 'lowpass' });
        break;
      case 'hit':
      case 'check':
        this.noise(t, 0.16, { freq: 240, q: 0.8, gain: e.type === 'hit' ? 0.4 : 0.15, type: 'lowpass' });
        if (e.type === 'hit') this.cheer(0.3);
        break;
      case 'dodge':
        // Coup de patin : roues qui crissent.
        this.noise(t, 0.14, { freq: 3200, to: 1400, q: 2.5, gain: 0.07, attack: 0.02 });
        break;
      case 'whistle':
      case 'penalty':
        this.whistle(t, 0.42);
        break;
      case 'drop':
        this.whistle(t, 0.16);
        break;
      case 'periodEnd':
      case 'final':
        this.horn(t, 1.3);
        this.whistle(t + 0.1, 0.9);
        break;
      case 'shootoutShot':
        if (e.goal) {
          this.horn(t + 0.05, 1.2);
          this.cheer(1);
        } else this.cheer(0.4);
        break;
      case 'timeout':
      case 'shootout':
      case 'shootoutSetup':
        this.whistle(t, 0.3);
        break;
      case 'goal':
        this.horn(t + 0.05, 1.6);
        this.cheer(1);
        break;
      default:
    }
  }
}
