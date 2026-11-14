// Jeu en ligne côté navigateur : écrans « Créer », « Rejoindre », « Regarder », liaison avec le programme de match
// (serveur/), bandeaux de coupure et réactions des spectateurs. Ce module ne touche jamais au match lui-même :
// il remet à main.js les instantanés reçus, et envoie les commandes du joueur.
import { TEAMS } from '../data/teams.js';
import { REACTIONS, reaction, coderCommandes } from '../net/protocole.js';

const $ = (id) => document.getElementById(id);
const CLE = 'elite27-enligne'; // partie en cours, pour y revenir après une coupure (onglet seulement)
const CLE_REACTIONS = 'elite27-reactions';
const ERREURS = {
  reglages: 'Ces équipes ne peuvent pas jouer ensemble.',
  complet: 'Trop de parties en cours. Réessaie dans quelques minutes.',
  essais: 'Trop de codes essayés. Attends une minute avant de recommencer.',
  code: "Aucune partie n'a ce code. Vérifie les quatre lettres.",
  plein: 'Cette partie a déjà ses deux joueurs. Tu peux la regarder.',
  spectateurs: 'Il y a déjà six spectateurs pour cette partie.',
  indisponible: "Le jeu en ligne n'est pas disponible pour le moment. Le jeu sur cet ordinateur marche normalement.",
  perdue: 'La connexion avec la partie est perdue.',
};
const DUREES = { 120: '2 × 2 min', 300: '2 × 5 min', 600: '2 × 10 min', 1500: '2 × 25 min' };
const MAX_A_L_ECRAN = 5;
const ENTRE_REACTIONS = 3000; // millisecondes, comme sur le serveur
const memoire = (zone, cle, valeur) => {
  // Le navigateur peut refuser la mémoire locale (navigation privée) : le jeu continue sans.
  try {
    if (valeur === undefined) return zone.getItem(cle);
    if (valeur === null) zone.removeItem(cle);
    else zone.setItem(cle, valeur);
  } catch {}
  return null;
};

export class EnLigne {
  /**
   * hooks : settings() (réglages du menu), start(depart) (lance l'affichage du match, promesse),
   * son(id) et public(id) (son et tribune d'une réaction).
   */
  constructor(hooks) {
    this.hooks = hooks;
    this.ws = null;
    this.code = null;
    this.siege = -1; // 0 ou 1 pour un joueur, -1 pour un spectateur
    this.jeton = null;
    this.depart = null; // réglages du match en cours
    this.pret = false; // l'affichage du match est prêt à recevoir les instantanés
    this.file = [];
    this.etat = null;
    this.essais = 0;
    this.premier = null;
    this.envoye = '';
    this.envoyeA = 0;
    this.attente = []; // réactions qui attendent une place à l'écran
    this.reagiA = 0;
    this.masquees = memoire(localStorage, CLE_REACTIONS) === 'masquees';
    this.construire();
  }

  /** Vrai dès qu'un match en ligne est lancé sur cet écran. */
  get actif() {
    return !!this.depart;
  }

  /** Adresse du programme de match : la même que le site. En local, ?serveur=… permet les essais. */
  url() {
    const essai = new URLSearchParams(location.search).get('serveur');
    if (essai && ['localhost', '127.0.0.1'].includes(location.hostname)) return essai;
    return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/partie`;
  }

  construire() {
    $('onlineBtn').addEventListener('click', () => this.montrer());
    $('onlineBack').addEventListener('click', () => this.quitter());
    $('onlineCreate').addEventListener('click', () => {
      const s = this.hooks.settings();
      this.connecter({ t: 'creer', home: s.equipe, away: s.adversaire, period: Number(s.period), difficulty: s.difficulty });
    });
    const code = $('onlineCode');
    const lu = () => code.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    code.addEventListener('input', () => (code.value = lu()));
    const entrer = (regarder) => {
      if (lu().length !== 4) return this.erreur('Le code a quatre lettres.');
      const garde = this.memoire();
      // Retour après une coupure : le même code rend la même place.
      if (regarder) this.connecter({ t: 'regarder', code: lu() });
      else this.connecter({ t: 'rejoindre', code: lu(), ...(garde?.code === lu() && garde.jeton ? { jeton: garde.jeton } : {}) });
    };
    $('onlineJoin').addEventListener('click', () => entrer(false));
    $('onlineWatch').addEventListener('click', () => entrer(true));
    code.addEventListener('keydown', (e) => e.key === 'Enter' && (e.stopPropagation(), entrer(false)));
    $('onlineReady').addEventListener('click', () => {
      this.envoyer({ t: 'pret' });
      $('onlineReady').disabled = true;
    });
    $('pauseQuit').addEventListener('click', () => this.quitter());
    $('pauseReactions').addEventListener('click', () => {
      this.masquees = !this.masquees;
      memoire(localStorage, CLE_REACTIONS, this.masquees ? 'masquees' : null);
      if (this.masquees) {
        this.attente.length = 0;
        $('reacts').replaceChildren();
      }
      this.montrerReglage();
    });
    this.montrerReglage();
    // Rangée du spectateur : une image et deux mots par bouton, doublés par les touches 1 à 6.
    const barre = $('reactions');
    REACTIONS.forEach((r, i) => {
      const b = document.createElement('button');
      b.dataset.r = r.id;
      b.innerHTML = `<b>${r.image}</b> ${r.texte} <kbd>${i + 1}</kbd>`;
      b.addEventListener('click', () => this.reagir(r.id));
      barre.append(b);
    });
    window.addEventListener('keydown', (e) => {
      if (barre.hidden || e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
      const n = /^(?:Digit|Numpad)([1-9])$/.exec(e.code)?.[1];
      if (n && REACTIONS[n - 1]) this.reagir(REACTIONS[n - 1].id);
    });
  }

  montrerReglage() {
    $('pauseReactions').textContent = `Réactions du public : ${this.masquees ? 'masquées' : 'affichées'}`;
  }

  memoire() {
    try {
      return JSON.parse(memoire(sessionStorage, CLE) ?? 'null');
    } catch {
      return null;
    }
  }

  /** Écran d'entrée : créer, rejoindre ou regarder. */
  montrer(message = '') {
    const s = this.hooks.settings();
    $('menu').hidden = true;
    $('online').hidden = false;
    $('onlineChoice').hidden = false;
    $('onlineWait').hidden = true;
    $('onlineFixture').textContent = `${TEAMS[s.equipe].nom} reçoit ${TEAMS[s.adversaire].nom} · ${DUREES[s.period] ?? DUREES[120]}`;
    this.erreur(message);
  }

  erreur(texte) {
    $('onlineError').textContent = texte ?? '';
    $('onlineError').hidden = !texte;
  }

  /** Revient à la partie gardée en mémoire (rechargement de la page, revanche). */
  reprendre() {
    const garde = this.memoire();
    if (!garde?.code) return this.montrer();
    $('menu').hidden = true;
    this.connecter(garde.jeton ? { t: 'rejoindre', code: garde.code, jeton: garde.jeton } : { t: 'regarder', code: garde.code });
  }

  connecter(premier) {
    this.erreur('');
    this.premier = premier;
    this.fermer();
    let ws;
    try {
      ws = new WebSocket(this.url());
    } catch {
      return this.coupure(null);
    }
    this.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify(premier));
    ws.onmessage = (e) => {
      if (ws !== this.ws) return;
      let m;
      try {
        m = JSON.parse(e.data);
      } catch {
        return;
      }
      this.recevoir(m);
    };
    ws.onclose = () => ws === this.ws && this.coupure(ws);
  }

  fermer() {
    const ws = this.ws;
    this.ws = null;
    try {
      ws?.close();
    } catch {}
  }

  envoyer(m) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(m));
  }

  /** La liaison est tombée : en match, on réessaie ; sinon on le dit. */
  coupure() {
    this.ws = null;
    if (this.refus) return void (this.refus = false);
    if (!this.actif) return this.montrer(ERREURS.indisponible);
    if (++this.essais > 20) return this.bandeau(`${ERREURS.perdue} Échap, puis « Quitter la partie » pour revenir au menu.`);
    this.bandeau('Connexion perdue, nouvelle tentative…');
    setTimeout(() => !this.ws && this.actif && this.connecter(this.jeton ? { t: 'rejoindre', code: this.code, jeton: this.jeton } : { t: 'regarder', code: this.code }), 2000);
  }

  recevoir(m) {
    if (m.t === 'erreur') {
      this.refus = true;
      this.fermer();
      memoire(sessionStorage, CLE, null);
      if (this.actif) return this.bandeau(`${ERREURS.perdue} Échap, puis « Quitter la partie » pour revenir au menu.`);
      return this.montrer(ERREURS[m.raison] ?? ERREURS.indisponible);
    }
    if (m.t === 'salon') {
      this.essais = 0;
      this.code = m.code;
      this.siege = m.siege;
      this.jeton = m.jeton;
      this.cfg = m.cfg;
      memoire(sessionStorage, CLE, JSON.stringify({ code: m.code, jeton: m.jeton }));
      if (this.actif) {
        // Retour après une coupure : si un autre match a commencé entre-temps, on repart de zéro.
        if (m.depart?.seed !== this.depart.seed) this.recharger();
      } else if (m.depart) this.lancer(m.depart);
      else this.attendre();
    } else if (m.t === 'etat') {
      this.etat = m;
      if (this.actif) this.suivre();
      else this.attendre();
    } else if (m.t === 'depart') {
      if (this.actif) this.recharger(); // revanche : la page repart avec le nouveau match
      else this.lancer(m.depart);
    } else if (m.t === 's') {
      if (!this.pret && this.file.length) {
        // L'affichage charge encore : seul le dernier instantané compte, avec la feuille de match déjà reçue.
        const vieux = this.file.pop();
        if (vieux.sheet && !m.sheet) m.sheet = vieux.sheet;
        m.e = [];
      }
      this.file.push(m);
    } else if (m.t === 'reaction') this.afficher(m.r);
  }

  recharger() {
    this.ws = null; // la fermeture qui suit n'est pas une coupure
    const q = new URLSearchParams(location.search); // on garde les autres réglages de l'adresse
    q.set('enligne', '1');
    location.search = `?${q}`;
  }

  /** Écran d'attente : le code à donner, qui est là, qui est prêt. */
  attendre() {
    if (!this.code || !this.cfg) return;
    $('menu').hidden = true;
    $('online').hidden = false;
    $('onlineChoice').hidden = true;
    $('onlineWait').hidden = false;
    $('onlineShow').textContent = this.code;
    const e = this.etat ?? { sieges: [false, false], prets: [false, false], spectateurs: 0 };
    const ligne = (i) => {
      const nom = TEAMS[i === 0 ? this.cfg.home : this.cfg.away].nom;
      const qui = i === this.siege ? 'toi' : e.sieges[i] ? 'un joueur' : 'personne pour le moment';
      return `<li><b>${nom}</b> (${i === 0 ? 'domicile' : 'extérieur'}) : ${qui}${e.sieges[i] && e.prets[i] ? ' — prêt' : ''}</li>`;
    };
    $('onlineSeats').innerHTML = ligne(0) + ligne(1);
    const n = e.spectateurs;
    $('onlineInfo').textContent =
      `${DUREES[this.cfg.period]} · ${n ? `${n} spectateur${n > 1 ? 's' : ''}` : 'aucun spectateur'}. ` +
      (this.siege < 0 ? 'Le match commencera quand les deux joueurs seront prêts.' : 'Donne ce code à ton adversaire, et à ceux qui veulent regarder.');
    const bouton = $('onlineReady');
    bouton.hidden = this.siege < 0;
    if (this.siege >= 0) {
      const pret = !!e.prets[this.siege];
      bouton.disabled = pret;
      bouton.textContent = pret ? (e.sieges[1 - this.siege] ? "En attente de l'adversaire…" : 'Prêt — en attente d\'un adversaire…') : 'Je suis prêt';
    }
  }

  async lancer(depart) {
    this.depart = depart;
    $('online').hidden = true;
    await this.hooks.start(depart);
    this.pret = true;
    $('reactions').hidden = this.siege >= 0;
    this.suivre();
  }

  /** Instantanés reçus depuis le dernier appel (main.js les applique à son état). */
  prendre() {
    if (!this.pret || !this.file.length) return [];
    return this.file.splice(0);
  }

  /** Envoie les commandes du joueur : à chaque changement, et au moins dix fois par seconde. */
  commander(c, now) {
    if (this.siege < 0) return;
    const m = coderCommandes(c);
    const texte = JSON.stringify(m);
    if (texte === this.envoye && now - this.envoyeA < 100) return;
    this.envoye = texte;
    this.envoyeA = now;
    if (this.ws?.readyState === 1) this.ws.send(texte);
  }

  /** Bandeaux pendant le match : pause après une coupure, équipe reprise par l'ordinateur, revanche. */
  suivre() {
    const e = this.etat;
    if (!e || !this.depart) return;
    const noms = [TEAMS[this.depart.home].nom, TEAMS[this.depart.away].nom];
    const lignes = [];
    if (e.etat === 'pause') lignes.push(`Un joueur a perdu la connexion : le match reprend dès son retour. Dans ${e.pause} s, l'ordinateur prend son équipe.`);
    e.ordinateur.forEach((o, i) => o && lignes.push(`L'ordinateur joue pour ${noms[i]} jusqu'au retour du joueur.`));
    this.bandeau(lignes.join(' '));
    const n = e.spectateurs;
    $('netRoom').textContent = `Partie ${this.code}${n ? ` · ${n} spectateur${n > 1 ? 's' : ''}` : ''}`;
    $('netRoom').hidden = false;
    if (e.etat === 'fini' && this.siege >= 0) {
      const moi = e.revanche[this.siege];
      const autre = e.revanche[1 - this.siege];
      $('again').firstChild.textContent = moi ? 'Revanche demandée… ' : autre ? "Revanche (l'adversaire la demande) " : 'Revanche ';
      $('again').disabled = moi;
    }
  }

  bandeau(texte) {
    $('netInfo').textContent = texte;
    $('netInfo').hidden = !texte;
  }

  revanche() {
    this.envoyer({ t: 'revanche' });
  }

  quitter() {
    memoire(sessionStorage, CLE, null);
    const etait = this.actif || !!this.code;
    this.ws && (this.ws.onclose = null);
    this.fermer();
    if (etait || location.search) location.search = '';
    else {
      $('online').hidden = true;
      $('menu').hidden = false;
    }
  }

  /** Le spectateur envoie une réaction (une toutes les trois secondes : le serveur refuse les autres). */
  reagir(id) {
    const now = performance.now();
    if ($('reactions').hidden || now - this.reagiA < ENTRE_REACTIONS || this.ws?.readyState !== 1) return;
    this.reagiA = now;
    this.envoyer({ t: 'reaction', r: id });
    $('reactions').classList.add('repos');
    setTimeout(() => $('reactions').classList.remove('repos'), ENTRE_REACTIONS);
  }

  /** Une réaction reçue : image et deux mots côté tribune, deux secondes, sans auteur ; cinq à l'écran au plus. */
  afficher(id) {
    const r = reaction(id);
    if (!r || this.masquees || !this.pret) return;
    const boite = $('reacts');
    if (boite.childElementCount >= MAX_A_L_ECRAN) {
      if (this.attente.length < 12) this.attente.push(id);
      return;
    }
    const el = document.createElement('div');
    el.className = 'react';
    el.style.setProperty('--x', `${Math.round((this.place = ((this.place ?? 0) + 37) % 100) * 0.6)}%`);
    const image = document.createElement('b');
    image.textContent = r.image;
    el.append(image, r.texte);
    boite.append(el);
    this.hooks.son(id);
    this.hooks.public(id);
    setTimeout(() => {
      el.remove();
      const suite = this.attente.shift();
      if (suite) this.afficher(suite);
    }, 2000);
  }
}
