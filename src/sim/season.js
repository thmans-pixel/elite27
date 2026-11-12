// La saison : calendrier des 18 journées, résultats et classement de la phase de qualification.
// Règlement particulier de la Ligue Élite 2026-2027 pour le barème et les critères d'égalité (voir le cahier
// des charges). Le calendrier est fabriqué par le jeu : ce n'est pas le calendrier officiel.
// Aucune dépendance à l'affichage ni au navigateur : la sauvegarde est faite ailleurs, à partir de l'objet saison.
import { createMatch, step } from './match.js';
import { TEAMS, TEAM_IDS, N1_TEAM, teamById } from '../data/teams.js';

export const DAYS = 18;

/**
 * Calendrier par la méthode du tourniquet : 9 journées aller, puis les mêmes en inversant qui reçoit.
 * Renvoie un tableau de journées, chacune étant une liste de { home, away } (identifiants d'équipe).
 */
export function schedule(ids = TEAM_IDS) {
  const n = ids.length;
  const ring = ids.slice(1);
  const first = [];
  for (let r = 0; r < n - 1; r++) {
    const day = [];
    const row = [ids[0], ...ring.slice(r), ...ring.slice(0, r)];
    for (let i = 0; i < n / 2; i++) {
      const a = row[i];
      const b = row[n - 1 - i];
      // Qui reçoit : réglé pour que personne ne joue plus de trois fois de suite du même côté.
      const swap = i === 0 ? r % 2 === 1 : i % 2 === 1;
      day.push(swap ? { home: b, away: a } : { home: a, away: b });
    }
    first.push(day);
  }
  return [...first, ...first.map((day) => day.map((m) => ({ home: m.away, away: m.home })))];
}

/** Nouvelle saison. Équipe, difficulté et durée des matchs sont fixées pour toute la saison. */
export function createSeason({ team, difficulty = 'normal', periodLength = 120, seed = 2027 }) {
  if (!TEAMS[team]) throw new Error(`Équipe inconnue : ${team}`);
  return { v: 1, team, difficulty, periodLength, seed: seed | 0, day: 0, results: [] };
}

/** Une sauvegarde relue est-elle utilisable ? */
export function validSeason(s) {
  if (!s || s.v !== 1 || !TEAMS[s.team] || !Number.isInteger(s.day) || s.day < 0 || s.day > DAYS || !Array.isArray(s.results) || s.results.length !== s.day) return false;
  if (s.post == null) return true;
  const p = s.post;
  return s.day === DAYS && Array.isArray(p.seeds) && p.seeds.length === 10 && p.seeds.every((id) => TEAMS[id]) && SERIES.every((k) => Array.isArray(p.series?.[k]));
}

export const seasonOver = (season) => season.day >= DAYS;
/** Les cinq matchs de la journée (0 à 17). */
export const dayFixtures = (day) => schedule()[day];
/** Le match de l'équipe du joueur pour la journée à venir, ou null si la phase est finie. */
export function myFixture(season) {
  if (seasonOver(season)) return null;
  return dayFixtures(season.day).find((m) => m.home === season.team || m.away === season.team);
}

/** Match de saison prêt à jouer : toujours avec prolongation et tirs de pénalité, donc jamais de nul. */
export function seasonMatch(season, fx, humans = [], opts = {}) {
  // Graine propre à chaque match : journée et rang dans la journée, ou série et numéro du match en phase finale.
  const [a, b] = fx.key ? [DAYS + 1 + [...SERIES, 'barrage'].indexOf(fx.key), fx.game ?? 0] : [season.day, dayFixtures(season.day).findIndex((m) => m.home === fx.home && m.away === fx.away)];
  const seed = (Math.imul(season.seed, 7919) + a * 104729 + b * 1299709) | 0;
  return createMatch({
    home: structuredClone(teamById(fx.home)),
    away: structuredClone(teamById(fx.away)),
    periodLength: season.periodLength,
    difficulty: season.difficulty,
    humans,
    seed,
    ...opts,
    overtime: true,
  });
}

/** Résultat d'un match terminé, tel qu'il est gardé dans la saison. */
export function matchResult(fx, state) {
  if (state.phase !== 'final' || !state.result || state.result.how === 'nul') throw new Error('Match non terminé');
  const r = { home: fx.home, away: fx.away, score: [...state.score], how: state.result.how, pim: [state.teams[0].pim, state.teams[1].pim] };
  if (fx.key) Object.assign(r, { key: fx.key, game: fx.game });
  return r;
}

/** Joue un match entier entre ordinateurs, sans affichage. */
export function simulate(season, fx, maxTicks = 5_000_000) {
  const state = seasonMatch(season, fx);
  for (let i = 0; i < maxTicks && state.phase !== 'final'; i++) {
    step(state);
    state.events.length = 0;
  }
  return matchResult(fx, state);
}

/**
 * Clôt la journée en cours avec ses cinq résultats (celui du joueur compris) et passe à la suivante.
 * results : liste de résultats, un par match de la journée, dans n'importe quel ordre.
 */
export function closeDay(season, results) {
  const fixtures = dayFixtures(season.day);
  const ordered = fixtures.map((fx) => results.find((r) => r.home === fx.home && r.away === fx.away));
  if (ordered.some((r) => !r)) throw new Error('Il manque un résultat pour clore la journée');
  season.results.push(ordered);
  season.day++;
  if (seasonOver(season)) startPost(season);
  return season;
}

function emptyRow(id) {
  return { id, j: 0, v: 0, vp: 0, dp: 0, d: 0, bp: 0, bc: 0, pts: 0, pim: 0 };
}

/** Lignes brutes à partir d'une liste de résultats. Barème : 3 / 2 / 1 / 0. */
function tally(results, ids) {
  const rows = new Map(ids.map((id) => [id, emptyRow(id)]));
  for (const r of results) {
    const sides = [rows.get(r.home), rows.get(r.away)];
    if (!sides[0] || !sides[1]) continue;
    const w = r.score[0] > r.score[1] ? 0 : 1;
    const extra = r.how !== 'temps';
    sides.forEach((row, i) => {
      row.j++;
      row.bp += r.score[i];
      row.bc += r.score[1 - i];
      row.pim += r.pim?.[i] ?? 0;
      if (i === w) {
        row[extra ? 'vp' : 'v']++;
        row.pts += extra ? 2 : 3;
      } else {
        row[extra ? 'dp' : 'd']++;
        row.pts += extra ? 1 : 0;
      }
    });
  }
  return rows;
}

/**
 * Classement. Égalité de points : goal-average particulier (différence de buts dans les matchs entre les équipes
 * à égalité), puis goal-average général, puis buts marqués, puis temps de pénalité le plus faible.
 */
export function standings(season) {
  const all = season.results.flat();
  const rows = [...tally(all, TEAM_IDS).values()];
  const byPts = new Map();
  for (const row of rows) byPts.set(row.pts, [...(byPts.get(row.pts) ?? []), row]);
  for (const group of byPts.values()) {
    if (group.length < 2) {
      group[0].part = 0;
      continue;
    }
    const ids = group.map((r) => r.id);
    const mini = tally(all.filter((r) => ids.includes(r.home) && ids.includes(r.away)), ids);
    for (const row of group) row.part = mini.get(row.id).bp - mini.get(row.id).bc;
  }
  rows.sort((a, b) => b.pts - a.pts || b.part - a.part || b.bp - b.bc - (a.bp - a.bc) || b.bp - a.bp || a.pim - b.pim || TEAM_IDS.indexOf(a.id) - TEAM_IDS.indexOf(b.id));
  rows.forEach((row, i) => {
    row.rang = i + 1;
    row.diff = row.bp - row.bc;
  });
  return rows;
}

// ---------------------------------------------------------------- play-offs et barrage

/** Séries dans l'ordre où elles se jouent : quatre quarts, deux demi-finales, la finale. */
export const SERIES = ['q1', 'q2', 'q3', 'q4', 's1', 's2', 'f'];
const ROUNDS = [
  { id: 'quarts', nom: 'Quarts de finale', keys: ['q1', 'q2', 'q3', 'q4'] },
  { id: 'demies', nom: 'Demi-finales', keys: ['s1', 's2'] },
  { id: 'finale', nom: 'Finale', keys: ['f'] },
];
export const SERIES_NAMES = { q1: 'Quart 1', q2: 'Quart 2', q3: 'Quart 3', q4: 'Quart 4', s1: 'Demi-finale 1', s2: 'Demi-finale 2', f: 'Finale', barrage: 'Barrage' };

/** Ouvre la phase finale à partir du classement des 18 journées. Sans effet si elle est déjà ouverte. */
export function startPost(season) {
  if (!seasonOver(season) || season.post) return season;
  season.post = { seeds: standings(season).map((r) => r.id), series: Object.fromEntries(SERIES.map((k) => [k, []])), barrage: null };
  return season;
}

const winnerOf = (r) => (r.score[0] > r.score[1] ? r.home : r.away);

/**
 * État d'une série : { key, teams: [mieux classé, moins bien classé] ou null si les affiches ne sont pas connues,
 * wins: [n, n], winner, games }. Quarts : 1er-8e, 2e-7e, 3e-6e, 4e-5e. Demies : vainqueurs des séries 1 et 4,
 * puis 2 et 3. La première équipe à 2 victoires passe.
 */
export function seriesState(season, key) {
  const { seeds, series } = season.post;
  const from = { q1: [0, 7], q2: [1, 6], q3: [2, 5], q4: [3, 4] }[key];
  let pair;
  if (from) pair = from.map((i) => seeds[i]);
  else {
    const feeders = { s1: ['q1', 'q4'], s2: ['q2', 'q3'], f: ['s1', 's2'] }[key];
    pair = feeders.map((k) => seriesState(season, k).winner);
    if (pair.some((id) => !id)) return { key, teams: null, wins: [0, 0], winner: null, games: [] };
  }
  // Le mieux classé à la fin des 18 journées est cité en premier.
  pair.sort((a, b) => seeds.indexOf(a) - seeds.indexOf(b));
  const games = series[key];
  const wins = pair.map((id) => games.filter((g) => winnerOf(g) === id).length);
  return { key, teams: pair, wins, winner: wins[0] >= 2 ? pair[0] : wins[1] >= 2 ? pair[1] : null, games };
}

/** Le tour en cours (quarts, demies, finale), ou null quand le champion est connu. */
export function currentRound(season) {
  return ROUNDS.find((r) => r.keys.some((k) => !seriesState(season, k).winner)) ?? null;
}

/**
 * Matchs à jouer maintenant en phase finale : le prochain match de chaque série ouverte du tour, plus le
 * barrage tant qu'il n'est pas joué. Aller chez le moins bien classé, retour et appui chez le mieux classé.
 */
export function postFixtures(season) {
  const post = season.post;
  if (!post) return [];
  const list = [];
  const round = currentRound(season);
  for (const key of round?.keys ?? []) {
    const st = seriesState(season, key);
    if (st.winner || !st.teams) continue;
    const game = st.games.length + 1;
    const [high, low] = st.teams;
    list.push(game === 1 ? { key, game, home: low, away: high } : { key, game, home: high, away: low });
  }
  // Barrage : le 9e reçoit le 2e de Nationale 1 sur un seul match.
  if (!post.barrage) list.push({ key: 'barrage', game: 1, home: post.seeds[8], away: N1_TEAM.id });
  return list;
}

/** La saison entière est-elle finie (champion connu et barrage joué) ? */
export const finished = (season) => seasonOver(season) && !!season.post && postFixtures(season).length === 0;

/** Matchs à jouer maintenant, en phase de qualification comme en phase finale. */
export const currentFixtures = (season) => (seasonOver(season) ? postFixtures(season) : dayFixtures(season.day));
/** Le match de l'équipe du joueur parmi eux, ou null. */
export const myCurrentFixture = (season) => currentFixtures(season).find((m) => m.home === season.team || m.away === season.team) ?? null;

/** Enregistre les résultats des matchs en cours et avance (journée suivante, ou match suivant des séries). */
export function closeCurrent(season, results) {
  if (!seasonOver(season)) return closeDay(season, results);
  const fixtures = postFixtures(season);
  const ordered = fixtures.map((fx) => results.find((r) => r.key === fx.key && r.game === fx.game && r.home === fx.home));
  if (!ordered.length || ordered.some((r) => !r)) throw new Error('Il manque un résultat de phase finale');
  for (const r of ordered) {
    if (r.key === 'barrage') season.post.barrage = r;
    else season.post.series[r.key].push(r);
  }
  return season;
}

/** Bilan de fin de saison. */
export function summary(season) {
  const post = season.post;
  const final = seriesState(season, 'f');
  const me = season.team;
  const rang = post.seeds.indexOf(me) + 1;
  let parcours;
  if (rang === 10) parcours = 'relégué en Nationale 1';
  else if (rang === 9) parcours = post.barrage ? (winnerOf(post.barrage) === me ? 'maintenu après le barrage' : 'relégué après le barrage') : 'en barrage';
  else if (final.winner === me) parcours = 'champion de France';
  else {
    const out = [...SERIES].reverse().find((k) => seriesState(season, k).teams?.includes(me));
    parcours = { f: 'finaliste', s1: 'éliminé en demi-finale', s2: 'éliminé en demi-finale' }[out] ?? 'éliminé en quart de finale';
  }
  return { champion: final.winner, finaliste: final.winner ? final.teams.find((id) => id !== final.winner) : null, barrage: post.barrage, maintenu: post.barrage ? winnerOf(post.barrage) === post.seeds[8] : null, relegue: post.seeds[9], rang, parcours };
}
