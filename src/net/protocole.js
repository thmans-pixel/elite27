// Jeu en ligne : ce que le serveur envoie de l'état du match, et comment un navigateur l'applique au sien.
// Sans navigateur ni réseau : sert au serveur, au jeu et aux tests.

/** Champs d'un joueur qui ne changent pas pendant le match : le navigateur les a déjà (même createMatch). */
const FIXES = new Set(['id', 'team', 'goalie', 'num', 'name', 'line']);
const simple = (v) => v === null || typeof v !== 'object';

/** Valeurs simples d'un objet (nombres, booléens, textes), sans ses sous-objets. */
function plat(o, sauf = null) {
  const out = {};
  for (const k in o) if (simple(o[k]) && !sauf?.has(k)) out[k] = o[k];
  return out;
}

/**
 * Instantané de l'état du match. events : événements survenus depuis le précédent ; feuille : vrai pour joindre
 * la feuille de match entière (à l'arrivée d'un joueur, ou quand elle a grandi).
 */
export function instantane(state, events = [], feuille = false) {
  return {
    g: plat(state),
    k: { ...plat(state.puck), lastBy: state.puck.lastBy, prevBy: state.puck.prevBy },
    p: state.players.map((p) => ({ ...plat(p, FIXES), save: p.save ?? null })),
    eq: state.teams, // pas « t », qui est le type du message
    h: state.humans.map((h) => ({ team: h.team, selected: h.selected })),
    call: state.call ?? null,
    faceoff: state.faceoff ?? null,
    so: state.so ?? null,
    pshot: state.pshot ?? null,
    result: state.result ?? null,
    score: state.score,
    e: events,
    ...(feuille ? { sheet: state.sheet } : {}),
  };
}

/** Texte à envoyer : les nombres sont arrondis au millième, ce qui divise la taille par deux. */
export const coder = (message) => JSON.stringify(message, (k, v) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 1000) / 1000 : v));

/** Applique un instantané à l'état local (créé par le même createMatch). Renvoie les événements reçus. */
export function appliquer(state, s) {
  Object.assign(state, s.g);
  Object.assign(state.puck, s.k);
  s.p.forEach((p, i) => Object.assign(state.players[i], p));
  state.teams.forEach((t, i) => Object.assign(t, s.eq[i]));
  // Le navigateur garde ses propres réglages de joueur (touches déjà enfoncées) : seuls l'équipe et le patineur
  // dirigé viennent du serveur. Une équipe reprise par l'ordinateur n'a plus de joueur humain.
  state.humans = s.h.map((h) => ({ ...(state.humans.find((q) => q.team === h.team) ?? { prev: {}, foPress: -99 }), ...h }));
  state.call = s.call;
  state.faceoff = s.faceoff;
  state.so = s.so;
  state.pshot = s.pshot;
  state.result = s.result;
  state.score = s.score;
  if (s.sheet) state.sheet = s.sheet;
  return s.e ?? [];
}

/** Commandes d'un joueur, telles que le navigateur les envoie : tout est vérifié à l'arrivée. */
const TOUCHES = ['pass', 'shoot', 'steal', 'sw', 'skid', 'dodge', 'check', 'kneel', 'line', 'timeout'];
export function coderCommandes(c) {
  let bits = 0;
  TOUCHES.forEach((k, i) => c[k] && (bits |= 1 << i));
  return { t: 'c', x: Math.round((c.mx ?? 0) * 100), y: Math.round((c.my ?? 0) * 100), b: bits };
}
export function lireCommandes(m) {
  const axe = (v) => (Number.isFinite(v) ? Math.max(-1, Math.min(1, v / 100)) : 0);
  const bits = Number.isInteger(m.b) ? m.b : 0;
  const c = { mx: axe(m.x), my: axe(m.y) };
  TOUCHES.forEach((k, i) => (c[k] = !!(bits & (1 << i))));
  return c;
}
