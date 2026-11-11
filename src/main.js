// Point d'entrée du jeu dans le navigateur : menu, boucle de jeu, liaison entre logique, affichage et commandes.
import { createMatch, step } from './sim/match.js';
import { DT } from './sim/geometry.js';
import { TEAMS } from './data/teams.js';
import { MatchView } from './render/view.js';
import { Input } from './input/input.js';
import { Hud } from './ui/hud.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const input = new Input();
const hud = new Hud();
const settings = { humans: '1', difficulty: 'normal', period: '120' };

// Réglages repris de l'adresse (bouton Rejouer, mode démonstration).
for (const key of Object.keys(settings)) if (params.has(key)) settings[key] = params.get(key);

for (const opt of document.querySelectorAll('.opt')) {
  const key = opt.dataset.opt;
  const buttons = [...opt.querySelectorAll('button')];
  const show = () => buttons.forEach((b) => b.classList.toggle('on', b.dataset.v === settings[key]));
  buttons.forEach((b) =>
    b.addEventListener('click', () => {
      settings[key] = b.dataset.v;
      show();
    }),
  );
  show();
}

let state = null;
let view = null;
let paused = false;
let acc = 0;
let last = 0;
const speed = Number(params.get('speed') ?? 1);

function start() {
  const home = structuredClone(TEAMS.valence);
  const away = structuredClone(TEAMS.rethel);
  const n = Number(settings.humans);
  const humans = n === 2 ? [{ team: 0 }, { team: 1 }] : n === 1 ? [{ team: 0 }] : [];
  const seed = params.has('seed') ? Number(params.get('seed')) : (Date.now() & 0x7fffffff) | 0;
  state = createMatch({ home, away, periodLength: Number(settings.period), difficulty: settings.difficulty, humans, seed });
  const kits = [home.domicile, away.exterieur];
  view = new MatchView($('view'), state, kits);
  hud.begin(state, kits);
  input.solo = n < 2;
  $('menu').hidden = true;
  paused = false;
  acc = 0;
  last = performance.now();
  window.__elite27 = { state, view };
  requestAnimationFrame(frame);
}

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (input.takePause() && state.phase !== 'final') {
    paused = !paused;
    $('pause').hidden = !paused;
  }
  if (!paused) {
    acc += dt * speed;
    let guard = 0;
    while (acc >= DT && guard++ < 240) {
      view.capture();
      step(state, state.humans.map((_, i) => input.read(i)));
      acc -= DT;
      for (const e of state.events.splice(0)) {
        view.onEvent(e);
        hud.onEvent(e);
      }
    }
  }
  view.render(paused ? 1 : Math.min(1, acc / DT), paused ? 0 : dt);
  hud.update(dt);
  requestAnimationFrame(frame);
}

function restart(auto) {
  const q = new URLSearchParams(settings);
  if (auto) q.set('go', '1');
  location.search = q.toString();
}

$('play').addEventListener('click', start);
$('again').addEventListener('click', () => restart(true));
$('back').addEventListener('click', () => restart(false));
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
  if (!$('menu').hidden) start();
  else if (!$('final').hidden) restart(true);
});

if (params.has('go') || params.has('demo')) {
  if (params.has('demo')) settings.humans = '0';
  start();
}
