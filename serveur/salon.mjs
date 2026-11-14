// Parties en ligne : un salon par match, cinq places (deux joueurs par équipe et un arbitre) et des spectateurs.
// Le match tourne ici, avec la même logique que le jeu en local ; les navigateurs n'envoient que des commandes.
import { createMatch, step } from '../src/sim/match.js';
import { refWhistle, refArm, refDecide, refGoal } from '../src/sim/rules.js';
import { Journal } from '../src/sim/arbitrage.js';
import { INFRACTIONS } from '../src/data/infractions.js';
import { TEAMS } from '../src/data/teams.js';
import { instantane, coder, lireCommandes, reaction } from '../src/net/protocole.js';
import { randomBytes, randomInt } from 'node:crypto';

export const REGLAGES = {
  maxSalons: 10,
  maxSpectateurs: 6,
  pauseCoupure: 30, // secondes de pause quand un joueur perd la connexion
  fermetureVide: 120, // secondes sans aucun joueur avant de fermer le salon
  apresMatch: 180, // secondes laissées pour une revanche
  essaisParMinute: 8, // codes essayés par adresse
  pasParEnvoi: 2, // un instantané tous les deux pas : 30 par seconde
  entreReactions: 3, // secondes entre deux réactions d'un même spectateur
  delaiArbitre: 45, // secondes laissées à l'arbitre pour décider, avant que le jeu reprenne sans lui
};
const LETTRES = 'ABCDEFGHJKLMNPRSTUVWXYZ'; // sans I, O ni Q, qui se confondent à l'oral ou à l'écrit
const DUREES = [120, 300, 600, 1500];
const NIVEAUX = ['facile', 'normal', 'difficile'];
const VIDE = { mx: 0, my: 0 };
// Places : 0 et 1 pour l'équipe qui reçoit, 2 et 3 pour l'équipe visiteuse, 4 pour l'arbitre.
export const PLACES = 5;
export const ARBITRE = 4;
const equipeDe = (i) => i >> 1;
const ORDRE = [0, 2, 1, 3]; // place donnée d'office à celui qui rejoint : d'abord un joueur par équipe
const SANCTIONS = ['minor', 'major', 'tir'];
const ENGAGEMENTS = ['centre', 'zone', 'proche'];
const REF_NEUF = () => ({ wait: null, arm: -1, armTick: 0, byArm: false, at: null, goal: null, confirm: false });

/** Décision envoyée par l'arbitre : rien n'est pris tel quel. Renvoie null si elle n'est pas valable. */
export function lireDecision(d, state) {
  if (!d || typeof d !== 'object') return null;
  if (d.faute !== true) return { faute: false };
  const off = Number.isInteger(d.fautif) ? state.players[d.fautif] : null;
  if (!off || off.status !== 'rink' || !Object.hasOwn(INFRACTIONS, d.code) || !SANCTIONS.includes(d.sanction) || !ENGAGEMENTS.includes(d.engagement)) return null;
  return { faute: true, fautif: off.id, code: d.code, sanction: d.sanction, engagement: d.engagement };
}

export class Salon {
  constructor(code, cfg, now) {
    this.code = code;
    this.cfg = cfg; // { home, away, period, difficulty }
    this.sieges = Array(PLACES).fill(null); // par place : { jeton, conn, pret, parti (instant de la coupure), cmd, remplace }
    this.spectateurs = new Set();
    this.reactions = new Map(); // spectateur → instant de sa dernière réaction
    this.etat = 'attente'; // attente, jeu, pause, fini
    this.state = null;
    this.seed = 0;
    this.events = [];
    this.pas = 0;
    this.feuille = 0;
    this.vide = now;
    this.finA = 0;
    this.revanche = Array(PLACES).fill(false);
    this.debut = null; // qui jouait au coup d'envoi (pour createMatch dans les navigateurs)
    this.journal = null; // arbitre à distance : ce que l'ordinateur a vu, ce qui a été sifflé
    this.rapport = null;
    this.attenteArbitre = 0;
  }

  /** Réglages du match pour les navigateurs : avec eux, createMatch donne le même point de départ partout. */
  depart() {
    return { home: this.cfg.home, away: this.cfg.away, periodLength: this.cfg.period, difficulty: this.cfg.difficulty, seed: this.seed, ...this.debut };
  }

  nouveauMatch() {
    this.seed = randomInt(1, 0x7fffffff);
    // Une place dont le joueur n'est pas là (parti avant une revanche) est tenue par l'ordinateur jusqu'à son retour.
    this.sieges.forEach((s) => s && Object.assign(s, { cmd: VIDE, parti: 0, remplace: !s.conn }));
    const humans = [0, 1, 2, 3].filter((i) => this.sieges[i]?.conn).map((i) => ({ team: equipeDe(i), seat: i }));
    const arbitre = !!this.sieges[ARBITRE]?.conn;
    this.debut = { humans, referee: arbitre };
    this.state = createMatch({ home: structuredClone(TEAMS[this.cfg.home]), away: structuredClone(TEAMS[this.cfg.away]), periodLength: this.cfg.period, difficulty: this.cfg.difficulty, humans, seed: this.seed, overtime: true, ...(arbitre && { referee: 'humain' }) });
    this.journal = arbitre ? new Journal() : null;
    this.rapport = null;
    this.attenteArbitre = 0;
    this.events = [];
    this.pas = 0;
    this.feuille = 0;
    this.revanche = Array(PLACES).fill(false);
  }

  connexions() {
    return [...this.sieges.filter((s) => s?.conn).map((s) => s.conn), ...this.spectateurs];
  }

  dire(message) {
    const texte = coder(message);
    for (const c of this.connexions()) c.send(texte);
  }

  /** État du salon, pour l'écran d'attente et les bandeaux (pause, adversaire parti). */
  annoncer(now) {
    const pause = this.etat === 'pause' ? Math.max(0, Math.ceil(REGLAGES.pauseCoupure - (now - Math.min(...this.sieges.filter((s) => s?.parti).map((s) => s.parti))) / 1000)) : 0;
    this.dire({ t: 'etat', etat: this.etat, sieges: this.sieges.map((s) => !!s?.conn), prets: this.sieges.map((s) => !!s?.pret), ordinateur: this.sieges.map((s) => !!s?.remplace), spectateurs: this.spectateurs.size, pause, revanche: this.revanche });
  }

  /**
   * Installe un joueur sur une place libre : d'abord un joueur par équipe, puis les coéquipiers ; la place
   * d'arbitre ne se prend qu'en la choisissant (placer). Seulement avant le match : une place libre au coup
   * d'envoi le reste. Renvoie le siège, ou null si la partie est complète ou commencée.
   */
  asseoir(conn, now) {
    const i = this.etat === 'attente' ? ORDRE.find((k) => !this.sieges[k]) : undefined;
    if (i === undefined) return null;
    const siege = { jeton: randomBytes(12).toString('hex'), conn, pret: false, parti: 0, cmd: VIDE, remplace: false };
    this.sieges[i] = siege;
    this.accueillir(conn, i, siege.jeton, now);
    return siege;
  }

  placeDe(conn) {
    return this.sieges.findIndex((s) => s?.conn === conn);
  }

  /**
   * Avant le match, chacun choisit sa place : i de 0 à 4 pour une place libre, -1 pour devenir spectateur.
   * Un spectateur peut aussi prendre une place.
   */
  placer(conn, i, now) {
    if (this.etat !== 'attente' || !Number.isInteger(i) || i < -1 || i >= PLACES) return false;
    const de = this.placeDe(conn);
    if (de < 0 && !this.spectateurs.has(conn)) return false;
    if (i === de) return false;
    if (i === -1) {
      if (this.spectateurs.size >= REGLAGES.maxSpectateurs) return false;
      this.sieges[de] = null;
      this.spectateurs.add(conn);
      this.accueillir(conn, -1, null, now);
      return true;
    }
    if (this.sieges[i]) return false;
    const siege = de >= 0 ? this.sieges[de] : { jeton: randomBytes(12).toString('hex'), conn, pret: false, parti: 0, cmd: VIDE, remplace: false };
    if (de >= 0) this.sieges[de] = null;
    else {
      this.spectateurs.delete(conn);
      this.reactions.delete(conn);
    }
    siege.pret = false;
    this.sieges[i] = siege;
    this.accueillir(conn, i, siege.jeton, now);
    return true;
  }

  /** Retour d'un joueur après une coupure : même code, même jeton. */
  revenir(conn, jeton, now) {
    const i = this.sieges.findIndex((s) => s && s.jeton === jeton);
    if (i < 0) return null;
    const siege = this.sieges[i];
    siege.conn?.close(4000);
    siege.conn = conn;
    siege.parti = 0;
    if (siege.remplace && this.state && this.etat !== 'fini') {
      // L'ordinateur tenait sa place : il la lui rend.
      siege.remplace = false;
      const st = this.state;
      if (i === ARBITRE) st.ref = REF_NEUF();
      else {
        const t = equipeDe(i);
        // Un patineur que son coéquipier ne dirige pas ; pendant un tir au but, il attend le suivant.
        const libre = st.phase === 'shootout' ? null : st.players.find((p) => p.team === t && !p.goalie && p.status === 'rink' && !st.humans.some((h) => h.selected === p.id));
        st.humans.push({ team: t, seat: i, selected: libre?.id ?? -1, prev: {}, foPress: -99 });
        st.humans.sort((a, b) => a.seat - b.seat);
      }
    }
    if (this.etat === 'pause' && !this.sieges.some((s) => s && !s.conn && !s.remplace)) this.etat = 'jeu';
    this.accueillir(conn, i, jeton, now);
    return siege;
  }

  regarder(conn, now) {
    if (this.spectateurs.size >= REGLAGES.maxSpectateurs) return false;
    this.spectateurs.add(conn);
    this.accueillir(conn, -1, null, now);
    return true;
  }

  accueillir(conn, siege, jeton, now) {
    conn.send(coder({ t: 'salon', code: this.code, siege, jeton, depart: this.state ? this.depart() : null, cfg: this.cfg }));
    if (this.state) conn.send(coder({ t: 's', ...instantane(this.state, [], true) }));
    if (this.rapport && this.etat === 'fini') conn.send(coder({ t: 'rapport', lignes: this.rapport }));
    this.annoncer(now);
  }

  /** Message d'une connexion du salon : joueur, arbitre ou spectateur. */
  message(conn, m, now) {
    if (m.t === 'place') return this.placer(conn, m.i, now);
    const i = this.placeDe(conn);
    if (i >= 0) return this.recevoir(i, m, now);
    if (m.t === 'reaction') return this.reagir(conn, m.r, now);
  }

  /** Message de celui qui est assis à la place i. */
  recevoir(i, m, now) {
    const siege = this.sieges[i];
    if (!siege) return;
    if (m.t === 'c') {
      if (i !== ARBITRE) siege.cmd = lireCommandes(m);
    } else if (m.t === 'arb') {
      if (i === ARBITRE) this.arbitrer(m);
    } else if (m.t === 'pret' && this.etat === 'attente') {
      siege.pret = true;
      // Au moins deux places prises, et tous ceux qui sont assis sont prêts.
      const assis = this.sieges.filter((s) => s?.conn);
      if (assis.length >= 2 && assis.every((s) => s.pret)) {
        this.nouveauMatch();
        this.etat = 'jeu';
        this.dire({ t: 'depart', depart: this.depart() });
      }
      this.annoncer(now);
    } else if (m.t === 'revanche' && this.etat === 'fini') {
      this.revanche[i] = true;
      if (this.sieges.every((s, k) => !s?.conn || this.revanche[k]) && this.sieges.some((s) => s?.conn)) {
        this.nouveauMatch();
        this.etat = 'jeu';
        this.dire({ t: 'depart', depart: this.depart() });
      }
      this.annoncer(now);
    }
  }

  /**
   * Réaction d'un spectateur (« Bien joué ! », « Bouh ! »…) : seulement celles de la liste, une toutes les trois
   * secondes, et jamais de la part d'un joueur. Elle est relayée sans dire de qui elle vient.
   */
  reagir(conn, id, now) {
    if (!this.spectateurs.has(conn) || !this.state || typeof id !== 'string' || !reaction(id)) return false;
    if (now - (this.reactions.get(conn) ?? -Infinity) < REGLAGES.entreReactions * 1000) return false;
    this.reactions.set(conn, now);
    this.dire({ t: 'reaction', r: id });
    return true;
  }

  /** Commande de l'arbitre à distance : siffler, lever le bras, décider, accorder ou refuser un but. */
  arbitrer(m) {
    const st = this.state;
    if (this.etat !== 'jeu' || !st?.ref) return;
    if (m.a === 'siffler') refWhistle(st);
    else if (m.a === 'bras') (m.equipe === 0 || m.equipe === 1) && refArm(st, m.equipe);
    else if (m.a === 'decider' && st.ref.wait === 'decision') {
      const d = lireDecision(m.d, st);
      if (d) this.decider(d);
    } else if (m.a === 'but' && st.ref.wait === 'goal' && typeof m.accorde === 'boolean') this.but(m.accorde);
    if (st.events.length) this.events.push(...st.events.splice(0));
  }

  decider(d) {
    const st = this.state;
    const ligne = this.journal.decision(d, { tick: st.tick, periode: st.period, horloge: st.clock, bras: st.ref.byArm });
    if (ligne.verite.faute) d.victime = ligne.verite.victime;
    refDecide(st, d);
  }

  but(accorde) {
    const st = this.state;
    this.journal.but(st.seen.findLast((q) => q.goal), accorde);
    refGoal(st, accorde);
  }

  /**
   * L'arbitre n'a pas décidé à temps, ou il est parti : le jeu reprend sans lui. Coup de sifflet : engagement
   * sans sanction. But en attente : accordé ou refusé comme l'ordinateur l'aurait fait.
   */
  trancher() {
    const st = this.state;
    if (st.ref?.wait === 'decision') this.decider({ faute: false });
    else if (st.ref?.wait === 'goal') this.but(!st.seen.findLast((q) => q.goal).refuse);
    if (st.events.length) this.events.push(...st.events.splice(0));
    this.attenteArbitre = 0;
  }

  /** Une connexion s'est fermée. */
  partir(conn, now) {
    this.reactions.delete(conn);
    if (this.spectateurs.delete(conn)) return this.annoncer(now);
    const siege = this.sieges.find((s) => s?.conn === conn);
    if (!siege) return;
    siege.conn = null;
    siege.cmd = VIDE;
    if (this.etat === 'attente') {
      // Avant le match, le siège est simplement libéré.
      this.sieges[this.sieges.indexOf(siege)] = null;
      for (const s of this.sieges) if (s) s.pret = false;
    } else {
      siege.parti = now;
      if (this.etat === 'jeu') this.etat = 'pause';
    }
    this.annoncer(now);
  }

  /** L'ordinateur prend la place d'un joueur ou de l'arbitre qui n'est pas revenu. */
  remplacer(i) {
    const siege = this.sieges[i];
    siege.remplace = true;
    siege.parti = 0;
    const st = this.state;
    if (i === ARBITRE) {
      // L'ordinateur arbitre jusqu'au retour : ce qui attendait une décision est tranché, le reste est oublié.
      this.trancher();
      st.ref = null;
      if (this.journal) this.journal.ouvertes = [];
    } else st.humans = st.humans.filter((h) => h.seat !== i);
  }

  /**
   * Fait avancer le salon d'un pas de jeu (1/60 s). Renvoie faux quand le salon doit être fermé.
   */
  avancer(now) {
    const presents = this.sieges.some((s) => s?.conn);
    if (presents) this.vide = now;
    else if (now - this.vide > REGLAGES.fermetureVide * 1000) return false;
    if (this.etat === 'pause') {
      let change = false;
      this.sieges.forEach((s, i) => {
        if (s?.parti && now - s.parti > REGLAGES.pauseCoupure * 1000) {
          this.remplacer(i);
          change = true;
        }
      });
      if (!this.sieges.some((s) => s?.parti)) this.etat = 'jeu';
      if (change) this.annoncer(now);
      else if (this.pas++ % 60 === 0) this.annoncer(now); // le décompte de la pause, une fois par seconde
      return true;
    }
    if (this.etat !== 'jeu') {
      // Rien ne bouge (attente, match fini) : un message toutes les vingt secondes garde la liaison ouverte,
      // sinon nginx la ferme au bout d'une minute de silence.
      if (this.pas++ % 1200 === 1199) this.annoncer(now);
      return this.etat !== 'fini' || now - this.finA < REGLAGES.apresMatch * 1000;
    }

    const st = this.state;
    step(st, st.humans.map((h) => this.sieges[h.seat]?.cmd ?? VIDE));
    if (st.ref) {
      this.journal.suivre(st);
      // Jeu arrêté en attente de l'arbitre : il a 45 secondes, pas plus.
      if (!st.ref.wait) this.attenteArbitre = 0;
      else if (++this.attenteArbitre > REGLAGES.delaiArbitre * 60) this.trancher();
    }
    if (st.events.length) this.events.push(...st.events.splice(0));
    if (st.phase === 'final' && this.journal && !this.rapport) {
      // Le rapport de l'arbitre part avant la dernière image : tout le monde le voit à l'écran de fin.
      this.rapport = this.journal.cloture();
      this.dire({ t: 'rapport', lignes: this.rapport });
    }
    if (++this.pas % REGLAGES.pasParEnvoi === 0 || st.phase === 'final') {
      const feuille = st.sheet.length !== this.feuille;
      this.feuille = st.sheet.length;
      this.dire({ t: 's', ...instantane(st, this.events, feuille) });
      this.events = [];
    }
    if (st.phase === 'final') {
      this.etat = 'fini';
      this.finA = now;
      this.annoncer(now);
    }
    return true;
  }
}

/** Tous les salons du serveur, avec leurs limites. */
export class Salons {
  constructor() {
    this.parCode = new Map();
    this.essais = new Map(); // adresse → instants des derniers codes essayés
  }

  /** Vérifie les réglages demandés : rien de ce que le navigateur envoie n'est pris tel quel. */
  static reglages(m) {
    if (!TEAMS[m.home] || !TEAMS[m.away] || m.home === m.away) return null;
    return { home: m.home, away: m.away, period: DUREES.includes(m.period) ? m.period : 120, difficulty: NIVEAUX.includes(m.difficulty) ? m.difficulty : 'normal' };
  }

  creer(m, now) {
    const cfg = Salons.reglages(m);
    if (!cfg) return { erreur: 'reglages' };
    if (this.parCode.size >= REGLAGES.maxSalons) return { erreur: 'complet' };
    let code;
    do code = Array.from({ length: 4 }, () => LETTRES[randomInt(LETTRES.length)]).join('');
    while (this.parCode.has(code));
    const salon = new Salon(code, cfg, now);
    this.parCode.set(code, salon);
    return { salon };
  }

  /** Cherche un salon par son code, en comptant les essais de chaque adresse. */
  trouver(code, adresse, now) {
    const liste = (this.essais.get(adresse) ?? []).filter((t) => now - t < 60000);
    if (liste.length >= REGLAGES.essaisParMinute) return { erreur: 'essais' };
    liste.push(now);
    this.essais.set(adresse, liste);
    const salon = this.parCode.get(String(code ?? '').toUpperCase().trim());
    return salon ? { salon } : { erreur: 'code' };
  }

  /** Un pas de jeu pour tous les salons ; ferme ceux qui sont vides ou terminés depuis longtemps. */
  avancer(now) {
    for (const [code, salon] of this.parCode) {
      if (salon.avancer(now)) continue;
      for (const c of salon.connexions()) c.close(4001);
      this.parCode.delete(code);
    }
    if (this.essais.size > 2000) this.essais.clear();
  }
}
