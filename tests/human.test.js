import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, step } from '../src/sim/match.js';
import { TEAMS } from '../src/data/teams.js';

function play(humans, inputFn, seed) {
  const s = createMatch({ home: structuredClone(TEAMS.valence), away: structuredClone(TEAMS.rethel), humans, seed });
  let n = 0;
  while (s.phase !== 'final' && n++ < 200000) {
    step(s, humans.map((_, i) => inputFn(s, i, n)));
    s.events.length = 0;
  }
  return s;
}

test('face à un joueur qui ne touche à rien, l\'ordinateur marque en difficulté normale', () => {
  let against = 0;
  for (let i = 0; i < 4; i++) {
    const s = play([{ team: 0 }], () => ({ mx: 0, my: 0 }), 300 + i);
    assert.equal(s.phase, 'final');
    against += s.score[1];
  }
  assert.ok(against >= 4, `buts de l'ordinateur sur 4 matchs : ${against}`);
});

test('deux joueurs qui appuient sur tout au hasard : le match va au bout sans erreur', () => {
  let x = 12345;
  const r = () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const keys = [{}, {}];
  const s = play(
    [{ team: 0 }, { team: 1 }],
    (st, i, n) => {
      if (n % 12 === 0) keys[i] = { mx: r() * 2 - 1, my: r() * 2 - 1, pass: r() < 0.15, shoot: r() < 0.4, steal: r() < 0.4, sw: r() < 0.1, skid: r() < 0.15, dodge: r() < 0.2, check: r() < 0.3, kneel: r() < 0.12 };
      return keys[i];
    },
    77,
  );
  assert.equal(s.phase, 'final');
  for (const p of s.players) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.vx));
  assert.ok(Number.isFinite(s.puck.x) && Number.isFinite(s.puck.y) && Number.isFinite(s.puck.z));
  // Personne ne finit hors de la piste.
  for (const p of s.players) if (p.status === 'rink') assert.ok(Math.abs(p.x) <= 25.01 && Math.abs(p.y) <= 12.51, `n° ${p.num} hors piste`);
  const pens = s.sheet.filter((e) => e.type === 'penalty').length;
  console.log(`    score ${s.score.join('-')}, pénalités sifflées : ${pens}`);
});

test('avec toutes les touches au hasard, trois autres matchs vont au bout (graines différentes, tous niveaux)', () => {
  for (const [seed, difficulty] of [[5, 'facile'], [91, 'normal'], [404, 'difficile']]) {
    let x = seed * 7919;
    const r = () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    let keys = {};
    const s = createMatch({ home: structuredClone(TEAMS.valence), away: structuredClone(TEAMS.rethel), humans: [{ team: 0 }], seed, difficulty });
    let n = 0;
    let out = 0;
    while (s.phase !== 'final' && n++ < 200000) {
      if (n % 9 === 0) keys = { mx: r() * 2 - 1, my: r() * 2 - 1, pass: r() < 0.2, shoot: r() < 0.5, steal: r() < 0.3, sw: r() < 0.05, skid: r() < 0.2, dodge: r() < 0.3, check: r() < 0.3, kneel: r() < 0.15 };
      step(s, [keys]);
      s.events.length = 0;
      for (const p of s.players) {
        assert.ok(Number.isFinite(p.x + p.y + p.vx + p.vy + p.face), `position invalide (graine ${seed}, pas ${n})`);
        if (p.status === 'rink' && (Math.abs(p.x) > 25.6 || Math.abs(p.y) > 13.1)) out++;
      }
      assert.ok(Number.isFinite(s.puck.x + s.puck.y + s.puck.z));
    }
    assert.equal(s.phase, 'final', `match terminé (graine ${seed})`);
    assert.equal(out, 0, 'aucun joueur nettement hors de la piste');
  }
});
