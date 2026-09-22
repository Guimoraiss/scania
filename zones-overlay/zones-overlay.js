"use strict";

/* ==========================================================================
   LCB Capacity Analytics — zones-overlay.js v10.0
   Redesign: paleta Scania navy #041E42, Barlow Condensed, visual industrial
========================================================================== */

const OVERLAY_ZONES = {
  "Base 10": {
    id: "base10", label: "Base 10", abbr: "B10",
    headerColor: "#041e42", defaultCapacity: 35000, defaultOcc: 82,
    hotspots: [{ top: "10.30%", left: "27.35%", width: "49.95%", height: "25.20%", showLabel: true }],
  },
  "Base 20": {
    id: "base20", label: "Base 20", abbr: "B20",
    headerColor: "#041e42", defaultCapacity: 55200, defaultOcc: 79,
    hotspots: [{ top: "36.40%", left: "27.22%", width: "50.39%", height: "20.82%", showLabel: true }],
  },
  "Blue Box Base 10": {
    id: "bbpalletb10", label: "Blue Box Base 10", abbr: "BBP10",
    headerColor: "#041e42", defaultCapacity: 8000, defaultOcc: 74,
    hotspots: [{ top: "58.00%", left: "23.50%", width: "25.50%", height: "11.00%", showLabel: true }],
  },
  "Blue Box Base 20": {
    id: "bbpalletb20", label: "Blue Box Base 20", abbr: "BBP20",
    headerColor: "#041e42", defaultCapacity: 8000, defaultOcc: 74,
    hotspots: [{ top: "69.50%", left: "23.50%", width: "25.50%", height: "11.50%", showLabel: true }],
  },
  "Blocado": {
    id: "blocado", label: "Blocado", abbr: "BL",
    headerColor: "#041e42", defaultCapacity: 19800, defaultOcc: 45,
    hotspots: [{ top: "7.10%", left: "77.95%", width: "16.10%", height: "40.40%", showLabel: true }],
  },
  "Blue Box Individual": {
    id: "bbindividual", label: "Blue Box Individual", abbr: "BBI",
    headerColor: "#041e42", defaultCapacity: 4200, defaultOcc: 55,
    hotspots: [{ top: "84.20%", left: "24.10%", width: "24.20%", height: "4.80%", showLabel: true }],
  },
  "T;M;4;0;X;90": {
    id: "tm40x90", label: "T;M;4;0;X;90", abbr: "TM",
    headerColor: "#041e42", defaultCapacity: 8000, defaultOcc: 30,
    hotspots: [{ top: "48.50%", left: "77.90%", width: "16.10%", height: "8.10%", showLabel: true }],
  },
};

const ZONE_ORDER = [
  "Base 10", "Base 20", "Blue Box Base 10", "Blue Box Base 20",
  "Blocado", "Blue Box Individual", "T;M;4;0;X;90",
];

const _state = {
  selectedPeriod:  null,
  selectedProject: null,
  thresholdMedium: 70,
  thresholdHigh:   90,
  volumeAtual:  0,
  volumeFuturo: 0,
  zoneCurrentOccupied: {},
};

let _listenersAttached = false;
let _activeZoneName    = null;
let _activeHotspotEl   = null;
let _activePopupEl     = null;

/* ==========================================================================
   UTILS
========================================================================== */
function _strip(v) { return String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
function _cleanPN(v) { const s = String(v ?? "").trim(); return s.replace(/^(\d+)\.0+$/, "$1"); }
function _norm(v)  { return _strip(v).trim().replace(/\s+/g, " ").toUpperCase(); }
function _compact(v) { return _norm(v).replace(/\s+/g, ""); }

function _txt(item, keys) {
  for (const k of keys) { const v = item?.[k]; if (v != null && String(v).trim()) return String(v).trim(); }
  return "";
}
function _num(item, keys) {
  for (const k of keys) { const n = Number(item?.[k]); if (Number.isFinite(n)) return n; }
  return 0;
}
function _fmtCx(v)    { return `${Number(v ?? 0).toLocaleString("pt-BR")} cx`; }
function _fmtVeic(v)  { return `${Number(v ?? 0).toLocaleString("pt-BR")} veíc./dia`; }
function _fmtMaybe(v) { if (v == null) return "—"; const n = Number(v); return Number.isFinite(n) ? _fmtCx(n) : "—"; }

function _periodKey(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const n = _norm(s);
  const MON = { JAN:1,FEV:2,MAR:3,ABR:4,MAI:5,JUN:6,JUL:7,AGO:8,SET:9,OUT:10,NOV:11,DEZ:12 };
  let m = n.match(/^(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)[\/\-\s]*(19\d{2}|20\d{2})$/);
  if (m) return +m[2] * 12 + MON[m[1]];
  m = n.match(/^(19\d{2}|20\d{2})[\/\-\s]*(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)$/);
  if (m) return +m[1] * 12 + MON[m[2]];
  m = n.match(/^Q([1-4])[\/\-\s]*(19\d{2}|20\d{2})$/);
  if (m) return +m[2] * 12 + +m[1] * 3;
  m = n.match(/^(19\d{2}|20\d{2})[\/\-\s]*Q([1-4])$/);
  if (m) return +m[1] * 12 + +m[2] * 3;
  m = n.match(/^(19\d{2}|20\d{2})[\/\-](\d{1,2})$/);
  if (m && +m[2] >= 1 && +m[2] <= 12) return +m[1] * 12 + +m[2];
  m = n.match(/^(\d{1,2})[\/\-](19\d{2}|20\d{2})$/);
  if (m && +m[1] >= 1 && +m[1] <= 12) return +m[2] * 12 + +m[1];
  const d = new Date(s);
  if (!isNaN(d)) return d.getFullYear() * 12 + d.getMonth() + 1;
  return null;
}

/* ==========================================================================
   CLASSIFICAÇÃO DE ZONA
========================================================================== */
function _classifyZone(raw) {
  const c = _compact(raw ?? "");
  if (!c) return null;
  if (/^BASE10$|^BASE_10$|^BASE-10$|^PORTAPALLET$/.test(c))  return "Base 10";
  if (/^BASE20$|^BASE_20$|^BASE-20$/.test(c))                 return "Base 20";
  if (/BLUEBOXINDIVIDUAL|BBINDIVIDUAL|BB_INDIVIDUAL/.test(c)) return "Blue Box Individual";
  if (/BLUEBOXBASE10|BLUEBOXBASE_10|BLUEBOXB10|BBP10|BBPALLETB10/.test(c)) return "Blue Box Base 10";
  if (/BLUEBOXBASE20|BLUEBOXBASE_20|BLUEBOXB20|BBP20|BBPALLETB20/.test(c)) return "Blue Box Base 20";
  if (/BLUEBOXPALLET|BBPALLET|BB_PALLET/.test(c))             return "Blue Box Base 10";
  if (/TM40X90|TM4\.0X90/.test(c) || raw?.trim() === "T;M;4;0;X;90") return "T;M;4;0;X;90";
  if (/BLOCADO|BLOQUEADO/.test(c)) return "Blocado";
  return null;
}
function classifyZone(raw) { return _classifyZone(raw); }

const _zone  = i => _classifyZone(_txt(i, ["storage_zone","storageZone","zona","zone","local_armazenagem"]));
const _proj  = i => _txt(i, ["projeto","project","project_name","projectName"]);
const _pn    = i => _txt(i, ["part_number","pn","partNumber","PN"]);
const _desc  = i => _txt(i, ["descricao","desc","description","DESCRICAO"]);
const _pe    = i => _txt(i, ["pe","PE","pckg_type","pckgType"]);
const _intro = i => _txt(i, ["introduction_date","introductionDate","intro_date","introDate","data_intro"]);
const _vol   = i => _num(i, ["volume_calculado_periodo","calc","cxs_periodo","volC","volume_contratado","volume"]);
const _dr    = i => _num(i, ["daily_rate","dailyRate","dr","DR"]);

function _physicalCapacity(zoneName) {
  const ids = {
    "Base 10":             "caLcbCapPortaPalletsB10",
    "Base 20":             "caLcbCapPortaPalletsB20",
    "Blue Box Base 10":    "caLcbCapBlueBoxB10",
    "Blue Box Base 20":    "caLcbCapBlueBoxB20",
    "Blue Box Individual": "caLcbCapBlueBoxIndividual",
    "Blocado":             "caLcbCapBlocado",
    "T;M;4;0;X;90":       "caLcbCapTMX",
  };
  const id  = ids[zoneName];
  const raw = id ? Number(document.getElementById(id)?.value) : NaN;
  if (Number.isFinite(raw) && raw > 0) return raw;
  return Number(OVERLAY_ZONES[zoneName]?.defaultCapacity) || 0;
}

function _inputCurrentOccupied(zoneName) {
  const fromContext = Number(_state.zoneCurrentOccupied?.[zoneName]);
  if (Number.isFinite(fromContext) && fromContext >= 0) return fromContext;
  const ids = {
    "Base 10":             "caCapPortaPalletsB10",
    "Base 20":             "caCapPortaPalletsB20",
    "Blue Box Base 10":    "caCapBlueBoxB10",
    "Blue Box Base 20":    "caCapBlueBoxB20",
    "Blue Box Individual": "caCapBlueBoxIndividual",
    "Blocado":             "caCapBlocado",
    "T;M;4;0;X;90":       "caCapTMX",
  };
  const id = ids[zoneName];
  const value = id ? Number(document.getElementById(id)?.value) : 0;
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

/* ==========================================================================
   CÁLCULO DE OCUPAÇÃO FUTURA
========================================================================== */
function _calcOcupacaoFutura(currentOccupied, introVolume, capacity) {
  const prodHoje   = Number(_state.volumeAtual)  || 0;
  const prodFutura = Number(_state.volumeFuturo) || 0;
  if (prodHoje <= 0 || capacity <= 0) return null;
  const fator             = prodFutura / prodHoje;
  const baseProjected     = Math.max(0, currentOccupied * fator);
  const projectedOccupied = Math.max(0, baseProjected + Math.max(0, introVolume));
  const futurePct         = (projectedOccupied / capacity) * 100;
  return { fator, baseProjected, introVolume: Math.max(0, introVolume), projectedOccupied, futurePct };
}

/* ==========================================================================
   SEVERIDADE — paleta Scania
========================================================================== */
function _sev(pct) {
  if (pct == null || !Number.isFinite(+pct)) return "none";
  if (+pct > 90)  return "high";
  if (+pct >= 70) return "medium";
  return "low";
}

const SEV = {
  low:    { fg: "#15803d", bg: "#f0fdf4", border: "#86efac", label: "Disponível",  accent: "#16a34a" },
  medium: { fg: "#b45309", bg: "#fffbeb", border: "#fcd34d", label: "Atenção",     accent: "#d97706" },
  high:   { fg: "#b91c1c", bg: "#fef2f2", border: "#fca5a5", label: "Crítico",     accent: "#dc2626" },
  none:   { fg: "#475569", bg: "#f8fafc", border: "#e2e8f0", label: "Sem dados",   accent: "#64748b" },
};

function _sevCfg(pct) { return SEV[_sev(pct)] ?? SEV.none; }

/* ==========================================================================
   AGREGAÇÃO
========================================================================== */
function aggregateByZone(items, opts = {}) {
  const projFilter = opts.project && _norm(opts.project) !== "TODOS" ? _norm(opts.project) : null;
  let selKey = null;
  if (opts.selectedPeriod) selKey = _periodKey(opts.selectedPeriod);

  const groups = {};
  for (const z of ZONE_ORDER) {
    groups[z] = { pns: new Set(), details: [], count: 0, introVolume: 0, dr: 0 };
  }

  for (const it of items || []) {
    const z = _zone(it);
    const g = groups[z];
    if (!g) continue;
    if (projFilter) { const ip = _proj(it); if (ip && _norm(ip) !== projFilter) continue; }

    const pn       = _cleanPN(_pn(it));
    const introKey = _periodKey(_intro(it));
    const vol      = Math.max(0, _vol(it));
    const dr       = _dr(it);
    const visible  = selKey === null || introKey === null || introKey <= selKey;
    if (!visible) continue;

    if (pn) g.pns.add(pn);
    g.count       += 1;
    g.dr          += dr;
    g.introVolume += vol;

    if (g.details.length < 100 && pn) {
      g.details.push({
        pn, desc: _desc(it), pe: _pe(it), zone: z,
        volExcel: _num(it, ["cxs_periodo","volC"]),
        volCalc:  _num(it, ["volume_calculado_periodo","calc","cxs_periodo"]),
        intro: _intro(it), introKey,
      });
    }
  }

  const result = {};
  for (const zoneName of ZONE_ORDER) {
    const g           = groups[zoneName];
    const cap         = _physicalCapacity(zoneName);
    const curOcc      = Math.round(_inputCurrentOccupied(zoneName));
    const introVolume = Math.round(g.introVolume);

    const occPct      = cap > 0 ? (curOcc / cap) * 100 : null;
    const future      = _calcOcupacaoFutura(curOcc, introVolume, cap);
    const futPct      = future?.futurePct ?? null;
    const projOcc     = Math.round(future?.projectedOccupied ?? curOcc);
    const baseProj    = Math.round(future?.baseProjected ?? curOcc);

    const occWithPD    = curOcc + introVolume;
    const occWithPDPct = cap > 0 ? (occWithPD / cap) * 100 : occPct;

    /* Disponível = cap - curOcc (sem PD e sem projeção futura)
       O PD é exibido separadamente no bloco "Impacto da Introdução" */
    const avail = cap > 0 ? Math.max(0, cap - curOcc) : null;

    const sev = _sev(futPct ?? occWithPDPct ?? occPct);

    const sortedDetails = g.details.slice().sort((a, b) => {
      if (a.introKey == null && b.introKey == null) return 0;
      if (a.introKey == null) return 1;
      if (b.introKey == null) return -1;
      return a.introKey - b.introKey;
    });

    result[zoneName] = {
      name: zoneName, abbr: OVERLAY_ZONES[zoneName].abbr,
      curOcc, baseProjected: baseProj, projOcc, avail, cap,
      occPct, occWithPDPct, occWithPD, futPct,
      fator: future?.fator ?? null, volIntro: introVolume,
      count: g.count, pnCount: g.pns.size, details: sortedDetails,
      hasCap: cap > 0, sev,
      avgDr: g.count > 0 ? (g.dr / g.count).toFixed(2) : "0,00",
      selPeriod:  opts.selectedPeriod ?? null,
      prodHoje:   _state.volumeAtual,
      prodFutura: _state.volumeFuturo,
    };
  }
  return result;
}

/* ==========================================================================
   HTML DO POPUP — v10.0 Scania Design
========================================================================== */

/* Barra de ocupação com marcadores 70% e 90% */
function _bar(pct, color) {
  const w = Math.min(100, Math.max(0, pct ?? 0)).toFixed(1);
  return `
    <div class="zp-bar">
      <div class="zp-bar__fill" style="width:${w}%;background:${color}"></div>
      <div class="zp-bar__m70"></div>
      <div class="zp-bar__m90"></div>
    </div>`;
}

/* Tabela de itens introduzidos */
function _tableHtml(details, selPeriod) {
  if (!details?.length) {
    const msg = selPeriod
      ? `Nenhuma peça introduzida até <strong>${selPeriod}</strong> nesta zona.`
      : "Nenhum item classificado nesta zona.";
    return `<div class="zp-empty"><p>${msg}</p><span>Verifique as colunas <em>storage_zone</em> e <em>introduction_date</em></span></div>`;
  }
  const label = selPeriod ? `até ${selPeriod}` : "todos os períodos";
  return `
    <div class="zp-table-block">
      <div class="zp-table-header">
        <span>Itens introduzidos</span>
        <span class="zp-table-badge">${details.length} peça(s) · ${label}</span>
      </div>
      <div class="zp-table-scroll">
        <table class="zp-table">
          <thead>
            <tr>
              <th>PN</th><th>PE</th><th>Zona</th>
              <th class="r">Vol. Excel</th><th class="r">Vol. Calc.</th>
              <th>Introdução</th>
            </tr>
          </thead>
          <tbody>
            ${details.map((r, i) => `
              <tr class="${i % 2 ? "zp-alt" : ""}">
                <td class="zp-mono">${_cleanPN(r.pn) || "—"}</td>
                <td>${r.pe || "—"}</td>
                <td>${r.zone || "—"}</td>
                <td class="r">${_fmtCx(r.volExcel)}</td>
                <td class="r zp-bold">${_fmtCx(r.volCalc)}</td>
                <td class="zp-muted">${r.intro || "—"}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>`;
}

/* --------------------------------------------------------------------------
   ABA: SITUAÇÃO ATUAL
-------------------------------------------------------------------------- */
function _tabAtual(m) {
  const sc       = _sevCfg(m.occWithPDPct ?? m.occPct);
  const cap      = m.cap ?? 0;
  const pct      = m.occWithPDPct ?? m.occPct ?? 0;
  const avPct    = cap > 0 ? Math.max(0, ((m.avail ?? 0) / cap) * 100) : 0;
  const totalOcc = m.curOcc + (m.volIntro ?? 0);
  const totalPct = cap > 0 ? (totalOcc / cap) * 100 : 0;
  /* Disponível = cap - curOcc (sem PD) */
  const availDisplay = cap > 0 ? Math.max(0, cap - m.curOcc) : 0;
  const availColor = availDisplay > 0 ? "#15803d" : "#b91c1c";

  return `
    <div class="zp-pane" id="zp-pane-atual">

      <!-- Ficha técnica: 3 métricas em linha horizontal -->
      <div class="zp-kpi-row">
        <div class="zp-kpi">
          <span class="zp-kpi__lbl">Capacidade</span>
          <span class="zp-kpi__val">${_fmtMaybe(cap)}</span>
        </div>
        <div class="zp-kpi-div"></div>
        <div class="zp-kpi">
          <span class="zp-kpi__lbl">Ocupado hoje</span>
          <span class="zp-kpi__val" style="color:${sc.accent}">${_fmtCx(m.curOcc)}</span>
          <span class="zp-kpi__sub">${(m.occPct ?? 0).toFixed(1)}% da cap.</span>
        </div>
        <div class="zp-kpi-div"></div>
        <div class="zp-kpi">
          <span class="zp-kpi__lbl">Disponível</span>
          <span class="zp-kpi__val" style="color:${availColor}">${_fmtCx(availDisplay)}</span>
          <span class="zp-kpi__sub">${(cap > 0 ? (availDisplay/cap*100) : 0).toFixed(1)}% livre</span>
        </div>
      </div>

      <!-- Régua de ocupação -->
      <div class="zp-occ-block">
        <div class="zp-occ-header">
          <span class="zp-occ-header__label">Nível de ocupação</span>
          <span class="zp-status-pill" style="color:${sc.fg};background:${sc.bg};border-color:${sc.border}">
            ${sc.label} · ${pct.toFixed(1)}%
          </span>
        </div>
        ${_bar(pct, sc.accent)}
        <div class="zp-occ-footer">
          <span class="zp-occ-footer__dot" style="background:${sc.accent}"></span>
          <span>Ocupado hoje${m.volIntro > 0 ? " + PD" : ""}</span>
          <span class="zp-occ-footer__marks">
            <span class="zp-mark zp-mark--warn">70%</span>
            <span class="zp-mark zp-mark--crit">90%</span>
          </span>
        </div>
      </div>

      <!-- Impacto PD: equação horizontal -->
      <div class="zp-impact">
        <div class="zp-impact__title">Impacto da Introdução (PD)</div>
        <div class="zp-impact__eq">
          <div class="zp-impact__cell">
            <span class="zp-impact__cell-lbl">Ocupado hoje</span>
            <span class="zp-impact__cell-val">${_fmtCx(m.curOcc)}</span>
            <span class="zp-impact__cell-pct">${(m.occPct ?? 0).toFixed(1)}% ocup.</span>
          </div>
          <span class="zp-impact__op">+</span>
          <div class="zp-impact__cell zp-impact__cell--pd">
            <span class="zp-impact__cell-lbl">Introdução PD</span>
            <span class="zp-impact__cell-val" style="color:#b45309">${_fmtCx(m.volIntro ?? 0)}</span>
            <span class="zp-impact__cell-pct">${m.volIntro > 0 && cap > 0 ? ((m.volIntro / cap) * 100).toFixed(1) + "%" : "—"}</span>
          </div>
          <span class="zp-impact__op">=</span>
          <div class="zp-impact__cell zp-impact__cell--total" style="border-left:3px solid ${sc.accent}">
            <span class="zp-impact__cell-lbl">Total projetado</span>
            <span class="zp-impact__cell-val" style="color:${sc.fg}">${_fmtCx(totalOcc)}</span>
            <span class="zp-impact__cell-pct" style="color:${sc.fg};font-weight:700">${totalPct.toFixed(1)}%</span>
          </div>
        </div>
      </div>

      <!-- Introduções resumo: 3 stats em linha -->
      <div class="zp-intro">
        <div class="zp-intro__header">
          Introduções até o período
          ${m.selPeriod ? `<span class="zp-period-chip">${m.selPeriod}</span>` : ""}
        </div>
        <div class="zp-intro__stats">
          <div class="zp-intro__stat">
            <strong>${m.pnCount}</strong>
            <span>Part Numbers</span>
          </div>
          <div class="zp-intro__stat">
            <strong>${_fmtCx(m.volIntro)}</strong>
            <span>Volume</span>
          </div>

        </div>
      </div>

      ${_tableHtml(m.details, m.selPeriod)}
    </div>`;
}

/* --------------------------------------------------------------------------
   ABA: PROJEÇÃO FUTURA
-------------------------------------------------------------------------- */
function _tabProj(m) {
  const prodHoje   = m.prodHoje   ?? 0;
  const prodFutura = m.prodFutura ?? 0;

  if (!prodHoje) {
    return `
      <div class="zp-pane" id="zp-pane-proj">
        <div class="zp-empty zp-empty--center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <p>Projeção não disponível</p>
          <span>Informe o <strong>Vol. Atual</strong> (veíc./dia) no controle do mapa para ativar o cálculo.</span>
        </div>
      </div>`;
  }

  const futSc    = _sevCfg(m.futPct);
  const curSc    = _sevCfg(m.occPct);
  const fator    = (prodFutura / prodHoje).toFixed(2);
  const delta    = m.futPct != null && m.occPct != null ? (m.futPct - m.occPct) : null;
  const deltaStr = delta != null ? `${delta > 0 ? "+" : ""}${delta.toFixed(1)} pp` : "—";
  const deltaColor = delta == null ? "#94a3b8" : delta > 2 ? "#b91c1c" : delta < -2 ? "#15803d" : "#475569";

  return `
    <div class="zp-pane" id="zp-pane-proj">

      <!-- Hero numérico: % futuro grande + comparativo -->
      ${m.futPct != null ? `
        <div class="zp-proj-hero" style="border-left:4px solid ${futSc.accent}">
          <div class="zp-proj-hero__main">
            <span class="zp-proj-hero__pct" style="color:${futSc.fg}">${m.futPct.toFixed(1)}%</span>
            <span class="zp-proj-hero__lbl">Ocupação futura projetada</span>
            <span class="zp-status-pill" style="color:${futSc.fg};background:${futSc.bg};border-color:${futSc.border}">${futSc.label}</span>
          </div>
          <div class="zp-proj-hero__compare">
            <span class="zp-proj-vs">
              <span style="color:${curSc.accent}">${(m.occPct ?? 0).toFixed(1)}%</span>
              <span class="zp-proj-vs__arr">→</span>
              <span style="color:${futSc.fg};font-weight:800">${m.futPct.toFixed(1)}%</span>
            </span>
            <span class="zp-proj-delta" style="color:${deltaColor}">${deltaStr}</span>
          </div>
        </div>
        ${_bar(m.futPct, futSc.accent)}
      ` : ""}

      <!-- Fórmula de projeção: estilo ficha técnica -->
      <div class="zp-formula">
        <div class="zp-formula__title">Fórmula de projeção</div>
        <div class="zp-formula__eq">
          <div class="zp-formula__term">
            <span class="zp-formula__val">${_fmtCx(m.curOcc)}</span>
            <span class="zp-formula__lbl">Ocup. hoje</span>
          </div>
          <span class="zp-formula__op">×</span>
          <div class="zp-formula__frac">
            <span>${_fmtVeic(prodFutura)}</span>
            <div class="zp-formula__frac-bar"></div>
            <span>${_fmtVeic(prodHoje)}</span>
          </div>
          <span class="zp-formula__op">=</span>
          <div class="zp-formula__term zp-formula__term--res" style="border-color:${futSc.border};background:${futSc.bg}">
            <span class="zp-formula__val" style="color:${futSc.fg}">${_fmtCx(m.baseProjected)}</span>
            <span class="zp-formula__lbl" style="color:${futSc.fg}">Ocup. base futura</span>
          </div>
          ${m.volIntro > 0 ? `
          <span class="zp-formula__op" style="font-size:13px;color:#94a3b8">+${_fmtCx(m.volIntro)}</span>` : ""}
        </div>
        <p class="zp-formula__note">
          Fator ${fator}×
          ${m.volIntro > 0 ? `· +${_fmtCx(m.volIntro)} introduções Excel` : "· sem introduções no período"}
        </p>
      </div>

    </div>`;
}

/* --------------------------------------------------------------------------
   POPUP PRINCIPAL — header navy Scania, sem gradiente colorido
-------------------------------------------------------------------------- */
function _buildPopupHtml(zoneName, m) {
  const mainSev  = m.futPct != null ? _sev(m.futPct) : _sev(m.occWithPDPct ?? m.occPct);
  const sc       = SEV[mainSev] ?? SEV.none;
  const todayPct = Math.min(100, m.occWithPDPct ?? m.occPct ?? 0);
  const futPct   = m.futPct != null ? m.futPct : null;  /* sem cap — permite exibir >100% */
  const period   = m.selPeriod ? `Até ${m.selPeriod}` : "Todos os períodos";

  return `
    <!-- HEADER — navy Scania consistente, status via pill -->
    <div class="zp-hd">
      <div class="zp-hd__left">
        <div class="zp-hd__zone-row">
          <span class="zp-hd__name">${zoneName}</span>
        </div>
        <span class="zp-hd__period">${period}</span>
      </div>
      <div class="zp-hd__right">
        <div class="zp-hd__stats">
          <div class="zp-hd__stat">
            <span class="zp-hd__stat-lbl">Hoje + PD</span>
            <span class="zp-hd__stat-val">${(m.occWithPDPct ?? m.occPct ?? 0).toFixed(0)}%</span>
          </div>
          ${futPct != null ? `
          <span class="zp-hd__stat-sep">→</span>
          <div class="zp-hd__stat">
            <span class="zp-hd__stat-lbl">Futuro</span>
            <span class="zp-hd__stat-val zp-hd__stat-val--fut">${futPct.toFixed(0)}%</span>
          </div>` : ""}
        </div>
        <span class="zp-hd__status-pill" style="color:${sc.fg};background:${sc.bg};border-color:${sc.border}">${sc.label}</span>
        <button class="zp-hd__close" type="button" aria-label="Fechar">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- GAUGE — barra fina sob o header -->
    <div class="zp-gauge">
      <div class="zp-gauge__fill" style="width:${todayPct.toFixed(1)}%;background:${sc.accent}"></div>
      ${futPct != null ? `<div class="zp-gauge__fut" style="width:${Math.min(100,futPct).toFixed(1)}%;border-right:2px solid ${sc.accent}88"></div>` : ""}
    </div>

    <!-- ABAS — linha única, sem fundo cinza -->
    <div class="zp-tabs">
      <button class="zp-tab zp-tab--active" data-tab="atual" type="button">
        Situação Atual
        <span class="zp-tab__num" style="color:${SEV[_sev(m.occWithPDPct ?? m.occPct)].accent}">
          ${(m.occWithPDPct ?? m.occPct ?? 0).toFixed(0)}%
        </span>
      </button>
      <button class="zp-tab" data-tab="proj" type="button">
        Projeção Futura
        ${m.futPct != null ? `<span class="zp-tab__num" style="color:${SEV[_sev(m.futPct)].accent}">${m.futPct.toFixed(0)}%</span>` : ""}
      </button>
    </div>

    <!-- CONTEÚDO -->
    <div class="zp-body">
      ${_tabAtual(m)}
      ${_tabProj(m)}
    </div>`;
}

/* ==========================================================================
   POPUP — posicionamento e ciclo de vida
========================================================================== */
function _removeFloatingPopup() {
  if (_activePopupEl) { _activePopupEl.remove(); _activePopupEl = null; }
}

function _closeAllPopups() {
  document.querySelectorAll(".zo-hotspot--open").forEach(hs => {
    hs.classList.remove("zo-hotspot--open");
    hs.setAttribute("aria-expanded", "false");
  });
  _removeFloatingPopup();
  _activeZoneName  = null;
  _activeHotspotEl = null;
}

function _positionPopup(popup, hotspot) {
  const hr  = hotspot.getBoundingClientRect();
  const vw  = window.innerWidth;
  const vh  = window.innerHeight;
  const pw  = popup.offsetWidth  || 380;
  const ph  = popup.offsetHeight || 520;
  const GAP = 10;

  /* Tenta abrir à esquerda do hotspot primeiro (padrão) */
  let left = hr.left - pw - GAP;
  let top  = hr.top + hr.height / 2 - ph / 2;

  /* Se não couber à esquerda, tenta à direita */
  if (left < GAP) left = hr.right + GAP;

  /* Se ainda não couber à direita, centraliza horizontalmente */
  if (left + pw > vw - GAP) left = Math.max(GAP, vw / 2 - pw / 2);

  /* Vertical: alinha ao topo do hotspot se o popup não couber centralizado */
  if (top < GAP) top = GAP;
  if (top + ph > vh - GAP) top = Math.max(GAP, vh - ph - GAP);

  /* Garante dentro da viewport */
  left = Math.max(GAP, Math.min(left, vw - pw - GAP));
  top  = Math.max(GAP, Math.min(top,  vh - ph - GAP));

  popup.style.left = `${left}px`;
  popup.style.top  = `${top}px`;
}

function _initTabListeners(popup) {
  const tabs  = popup.querySelectorAll(".zp-tab");
  const panes = popup.querySelectorAll(".zp-pane");
  tabs.forEach(tab => {
    tab.addEventListener("click", e => {
      e.stopPropagation();
      const target = tab.dataset.tab;
      tabs.forEach(t => {
        const on = t.dataset.tab === target;
        t.classList.toggle("zp-tab--active", on);
        t.setAttribute("aria-selected", String(on));
      });
      panes.forEach(p => { p.style.display = p.id === `zp-pane-${target}` ? "block" : "none"; });
    });
  });
  panes.forEach((p, i) => { p.style.display = i === 0 ? "block" : "none"; });
}

function _ensureListeners() {
  if (_listenersAttached) return;
  _listenersAttached = true;
  document.addEventListener("click", e => {
    if (e.target.closest(".zo-hotspot") || e.target.closest(".zp-popup")) return;
    _closeAllPopups();
  }, { capture: true });
  document.addEventListener("keydown", e => { if (e.key === "Escape") _closeAllPopups(); });
  window.addEventListener("resize", () => {
    if (_activePopupEl && _activeHotspotEl) _positionPopup(_activePopupEl, _activeHotspotEl);
  });
}

/* ==========================================================================
   HOTSPOT — visual limpo, borda colorida por status
========================================================================== */
function _createHotspot(zoneName, cfg, hotspotCfg, m, map) {
  const sevCls    = m.sev === "none" ? "low" : m.sev;
  const sc        = SEV[m.sev] ?? SEV.none;
  const baseOccPct = m.occWithPDPct ?? m.occPct;
  const mainPct   = m.futPct !== null ? m.futPct : baseOccPct;
  const mainLbl   = mainPct != null ? `${mainPct.toFixed(0)}%` : "—";
  const isFuture  = m.futPct !== null;

  let trendIcon = "";
  if (isFuture && baseOccPct != null) {
    const delta = m.futPct - baseOccPct;
    if (delta > 0.5)       trendIcon = `<span class="zo-hs__trend zo-hs__trend--up">↑</span>`;
    else if (delta < -0.5) trendIcon = `<span class="zo-hs__trend zo-hs__trend--dn">↓</span>`;
    else                   trendIcon = `<span class="zo-hs__trend zo-hs__trend--eq">→</span>`;
  }

  const hs = document.createElement("button");
  hs.type      = "button";
  hs.className = `zo-hotspot zo-hotspot--${sevCls}`;
  hs.setAttribute("data-zone-overlay", zoneName);
  hs.setAttribute("aria-label", `${zoneName} — ${isFuture ? "projeção" : "hoje"}: ${mainLbl}`);
  hs.setAttribute("aria-haspopup", "dialog");
  hs.setAttribute("aria-expanded", "false");
  Object.assign(hs.style, { top: hotspotCfg.top, left: hotspotCfg.left, width: hotspotCfg.width, height: hotspotCfg.height });

  hs.innerHTML = `
    <span class="zo-hs__name">${zoneName}</span>
    <span class="zo-hs__rate">${mainLbl}${trendIcon}</span>
    ${isFuture ? `<span class="zo-hs__tag">projeção</span>` : ""}
    <span class="zo-hs__dot" style="background:${sc.accent}" aria-hidden="true"></span>`;

  hs.addEventListener("click", e => {
    e.stopPropagation();
    const isOpen = hs.classList.contains("zo-hotspot--open");
    _closeAllPopups();
    if (!isOpen) {
      _activeZoneName  = zoneName;
      _activeHotspotEl = hs;
      hs.classList.add("zo-hotspot--open");
      hs.setAttribute("aria-expanded", "true");

      const popup = document.createElement("div");
      popup.className = `zp-popup zp-popup--${sevCls}`;
      popup.setAttribute("role", "dialog");
      popup.setAttribute("aria-label", `Detalhes — ${zoneName}`);
      popup.setAttribute("aria-modal", "true");
      popup.innerHTML = _buildPopupHtml(zoneName, m);

      document.body.appendChild(popup);
      _activePopupEl = popup;
      _initTabListeners(popup);

      requestAnimationFrame(() => requestAnimationFrame(() => _positionPopup(popup, hs)));

      popup.querySelector(".zp-hd__close")?.addEventListener("click", e => {
        e.stopPropagation();
        _closeAllPopups();
      });
      popup.addEventListener("click", e => e.stopPropagation());
    }
  });

  hs.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); hs.click(); }
  });

  map.appendChild(hs);
}

/* ==========================================================================
   BADGES RODAPÉ
========================================================================== */
function _syncBadges(agg) {
  const cont = document.getElementById("warehouseTriggerBadges");
  if (!cont) return;
  cont.innerHTML = ZONE_ORDER.map(z => {
    const m      = agg[z];
    const pct    = m?.occPct;
    const futPct = m?.futPct;
    const sev    = _sev(futPct ?? pct);
    const cls    = sev === "high" ? "critical" : sev === "medium" ? "warning" : "ok";
    const futStr = futPct !== null ? ` → ${Math.round(futPct)}%` : "";
    const pctStr = pct == null ? "—" : `${Math.round(pct)}%`;
    return `<span class="wh-trigger-badge wh-trigger-badge--${cls}" title="${z}">${OVERLAY_ZONES[z].abbr} · ${pctStr}${futStr}</span>`;
  }).join("");
}

/* ==========================================================================
   RENDER PRINCIPAL
========================================================================== */
function renderZoneOverlay(source, maybeOpts) {
  const map = document.getElementById("warehouseMap");
  if (!map) return null;

  let opts = {};
  if (maybeOpts && typeof maybeOpts === "object" && !Array.isArray(maybeOpts)) {
    opts = {
      thresholdMedium: +maybeOpts.thresholdMedium || 70,
      thresholdHigh:   +maybeOpts.thresholdHigh   || 90,
      selectedPeriod:  maybeOpts.selectedPeriod    ?? null,
      project:         maybeOpts.project           ?? null,
    };
  }

  _state.thresholdMedium = opts.thresholdMedium ?? _state.thresholdMedium;
  _state.thresholdHigh   = opts.thresholdHigh   ?? _state.thresholdHigh;
  _state.selectedPeriod  = opts.selectedPeriod  ?? _state.selectedPeriod;
  _state.selectedProject = (opts.project && _norm(opts.project) !== "TODOS") ? opts.project : _state.selectedProject;

  let items = [];
  if (Array.isArray(source))  items = source;
  else if (source?.itens)     items = source.itens;
  else if (source?.items)     items = source.items;
  else if (source?.rows)      items = source.rows;
  else { const lr = window.lcbApi?.getLastResult?.(); if (lr?.itens) items = lr.itens; }

  map.querySelectorAll(".zo-hotspot").forEach(el => el.remove());
  _closeAllPopups();
  _ensureListeners();

  const agg = aggregateByZone(items, {
    thresholdMedium: _state.thresholdMedium,
    thresholdHigh:   _state.thresholdHigh,
    selectedPeriod:  _state.selectedPeriod,
    project:         _state.selectedProject,
  });

  for (const zoneName of ZONE_ORDER) {
    if (!agg[zoneName]) continue;
    const cfg = OVERLAY_ZONES[zoneName];
    cfg.hotspots.forEach(hsCfg => _createHotspot(zoneName, cfg, hsCfg, agg[zoneName], map));
  }

  _syncBadges(agg);
  return agg;
}

/* ==========================================================================
   setOverlayContext / getOverlayContext
========================================================================== */
function setOverlayContext(ctx = {}) {
  _state.selectedPeriod  = ctx.selectedPeriod  ?? _state.selectedPeriod;
  _state.selectedProject = (ctx.project && _norm(ctx.project) !== "TODOS") ? ctx.project : _state.selectedProject;
  _state.thresholdMedium = +ctx.thresholdMedium || _state.thresholdMedium;
  _state.thresholdHigh   = +ctx.thresholdHigh   || _state.thresholdHigh;
  if (ctx.zoneCurrentOccupied && typeof ctx.zoneCurrentOccupied === "object") {
    _state.zoneCurrentOccupied = { ...ctx.zoneCurrentOccupied };
  }
  if (ctx.volumeAtual  != null) _state.volumeAtual  = +ctx.volumeAtual;
  if (ctx.volumeFuturo != null) _state.volumeFuturo = +ctx.volumeFuturo;
}

function getOverlayContext() { return { ..._state }; }

/* ==========================================================================
   CSS INJETADO — v10.0 Scania Design System
   Header: navy #041E42 consistente (sem gradiente colorido por status)
   Fonte: Barlow Condensed para valores, Barlow para labels
   Border-radius: 6px — linguagem industrial Scania
========================================================================== */
(function _injectStyles() {
  if (document.getElementById("zo-styles-v100")) return;
  /* Remove versões anteriores */
  ["zo-styles-v92","zo-styles-v91","zo-styles-v90","zo-styles-v82","zo-styles-v81",
   "zo-styles-v8","zo-future-styles","zo-styles-v5"]
    .forEach(id => document.getElementById(id)?.remove());

  const s = document.createElement("style");
  s.id = "zo-styles-v100";
  s.textContent = `
    /* ═══ HOTSPOT ═══════════════════════════════════════════════════════════ */
    .zo-hotspot {
      position:absolute; display:flex; flex-direction:column;
      align-items:center; justify-content:center; gap:3px;
      background:transparent; border:2.5px solid transparent;
      border-radius:6px; cursor:pointer; padding:5px 7px; z-index:3;
      transition:border-color .14s, background .14s, box-shadow .14s;
    }
    .zo-hotspot--low    { border-color:rgba(21,128,61,1);   background:rgba(22,163,74,.25); }
    .zo-hotspot--medium { border-color:rgba(180,83,9,1);    background:rgba(217,119,6,.25); }
    .zo-hotspot--high   { border-color:rgba(185,28,28,1);   background:rgba(220,38,38,.25); }
    .zo-hotspot:hover   { transform:scale(1.02); filter:brightness(.92); }
    .zo-hotspot--open   {
      box-shadow:0 0 0 3px rgba(4,30,66,.4);
      border-color:rgba(4,30,66,.9) !important;
      background:rgba(4,30,66,.18) !important;
    }
    .zo-hs__name, .zo-hs__rate {
      color:#001533;
      background:rgba(255,255,255,.97);
      border:1.5px solid rgba(255,255,255,1);
      border-radius:4px; padding:2px 6px; line-height:1.2;
      box-shadow:0 1px 4px rgba(0,0,0,.25);
      font-family:'ScaniaSans','Segoe UI',sans-serif;
    }
    .zo-hs__name { font-size:10px; font-weight:800; letter-spacing:.02em; }
    .zo-hs__rate { font-size:15px; font-weight:800; padding:2px 8px; display:flex; align-items:center; gap:3px; }
    .zo-hs__tag  { font-size:9px; font-weight:600; text-transform:uppercase; letter-spacing:.04em; color:rgba(0,21,51,.55); background:rgba(255,255,255,.78); border-radius:3px; padding:1px 5px; }
    .zo-hs__dot  { width:9px; height:9px; border-radius:50%; border:2px solid #fff; box-shadow:0 1px 3px rgba(0,0,0,.2); }
    .zo-hs__trend { font-size:11px; font-weight:700; }
    .zo-hs__trend--up { color:#b91c1c; }
    .zo-hs__trend--dn { color:#15803d; }
    .zo-hs__trend--eq { color:#94a3b8; }

    /* ── PD: dois blocos lado a lado ───────────────────────── */
    .zo-hs__pcts {
      display:flex; align-items:center; gap:5px;
    }
    .zo-hs__pct-block {
      display:flex; flex-direction:column; align-items:center; gap:1px;
      background:rgba(255,255,255,.95);
      border:1.5px solid rgba(255,255,255,1);
      border-radius:4px; padding:3px 7px;
      box-shadow:0 1px 4px rgba(0,0,0,.2);
    }
    .zo-hs__pct-block--pd {
      background:rgba(255,251,235,.97);
      border-color:rgba(217,119,6,.5);
    }
    .zo-hs__pct-lbl {
      font-family:'ScaniaSans','Segoe UI',sans-serif;
      font-size:8px; font-weight:700;
      text-transform:uppercase; letter-spacing:.06em;
      color:#64748b; line-height:1;
    }
    .zo-hs__pct-sep {
      font-size:11px; font-weight:700; color:rgba(0,21,51,.4);
      flex-shrink:0;
    }
    .zo-hs__pd-val {
      font-family:'ScaniaSansHeadline','ScaniaSansCondensed','ScaniaSans','Segoe UI',sans-serif;
      font-size:15px; font-weight:800; color:#b45309; line-height:1;
    }
    .zo-hs__pd-badge {
      font-family:'ScaniaSans','Segoe UI',sans-serif;
      font-size:8px; font-weight:700;
      color:#b45309; line-height:1;
    }

    /* ═══ POPUP ══════════════════════════════════════════════════════════════ */
    .zp-popup {
      position:fixed; z-index:9999;
      width:380px; max-height:88vh;
      display:flex; flex-direction:column; overflow:hidden;
      background:#fff;
      border-radius:6px;
      border:1px solid #dde2e9;
      box-shadow:0 16px 48px rgba(4,30,66,.18), 0 4px 12px rgba(4,30,66,.10);
      font-family:'ScaniaSans','Segoe UI',system-ui,sans-serif;
      font-size:13px;
      animation:zp-in .15s cubic-bezier(.22,.68,0,1.12) forwards;
    }
    @keyframes zp-in {
      from { opacity:0; transform:translateY(6px) scale(.97); }
      to   { opacity:1; transform:none; }
    }

    /* ═══ HEADER — navy Scania, sem gradiente por status ════════════════════ */
    .zp-hd {
      display:flex; align-items:center; justify-content:space-between;
      gap:12px; padding:14px 16px 12px;
      background:#041e42;
      flex-shrink:0;
    }
    .zp-hd__left { display:flex; flex-direction:column; gap:4px; min-width:0; }
    .zp-hd__zone-row { display:flex; align-items:center; gap:8px; }
    .zp-hd__abbr {
      font-family:'ScaniaSansHeadline','ScaniaSansCondensed','ScaniaSans','Segoe UI',sans-serif;
      font-size:10px; font-weight:800;
      letter-spacing:.10em; text-transform:uppercase;
      color:rgba(255,255,255,.45);
      background:rgba(255,255,255,.08);
      border:1px solid rgba(255,255,255,.12);
      border-radius:3px; padding:2px 7px; flex-shrink:0;
    }
    .zp-hd__name {
      font-family:'ScaniaSansHeadline','ScaniaSansCondensed','ScaniaSans','Segoe UI',sans-serif;
      font-size:17px; font-weight:700; color:#fff;
      letter-spacing:.01em; text-transform:uppercase;
      white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    }
    .zp-hd__period {
      font-size:11px; color:rgba(255,255,255,.5);
      font-weight:400; letter-spacing:.02em;
    }
    .zp-hd__right { display:flex; align-items:center; gap:8px; flex-shrink:0; }
    .zp-hd__stats { display:flex; align-items:baseline; gap:5px; }
    .zp-hd__stat { display:flex; flex-direction:column; align-items:center; gap:1px; }
    .zp-hd__stat-lbl { font-size:9px; color:rgba(255,255,255,.45); text-transform:uppercase; letter-spacing:.07em; }
    .zp-hd__stat-val {
      font-family:'ScaniaSansHeadline','ScaniaSansCondensed','ScaniaSans','Segoe UI',sans-serif;
      font-size:18px; font-weight:700; color:#fff; line-height:1;
    }
    .zp-hd__stat-val--fut { opacity:.75; }
    .zp-hd__stat-sep { font-size:13px; color:rgba(255,255,255,.3); padding:0 2px; }
    .zp-hd__status-pill {
      font-size:10px; font-weight:700; letter-spacing:.04em; text-transform:uppercase;
      padding:3px 9px; border-radius:3px; border:1px solid; white-space:nowrap;
    }
    .zp-hd__close {
      background:rgba(255,255,255,.10); border:1px solid rgba(255,255,255,.2);
      border-radius:4px; color:rgba(255,255,255,.65);
      cursor:pointer; padding:5px 6px;
      display:flex; align-items:center;
      transition:background .12s, color .12s;
      flex-shrink:0;
    }
    .zp-hd__close:hover { background:rgba(255,255,255,.2); color:#fff; }

    /* Gauge — barra fina sob o header */
    .zp-gauge {
      position:relative; height:3px; flex-shrink:0;
      background:rgba(4,30,66,.12);
    }
    .zp-gauge__fill { position:absolute; top:0; left:0; height:100%; transition:width .45s; }
    .zp-gauge__fut  { position:absolute; top:0; left:0; height:100%; background:transparent; transition:width .45s; }

    /* ═══ ABAS — linha limpa sem fundo cinza ════════════════════════════════ */
    .zp-tabs {
      display:flex;
      border-bottom:1px solid #e2e8f0;
      flex-shrink:0;
      background:#fff;
    }
    .zp-tab {
      flex:1; display:flex; align-items:center; justify-content:center; gap:6px;
      padding:9px 10px;
      font-family:'ScaniaSansCondensed','ScaniaSans','Segoe UI',sans-serif;
      font-size:12px; font-weight:500; color:#475569;
      background:none; border:none; border-bottom:2px solid transparent;
      cursor:pointer;
      transition:color .12s, border-color .12s;
      white-space:nowrap;
    }
    .zp-tab:hover { color:#041e42; }
    .zp-tab--active {
      color:#041e42; font-weight:700;
      border-bottom-color:#041e42;
    }
    .zp-tab__num {
      font-family:'ScaniaSansCondensed','ScaniaSans','Segoe UI',sans-serif;
      font-size:12px; font-weight:800;
      padding:1px 7px; border-radius:3px;
      background:#f0f3f7;
    }

    /* ═══ BODY ═══════════════════════════════════════════════════════════════ */
    .zp-body {
      overflow-y:auto; flex:1;
      scrollbar-width:thin; scrollbar-color:#dde2e9 transparent;
    }
    .zp-body::-webkit-scrollbar       { width:4px; }
    .zp-body::-webkit-scrollbar-track { background:transparent; }
    .zp-body::-webkit-scrollbar-thumb { background:#dde2e9; border-radius:2px; }
    .zp-pane { padding:14px 16px 16px; }

    /* ═══ KPI ROW — ficha técnica horizontal ════════════════════════════════ */
    .zp-kpi-row {
      display:flex; align-items:stretch;
      border:1px solid #e2e8f0; border-radius:5px;
      margin-bottom:14px; overflow:hidden;
    }
    .zp-kpi {
      flex:1; display:flex; flex-direction:column; gap:2px;
      padding:10px 12px;
    }
    .zp-kpi-div { width:1px; background:#e2e8f0; flex-shrink:0; }
    .zp-kpi__lbl {
      font-size:9px; font-weight:700;
      text-transform:uppercase; letter-spacing:.08em; color:#94a3b8;
    }
    .zp-kpi__val {
      font-family:'ScaniaSansHeadline','ScaniaSansCondensed','ScaniaSans','Segoe UI',sans-serif;
      font-size:14px; font-weight:700; color:#041e42; line-height:1.1;
    }
    .zp-kpi__sub { font-size:10px; color:#94a3b8; }

    /* ═══ OCUPAÇÃO ═══════════════════════════════════════════════════════════ */
    .zp-occ-block { margin-bottom:14px; }
    .zp-occ-header {
      display:flex; align-items:center; justify-content:space-between;
      margin-bottom:7px;
    }
    .zp-occ-header__label {
      font-size:10px; font-weight:700;
      text-transform:uppercase; letter-spacing:.07em; color:#94a3b8;
    }
    .zp-status-pill {
      font-size:10px; font-weight:700; letter-spacing:.04em; text-transform:uppercase;
      padding:2px 9px; border-radius:3px; border:1px solid; white-space:nowrap;
    }
    .zp-bar {
      position:relative; height:7px;
      background:#f0f3f7; border-radius:3px; overflow:visible;
      margin-bottom:6px;
    }
    .zp-bar__fill { height:100%; border-radius:3px; transition:width .45s; }
    .zp-bar__m70 {
      position:absolute; top:-3px; bottom:-3px; left:70%;
      width:2px; background:#d97706; border-radius:1px; z-index:2;
    }
    .zp-bar__m90 {
      position:absolute; top:-3px; bottom:-3px; left:90%;
      width:2px; background:#dc2626; border-radius:1px; z-index:2;
    }
    .zp-occ-footer {
      display:flex; align-items:center; gap:6px;
      font-size:10px; color:#64748b;
    }
    .zp-occ-footer__dot {
      width:7px; height:7px; border-radius:50%; flex-shrink:0;
    }
    .zp-occ-footer__marks { margin-left:auto; display:flex; gap:8px; }
    .zp-mark {
      display:flex; align-items:center; gap:3px;
      font-size:10px; font-weight:600; color:#94a3b8;
    }
    .zp-mark::before {
      content:""; display:inline-block;
      width:2px; height:9px; border-radius:1px;
    }
    .zp-mark--warn::before { background:#d97706; }
    .zp-mark--crit::before { background:#dc2626; }

    /* ═══ IMPACTO PD ═════════════════════════════════════════════════════════ */
    .zp-impact {
      background:#f8fafc; border:1px solid #e2e8f0; border-radius:5px;
      padding:10px 12px; margin-bottom:14px;
    }
    .zp-impact__title {
      font-size:9px; font-weight:800;
      text-transform:uppercase; letter-spacing:.08em;
      color:#94a3b8; margin-bottom:10px;
    }
    .zp-impact__eq { display:flex; align-items:center; gap:6px; }
    .zp-impact__cell {
      flex:1; background:#fff; border:1px solid #e2e8f0;
      border-radius:4px; padding:8px 10px;
      display:flex; flex-direction:column; gap:2px;
    }
    .zp-impact__cell--pd    { border-color:#fcd34d; background:#fffbeb; }
    .zp-impact__cell--total { background:#f8fafc; }
    .zp-impact__cell-lbl {
      font-size:9px; font-weight:700;
      text-transform:uppercase; letter-spacing:.06em; color:#94a3b8;
    }
    .zp-impact__cell-val {
      font-family:'ScaniaSansHeadline','ScaniaSansCondensed','ScaniaSans','Segoe UI',sans-serif;
      font-size:13px; font-weight:700; color:#041e42; line-height:1.1;
    }
    .zp-impact__cell-pct { font-size:10px; color:#94a3b8; }
    .zp-impact__op {
      font-size:16px; font-weight:700; color:#cbd5e1; flex-shrink:0;
      font-family:'ScaniaSans','Segoe UI',sans-serif;
    }

    /* ═══ INTRODUÇÕES ════════════════════════════════════════════════════════ */
    .zp-intro { margin-bottom:14px; }
    .zp-intro__header {
      display:flex; align-items:center; gap:8px;
      font-size:10px; font-weight:700;
      text-transform:uppercase; letter-spacing:.07em;
      color:#64748b; margin-bottom:8px;
    }
    .zp-period-chip {
      font-family:'ScaniaSansCondensed','ScaniaSans','Segoe UI',sans-serif;
      font-size:10px; font-weight:700;
      padding:2px 8px; border-radius:3px;
      background:#041e42; color:#fff;
      letter-spacing:.03em;
    }
    .zp-intro__stats {
      display:grid; grid-template-columns:repeat(3,1fr); gap:6px;
    }
    .zp-intro__stat {
      background:#f8fafc; border:1px solid #e2e8f0;
      border-radius:4px; padding:8px 6px;
      text-align:center; display:flex; flex-direction:column; gap:2px;
    }
    .zp-intro__stat strong {
      font-family:'ScaniaSansHeadline','ScaniaSansCondensed','ScaniaSans','Segoe UI',sans-serif;
      font-size:13px; font-weight:700; color:#041e42; line-height:1;
    }
    .zp-intro__stat span { font-size:9px; color:#94a3b8; }

    /* ═══ TABELA ═════════════════════════════════════════════════════════════ */
    .zp-table-block { margin-top:12px; }
    .zp-table-header {
      display:flex; align-items:center; justify-content:space-between;
      margin-bottom:6px;
      font-size:9px; font-weight:700;
      text-transform:uppercase; letter-spacing:.08em; color:#94a3b8;
    }
    .zp-table-badge {
      font-size:10px; font-weight:600; padding:2px 8px;
      border-radius:3px; background:#041e42; color:#fff;
      font-family:'ScaniaSans','Segoe UI',sans-serif;
    }
    .zp-table-scroll { overflow-x:auto; border-radius:5px; border:1px solid #e2e8f0; }
    .zp-table { width:100%; border-collapse:collapse; font-size:11px; min-width:300px; }
    .zp-table th {
      padding:7px 8px; background:#041e42;
      color:rgba(255,255,255,.82);
      font-size:9px; font-weight:700;
      text-transform:uppercase; letter-spacing:.06em;
      text-align:left; white-space:nowrap;
    }
    .zp-table th:first-child { border-radius:4px 0 0 0; }
    .zp-table th:last-child  { border-radius:0 4px 0 0; }
    .zp-table td { padding:5px 8px; color:#334155; border-bottom:1px solid #f1f5f9; }
    .zp-table tr.zp-alt td { background:#f8fafc; }
    .zp-table tbody tr:last-child td { border-bottom:none; }
    .zp-table tbody tr:hover td { background:#eef4fb; }
    .zp-table th.r, .zp-table td.r { text-align:right; }
    .zp-table td.zp-mono {
      font-family:monospace; font-size:10px; font-weight:700;
      color:#041e42; max-width:76px;
      overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    }
    .zp-table td.zp-bold  { font-weight:700; }
    .zp-table td.zp-muted { color:#94a3b8; font-size:10px; white-space:nowrap; }

    /* ═══ EMPTY ══════════════════════════════════════════════════════════════ */
    .zp-empty {
      display:flex; flex-direction:column; align-items:center;
      gap:8px; padding:24px 20px; text-align:center; color:#94a3b8;
    }
    .zp-empty--center { padding:40px 20px; }
    .zp-empty p    { font-size:12px; color:#475569; margin:0; font-weight:600; }
    .zp-empty span { font-size:11px; color:#94a3b8; max-width:240px; line-height:1.5; }

    /* ═══ PROJEÇÃO HERO ══════════════════════════════════════════════════════ */
    .zp-proj-hero {
      display:flex; align-items:center; justify-content:space-between; gap:12px;
      padding:14px 14px 14px 16px;
      border:1px solid #e2e8f0; border-radius:5px;
      margin-bottom:12px; background:#f8fafc;
    }
    .zp-proj-hero__main { display:flex; flex-direction:column; gap:4px; }
    .zp-proj-hero__pct  {
      font-family:'ScaniaSansHeadline','ScaniaSansCondensed','ScaniaSans','Segoe UI',sans-serif;
      font-size:34px; font-weight:700; line-height:1; letter-spacing:-.01em;
    }
    .zp-proj-hero__lbl  { font-size:10px; color:#94a3b8; }
    .zp-proj-hero__compare { display:flex; flex-direction:column; align-items:flex-end; gap:6px; }
    .zp-proj-vs {
      display:flex; align-items:center; gap:6px;
      font-family:'ScaniaSans','Segoe UI',sans-serif;
    }
    .zp-proj-vs > span   { font-size:16px; font-weight:700; }
    .zp-proj-vs__arr     { color:#cbd5e1; font-size:13px; }
    .zp-proj-delta {
      font-size:11px; font-weight:700;
      padding:2px 8px; background:rgba(0,0,0,.05); border-radius:3px;
    }

    /* ═══ FÓRMULA ════════════════════════════════════════════════════════════ */
    .zp-formula {
      background:#f8fafc; border:1px solid #e2e8f0;
      border-radius:5px; padding:12px 14px; margin-top:10px;
    }
    .zp-formula__title {
      font-size:9px; font-weight:800;
      text-transform:uppercase; letter-spacing:.08em;
      color:#94a3b8; margin-bottom:10px;
    }
    .zp-formula__eq { display:flex; align-items:center; gap:7px; flex-wrap:wrap; }
    .zp-formula__term {
      display:flex; flex-direction:column; align-items:center; gap:2px;
      background:#fff; border-radius:4px; padding:6px 10px; border:1px solid #e2e8f0;
    }
    .zp-formula__term--res { border-width:1.5px; }
    .zp-formula__val {
      font-family:'ScaniaSansHeadline','ScaniaSansCondensed','ScaniaSans','Segoe UI',sans-serif;
      font-size:12px; font-weight:700; color:#041e42; white-space:nowrap;
    }
    .zp-formula__lbl  { font-size:9px; color:#94a3b8; white-space:nowrap; }
    .zp-formula__op   {
      font-size:16px; font-weight:700; color:#cbd5e1; flex-shrink:0;
      font-family:'ScaniaSans','Segoe UI',sans-serif;
    }
    .zp-formula__frac {
      display:flex; flex-direction:column; align-items:center;
      background:#fff; border-radius:4px; padding:4px 10px;
      border:1px solid #e2e8f0; gap:1px;
    }
    .zp-formula__frac > span { font-size:11px; font-weight:600; color:#041e42; white-space:nowrap; }
    .zp-formula__frac > span:last-child { font-weight:400; color:#64748b; }
    .zp-formula__frac-bar { width:100%; height:1px; background:#e2e8f0; margin:2px 0; }
    .zp-formula__note { font-size:10px; color:#94a3b8; margin-top:8px; line-height:1.5; }

    /* ═══ MOBILE ═════════════════════════════════════════════════════════════ */
    @media (max-width:480px) {
      .zp-popup       { width:calc(100vw - 16px) !important; left:8px !important; max-height:88vh; }
      .zp-kpi-row     { flex-direction:column; }
      .zp-kpi-div     { width:100%; height:1px; }
      .zp-intro__stats{ grid-template-columns:repeat(2,1fr); }
      .zp-impact__eq  { flex-wrap:wrap; }
      .zp-impact__cell{ min-width:calc(50% - 10px); }
      .zp-impact__op  { display:none; }
    }
  `;
  document.head.appendChild(s);
})();

/* ==========================================================================
   API PÚBLICA
========================================================================== */
window.lcbZonesOverlay = {
  classifyZone,
  normalizeStorageType: _classifyZone,
  aggregateByZone,
  renderZoneOverlay,
  setOverlayContext,
  getOverlayContext,
  periodKey: _periodKey,
  closeAll:  _closeAllPopups,
};