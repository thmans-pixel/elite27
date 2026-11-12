// Point d'entrée du jeu dans le navigateur : menu, boucle de jeu, liaison entre logique, affichage et commandes.
import { createMatch, step } from './sim/match.js';
import { DT } from './sim/geometry.js';
import { TEAMS, TEAM_IDS, chooseKits } from './data/teams.js';
import { MatchView } from './render/view.js';
import { loadPlayerModel, loadStickModel, loadPadModel } from './render/model.js';
import { Input } from './input/input.js';
import { Hud } from './ui/hud.js';
import { Sound } from './audio/sound.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const input = new Input();
const hud = new Hud();
const sound = new Sound();
const settings = { equipe: 'valence', adversaire: 'rethel', lieu: 'domicile', humans: '1', difficulty: 'normal', period: '120', switch: 'auto', players: 'modele', sound: 'oui' };
// Modèle 3D des patineurs, chargé une fois. S'il manque, le jeu garde les joueurs simplifiés.
const optional = (p) => p.catch((err) => (console.warn('Modèle 3D indisponible :', err.message), null));
const playerModel = optional(loadPlayerModel('assets/joueur'));
const refereeModel = optional(loadPlayerModel('assets/arbitre'));
const goalieModel = optional(loadPlayerModel('assets/gardien'));
const stickModel = optional(loadStickModel('assets/crosse'));
const goalieStickModel = optional(loadStickModel('assets/crosse-gardien'));
const padModel = optional(loadPadModel('assets/jambiere'));

// Réglages repris de l'adresse (bouton Rejouer, mode démonstration).
for (const key of Object.keys(settings)) if (params.has(key)) settings[key] = params.get(key);

if (!TEAMS[settings.equipe]) settings.equipe = 'valence';
if (!TEAMS[settings.adversaire] || settings.adversaire === settings.equipe) settings.adversaire = TEAM_IDS.find((id) => id !== settings.equipe);

/** L'affiche choisie : [équipe qui reçoit, visiteur] et le côté du joueur 1 (0 s'il reçoit). */
function fixture() {
  const mine = settings.lieu === 'exterieur' ? 1 : 0;
  const ids = mine === 0 ? [settings.equipe, settings.adversaire] : [settings.adversaire, settings.equipe];
  return { home: TEAMS[ids[0]], away: TEAMS[ids[1]], mine };
}

function showFixture() {
  const { home, away } = fixture();
  $('fixHome').textContent = home.nom;
  $('fixAway').textContent = away.nom;
  $('venue').textContent = home.salle;
}

for (const key of ['equipe', 'adversaire']) {
  const sel = $(key);
  for (const id of TEAM_IDS) sel.add(new Option(TEAMS[id].nom, id));
  sel.value = settings[key];
  sel.addEventListener('change', () => {
    const other = key === 'equipe' ? 'adversaire' : 'equipe';
    // Une équipe ne joue pas contre elle-même : l'autre liste reprend l'ancien choix.
    if (sel.value === settings[other]) {
      settings[other] = settings[key];
      $(other).value = settings[other];
    }
    settings[key] = sel.value;
    showFixture();
  });
}

for (const opt of document.querySelectorAll('.opt[data-opt]')) {
  const key = opt.dataset.opt;
  const buttons = [...opt.querySelectorAll('button')];
  const show = () => buttons.forEach((b) => b.classList.toggle('on', b.dataset.v === settings[key]));
  buttons.forEach((b) =>
    b.addEventListener('click', () => {
      settings[key] = b.dataset.v;
      show();
      showFixture();
    }),
  );
  show();
}
showFixture();

let state = null;
let starting = false;
let view = null;
let paused = false;
let acc = 0;
let last = 0;
const speed = Number(params.get('speed') ?? 1);

async function start() {
  if (starting) return;
  sound.start(settings.sound !== 'non'); // sur le clic ou la touche : le navigateur n'autorise le son qu'ici
  starting = true;
  const model = settings.players === 'modele' ? await playerModel : null;
  const refModel = await refereeModel;
  starting = false;
  const fx = fixture();
  const home = structuredClone(fx.home);
  const away = structuredClone(fx.away);
  const n = Number(settings.humans);
  // Le joueur 1 a « Ton équipe », le joueur 2 l'adversaire.
  const humans = n === 2 ? [{ team: fx.mine }, { team: 1 - fx.mine }] : n === 1 ? [{ team: fx.mine }] : [];
  const seed = params.has('seed') ? Number(params.get('seed')) : (Date.now() & 0x7fffffff) | 0;
  state = createMatch({ home, away, periodLength: Number(settings.period), difficulty: settings.difficulty, humans, seed, autoSwitch: settings.switch !== 'manuel' });
  const kits = chooseKits(home, away);
  try {
    view = new MatchView($('view'), state, kits, model, refModel, model ? await goalieModel : null, model ? await stickModel : null, model ? await goalieStickModel : null, model ? await padModel : null);
  } catch (err) {
    // Sans affichage 3D (WebGL coupé dans le navigateur), on le dit au lieu de rester muet.
    console.error(err);
    const box = $('menuError');
    box.hidden = false;
    box.textContent =
      "Le navigateur n'a pas pu ouvrir l'affichage 3D (WebGL). Active l'accélération graphique dans ses réglages, puis relance-le, ou essaie un autre navigateur.";
    return;
  }
  hud.begin(state, kits);
  input.solo = n < 2;
  $('menu').hidden = true;
  paused = false;
  acc = 0;
  last = performance.now();
  window.__elite27 = { state, view, sound };
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
        sound.onEvent(e);
      }
    }
  }
  view.render(paused ? 1 : Math.min(1, acc / DT), paused ? 0 : dt);
  hud.update(dt);
  sound.update(dt, !paused && state.phase === 'play');
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
