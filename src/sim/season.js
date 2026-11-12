// La saison : calendrier des 18 journées, résultats et classement de la phase de qualification.
// Règlement particulier de la Ligue Élite 2026-2027 pour le barème et les critères d'égalité (voir le cahier
// des charges). Le calendrier est fabriqué par le jeu : ce n'est pas le calendrier officiel.
// Aucune dépendance à l'affichage ni au navigateur : la sauvegarde est faite ailleurs, à partir de l'objet saison.
import { createMatch, step } from './match.js';
import { TEAMS, TEAM_IDS } from '../data/teams.js';

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
  return !!s && s.v === 1 && !!TEAMS[s.team] && Number.isInteger(s.day) && s.day >= 0 && s.day <= DAYS && Array.isArray(s.results) && s.results.length === s.day;
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
  const index = dayFixtures(season.day).findIndex((m) => m.home === fx.home && m.away === fx.away);
  const seed = (Math.imul(season.seed, 7919) + season.day * 104729 + index * 1299709) | 0;
  return createMatch({
    home: structuredClone(TEAMS[fx.home]),
    away: structuredClone(TEAMS[fx.away]),
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
  return { home: fx.home, away: fx.away, score: [...state.score], how: state.result.how, pim: [state.teams[0].pim, state.teams[1].pim] };
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
