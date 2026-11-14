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

test('deux joueurs dans la même équipe : jamais le même patineur, jamais le gardien, match complet (tirs au but compris)', () => {
  for (const [humans, seed] of [[[{ team: 0 }, { team: 0 }, { team: 1 }, { team: 1 }], 91], [[{ team: 0 }, { team: 0 }], 92], [[{ team: 1 }, { team: 0 }, { team: 1 }], 93]]) {
    let x = seed * 7919;
    const r = () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const keys = humans.map(() => ({}));
    const s = createMatch({ home: structuredClone(TEAMS.valence), away: structuredClone(TEAMS.rethel), humans, seed, periodLength: 120, overtime: true });
    let n = 0;
    let changes = 0;
    let tirs = 0;
    const tireurs = [];
    // Des joueurs qui appuient au hasard ne marquent pas forcément : six tirs au but suffisent.
    while (s.phase !== 'final' && (s.so?.shots?.[0].length ?? 0) + (s.so?.shots?.[1].length ?? 0) < 6 && n++ < 200000) {
      // Pour voir aussi les tirs au but : égalité forcée en fin de match.
      if (s.period === 2 && s.clock < 0.1 && s.phase === 'play') s.score = [2, 2];
      const before = s.humans.map((h) => h.selected);
      step(s, humans.map((_, i) => {
        if (n % 12 === 0) keys[i] = { mx: r() * 2 - 1, my: r() * 2 - 1, pass: r() < 0.25, shoot: r() < 0.3, steal: r() < 0.4, sw: r() < 0.15, skid: r() < 0.1, dodge: r() < 0.2, check: r() < 0.3, line: r() < 0.02, timeout: r() < 0.01 };
        return keys[i];
      }));
      s.events.length = 0;
      s.humans.forEach((h, i) => h.selected !== before[i] && changes++);
      if (s.phase === 'shootout') {
        tirs++;
        // Qui dirige le tireur de ce tir ? (noté une fois par tir)
        const cle = `${s.so.team}-${s.so.shots[s.so.team].length}`;
        const qui = s.humans.findIndex((h) => h.team === s.so.team && h.selected === s.so.shooter);
        if (qui >= 0 && s.so.stage === 'run' && s.so.over == null && tireurs.at(-1)?.cle !== cle) tireurs.push({ cle, equipe: s.so.team, qui });
      }
      for (const h of s.humans) {
        if (h.selected < 0) {
          // Personne à diriger : seulement pendant un tir (au but ou de pénalité), quand le coéquipier tire.
          assert.equal(s.phase, 'shootout', `sans patineur hors tir, pas ${n}`);
          continue;
        }
        const p = s.players[h.selected];
        assert.equal(p.team, h.team);
        assert.ok(!p.goalie, `gardien dirigé, pas ${n}`);
        assert.ok(!s.humans.some((q) => q !== h && q.selected === h.selected), `même patineur pour deux joueurs, pas ${n}`);
      }
    }
    // À tour de rôle : dans une équipe à deux, le tireur n'est pas dirigé deux fois de suite par le même joueur.
    for (const t of [0, 1]) {
      const serie = tireurs.filter((x) => x.equipe === t).map((x) => x.qui);
      if (s.humans.filter((h) => h.team === t).length === 2) for (let i = 1; i < serie.length; i++) assert.notEqual(serie[i], serie[i - 1], `tireurs de l'équipe ${t} : ${serie}`);
    }
    assert.ok(changes > 20, `changements de patineur : ${changes}`);
    assert.ok(tirs > 0, 'pas de tirs au but');
  }
});

test('deux joueurs dans la même équipe : le passeur prend le patineur qui reçoit, sauf si le coéquipier le dirige', () => {
  const s = createMatch({ home: structuredClone(TEAMS.valence), away: structuredClone(TEAMS.rethel), humans: [{ team: 0 }, { team: 0 }], seed: 5 });
  let n = 0;
  while (s.phase !== 'play' && n++ < 2000) step(s, [{}, {}]);
  const [a, b] = s.humans;
  const libre = s.players.find((p) => p.team === 0 && !p.goalie && p.status === 'rink' && p.id !== a.selected && p.id !== b.selected);
  const k = s.puck;
  // Passe du patineur de A vers un coéquipier dirigé par l'ordinateur : A le prend, B ne bouge pas.
  const deB = b.selected;
  const deA = a.selected;
  Object.assign(k, { carrier: -1, passTarget: libre.id, lastTouch: deA, x: libre.x - 4, y: libre.y, vx: 12, vy: 0 });
  step(s, [{}, {}]);
  assert.equal(a.selected, libre.id);
  assert.equal(b.selected, deB);
  // Passe vers le patineur de B : personne ne change.
  Object.assign(k, { carrier: -1, passTarget: deB, lastTouch: a.selected, x: s.players[deB].x - 4, y: s.players[deB].y, vx: 12, vy: 0 });
  const avant = a.selected;
  step(s, [{}, {}]);
  assert.equal(a.selected, avant);
  assert.equal(b.selected, deB);
  // « Changer de joueur » ne donne jamais le patineur du coéquipier.
  Object.assign(k, { carrier: -1, passTarget: -1 });
  for (let i = 0; i < 40; i++) {
    step(s, [{ sw: i % 2 === 0 }, {}]);
    assert.notEqual(a.selected, b.selected);
  }
});
