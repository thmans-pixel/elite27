// Avenant 1 : patinage sur roues, charge volontaire, esquive, palet levé, Michigan, feinte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, step } from '../src/sim/match.js';
import { skatersOnRink, goalieOf } from '../src/sim/state.js';
import { doSteal, doShoot } from '../src/sim/physics.js';
import { GOAL_X } from '../src/sim/geometry.js';
import { TEAMS } from '../src/data/teams.js';

const IN = { mx: 0, my: 0, pass: false, shoot: false, steal: false, sw: false, skid: false, dodge: false, check: false };

/** Match avec un humain dans l'équipe 0, tous les autres patineurs rangés loin dans un coin et immobilisés. */
function solo(seed = 3) {
  const s = createMatch({ home: structuredClone(TEAMS.valence), away: structuredClone(TEAMS.rethel), humans: [{ team: 0 }], seed });
  for (let i = 0; i < 900 && s.phase !== 'play'; i++) step(s, [IN]);
  assert.equal(s.phase, 'play');
  const me = skatersOnRink(s, 0)[0];
  s.humans[0].selected = me.id;
  park(s, me);
  s.events.length = 0;
  return { s, me };
}
function park(s, ...keep) {
  for (const p of s.players) {
    if (p.goalie || p.status !== 'rink' || keep.includes(p)) continue;
    Object.assign(p, { x: (p.team === 0 ? -20 : -17) - p.slot * 0.1, y: -10 + p.slot * 1.1, vx: 0, vy: 0, stun: 99 });
  }
}
/** Avance en tenant les commandes de l'humain, les autres restant rangés. */
function drive(s, me, input, ticks, each) {
  for (let i = 0; i < ticks; i++) {
    park(s, me, ...(s.keep ?? []));
    s.humans[0].selected = me.id;
    s.teams.forEach((t) => (t.ownHalfT = 0));
    step(s, [{ ...IN, ...(typeof input === 'function' ? input(i) : input) }]);
    if (each) each(i);
    if (s.phase !== 'play') break;
  }
}

test('virage en carre : un demi-tour à pleine vitesse décrit un arc et garde la vitesse', () => {
  const { s, me } = solo();
  Object.assign(me, { x: -8, y: 0, face: 0, vx: 0, vy: 0 });
  s.puck.carrier = -1;
  Object.assign(s.puck, { x: 20, y: 11, vx: 0, vy: 0 });
  drive(s, me, { mx: 1 }, 90);
  const v0 = Math.hypot(me.vx, me.vy);
  assert.ok(v0 > 7, `lancé à ${v0.toFixed(1)} m/s`);
  let minSpeed = Infinity;
  let maxY = 0;
  let ticks = 0;
  drive(s, me, { mx: -1, my: 0.02 }, 200, () => {
    ticks++;
    minSpeed = Math.min(minSpeed, Math.hypot(me.vx, me.vy));
    maxY = Math.max(maxY, Math.abs(me.y));
    if (me.vx < -6) s.phase = 'stop';
  });
  s.phase = 'play';
  assert.ok(me.vx < -6, 'il est reparti dans l\'autre sens');
  assert.ok(minSpeed > 5.5, `la vitesse est conservée dans le virage (minimum ${minSpeed.toFixed(1)} m/s)`);
  assert.ok(maxY > 4 && maxY < 10, `l'arc est visible : ${maxY.toFixed(1)} m de large`);
  assert.ok(ticks < 150, `demi-tour en ${(ticks / 60).toFixed(1)} s`);
});

test('dérapage : arrêt en moins d\'une seconde, puis départ dans l\'autre sens', () => {
  const { s, me } = solo();
  Object.assign(me, { x: -8, y: 0, face: 0, vx: 0, vy: 0 });
  s.puck.carrier = -1;
  Object.assign(s.puck, { x: 20, y: 11, vx: 0, vy: 0 });
  drive(s, me, { mx: 1 }, 90);
  const x0 = me.x;
  let stopTick = -1;
  drive(s, me, { mx: -1, skid: true }, 60, (i) => {
    if (stopTick < 0 && Math.hypot(me.vx, me.vy) < 1.6) stopTick = i;
  });
  assert.ok(stopTick >= 0 && stopTick < 50, `arrêté en ${(stopTick / 60).toFixed(2)} s`);
  assert.ok(me.x - x0 < 3.5, `distance d'arrêt ${(me.x - x0).toFixed(1)} m`);
  drive(s, me, { mx: -1 }, 40);
  assert.ok(me.vx < -3, 'reparti dans l\'autre sens');
});

function clash(withCheck) {
  const { s, me } = solo(9);
  const opp = skatersOnRink(s, 1)[0];
  s.keep = [opp];
  Object.assign(me, { x: -4, y: 3, face: 0, vx: 7.5, vy: 0, checkCd: 0 });
  Object.assign(opp, { x: 0, y: 3, face: Math.PI, vx: -1, vy: 0, stun: 0 });
  s.puck.carrier = opp.id;
  let hit = false;
  drive(s, me, (i) => ({ mx: 1, check: withCheck && i === 14 }), 50, () => {
    Object.assign(opp, { stealCd: 9 });
    opp.ctl.mx = opp.ctl.my = 0;
    hit = hit || s.events.some((e) => e.type === 'hit') || s.pending.length > 0;
  });
  return { s, opp, hit };
}

test('charge volontaire : sans la touche de charge, un choc n\'est jamais une charge', () => {
  const { s, opp } = clash(false);
  assert.equal(s.pending.length, 0, 'aucune pénalité en attente');
  assert.equal(s.sheet.filter((e) => e.type === 'penalty').length, 0);
  assert.ok(opp.stun <= 0, 'l\'adversaire ne tombe pas');
});

test('charge volontaire : lancée à pleine vitesse, elle est sanctionnée', () => {
  const { s } = clash(true);
  const codes = [...s.pending.map((f) => f.code), ...s.sheet.filter((e) => e.type === 'penalty').map((e) => e.code)];
  assert.ok(codes.some((c) => ['INC', 'CBA', 'DOS'].includes(c)), `charge sifflée (${codes})`);
});

test('esquive : un pas de côté d\'environ 1,5 m, qui fait manquer le vol de palet', () => {
  const { s, me } = solo(4);
  const opp = skatersOnRink(s, 1)[0];
  s.keep = [opp];
  Object.assign(me, { x: 0, y: 0, face: 0, vx: 0, vy: 0, dodgeCd: 0 });
  Object.assign(opp, { x: 2.2, y: 0, face: Math.PI, vx: 0, vy: 0, stun: 0, stealCd: 0 });
  s.puck.carrier = me.id;
  drive(s, me, { my: 1, dodge: true }, 1);
  assert.ok(me.dodgeT > 0);
  doSteal(s, opp);
  assert.equal(s.puck.carrier, me.id, 'le vol de palet est manqué');
  drive(s, me, { my: 1 }, 14, () => (opp.stealCd = 9));
  assert.ok(me.y > 1.3 && me.y < 2.6, `déplacement latéral de ${me.y.toFixed(2)} m`);
  assert.ok(me.dodgeCd > 1, 'délai avant la prochaine esquive');
});

test('palet levé : un tir court reste au sol, un tir chargé monte sans dépasser la barre de loin', () => {
  const { s, me } = solo(5);
  const d = s.teams[0].dir;
  Object.assign(me, { x: d * (GOAL_X - 8), y: 0, face: d > 0 ? 0 : Math.PI, vx: 0, vy: 0 });
  s.puck.carrier = me.id;
  Object.assign(s.puck, { x: me.x + d * 0.85, y: 0, z: 0 });
  doShoot(s, me, 0.3);
  assert.equal(s.puck.vz, 0, 'tir à ras');
  s.puck.carrier = me.id;
  doShoot(s, me, 0.95);
  assert.ok(s.puck.vz > 1, 'tir levé');
  let top = 0;
  for (let i = 0; i < 30 && s.phase === 'play' && Math.abs(s.puck.x) < GOAL_X - 0.6; i++) {
    park(s, me);
    step(s, [IN]);
    top = Math.max(top, s.puck.z);
  }
  assert.ok(top > 0.4 && top < 1.6, `hauteur atteinte ${top.toFixed(2)} m`);
});

function michigan(seed, withOpponent) {
  const { s, me } = solo(seed);
  const d = s.teams[0].dir;
  const g = goalieOf(s, 1);
  const opp = skatersOnRink(s, 1)[0];
  if (withOpponent) s.keep = [opp];
  Object.assign(me, { x: d * (GOAL_X + 1.3), y: 1.5, face: d > 0 ? Math.PI : 0, vx: 0, vy: 0 });
  s.puck.carrier = me.id;
  const ev = [];
  const hold = (input, n) =>
    drive(s, me, input, n, () => {
      // Le gardien est tenu à l'autre poteau.
      Object.assign(g, { y: -0.7 });
      g.track.y = -3;
      if (withOpponent) Object.assign(opp, { x: me.x + 0.9 * d, y: me.y + 0.4, vx: 0, vy: 0, stun: 0, stealCd: 9, checkCd: 9 });
      ev.push(...s.events.map((e) => e.type));
      s.events.length = 0;
    });
  hold({ shoot: true }, 70);
  const charged = me.mich;
  hold({}, 40);
  return { s, ev, charged };
}

test('Michigan : derrière la cage, à l\'arrêt, le tir maintenu une seconde dépose le palet en lucarne', () => {
  let goals = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const { s, ev, charged } = michigan(seed, false);
    assert.equal(charged, 1, 'geste chargé');
    assert.ok(ev.includes('michigan'), 'le geste part au relâchement');
    if (s.score[0] === 1) goals++;
  }
  assert.ok(goals >= 5, `gardien à l'opposé : but ${goals} fois sur 8`);
});

test('Michigan : impossible avec un adversaire à moins de 1,5 m', () => {
  const { s, ev, charged } = michigan(2, true);
  assert.equal(charged, 0);
  assert.ok(!ev.includes('michigan'));
  assert.deepEqual(s.score, [0, 0]);
});

test('feinte de tir : passe pendant la charge, le tir est annulé et le gardien peut descendre', () => {
  let bitten = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const { s, me } = solo(seed);
    const d = s.teams[0].dir;
    const g = goalieOf(s, 1);
    Object.assign(me, { x: d * (GOAL_X - 6), y: 0, face: d > 0 ? 0 : Math.PI, vx: 0, vy: 0 });
    s.puck.carrier = me.id;
    drive(s, me, { shoot: true }, 20);
    assert.ok(me.charge > 0.2);
    drive(s, me, { shoot: true, pass: true }, 1);
    assert.equal(s.puck.carrier, me.id, 'il garde le palet');
    assert.equal(me.charge, 0);
    if (g.down > 0) bitten++;
    drive(s, me, {}, 3);
    assert.equal(s.puck.carrier, me.id, 'relâcher le tir après la feinte ne tire pas');
  }
  assert.ok(bitten >= 3 && bitten <= 11, `le gardien s'y laisse prendre ${bitten} fois sur 12`);
});
