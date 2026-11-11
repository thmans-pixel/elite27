// Affichage par-dessus la 3D : score, chrono, pénalités, décisions de l'arbitre, feuille de match.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

function setText(el, txt) {
  if (el.textContent !== txt) el.textContent = txt;
}
function setHtml(el, html) {
  if (el._h !== html) {
    el._h = html;
    el.innerHTML = html;
  }
}

export class Hud {
  constructor() {
    this.root = $('hud');
    this.goalT = 0;
  }

  begin(state, kits) {
    this.state = state;
    const [a, b] = state.cfg.teams;
    setText($('nameA'), a.sigle);
    setText($('nameB'), b.sigle);
    $('chipA').style.background = kits[0].maillot;
    $('chipB').style.background = kits[1].maillot;
    this.root.hidden = false;
    $('final').hidden = true;
    $('help').classList.remove('fade');
    setTimeout(() => $('help').classList.add('fade'), 14000);
  }

  onEvent(e) {
    if (e.type === 'goal') this.goalT = 3.4;
  }

  update(dt) {
    const s = this.state;
    if (!s) return;
    setText($('scoreA'), String(s.score[0]));
    setText($('scoreB'), String(s.score[1]));
    setText($('clock'), mmss(Math.ceil(s.clock - 1e-6)));
    setText($('period'), s.phase === 'break' ? 'Mi-temps' : s.period === 1 ? '1re période' : '2e période');

    for (let t = 0; t < 2; t++) {
      const pens = s.teams[t].penalties;
      const html = pens
        .map((p, i) => {
          const pl = s.players[p.server];
          return `<span class="pen ${p.kind}${i > 1 ? ' wait' : ''}"><b>${pl.num}</b>${p.code} ${Math.ceil(p.remaining)} s</span>`;
        })
        .join('');
      setHtml($(t === 0 ? 'pensA' : 'pensB'), html);
    }

    // Avantage : pénalité appelée, le jeu continue.
    const adv = $('adv');
    if (s.advantage >= 0 && s.phase === 'play') {
      adv.hidden = false;
      setText(adv, `Pénalité appelée contre ${s.cfg.teams[s.advantage].sigle} — avantage ${s.cfg.teams[1 - s.advantage].sigle}`);
    } else adv.hidden = true;

    // Décision de l'arbitre.
    const call = $('call');
    const c = s.call;
    if (s.phase === 'whistle' && c) {
      call.hidden = false;
      if (c.kind === 'penalty') {
        const extra = (c.others ?? []).map((o) => `<div class="more">${esc(o.sigle)} n° ${o.num} — ${esc(o.nom)} (${o.code}) : ${esc(o.sanction)}</div>`).join('');
        setHtml(
          call,
          `<div class="code ${c.severity}">${c.code}</div><div class="body"><div class="title">${esc(c.nom)}</div>` +
            `<div class="who">${esc(c.sigle)} n° ${c.num} ${esc(c.name)}</div><div class="sanction">${esc(c.sanction)}</div>` +
            (c.purgePar ? `<div class="more">Purgée par le n° ${c.purgePar.num} ${esc(c.purgePar.name)}</div>` : '') +
            (c.note ? `<div class="more">${esc(c.note)}</div>` : '') +
            extra +
            `<div class="art">Article ${c.article} · Geste : ${esc(c.geste)}</div></div>`,
        );
      } else {
        setHtml(
          call,
          `<div class="code info">${c.kind === 'nogoal' ? '✕' : '●'}</div><div class="body"><div class="title">${esc(c.titre)}</div>` +
            `<div class="sanction">${esc(c.detail ?? '')}</div><div class="art">Article ${c.article}${c.geste ? ` · Geste : ${esc(c.geste)}` : ''}</div></div>`,
        );
      }
    } else call.hidden = true;

    // But.
    const goal = $('goal');
    if (this.goalT > 0 && s.call?.kind === 'goal') {
      this.goalT -= dt;
      goal.hidden = false;
      const g = s.call;
      const who = g.scorer ? `n° ${g.scorer.num} ${g.scorer.name}${g.csc ? ' (contre son camp)' : ''}` : '';
      const ass = g.assist ? ` · passe du n° ${g.assist.num} ${g.assist.name}` : '';
      setHtml(goal, `<div class="big">BUT !</div><div class="sub">${esc(g.sigle)} ${esc(who)}${esc(ass)}</div>`);
    } else goal.hidden = true;

    // Joueurs contrôlés et jauge de tir.
    const who = s.humans
      .map((h, i) => {
        const p = s.players[h.selected];
        if (!p) return '';
        const ch = p.charge > 0 ? `<span class="bar"><i style="width:${Math.round(p.charge * 100)}%"></i></span>` : '';
        return `<div class="me p${i + 1}"><span class="tag">J${i + 1}</span> n° ${p.num} ${esc(p.name)}${ch}</div>`;
      })
      .join('');
    setHtml($('who'), who);

    if (s.phase === 'final' && $('final').hidden) this.showFinal();
  }

  showFinal() {
    const s = this.state;
    const [a, b] = s.cfg.teams;
    const rows = s.sheet
      .map((e) => {
        const t = `${e.period === 1 ? '1re' : '2e'} ${mmss(s.cfg.periodLength - e.clock)}`;
        if (e.type === 'goal') {
          const who = e.scorer ? `n° ${e.scorer.num} ${esc(e.scorer.name)}` : '';
          const ass = e.assist ? ` (passe n° ${e.assist.num})` : e.csc ? ' (contre son camp)' : '';
          return `<tr><td>${t}</td><td><b>But ${esc(e.sigle)}</b></td><td>${who}${ass}</td><td>${e.score[0]}-${e.score[1]}</td></tr>`;
        }
        return `<tr><td>${t}</td><td>Pénalité ${esc(e.sigle)}</td><td>n° ${e.num} ${esc(e.name)} — ${e.code}</td><td>${e.nonPurgee ? 'non purgée' : `${e.minutes} min`}</td></tr>`;
      })
      .join('');
    setHtml(
      $('finalBody'),
      `<div class="fscore"><span>${esc(a.nom)}</span><b>${s.score[0]} – ${s.score[1]}</b><span>${esc(b.nom)}</span></div>` +
        `<div class="fstats">Tirs cadrés : ${s.teams[0].shots} – ${s.teams[1].shots} · Minutes de pénalité : ${s.teams[0].pim} – ${s.teams[1].pim}</div>` +
        (rows ? `<table class="sheet"><tbody>${rows}</tbody></table>` : '<p class="empty">Ni but ni pénalité.</p>'),
    );
    $('final').hidden = false;
  }
}
