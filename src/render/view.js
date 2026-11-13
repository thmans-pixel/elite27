// Affichage 3D d'un match : ne fait que lire l'état de la logique, sans jamais le modifier.
import * as THREE from 'three';
import { buildArena } from './arena.js';
import { makeFigure, poseFigure } from './figures.js';
import { HW, HL, DT } from '../sim/geometry.js';
import { offRinkPos, periodLabel } from '../sim/state.js';
import { GOAL_X, boardInfo } from '../sim/geometry.js';
import { Crowd } from './crowd.js';

const RING = ['#ffe14d', '#4de1ff'];
const REF_KIT = { maillot: '#ffffff', epaules: '#ffffff', numero: '#000000', casque: '#111111', pantalon: '#111111' };
const lerp = (a, b, t) => a + (b - a) * t;
const SHOT_T = 0.7;
const PASS_T = 0.24;
const POKE_T = 0.3;
const FOUL_T = 0.6;
// Réaction de la victime selon la faute, et sa durée. Sans entrée ici (charge incorrecte), la chute ordinaire suffit.
const REACT = { TRE: ['fauche', 1.0], ACC: ['retenu', 0.65], CIN: ['cingle', 0.85], DOS: ['ventre', 1.2], CBA: ['balustrade', 1.1], OBS: ['vacille', 0.7] };
const SIGNAL_T = 2.4;
const newGest = () => ({ shot: 0, pass: 0, poke: 0, px: 0, py: 0, foul: null, react: null, st0: 0, fall: null, rise: 0, armed: false, frappe: false });
// Gestes enregistrés dans Blender, par situation du match.
const CHUTES = { fauche: 'Chute_Avant', ventre: 'Chute_Ventre', balustrade: 'Chute_Balustrade' };
const REACTIONS = { vacille: 'Vacille', retenu: 'Retenu', cingle: 'Cingle' };
const GESTES_FAUTIFS = { ACC: 'Accrocher', CIN: 'Cinglage', TRE: 'Faire_Trebucher' };
const RISE_T = 0.55; // le joueur se relève plus vite que dans l'animation : le match ne l'immobilise pas plus longtemps
const fondu = (t, d, entree = 0.06, sortie = 0.12) => Math.max(0, Math.min(1, t / entree, (d - t) / sortie));

/** Réglages de qualité : finesse de l'image, ombres, part du public affichée et animée. */
export const QUALITY = {
  haute: { ratio: 2, shadow: 2048, crowd: 1, animated: true },
  moyenne: { ratio: 1.5, shadow: 1024, crowd: 0.5, animated: true },
  basse: { ratio: 1, shadow: 0, crowd: 0.35, animated: false },
};
export const QUALITY_ORDER = ['haute', 'moyenne', 'basse'];

// Ralenti du but : durée d'action gardée en mémoire, vitesse de relecture.
const REPLAY_T = 3;
const REPLAY_SPEED = 0.5;
/** Ce que l'affichage lit d'un joueur : de quoi le redessiner plus tard sans toucher au match. */
const P_FIELDS = ['id', 'team', 'goalie', 'status', 'x', 'y', 'face', 'vx', 'vy', 'stun', 'charge', 'down', 'turn', 'skid', 'back', 'checkT', 'kneeling', 'dodgeT', 'ddx', 'ddy', 'slot'];

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}

export class MatchView {
  /** kits : [tenue de l'équipe 0, tenue de l'équipe 1] ; model, refModel : modèles 3D des patineurs et des arbitres (facultatifs) */
  constructor(canvas, state, kits, model = null, refModel = null, goalieModel = null, stickModel = null, goalieStickModel = null, padModel = null) {
    this.state = state;
    this.padModel = padModel;
    this.stickModel = stickModel;
    this.goalieStickModel = goalieStickModel;
    this.model = model;
    this.goalieModel = goalieModel;
    this.refModel = refModel;
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
    this.sun = sun;
    const fill = new THREE.DirectionalLight(0xdfe8ff, 0.35);
    fill.position.set(10, 16, -20);
    this.scene.add(fill);

    const home = state.cfg.teams[0];
    this.arena = buildArena(this.scene, { salle: home.salle });
    this.crowd = new Crowd(this.scene, kits[0].maillot, kits[1].maillot);
    this.time = 0;
    this.quality = 'haute';
    // Ralenti : les derniers instants du jeu, pas à pas, et la relecture en cours.
    this.tape = [];
    this.replay = null;
    this.tapeT = REPLAY_T; // secondes gardées en mémoire (le mode Arbitre en garde davantage)
    this.review = null; // révision vidéo du mode Arbitre
    this.marks = null; // joueurs entourés (mode Arbitre) : Map(id → couleur)
    this.shown = state.players; // joueurs tels qu'ils sont dessinés (pour désigner un joueur d'un clic)
    // Animations enregistrées des réactions (facultatives) : { fauche: données, ... }.
    this.clips = {};

    this.figs = state.players.map((p) => {
      const f = makeFigure(kits[p.team], { id: p.id, nom: p.name, num: p.num, goalie: p.goalie, model: p.goalie ? this.goalieModel : this.model, stickModel: p.goalie ? this.goalieStickModel : this.stickModel, padModel: this.padModel });
      f.scale.setScalar(1.15);
      this.scene.add(f);
      return f;
    });
    this.prev = state.players.map((p) => ({ x: p.x, y: p.y, face: p.face }));
    // Gestes en cours, déclenchés par les événements de la logique : tir, passe, harponnage.
    this.gest = state.players.map(newGest);


    // Deux arbitres, en diagonale : un le long de chaque balustrade, décalés de part et d'autre du jeu.
    this.referees = [
      { y: -HW + 1.2, lead: 6 },
      { y: HW - 1.0, lead: -8 },
    ].map((r) => {
      const fig = makeFigure(REF_KIT, { referee: true, model: this.refModel });
      fig.scale.setScalar(1.15);
      this.scene.add(fig);
      // todo : gestes officiels à faire, dans l'ordre ({ code, T, t, bx, by, table }).
      return { fig, pos: { x: r.lead, y: r.y, face: Math.PI / 2, vx: 0, vy: 0 }, lead: r.lead, home: r.y, todo: [] };
    });

    this.puck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 20), new THREE.MeshStandardMaterial({ color: 0xff5a1f, roughness: 0.4, emissive: 0x7a1c00, emissiveIntensity: 0.5 }));
    this.puck.castShadow = true;
    this.scene.add(this.puck);
    this.prevPuck = { x: 0, y: 0, z: 0 };

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
  /** Posture du gardien selon le danger : 0 détendu, 1 position de base (adversaire avec le palet dans sa
   * moitié), 2 position basse (palet à moins de 8 m de la cage). */
  stance(g, k = this.state.puck, phase = this.state.phase) {
    const s = { players: this.state.players };
    if (phase !== 'play') return 0;
    const mine = k.x * Math.sign(g.x) > 0;
    const c = k.carrier >= 0 ? s.players[k.carrier] : null;
    const threat = c ? c.team !== g.team : k.lastTeam !== g.team;
    if (!mine || !threat) return 0;
    return Math.hypot(k.x - g.x, k.y - g.y) < 8 ? 2 : 1;
  }

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
    this.prevPuck.z = s.puck.z;
  }

  /** Donne les animations enregistrées des réactions : { nom de la réaction: données du fichier }. */
  setClips(clips) {
    this.clips = clips ?? {};
  }

  /** Applique un réglage de qualité ('haute', 'moyenne', 'basse'). */
  setQuality(name) {
    const q = QUALITY[name] ?? QUALITY.haute;
    this.quality = QUALITY[name] ? name : 'haute';
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.ratio));
    this.sun.castShadow = q.shadow > 0;
    if (q.shadow > 0 && this.sun.shadow.mapSize.x !== q.shadow) {
      this.sun.shadow.mapSize.set(q.shadow, q.shadow);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.crowd.setLevel(q.crowd, q.animated);
    this.resize();
  }

  /** Garde en mémoire le pas qui vient d'être joué (à appeler après chaque pas de logique). */
  record(events) {
    const s = this.state;
    if (this.replay) return;
    this.tape.push({
      players: s.players.map((p) => {
        const o = {};
        for (const f of P_FIELDS) o[f] = p[f];
        o.save = p.save ? { ...p.save } : null;
        return o;
      }),
      puck: { x: s.puck.x, y: s.puck.y, z: s.puck.z, carrier: s.puck.carrier, lastTeam: s.puck.lastTeam },
      tick: s.tick,
      events: events.filter((e) => ['shot', 'michigan', 'fake', 'pass', 'poke', 'foul', 'hit'].includes(e.type)),
    });
    const max = Math.round(this.tapeT / DT);
    if (this.tape.length > max) this.tape.splice(0, this.tape.length - max);
  }

  /** Lance le ralenti du but qui vient d'être marqué. side : +1 ou -1, côté de la cage. */
  startReplay(side) {
    if (this.tape.length < 30) return false;
    // Les trois dernières secondes ; la bande elle-même reste disponible pour la révision du mode Arbitre.
    this.replay = { frames: this.tape.slice(-Math.round(REPLAY_T / DT)), i: 0, f: 0, side, gest: this.state.players.map(newGest) };
    if (this.tapeT <= REPLAY_T) this.tape = [];
    return true;
  }

  endReplay() {
    this.replay = null;
  }

  get replaying() {
    return !!this.replay;
  }

  // ---------------------------------------------------------------- révision vidéo (mode Arbitre)

  /** Extrait de la bande : `seconds` secondes au plus, qui contiennent le pas `tick` et vont jusqu'à maintenant si possible. */
  clip(tick, seconds = 8, lead = 2.5) {
    const n = Math.round(seconds / DT);
    const t = this.tape;
    if (!t.length) return [];
    let at = t.findIndex((f) => f.tick >= tick);
    if (at < 0) at = t.length - 1;
    // L'extrait commence un peu avant l'action et va jusqu'à l'arrêt de l'image quand il tient dans la durée.
    const from = Math.max(0, Math.min(Math.max(at - Math.round(lead / DT), t.length - n), at - Math.round(1 / DT)));
    return t.slice(from, from + n);
  }

  /** Ouvre la révision d'un extrait. focus : [id, id] joueurs que la vue rapprochée suit. */
  startReview(frames, focus = []) {
    if (frames.length < 3) return false;
    this.review = { frames, i: 0, f: 0, speed: 0.5, paused: false, cam: 'large', focus, gest: this.state.players.map(newGest), camX: null };
    return true;
  }

  endReview() {
    this.review = null;
    this.camera.clearViewOffset();
  }

  /** Va à l'image i de la révision ; les gestes en cours à ce moment-là sont recalculés. */
  reviewSeek(i) {
    const r = this.review;
    if (!r) return;
    r.i = Math.max(0, Math.min(r.frames.length - 2, i));
    r.f = 0;
    r.gest = this.state.players.map(newGest);
    for (let j = Math.max(0, r.i - 150); j <= r.i; j++) {
      for (const e of r.frames[j].events) this.gesture(r.gest, e, r.frames[j].players);
      if (j < r.i) {
        for (const ge of r.gest) {
          ge.shot = Math.max(0, ge.shot - DT);
          ge.pass = Math.max(0, ge.pass - DT);
          ge.poke = Math.max(0, ge.poke - DT);
          if (ge.foul && (ge.foul.t -= DT) <= 0) ge.foul = null;
          if (ge.react && (ge.react.t -= DT) <= 0) ge.react = null;
        }
      }
    }
  }

  renderReview(dt) {
    const r = this.review;
    const s = this.state;
    const d = r.paused ? 0 : dt * r.speed;
    r.f += d / DT;
    while (r.f >= 1 && r.i < r.frames.length - 2) {
      r.f -= 1;
      r.i++;
      for (const e of r.frames[r.i].events) this.gesture(r.gest, e, r.frames[r.i].players);
    }
    // En bout d'extrait, l'image reste sur la dernière : c'est au joueur de relancer.
    if (r.i >= r.frames.length - 2 && r.f >= 1) r.f = 1;
    const a = r.frames[r.i];
    const b = r.frames[r.i + 1];
    const alpha = Math.min(1, r.f);
    const px = lerp(a.puck.x, b.puck.x, alpha);
    const py = lerp(a.puck.y, b.puck.y, alpha);
    const src = { teams: s.teams, players: b.players, phase: 'play' };
    this.shown = b.players;
    this.drawPlayers(src, b.players, a.players, b.puck, px, py, alpha, d, r.gest, this.marks ?? new Map());
    this.puck.position.set(px, 0.02 + lerp(a.puck.z, b.puck.z, alpha), py);
    for (const ref of this.referees) poseFigure(ref.fig, { ...ref.pos, vx: 0, dt: d, armUp: false });
    // Point suivi : le milieu des deux joueurs concernés, sinon le palet.
    const who = r.focus.map((id) => b.players[id]).filter((p) => p && p.status === 'rink');
    const fx = who.length ? who.reduce((t, p) => t + p.x, 0) / who.length : px;
    const fy = who.length ? who.reduce((t, p) => t + p.y, 0) / who.length : py;
    const cx = Math.max(-17, Math.min(17, fx * 0.8));
    r.camX = r.camX == null ? cx : r.camX + (cx - r.camX) * Math.min(1, dt * 3.2);
    const c = this.camera;
    if (r.cam === 'oppose') {
      c.position.set(r.camX, 9.5, -(HW + 9));
      c.lookAt(r.camX + (fx - r.camX) * 0.6, 0.6, fy * 0.3 - 0.4);
    } else if (r.cam === 'but') {
      const side = fx >= 0 ? 1 : -1;
      c.position.set(side * (GOAL_X + 7.5), 6.5, fy * 0.3);
      c.lookAt(fx * 0.7 + side * 2, 0.8, fy * 0.8);
    } else if (r.cam === 'proche') {
      c.position.set(fx + (r.camX - fx) * 0.25, 4.6, fy + 11);
      c.lookAt(fx, 1.0, fy);
    } else {
      c.position.set(r.camX, 13.2, HW + 15.5);
      c.lookAt(r.camX + Math.max(-4, Math.min(4, (fx - r.camX) * 0.6)), 0.6, fy * 0.3 + 0.4);
    }
    // Le panneau de décision occupe la droite de l'écran : l'image est décalée pour que l'action reste visible.
    const w = this.renderer.domElement.clientWidth;
    const h = this.renderer.domElement.clientHeight;
    if (w > 900) c.setViewOffset(w, h, Math.min(210, w * 0.16), 0, w, h);
    c.updateMatrixWorld();
    this.renderer.render(this.scene, c);
  }

  /** Joueur de piste dessiné le plus près du point cliqué (à moins de 70 pixels), ou -1. */
  pick(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector3();
    let best = -1;
    let bd = 70;
    for (const p of this.shown) {
      if (p.status !== 'rink') continue;
      v.set(p.x, 1.0, p.y).project(this.camera);
      const d = Math.hypot(rect.left + ((v.x + 1) / 2) * rect.width - clientX, rect.top + ((1 - v.y) / 2) * rect.height - clientY);
      if (d < bd) {
        bd = d;
        best = p.id;
      }
    }
    return best;
  }

  /** Réagit aux événements de la logique (gestes de crosse, zoom sur but). */
  onEvent(e) {
    this.crowd.onEvent(e);
    this.gesture(this.gest, e, this.state.players);
    this.refSignal(e);
    if (e.type === 'goal') this.zoom = 1;
  }

  /** Déclenche le geste ou la réaction qu'un événement de la logique appelle (en direct comme au ralenti). */
  gesture(gest, e, players) {
    if (e.type === 'shot' || e.type === 'michigan') gest[e.by].shot = SHOT_T;
    else if (e.type === 'fake') gest[e.by].pass = PASS_T;
    else if (e.type === 'pass' && e.from != null) gest[e.from].pass = PASS_T;
    else if (e.type === 'poke') Object.assign(gest[e.by], { poke: POKE_T, px: e.x, py: e.y });
    else if (e.type === 'foul') {
      const v = e.victim >= 0 ? players[e.victim] : null;
      const by = players[e.by];
      if (!v) return;
      // Faute de crosse : le geste propre à la faute remplace le coup de crosse ordinaire.
      if (['ACC', 'CIN', 'TRE'].includes(e.code)) Object.assign(gest[e.by], { poke: 0, foul: { code: e.code, t: FOUL_T, on: v.id } });
      const r = REACT[e.code];
      // Avec une animation enregistrée, la réaction dure le temps de l'animation (entre 0,8 et 1,5 s).
      const T = r && this.clips[r[0]] ? Math.max(0.8, Math.min(1.5, this.clips[r[0]].duree)) : r?.[1];
      if (r) gest[v.id].react = { kind: r[0], t: T, T, side: this.sideOf(v, e.code === 'CBA' ? null : by) };
    } else if (e.type === 'hit' && e.force > 4.5 && e.a != null) {
      // Contact appuyé mais régulier : celui qui reste debout vacille.
      for (const [id, other] of [[e.a, e.b], [e.b, e.a]]) {
        const p = players[id];
        if (p.goalie || p.stun > 0 || gest[id].react) continue;
        gest[id].react = { kind: 'vacille', t: 0.7, T: 0.7, side: this.sideOf(p, players[other]) };
      }
    }
  }

  /**
   * Geste enregistré à jouer sur un patineur de Blender, ou null : { name, t, w, full }. Par ordre de priorité :
   * chute et relevé, réaction à une faute, geste fautif, tir, passe, coup de crosse.
   */
  boneAnim(p, ge, dt) {
    const D = this.model?.clips;
    if (!D || p.goalie || p.status !== 'rink') return null;
    if (p.stun > 0) {
      if (!ge.st0) {
        ge.st0 = p.stun;
        ge.fall = CHUTES[ge.react?.kind] ?? 'Chute_Avant';
      }
      // La chute tient dans le temps où le match immobilise le joueur.
      const k = 1 - p.stun / ge.st0;
      return { name: ge.fall, t: k * D[ge.fall], w: Math.min(1, k * 10), full: true };
    }
    if (ge.st0) {
      ge.st0 = 0;
      ge.rise = RISE_T;
    }
    if (ge.rise > 0) {
      ge.rise -= dt;
      return { name: 'Se_Relever', t: (1 - Math.max(0, ge.rise) / RISE_T) * D.Se_Relever, w: Math.min(1, ge.rise / 0.15), full: true };
    }
    const r = ge.react;
    if (r) {
      const name = CHUTES[r.kind] ?? REACTIONS[r.kind];
      const done = r.T - r.t;
      if (name) return { name, t: Math.min(D[name], (done / r.T) * D[name]), w: fondu(done, r.T, 0.08, 0.2), full: !!CHUTES[r.kind] };
    }
    if (ge.foul) {
      const name = GESTES_FAUTIFS[ge.foul.code];
      const done = FOUL_T - ge.foul.t;
      if (name) return { name, t: (done / FOUL_T) * D[name], w: fondu(done, FOUL_T), full: false };
    }
    // Tir : l'armé pendant que le joueur charge, puis la frappe ; sans armé, un tir du poignet pris au moment
    // où le palet part.
    if (p.charge > 0.05) {
      ge.armed = p.charge > 0.3;
      return { name: 'Tir_Frappe_Arme', t: Math.min(1, p.charge) * D.Tir_Frappe_Arme, w: Math.min(1, p.charge * 5), full: false };
    }
    if (ge.shot > 0) {
      if (ge.shot > SHOT_T - 0.05) ge.frappe = ge.armed;
      ge.armed = false;
      const done = SHOT_T - ge.shot;
      const name = ge.frappe ? 'Tir_Frappe' : 'Tir_Poignet';
      const t0 = ge.frappe ? 0 : 0.2;
      return { name, t: Math.min(D[name], t0 + done), w: fondu(done, SHOT_T, 0.04, 0.2), full: false };
    }
    ge.armed = false;
    if (ge.pass > 0) return { name: 'Passe', t: 0.12 + (1 - ge.pass / PASS_T) * (D.Passe - 0.12), w: fondu(PASS_T - ge.pass, PASS_T, 0.03, 0.1), full: false };
    if (ge.poke > 0) return { name: 'Vol_Palet', t: (1 - ge.poke / POKE_T) * D.Vol_Palet, w: fondu(POKE_T - ge.poke, POKE_T, 0.04, 0.1), full: false };
    return null;
  }

  /**
   * Animation enregistrée d'une réaction, s'il y en a une : elle est jouée sur la durée de la réaction, avec une
   * entrée et une sortie fondues pour s'enchaîner avec la pose calculée.
   */
  clipOf(react) {
    const data = react && this.clips[react.kind];
    if (!data) return null;
    const done = react.T - react.t;
    return { data, t: (done / react.T) * data.duree, w: Math.min(1, done / 0.12, react.t / 0.25) };
  }

  /** De quel côté du joueur (+1 à sa droite, -1 à sa gauche) part la poussée de other, ou se trouve la balustrade. */
  sideOf(p, other) {
    let dx;
    let dy;
    if (other) {
      dx = p.x - other.x;
      dy = p.y - other.y;
    } else {
      const b = boardInfo(p.x, p.y);
      dx = b.nx;
      dy = b.ny;
    }
    return Math.sign(-dx * Math.sin(p.face) + dy * Math.cos(p.face)) || 1;
  }

  /**
   * Gestes officiels. Pénalité : l'arbitre le plus proche de l'action fait le geste de l'infraction sur place,
   * puis l'arbitre côté table de marque vient s'y placer, refait le geste face à la table et désigne le banc
   * des pénalités. But, but refusé, temps mort, tir de pénalité : le plus proche fait le geste.
   */
  refSignal(e) {
    const s = this.state;
    const k = s.puck;
    const near = this.referees.reduce((best, r) => (Math.hypot(r.pos.x - k.x, r.pos.y - k.y) < Math.hypot(best.pos.x - k.x, best.pos.y - k.y) ? r : best));
    if (e.type === 'whistle' && e.call?.kind === 'penalty') {
      const t = s.cfg.teams.findIndex((q) => q.sigle === e.call.sigle);
      const side = t >= 0 && s.teams[t].dir > 0 ? -1 : 1;
      const table = this.referees.reduce((best, r) => (r.pos.y > best.pos.y ? r : best));
      near.todo = [{ code: e.call.code, T: 1.1, t: 1.1 }];
      const report = { code: e.call.code, T: SIGNAL_T, t: SIGNAL_T, bx: side * 3.4, by: HW + 1.3, table: true, wait: 2.2 };
      if (table === near) near.todo.push(report);
      else table.todo = [report];
      return;
    }
    let sig = null;
    if (e.type === 'whistle' && e.reason === 'nogoal') sig = { code: 'ANNULATION' };
    else if (e.type === 'goal') sig = { code: 'BUT', bx: s.teams[e.team].dir * GOAL_X, by: 0 };
    else if (e.type === 'timeout') sig = { code: 'TEMPS_MORT' };
    else if (e.type === 'shootout' && e.single) sig = { code: 'TP' };
    if (sig) near.todo = [{ ...sig, T: SIGNAL_T, t: SIGNAL_T }];
  }


  /**
   * Pose toutes les figurines. src : l'état du match, ou son équivalent pour un ralenti ({ teams, players, phase }) ;
   * prev : positions du pas précédent, pour interpoler ; k : le palet ; gest : gestes de crosse en cours.
   */
  drawPlayers(src, players, prev, k, px, py, alpha, dt, gest, humanSel) {
    players.forEach((p, i) => {
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
        const q = prev[i];
        x = lerp(q.x, p.x, alpha);
        y = lerp(q.y, p.y, alpha);
        face = lerpAngle(q.face, p.face, alpha);
      } else {
        const o = offRinkPos(src, p);
        x = o.x;
        y = o.y;
        face = p.status === 'box' ? -Math.PI / 2 : Math.PI / 2;
      }
      const ge = gest[i];
      ge.shot = Math.max(0, ge.shot - dt);
      ge.pass = Math.max(0, ge.pass - dt);
      ge.poke = Math.max(0, ge.poke - dt);
      if (ge.foul && (ge.foul.t -= dt) <= 0) ge.foul = null;
      if (ge.react && (ge.react.t -= dt) <= 0) ge.react = null;
      const rink = p.status === 'rink';
      poseFigure(f, {
        x,
        y,
        face,
        vx: rink ? p.vx : 0,
        vy: rink ? p.vy : 0,
        dt,
        fallen: p.stun > 0 && !this.clipOf(ge.react),
        charge: rink ? p.charge : 0,
        down: p.goalie && p.down > 0,
        stance: p.goalie ? this.stance(p, k, src.phase) : 0,
        save: p.goalie && p.save ? { part: p.save.part, lat: p.save.lat, h: p.save.h, k: 1 - p.save.t / 0.5 } : null,
        puck: rink && k.carrier === p.id ? { x: px, y: py } : null,
        puckZ: k.carrier === p.id ? k.z : 0,
        turn: rink ? p.turn : 0,
        skid: rink && p.skid,
        back: rink && p.back,
        check: rink && p.checkT > 0,
        kneel: rink && p.kneeling,
        sit: p.status === 'box',
        dodge: rink && p.dodgeT > 0 ? Math.sign(-p.ddx * Math.sin(face) + p.ddy * Math.cos(face)) : 0,
        shot: ge.shot > 0 ? 1 - ge.shot / SHOT_T : null,
        pass: ge.pass > 0 ? 1 - ge.pass / PASS_T : null,
        poke: ge.poke > 0 ? { x: ge.px, y: ge.py, k: 1 - ge.poke / POKE_T } : null,
        foul: ge.foul ? { code: ge.foul.code, x: players[ge.foul.on].x, y: players[ge.foul.on].y, k: 1 - ge.foul.t / FOUL_T } : null,
        react: ge.react ? { kind: ge.react.kind, k: 1 - ge.react.t / ge.react.T, side: ge.react.side } : null,
        clip: this.clipOf(ge.react),
        anim: this.boneAnim(p, ge, dt),
        ring: rink && src.phase !== 'final' ? humanSel.get(p.id) : null,
      });
    });
  }

  /** Ralenti : rejoue les positions enregistrées à mi-vitesse, caméra près de la cage. */
  renderReplay(dt) {
    const r = this.replay;
    const s = this.state;
    r.f += (dt * REPLAY_SPEED) / DT;
    while (r.f >= 1 && r.i < r.frames.length - 2) {
      r.f -= 1;
      r.i++;
      // Les gestes de crosse repartent au moment où ils avaient été faits.
      for (const e of r.frames[r.i].events) this.gesture(r.gest, e, r.frames[r.i].players);
    }
    if (r.i >= r.frames.length - 2 && r.f >= 1) return void this.endReplay();
    const a = r.frames[r.i];
    const b = r.frames[r.i + 1];
    const alpha = Math.min(1, r.f);
    const px = lerp(a.puck.x, b.puck.x, alpha);
    const py = lerp(a.puck.y, b.puck.y, alpha);
    const src = { teams: s.teams, players: b.players, phase: 'play' };
    this.drawPlayers(src, b.players, a.players, b.puck, px, py, alpha, dt * REPLAY_SPEED, r.gest, new Map());
    this.puck.position.set(px, 0.02 + lerp(a.puck.z, b.puck.z, alpha), py);
    for (const ref of this.referees) poseFigure(ref.fig, { ...ref.pos, vx: 0, dt: dt * REPLAY_SPEED, armUp: false });
    // Caméra basse, de trois quarts devant la cage, qui suit le palet.
    const gx = r.side * GOAL_X;
    this.camera.position.set(gx - r.side * 11, 4.2, 9.5);
    this.camera.lookAt(lerp(gx, px, 0.45), 0.9, py * 0.5);
    this.renderer.render(this.scene, this.camera);
  }

  render(alpha, dt) {
    const s = this.state;
    this.time += dt;
    this.crowd.update(dt, this.time);
    if (this.review) return this.renderReview(dt);
    if (this.replay) return this.renderReplay(dt);
    const k = s.puck;
    this.shown = s.players;
    const humanSel = this.marks ?? new Map(s.humans.map((h, i) => [h.selected, RING[i]]));
    const px = lerp(this.prevPuck.x, k.x, alpha);
    const py = lerp(this.prevPuck.y, k.y, alpha);
    this.drawPlayers(s, s.players, this.prev, k, px, py, alpha, dt, this.gest, humanSel);

    this.puck.position.set(px, 0.02 + lerp(this.prevPuck.z, k.z, alpha), py);

    // Arbitres : ils suivent le jeu le long des balustrades, lèvent le bras pendant l'avantage, font les gestes
    // officiels, et celui du côté de la table de marque vient y annoncer les pénalités.
    for (const ref of this.referees) {
      const r = ref.pos;
      const job = ref.todo[0] ?? null;
      let tx = Math.max(-HL + 4, Math.min(HL - 4, px * 0.8 + ref.lead));
      let rate = 1.1;
      let atTable = false;
      if (job?.table) {
        // Il rejoint la table de marque (au centre) avant d'annoncer ; s'il tarde, il annonce d'où il est.
        // Il s'avance un peu sur la piste, du côté du banc des pénalités concerné, pour rester visible à l'écran.
        tx = Math.sign(job.bx) * 6.2;
        rate = 2.6;
        job.wait -= dt;
        atTable = Math.abs(r.x - tx) < 1.6 || job.wait <= 0;
      }
      const nx = r.x + (tx - r.x) * Math.min(1, dt * rate);
      r.vx = (nx - r.x) / Math.max(dt, 1e-3);
      r.x = nx;
      r.y += ((job?.table ? HW - 3 : ref.home) - r.y) * Math.min(1, dt * 2.6);
      const want = job?.table ? Math.atan2(HW + 1 - r.y, -r.x) : Math.atan2(py - r.y, px - r.x);
      r.face = job?.table ? lerpAngle(r.face, want, Math.min(1, dt * 6)) : want;
      const signing = job && (!job.table || atTable);
      if (signing && (job.t -= dt) <= 0) ref.todo.shift();
      poseFigure(ref.fig, { ...r, dt, armUp: !job && (s.advantage >= 0 || s.ref?.arm >= 0 || s.phase === 'whistle'), signal: signing && job.t > 0 ? { code: job.code, k: 1 - job.t / job.T, bx: job.bx, by: job.by } : null });
    }

    // Caméra de retransmission : elle suit le palet en travelling, côté table de marque.
    // Le point visé reste proche de l'aplomb de la caméra : la piste est toujours vue de face, jamais en biais.
    const follow = Math.min(1, dt * 3.2);
    this.camX += (Math.max(-17, Math.min(17, px * 0.8)) - this.camX) * follow;
    const aim = this.camX + Math.max(-4, Math.min(4, (px - this.camX) * 0.6));
    this.lookX += (aim - this.lookX) * follow;
    this.lookZ += (py * 0.3 - this.lookZ) * follow;
    this.zoom = Math.max(0, this.zoom - dt * 0.28);
    const z = Math.min(1, this.zoom) * 0.22;
    this.camera.position.set(this.camX, 13.2 * (1 - z * 0.5), HW + 15.5 * (1 - z));
    this.camera.lookAt(this.lookX, 0.6, this.lookZ + 0.4);

    const mm = Math.floor(s.clock / 60);
    const ss = Math.floor(s.clock % 60);
    this.arena.setScore(s.cfg.teams[0].sigle, s.cfg.teams[1].sigle, s.score, `${mm}:${String(ss).padStart(2, '0')}`, periodLabel(s));

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
  }
}

export { DT };
