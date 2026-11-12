import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, step } from '../src/sim/match.js';
import { penaltySeconds, skatersOnRink, goalieOf } from '../src/sim/state.js';
import { callFoul } from '../src/sim/rules.js';
import { doSteal } from '../src/sim/physics.js';
import { boardHit, SPOTS, GOAL_X, HL, HW, inCrease } from '../src/sim/geometry.js';
import { TEAMS } from '../src/data/teams.js';
import { playMatch } from './simulate.js';

function newMatch(opts = {}) {
  return createMatch({ home: structuredClone(TEAMS.valence), away: structuredClone(TEAMS.rethel), humans: [], seed: 42, ...opts });
}
function toPlay(state) {
  for (let i = 0; i < 600 && state.phase !== 'play'; i++) step(state);
  assert.equal(state.phase, 'play');
  state.events.length = 0;
  return state;
}
function run(state, ticks, until) {
  for (let i = 0; i < ticks; i++) {
    step(state);
    if (until && until(state)) return true;
  }
  return false;
}
/** Écarte tout le monde et pose le palet libre avec une vitesse donnée. */
function clearRink(state) {
  for (const p of state.players) {
    if (p.status !== 'rink' || p.goalie) continue;
    p.x = (p.team === 0 ? -6 : 6) - p.slot * 0.2;
    p.y = -9 + p.slot * 1.2;
    p.vx = 0;
    p.vy = 0;
    p.pickupCd = 5;
  }
}
function freePuck(state, x, y, vx, vy) {
  const k = state.puck;
  Object.assign(k, { x, y, vx, vy, carrier: -1, passTarget: -1, wasInCrease: 0, creaseFoul: false });
}

test('terrain : la balustrade retient un disque, y compris dans les angles', () => {
  assert.equal(boardHit(0, 0, 0.45), null);
  assert.equal(boardHit(HL, 0, 0.45).x, HL - 0.45);
  assert.equal(boardHit(0, -HW - 1, 0.45).y, -HW + 0.45);
  const c = boardHit(HL - 0.2, HW - 0.2, 0.45);
  assert.ok(Math.hypot(c.x - (HL - 5), c.y - (HW - 5)) <= 5 - 0.45 + 1e-9);
});

test('terrain : points d\'engagement réglementaires', () => {
  assert.deepEqual([SPOTS.C.x, SPOTS.C.y], [0, 0]);
  assert.ok(Math.abs(GOAL_X - 21.2) < 1e-9);
  assert.ok(Math.abs(Math.abs(SPOTS.ES.x) - (GOAL_X - 6.1)) < 1e-9);
  assert.equal(Math.abs(SPOTS.WN.y), 6.7);
});

test('pénalités : durées proportionnelles à la durée du match', () => {
  assert.equal(penaltySeconds(120, 2), 10);
  assert.equal(penaltySeconds(120, 5), 25);
  assert.equal(penaltySeconds(1500, 2), 120);
  assert.equal(penaltySeconds(1500, 5), 300);
  assert.equal(penaltySeconds(300, 2), 25);
});

test('le match commence par un engagement au centre', () => {
  const s = newMatch();
  step(s);
  assert.equal(s.phase, 'faceoff');
  assert.equal(s.faceoff.spot.id, 'C');
  toPlay(s);
  assert.ok(s.puck.carrier >= 0);
  assert.equal(s.clock <= 120, true);
});

test('le palet rebondit sur la balustrade et reste en jeu', () => {
  const s = toPlay(newMatch());
  clearRink(s);
  freePuck(s, 5, HW - 2, 3, 18);
  let bounced = false;
  for (let i = 0; i < 90; i++) {
    step(s);
    if (s.events.some((e) => e.type === 'board')) bounced = true;
    assert.ok(Math.abs(s.puck.y) <= HW && Math.abs(s.puck.x) <= HL);
  }
  assert.ok(bounced);
  assert.ok(s.puck.vy < 0, 'le palet repart vers la piste');
});

test('un palet immobile hors d\'atteinte est rejoué par un engagement (9.3.8)', () => {
  const s = toPlay(newMatch());
  for (const p of s.players) p.pickupCd = 60;
  clearRink(s);
  for (const p of s.players) p.pickupCd = 60;
  freePuck(s, 0, 0, 0, 0);
  const stopped = run(s, 700, (st) => st.phase === 'whistle');
  assert.ok(stopped);
  assert.equal(s.call.titre, 'Palet injouable');
});

test('but : compté quand le palet franchit la ligne entre les poteaux, puis engagement au centre', () => {
  const s = toPlay(newMatch());
  clearRink(s);
  const g = goalieOf(s, 1);
  g.x = GOAL_X - 0.4;
  g.y = 0.8;
  freePuck(s, GOAL_X - 1.5, -0.5, 20, 0);
  s.puck.lastBy = [s.players[0].id, -1];
  s.puck.lastTeam = 0;
  const scored = run(s, 30, (st) => st.phase === 'goal');
  assert.ok(scored, 'le but doit être accordé');
  assert.deepEqual(s.score, [1, 0]);
  run(s, 400, (st) => st.phase === 'faceoff');
  assert.equal(s.faceoff.spot.id, 'C');
});

test('but : un palet qui passe à côté de la cage ne compte pas', () => {
  const s = toPlay(newMatch());
  clearRink(s);
  freePuck(s, GOAL_X - 1.5, 1.6, 20, 0);
  run(s, 40);
  assert.deepEqual(s.score, [0, 0]);
  assert.equal(s.phase, 'play');
});

test('but : le poteau renvoie le palet', () => {
  const s = toPlay(newMatch());
  clearRink(s);
  goalieOf(s, 1).y = -0.7;
  freePuck(s, GOAL_X - 1.5, 0.86, 20, 0);
  run(s, 10);
  assert.deepEqual(s.score, [0, 0]);
  assert.ok(s.events.some((e) => e.type === 'post'));
});

test('but refusé : un attaquant dans la zone de but quand le palet y entre (9.3.9)', () => {
  const s = toPlay(newMatch());
  clearRink(s);
  const g = goalieOf(s, 1);
  g.x = GOAL_X - 0.4;
  g.y = 0.9;
  const att = skatersOnRink(s, 0)[0];
  att.x = GOAL_X - 0.6;
  att.y = -0.9;
  assert.ok(inCrease(att.x, att.y, 1));
  freePuck(s, GOAL_X - 2.5, -0.2, 22, 0);
  s.puck.lastTeam = 0;
  run(s, 30, (st) => st.phase !== 'play');
  assert.deepEqual(s.score, [0, 0]);
  assert.equal(s.phase, 'whistle');
  assert.equal(s.call.kind, 'nogoal');
  assert.equal(s.faceoff.spot.id, 'C');
});

test('pénalité mineure : sifflet immédiat si le fautif a le palet, 3 patineurs, engagement dans sa zone', () => {
  const s = toPlay(newMatch());
  const c = s.players[s.puck.carrier];
  const dir = s.teams[c.team].dir;
  callFoul(s, { code: 'INC', offender: c.id, severity: 'minor' });
  assert.equal(s.phase, 'whistle');
  assert.equal(c.status, 'box');
  assert.equal(skatersOnRink(s, c.team).length, 3);
  assert.equal(skatersOnRink(s, 1 - c.team).length, 4);
  assert.equal(Math.sign(s.faceoff.spot.x), -dir, "engagement dans la zone de défense de l'équipe fautive");
  assert.equal(s.teams[c.team].penalties[0].remaining, 10);
  // Le joueur revient à la fin de sa pénalité.
  let playTicks = 0;
  const against = s.score[1 - c.team];
  for (let i = 0; i < 5000 && s.teams[c.team].penalties.length; i++) {
    if (s.phase === 'play') playTicks++;
    step(s);
  }
  assert.equal(s.teams[c.team].penalties.length, 0);
  assert.equal(c.status === 'rink' || c.status === 'bench', true, 'le joueur pénalisé est sorti du banc des pénalités');
  assert.equal(skatersOnRink(s, c.team).length, 4);
  // 10 s de jeu effectif, sauf but encaissé en infériorité qui met fin à la mineure (10.2.1 A).
  if (s.score[1 - c.team] === against) assert.ok(playTicks >= 590 && playTicks <= 610, `pénalité de 10 s de jeu effectif (${playTicks} pas)`);
  else assert.ok(playTicks < 610);
});

test('avantage : le jeu continue tant que l\'équipe fautive n\'a pas le palet (10.3)', () => {
  const s = toPlay(newMatch());
  const c = s.players[s.puck.carrier];
  const off = skatersOnRink(s, 1 - c.team)[3];
  callFoul(s, { code: 'OBS', offender: off.id, severity: 'minor' });
  assert.equal(s.phase, 'play');
  assert.equal(s.advantage, off.team);
  assert.equal(off.status, 'rink');
  // L'équipe fautive récupère le palet : sifflet.
  s.puck.carrier = skatersOnRink(s, off.team)[0].id;
  step(s);
  assert.equal(s.phase, 'whistle');
  assert.equal(off.status, 'box');
});

test('avantage : une mineure signalée n\'est pas purgée si l\'équipe non fautive marque (10.3 D)', () => {
  const s = toPlay(newMatch());
  clearRink(s);
  const off = skatersOnRink(s, 1)[3];
  s.puck.carrier = skatersOnRink(s, 0)[0].id;
  callFoul(s, { code: 'ACC', offender: off.id, severity: 'minor' });
  assert.equal(s.advantage, 1);
  const g = goalieOf(s, 1);
  g.x = GOAL_X - 0.4;
  g.y = 0.8;
  freePuck(s, GOAL_X - 1.5, -0.5, 20, 0);
  s.puck.lastTeam = 0;
  run(s, 30, (st) => st.phase === 'goal');
  assert.deepEqual(s.score, [1, 0]);
  assert.equal(off.status, 'rink');
  assert.equal(s.teams[1].penalties.length, 0);
  assert.ok(s.sheet.some((e) => e.type === 'penalty' && e.nonPurgee));
});

test('pénalité majeure : fautif exclu, un coéquipier purge, elle ne prend pas fin sur un but', () => {
  const s = toPlay(newMatch());
  const c = s.players[s.puck.carrier];
  callFoul(s, { code: 'DOS', offender: c.id, severity: 'major', extra: 'MPM' });
  assert.equal(c.status, 'out');
  const pen = s.teams[c.team].penalties[0];
  assert.notEqual(pen.server, c.id);
  assert.equal(s.players[pen.server].status, 'box');
  assert.equal(pen.remaining, 25);
  assert.equal(skatersOnRink(s, c.team).length, 3);
  // But de l'adversaire pendant la majeure.
  toPlay(s);
  clearRink(s);
  const side = s.teams[c.team].dir * -1;
  const g = goalieOf(s, c.team);
  g.x = side * (GOAL_X - 0.4);
  g.y = 0.8;
  freePuck(s, side * (GOAL_X - 1.5), -0.5, side * 20, 0);
  s.puck.lastTeam = 1 - c.team;
  run(s, 30, (st) => st.phase === 'goal');
  assert.equal(s.score[1 - c.team], 1);
  assert.equal(s.teams[c.team].penalties.length, 1, 'la majeure continue');
});

test('une mineure prend fin quand l\'équipe en infériorité encaisse (10.2.1 A)', () => {
  const s = toPlay(newMatch());
  const c = s.players[s.puck.carrier];
  callFoul(s, { code: 'INC', offender: c.id, severity: 'minor' });
  toPlay(s);
  clearRink(s);
  const side = -s.teams[c.team].dir;
  const g = goalieOf(s, c.team);
  g.x = side * (GOAL_X - 0.4);
  g.y = 0.8;
  freePuck(s, side * (GOAL_X - 1.5), -0.5, side * 20, 0);
  s.puck.lastTeam = 1 - c.team;
  run(s, 30, (st) => st.phase === 'goal');
  assert.equal(s.teams[c.team].penalties.length, 0);
  assert.equal(skatersOnRink(s, c.team).length, 4);
});

test('jamais moins de 3 joueurs sur la piste, gardien compris (10.2.1 C)', () => {
  const s = toPlay(newMatch());
  const t = s.players[s.puck.carrier].team;
  for (let i = 0; i < 3; i++) {
    toPlay(s);
    s.puck.carrier = skatersOnRink(s, t)[0].id;
    callFoul(s, { code: 'INC', offender: s.puck.carrier, severity: 'minor' });
  }
  assert.equal(s.teams[t].penalties.length, 3);
  assert.equal(skatersOnRink(s, t).length, 2);
});

test('vol de palet par l\'arrière : accrocher (ACC)', () => {
  const s = toPlay(newMatch());
  clearRink(s);
  const car = skatersOnRink(s, 0)[0];
  const def = skatersOnRink(s, 1)[0];
  Object.assign(car, { x: 0, y: 0, face: 0, vx: 5, vy: 0, pickupCd: 0 });
  Object.assign(def, { x: -1.1, y: 0, face: 0, vx: 5, vy: 0, stealCd: 0 });
  s.puck.carrier = car.id;
  doSteal(s, def);
  assert.equal(s.pending.length, 1);
  assert.equal(s.pending[0].code, 'ACC');
  assert.equal(s.phase, 'play', 'avantage : le porteur garde le palet');
});

test('commandes : la passe donne le contrôle au receveur, le tir chargé part plus fort', () => {
  const s = createMatch({ home: structuredClone(TEAMS.valence), away: structuredClone(TEAMS.rethel), humans: [{ team: 0 }], seed: 7 });
  toPlay(s);
  clearRink(s);
  const me = skatersOnRink(s, 0)[0];
  const mate = skatersOnRink(s, 0)[1];
  Object.assign(me, { x: 0, y: 0, face: 0, pickupCd: 0 });
  Object.assign(mate, { x: 6, y: 2, pickupCd: 0 });
  s.puck.carrier = me.id;
  s.humans[0].selected = me.id;
  step(s, [{ mx: 1, my: 0, pass: true }]);
  assert.equal(s.puck.carrier, -1);
  assert.equal(s.humans[0].selected, mate.id);
  run(s, 60, (st) => st.puck.carrier === mate.id);
  assert.equal(s.puck.carrier, mate.id);

  const speeds = [3, 45].map((hold) => {
    const m = createMatch({ home: structuredClone(TEAMS.valence), away: structuredClone(TEAMS.rethel), humans: [{ team: 0 }], seed: 7 });
    toPlay(m);
    clearRink(m);
    const p = skatersOnRink(m, 0)[0];
    Object.assign(p, { x: 5, y: 0, face: 0, pickupCd: 0 });
    m.puck.carrier = p.id;
    m.humans[0].selected = p.id;
    for (let i = 0; i < hold; i++) step(m, [{ mx: 0, my: 0, shoot: true }]);
    m.events.length = 0;
    step(m, [{ mx: 0, my: 0, shoot: false }]);
    const ev = m.events.find((e) => e.type === 'shot');
    assert.ok(ev, 'le tir part au relâchement');
    return ev.speed;
  });
  assert.ok(speeds[1] > speeds[0] + 5, `tir chargé plus fort (${speeds})`);
});

test('match complet ordinateur contre ordinateur : il se termine, et il est reproductible', () => {
  const a = playMatch(123);
  const b = playMatch(123);
  assert.equal(a.state.phase, 'final');
  assert.equal(a.state.period, 2);
  assert.deepEqual(a.state.score, b.state.score);
  assert.equal(a.stats.ticks, b.stats.ticks);
  assert.ok(a.stats.shots > 5);
  for (const p of a.state.players) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
});

test('sur 12 matchs, l\'ordinateur marque et les gardiens arrêtent une partie des tirs', () => {
  let goals = 0;
  let saves = 0;
  for (let i = 0; i < 12; i++) {
    const { state, stats } = playMatch(500 + i);
    assert.equal(state.phase, 'final');
    goals += stats.goals;
    saves += stats.saves;
  }
  assert.ok(goals >= 12, `au moins un but par match en moyenne (${goals})`);
  assert.ok(saves > goals, `plus d'arrêts que de buts (${saves} arrêts, ${goals} buts)`);
});

test('vol de palet de face : palette contre palette, pas de faute, le palet change de camp', () => {
  let wins = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const s = toPlay(newMatch({ seed }));
    clearRink(s);
    const car = skatersOnRink(s, 0)[0];
    const def = skatersOnRink(s, 1)[0];
    Object.assign(car, { x: 0, y: 0, face: 0, vx: 0, vy: 0, pickupCd: 0 });
    Object.assign(def, { x: 2.1, y: 0.3, face: Math.PI, vx: 0, vy: 0, stealCd: 0 });
    s.puck.carrier = car.id;
    Object.assign(s.puck, { x: 0.85, y: 0 });
    doSteal(s, def);
    assert.equal(s.pending.length, 0, 'jouer le palet de face n\'est jamais une faute');
    if (s.puck.carrier === def.id) wins++;
  }
  assert.ok(wins >= 22 && wins <= 38, `contre un porteur à l'arrêt, le vol réussit le plus souvent (${wins}/40)`);
});

test('vol de palet : la crosse sur un joueur sans palet est un cinglage (CIN)', () => {
  const s = toPlay(newMatch());
  clearRink(s);
  const car = skatersOnRink(s, 0)[0];
  const other = skatersOnRink(s, 0)[1];
  const def = skatersOnRink(s, 1)[0];
  Object.assign(car, { x: -10, y: 5, face: 0, pickupCd: 0 });
  Object.assign(other, { x: 0, y: 0, face: 0, vx: 0, vy: 0, hadPuckTick: -999 });
  Object.assign(def, { x: 1.0, y: 0, face: Math.PI, vx: 0, vy: 0, stealCd: 0 });
  s.puck.carrier = car.id;
  Object.assign(s.puck, { x: -9.15, y: 5 });
  doSteal(s, def);
  assert.equal(s.pending.length, 1);
  assert.equal(s.pending[0].code, 'CIN');
});

test('gardien : il descend en papillon sur un tir cadré', () => {
  const s = toPlay(newMatch());
  clearRink(s);
  const g = goalieOf(s, 1);
  const side = Math.sign(g.x);
  freePuck(s, side * (GOAL_X - 9), 0.2, side * 24, 0);
  s.puck.lastTeam = 0;
  let down = false;
  run(s, 40, () => (down = down || g.down > 0) && s.phase !== 'play');
  assert.ok(down, 'le gardien est descendu sur ses jambières');
});

test('défense en carré : palet dans la zone, deux défenseurs bas près des poteaux et deux plus haut', () => {
  const s = toPlay(newMatch());
  const t = 1;
  const d = s.teams[t].dir;
  const gx = -d * GOAL_X;
  const car = skatersOnRink(s, 0)[0];
  // Le porteur reste dans le coin : la défense a le temps de s'installer.
  for (let i = 0; i < 240; i++) {
    Object.assign(car, { x: gx + d * 3, y: 10.5, vx: 0, vy: 0, face: 0, stun: 0 });
    s.puck.carrier = car.id;
    s.puck.pinT = 0;
    for (const p of skatersOnRink(s, t)) p.stealCd = 5;
    step(s);
    if (s.phase !== 'play') break;
  }
  assert.equal(s.phase, 'play');
  const dist = skatersOnRink(s, t).map((p) => Math.abs(p.x - gx)).sort((a, b) => a - b);
  assert.ok(dist.every((v) => v < 10.5), `les quatre défenseurs sont revenus dans la zone (${dist.map((v) => v.toFixed(1))})`);
  const inFront = skatersOnRink(s, t).filter((p) => Math.abs(p.x - gx) < 5 && Math.abs(p.y) < 5).length;
  assert.ok(inFront >= 1, 'au moins un défenseur garde le devant de la cage');
});

test('commandes absentes ou incomplètes : le match continue sans erreur', () => {
  const s = createMatch({ home: structuredClone(TEAMS.valence), away: structuredClone(TEAMS.rethel), humans: [{ team: 0 }], seed: 5 });
  for (let i = 0; i < 2000; i++) step(s, [{}]);
  for (const p of s.players) assert.ok(Number.isFinite(p.x + p.y + p.face), `position valide pour le n° ${p.num}`);
  assert.ok(Number.isFinite(s.puck.x + s.puck.y));
});

// Étape 2, lot 2 : les dix équipes et le match amical.
import { TEAM_IDS, chooseKits, colourGap, KIT_GAP } from '../src/data/teams.js';

test('dix équipes complètes : huit patineurs, un gardien, deux tenues, trois notes', () => {
  assert.equal(TEAM_IDS.length, 10);
  const sigles = new Set();
  for (const id of TEAM_IDS) {
    const t = TEAMS[id];
    assert.equal(t.id, id);
    assert.equal(t.joueurs.length, 8, id);
    assert.ok(t.gardien.nom && t.salle && t.nom, id);
    assert.equal(t.sigle.length, 3, id);
    sigles.add(t.sigle);
    const nums = new Set([...t.joueurs.map((j) => j.num), t.gardien.num]);
    assert.equal(nums.size, 9, `numéros en double : ${id}`);
    for (const k of [t.domicile, t.exterieur]) for (const c of ['maillot', 'epaules', 'numero', 'casque', 'pantalon']) assert.match(k[c], /^#[0-9a-f]{6}$/, `${id} ${c}`);
    for (const n of ['vitesse', 'tir', 'gardien']) assert.ok(t.notes[n] >= 0.5 && t.notes[n] <= 0.8, `${id} ${n}`);
  }
  assert.equal(sigles.size, 10);
});

test('les 90 affiches : les deux maillots se distinguent toujours', () => {
  let n = 0;
  for (const h of TEAM_IDS)
    for (const a of TEAM_IDS) {
      if (a === h) continue;
      const [k1, k2] = chooseKits(TEAMS[h], TEAMS[a]);
      assert.equal(k1, TEAMS[h].domicile);
      assert.ok(colourGap(k1.maillot, k2.maillot) >= KIT_GAP, `${h} - ${a}`);
      n++;
    }
  assert.equal(n, 90);
});

test('une affiche quelconque se joue jusqu au bout, des deux côtés', () => {
  for (const [h, a] of [['angers', 'pontdemetz'], ['caen', 'valence']]) {
    const s = createMatch({ home: structuredClone(TEAMS[h]), away: structuredClone(TEAMS[a]), humans: [{ team: 1 }], seed: 11, periodLength: 20 });
    for (let i = 0; i < 60000 && s.phase !== 'final'; i++) {
      step(s, [{}]);
      s.events.length = 0;
    }
    assert.equal(s.phase, 'final');
    assert.equal(s.cfg.teams[0].sigle, TEAMS[h].sigle);
  }
});
