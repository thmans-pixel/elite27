// Parties en ligne : un salon par match, deux joueurs (un par équipe) et des spectateurs.
// Le match tourne ici, avec la même logique que le jeu en local ; les navigateurs n'envoient que des commandes.
import { createMatch, step } from '../src/sim/match.js';
import { TEAMS } from '../src/data/teams.js';
import { instantane, coder, lireCommandes } from '../src/net/protocole.js';
import { randomBytes, randomInt } from 'node:crypto';

export const REGLAGES = {
  maxSalons: 10,
  maxSpectateurs: 6,
  pauseCoupure: 30, // secondes de pause quand un joueur perd la connexion
  fermetureVide: 120, // secondes sans aucun joueur avant de fermer le salon
  apresMatch: 180, // secondes laissées pour une revanche
  essaisParMinute: 8, // codes essayés par adresse
  pasParEnvoi: 2, // un instantané tous les deux pas : 30 par seconde
};
const LETTRES = 'ABCDEFGHJKLMNPRSTUVWXYZ'; // sans I, O ni Q, qui se confondent à l'oral ou à l'écrit
const DUREES = [120, 300, 600, 1500];
const NIVEAUX = ['facile', 'normal', 'difficile'];
const VIDE = { mx: 0, my: 0 };

export class Salon {
  constructor(code, cfg, now) {
    this.code = code;
    this.cfg = cfg; // { home, away, period, difficulty }
    this.sieges = [null, null]; // par équipe : { jeton, conn, pret, parti (instant de la coupure), cmd }
    this.spectateurs = new Set();
    this.etat = 'attente'; // attente, jeu, pause, fini
    this.state = null;
    this.seed = 0;
    this.events = [];
    this.pas = 0;
    this.feuille = 0;
    this.vide = now;
    this.finA = 0;
    this.revanche = [false, false];
  }

  /** Réglages du match pour les navigateurs : avec eux, createMatch donne le même point de départ partout. */
  depart() {
    return { home: this.cfg.home, away: this.cfg.away, periodLength: this.cfg.period, difficulty: this.cfg.difficulty, seed: this.seed };
  }

  nouveauMatch() {
    this.seed = randomInt(1, 0x7fffffff);
    this.state = createMatch({ home: structuredClone(TEAMS[this.cfg.home]), away: structuredClone(TEAMS[this.cfg.away]), periodLength: this.cfg.period, difficulty: this.cfg.difficulty, humans: [{ team: 0 }, { team: 1 }], seed: this.seed, overtime: true });
    this.events = [];
    this.pas = 0;
    this.feuille = 0;
    this.revanche = [false, false];
    for (const s of this.sieges) if (s) s.cmd = VIDE;
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

  /** Installe un joueur sur le siège libre. Renvoie le siège, ou null si la partie est complète. */
  asseoir(conn, now) {
    const i = this.sieges.findIndex((s) => !s);
    if (i < 0) return null;
    const siege = { jeton: randomBytes(12).toString('hex'), conn, pret: false, parti: 0, cmd: VIDE, remplace: false };
    this.sieges[i] = siege;
    this.accueillir(conn, i, siege.jeton, now);
    return siege;
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
      // L'ordinateur avait pris son équipe : il la lui rend.
      siege.remplace = false;
      this.state.humans.push({ team: i, selected: this.state.players.find((p) => p.team === i && !p.goalie && p.status === 'rink')?.id ?? -1, prev: {}, foPress: -99 });
      this.state.humans.sort((a, b) => a.team - b.team);
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
    this.annoncer(now);
  }

  /** Message d'un joueur assis (les spectateurs n'envoient rien d'utile). */
  recevoir(i, m, now) {
    const siege = this.sieges[i];
    if (!siege) return;
    if (m.t === 'c') siege.cmd = lireCommandes(m);
    else if (m.t === 'pret' && this.etat === 'attente') {
      siege.pret = true;
      if (this.sieges.every((s) => s?.pret && s.conn)) {
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

  /** Une connexion s'est fermée. */
  partir(conn, now) {
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

  /** L'ordinateur prend l'équipe d'un joueur qui n'est pas revenu. */
  remplacer(i) {
    const siege = this.sieges[i];
    siege.remplace = true;
    siege.parti = 0;
    this.state.humans = this.state.humans.filter((h) => h.team !== i);
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
    if (this.etat === 'fini') return now - this.finA < REGLAGES.apresMatch * 1000;
    if (this.etat !== 'jeu') return true;

    const st = this.state;
    step(st, st.humans.map((h) => this.sieges[h.team]?.cmd ?? VIDE));
    if (st.events.length) this.events.push(...st.events.splice(0));
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
