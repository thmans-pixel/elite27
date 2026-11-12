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
