// Mode Arbitre (assisté) : panneau de décision, révision vidéo et rapport de fin de match.
// Le match n'est jamais modifié d'ici : main.js arrête simplement d'avancer la logique tant que `active` est vrai.
import { INFRACTIONS } from '../data/infractions.js';
import { Observateur, Journal, FAMILLES, propositions, noter, bilan, CLASSES, SANCTIONS_ARBITRE, ENGAGEMENTS } from '../sim/arbitrage.js';
import { refWhistle, refArm, refDecide, refGoal } from '../sim/rules.js';
import { periodLabel } from '../sim/state.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
/** Temps écoulé dans la période, comme sur la feuille de match. */
const ecoule = (s, sit) => mmss(Math.max(0, s.cfg.periodLength - sit.horloge));
const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const SAVE = 'elite27.arbitre';
const VUES = { large: 'Large', oppose: 'Côté opposé', but: 'Derrière le but', proche: 'Rapprochée' };
const VITESSES = [[0.25, '¼'], [0.5, '½'], [1, '1×']];

/** Pourquoi c'est une faute, ou pourquoi ce n'en est pas une : une phrase, d'après ce que le jeu juge. */
const POURQUOI = {
  ACC: 'La crosse retient le porteur du palet par l’arrière.',
  TRE: 'Vol de palet manqué à pleine vitesse : la crosse fauche l’adversaire sans jouer le palet.',
  CIN: 'La crosse frappe un joueur qui n’a pas le palet.',
  INC: 'La charge est trop violente, ou elle vise le gardien dans sa zone.',
  CBA: 'La charge projette l’adversaire contre la balustrade.',
  DOS: 'La charge arrive par l’arrière : l’adversaire ne peut pas se protéger.',
  OBS: 'Le contact gêne un joueur qui n’a pas le palet et ne le joue pas.',
  charge: 'Charge régulière : lancée de face ou de côté sur le porteur du palet, sans excès, loin de la balustrade.',
  crosse: 'Le palet est joué et gagné : pas de faute, même si l’adversaire tombe (10.4.26 A).',
};

export class RefereeMode {
  /** hooks : { deliver(events) : remet à l'affichage les événements retenus pendant la question } */
  constructor(state, view, seed, hooks, reel = false) {
    this.reel = reel; // arbitre réel : le joueur siffle lui-même, sa décision s'applique
    this.journal = reel ? new Journal() : null;
    this.clips = new Map(); // arbitre réel : extraits gardés pour le rapport, par pas de jeu
    this.todoClips = [];
    this.reviews = 0; // situations où la révision vidéo a servi
    this.live = $('arbLive');
    this.state = state;
    this.view = view;
    this.hooks = hooks;
    this.obs = new Observateur(seed, state.cfg.periodLength);
    this.rnd = this.obs.rnd;
    this.lines = [];
    this.active = false;
    this.cur = null;
    this.box = $('arb');
    this._key = (e) => this.key(e);
    this._click = (e) => this.clickRink(e);
    window.addEventListener('keydown', this._key);
    view.renderer.domElement.addEventListener('click', this._click);
    view.tapeT = 20;
    if (reel) this.drawLive();
  }

  dispose() {
    window.removeEventListener('keydown', this._key);
    this.view.renderer.domElement.removeEventListener('click', this._click);
    this.box.hidden = true;
    this.live.hidden = true;
  }

  /** À appeler après chaque pas de logique. Renvoie vrai si l'image s'arrête sur une situation. */
  observe(events) {
    if (this.reel) return this.observeReel();
    const sit = this.obs.observe(this.state, events);
    if (!sit) return false;
    this.pendingSit = sit;
    return true;
  }

  /** Ouvre la situation retenue par observe ; events : les événements du pas, remis à l'affichage à la reprise. */
  open(events) {
    if (this.reel) return this.openReel(events);
    const sit = this.pendingSit;
    this.pendingSit = null;
    const s = this.state;
    const v = sit.verite;
    const frames = this.view.clip(sit.tick);
    // L'image juste avant l'action : au coup de sifflet, le fautif a déjà quitté la piste.
    const at = frames.findLast((f) => f.tick < sit.tick) ?? frames[0];
    const focus = v.faute ? [v.fautif, v.victime].filter((id) => id >= 0) : [v.a, v.b];
    // Patineurs présents au moment de l'action, du plus proche au plus éloigné.
    const mid = focus.map((id) => at.players[id]);
    const cx = mid.reduce((t, p) => t + p.x, 0) / mid.length;
    const cy = mid.reduce((t, p) => t + p.y, 0) / mid.length;
    const skaters = at.players
      .filter((p) => p.status === 'rink' && !p.goalie)
      .map((p) => ({ id: p.id, d: Math.hypot(p.x - cx, p.y - cy) }))
      .sort((a, b) => a.d - b.d)
      .map((p) => p.id);
    this.cur = {
      n: this.lines.length + 1,
      sit,
      frames,
      focus,
      skaters,
      near: skaters.slice(0, 4),
      choix: propositions(v.code, this.rnd, v.famille),
      rep: { faute: null, fautif: -1, code: null, sanction: null, engagement: null },
      step: 'faute',
      held: events,
      note: null,
    };
    this.active = true;
    this.view.startReview(frames, focus);
    this.draw();
  }

  // ---------------------------------------------------------------- étapes

  /** Choix de l'étape en cours : [{ v, label, cls? }] */
  options() {
    const c = this.cur;
    const s = this.state;
    if (c.step === 'but') return [{ v: true, label: 'But accordé' }, { v: false, label: 'But refusé' }];
    if (c.step === 'faute') return [{ v: false, label: this.reel ? 'Rien, erreur de ma part' : 'Rien, le jeu continue' }, { v: true, label: 'Faute' }];
    if (c.step === 'fautif') {
      return c.skaters.map((id) => {
        const p = s.players[id];
        return { v: id, label: `${s.cfg.teams[p.team].sigle} n° ${p.num} ${p.name}`, cls: c.near.includes(id) ? 'near' : '' };
      });
    }
    if (c.step === 'infraction') {
      let fam = null;
      return c.choix.map((code) => {
        const f = this.reel ? Object.values(FAMILLES).find((q) => q.codes.includes(code)).nom : null;
        const head = f !== fam ? f : null;
        fam = f;
        return { v: code, label: INFRACTIONS[code].nom, head };
      });
    }
    if (c.step === 'sanction') return Object.entries(SANCTIONS_ARBITRE).map(([v, label]) => ({ v, label }));
    if (c.step === 'engagement') return Object.entries(ENGAGEMENTS).map(([v, label]) => ({ v, label }));
    return [];
  }

  choose(v) {
    const c = this.cur;
    const r = c.rep;
    if (c.step === 'but') {
      r.accorde = v;
      c.step = 'fin';
    } else if (c.step === 'faute') {
      r.faute = v;
      c.step = v ? 'fautif' : 'fin';
    } else if (c.step === 'fautif') {
      r.fautif = v;
      c.step = 'infraction';
    } else if (c.step === 'infraction') {
      r.code = v;
      c.step = 'sanction';
    } else if (c.step === 'sanction') {
      r.sanction = v;
      c.step = v === 'tir' ? 'fin' : 'engagement';
    } else if (c.step === 'engagement') {
      r.engagement = v;
      c.step = 'fin';
    }
    if (c.step === 'fin' && this.reel) return this.applyReel();
    if (c.step === 'fin') {
      c.note = noter(c.sit.verite, r);
      this.lines.push({ n: c.n, sit: c.sit, frames: c.frames, focus: c.focus, rep: { ...r }, note: c.note });
    }
    this.draw();
  }

  /** Reprise du match : l'affichage reçoit le coup de sifflet retenu, l'arbitre fait le geste officiel. */
  resume() {
    const c = this.cur;
    this.cur = null;
    this.active = false;
    this.view.endReview();
    this.view.marks = null;
    this.box.hidden = true;
    if (c.back) return void c.back();
    this.hooks.deliver(c.held);
  }

  // ---------------------------------------------------------------- affichage

  questionText() {
    return { but: 'Le but est-il valable ?', faute: 'Que siffles-tu ?', fautif: 'Qui est le fautif ? (clique sur le joueur ou choisis-le)', infraction: 'Quelle infraction ?', sanction: 'Quelle sanction ?', engagement: 'Où se fait l’engagement ?' }[this.cur.step];
  }

  who(id) {
    const p = this.state.players[id];
    return p ? `${this.state.cfg.teams[p.team].sigle} n° ${p.num} ${p.name}` : '—';
  }

  /** Ce que le jeu a vu, en clair. */
  truthHtml(v) {
    if (v.but) return `<div class="t">${v.refuse ? 'But à refuser' : 'But valable'}</div><div class="why">${v.refuse ? 'Un attaquant était dans la zone de but quand le palet y est entré.' : 'Aucun attaquant dans la zone de but.'}</div><div class="art">Article 9.3.9</div>`;
    if (!v.faute && this.reel) return '<div class="t">Aucune faute vue par le jeu</div>';
    if (!v.faute) return `<div class="t">Action régulière</div><div class="why">${esc(POURQUOI[v.famille])}</div>`;
    const inf = INFRACTIONS[v.code];
    const c = v.call;
    return (
      `<div class="t"><b class="code ${v.sanction === 'major' ? 'major' : 'minor'}">${v.code}</b> ${esc(inf.nom)} — ${esc(this.who(v.fautif))}</div>` +
      `<div>${esc(c?.sanction ?? SANCTIONS_ARBITRE[v.sanction])}${v.engagement ? ` · engagement ${esc(ENGAGEMENTS[v.engagement].toLowerCase())}` : ''}</div>` +
      (c?.note ? `<div>${esc(c.note)}</div>` : '') +
      `<div class="why">${esc(POURQUOI[v.code] ?? '')}</div>` +
      `<div class="art">Article ${inf.article} · Geste : ${esc(inf.geste)}</div>`
    );
  }

  answerText(r) {
    if (r.accorde != null) return r.accorde ? 'But accordé' : 'But refusé';
    if (r.faute == null) return 'Pas sifflé';
    if (r.faute === false) return this.reel ? 'Sifflé, puis « rien »' : 'Rien, le jeu continue';
    const parts = [r.code ? INFRACTIONS[r.code].nom : null, r.fautif >= 0 ? this.who(r.fautif) : null, r.sanction ? SANCTIONS_ARBITRE[r.sanction] : null, r.engagement ? `engagement ${ENGAGEMENTS[r.engagement].toLowerCase()}` : null];
    return parts.filter(Boolean).join(' · ');
  }

  draw() {
    const c = this.cur;
    const s = this.state;
    const rv = this.view.review;
    const marks = new Map();
    if (c.step === 'fautif') for (const id of c.near) marks.set(id, '#4de1ff');
    if (c.rep.fautif >= 0) marks.set(c.rep.fautif, '#ffe14d');
    if (c.step === 'fin' && c.sit.verite.faute) marks.set(c.sit.verite.fautif, c.rep.fautif === c.sit.verite.fautif ? '#6ee07a' : '#ff5a5a');
    this.view.marks = marks;

    const bar =
      `<div class="rv"><button data-rv="debut" title="Touche R">⏮ Début</button><button data-rv="pause" title="Espace">${rv?.paused ? '▶ Lecture' : '⏸ Pause'}</button>` +
      `<button data-rv="moins" title="Flèche gauche">◀ image</button><button data-rv="plus" title="Flèche droite">image ▶</button></div>` +
      `<div class="rv"><span>Vitesse</span>${VITESSES.map(([v, l]) => `<button data-speed="${v}" class="${rv?.speed === v ? 'on' : ''}">${l}</button>`).join('')}` +
      `<span>Vue</span>${Object.entries(VUES).map(([v, l]) => `<button data-cam="${v}" class="${rv?.cam === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;

    let body;
    if (c.step !== 'fin') {
      const done = this.answerText(c.rep);
      body =
        (done && c.rep.faute ? `<div class="sofar">${esc(done === 'Rien, le jeu continue' ? '' : done) || 'Faute'}</div>` : '') +
        `<div class="q">${esc(this.questionText())}</div>` +
        `<div class="ch">${this.options().map((o, i) => `${o.head ? `<div class="lab">${esc(o.head)}</div>` : ''}<button data-i="${i}" class="${o.cls ?? ''}">${i < 9 ? `<kbd>${i + 1}</kbd>` : ''}${esc(o.label)}</button>`).join('')}</div>`;
    } else {
      const n = c.note;
      body =
        `<div class="verdict ${n.classe === 'juste' ? 'ok' : 'ko'}">${esc(CLASSES[n.classe])} — ${n.points} / ${n.max} point${n.max > 1 ? 's' : ''}</div>` +
        `<div class="lab">Ta décision</div><div>${esc(this.answerText(c.rep))}</div>` +
        `<div class="lab">Ce que le jeu a vu</div>${this.truthHtml(c.sit.verite)}` +
        `<div class="ch"><button data-go="1" class="go">${c.back ? 'Retour au rapport' : 'Reprendre le match'} <kbd>Entrée</kbd></button></div>`;
    }
    const when = `${periodLabel({ ...s, period: c.sit.periode, phase: 'play' })} · ${mmss(Math.ceil(c.sit.horloge))}`;
    this.box.innerHTML = `<div class="head">Situation ${c.n}<small>${esc(when)}</small></div><div class="lab">Revoir l’action</div>${bar}${body}`;
    this.box.hidden = false;
    for (const b of this.box.querySelectorAll('button')) b.addEventListener('click', () => this.press(b.dataset));
  }

  press(d) {
    const rv = this.view.review;
    if (d.i != null) return this.choose(this.options()[Number(d.i)].v);
    if (d.go) return this.resume();
    if (!rv) return;
    if (this.cur && !this.cur.reviewed && !this.cur.back) {
      this.cur.reviewed = true;
      this.reviews++;
    }
    if (d.rv === 'debut') {
      this.view.reviewSeek(0);
      rv.paused = false;
    } else if (d.rv === 'pause') {
      // En bout d'extrait, « Lecture » repart du début.
      if (rv.paused && rv.i >= rv.frames.length - 2) this.view.reviewSeek(0);
      rv.paused = !rv.paused;
    } else if (d.rv === 'moins' || d.rv === 'plus') {
      rv.paused = true;
      this.view.reviewSeek(rv.i + (d.rv === 'plus' ? 2 : -2));
    } else if (d.speed) rv.speed = Number(d.speed);
    else if (d.cam) rv.cam = d.cam;
    this.draw();
  }

  key(e) {
    if (!this.active && this.reel && !e.repeat && this.state.phase === 'play' && this.live && !this.live.hidden) {
      const cmd = { Space: 'siffler', KeyB: 'bras0', KeyN: 'bras1' }[e.code];
      if (cmd) {
        e.preventDefault();
        this.command(cmd);
      }
      return;
    }
    if (!this.active || e.repeat) return;
    const c = this.cur;
    const digit = /^(Digit|Numpad)([1-9])$/.exec(e.code);
    if (digit && c.step !== 'fin') {
      const o = this.options()[Number(digit[2]) - 1];
      if (o) this.choose(o.v);
    } else if ((e.code === 'Enter' || e.code === 'NumpadEnter') && c.step === 'fin') this.resume();
    else if (e.code === 'Space') this.press({ rv: 'pause' });
    else if (e.code === 'ArrowLeft') this.press({ rv: 'moins' });
    else if (e.code === 'ArrowRight') this.press({ rv: 'plus' });
    else if (e.code === 'KeyR') this.press({ rv: 'debut' });
    else if (e.code === 'KeyV') {
      const k = Object.keys(VUES);
      this.press({ cam: k[(k.indexOf(this.view.review?.cam ?? 'large') + 1) % k.length] });
    } else return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  clickRink(e) {
    if (!this.active || this.cur.step !== 'fautif') return;
    const id = this.view.pick(e.clientX, e.clientY);
    if (id >= 0 && this.cur.skaters.includes(id)) this.choose(id);
  }

  // ---------------------------------------------------------------- arbitre réel

  /** Panneau présent pendant le jeu : siffler, lever le bras, ou ne rien faire. */
  drawLive() {
    const s = this.state;
    const arm = s.ref.arm;
    const t = s.cfg.teams;
    this.live.innerHTML =
      arm >= 0
        ? `<span class="arm">Bras levé contre ${esc(t[arm].sigle)} : le jeu s’arrêtera quand ${esc(t[arm].sigle)} aura le palet</span><button data-cmd="siffler">Siffler <kbd>Espace</kbd></button>`
        : `<button data-cmd="siffler">Siffler <kbd>Espace</kbd></button><span>Signaler une faute, bras levé :</span>` +
          `<button data-cmd="bras0">contre ${esc(t[0].sigle)} <kbd>B</kbd></button><button data-cmd="bras1">contre ${esc(t[1].sigle)} <kbd>N</kbd></button>`;
    this.live.hidden = false;
    this.liveArm = arm;
    for (const b of this.live.querySelectorAll('button')) b.addEventListener('click', () => this.command(b.dataset.cmd));
  }

  /** Commande de l'arbitre pendant le jeu. */
  command(cmd) {
    const s = this.state;
    if (this.active || s.phase !== 'play') return;
    if (cmd === 'siffler') {
      if (!refWhistle(s)) return;
      this.hooks.flush();
      this.openReel();
    } else if (refArm(s, cmd === 'bras0' ? 0 : 1)) {
      this.hooks.flush();
      this.drawLive();
    }
  }

  observeReel() {
    const s = this.state;
    for (const f of this.journal.suivre(s)) this.todoClips.push({ tick: f.tick, at: s.tick + 150, focus: [f.offender, f.victim].filter((id) => id >= 0) });
    this.keepClips(false);
    if (this.live.hidden !== (s.phase !== 'play') || this.liveArm !== s.ref.arm) {
      if (s.phase === 'play') this.drawLive();
      else this.live.hidden = true;
    }
    // Le jeu s'est arrêté seul : bras levé et palet repris par l'équipe signalée, ou palet dans la cage.
    return !!s.ref.wait;
  }

  /** Garde les extraits des fautes vues, pour le rapport (la bande ne couvre que les vingt dernières secondes). */
  keepClips(all) {
    const now = this.state.tick;
    this.todoClips = this.todoClips.filter((c) => {
      if (!all && now < c.at) return true;
      this.clips.set(c.tick, { frames: this.view.clip(c.tick, 6), focus: c.focus });
      return false;
    });
  }

  /** Jeu arrêté en arbitre réel : décision sur une faute, ou sur un but. */
  openReel() {
    const s = this.state;
    this.live.hidden = true;
    this.keepClips(true);
    const but = s.ref.wait === 'goal';
    const frames = this.view.clip(s.tick, 8);
    const last = frames.at(-1);
    const at = s.ref.at ?? { x: s.puck.x, y: s.puck.y };
    const skaters = (last?.players ?? s.players)
      .filter((p) => p.status === 'rink' && !p.goalie)
      .map((p) => ({ id: p.id, d: Math.hypot(p.x - at.x, p.y - at.y) }))
      .sort((a, b) => a.d - b.d)
      .map((p) => p.id);
    const jouables = Object.values(FAMILLES).flatMap((f) => f.codes.filter((c) => INFRACTIONS[c]));
    this.cur = {
      n: this.journal.lignes.length + 1,
      sit: { periode: s.period, horloge: s.clock, tick: s.tick, verite: {} },
      frames,
      focus: [],
      skaters,
      near: skaters.slice(0, 4),
      choix: jouables,
      rep: but ? { accorde: null } : { faute: null, fautif: -1, code: null, sanction: null, engagement: null },
      step: but ? 'but' : 'faute',
      bras: s.ref.byArm,
      but,
      note: null,
    };
    this.active = true;
    // En réel, pas de ralenti offert : l'image reste arrêtée, la révision se lance à la demande.
    if (this.view.startReview(frames, [])) {
      this.view.reviewSeek(frames.length - 2);
      this.view.review.paused = true;
    }
    this.draw();
  }

  /** La décision de l'arbitre est appliquée telle quelle, puis le match reprend. */
  applyReel() {
    const c = this.cur;
    const s = this.state;
    const o = { tick: c.sit.tick, periode: c.sit.periode, horloge: c.sit.horloge, bras: c.bras };
    let line;
    if (c.but) {
      line = this.journal.but(s.seen.findLast((q) => q.goal), c.rep.accorde);
      refGoal(s, c.rep.accorde);
    } else {
      const d = { ...c.rep };
      line = this.journal.decision(d, o);
      if (line.verite.faute) d.victime = line.verite.victime;
      refDecide(s, d);
    }
    if (line && !this.clips.has(line.tick)) this.clips.set(line.tick, { frames: c.frames, focus: c.but ? [] : [c.rep.fautif].filter((id) => id >= 0) });
    this.cur = null;
    this.active = false;
    this.view.endReview();
    this.view.marks = null;
    this.box.hidden = true;
    this.hooks.flush();
  }

  // ---------------------------------------------------------------- rapport

  /** Rapport de fin de match, ajouté à l'écran de fin. */
  report(container) {
    if (this.reel) {
      this.keepClips(true);
      this.lines = this.journal.cloture().map((l, i) => ({ n: i + 1, sit: { periode: l.periode, horloge: l.horloge, verite: l.verite }, rep: l.rep, note: l.note, avantage: l.avantage, ...(this.clips.get(l.tick) ?? { frames: [], focus: [] }) }));
    }
    const mode = this.reel ? 'reel' : 'assiste';
    const b = bilan(this.lines);
    let best = null;
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE) ?? '{}');
      best = saved[mode] ?? null;
      if (b.note != null && (best == null || b.note > best)) {
        saved[mode] = b.note;
        localStorage.setItem(SAVE, JSON.stringify(saved));
      }
    } catch {
      // Sauvegarde locale indisponible : le rapport s'affiche quand même.
    }
    const s = this.state;
    const rows = this.lines
      .map((l, i) => {
        const v = l.sit.verite;
        const seen = v.but
          ? v.refuse ? 'But à refuser : attaquant dans la zone de but' : 'But valable'
          : v.faute ? `${v.code} ${INFRACTIONS[v.code].nom} — ${this.who(v.fautif)} — ${SANCTIONS_ARBITRE[v.sanction]}${this.reel ? (v.immediate ? ' — à siffler tout de suite' : ' — avantage à laisser') : ''}` : this.reel ? 'Rien' : 'Action régulière';
        return (
          `<tr class="${l.note.classe === 'juste' ? 'ok' : 'ko'}"><td>${esc(periodLabel({ ...s, period: l.sit.periode, phase: 'play' }).replace(' période', ''))} ${ecoule(s, l.sit)}</td>` +
          `<td>${esc(seen)}${v.faute ? `<small>Article ${INFRACTIONS[v.code].article}</small>` : v.but ? '<small>Article 9.3.9</small>' : ''}</td><td>${esc(this.answerText(l.rep))}${l.avantage != null ? `<small>${l.avantage ? 'Avantage laissé' : 'Sifflé sans laisser l’avantage'}</small>` : ''}</td>` +
          `<td>${esc(CLASSES[l.note.classe])}<small>${l.note.points} / ${l.note.max}</small></td><td>${l.frames.length > 2 ? `<button data-line="${i}" class="mini">Revoir</button>` : ''}</td></tr>`
        );
      })
      .join('');
    const err = b.erreurs.length ? `Erreurs les plus fréquentes : ${b.erreurs.slice(0, 3).map(([c, n]) => `${CLASSES[c].toLowerCase()} (${n})`).join(', ')}.` : 'Aucune erreur.';
    const totals = Object.entries(b.classes).map(([c, n]) => `${CLASSES[c]} : ${n}`).join(' · ');
    const box = document.createElement('div');
    box.id = 'arbBilan';
    box.innerHTML = !this.lines.length
      ? `<h3>Rapport de l’arbitre</h3><p class="empty">${this.reel ? 'Rien à signaler : aucune faute vue par le jeu, aucun coup de sifflet.' : 'Aucune situation à juger dans ce match.'}</p>`
      : `<h3>Rapport de l’arbitre <b>${String(b.note).replace('.', ',')} / 20</b></h3>` +
        `<p class="fstats">${b.points} points sur ${b.max} · ${esc(totals)}<br>${esc(err)}${this.reel ? `<br>Révision vidéo utilisée ${this.reviews} fois.` : ''}` +
        `${best != null ? `<br>Meilleure note jusqu’ici : ${String(Math.max(best, b.note)).replace('.', ',')} / 20${b.note > best ? ' — nouveau record' : ''}` : ''}</p>` +
        `<table class="sheet arb"><thead><tr><th></th><th>Ce que le jeu a vu</th><th>Ce que tu as sifflé</th><th></th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
    container.append(box);
    for (const btn of box.querySelectorAll('button[data-line]')) btn.addEventListener('click', () => this.replay(Number(btn.dataset.line)));
  }

  /** Rejoue une ligne du rapport avec la révision vidéo, puis revient au rapport. */
  replay(i) {
    const l = this.lines[i];
    $('final').hidden = true;
    this.cur = { n: l.n, sit: l.sit, frames: l.frames, focus: l.focus, skaters: [], near: [], choix: [], rep: l.rep, step: 'fin', note: l.note, back: () => ($('final').hidden = false) };
    this.active = true;
    this.view.startReview(l.frames, l.focus);
    this.draw();
  }
}
