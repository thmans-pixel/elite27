// Joue des matchs entiers ordinateur contre ordinateur et affiche un bilan.
// Usage : node tests/simulate.js [nombre de matchs] [difficulté] [durée d'une période en secondes]
import { createMatch, step } from '../src/sim/match.js';
import { TEAMS } from '../src/data/teams.js';

export function playMatch(seed, difficulty = 'normal', periodLength = 120, maxTicks = 400000) {
  const state = createMatch({ home: structuredClone(TEAMS.valence), away: structuredClone(TEAMS.rethel), periodLength, difficulty, humans: [], seed });
  const stats = { whistles: {}, fouls: {}, saves: 0, shots: 0, posts: 0, goals: 0, ticks: 0, steals: 0, passes: 0 };
  while (state.phase !== 'final' && stats.ticks < maxTicks) {
    step(state);
    stats.ticks++;
    for (const e of state.events) {
      if (e.type === 'whistle') {
        stats.whistles[e.reason] = (stats.whistles[e.reason] ?? 0) + 1;
        if (e.call?.kind === 'penalty') for (const c of [e.call, ...(e.call.others ?? [])]) stats.fouls[c.code] = (stats.fouls[c.code] ?? 0) + 1;
      }
      if (e.type === 'save') stats.saves++;
      if (e.type === 'shot') stats.shots++;
      if (e.type === 'post') stats.posts++;
      if (e.type === 'goal') stats.goals++;
      if (e.type === 'steal') stats.steals++;
      if (e.type === 'pass') stats.passes++;
    }
    state.events.length = 0;
  }
  return { state, stats };
}

if (process.argv[1] && process.argv[1].endsWith('simulate.js')) {
  const n = Number(process.argv[2] ?? 10);
  const diff = process.argv[3] ?? 'normal';
  const len = Number(process.argv[4] ?? 120);
  const tot = { goals: 0, shots: 0, saves: 0, posts: 0, steals: 0, passes: 0, fouls: {}, whistles: {}, real: 0 };
  for (let i = 0; i < n; i++) {
    const { state, stats } = playMatch(1000 + i * 77, diff, len);
    console.log(`match ${i + 1} : ${state.score[0]}-${state.score[1]}  phase=${state.phase}  durée réelle=${(stats.ticks / 60).toFixed(0)} s  tirs=${stats.shots} arrêts=${stats.saves} fautes=${JSON.stringify(stats.fouls)}`);
    tot.goals += stats.goals;
    tot.shots += stats.shots;
    tot.saves += stats.saves;
    tot.posts += stats.posts;
    tot.steals += stats.steals;
    tot.passes += stats.passes;
    tot.real += stats.ticks / 60;
    for (const [k, v] of Object.entries(stats.fouls)) tot.fouls[k] = (tot.fouls[k] ?? 0) + v;
    for (const [k, v] of Object.entries(stats.whistles)) tot.whistles[k] = (tot.whistles[k] ?? 0) + v;
  }
  console.log('\nMoyennes par match :');
  console.log(`  buts ${(tot.goals / n).toFixed(1)}  tirs ${(tot.shots / n).toFixed(1)}  arrêts ${(tot.saves / n).toFixed(1)}  poteaux ${(tot.posts / n).toFixed(1)}`);
  console.log(`  passes ${(tot.passes / n).toFixed(1)}  vols ${(tot.steals / n).toFixed(1)}  durée réelle ${(tot.real / n).toFixed(0)} s`);
  console.log('  fautes', Object.fromEntries(Object.entries(tot.fouls).map(([k, v]) => [k, +(v / n).toFixed(2)])));
  console.log('  arrêts de jeu', Object.fromEntries(Object.entries(tot.whistles).map(([k, v]) => [k, +(v / n).toFixed(1)])));
}
