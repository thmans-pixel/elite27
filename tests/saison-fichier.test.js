// Sauvegarder une saison dans un fichier et la recharger.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeason, closeCurrent, currentFixtures, finished, seasonOver, standings, summary, exportSeason, importSeason, DAYS } from '../src/sim/season.js';

/** Un résultat inventé mais valable pour un match (jamais de nul). */
let graine = 1;
function resultat(fx) {
  graine = (graine * 1103515245 + 12345) & 0x7fffffff;
  const a = graine % 6;
  const b = (graine >> 8) % 6;
  const r = { home: fx.home, away: fx.away, score: a === b ? [a + 1, b] : [a, b], how: ['temps', 'temps', 'prolongation', 'tirs'][(graine >> 4) % 4], pim: [(graine >> 12) % 9, (graine >> 16) % 9] };
  return fx.key ? { ...r, key: fx.key, game: fx.game } : r;
}
const avancer = (s) => closeCurrent(s, currentFixtures(s).map(resultat));

test('une saison sauvegardée puis chargée reprend exactement où elle en était, à chaque étape', () => {
  const s = createSeason({ team: 'valence', difficulty: 'difficile', periodLength: 300, seed: 4242 });
  let etapes = 0;
  let vuPost = false;
  for (let i = 0; i < 80; i++) {
    const relue = importSeason(exportSeason(s));
    assert.deepEqual(relue, s, `étape ${i}, journée ${s.day}`);
    assert.deepEqual(standings(relue), standings(s));
    if (seasonOver(s)) {
      vuPost = true;
      assert.deepEqual(currentFixtures(relue), currentFixtures(s));
    }
    etapes++;
    if (finished(s)) break;
    avancer(s);
  }
  assert.ok(finished(s) && vuPost && etapes > DAYS + 4, `étapes : ${etapes}`);
  assert.deepEqual(summary(importSeason(exportSeason(s))), summary(s));
});

test("un mauvais fichier est refusé : pas une saison, abîmé, trafiqué", () => {
  const s = createSeason({ team: 'rethel', seed: 7 });
  for (let i = 0; i < 6; i++) avancer(s);
  const bon = JSON.parse(exportSeason(s));
  const avec = (f) => {
    const c = structuredClone(bon);
    f(c.saison, c);
    return JSON.stringify(c);
  };
  assert.ok(importSeason(JSON.stringify(bon)));
  for (const [nom, texte] of [
    ['vide', ''],
    ['pas du JSON', 'coucou'],
    ['autre chose', '{"a":1}'],
    ['pas une chaîne', null],
    ['autre jeu', avec((x, c) => (c.jeu = 'autre'))],
    ['fichier coupé', exportSeason(s).slice(0, 400)],
    ['trop gros', ' '.repeat(300_001)],
    ['équipe inconnue', avec((x) => (x.team = 'paris'))],
    ['équipe piégée', avec((x) => (x.team = '__proto__'))],
    ['difficulté inconnue', avec((x) => (x.difficulty = 'divin'))],
    ['durée inconnue', avec((x) => (x.periodLength = 7))],
    ['graine', avec((x) => (x.seed = 'x'))],
    ['journée sans ses résultats', avec((x) => x.day++)],
    ['match nul', avec((x) => (x.results[2][1].score = [3, 3]))],
    ['score absurde', avec((x) => (x.results[0][0].score = [3, -1]))],
    ['score en texte', avec((x) => (x.results[0][0].score = ['<b>9</b>', 1]))],
    ['mauvaise affiche', avec((x) => (x.results[1][0].home = x.results[1][0].away))],
    ['affiche d\'une autre journée', avec((x) => ([x.results[0], x.results[1]] = [x.results[1], x.results[0]]))],
    ['quatre matchs seulement', avec((x) => x.results[3].pop())],
    ['fin de match inconnue', avec((x) => (x.results[0][0].how = 'forfait'))],
    ['phase finale avant la fin', avec((x) => (x.post = { seeds: [], series: {}, barrage: null }))],
  ]) assert.equal(importSeason(texte), null, nom);
  // Les champs inconnus ne sont pas repris.
  const relue = importSeason(avec((x) => ((x.triche = 1), (x.results[0][0].commentaire = '<script>'))));
  assert.ok(relue && !('triche' in relue) && !('commentaire' in relue.results[0][0]));
});

test('phase finale trafiquée : classement ou séries qui ne collent pas aux résultats', () => {
  const s = createSeason({ team: 'caen', seed: 11 });
  while (!seasonOver(s)) avancer(s);
  avancer(s);
  avancer(s);
  const bon = JSON.parse(exportSeason(s));
  const avec = (f) => {
    const c = structuredClone(bon);
    f(c.saison.post);
    return JSON.stringify(c);
  };
  assert.deepEqual(importSeason(JSON.stringify(bon)), s);
  assert.equal(importSeason(avec((p) => p.seeds.reverse())), null, 'classement inversé');
  assert.equal(importSeason(avec((p) => ([p.series.q1[0].home, p.series.q1[0].away] = [p.series.q1[0].away, p.series.q1[0].home]))), null, 'qui reçoit');
  assert.equal(importSeason(avec((p) => p.series.f.push(structuredClone(p.series.q1[0])))), null, 'finale avant les demies');
  assert.equal(importSeason(avec((p) => p.series.q1.push(p.series.q1[0], p.series.q1[0], p.series.q1[0]))), null, 'série trop longue');
  assert.equal(importSeason(avec((p) => (p.barrage = { home: 'valence', away: 'rethel', score: [1, 0], how: 'temps', pim: [0, 0] }))), null, 'faux barrage');
});
