// Sprint et jauge de souffle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, step } from '../src/sim/match.js';
import { TEAMS } from '../src/data/teams.js';
import { skatersOnRink } from '../src/sim/state.js';
import { TUNE } from '../src/sim/physics.js';
import { DT } from '../src/sim/geometry.js';

/** Un patineur dirigé par un joueur, seul sur une piste dégagée. */
function piste(cfg = {}) {
  const s = createMatch({ home: structuredClone(TEAMS.valence), away: structuredClone(TEAMS.rethel), seed: 3, humans: [{ team: 0 }], ...cfg });
  let n = 0;
  while (s.phase !== 'play' && n++ < 2000) step(s, [{}]);
  const p = s.players[s.humans[0].selected];
  for (const q of s.players) if (q !== p && !q.goalie && q.status === 'rink') Object.assign(q, { x: q.team ? 20 : -20, y: 11, vx: 0, vy: 0, stun: 99 });
  // Il porte le palet : le jeu ne s'arrête pas pour un palet immobile.
  Object.assign(s.puck, { carrier: p.id, passTarget: -1 });
  Object.assign(p, { x: -18, y: 0, vx: 0, vy: 0, face: 0 });
  s.cfg.autoSwitch = false;
  return { s, p };
}
/** Patine tout droit pendant t secondes ; renvoie la plus grande vitesse atteinte. */
function patiner(s, p, t, cmd) {
  let max = 0;
  for (let i = 0; i < t / DT; i++) {
    for (const q of s.players) if (q !== p && !q.goalie && q.status === 'rink') q.stun = 99;
    s.humans[0].selected = p.id;
    if (s.puck.carrier !== p.id) Object.assign(s.puck, { carrier: p.id, passTarget: -1 });
    assert.equal(s.phase, 'play');
    step(s, [cmd]);
    s.events.length = 0;
    max = Math.max(max, Math.hypot(p.vx, p.vy));
    if (Math.abs(p.x) > 17) p.x = -17; // la piste est longue : on reste au milieu
  }
  return max;
}

test('sprinter fait aller plus vite et vide la jauge ; vidée, le patineur est essoufflé et plus lent', () => {
  const a = piste();
  const normal = patiner(a.s, a.p, 3, { mx: 1, my: 0 });
  assert.equal(a.p.breath, 1);
  const b = piste();
  const sprint = patiner(b.s, b.p, 3, { mx: 1, my: 0, sprint: true });
  assert.ok(sprint > normal * 1.12 && sprint < normal * 1.22, `${normal.toFixed(2)} → ${sprint.toFixed(2)}`);
  assert.ok(b.p.breath < 0.3 && b.p.breath > 0.2, `jauge après 3 s : ${b.p.breath}`);
  // Encore une seconde et demie : la jauge est vide, il est essoufflé et ne sprinte plus malgré la touche.
  patiner(b.s, b.p, 1.5, { mx: 1, my: 0, sprint: true });
  assert.equal(b.p.spent, true);
  assert.equal(b.p.sprinting, false);
  assert.ok(b.p.winded > 0);
  const essouffle = patiner(b.s, b.p, 0.8, { mx: 1, my: 0, sprint: true });
  assert.ok(Math.hypot(b.p.vx, b.p.vy) < normal * 0.95, `essoufflé : ${Math.hypot(b.p.vx, b.p.vy).toFixed(2)} contre ${normal.toFixed(2)}`);
  assert.ok(essouffle > 0);
  // Il doit retrouver le tiers de sa jauge avant de sprinter de nouveau.
  patiner(b.s, b.p, 1, { mx: 1, my: 0 });
  assert.equal(b.p.spent, true);
  patiner(b.s, b.p, 4, { mx: 1, my: 0 });
  assert.equal(b.p.spent, false);
  assert.ok(b.p.breath >= TUNE.breathBack);
  patiner(b.s, b.p, 0.3, { mx: 1, my: 0, sprint: true });
  assert.equal(b.p.sprinting, true, JSON.stringify({ breath: b.p.breath, spent: b.p.spent, stun: b.p.stun, offBal: b.p.offBal, kneeling: b.p.kneeling, ctl: b.p.ctl, sel: b.s.humans[0].selected, id: b.p.id, phase: b.s.phase }));
});

test('la jauge se remplit sans sprinter, plus vite à l\'arrêt, et le sprint ne vaut qu\'en patinant vers l\'avant', () => {
  const { s, p } = piste();
  patiner(s, p, 2, { mx: 1, my: 0, sprint: true });
  const bas = p.breath;
  assert.ok(Math.abs(bas - 0.5) < 0.03, `après 2 s de sprint : ${bas}`);
  patiner(s, p, 2, { mx: 1, my: 0 });
  const enPatinant = p.breath - bas;
  assert.ok(Math.abs(enPatinant - 2 / TUNE.breathSkate) < 0.02, `+${enPatinant} en 2 s en patinant`);
  patiner(s, p, 5, {}); // il s'arrête
  p.breath = 0.5;
  const avant = p.breath;
  patiner(s, p, 1, {});
  assert.ok(p.breath - avant > 1 / TUNE.breathSkate + 0.03, `+${p.breath - avant} en 1 s à l'arrêt`);
  // Touche tenue sans avancer, en dérapage ou à genou : pas de sprint, la jauge ne baisse pas.
  for (const cmd of [{ sprint: true }, { mx: 1, my: 0, sprint: true, skid: true }, { sprint: true, kneel: true }]) {
    const j = p.breath;
    patiner(s, p, 0.5, cmd);
    assert.equal(p.sprinting, false, JSON.stringify(cmd));
    assert.ok(p.breath >= j);
  }
});

test('sprinter use la fraîcheur de la ligne plus vite', () => {
  const a = piste();
  const b = piste();
  const f0 = a.s.teams[0].fresh[a.s.teams[0].line];
  patiner(a.s, a.p, 3, { mx: 1, my: 0 });
  patiner(b.s, b.p, 3, { mx: 1, my: 0, sprint: true });
  const usureA = f0 - a.s.teams[0].fresh[a.s.teams[0].line];
  const usureB = f0 - b.s.teams[0].fresh[b.s.teams[0].line];
  assert.ok(usureA > 0);
  assert.ok(Math.abs(usureB / usureA - 1.5) < 0.05, `usure ×${(usureB / usureA).toFixed(2)} avec un sprinteur`);
});

test("l'ordinateur sprinte lui aussi, sans jamais dépasser ses limites", () => {
  const s = createMatch({ home: structuredClone(TEAMS.valence), away: structuredClone(TEAMS.rethel), seed: 21 });
  let sprints = 0;
  let essouffles = 0;
  let vmax = 0;
  for (let i = 0; i < 60 * 240 && s.phase !== 'final'; i++) {
    step(s, []);
    s.events.length = 0;
    for (const p of s.players) {
      assert.ok(p.breath >= 0 && p.breath <= 1);
      if (p.sprinting) {
        sprints++;
        assert.ok(!p.spent && !p.goalie);
        vmax = Math.max(vmax, Math.hypot(p.vx, p.vy));
      }
      if (p.winded > 0) essouffles++;
    }
  }
  assert.ok(sprints > 300, `pas de sprint : ${sprints}`);
  assert.ok(vmax < TUNE.maxSpeed * 1.03 * TUNE.sprintSpeed * 1.2, `vitesse en sprint : ${vmax}`);
  // En difficulté normale, il garde une réserve : il ne finit presque jamais essoufflé.
  assert.ok(essouffles < sprints / 4, `essoufflé ${essouffles} pas pour ${sprints} de sprint`);
});
