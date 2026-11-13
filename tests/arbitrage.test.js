import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, step } from '../src/sim/match.js';
import { TEAMS } from '../src/data/teams.js';
import { INFRACTIONS } from '../src/data/infractions.js';
import { Observateur, propositions, noter, bilan, hasard, rugosite, familleDe, MAX_SITUATIONS } from '../src/sim/arbitrage.js';

const faute = { faute: true, code: 'CIN', fautif: 3, victime: 7, sanction: 'minor', engagement: 'zone', famille: 'crosse' };
const juste = { faute: true, fautif: 3, code: 'CIN', sanction: 'minor', engagement: 'zone' };

function jouer(seed, len = 120, observer = true) {
  const s = createMatch({ home: structuredClone(TEAMS.valence), away: structuredClone(TEAMS.grenoble), periodLength: len, humans: [], seed, rough: rugosite(len) });
  const o = new Observateur(seed, len);
  const sits = [];
  let n = 0;
  while (s.phase !== 'final' && n++ < 400000) {
    step(s);
    if (observer) {
      const sit = o.observe(s, s.events);
      if (sit) sits.push({ sit, phase: s.phase, call: s.call });
    }
    s.events.length = 0;
  }
  return { s, sits };
}

test('barème : décision juste, erreurs partielles, faute manquée, sifflet à tort', () => {
  assert.deepEqual(noter(faute, juste).points, 6);
  assert.equal(noter(faute, juste).classe, 'juste');
  assert.equal(noter(faute, { ...juste, code: 'ACC' }).points, 5.5); // même famille : un demi-point
  assert.equal(noter(faute, { ...juste, code: 'OBS' }).classe, 'mal-nommee');
  assert.equal(noter(faute, { ...juste, fautif: 4 }).classe, 'mauvais-fautif');
  assert.equal(noter(faute, { ...juste, sanction: 'major' }).classe, 'mauvaise-sanction');
  assert.equal(noter(faute, { ...juste, engagement: 'centre' }).classe, 'mauvais-engagement');
  assert.deepEqual(noter(faute, { faute: false }), { points: 0, max: 6, detail: { faute: 0, fautif: 0, infraction: 0, sanction: 0, engagement: 0 }, classe: 'faute-manquee' });
  const reg = { faute: false, famille: 'charge' };
  assert.equal(noter(reg, { faute: false }).classe, 'juste');
  assert.equal(noter(reg, { faute: true, fautif: 1, code: 'INC' }).classe, 'sifflet-a-tort');
  // Tir de pénalité : pas de question d'engagement, donc cinq points au plus.
  assert.equal(noter({ ...faute, sanction: 'tir', engagement: null }, { ...juste, sanction: 'tir', engagement: null }).max, 5);
});

test('note sur 20 et erreurs les plus fréquentes', () => {
  const b = bilan([{ note: noter(faute, juste) }, { note: noter(faute, { faute: false }) }, { note: noter(faute, { faute: false }) }, { note: noter({ faute: false }, { faute: false }) }]);
  assert.equal(b.points, 8);
  assert.equal(b.max, 20);
  assert.equal(b.note, 8);
  assert.deepEqual(b.erreurs[0], ['faute-manquee', 2]);
});

test('quatre infractions proposées, toutes jouables, la bonne comprise, la famille en priorité', () => {
  for (const code of ['ACC', 'CIN', 'TRE', 'INC', 'CBA', 'DOS', 'OBS']) {
    const p = propositions(code, hasard(7));
    assert.equal(new Set(p).size, 4);
    assert.ok(p.includes(code));
    assert.ok(p.every((c) => INFRACTIONS[c].jouable));
    if (familleDe(code) !== 'obstruction') assert.ok(p.filter((c) => familleDe(c) === familleDe(code)).length === 3);
  }
  assert.equal(propositions(null, hasard(3), 'charge').length, 4);
});

test("un match arbitré donne des situations cohérentes avec ce que le jeu siffle", () => {
  let total = 0;
  let regulieres = 0;
  for (const seed of [11, 12, 13]) {
    const { sits } = jouer(seed);
    assert.ok(sits.length <= MAX_SITUATIONS);
    for (const { sit, phase, call } of sits) {
      total++;
      const v = sit.verite;
      if (sit.kind === 'reguliere') {
        regulieres++;
        assert.equal(v.faute, false);
        assert.equal(phase, 'play');
      } else {
        assert.equal(phase, 'whistle');
        assert.equal(call.kind, 'penalty');
        assert.equal(v.code, call.code);
        assert.ok(['minor', 'major', 'tir'].includes(v.sanction));
        assert.ok(v.fautif >= 0);
      }
    }
  }
  assert.ok(total >= 9, `seulement ${total} situations sur trois matchs`);
  assert.ok(regulieres >= 1);
});

test("observer le match ne le change pas : même score avec ou sans arbitre", () => {
  const a = jouer(21, 120, true).s;
  const b = jouer(21, 120, false).s;
  assert.deepEqual(a.score, b.score);
  assert.equal(a.tick, b.tick);
});
