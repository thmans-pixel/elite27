// Écran de la saison : affiche de la journée, résultats, classement, sauvegarde dans le navigateur.
import { createSeason, validSeason, dayFixtures, seasonMatch, matchResult, standings, seasonOver, DAYS, startPost, seriesState, currentRound, currentFixtures, myCurrentFixture, closeCurrent, finished, summary, SERIES_NAMES } from '../sim/season.js';
import { step } from '../sim/match.js';
import { TEAMS, teamById } from '../data/teams.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const KEY = 'elite27.saison';
const SUFFIX = { temps: '', prolongation: ' a.p.', tirs: ' t.p.' };

/** Une seule saison à la fois, gardée dans la mémoire locale du navigateur. Rien n'est envoyé ailleurs. */
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    // Une saison finie avant l'arrivée des play-offs enchaîne dessus.
    return validSeason(s) ? startPost(s) : null;
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
      ? `Saison en cours avec ${TEAMS[s.team].nom} : ${finished(s) ? 'saison terminée' : seasonOver(s) ? 'phase finale' : `journée ${s.day + 1} sur ${DAYS}`}.`
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

  /** Tableau des play-offs : une ligne par série, avec son score et le détail des matchs. */
  bracket() {
    const s = this.season;
    const name = (id) => esc(teamById(id).nom);
    const line = (key) => {
      const st = seriesState(s, key);
      if (!st.teams) return `<div><span>${SERIES_NAMES[key]} : à venir</span></div>`;
      const mine = st.teams.includes(s.team) ? 'me' : '';
      const games = st.games.map((g) => `${teamById(g.home).sigle} ${g.score[0]}-${g.score[1]}${SUFFIX[g.how]} ${teamById(g.away).sigle}`).join(' · ');
      const who = st.teams.map((id) => (id === st.winner ? `<u>${name(id)}</u>` : name(id))).join(' – ');
      return `<div class="${mine}"><span>${SERIES_NAMES[key]} : ${who}${games ? `<small>${esc(games)}</small>` : ''}</span><b>${st.wins[0]}-${st.wins[1]}</b></div>`;
    };
    const bar = s.post.barrage;
    const barrage = `<div class="${s.post.seeds[8] === s.team ? 'me' : ''}"><span>Barrage : ${name(s.post.seeds[8])} – ${name('n1')}</span><b>${bar ? `${bar.score[0]}-${bar.score[1]}${SUFFIX[bar.how]}` : 'à jouer'}</b></div>`;
    return (
      `<h3>Quarts de finale</h3><div class="games series">${['q1', 'q2', 'q3', 'q4'].map(line).join('')}</div>` +
      `<h3>Demi-finales et finale</h3><div class="games series">${['s1', 's2', 'f'].map(line).join('')}</div>` +
      `<h3>Barrage et relégation</h3><div class="games series">${barrage}<div><span>Relégué en Nationale 1 : ${name(s.post.seeds[9])}</span></div></div>`
    );
  }

  render() {
    const s = this.season;
    const regular = !seasonOver(s);
    const done = finished(s);
    const fx = myCurrentFixture(s);
    const table = standings(s);
    const name = (id) => esc(teamById(id).nom);
    const round = regular ? null : currentRound(s);
    $('seasonTag').textContent = regular ? 'Saison 2026-2027 · phase de qualification' : 'Saison 2026-2027 · phase finale';
    $('seasonTitle').textContent = regular ? `Journée ${s.day + 1} sur ${DAYS}` : done ? 'Bilan de la saison' : (round?.nom ?? 'Barrage');
    let html = '';
    if (done) {
      const b = summary(s);
      html += `<div class="end">Champion de France : ${name(b.champion)}<br><small>Finaliste : ${name(b.finaliste)} · Barrage : ${name(s.post.seeds[8])} ${b.maintenu ? 'se maintient' : 'descend, le 2e de Nationale 1 monte'} · Relégué : ${name(b.relegue)}</small><br>${name(s.team)} : ${b.rang}${b.rang === 1 ? 'ers' : 'es'} de la phase de qualification, ${esc(b.parcours)}.</div>`;
    }
    if (fx) {
      const home = fx.home === s.team;
      let label = home ? 'tu reçois' : 'tu te déplaces';
      if (fx.key) {
        const st = fx.key === 'barrage' ? null : seriesState(s, fx.key);
        label = fx.key === 'barrage' ? 'barrage, un seul match' : `${SERIES_NAMES[fx.key]}, match ${fx.game} · série ${st.wins[st.teams.indexOf(s.team)]}-${st.wins[1 - st.teams.indexOf(s.team)]}`;
      }
      html += `<div class="mine"><div>${name(fx.home)}<small>domicile</small></div><div>${esc(teamById(fx.home).salle)}<small>${esc(label)}</small></div><div>${name(fx.away)}<small>extérieur</small></div></div>`;
    } else if (!done) {
      html += `<div class="end">${name(s.team)} n'a pas de match à jouer maintenant.<br><small>« Simuler la suite » fait jouer les autres matchs.</small></div>`;
    }
    if (regular) {
      html += `<h3>Autres matchs de la journée</h3><div class="games">${dayFixtures(s.day)
        .filter((m) => m.home !== fx.home)
        .map((m) => `<div><span>${name(m.home)} – ${name(m.away)}</span></div>`)
        .join('')}</div>`;
      if (s.day > 0) {
        html += `<h3>Résultats de la journée ${s.day}</h3><div class="games">${s.results[s.day - 1]
          .map((r) => `<div class="${r.home === s.team || r.away === s.team ? 'me' : ''}"><span>${name(r.home)} – ${name(r.away)}</span><b>${r.score[0]}-${r.score[1]}${SUFFIX[r.how]}</b></div>`)
          .join('')}</div>`;
      }
    } else html += this.bracket();
    html +=
      `<h3>${regular ? 'Classement' : 'Classement de la phase de qualification'}</h3><table><thead><tr><th></th><th>Équipe</th><th title="Matchs joués">J</th><th title="Victoires">V</th><th title="Victoires après prolongation ou tirs">VP</th><th title="Défaites après prolongation ou tirs">DP</th><th title="Défaites">D</th><th title="Buts pour">BP</th><th title="Buts contre">BC</th><th title="Différence">Diff</th><th>Pts</th></tr></thead><tbody>` +
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
    $('seasonPlay').hidden = !fx;
    $('seasonSim').hidden = done;
    $('seasonSim').textContent = regular ? 'Simuler la journée' : fx ? 'Simuler ces matchs' : 'Simuler la suite';
    $('seasonPlay').disabled = this.busy;
    $('seasonSim').disabled = this.busy;
    $('seasonDrop').disabled = this.busy;
    $('seasonWait').hidden = !this.busy;
    $('seasonDrop').textContent = this.dropArmed ? 'Confirmer : effacer la saison' : done ? 'Nouvelle saison' : 'Abandonner la saison';
  }

  play() {
    if (this.busy) return;
    this.playing = myCurrentFixture(this.season);
    if (!this.playing) return;
    this.opts.play();
  }

  /** Match de la journée prêt à jouer. */
  match(humans, opts) {
    return seasonMatch(this.season, this.playing, humans, opts);
  }

  /** Clôt la journée ou les matchs de phase finale en cours : mine est le résultat du match joué, ou null si tout est simulé. */
  async closeWith(mine) {
    const s = this.season;
    const results = [];
    for (const fx of currentFixtures(s)) {
      const isMine = mine && fx.home === mine.home && fx.away === mine.away;
      results.push(isMine ? mine : await simulateAsync(s, fx));
    }
    closeCurrent(s, results);
    this.saved = save(s);
  }

  /** Fin du match joué : il compte, et les quatre autres matchs sont simulés. */
  async finish(state) {
    const fx = this.playing;
    await this.closeWith(matchResult(fx, state));
  }

  async simulateDay() {
    if (this.busy || finished(this.season)) return;
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
