// Arbitrage : coups de sifflet, engagements (9.3.1), pénalités (10.1 à 10.3), buts (9.3.9), chrono (5.4.1).
import { DT, SPOTS, GOAL_X, HW, HL, nearestSpot, defenceSpots, inCrease, boardInfo } from './geometry.js';
import { rnd, emit, skatersOnRink, goalieOf } from './state.js';
import { INFRACTIONS, AUTRES_GESTES } from '../data/infractions.js';

const hyp = Math.hypot;

/** Note qu'un joueur a touché le palet (buteur et passeur). */
export function touch(state, p) {
  const k = state.puck;
  if (k.lastBy[p.team] !== p.id) {
    k.prevBy[p.team] = k.lastBy[p.team];
    k.lastBy[p.team] = p.id;
  }
  k.lastTouch = p.id;
  k.lastTeam = p.team;
}

function label(state, p) {
  const t = state.cfg.teams[p.team];
  return { team: p.team, sigle: t.sigle, num: p.num, name: p.name };
}

// ---------------------------------------------------------------- arrêts de jeu

/** Arrête le jeu. opts : { spot, call } où call décrit ce qui s'affiche. */
export function stopPlay(state, reason, opts) {
  const k = state.puck;
  if (state.phase === 'shootout') {
    // Pendant un tir de pénalité, tout arrêt de jeu (gardien qui gèle le palet, but refusé) termine le tir.
    state.so.over = 'miss';
    return;
  }
  state.phase = 'whistle';
  state.phaseT = opts.call?.kind === 'penalty' ? 3.4 : 2.0;
  state.faceoff = { spot: opts.spot, reason };
  state.call = opts.call ?? null;
  state.advantage = -1;
  if (state.ref) state.ref.arm = -1;
  k.carrier = -1;
  k.passTarget = -1;
  k.vx = 0;
  k.vy = 0;
  k.vz = 0;
  k.z = 0;
  k.dead = true;
  k.pinT = 0;
  for (const t of state.teams) t.ownHalfT = 0;
  for (const p of state.players) p.charge = 0;
  emit(state, { type: 'whistle', reason, call: state.call });
}

// ---------------------------------------------------------------- pénalités

/**
 * Signale une faute. f : { code, offender, severity: 'minor' | 'major', extra: null | 'MPM' | 'PM' }
 * Avantage (10.3) : si l'équipe fautive n'a pas le palet, le jeu continue jusqu'à ce qu'elle le contrôle.
 */
export function callFoul(state, f) {
  if (state.phase !== 'play') return false;
  const off = state.players[f.offender];
  if (off.foulCd > 0 || state.pending.some((q) => q.offender === off.id)) return false;
  off.foulCd = 3;
  const shot = penaltyShotDue(state, f);
  if (state.ref) {
    // Arbitre humain : l'ordinateur note ce qu'il a vu et se tait. `immediate` : il aurait sifflé tout de suite
    // (l'équipe fautive a le palet, ou tir de pénalité) au lieu de laisser l'avantage (10.3).
    const c = state.puck.carrier;
    const immediate = shot || (c >= 0 && state.players[c].team === off.team);
    state.seen.push({ tick: state.tick, period: state.period, clock: state.clock, code: f.code, offender: off.id, victim: f.victim ?? -1, severity: f.severity, shot, team: off.team, immediate });
    emit(state, { type: 'foul', code: f.code, by: off.id, victim: f.victim ?? -1 });
    return true;
  }
  state.pending.push({ extra: null, ...f, shot, team: off.team, tick: state.tick });
  // Pour l'affichage : quelle faute, par qui, sur qui (le geste du fautif et la réaction de la victime en dépendent).
  emit(state, { type: 'foul', code: f.code, by: off.id, victim: f.victim ?? -1 });
  // Tir de pénalité : le jeu s'arrête tout de suite (choix du jeu : pas d'avantage laissé avant le tir).
  if (shot) return whistlePenalties(state), true;
  const c = state.puck.carrier;
  const ctrl = c >= 0 ? state.players[c].team : -1;
  const both = new Set(state.pending.map((q) => q.team)).size > 1;
  if (ctrl === off.team || both) whistlePenalties(state);
  else if (state.advantage < 0) {
    state.advantage = off.team;
    emit(state, { type: 'advantage', team: off.team, code: f.code });
  }
  return true;
}

/** Fautes par l'arrière qui peuvent valoir un tir de pénalité. */
const SHOT_FOULS = ['ACC', 'TRE', 'DOS'];
/** Fautes de crosse comptées pour le cumul (10.1.7) : trois excluent le joueur. */
export const STICK_FOULS = ['HAU', 'CIN', 'ACC', 'CRO', 'PIQ'];

/**
 * Tir de pénalité (10.4.11) : le joueur contrôle le palet, a passé le milieu, n'a plus que le gardien devant
 * lui et subit une faute par l'arrière. Dans le jeu : aucun patineur adverse n'est plus près de la ligne de
 * but que lui, et le fautif est derrière lui.
 */
function penaltyShotDue(state, f) {
  if (f.victim == null || !f.hadPuck || !SHOT_FOULS.includes(f.code)) return false;
  const v = state.players[f.victim];
  const off = state.players[f.offender];
  if (v.goalie || v.team === off.team) return false;
  const d = state.teams[v.team].dir;
  const vx = v.x * d;
  if (vx <= 0 || vx > GOAL_X) return false;
  return !skatersOnRink(state, off.team).some((p) => p.x * d >= vx);
}

/** Siffle les pénalités en attente et place l'engagement (9.3.1 K et L). */
export function whistlePenalties(state, note) {
  const list = state.pending;
  state.pending = [];
  if (!list.length) return;
  list.sort((a, b) => (b.severity === 'major') - (a.severity === 'major'));
  const k = state.puck;
  const teams = [...new Set(list.map((q) => q.team))];
  const spot = teams.length > 1 ? nearestSpot(k.x, k.y) : nearestSpot(k.x, k.y, defenceSpots(state.teams[teams[0]].dir));
  // Pénalités simultanées (10.1.9) : une pénalité équivalente de chaque côté au même arrêt de jeu. Les joueurs
  // vont au banc mais sont remplacés ; seules les paires qui se compensent sont concernées.
  for (const sev of ['minor', 'major']) {
    const sides = [0, 1].map((t) => list.filter((f) => f.team === t && f.severity === sev && !f.shot));
    for (let i = 0; i < Math.min(sides[0].length, sides[1].length); i++) sides[0][i].coincident = sides[1][i].coincident = true;
  }
  // Tir de pénalité : la mineure n'est pas purgée (elle compte pour le cumul) ; une majeure l'est quand même.
  const shot = list.find((f) => f.shot);
  const calls = list.map((f) => assess(state, f, !(f.shot && f.severity === 'minor')));
  if (shot) {
    const v = state.players[shot.victim];
    state.pshot = { team: v.team, shooter: v.id };
    note = `Tir de pénalité pour ${state.cfg.teams[v.team].sigle}, n° ${v.num} ${v.name} (10.4.11)`;
  }
  stopPlay(state, 'penalty', { spot, call: { ...calls[0], others: calls.slice(1), note, tir: !!shot } });
}

function sanctionText(state, f, served = true) {
  if (!served) return 'Tir de pénalité — pas de pénalité purgée';
  const s = f.severity === 'major' ? state.cfg.major : state.cfg.minor;
  let txt = f.severity === 'major' ? `Pénalité majeure — ${s} s` : `Pénalité mineure — ${s} s`;
  if (f.extra === 'MPM') txt += ' + méconduite pour le match';
  if (f.extra === 'PM') txt = `Pénalité de match — majeure de ${s} s purgée par un coéquipier`;
  if (f.severity === 'major' && f.extra !== 'PM') txt += ' (fautif exclu)';
  return txt;
}

/**
 * Cumul des pénalités d'un joueur (10.1.7). Renvoie { misconduct, out, reason }.
 * 3e mineure : méconduite en plus ; toute pénalité suivante : exclusion ; 3 fautes de crosse : exclusion ;
 * 2e méconduite : méconduite pour le match. Le gardien n'est pas concerné (pas de gardien remplaçant).
 */
function cumul(off, f) {
  if (off.goalie) return { misconduct: false, out: false, reason: null };
  const afterThird = off.minors >= 3;
  if (f.severity === 'minor') off.minors++;
  const stick = STICK_FOULS.includes(f.code);
  if (stick) off.stick++;
  if (afterThird) return { misconduct: false, out: true, reason: 'pénalité après sa 3e mineure : exclusion' };
  if (stick && off.stick >= 3) return { misconduct: false, out: true, reason: '3e faute de crosse : exclusion' };
  if (f.severity === 'minor' && off.minors === 3) {
    off.misc++;
    if (off.misc >= 2) return { misconduct: false, out: true, reason: '2e méconduite : méconduite pour le match' };
    return { misconduct: true, out: false, reason: '3e mineure : méconduite' };
  }
  return { misconduct: false, out: false, reason: null };
}

/** Le joueur purge-t-il une méconduite (au banc, mais remplacé) ? */
const inMisconduct = (state, p) => state.teams[p.team].misconducts.some((m) => m.player === p.id);

/**
 * Applique une pénalité et renvoie sa description pour l'affichage.
 * served faux : la pénalité n'est pas purgée (tir de pénalité accordé, ou but pendant l'avantage) mais elle
 * compte pour le cumul.
 */
function assess(state, f, served = true) {
  const off = state.players[f.offender];
  const team = state.teams[off.team];
  const major = f.severity === 'major';
  const dur = major ? state.cfg.major : state.cfg.minor;
  const c = cumul(off, f);
  const excluded = (major || c.out) && !off.goalie;
  // Une équipe ne descend jamais sous deux patineurs (10.2.1) : s'il ne lui en reste que deux en état de jouer,
  // la pénalité est notée mais personne ne va au banc.
  const coincident = !!f.coincident && served;
  const able = state.players.filter((p) => p.team === off.team && !p.goalie && (p.status === 'rink' || p.status === 'bench') && !(excluded && p.id === off.id)).length;
  if (able <= 2) served = false;
  let server = off;
  if (coincident && served) {
    // Simultanée : le joueur purge au banc sans mettre son équipe en infériorité (10.1.9).
    team.pim += major ? 5 : 2;
    if (!excluded) {
      team.misconducts.push({ player: off.id, remaining: dur, over: false, code: f.code });
      off.status = 'box';
    }
  } else if (served) {
    if (excluded || off.goalie) {
      // Majeure ou exclusion : le fautif sort du match (10.1.7) et un coéquipier présent sur la piste purge (10.1.3).
      // Gardien pénalisé : un coéquipier purge à sa place (10.1.2 B).
      const others = skatersOnRink(state, off.team).filter((p) => p.id !== off.id);
      server = others[others.length - 1] ?? off;
    }
    server.status = 'box';
    team.penalties.push({ code: f.code, kind: f.severity, offender: off.id, server: server.id, total: dur, remaining: dur });
    team.pim += major ? 5 : 2;
  }
  if (excluded) off.status = 'out';
  else if (c.misconduct) {
    // Méconduite (10.1.4) : au banc pour dix minutes à l'échelle du match, après sa mineure ; il est remplacé.
    team.pim += 10;
    if (able > 2) {
      team.misconducts.push({ player: off.id, remaining: state.cfg.misconduct, over: false });
      off.status = 'box';
    }
  }
  lineup(state, off.team);
  const inf = INFRACTIONS[f.code];
  const who = label(state, off);
  state.sheet.push({ type: 'penalty', period: state.period, clock: state.clock, ...who, code: f.code, minutes: major ? 5 : 2, nonPurgee: !served, cumul: c.reason, simultanee: coincident });
  return {
    kind: 'penalty',
    code: f.code,
    nom: inf.nom,
    article: inf.article,
    geste: inf.geste,
    sanction: sanctionText(state, f, served) + (coincident ? ' — pénalités simultanées, les équipes restent à quatre' : '') + (c.reason ? ` — ${c.reason}` : ''),
    severity: f.severity,
    ...who,
    purgePar: served && server.id !== off.id ? label(state, server) : null,
  };
}

/** Complète l'équipe sur la piste : 4 patineurs moins les pénalités décomptées, jamais moins de 2 (10.2.1 C). */
export function lineup(state, t) {
  const team = state.teams[t];
  const desired = Math.max(2, state.skaters - Math.min(2, team.penalties.length));
  let rink = skatersOnRink(state, t);
  while (rink.length < desired) {
    const bench = state.players.filter((p) => p.team === t && !p.goalie && p.status === 'bench');
    if (!bench.length) break;
    // D'abord celui qui sort du banc des pénalités, puis la ligne en jeu, puis un joueur de l'autre ligne qui double.
    const p = bench.find((q) => q.justOut) ?? bench.find((q) => q.line === team.line) ?? bench[0];
    const used = new Set(rink.map((q) => q.slot));
    p.slot = [0, 1, 2, 3].find((s) => !used.has(s)) ?? 3;
    p.status = 'rink';
    p.stun = 0;
    p.vx = 0;
    p.vy = 0;
    if (p.justOut) {
      // Sortie du banc des pénalités, côté table de marque.
      p.x = team.dir > 0 ? -2.2 : 2.2;
      p.y = HW - 0.8;
    } else {
      p.x = team.dir > 0 ? -4 : 4;
      p.y = -HW + 0.8;
    }
    p.justOut = false;
    rink = skatersOnRink(state, t);
  }
  for (const p of state.players) if (p.team === t) p.justOut = false;
}

function release(state, t, pen) {
  const team = state.teams[t];
  team.penalties.splice(team.penalties.indexOf(pen), 1);
  const server = state.players[pen.server];
  // Un joueur en méconduite reste au banc des pénalités après sa mineure ; son équipe retrouve un patineur.
  if (!inMisconduct(state, server)) {
    server.status = 'bench';
    server.justOut = true;
  }
  lineup(state, t);
  emit(state, { type: 'penaltyEnd', team: t, player: server.id });
}

function tickPenalties(state) {
  for (let t = 0; t < 2; t++) {
    const running = state.teams[t].penalties.slice(0, 2);
    for (const pen of running) {
      pen.remaining -= DT;
      if (pen.remaining <= 0) release(state, t, pen);
    }
    // La méconduite se décompte une fois la mineure du joueur terminée.
    const seen = new Set();
    for (const m of state.teams[t].misconducts) {
      // L'une après l'autre pour un même joueur, et après sa mineure s'il en purge une.
      if (m.over || seen.has(m.player)) continue;
      seen.add(m.player);
      if (state.teams[t].penalties.some((q) => q.server === m.player)) continue;
      m.remaining -= DT;
      if (m.remaining <= 0) m.over = true;
    }
  }
}

// ---------------------------------------------------------------- buts

export function attackersInCrease(state, side) {
  const t = state.teams[0].dir === side ? 0 : 1;
  return skatersOnRink(state, t).some((p) => inCrease(p.x, p.y, side));
}

/** Le palet a entièrement franchi la ligne de la cage du côté side. */
export function goalCrossed(state, side, creaseFoul) {
  const k = state.puck;
  const scoring = state.teams[0].dir === side ? 0 : 1;
  const other = 1 - scoring;
  if (state.phase === 'shootout') {
    state.so.over = creaseFoul || scoring !== state.so.team ? 'miss' : 'goal';
    return;
  }
  if (state.ref && !state.ref.confirm) {
    // Arbitre humain : le jeu s'arrête, c'est lui qui accorde ou refuse le but (refGoal).
    state.seen.push({ tick: state.tick, period: state.period, clock: state.clock, goal: true, team: scoring, refuse: !!creaseFoul });
    stopPlay(state, 'refgoal', { spot: SPOTS.C, call: null });
    state.ref.wait = 'goal';
    state.ref.goal = { side, team: scoring };
    return;
  }
  if (creaseFoul) {
    // 9.3.9 L : un attaquant était dans la zone de but quand le palet y est entré.
    if (state.pending.length) return whistlePenalties(state, 'But refusé : attaquant dans la zone de but (9.3.9)');
    return stopPlay(state, 'nogoal', {
      spot: SPOTS.C,
      call: { kind: 'nogoal', titre: 'But refusé', detail: 'Un attaquant était dans la zone de but quand le palet y est entré', article: '9.3.9', geste: "Les deux bras écartés à l'horizontale", team: scoring },
    });
  }
  state.score[scoring]++;
  state.teams[scoring].shots++;
  const scorer = k.lastBy[scoring] >= 0 ? state.players[k.lastBy[scoring]] : null;
  const assist = k.prevBy[scoring] >= 0 && k.prevBy[scoring] !== k.lastBy[scoring] ? state.players[k.prevBy[scoring]] : null;
  const csc = k.lastTeam !== scoring;
  const entry = {
    type: 'goal',
    period: state.period,
    clock: state.clock,
    team: scoring,
    sigle: state.cfg.teams[scoring].sigle,
    scorer: scorer ? { num: scorer.num, name: scorer.name } : null,
    assist: assist && !csc ? { num: assist.num, name: assist.name } : null,
    csc,
    score: [...state.score],
  };
  state.sheet.push(entry);
  // 10.3 D : une mineure signalée n'est pas purgée si l'équipe non fautive marque ; les autres le sont.
  const pend = state.pending;
  state.pending = [];
  for (const f of pend) {
    // Non purgée, mais elle compte pour le cumul du joueur (10.1.7).
    assess(state, f, !(f.team === other && f.severity === 'minor'));
  }
  // 10.2.1 A : la première mineure de l'équipe en infériorité qui encaisse prend fin.
  if (skatersOnRink(state, other).length < skatersOnRink(state, scoring).length) {
    const pen = state.teams[other].penalties.slice(0, 2).find((q) => q.kind === 'minor');
    if (pen) release(state, other, pen);
  }
  state.phase = 'goal';
  state.phaseT = 3.6;
  state.suddenDeath = state.period === 3; // but en prolongation : le match s'arrête là
  state.faceoff = { spot: SPOTS.C, reason: 'goal' };
  state.call = { kind: 'goal', ...entry };
  state.advantage = -1;
  k.carrier = -1;
  k.passTarget = -1;
  k.vx = 0;
  k.vy = 0;
  k.dead = true;
  for (const p of state.players) p.charge = 0;
  emit(state, entry);
}

/** Méconduite terminée : le joueur revient au premier arrêt de jeu (10.1.4). */
function endMisconducts(state) {
  for (const team of state.teams) {
    for (const m of team.misconducts.filter((q) => q.over)) {
      const p = state.players[m.player];
      const more = team.misconducts.some((q) => !q.over && q.player === m.player);
      if (p.status === 'box' && !more) p.status = 'bench';
    }
    team.misconducts = team.misconducts.filter((q) => !q.over);
  }
}

// ---------------------------------------------------------------- lignes

/** Écart de fraîcheur à partir duquel le changement automatique fait entrer l'autre ligne. */
export const LINE_GAP = 0.25;

/** Fait entrer une ligne : tous les patineurs disponibles vont au banc, puis la ligne choisie est alignée. */
export function setLine(state, t, line) {
  const team = state.teams[t];
  team.line = line;
  team.wantChange = false;
  for (const p of state.players) if (p.team === t && !p.goalie && p.status === 'rink') p.status = 'bench';
  lineup(state, t);
  emit(state, { type: 'lineChange', team: t, line });
}

/**
 * Changements de ligne, aux arrêts de jeu seulement (les changements en cours de jeu sont hors périmètre).
 * Début de période : la ligne 1. Sinon, l'ordinateur et les équipes en changement automatique font entrer
 * la ligne la plus fraîche si l'écart est net ; en manuel, seulement sur demande. Pas de changement en
 * prolongation. La fatigue est un choix du jeu (voir README), pas une règle.
 */
function changeLines(state, reason) {
  if (state.period === 3) return;
  for (let t = 0; t < 2; t++) {
    const team = state.teams[t];
    if (reason === 'period') {
      if (team.line !== 0) setLine(state, t, 0);
      team.wantChange = false;
      continue;
    }
    const manual = state.cfg.lineChange === 'manuel' && state.humans.some((h) => h.team === t);
    const other = 1 - team.line;
    if (manual ? team.wantChange : team.fresh[other] - team.fresh[team.line] > LINE_GAP) setLine(state, t, other);
  }
}

/** Fatigue : la ligne sur la piste se fatigue, l'autre récupère à la même vitesse. */
function tickFatigue(state) {
  const step = DT / state.cfg.tireTime;
  for (let t = 0; t < 2; t++) {
    const team = state.teams[t];
    for (let l = 0; l < 2; l++) team.fresh[l] = Math.max(0, Math.min(1, team.fresh[l] + (l === team.line ? -step : step)));
  }
  for (const p of state.players) if (p.status === 'rink') p.toi += DT;
}

// ---------------------------------------------------------------- engagements

function setFaceoffPositions(state) {
  const S = state.faceoff.spot;
  for (let t = 0; t < 2; t++) {
    const d = state.teams[t].dir;
    const list = skatersOnRink(state, t).sort((a, b) => a.slot - b.slot);
    const face = d > 0 ? 0 : Math.PI;
    const inner = S.y === 0 ? 1 : -Math.sign(S.y);
    const pos = [[S.x - d * 0.8, S.y]];
    if (list.length >= 4) pos.push([S.x - d * 0.8, S.y + inner * 3.8], [S.x - d * 0.8, S.y - inner * 3.8], [S.x - d * 5.5, S.y * 0.4]);
    else if (list.length === 3) pos.push([S.x - d * 0.8, S.y + inner * 3.8], [S.x - d * 5.5, S.y * 0.4]);
    else pos.push([S.x - d * 5.5, S.y * 0.4]);
    list.forEach((p, i) => {
      p.fx = Math.max(-HL + 1.5, Math.min(HL - 1.5, pos[i][0]));
      p.fy = Math.max(-HW + 1, Math.min(HW - 1, pos[i][1]));
      p.fface = face;
    });
    const g = goalieOf(state, t);
    g.fx = -d * (GOAL_X - 0.9);
    g.fy = 0;
    g.fface = face;
  }
}

/** Durée d'un temps mort à l'écran, en secondes (une minute en vrai). */
export const TIMEOUT_T = 5;

/** L'ordinateur demande son temps mort : ses deux lignes sous 70 % de fraîcheur, dernier tiers de la période, pas en tête. */
function aiWantsTimeout(state, t) {
  const team = state.teams[t];
  if (state.humans.some((h) => h.team === t)) return false;
  return Math.max(...team.fresh) < 0.7 && state.clock < state.cfg.periodLength / 3 && state.score[t] <= state.score[1 - t];
}

/**
 * Temps mort (9.3.2) : un par équipe et par période, pris pendant un arrêt de jeu, jamais en prolongation.
 * Effet (choix du jeu) : l'équipe qui le demande retrouve toute sa fraîcheur, l'adversaire la moitié de ce
 * qui lui manque. Renvoie vrai si un temps mort commence : l'engagement attendra sa fin.
 */
function takeTimeout(state, spot, reason) {
  if (state.period === 3 || reason === 'period') return false;
  for (let t = 0; t < 2; t++) {
    const team = state.teams[t];
    if (team.timeoutUsed || !(team.wantTimeout || aiWantsTimeout(state, t))) continue;
    team.timeoutUsed = true;
    team.wantTimeout = false;
    team.fresh = [1, 1];
    const other = state.teams[1 - t];
    other.fresh = other.fresh.map((f) => f + (1 - f) * 0.5);
    state.phase = 'timeout';
    state.phaseT = TIMEOUT_T;
    state.faceoff = { spot, reason };
    state.call = { kind: 'info', titre: `Temps mort — ${state.cfg.teams[t].sigle}`, detail: 'Un temps mort par équipe et par période', article: '9.3.2', geste: AUTRES_GESTES.TEMPS_MORT.geste, team: t };
    emit(state, { type: 'timeout', team: t });
    return true;
  }
  return false;
}

export function beginFaceoff(state, spot, reason) {
  if (takeTimeout(state, spot, reason)) return;
  state.phase = 'faceoff';
  state.phaseT = reason === 'period' ? 2.6 : 1.9;
  state.faceoff = { spot, reason };
  state.call = null;
  const k = state.puck;
  k.x = spot.x;
  k.y = spot.y;
  k.z = 0;
  k.vx = 0;
  k.vy = 0;
  k.vz = 0;
  k.carrier = -1;
  k.passTarget = -1;
  k.dead = true;
  k.creaseFoul = false;
  k.wasInCrease = 0;
  k.idleT = 0;
  for (const p of state.players) {
    p.stun = 0;
    p.charge = 0;
    p.hold = 0;
    p.mich = 0;
    p.down = 0; // le gardien se relève à l'arrêt de jeu
    p.checkT = 0;
    p.dodgeT = 0;
    p.offBal = 0;
    p.skid = false;
    p.back = false;
  }
  endMisconducts(state);
  changeLines(state, reason);
  setFaceoffPositions(state);
  emit(state, { type: 'faceoff', spot: spot.id, reason });
}

/** Mise en place puis lâcher du palet. */
export function tickFaceoff(state) {
  state.phaseT -= DT;
  const snap = state.phaseT <= 0;
  for (const p of state.players) {
    if (p.status !== 'rink') continue;
    const a = snap ? 1 : Math.min(1, 5 * DT);
    const nx = p.x + (p.fx - p.x) * a;
    const ny = p.y + (p.fy - p.y) * a;
    p.vx = (nx - p.x) / DT;
    p.vy = (ny - p.y) / DT;
    if (hyp(p.vx, p.vy) > 1) p.face = Math.atan2(p.vy, p.vx);
    else p.face = p.fface;
    p.x = nx;
    p.y = ny;
    if (snap) {
      p.vx = 0;
      p.vy = 0;
      p.face = p.fface;
      p.track.x = state.puck.x;
      p.track.y = state.puck.y;
    }
  }
  if (!snap) return;
  let p0 = 0.5;
  // Un seul avantage par équipe, même avec deux joueurs dans la même équipe.
  for (const t of [0, 1]) if (state.humans.some((h) => h.team === t && state.tick - h.foPress <= 22)) p0 += t === 0 ? 0.22 : -0.22;
  const winner = rnd(state) < p0 ? 0 : 1;
  const centre = skatersOnRink(state, winner).sort((a, b) => a.slot - b.slot)[0] ?? goalieOf(state, winner);
  const k = state.puck;
  k.dead = false;
  k.lastBy = [-1, -1];
  k.prevBy = [-1, -1];
  k.carrier = centre.id;
  touch(state, centre);
  state.phase = 'play';
  emit(state, { type: 'drop', team: winner });
}

// ---------------------------------------------------------------- chrono et retard de jeu

function endPeriod(state) {
  const pend = state.pending;
  state.pending = [];
  for (const f of pend) assess(state, f);
  state.advantage = -1;
  const k = state.puck;
  k.carrier = -1;
  k.dead = true;
  k.vx = 0;
  k.vy = 0;
  state.call = null;
  if (state.period === 1) {
    state.phase = 'break';
    state.phaseT = 4.5;
    emit(state, { type: 'periodEnd', period: 1 });
  } else if (state.score[0] !== state.score[1]) {
    finish(state, state.period === 3 ? 'prolongation' : 'temps', state.score[0] > state.score[1] ? 0 : 1);
  } else if (!state.cfg.overtime) {
    finish(state, 'nul', -1);
  } else {
    // Égalité : prolongation après la 2e période, tirs de pénalité après la prolongation.
    state.phase = 'break';
    state.phaseT = 3.5;
    emit(state, { type: 'periodEnd', period: state.period });
  }
}

/** Fin du match. how : 'temps' | 'prolongation' | 'tirs' | 'nul'. */
export function finish(state, how, winner, extra = {}) {
  state.result = { how, winner, ...extra };
  state.phase = 'final';
  state.puck.dead = true;
  emit(state, { type: 'final', score: [...state.score], how, winner });
}

/**
 * Prolongation : mort subite à 3 patineurs contre 3 plus les gardiens, sans changement de côté.
 * Les trois premiers de la feuille de match disponibles jouent ; une pénalité en cours continue (2 contre 3).
 */
export function startOvertime(state) {
  state.period = 3;
  state.clock = state.cfg.overtimeLength;
  state.skaters = 3;
  for (const p of state.players) if (!p.goalie && p.status === 'rink') p.status = 'bench';
  for (let t = 0; t < 2; t++) {
    // Les trois joueurs de la ligne la plus fraîche jouent ; pas de changement ensuite.
    const team = state.teams[t];
    team.line = team.fresh[1] > team.fresh[0] ? 1 : 0;
    team.wantChange = false;
    team.wantTimeout = false;
    state.teams[t].noAdvanceWarned = false;
    state.teams[t].ownHalfT = 0;
    lineup(state, t);
  }
  beginFaceoff(state, SPOTS.C, 'period');
}

/** Passage à la seconde période : les équipes changent de côté. */
export function startSecondPeriod(state) {
  state.period = 2;
  state.clock = state.cfg.periodLength;
  for (const t of state.teams) {
    t.dir = -t.dir;
    t.timeoutUsed = false; // un temps mort par période, non reporté
    t.wantTimeout = false;
    t.noAdvanceWarned = false;
    t.ownHalfT = 0;
  }
  beginFaceoff(state, SPOTS.C, 'period');
}

function oppWithin(state, team, x, y, r) {
  return state.players.some((p) => p.team !== team && !p.goalie && p.status === 'rink' && hyp(p.x - x, p.y - y) < r);
}

/** À appeler à chaque pas de jeu : chrono, pénalités, avantage, retards de jeu. */
export function tickRules(state) {
  const k = state.puck;
  state.clock -= DT;
  tickPenalties(state);
  tickFatigue(state);
  if (state.clock <= 0) {
    state.clock = 0;
    return endPeriod(state);
  }
  const carrier = k.carrier >= 0 ? state.players[k.carrier] : null;

  // Avantage : l'équipe fautive prend le contrôle du palet, sifflet (10.3 C).
  if (state.pending.length && carrier && state.pending.some((q) => q.team === carrier.team)) return whistlePenalties(state);
  // Arbitre humain, bras levé : le jeu s'arrête quand l'équipe signalée contrôle le palet (10.3).
  if (state.ref && state.ref.arm >= 0 && carrier && carrier.team === state.ref.arm) return refStop(state, true);

  // Palet retenu contre la balustrade (9.3.6 D).
  if (carrier && !carrier.goalie && hyp(carrier.vx, carrier.vy) < 0.7 && boardInfo(carrier.x, carrier.y).dist < 1.1 && !oppWithin(state, carrier.team, carrier.x, carrier.y, 1.7)) {
    k.pinT += DT;
    if (k.pinT > 3) return void callFoul(state, { code: 'JEU', offender: carrier.id, severity: 'minor' });
  } else k.pinT = 0;

  // Maintien en mouvement du palet (9.3.6 B et C) : une équipe en possession dans son camp doit avancer.
  // Le règlement ne chiffre pas de délai : le jeu retient 10 secondes sans adversaire à moins de 3 m.
  const ctrl = carrier ? carrier.team : k.lastTeam;
  for (let t = 0; t < 2; t++) {
    const team = state.teams[t];
    const own = t === ctrl && k.x * team.dir < 0;
    if (!own) {
      team.ownHalfT = 0;
      continue;
    }
    const short = skatersOnRink(state, t).length < skatersOnRink(state, 1 - t).length;
    if (short) team.ownHalfT = 0;
    else if (!oppWithin(state, t, k.x, k.y, 3)) team.ownHalfT += DT;
    if (team.ownHalfT > 10) {
      team.ownHalfT = 0;
      const spot = nearestSpot(k.x, k.y, defenceSpots(team.dir));
      if (!team.noAdvanceWarned) {
        team.noAdvanceWarned = true;
        return stopPlay(state, 'noAdvance', {
          spot,
          call: { kind: 'info', titre: 'Palet non avancé', detail: "L'équipe en possession dans son camp doit avancer. Avertissement au capitaine.", article: '9.3.6', team: t },
        });
      }
      const off = carrier && carrier.team === t ? carrier : state.players[k.lastBy[t]];
      if (off) return void callFoul(state, { code: 'JEU', offender: off.id, severity: 'minor' });
    }
  }

  // Palet immobile et hors d'atteinte trop longtemps : engagement au point le plus proche (9.3.8).
  if (!carrier && hyp(k.vx, k.vy) < 0.3) {
    k.idleT = (k.idleT ?? 0) + DT;
    if (k.idleT > 8) return stopPlay(state, 'unplayable', { spot: nearestSpot(k.x, k.y), call: { kind: 'info', titre: 'Palet injouable', detail: 'Engagement au point le plus proche', article: '9.3.8' } });
  } else k.idleT = 0;
}

// ---------------------------------------------------------------- arbitre humain (mode Arbitre réel)
// Ces fonctions sont les commandes de l'arbitre, comme les touches le sont pour un joueur : la logique reste
// déterministe pour une même suite de commandes.

function refStop(state, byArm) {
  const k = state.puck;
  const at = { x: k.x, y: k.y };
  stopPlay(state, 'referee', { spot: nearestSpot(k.x, k.y), call: null });
  state.ref.wait = 'decision';
  state.ref.byArm = byArm;
  state.ref.at = at;
}

/** Coup de sifflet de l'arbitre : le jeu s'arrête, la décision est attendue (refDecide). */
export function refWhistle(state) {
  if (!state.ref || state.phase !== 'play') return false;
  // Siffler bras levé revient à arrêter soi-même une pénalité différée.
  refStop(state, state.ref.arm >= 0);
  return true;
}

/** Bras levé contre une équipe : pénalité différée, le jeu s'arrête quand elle contrôle le palet (10.3). */
export function refArm(state, team) {
  if (!state.ref || state.phase !== 'play' || state.ref.arm >= 0) return false;
  state.ref.arm = team;
  state.ref.armTick = state.tick;
  emit(state, { type: 'advantage', team, code: null });
  return true;
}

/**
 * Décision de l'arbitre après son coup de sifflet, appliquée telle quelle.
 * d : { faute: false } ou { faute: true, fautif, victime?, code, sanction: 'minor' | 'major' | 'tir', engagement: 'centre' | 'zone' | 'proche' }
 */
export function refDecide(state, d) {
  const r = state.ref;
  if (!r || r.wait !== 'decision') return false;
  r.wait = null;
  const at = r.at;
  let call;
  let spot = nearestSpot(at.x, at.y);
  if (!d.faute) {
    call = { kind: 'info', titre: 'Pas de faute', detail: "L'arbitre reprend le jeu par un engagement au point le plus proche.", article: '9.3.1' };
  } else {
    const off = state.players[d.fautif];
    const shot = d.sanction === 'tir';
    const f = { code: d.code, offender: off.id, victim: d.victime ?? -1, severity: d.sanction === 'major' ? 'major' : 'minor', extra: null, shot, team: off.team };
    // Tir de pénalité : la mineure n'est pas purgée, elle compte pour le cumul (10.4.11).
    call = assess(state, f, !(shot && f.severity === 'minor'));
    if (d.engagement === 'centre') spot = SPOTS.C;
    else if (d.engagement === 'zone') spot = nearestSpot(at.x, at.y, defenceSpots(state.teams[off.team].dir));
    if (shot) {
      // Le tireur est la victime désignée ; à défaut, l'adversaire le plus proche du fautif.
      let v = state.players[d.victime];
      if (!v || v.team === off.team || v.goalie || v.status !== 'rink') {
        v = skatersOnRink(state, 1 - off.team).sort((a, b) => hyp(a.x - off.x, a.y - off.y) - hyp(b.x - off.x, b.y - off.y))[0];
      }
      if (v) {
        state.pshot = { team: v.team, shooter: v.id };
        call = { ...call, tir: true, note: `Tir de pénalité pour ${state.cfg.teams[v.team].sigle}, n° ${v.num} ${v.name} (10.4.11)` };
      }
    }
  }
  state.call = call;
  state.faceoff = { spot, reason: d.faute ? 'penalty' : 'referee' };
  state.phaseT = d.faute ? 3.4 : 2.0;
  // `again` : le coup de sifflet a déjà retenti, cet événement porte seulement la décision.
  emit(state, { type: 'whistle', reason: state.faceoff.reason, call, again: true });
  return true;
}

/** But accordé ou refusé par l'arbitre (9.3.9). */
export function refGoal(state, accorde) {
  const r = state.ref;
  if (!r || r.wait !== 'goal') return false;
  r.wait = null;
  const g = r.goal;
  r.goal = null;
  if (accorde) {
    r.confirm = true;
    goalCrossed(state, g.side, false);
    r.confirm = false;
  } else {
    state.call = { kind: 'nogoal', titre: 'But refusé', detail: "L'arbitre refuse le but", article: '9.3.9', geste: "Les deux bras écartés à l'horizontale", team: g.team };
    state.faceoff = { spot: SPOTS.C, reason: 'nogoal' };
    state.phaseT = 2.0;
    emit(state, { type: 'whistle', reason: 'nogoal', call: state.call, again: true });
  }
  return true;
}
