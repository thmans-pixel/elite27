// Point d'entrée du jeu dans le navigateur : menu, boucle de jeu, liaison entre logique, affichage et commandes.
import { createMatch, step } from './sim/match.js';
import { DT } from './sim/geometry.js';
import { TEAMS, TEAM_IDS, chooseKits, teamById } from './data/teams.js';
import { MatchView, QUALITY_ORDER } from './render/view.js';
import { RefereeMode } from './ui/referee.js';
import { loadSkaterModel, loadStick, loadDecor } from './render/perso.js';
import { rugosite } from './sim/arbitrage.js';
import { loadPlayerModel, loadStickModel, loadPadModel } from './render/model.js';
import { Input } from './input/input.js';
import { Hud } from './ui/hud.js';
import { Sound } from './audio/sound.js';
import { SeasonScreen } from './ui/season.js';
import { ControlsScreen, reminder } from './ui/controls.js';
import { EnLigne } from './ui/enligne.js';
import { appliquer } from './net/protocole.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const input = new Input();
const hud = new Hud();
const sound = new Sound();
const settings = { equipe: 'valence', adversaire: 'rethel', lieu: 'domicile', humans: '1', difficulty: 'normal', period: '120', tie: 'prolongation', lines: 'auto', quality: 'auto', replays: 'oui', switch: 'auto', players: 'modele', sound: 'oui', mode: 'match', arbitre: 'assiste' };
// Modèle 3D des patineurs, chargé une fois. S'il manque, le jeu garde les joueurs simplifiés.
// Suivi du chargement : l'écran de chargement montre combien de fichiers 3D sont arrivés.
const loading = { done: 0, total: 0 };
const optional = (p) => {
  loading.total++;
  return p
    .catch((err) => (console.warn('Modèle 3D indisponible :', err.message), null))
    .finally(() => (loading.done++, showLoading()));
};
function showLoading() {
  const box = $('loading');
  if (!box || box.hidden) return;
  box.querySelector('i').style.width = `${Math.round((100 * loading.done) / Math.max(1, loading.total))}%`;
  box.querySelector('small').textContent = `${loading.done} fichiers sur ${loading.total}`;
}
// Personnages et crosses de Blender (assets/3d) ; si un fichier manque, l'ancien modèle prend le relais.
const sinon = (neuf, ancien, quoi) => optional(neuf.catch((err) => (console.warn(`${quoi} de Blender indisponible :`, err.message), ancien())));
const playerModel = sinon(loadSkaterModel('joueur'), () => loadPlayerModel('assets/joueur'), 'Patineur');
const refereeModel = sinon(loadSkaterModel('arbitre'), () => loadPlayerModel('assets/arbitre'), 'Arbitre');
const goalieModel = sinon(loadSkaterModel('gardien'), () => loadPlayerModel('assets/gardien'), 'Gardien');
const stickModel = sinon(loadStick(false), () => loadStickModel('assets/crosse'), 'Crosse');
const goalieStickModel = sinon(loadStick(true), () => loadStickModel('assets/crosse-gardien'), 'Crosse de gardien');
const decor = optional(loadDecor());
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

const enligne = new EnLigne({
  settings: () => settings,
  start: (depart) => start(depart),
  son: (id) => sound.reaction(id),
  // Quelques spectateurs de la tribune réagissent en même temps.
  public: (id) => view?.crowd.cheer('all', 1.4, id === 'but' ? 0.9 : 0.6, 0.15),
});
const seasonScreen = new SeasonScreen({ settings: () => settings, play: () => start() });
let recorded = false;
// Animations enregistrées des réactions (assets/anim/index.json) : facultatives, chargées une fois.
const reactionClips = (async () => {
  try {
    const index = await (await fetch('assets/anim/index.json')).json();
    const out = {};
    for (const [kind, name] of Object.entries(index.reactions ?? {})) {
      const r = await fetch(`assets/anim/${name}.json`);
      if (r.ok) out[kind] = await r.json();
    }
    return out;
  } catch {
    return {};
  }
})();
let helpPad = null;
let replayIn = null;
let replayShown = false;
let replayHeld = false;
let rush = false;
function showReplay(on) {
  replayShown = on;
  $('replay').hidden = !on;
  $('replay').querySelector('small').textContent = on && state.humans.length ? '— passe ou tir pour passer' : '';
}

// Images par seconde (touche F3) et qualité automatique : on part en Haute, et l'on descend d'un cran si le jeu
// ne tient pas 40 images par seconde sur quatre secondes de jeu. On ne remonte pas en cours de match.
const meter = { ema: 60, t: 0, frames: 0, warm: 1.5, auto: false };
function measure(dt) {
  if (dt <= 0) return;
  meter.ema += (1 / dt - meter.ema) * 0.05;
  if (!$('fps').hidden) $('fps').textContent = `${Math.round(meter.ema)} images/s · qualité ${view.quality}`;
  if (!meter.auto || paused || view.replaying || state.phase !== 'play') return;
  if (meter.warm > 0) return void (meter.warm -= dt);
  meter.t += dt;
  meter.frames++;
  if (meter.t < 4) return;
  const fps = meter.frames / meter.t;
  const next = QUALITY_ORDER[QUALITY_ORDER.indexOf(view.quality) + 1];
  if (fps < 40 && next) {
    view.setQuality(next);
    Object.assign(meter, { t: 0, frames: 0, warm: 1.5 });
  } else meter.auto = false;
}
window.addEventListener('keydown', (e) => {
  if (e.code !== 'F3') return;
  e.preventDefault();
  $('fps').hidden = !$('fps').hidden;
});
const controls = new ControlsScreen();
const padSeen = () => [...(navigator.getGamepads ? navigator.getGamepads() : [])].some((p) => p && p.connected);
$('controlsBtn').addEventListener('click', () => {
  $('menu').hidden = true;
  controls.open(padSeen(), () => ($('menu').hidden = false));
});
// Depuis la pause : le match reste arrêté tant que le guide est ouvert, puis on revient à la pause.
$('pauseControls').addEventListener('click', () => controls.open(padSeen() || !!input.padUsed, null));
let state = null;
let starting = false;
let view = null;
let arb = null; // mode Arbitre en cours
let net = false; // match en ligne : la logique tourne sur le serveur, cet écran applique ce qu'il reçoit
let recuA = 0; // instant du dernier instantané reçu
let legers = null; // personnages allégés, chargés si la qualité basse est choisie
let paused = false;
let acc = 0;
let last = 0;
const speed = Number(params.get('speed') ?? 1);

async function start(depart = null) {
  if (starting) return;
  net = !!depart;
  sound.start(settings.sound !== 'non'); // sur le clic ou la touche : le navigateur n'autorise le son qu'ici
  starting = true;
  // Le match ne commence qu'une fois tous les fichiers 3D arrivés (ou déclarés manquants).
  if (loading.done < loading.total) {
    $('loading').hidden = false;
    showLoading();
  }
  let model = settings.players === 'modele' ? await playerModel : null;
  let refModel = await refereeModel;
  let gModel = model ? await goalieModel : null;
  await Promise.all([goalieModel, stickModel, goalieStickModel, padModel]);
  if (model?.prepare && settings.quality === 'basse') {
    // Qualité basse choisie au menu : personnages allégés (chargés à la demande, une fois).
    $('loading').hidden = false;
    // Les deux arbitres gardent leur modèle complet : un troisième fichier allégé ferait dépasser les 40 Mo.
    legers ??= Promise.all(['joueur', 'gardien'].map((k) => loadSkaterModel(k, true).catch(() => null)));
    const [j, g] = await legers;
    model = j ?? model;
    gModel = g ?? gModel;
  }
  const sfx = net ? null : seasonScreen.playing; // match de saison en cours, ou null
  const fx = net ? { home: TEAMS[depart.home], away: TEAMS[depart.away], mine: 0 } : sfx ? { home: teamById(sfx.home), away: teamById(sfx.away), mine: sfx.home === seasonScreen.season.team ? 0 : 1 } : fixture();
  const referee = !net && !sfx && settings.mode === 'arbitre';
  const n = net ? 2 : sfx ? 1 : referee ? 0 : Number(settings.humans);
  // Le joueur 1 a « Ton équipe », le joueur 2 l'adversaire.
  const humans = n === 2 ? [{ team: fx.mine }, { team: 1 - fx.mine }] : n === 1 ? [{ team: fx.mine }] : [];
  const seed = net ? depart.seed : params.has('seed') ? Number(params.get('seed')) : (Date.now() & 0x7fffffff) | 0;
  const autoSwitch = settings.switch !== 'manuel';
  const lineChange = settings.lines === 'manuel' ? 'manuel' : 'auto';
  // En ligne : les mêmes réglages que le serveur (serveur/salon.mjs), pour partir du même état que lui.
  state = net
    ? createMatch({ home: structuredClone(fx.home), away: structuredClone(fx.away), periodLength: depart.periodLength, difficulty: depart.difficulty, humans: depart.humans, seed, overtime: true, ...(depart.referee && { referee: 'humain' }) })
    : sfx
    ? seasonScreen.match(humans, { autoSwitch, lineChange })
    : createMatch({ home: structuredClone(fx.home), away: structuredClone(fx.away), periodLength: Number(settings.period), difficulty: settings.difficulty, humans, seed, autoSwitch, lineChange, overtime: settings.tie !== 'nul', rough: referee ? rugosite(Number(settings.period), settings.arbitre === 'reel') : 1, referee: referee && settings.arbitre === 'reel' ? 'humain' : 'ordinateur' });
  const [home, away] = state.cfg.teams;
  const kits = chooseKits(home, away);
  for (const m of [model, gModel]) if (m?.prepare) await m.prepare(state.players, kits, state.cfg.teams);
  // Décor de Blender, avec le drapeau du club qui reçoit pour le kop.
  const scene3d = model ? await decor : null;
  if (scene3d?.public) scene3d.flag = await scene3d.public.drapeauDe(home.id);
  $('loading').hidden = true;
  starting = false;
  try {
    view = new MatchView($('view'), state, kits, model, refModel, gModel, model ? await stickModel : null, model ? await goalieStickModel : null, model ? await padModel : null, scene3d);
  } catch (err) {
    // Sans affichage 3D (WebGL coupé dans le navigateur), on le dit au lieu de rester muet.
    console.error(err);
    const box = $('menuError');
    box.hidden = false;
    $('menu').hidden = false;
    box.textContent =
      "Le navigateur n'a pas pu ouvrir l'affichage 3D (WebGL). Active l'accélération graphique dans ses réglages, puis relance-le, ou essaie un autre navigateur.";
    return;
  }
  hud.begin(state, kits);
  const place = net ? enligne.siege : -1; // en ligne : 0 à 3 joueur, 4 arbitre, -1 spectateur
  $('help').hidden = referee || (net && (place < 0 || place === 4)); // le rappel des touches des joueurs n'a pas lieu d'être
  hud.quiet = referee || place === 4;
  hud.seat = place;
  document.body.classList.toggle('arbitre', place === 4); // son panneau occupe la droite de l'écran // l'arbitre ne lit pas à l'écran contre qui la pénalité est appelée
  arb = referee
    ? new RefereeMode(state, view, seed, { deliver: (ev) => deliver(ev, true), flush: () => deliver(state.events.splice(0)) }, settings.arbitre === 'reel')
    : net && depart.referee
    ? // Arbitre à distance : son panneau envoie les commandes au serveur ; les autres ne lisent que le rapport final.
      new RefereeMode(state, view, seed, { deliver() {}, flush() {}, distant: enligne.arbitre, lecture: place !== 4 }, true)
    : null;
  input.solo = n < 2 || net; // en ligne, chacun a son clavier entier
  view.setClips(await reactionClips);
  view.setQuality(settings.quality === 'auto' ? 'haute' : settings.quality);
  meter.auto = !QUALITY_ORDER.includes(settings.quality);
  $('menu').hidden = true;
  $('season').hidden = true;
  recorded = false;
  $('again').firstChild.textContent = net ? 'Revanche ' : sfx ? 'Continuer ' : 'Rejouer ';
  $('again').hidden = net && enligne.siege < 0; // un spectateur ne demande pas la revanche
  $('back').hidden = !!sfx;
  // En ligne, Échap ouvre un menu sans arrêter le match (il tourne sur le serveur).
  $('pause').firstElementChild.textContent = net ? 'Menu' : 'Pause';
  $('pause').querySelector('small').textContent = net ? 'Le match continue · Échap pour fermer' : 'Échap ou Start pour reprendre';
  $('pauseReactions').hidden = $('pauseQuit').hidden = !net;
  paused = false;
  input.takePause(); // un Échap tapé dans les menus n'ouvre pas la pause au coup d'envoi
  acc = 0;
  last = performance.now();
  window.__elite27 = { state, view, sound, enligne };
  window.__arb = arb;
  requestAnimationFrame(frame);
}

/** Remet les événements de la logique à l'affichage, au tableau et au son. */
function deliver(events, silent = false) {
  for (const e of events) {
    view.onEvent(e);
    hud.onEvent(e);
    // Coup de sifflet déjà entendu (question du mode Arbitre, ou décision qui suit le sifflet de l'arbitre humain).
    if (!(e.type === 'whistle' && (silent || e.again))) sound.onEvent(e);
    // But : le ralenti part une demi-seconde plus tard, le temps de voir le palet au fond.
    if (e.type === 'goal' && state.phase === 'goal' && settings.replays !== 'non' && !arb && !net) replayIn = { side: state.teams[e.team].dir, t: 0.5 };
  }
}

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (input.takePause() && state.phase !== 'final' && !controls.opened && !arb?.active) {
    if (net) $('pause').hidden = !$('pause').hidden;
    else {
      paused = !paused;
      $('pause').hidden = !paused;
    }
  }
  // Rappel des touches en début de match, selon ce que le joueur utilise.
  const usesPad = !!input.padUsed;
  if (usesPad !== helpPad) {
    helpPad = usesPad;
    $('help').innerHTML = reminder(usesPad);
  }
  measure(dt);
  if (view.replaying) {
    // Pendant le ralenti, le match attend. Passe ou tir le saute.
    const press = state.humans.some((_, i) => {
      const r = input.read(i);
      return r.pass || r.shoot;
    });
    if (press && !replayHeld) view.endReplay();
    replayHeld = press;
  } else if (replayShown) {
    showReplay(false);
    rush = true; // le reste de la pause d'après-but passe vite : le ralenti l'a déjà remplie
  }
  if (rush && state.phase !== 'goal') rush = false;
  if (net) {
    // Match en ligne : on applique les instantanés du serveur, et l'image glisse de l'un à l'autre.
    for (const s of enligne.prendre()) {
      view.capture();
      const events = appliquer(state, s);
      if (arb && !arb.lecture) {
        // Bande de la révision vidéo de l'arbitre : deux images par instantané (30 par seconde reçus, 60 attendus).
        view.record(events);
        view.record([]);
      }
      deliver(events);
      recuA = now;
    }
    enligne.commander(input.read(0), now);
    enligne.attenteArbitre(state.phase === 'final' ? null : state.ref?.wait, now);
    if (arb?.observe([]) && !arb.active) arb.open([]);
  } else if (!paused && !view.replaying && !arb?.active) {
    acc += dt * speed * (rush ? 3 : 1);
    let guard = 0;
    while (acc >= DT && guard++ < 240) {
      view.capture();
      step(state, state.humans.map((_, i) => input.read(i)));
      acc -= DT;
      const events = state.events.splice(0);
      view.record(events);
      if (arb?.observe(events)) {
        // Mode Arbitre : l'image s'arrête, la question est posée ; l'affichage ne reçoit la décision qu'à la reprise.
        if (arb.reel) deliver(events);
        else for (const e of events) if (e.type === 'whistle') sound.onEvent(e);
        arb.open(events);
        acc = 0;
        break;
      }
      deliver(events);
      if (replayIn && (replayIn.t -= DT) <= 0) {
        if (view.startReplay(replayIn.side)) showReplay(true);
        replayIn = null;
        acc = 0;
        break;
      }
    }
  }
  const frozen = !!arb?.active;
  view.render(net ? Math.min(1, (now - recuA) / (1000 / 30)) : paused || frozen ? 1 : Math.min(1, acc / DT), paused || (frozen && !view.review) ? 0 : dt);
  if (!frozen) hud.update(dt);
  if (state.phase === 'final' && !recorded && !$('final').hidden) {
    recorded = true;
    if (arb) arb.report($('final').querySelector('.card'), net ? enligne.rapport : null);
    // Match de saison terminé : le résultat est enregistré, les autres matchs de la journée sont simulés.
    if (seasonScreen.playing) {
      $('again').disabled = true;
      seasonScreen.finish(state).then(() => ($('again').disabled = false));
    }
  }
  sound.update(dt, !paused && state.phase === 'play');
  requestAnimationFrame(frame);
}

function restart(auto) {
  if (net) return auto ? enligne.revanche() : enligne.quitter();
  if (seasonScreen.playing || seasonScreen.season) {
    if ($('again').disabled) return;
    if (seasonScreen.playing) return void (location.search = '?saison=1');
  }
  const q = new URLSearchParams(settings);
  if (auto) q.set('go', '1');
  location.search = q.toString();
}

// Manettes vues par le navigateur : il ne les annonce qu'après un premier appui sur un de leurs boutons.
function showPads() {
  if ($('menu').hidden) return;
  const pads = [...(navigator.getGamepads ? navigator.getGamepads() : [])].filter((p) => p && p.connected);
  $('padInfo').textContent = !navigator.getGamepads
    ? 'Manette : ce navigateur ne les prend pas en charge.'
    : pads.length
      ? `Manette détectée : ${pads.map((p, i) => `joueur ${p.index + 1} — ${p.id.slice(0, 40)}${p.mapping === 'standard' ? '' : ' (disposition non standard : les boutons peuvent être décalés)'}`).join(' · ')}`
      : 'Manette : aucune détectée. Branche-la puis appuie sur un de ses boutons, cette page étant au premier plan.';
}
setInterval(showPads, 500);
window.addEventListener('gamepadconnected', showPads);
showPads();

// Version en ligne : le fichier n'existe que sur le site (écrit par tools/deploiement/mettre-a-jour.sh).
fetch('version.json', { cache: 'no-store' })
  .then((r) => (r.ok ? r.json() : null))
  .then((v) => {
    if (!v?.version) return;
    const jour = new Date(`${v.date}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    $('version').textContent = `Version du ${jour} (${v.version})`;
    $('version').hidden = false;
  })
  .catch(() => {});

$('play').addEventListener('click', () => {
  settings.mode = 'match';
  start();
});
$('refBtn').addEventListener('click', () => {
  settings.mode = 'arbitre';
  start();
});
$('again').addEventListener('click', () => restart(true));
$('back').addEventListener('click', () => restart(false));
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
  if (!$('season').hidden) return;
  if (!$('menu').hidden) {
    settings.mode = 'match';
    start();
  }
  else if (!$('final').hidden) restart(true);
});

if (params.has('enligne')) {
  // Retour dans une partie en ligne (revanche, page rechargée) : le son attend le premier geste, comme l'exige le navigateur.
  enligne.reprendre();
  const geste = () => (sound.start(settings.sound !== 'non'), removeEventListener('pointerdown', geste), removeEventListener('keydown', geste));
  addEventListener('pointerdown', geste);
  addEventListener('keydown', geste);
} else if (params.has('saison') && seasonScreen.season) seasonScreen.show();
else if (params.has('go') || params.has('demo')) {
  if (params.has('demo')) settings.humans = '0';
  start();
}
