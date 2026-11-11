// Affichage 3D d'un match : ne fait que lire l'état de la logique, sans jamais le modifier.
import * as THREE from 'three';
import { buildArena } from './arena.js';
import { makeFigure, poseFigure } from './figures.js';
import { HW, HL, DT } from '../sim/geometry.js';
import { offRinkPos } from '../sim/state.js';

const RING = ['#ffe14d', '#4de1ff'];
const REF_KIT = { maillot: '#ffffff', epaules: '#ffffff', numero: '#000000', casque: '#111111', pantalon: '#111111' };
const lerp = (a, b, t) => a + (b - a) * t;
const SHOT_T = 0.42;
const PASS_T = 0.24;
const POKE_T = 0.3;

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}

export class MatchView {
  /** kits : [tenue de l'équipe 0, tenue de l'équipe 1] */
  constructor(canvas, state, kits) {
    this.state = state;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xbfc7cf);
    this.camera = new THREE.PerspectiveCamera(34, 16 / 9, 4, 140);
    this.camX = 0;
    this.lookX = 0;
    this.lookZ = 0;
    this.zoom = 0;

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x59606b, 0.75));
    const sun = new THREE.DirectionalLight(0xfff6e8, 1.55);
    sun.position.set(-8, 30, 14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -30;
    sc.right = 30;
    sc.top = 18;
    sc.bottom = -18;
    sc.near = 5;
    sc.far = 60;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xdfe8ff, 0.35);
    fill.position.set(10, 16, -20);
    this.scene.add(fill);

    const home = state.cfg.teams[0];
    this.arena = buildArena(this.scene, { salle: home.salle });

    this.figs = state.players.map((p) => {
      const f = makeFigure(kits[p.team], { num: p.num, goalie: p.goalie });
      f.scale.setScalar(1.15);
      this.scene.add(f);
      return f;
    });
    this.prev = state.players.map((p) => ({ x: p.x, y: p.y, face: p.face }));
    // Gestes en cours, déclenchés par les événements de la logique : tir, passe, harponnage.
    this.gest = state.players.map(() => ({ shot: 0, pass: 0, poke: 0, px: 0, py: 0 }));

    this.referee = makeFigure(REF_KIT, { referee: true });
    this.referee.scale.setScalar(1.15);
    this.scene.add(this.referee);
    this.refPos = { x: 0, y: -HW + 1.4, face: Math.PI / 2, vx: 0, vy: 0 };

    this.puck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 20), new THREE.MeshStandardMaterial({ color: 0xff5a1f, roughness: 0.4, emissive: 0x7a1c00, emissiveIntensity: 0.5 }));
    this.puck.castShadow = true;
    this.scene.add(this.puck);
    this.prevPuck = { x: 0, y: 0 };

    this.resize();
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Sur un écran étroit, on élargit le champ pour garder la largeur de piste visible.
    this.camera.fov = w / h < 1.4 ? 44 : 34;
    this.camera.updateProjectionMatrix();
  }

  /** À appeler juste avant chaque pas de logique, pour interpoler entre deux pas. */
  capture() {
    const s = this.state;
    s.players.forEach((p, i) => {
      const q = this.prev[i];
      q.x = p.x;
      q.y = p.y;
      q.face = p.face;
    });
    this.prevPuck.x = s.puck.x;
    this.prevPuck.y = s.puck.y;
  }

  /** Réagit aux événements de la logique (gestes de crosse, zoom sur but). */
  onEvent(e) {
    if (e.type === 'shot') this.gest[e.by].shot = SHOT_T;
    else if (e.type === 'pass' && e.from != null) this.gest[e.from].pass = PASS_T;
    else if (e.type === 'poke') Object.assign(this.gest[e.by], { poke: POKE_T, px: e.x, py: e.y });
    else if (e.type === 'goal') this.zoom = 1;
  }

  render(alpha, dt) {
    const s = this.state;
    const k = s.puck;
    const humanSel = new Map(s.humans.map((h, i) => [h.selected, RING[i]]));
    const px = lerp(this.prevPuck.x, k.x, alpha);
    const py = lerp(this.prevPuck.y, k.y, alpha);

    s.players.forEach((p, i) => {
      const f = this.figs[i];
      if (p.status === 'out') {
        f.visible = false;
        return;
      }
      f.visible = true;
      let x;
      let y;
      let face;
      if (p.status === 'rink') {
        const q = this.prev[i];
        x = lerp(q.x, p.x, alpha);
        y = lerp(q.y, p.y, alpha);
        face = lerpAngle(q.face, p.face, alpha);
      } else {
        const o = offRinkPos(s, p);
        x = o.x;
        y = o.y;
        face = p.status === 'box' ? -Math.PI / 2 : Math.PI / 2;
      }
      const ge = this.gest[i];
      ge.shot = Math.max(0, ge.shot - dt);
      ge.pass = Math.max(0, ge.pass - dt);
      ge.poke = Math.max(0, ge.poke - dt);
      const rink = p.status === 'rink';
      poseFigure(f, {
        x,
        y,
        face,
        vx: rink ? p.vx : 0,
        vy: rink ? p.vy : 0,
        dt,
        fallen: p.stun > 0,
        charge: rink ? p.charge : 0,
        down: p.goalie && p.down > 0,
        puck: rink && k.carrier === p.id ? { x: px, y: py } : null,
        shot: ge.shot > 0 ? 1 - ge.shot / SHOT_T : null,
        pass: ge.pass > 0 ? 1 - ge.pass / PASS_T : null,
        poke: ge.poke > 0 ? { x: ge.px, y: ge.py, k: 1 - ge.poke / POKE_T } : null,
        ring: rink && s.phase !== 'final' ? humanSel.get(p.id) : null,
      });
    });

    this.puck.position.set(px, 0.02, py);

    // Arbitre : il suit le jeu le long de la balustrade du fond et lève le bras pendant l'avantage.
    const r = this.refPos;
    const tx = Math.max(-HL + 4, Math.min(HL - 4, px * 0.8));
    const nx = r.x + (tx - r.x) * Math.min(1, dt * 1.6);
    r.vx = (nx - r.x) / Math.max(dt, 1e-3);
    r.x = nx;
    r.face = Math.atan2(py - r.y, px - r.x);
    poseFigure(this.referee, { ...r, dt, armUp: s.advantage >= 0 || s.phase === 'whistle' });

    // Caméra de retransmission : elle suit le palet en travelling, côté table de marque.
    const follow = Math.min(1, dt * 2.6);
    this.camX += (Math.max(-15, Math.min(15, px * 0.72)) - this.camX) * follow;
    this.lookX += (px * 0.9 - this.lookX) * follow;
    this.lookZ += (py * 0.3 - this.lookZ) * follow;
    this.zoom = Math.max(0, this.zoom - dt * 0.28);
    const z = Math.min(1, this.zoom) * 0.22;
    this.camera.position.set(this.camX, 13.2 * (1 - z * 0.5), HW + 15.5 * (1 - z));
    this.camera.lookAt(this.lookX, 0.6, this.lookZ + 0.4);

    const mm = Math.floor(s.clock / 60);
    const ss = Math.floor(s.clock % 60);
    this.arena.setScore(s.cfg.teams[0].sigle, s.cfg.teams[1].sigle, s.score, `${mm}:${String(ss).padStart(2, '0')}`, s.period === 1 ? '1re période' : '2e période');

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
  }
}

export { DT };
