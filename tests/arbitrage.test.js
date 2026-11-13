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

// ---------------------------------------------------------------- arbitre réel
import { refWhistle, refArm, refDecide, refGoal } from '../src/sim/rules.js';
import { Journal } from '../src/sim/arbitrage.js';

function reel(seed, arbitre) {
  const s = createMatch({ home: structuredClone(TEAMS.valence), away: structuredClone(TEAMS.rethel), periodLength: 120, humans: [], seed, rough: rugosite(120), referee: 'humain', overtime: false });
  const j = new Journal();
  let n = 0;
  while (s.phase !== 'final' && n++ < 400000) {
    step(s);
    arbitre(s, j, j.suivre(s));
    s.events.length = 0;
  }
  return { s, lignes: j.cloture() };
}
const accorder = (s, j) => {
  if (s.ref.wait !== 'goal') return;
  const g = s.seen.findLast((q) => q.goal);
  j.but(g, !g.refuse);
  refGoal(s, !g.refuse);
};

test("arbitre réel qui ne siffle rien : aucune pénalité, toutes les fautes vues sont manquées", () => {
  const { s, lignes } = reel(913, accorder);
  assert.equal(s.phase, 'final');
  assert.equal(s.sheet.filter((e) => e.type === 'penalty').length, 0);
  const vues = s.seen.filter((f) => !f.goal).length;
  assert.ok(vues >= 3);
  assert.equal(lignes.filter((l) => l.note.classe === 'faute-manquee').length, vues);
  assert.ok(lignes.every((l) => l.note.points === 0 || l.kind === 'but'));
});

test("arbitre réel parfait : chaque faute est sanctionnée comme le jeu l'a vue, avantage laissé", () => {
  const { s, lignes } = reel(913, (st, j, neuves) => {
    for (const f of neuves) f.immediate ? refWhistle(st) : refArm(st, f.team);
    if (st.ref.wait === 'decision') {
      const f = j.ouvertes.at(-1);
      const d = f ? { faute: true, fautif: f.offender, victime: f.victim, code: f.code, sanction: f.shot ? 'tir' : f.severity, engagement: 'zone' } : { faute: false };
      j.decision(d, { tick: st.tick, periode: st.period, horloge: st.clock, bras: st.ref.byArm });
      refDecide(st, d);
    }
    accorder(st, j);
  });
  assert.equal(s.phase, 'final');
  const fautes = lignes.filter((l) => l.kind === 'faute');
  assert.ok(fautes.length >= 2);
  // Une faute peut échapper à l'arbitre parfait quand un but ou la fin de période coupe l'avantage.
  const sifflees = fautes.filter((l) => l.rep.faute);
  assert.ok(sifflees.length >= 2);
  for (const l of sifflees) assert.equal(l.note.points, l.note.max, JSON.stringify(l.note));
  assert.equal(s.sheet.filter((e) => e.type === 'penalty').length, sifflees.length);
});

test("arbitre réel : sa décision s'applique même fausse, un sifflet sans faute vue est « à tort »", () => {
  let fait = false;
  const { s, lignes } = reel(77, (st, j) => {
    if (!fait && st.phase === 'play' && st.tick > 600) {
      fait = refWhistle(st);
      assert.equal(st.phase, 'whistle');
    }
    if (st.ref.wait === 'decision') {
      const off = st.players.find((p) => p.team === 1 && !p.goalie && p.status === 'rink');
      const d = { faute: true, fautif: off.id, code: 'CIN', sanction: 'major', engagement: 'centre' };
      j.decision(d, { tick: st.tick, periode: st.period, horloge: st.clock, bras: false });
      refDecide(st, d);
      assert.equal(st.call.code, 'CIN');
      assert.equal(st.faceoff.spot.x, 0);
      assert.equal(off.status, 'out'); // majeure : le fautif sort du match (10.1.7)
    }
    accorder(st, j);
  });
  assert.equal(s.sheet.filter((e) => e.type === 'penalty' && e.code === 'CIN' && e.minutes === 5).length, 1);
  assert.ok(lignes.some((l) => l.note.classe === 'sifflet-a-tort' || l.note.classe === 'mal-nommee' || l.note.classe === 'mauvais-fautif'));
});

test('arbitre réel : but refusé par l’arbitre, le score ne bouge pas ; le jeu attend sa décision', () => {
  let refuses = 0;
  const { s } = reel(913, (st, j) => {
    if (st.ref.wait === 'goal') {
      const avant = [...st.score];
      const t = st.tick;
      for (let i = 0; i < 300; i++) step(st); // sans décision, rien ne reprend
      assert.equal(st.ref.wait, 'goal');
      assert.equal(st.phase, 'whistle');
      void t;
      refGoal(st, false);
      refuses++;
      assert.deepEqual(st.score, avant);
    }
  });
  assert.ok(refuses >= 1);
  assert.deepEqual(s.score, [0, 0]);
});
