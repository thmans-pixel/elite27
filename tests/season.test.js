// Étape 3, lot 1 : la saison.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { schedule, createSeason, validSeason, myFixture, dayFixtures, simulate, closeDay, standings, seasonOver, seasonMatch, matchResult, DAYS } from '../src/sim/season.js';
import { TEAM_IDS } from '../src/data/teams.js';
import { step } from '../src/sim/match.js';

test('calendrier : 18 journées de cinq matchs, chacun joue une fois par journée et reçoit chaque adversaire une fois', () => {
  const cal = schedule();
  assert.equal(cal.length, DAYS);
  const seen = new Set();
  const homeCount = Object.fromEntries(TEAM_IDS.map((id) => [id, 0]));
  for (const day of cal) {
    assert.equal(day.length, 5);
    const teams = day.flatMap((m) => [m.home, m.away]);
    assert.equal(new Set(teams).size, 10);
    for (const m of day) {
      const key = `${m.home}>${m.away}`;
      assert.ok(!seen.has(key), key);
      seen.add(key);
      homeCount[m.home]++;
    }
  }
  assert.equal(seen.size, 90);
  for (const id of TEAM_IDS) assert.equal(homeCount[id], 9, id);
  // Personne ne joue plus de trois fois de suite à domicile ou à l'extérieur.
  for (const id of TEAM_IDS) {
    let run = 0;
    let last = null;
    for (const day of cal) {
      const home = day.some((m) => m.home === id);
      run = home === last ? run + 1 : 1;
      last = home;
      assert.ok(run <= 3, `${id} : ${run} matchs de suite du même côté`);
    }
  }
});

const res = (home, away, a, b, how = 'temps', pim = [0, 0]) => ({ home, away, score: [a, b], how, pim });

test('barème 3 / 2 / 1 / 0', () => {
  const s = createSeason({ team: 'valence' });
  s.results = [[res('valence', 'rethel', 3, 1), res('caen', 'anglet', 2, 3, 'prolongation'), res('grenoble', 'angers', 4, 3, 'tirs')]];
  const t = Object.fromEntries(standings(s).map((r) => [r.id, r]));
  assert.equal(t.valence.pts, 3);
  assert.equal(t.rethel.pts, 0);
  assert.equal(t.anglet.pts, 2);
  assert.equal(t.caen.pts, 1);
  assert.equal(t.grenoble.pts, 2);
  assert.equal(t.angers.pts, 1);
  assert.deepEqual([t.anglet.vp, t.caen.dp, t.valence.v, t.rethel.d], [1, 1, 1, 1]);
  assert.equal(t.valence.diff, 2);
  assert.equal(standings(s)[0].id, 'valence');
});

test('égalité de points : goal-average particulier avant le général', () => {
  const s = createSeason({ team: 'valence' });
  // Valence et Rethel à 3 points. Rethel a le meilleur goal-average général, Valence a gagné leur match.
  s.results = [[res('valence', 'rethel', 2, 1)], [res('rethel', 'caen', 9, 0), res('valence', 'anglet', 0, 1)]];
  const t = standings(s);
  const rank = (id) => t.find((r) => r.id === id).rang;
  assert.ok(rank('valence') < rank('rethel'));
});

test('égalité : général, puis buts marqués, puis temps de pénalité', () => {
  let s = createSeason({ team: 'valence' });
  s.results = [[res('valence', 'caen', 3, 1), res('rethel', 'anglet', 5, 1)]];
  assert.ok(standings(s).findIndex((r) => r.id === 'rethel') < standings(s).findIndex((r) => r.id === 'valence'), 'général');
  s.results = [[res('valence', 'caen', 3, 1), res('rethel', 'anglet', 4, 2)]];
  assert.ok(standings(s).findIndex((r) => r.id === 'rethel') < standings(s).findIndex((r) => r.id === 'valence'), 'buts marqués');
  s.results = [[res('valence', 'caen', 3, 1, 'temps', [2, 0]), res('rethel', 'anglet', 3, 1, 'temps', [6, 0])]];
  assert.ok(standings(s).findIndex((r) => r.id === 'valence') < standings(s).findIndex((r) => r.id === 'rethel'), 'pénalités');
});

test('une journée simulée : pas de nul, clôture et passage à la suivante', () => {
  const s = createSeason({ team: 'grenoble', periodLength: 30, seed: 5 });
  const fx = myFixture(s);
  assert.ok(fx.home === 'grenoble' || fx.away === 'grenoble');
  assert.throws(() => closeDay(s, []));
  const results = dayFixtures(0).map((m) => simulate(s, m));
  for (const r of results) {
    assert.notEqual(r.score[0], r.score[1]);
    assert.ok(['temps', 'prolongation', 'tirs'].includes(r.how));
  }
  closeDay(s, results);
  assert.equal(s.day, 1);
  assert.equal(standings(s).reduce((n, r) => n + r.j, 0), 10);
  // La même saison rejouée donne les mêmes résultats.
  const again = createSeason({ team: 'grenoble', periodLength: 30, seed: 5 });
  assert.deepEqual(dayFixtures(0).map((m) => simulate(again, m)), results);
});

test('sauvegarde : une saison relue reprend à la même journée avec le même classement', () => {
  const s = createSeason({ team: 'caen', periodLength: 20, seed: 8 });
  closeDay(s, dayFixtures(0).map((m) => simulate(s, m)));
  const back = JSON.parse(JSON.stringify(s));
  assert.ok(validSeason(back));
  assert.equal(back.day, 1);
  assert.deepEqual(standings(back), standings(s));
  assert.deepEqual(myFixture(back), myFixture(s));
  assert.equal(validSeason({ ...back, team: 'paris' }), false);
  assert.equal(validSeason({ ...back, day: 3 }), false);
  assert.equal(validSeason(null), false);
});

test('un match quitté en cours ne donne pas de résultat', () => {
  const s = createSeason({ team: 'valence', periodLength: 20 });
  const fx = myFixture(s);
  const m = seasonMatch(s, fx, [{ team: fx.home === 'valence' ? 0 : 1 }]);
  for (let i = 0; i < 300; i++) step(m, [{}]);
  assert.throws(() => matchResult(fx, m));
  assert.equal(s.day, 0);
});

test('saison complète : 18 journées, puis plus de match', () => {
  const s = createSeason({ team: 'valence', periodLength: 10, seed: 3 });
  while (!seasonOver(s)) closeDay(s, dayFixtures(s.day).map((m) => simulate(s, m)));
  assert.equal(s.day, 18);
  assert.equal(myFixture(s), null);
  const t = standings(s);
  assert.equal(t.length, 10);
  for (const r of t) assert.equal(r.j, 18);
  assert.deepEqual(t.map((r) => r.rang), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  for (let i = 1; i < 10; i++) assert.ok(t[i - 1].pts >= t[i].pts);
});

// Étape 3, lot 2 : play-offs et barrage.
import { startPost, seriesState, postFixtures, currentRound, closeCurrent, finished, summary, myCurrentFixture, currentFixtures } from '../src/sim/season.js';

/** Saison dont les 18 journées sont jouées, avec un classement imposé : seeds[0] premier, seeds[9] dernier. */
function seasonWithRanks(seeds, team = seeds[0]) {
  const s = createSeason({ team, periodLength: 10, seed: 2 });
  for (const day of schedule()) s.results.push(day.map((m) => (seeds.indexOf(m.home) < seeds.indexOf(m.away) ? res(m.home, m.away, 3, 1) : res(m.home, m.away, 1, 3))));
  s.day = 18;
  startPost(s);
  assert.deepEqual(s.post.seeds, seeds);
  return s;
}
const SEEDS = ['caen', 'villeneuve', 'angers', 'grenoble', 'valence', 'pontdemetz', 'epernay', 'vierzon', 'rethel', 'anglet'];
/** Résultat imposé pour une affiche de phase finale : win gagne. */
const forced = (fx, win) => ({ ...fx, score: fx.home === win ? [3, 1] : [1, 3], how: 'temps', pim: [0, 0] });

test('quarts : 1er-8e, 2e-7e, 3e-6e, 4e-5e ; aller chez le moins bien classé ; barrage du 9e à domicile', () => {
  const s = seasonWithRanks(SEEDS);
  assert.equal(currentRound(s).id, 'quarts');
  const fx = postFixtures(s);
  assert.deepEqual(fx.map((f) => [f.key, f.game, f.home, f.away]), [
    ['q1', 1, 'vierzon', 'caen'],
    ['q2', 1, 'epernay', 'villeneuve'],
    ['q3', 1, 'pontdemetz', 'angers'],
    ['q4', 1, 'valence', 'grenoble'],
    ['barrage', 1, 'rethel', 'n1'],
  ]);
  assert.equal(validSeason(JSON.parse(JSON.stringify(s))), true);
});

test('série : retour et appui chez le mieux classé, arrêt à deux victoires', () => {
  const s = seasonWithRanks(SEEDS);
  // Match 1 : les moins bien classés gagnent tous ; le 9e gagne son barrage.
  closeCurrent(s, postFixtures(s).map((f) => forced(f, f.home)));
  assert.equal(s.post.barrage.home, 'rethel');
  let fx = postFixtures(s);
  assert.equal(fx.length, 4, 'le barrage ne se rejoue pas');
  assert.deepEqual(fx.map((f) => [f.game, f.home]), [[2, 'caen'], [2, 'villeneuve'], [2, 'angers'], [2, 'grenoble']]);
  // Match 2 : q1 et q2 se terminent 2-0 pour le moins bien classé, q3 et q4 reviennent à 1-1.
  closeCurrent(s, fx.map((f) => forced(f, ['q1', 'q2'].includes(f.key) ? f.away : f.home)));
  assert.equal(seriesState(s, 'q1').winner, 'vierzon');
  assert.equal(seriesState(s, 'q2').winner, 'epernay');
  fx = postFixtures(s);
  assert.deepEqual(fx.map((f) => [f.key, f.game, f.home]), [['q3', 3, 'angers'], ['q4', 3, 'grenoble']]);
  assert.equal(currentRound(s).id, 'quarts');
  closeCurrent(s, fx.map((f) => forced(f, f.home)));
  assert.deepEqual(seriesState(s, 'q3').wins, [2, 1]);
  // Demi-finales : vainqueurs des séries 1 et 4, puis 2 et 3, le mieux classé cité en premier.
  assert.equal(currentRound(s).id, 'demies');
  assert.deepEqual(seriesState(s, 's1').teams, ['grenoble', 'vierzon']);
  assert.deepEqual(seriesState(s, 's2').teams, ['angers', 'epernay']);
  assert.deepEqual(postFixtures(s).map((f) => [f.key, f.home, f.away]), [['s1', 'vierzon', 'grenoble'], ['s2', 'epernay', 'angers']]);
  assert.equal(seriesState(s, 'f').teams, null);
  assert.throws(() => closeCurrent(s, []));
});

test('phase finale simulée jusqu au bilan, sauvegarde comprise', () => {
  let s = seasonWithRanks(SEEDS, 'valence');
  assert.equal(myCurrentFixture(s).key, 'q4');
  let guard = 0;
  while (!finished(s) && guard++ < 30) {
    closeCurrent(s, currentFixtures(s).map((f) => simulate(s, f)));
    s = JSON.parse(JSON.stringify(s)); // fermée puis rouverte à chaque étape
    assert.ok(validSeason(s));
  }
  assert.ok(finished(s));
  const b = summary(s);
  assert.ok(SEEDS.slice(0, 8).includes(b.champion));
  assert.notEqual(b.champion, b.finaliste);
  assert.equal(b.relegue, 'anglet');
  assert.equal(typeof b.maintenu, 'boolean');
  assert.equal(b.rang, 5);
  assert.ok(/champion|finaliste|éliminé/.test(b.parcours), b.parcours);
  for (const k of ['q1', 'q2', 'q3', 'q4', 's1', 's2', 'f']) {
    const st = seriesState(s, k);
    assert.ok(st.winner && st.games.length >= 2 && st.games.length <= 3 && Math.max(...st.wins) === 2, k);
    for (const g of st.games) assert.notEqual(g.score[0], g.score[1]);
  }
  assert.equal(myCurrentFixture(s), null);
});

test('9e : barrage à domicile ; 10e : relégué sans match', () => {
  const ninth = seasonWithRanks(SEEDS, 'rethel');
  assert.deepEqual([myCurrentFixture(ninth).key, myCurrentFixture(ninth).home, myCurrentFixture(ninth).away], ['barrage', 'rethel', 'n1']);
  closeCurrent(ninth, postFixtures(ninth).map((f) => forced(f, f.key === 'barrage' ? 'n1' : f.home)));
  assert.equal(myCurrentFixture(ninth), null);
  const last = seasonWithRanks(SEEDS, 'anglet');
  assert.equal(myCurrentFixture(last), null);
  while (!finished(last)) closeCurrent(last, postFixtures(last).map((f) => forced(f, f.home)));
  while (!finished(ninth)) closeCurrent(ninth, postFixtures(ninth).map((f) => forced(f, f.home)));
  assert.equal(summary(last).parcours, 'relégué en Nationale 1');
  assert.equal(summary(ninth).parcours, 'relégué après le barrage');
  assert.equal(summary(ninth).maintenu, false);
});

test('une sauvegarde finie avant ce lot enchaîne sur les play-offs', () => {
  const s = createSeason({ team: 'valence', periodLength: 10, seed: 3 });
  while (!seasonOver(s)) closeDay(s, dayFixtures(s.day).map((m) => simulate(s, m)));
  const old = JSON.parse(JSON.stringify(s));
  delete old.post;
  assert.ok(validSeason(old));
  startPost(old);
  assert.equal(postFixtures(old).length, 5);
  assert.deepEqual(old.post.seeds, standings(old).map((r) => r.id));
});
