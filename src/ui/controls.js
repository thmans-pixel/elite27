// Guide des commandes : dessin de la manette et du clavier AZERTY, construits à partir des touches du code
// (KEYS et PAD de src/input/input.js), pour que le guide ne puisse pas dire autre chose que le jeu.
import { KEYS, PAD } from '../input/input.js';

const $ = (id) => document.getElementById(id);

/** Nom court de chaque action, tel qu'il s'écrit sur une touche. */
export const ACTIONS = {
  move: 'Patiner',
  pass: 'Passe',
  shoot: 'Tir',
  steal: 'Vol de palet',
  check: 'Charge',
  dodge: 'Esquive',
  kneel: 'Défense à genou',
  skid: 'Dérapage',
  sw: 'Changer de patineur',
  line: 'Changer de ligne',
  pause: 'Pause',
};
const SHORT = { move: '', pass: 'Passe', shoot: 'Tir', steal: 'Vol', check: 'Charge', dodge: 'Esquive', kneel: 'Genou', skid: 'Dérapage', sw: 'Patineur', line: 'Ligne', pause: 'Pause' };

// Clavier AZERTY : code physique de la touche, ce qui est gravé dessus, largeur en unités.
const ROWS = [
  [['Escape', 'Échap', 1.5]],
  [['Tab', '⇥', 1.5], ['KeyQ', 'A'], ['KeyW', 'Z'], ['KeyE', 'E'], ['KeyR', 'R'], ['KeyT', 'T'], ['KeyY', 'Y'], ['KeyU', 'U'], ['KeyI', 'I'], ['KeyO', 'O'], ['KeyP', 'P'], ['BracketLeft', '^'], ['BracketRight', '$'], ['Enter', 'Entrée', 1.6]],
  [['CapsLock', '⇪', 1.8], ['KeyA', 'Q'], ['KeyS', 'S'], ['KeyD', 'D'], ['KeyF', 'F'], ['KeyG', 'G'], ['KeyH', 'H'], ['KeyJ', 'J'], ['KeyK', 'K'], ['KeyL', 'L'], ['Semicolon', 'M'], ['Quote', 'ù'], ['Backslash', '*']],
  [['ShiftLeft', 'Maj', 1.3], ['IntlBackslash', '<'], ['KeyZ', 'W'], ['KeyX', 'X'], ['KeyC', 'C'], ['KeyV', 'V'], ['KeyB', 'B'], ['KeyN', 'N'], ['KeyM', ','], ['Comma', ';'], ['Period', ':'], ['Slash', '!'], ['ShiftRight', 'Maj', 2.3]],
  [['ControlLeft', 'Ctrl', 1.5], ['AltLeft', 'Alt', 1.3], ['Space', 'Espace', 6.2], ['AltRight', 'Alt Gr', 1.3], [null, '', 0.4], ['ArrowLeft', '←'], ['ArrowUp', '↑'], ['ArrowDown', '↓'], ['ArrowRight', '→']],
];

/** Action tenue par chaque touche pour le joueur i (0 ou 1). */
export function keyActions(i) {
  const map = new Map();
  const k = KEYS[i];
  for (const dir of ['up', 'down', 'left', 'right']) for (const code of k[dir]) map.set(code, 'move');
  for (const a of Object.keys(ACTIONS)) for (const code of k[a] ?? []) map.set(code, a);
  map.set('Escape', 'pause');
  if (i === 0) map.set('KeyP', 'pause');
  return map;
}

function keyboardSvg(i) {
  const used = keyActions(i);
  const U = 52;
  const G = 6;
  let out = '';
  let width = 0;
  ROWS.forEach((row, r) => {
    let x = 0;
    for (const [code, label, w = 1] of row) {
      const wpx = w * U + (w - 1) * G;
      if (code) {
        const a = used.get(code);
        const y = r * (U + G);
        out += `<g class="${a ? `key on a-${a}` : 'key'}"><rect x="${x}" y="${y}" width="${wpx}" height="${U}" rx="7"/><text class="cap" x="${x + wpx / 2}" y="${y + (a && SHORT[a] ? 22 : 32)}">${label}</text>${a && SHORT[a] ? `<text class="act" x="${x + wpx / 2}" y="${y + 41}">${SHORT[a]}</text>` : ''}</g>`;
      }
      x += wpx + G;
    }
    width = Math.max(width, x);
  });
  return `<svg class="kb" viewBox="-4 -4 ${width + 2} ${ROWS.length * (U + G) + 2}" role="img" aria-label="Clavier AZERTY, touches du joueur ${i + 1}">${out}</svg>`;
}

// Manette générique : position de chaque bouton sur le dessin, et côté de son étiquette.
const PAD_SPOTS = {
  kneel: { name: 'LT', x: 218, y: 62, side: 'L', ly: 40 },
  sw: { name: 'LB', x: 232, y: 96, side: 'L', ly: 86 },
  move: { name: 'Stick gauche', x: 236, y: 158, side: 'L', ly: 150 },
  cross: { name: 'Croix', x: 306, y: 216, side: 'L', ly: 226, action: 'move' },
  line: { name: 'Select', x: 352, y: 150, side: 'T', lx: 344 },
  pause: { name: 'Start', x: 408, y: 150, side: 'T', lx: 416 },
  check: { name: 'RT', x: 542, y: 62, side: 'R', ly: 40 },
  skid: { name: 'RB', x: 528, y: 96, side: 'R', ly: 86 },
  dodge: { name: 'Y', x: 524, y: 128, side: 'R', ly: 126, from: [537, 126] },
  steal: { name: 'B', x: 552, y: 156, side: 'R', ly: 164, from: [565, 158] },
  pass: { name: 'A', x: 524, y: 184, side: 'R', ly: 202, from: [536, 190] },
  shoot: { name: 'X', x: 496, y: 156, side: 'R', ly: 246, d: 'M496 169 V246 H610' },
};

function padSvg() {
  let labels = '';
  for (const [key, s] of Object.entries(PAD_SPOTS)) {
    const action = ACTIONS[s.action ?? key];
    if (s.side === 'T') {
      // Boutons du milieu : étiquette au-dessus de la manette.
      const cls = s.lx < s.x ? 'L' : 'R'; // texte calé à droite s'il est à gauche du trait
      labels += `<path class="lead" d="M${s.x} ${s.y - 7} V12"/><text class="pl ${cls}" x="${s.lx}" y="16">${s.name}</text><text class="pa ${cls}" x="${s.lx}" y="32">${action}</text>`;
      continue;
    }
    const lx = s.side === 'L' ? 150 : 610;
    const tx = s.side === 'L' ? 142 : 618;
    const [fx, fy] = s.from ?? [s.x, s.y];
    const d = s.d ?? `M${fx} ${fy} L${s.side === 'L' ? lx + 26 : lx - 26} ${s.ly} L${lx} ${s.ly}`;
    labels += `<path class="lead" d="${d}"/>${s.from || s.d ? '' : `<circle class="dot" cx="${s.x}" cy="${s.y}" r="3.5"/>`}<text class="pl ${s.side}" x="${tx}" y="${s.ly - 3}">${s.name}</text><text class="pa ${s.side}" x="${tx}" y="${s.ly + 13}">${action}</text>`;
  }
  const face = (x, y, t, c) => `<circle class="face" cx="${x}" cy="${y}" r="13" style="stroke:${c}"/><text class="ft" x="${x}" y="${y + 5}" style="fill:${c}">${t}</text>`;
  return `<svg class="pad" viewBox="0 0 760 300" role="img" aria-label="Manette : action de chaque bouton">
    <rect class="trig" x="200" y="48" width="56" height="26" rx="8"/><rect class="trig" x="504" y="48" width="56" height="26" rx="8"/>
    <rect class="bump" x="196" y="84" width="84" height="20" rx="8"/><rect class="bump" x="480" y="84" width="84" height="20" rx="8"/>
    <path class="body" d="M220 100 H540 Q590 100 604 150 L628 240 Q634 280 600 284 Q572 286 548 250 L528 222 H232 L212 250 Q188 286 160 284 Q126 280 132 240 L156 150 Q170 100 220 100 Z"/>
    <circle class="stick" cx="236" cy="158" r="26"/><circle class="stick in" cx="236" cy="158" r="15"/>
    <circle class="stick" cx="452" cy="214" r="26"/><circle class="stick in" cx="452" cy="214" r="15"/>
    <path class="dpad" d="M296 190 h20 v16 h16 v20 h-16 v16 h-20 v-16 h-16 v-20 h16 Z"/>
    <rect class="small" x="338" y="143" width="28" height="14" rx="7"/><rect class="small" x="394" y="143" width="28" height="14" rx="7"/>
    ${face(524, 128, 'Y', '#e9c23c')}${face(552, 156, 'B', '#e2564d')}${face(496, 156, 'X', '#5aa0f2')}${face(524, 184, 'A', '#6fd08a')}
    ${labels}
  </svg>`;
}

/** Les gestes qui demandent plus qu'un appui. k(action) donne le nom de la touche ou du bouton. */
const GESTURES = (k) => {
  return [
    ['Tir armé', `maintenir ${k('shoot')} pour armer, relâcher pour tirer. Plus c'est armé, plus le tir est fort et levé.`],
    ['Feinte de tir', `pendant que le tir s'arme, appuyer sur ${k('pass')} : le tir est annulé et le défenseur ou le gardien peut partir du mauvais côté.`],
    ['Tir sur réception', `maintenir ${k('shoot')} avant que la passe n'arrive : le tir part dès que le palet touche la crosse.`],
    ['Vol de palet', `${k('steal')} près du porteur, crosse vers le palet. De dos ou dans les patins, c'est une faute.`],
    ['Charge', `${k('check')} lance la charge dans la direction du patinage. Contre la balustrade, dans le dos ou sur le gardien, elle est sifflée.`],
    ['Esquive', `${k('dodge')} au moment où l'adversaire charge.`],
    ['Dérapage', `maintenir ${k('skid')} pour freiner sec et changer de direction.`],
    ['Défense à genou', `maintenir ${k('kneel')} sans le palet : un genou au sol, crosse couchée, pour couper une passe ou un tir à ras de terre.`],
    ['Patinage arrière', 'automatique : face au porteur adverse tout proche, reculer se fait en restant face à lui.'],
    ['Michigan', `derrière la cage adverse, à l'arrêt, maintenir ${k('shoot')} une seconde puis relâcher.`],
    ['Changer de patineur', `${k('sw')} prend le coéquipier le plus proche du palet (inutile en changement automatique).`],
    ['Changer de ligne', `en mode manuel, ${k('line')} demande l'autre ligne : elle entre au prochain arrêt de jeu.`],
  ];
};

/** Ce qui est gravé sur une touche AZERTY, à partir de son code physique. */
export function keyName(code) {
  for (const row of ROWS) for (const [c, label] of row) if (c === code) return code === 'ShiftLeft' ? 'Maj gauche' : code === 'ShiftRight' ? 'Maj droite' : label;
  return code;
}

/** Rappel court affiché en début de match. */
export function reminder(pad) {
  const k = (a) => (pad ? PAD_SPOTS[a].name : keyName(KEYS[0][a][0]));
  const move = pad ? 'Stick gauche' : 'Z Q S D';
  return `<b>${move}</b> patiner · <b>${k('pass')}</b> passe · <b>${k('shoot')}</b> tir (maintenir) · <b>${k('steal')}</b> vol de palet · <b>${k('check')}</b> charge · <b>${k('dodge')}</b> esquive<br><small>${pad ? 'Start' : 'Échap'} : pause et toutes les commandes</small>`;
}

export class ControlsScreen {
  constructor() {
    this.tab = 'pad';
    this.onClose = null;
    for (const b of document.querySelectorAll('#controlsTabs button')) b.addEventListener('click', () => this.show(b.dataset.v));
    $('controlsClose').addEventListener('click', () => this.close());
  }

  get opened() {
    return !$('controls').hidden;
  }

  /** Ouvre le guide ; onClose est appelé à la fermeture, pour revenir d'où l'on vient. */
  open(padDetected, onClose) {
    this.onClose = onClose ?? null;
    $('controls').hidden = false;
    this.show(padDetected ? 'pad' : 'k1');
  }

  show(tab) {
    this.tab = tab;
    for (const b of document.querySelectorAll('#controlsTabs button')) b.classList.toggle('on', b.dataset.v === tab);
    const pad = tab === 'pad';
    const i = tab === 'k2' ? 1 : 0;
    const drawing = pad ? padSvg() : keyboardSvg(i);
    const note = pad
      ? 'La première manette branchée va au joueur 1, la seconde au joueur 2. Le menu se pilote au clavier ou à la souris.'
      : i === 0
        ? 'Seul, le joueur 1 peut aussi patiner avec les flèches.'
        : 'Le joueur 2 partage le clavier : flèches et touches de droite.';
    // Les gestes sont décrits avec les touches de l'onglet ouvert.
    const gestures = GESTURES(pad ? (x) => PAD_SPOTS[x].name : (x) => keyName(KEYS[i][x][0]))
      .map(([t, d]) => `<div><b>${t}</b><span>${d}</span></div>`)
      .join('');
    $('controlsBody').innerHTML = `${drawing}<p class="keys">${note}</p><h3>Les gestes</h3><div class="gest">${gestures}</div>`;
  }

  close() {
    $('controls').hidden = true;
    const f = this.onClose;
    this.onClose = null;
    f?.();
  }
}
