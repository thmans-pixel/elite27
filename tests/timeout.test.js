// Étape 2, lot 7 : temps morts et pénalités simultanées.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, step } from '../src/sim/match.js';
import { skatersOnRink, periodLabel } from '../src/sim/state.js';
import { callFoul, stopPlay, whistlePenalties, TIMEOUT_T } from '../src/sim/rules.js';
import { SPOTS } from '../src/sim/geometry.js';
import { TEAMS } from '../src/data/teams.js';

const make = (opts = {}) => createMatch({ home: structuredClone(TEAMS.valence), away: structuredClone(TEAMS.rethel), humans: [{ team: 0 }, { team: 1 }], seed: 31, ...opts });
const idle = () => [{}, {}];
function until(s, cond, inputs = idle, max = 200000) {
  for (let i = 0; i < max && !cond(s); i++) {
    step(s, inputs(s));
    s.events.length = 0;
  }
  assert.ok(cond(s), 'condition jamais atteinte');
}
const playing = (s) => until(s, (m) => m.phase === 'play');
const whistle = (s) => stopPlay(s, 'freeze', { spot: SPOTS.C, call: null });

test('temps mort demandé en plein jeu : pris au prochain arrêt, temps arrêté, lignes fraîches', () => {
  const s = make();
  playing(s);
  s.teams[0].fresh = [0.2, 0.4];
  s.teams[1].fresh = [0.5, 0.6];
  step(s, [{ timeout: true }, {}]);
  step(s, idle());
  assert.equal(s.teams[0].wantTimeout, true);
  for (let i = 0; i < 60; i++) step(s, idle());
  assert.notEqual(s.phase, 'timeout', 'pas de temps mort en plein jeu');
  playing(s);
  s.teams[0].fresh = [0.2, 0.4];
  s.teams[1].fresh = [0.5, 0.6];
  whistle(s);
  until(s, (m) => m.phase === 'timeout');
  assert.equal(periodLabel(s), 'Temps mort');
  assert.match(s.call.titre, /Temps mort — VAL/);
  const clock = s.clock;
  let ticks = 0;
  while (s.phase === 'timeout') {
    step(s, idle());
    ticks++;
  }
  assert.ok(Math.abs(ticks / 60 - TIMEOUT_T) < 0.1);
  assert.equal(s.clock, clock, 'le temps ne tourne pas');
  assert.deepEqual(s.teams[0].fresh, [1, 1]);
  assert.deepEqual(s.teams[1].fresh.map((f) => +f.toFixed(2)), [0.75, 0.8], "l'adversaire récupère la moitié");
  assert.equal(s.teams[0].timeoutUsed, true);
  playing(s);
  assert.equal(skatersOnRink(s, 0).length, 4);
});

test('un seul temps mort par période et par équipe ; de nouveau disponible à la période suivante ; jamais en prolongation', () => {
  const s = make({ overtime: true });
  playing(s);
  step(s, [{ timeout: true }, {}]);
  step(s, idle());
  whistle(s);
  until(s, (m) => m.phase === 'timeout');
  playing(s);
  // Deuxième demande dans la même période : refusée.
  step(s, [{ timeout: true }, {}]);
  step(s, idle());
  assert.equal(s.teams[0].wantTimeout, false);
  playing(s);
  whistle(s);
  let seen = false;
  for (let i = 0; i < 2000 && s.phase !== 'play'; i++) {
    step(s, idle());
    seen = seen || s.phase === 'timeout';
  }
  assert.equal(seen, false);
  // L'autre équipe a toujours le sien.
  step(s, [{}, { timeout: true }]);
  step(s, idle());
  assert.equal(s.teams[1].wantTimeout, true);
  playing(s);
  whistle(s);
  until(s, (m) => m.phase === 'timeout');
  assert.match(s.call.titre, /RET/);
  playing(s);
  // Période suivante : de nouveau disponible.
  s.clock = 0.05;
  until(s, (m) => m.period === 2 && m.phase === 'play');
  assert.equal(s.teams[0].timeoutUsed, false);
  // Prolongation : aucun temps mort.
  s.score = [1, 1];
  s.clock = 0.05;
  until(s, (m) => m.period === 3 && m.phase === 'play');
  step(s, [{ timeout: true }, {}]);
  step(s, idle());
  assert.equal(s.teams[0].wantTimeout, false);
});

test('l ordinateur prend son temps mort quand ses lignes sont entamées en fin de période, s il ne mène pas', () => {
  const s = make({ humans: [] });
  playing(s);
  s.clock = 20;
  s.teams[0].fresh = [0.5, 0.6];
  s.teams[1].fresh = [0.5, 0.6];
  s.score = [2, 1];
  whistle(s);
  until(s, (m) => m.phase === 'timeout', () => []);
  assert.match(s.call.titre, /RET/, 'seule l équipe menée le prend');
  until(s, (m) => m.phase === 'play', () => []);
  assert.equal(s.teams[0].timeoutUsed, false);
  assert.equal(s.teams[1].timeoutUsed, true);
});

/** Deux fautes en attente dans la même action, puis coup de sifflet. */
function bothFoul(s, fouls) {
  playing(s);
  s.puck.carrier = -1;
  for (const f of fouls) s.pending.push({ extra: null, code: 'OBS', severity: 'minor', ...f, team: s.players[f.offender].team, tick: s.tick });
  whistlePenalties(s);
}

test('une mineure de chaque côté au même arrêt : les équipes restent à quatre, retour au premier arrêt après la fin', () => {
  const s = make({ periodLength: 600 });
  playing(s);
  const a = skatersOnRink(s, 0)[1];
  const b = skatersOnRink(s, 1)[2];
  bothFoul(s, [{ offender: a.id }, { offender: b.id }]);
  assert.match(s.call.sanction, /simultanées/);
  assert.equal(s.teams[0].penalties.length + s.teams[1].penalties.length, 0);
  assert.equal(a.status, 'box');
  assert.equal(b.status, 'box');
  assert.equal(a.minors, 1, 'compte pour le cumul');
  playing(s);
  assert.equal(skatersOnRink(s, 0).length, 4);
  assert.equal(skatersOnRink(s, 1).length, 4);
  // Fin de la pénalité : pas de retour en plein jeu, retour à l'arrêt suivant.
  for (const t of s.teams) for (const m of t.misconducts) m.remaining = 0.01;
  for (let i = 0; i < 20 && s.phase === 'play'; i++) step(s, idle());
  if (s.phase === 'play') {
    assert.equal(a.status, 'box');
    whistle(s);
  }
  playing(s);
  assert.notEqual(a.status, 'box');
  assert.notEqual(b.status, 'box');
});

test('deux mineures d un côté, une de l autre : une seule paire remplacée, l équipe qui en a deux joue à trois', () => {
  const s = make({ periodLength: 600 });
  playing(s);
  const [a1, a2] = skatersOnRink(s, 0).slice(1);
  const b = skatersOnRink(s, 1)[2];
  bothFoul(s, [{ offender: a1.id }, { offender: a2.id }, { offender: b.id }]);
  assert.equal(s.teams[0].penalties.length, 1);
  assert.equal(s.teams[1].penalties.length, 0);
  assert.equal(s.teams[0].misconducts.length, 1);
  assert.equal(s.teams[1].misconducts.length, 1);
  playing(s);
  assert.equal(skatersOnRink(s, 0).length, 3);
  assert.equal(skatersOnRink(s, 1).length, 4);
});

test('une mineure et une majeure ne se compensent pas', () => {
  const s = make({ periodLength: 600 });
  playing(s);
  const a = skatersOnRink(s, 0)[1];
  const b = skatersOnRink(s, 1)[2];
  bothFoul(s, [{ offender: a.id }, { offender: b.id, severity: 'major', code: 'INC' }]);
  assert.equal(s.teams[0].penalties.length, 1);
  assert.equal(s.teams[1].penalties.length, 1);
});
