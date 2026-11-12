// Écran de la saison : affiche de la journée, résultats, classement, sauvegarde dans le navigateur.
import { createSeason, validSeason, myFixture, dayFixtures, seasonMatch, matchResult, closeDay, standings, seasonOver, DAYS } from '../sim/season.js';
import { step } from '../sim/match.js';
import { TEAMS } from '../data/teams.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const KEY = 'elite27.saison';
const SUFFIX = { temps: '', prolongation: ' a.p.', tirs: ' t.p.' };

/** Une seule saison à la fois, gardée dans la mémoire locale du navigateur. Rien n'est envoyé ailleurs. */
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    return validSeason(s) ? s : null;
  } catch {
    return null;
  }
}
function save(season) {
  try {
    if (season) localStorage.setItem(KEY, JSON.stringify(season));
    else localStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}

/** Joue un match entre ordinateurs par tranches, pour ne pas figer la page pendant les longues durées. */
async function simulateAsync(season, fx) {
  const st = seasonMatch(season, fx);
  while (st.phase !== 'final') {
    for (let i = 0; i < 12000 && st.phase !== 'final'; i++) {
      step(st);
      st.events.length = 0;
    }
    await new Promise((r) => setTimeout(r, 0));
  }
  return matchResult(fx, st);
}

export class SeasonScreen {
  /** opts : { settings() : réglages du menu, play() : lance le match de la journée } */
  constructor(opts) {
    this.opts = opts;
    this.season = load();
    this.playing = null; // affiche en cours de jeu
    this.busy = false;
    this.dropArmed = false;
    $('seasonBtn').addEventListener('click', () => this.open());
    $('seasonPlay').addEventListener('click', () => this.play());
    $('seasonSim').addEventListener('click', () => this.simulateDay());
    $('seasonMenu').addEventListener('click', () => (location.search = ''));
    $('seasonDrop').addEventListener('click', () => this.drop());
    this.hint();
  }

  hint() {
    const s = this.season;
    $('seasonBtn').textContent = s ? 'Reprendre la saison' : 'Saison';
    $('seasonHint').textContent = s
      ? `Saison en cours avec ${TEAMS[s.team].nom} : ${seasonOver(s) ? 'phase de qualification terminée' : `journée ${s.day + 1} sur ${DAYS}`}.`
      : 'Saison : les 18 journées avec « Ton équipe », la difficulté et la durée choisies ci-dessus. Elle se joue à un joueur.';
  }

  /** Depuis le menu : reprend la saison gardée, ou en commence une avec les réglages du menu. */
  open() {
    if (!this.season) {
      const set = this.opts.settings();
      this.season = createSeason({ team: set.equipe, difficulty: set.difficulty, periodLength: Number(set.period), seed: (Date.now() & 0x7fffffff) | 0 });
      this.saved = save(this.season);
    }
    this.show();
  }

  show() {
    $('menu').hidden = true;
    $('season').hidden = false;
    this.render();
  }

  render() {
    const s = this.season;
    const over = seasonOver(s);
    const fx = myFixture(s);
    const table = standings(s);
    const name = (id) => esc(TEAMS[id].nom);
    $('seasonTitle').textContent = over ? 'Classement final' : `Journée ${s.day + 1} sur ${DAYS}`;
    let html = '';
    if (over) {
      const me = table.find((r) => r.id === s.team);
      const fate = me.rang <= 8 ? 'qualifiés pour les play-offs' : me.rang === 9 ? 'en barrage contre le 2e de Nationale 1' : 'relégués en Nationale 1';
      html += `<div class="end">${name(s.team)} : ${me.rang}${me.rang === 1 ? 'ers' : 'es'} avec ${me.pts} points, ${fate}.<br><small>Les play-offs et le barrage arriveront dans une prochaine version.</small></div>`;
    } else {
      const home = fx.home === s.team;
      html += `<div class="mine"><div>${name(fx.home)}<small>domicile</small></div><div>${esc(TEAMS[fx.home].salle)}<small>${home ? 'tu reçois' : 'tu te déplaces'}</small></div><div>${name(fx.away)}<small>extérieur</small></div></div>`;
      html += `<h3>Autres matchs de la journée</h3><div class="games">${dayFixtures(s.day)
        .filter((m) => m.home !== fx.home)
        .map((m) => `<div><span>${name(m.home)} – ${name(m.away)}</span></div>`)
        .join('')}</div>`;
    }
    if (s.day > 0) {
      html += `<h3>Résultats de la journée ${s.day}</h3><div class="games">${s.results[s.day - 1]
        .map((r) => `<div class="${r.home === s.team || r.away === s.team ? 'me' : ''}"><span>${name(r.home)} – ${name(r.away)}</span><b>${r.score[0]}-${r.score[1]}${SUFFIX[r.how]}</b></div>`)
        .join('')}</div>`;
    }
    html +=
      '<h3>Classement</h3><table><thead><tr><th></th><th>Équipe</th><th title="Matchs joués">J</th><th title="Victoires">V</th><th title="Victoires après prolongation ou tirs">VP</th><th title="Défaites après prolongation ou tirs">DP</th><th title="Défaites">D</th><th title="Buts pour">BP</th><th title="Buts contre">BC</th><th title="Différence">Diff</th><th>Pts</th></tr></thead><tbody>' +
      table
        .map(
          (r) =>
            `<tr class="${r.rang === 9 ? 'bar' : r.rang === 10 ? 'rel' : ''}${r.id === s.team ? ' me' : ''}"><td>${r.rang}</td><td>${name(r.id)}</td><td>${r.j}</td><td>${r.v}</td><td>${r.vp}</td><td>${r.dp}</td><td>${r.d}</td><td>${r.bp}</td><td>${r.bc}</td><td>${r.diff > 0 ? '+' : ''}${r.diff}</td><td><b>${r.pts}</b></td></tr>`,
        )
        .join('') +
      '</tbody></table><p class="legend">Vert : play-offs (1er à 8e) · jaune : barrage (9e) · rouge : relégation (10e) · a.p. : après prolongation · t.p. : après tirs de pénalité' +
      (this.saved === false ? " · Attention : le navigateur refuse d'enregistrer la saison." : '') +
      '</p>';
    $('seasonBody').innerHTML = html;
    $('seasonPlay').hidden = over;
    $('seasonSim').hidden = over;
    $('seasonPlay').disabled = this.busy;
    $('seasonSim').disabled = this.busy;
    $('seasonDrop').disabled = this.busy;
    $('seasonWait').hidden = !this.busy;
    $('seasonDrop').textContent = this.dropArmed ? 'Confirmer : effacer la saison' : over ? 'Nouvelle saison' : 'Abandonner la saison';
  }

  play() {
    if (this.busy || seasonOver(this.season)) return;
    this.playing = myFixture(this.season);
    this.opts.play();
  }

  /** Match de la journée prêt à jouer. */
  match(humans, opts) {
    return seasonMatch(this.season, this.playing, humans, opts);
  }

  /** Clôt la journée : mine est le résultat du match joué, ou null si tout est simulé. */
  async closeWith(mine) {
    const s = this.season;
    const results = [];
    for (const fx of dayFixtures(s.day)) {
      const isMine = mine && fx.home === mine.home && fx.away === mine.away;
      results.push(isMine ? mine : await simulateAsync(s, fx));
    }
    closeDay(s, results);
    this.saved = save(s);
  }

  /** Fin du match joué : il compte, et les quatre autres matchs sont simulés. */
  async finish(state) {
    const fx = this.playing;
    await this.closeWith(matchResult(fx, state));
  }

  async simulateDay() {
    if (this.busy || seasonOver(this.season)) return;
    this.busy = true;
    this.dropArmed = false;
    this.render();
    await new Promise((r) => setTimeout(r, 30)); // laisse le message s'afficher
    await this.closeWith(null);
    this.busy = false;
    this.render();
  }

  /** Abandon en deux clics, sans fenêtre de confirmation. */
  drop() {
    if (this.busy) return;
    if (!this.dropArmed) {
      this.dropArmed = true;
      return this.render();
    }
    save(null);
    location.search = '';
  }
}
