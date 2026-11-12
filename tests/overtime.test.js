// Étape 2, lot 3 : prolongation et tirs de pénalité.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, step } from '../src/sim/match.js';
import { skatersOnRink, periodLabel } from '../src/sim/state.js';
import { goalCrossed } from '../src/sim/rules.js';
import { shootoutWinner } from '../src/sim/shootout.js';
import { TEAMS } from '../src/data/teams.js';

const make = (opts = {}) => createMatch({ home: structuredClone(TEAMS.valence), away: structuredClone(TEAMS.rethel), humans: [], seed: 9, overtime: true, ...opts });

/** Joue jusqu'à ce que cond soit vraie. inputs(state) donne les commandes des humains. */
function until(s, cond, inputs = () => [], max = 200000) {
  for (let i = 0; i < max && !cond(s); i++) {
    step(s, inputs(s));
    s.events.length = 0;
  }
  assert.ok(cond(s), 'condition jamais atteinte');
}

/** Amène le match à la fin de la 2e période, à égalité. */
function tiedAfterTwo(s) {
  until(s, (m) => m.period === 2 && m.phase === 'play');
  s.score = [1, 1];
  s.clock = 0.05;
}

test('égalité après deux périodes : prolongation à 3 contre 3, sans changement de côté', () => {
  const s = make();
  tiedAfterTwo(s);
  const dir = s.teams[0].dir;
  until(s, (m) => m.period === 3 && m.phase === 'play');
  assert.equal(periodLabel(s), 'Prolongation');
  assert.equal(s.clock <= s.cfg.overtimeLength, true);
  assert.equal(s.teams[0].dir, dir);
  assert.equal(skatersOnRink(s, 0).length, 3);
  assert.equal(skatersOnRink(s, 1).length, 3);
});

test('durée de la prolongation à l échelle du match', () => {
  assert.equal(make({ periodLength: 120 }).cfg.overtimeLength, 25);
  assert.equal(make({ periodLength: 300 }).cfg.overtimeLength, 60);
  assert.equal(make({ periodLength: 600 }).cfg.overtimeLength, 120);
  assert.equal(make({ periodLength: 1500 }).cfg.overtimeLength, 300);
});

test('une pénalité en cours continue en prolongation : 2 contre 3, jamais moins de 2', () => {
  const s = make();
  until(s, (m) => m.period === 2 && m.phase === 'play');
  const off = skatersOnRink(s, 0)[0];
  off.status = 'box';
  s.teams[0].penalties.push({ code: 'CRO', kind: 'minor', offender: off.id, server: off.id, total: 40, remaining: 40 });
  s.score = [0, 0];
  s.clock = 0.05;
  until(s, (m) => m.period === 3 && m.phase === 'play');
  assert.equal(skatersOnRink(s, 0).length, 2);
  assert.equal(skatersOnRink(s, 1).length, 3);
  assert.equal(off.status, 'box');
});

test('un but en prolongation termine le match aussitôt', () => {
  const s = make();
  tiedAfterTwo(s);
  until(s, (m) => m.period === 3 && m.phase === 'play');
  goalCrossed(s, s.teams[1].dir, false); // l'équipe 1 marque
  assert.equal(s.phase, 'goal');
  let faceoffs = 0;
  for (let i = 0; i < 600 && s.phase !== 'final'; i++) {
    step(s);
    faceoffs += s.events.filter((e) => e.type === 'faceoff').length;
    s.events.length = 0;
  }
  assert.equal(s.phase, 'final');
  assert.equal(faceoffs, 0);
  assert.deepEqual(s.result, { how: 'prolongation', winner: 1 });
  assert.deepEqual(s.score, [1, 2]);
});

test('prolongation sans but : tirs de pénalité, et toujours un vainqueur', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const s = make({ seed });
    tiedAfterTwo(s);
    until(s, (m) => m.period === 3 && m.phase === 'play');
    s.clock = 0.05;
    until(s, (m) => m.phase === 'shootout' || m.phase === 'final');
    if (s.phase === 'final') continue; // but dans le dernier pas de la prolongation
    assert.equal(periodLabel(s), 'Tirs de pénalité');
    // Pendant un tir : un seul patineur sur la piste, celui de l'équipe qui tire.
    until(s, (m) => m.so.stage === 'run');
    assert.equal(skatersOnRink(s, s.so.team).length, 1);
    assert.equal(skatersOnRink(s, 1 - s.so.team).length, 0);
    assert.equal(s.so.team, 0, "l'équipe qui reçoit tire la première");
    until(s, (m) => m.phase === 'final');
    assert.equal(s.result.how, 'tirs');
    const [a, b] = s.result.shots;
    assert.equal(shootoutWinner([a, b]), s.result.winner);
    assert.ok(Math.abs(a.length - b.length) <= 1);
    assert.equal(Math.abs(s.score[0] - s.score[1]), 1, 'le vainqueur gagne d un but');
    assert.equal(s.score[s.result.winner], 2);
  }
});

test('décision de la série de tirs', () => {
  const o = true;
  const x = false;
  assert.equal(shootoutWinner([[], []]), -1);
  assert.equal(shootoutWinner([[o], [x]]), -1);
  assert.equal(shootoutWinner([[o, o], [x, x]]), 0); // 2-0, un tir restant
  assert.equal(shootoutWinner([[o, o], [x]]), -1);
  assert.equal(shootoutWinner([[x, x, x], [x]]), -1);
  assert.equal(shootoutWinner([[x, x, x], [x, o]]), 1); // l'équipe 0 a fini ses tirs sans marquer
  assert.equal(shootoutWinner([[o, x, x], [x, o, x]]), -1); // 1-1 après trois : mort subite
  assert.equal(shootoutWinner([[o, x, x, o], [x, o, x]]), -1); // on attend le tir de l'autre équipe
  assert.equal(shootoutWinner([[o, x, x, o], [x, o, x, o]]), -1);
  assert.equal(shootoutWinner([[o, x, x, o, x], [x, o, x, o, o]]), 1);
});

test('trois tireurs différents, puis un même joueur peut retirer', () => {
  const s = make({ seed: 3 });
  tiedAfterTwo(s);
  until(s, (m) => m.period === 3 && m.phase === 'play');
  s.clock = 0.05;
  until(s, (m) => m.phase === 'shootout');
  s.so.roster[0] = s.so.roster[0].slice(0, 3);
  const seen = [];
  let last = -1;
  while (s.phase !== 'final' && seen.length < 12) {
    until(s, (m) => m.phase === 'final' || (m.so.stage === 'setup' && m.so.shots[0].length + m.so.shots[1].length !== last));
    if (s.phase === 'final') break;
    last = s.so.shots[0].length + s.so.shots[1].length;
    if (s.so.team === 0) seen.push(s.so.shooter);
    // On force un tir manqué de chaque côté pour prolonger la série.
    until(s, (m) => m.so.stage === 'run');
    s.so.over = 'miss';
  }
  assert.ok(seen.length >= 4);
  assert.equal(new Set(seen.slice(0, 3)).size, 3);
  assert.equal(seen[3], seen[0]);
});

test('un joueur humain tire avec les commandes habituelles, pour chaque équipe', () => {
  const s = make({ seed: 4, humans: [{ team: 0 }, { team: 1 }] });
  until(s, (m) => m.period === 2 && m.phase === 'play', () => [{}, {}]);
  s.score = [0, 0];
  s.clock = 0.05;
  until(s, (m) => m.period === 3 && m.phase === 'play', () => [{}, {}]);
  s.clock = 0.05;
  until(s, (m) => m.phase === 'shootout' || m.phase === 'final', () => [{}, {}]);
  if (s.phase === 'final') return;
  const shotsSeen = [0, 0];
  const input = (m) => {
    const so = m.so;
    const p = m.players[so.shooter];
    const d = m.teams[so.team].dir;
    // Il avance vers la cage, maintient le tir à 9 m, le relâche à 6 m.
    const dist = 21.2 - p.x * d;
    const mine = { mx: d, my: 0, shoot: so.stage === 'run' && dist < 9 && dist > 6 };
    return so.team === 0 ? [mine, {}] : [{}, mine];
  };
  for (let i = 0; i < 40000 && s.phase !== 'final'; i++) {
    step(s, input(s));
    for (const e of s.events) if (e.type === 'shot') shotsSeen[e.team]++;
    s.events.length = 0;
  }
  assert.equal(s.phase, 'final');
  assert.ok(shotsSeen[0] >= 1 && shotsSeen[1] >= 1, `tirs partis : ${shotsSeen}`);
});

test('sans prolongation, une égalité reste un match nul', () => {
  const s = make({ overtime: false });
  tiedAfterTwo(s);
  until(s, (m) => m.phase === 'final');
  assert.deepEqual(s.result, { how: 'nul', winner: -1 });
  assert.equal(s.period, 2);
});

test('victoire dans le temps réglementaire : pas de prolongation', () => {
  const s = make();
  until(s, (m) => m.period === 2 && m.phase === 'play');
  s.score = [2, 1];
  s.clock = 0.05;
  until(s, (m) => m.phase === 'final');
  assert.deepEqual(s.result, { how: 'temps', winner: 0 });
});
