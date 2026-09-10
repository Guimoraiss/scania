"use strict";

/* ==========================================================================
   LCB Capacity Analytics — zones-overlay.js v9.2
   Visual mais sóbrio + bloco de impacto PD na aba Situação Atual.
========================================================================== */

const OVERLAY_ZONES = {
  "Base 10": {
    id: "base10", label: "Base 10", abbr: "B10",
    headerColor: "#1a4d8f", defaultCapacity: 35000, defaultOcc: 82,
    hotspots: [{ top: "10.30%", left: "27.35%", width: "49.95%", height: "25.20%", showLabel: true }],
  },
  "Base 20": {
    id: "base20", label: "Base 20", abbr: "B20",
    headerColor: "#1a4d8f", defaultCapacity: 55200, defaultOcc: 79,
    hotspots: [{ top: "36.40%", left: "27.22%", width: "50.39%", height: "20.82%", showLabel: true }],
  },
  "Blue Box Base 10": {
    id: "bbpalletb10", label: "Blue Box Base 10", abbr: "BBP10",
    headerColor: "#0e7490", defaultCapacity: 8000, defaultOcc: 74,
    hotspots: [{ top: "58.00%", left: "23.50%", width: "25.50%", height: "11.00%", showLabel: true }],
  },
  "Blue Box Base 20": {
    id: "bbpalletb20", label: "Blue Box Base 20", abbr: "BBP20",
    headerColor: "#0891b2", defaultCapacity: 8000, defaultOcc: 74,
    hotspots: [{ top: "69.50%", left: "23.50%", width: "25.50%", height: "11.50%", showLabel: true }],
  },
  "Blocado": {
    id: "blocado", label: "Blocado", abbr: "BL",
    headerColor: "#7c3aed", defaultCapacity: 19800, defaultOcc: 45,
    hotspots: [{ top: "7.10%", left: "77.95%", width: "16.10%", height: "40.40%", showLabel: true }],
  },
  "Blue Box Individual": {
    id: "bbindividual", label: "Blue Box Individual", abbr: "BBI",
    headerColor: "#0f766e", defaultCapacity: 4200, defaultOcc: 55,
    hotspots: [{ top: "84.20%", left: "24.10%", width: "24.20%", height: "4.80%", showLabel: true }],
  },
  "T;M;4;0;X;90": {
    id: "tm40x90", label: "T;M;4;0;X;90", abbr: "TM",
    headerColor: "#b91c1c", defaultCapacity: 8000, defaultOcc: 30,
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
   SEVERIDADE
========================================================================== */
function _sev(pct) {
  if (pct == null || !Number.isFinite(+pct)) return "none";
  if (+pct > 90)  return "high";
  if (+pct >= 70) return "medium";
  return "low";
}

const SEV = {
  low:    { fg: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0", label: "Disponível" },
  medium: { fg: "#d97706", bg: "#fffbeb", border: "#fde68a", label: "Atenção"    },
  high:   { fg: "#dc2626", bg: "#fef2f2", border: "#fecaca", label: "Crítico"    },
  none:   { fg: "#64748b", bg: "#f8fafc", border: "#e2e8f0", label: "Sem dados"  },
};

function _sevCfg(pct) { return SEV[_sev(pct)] ?? SEV.none; }

function _headerGradient(sev) {
  const g = {
    low:    "linear-gradient(120deg,#166534,#16a34a)",
    medium: "linear-gradient(120deg,#92400e,#d97706)",
    high:   "linear-gradient(120deg,#991b1b,#dc2626)",
    none:   "linear-gradient(120deg,#1e3a5f,#2563a8)",
  };
  return g[sev] ?? g.none;
}

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

    const pn       = _pn(it);
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

    const occupiedTotal = future !== null ? projOcc : occWithPD;
    const avail = cap > 0 ? Math.max(0, cap - occupiedTotal) : null;

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
   HTML DO POPUP — v9.2 Clean
========================================================================== */

/* Barra horizontal simples */
function _bar(pct, color) {
  const w = Math.min(100, Math.max(0, pct ?? 0)).toFixed(1);
  return `
    <div class="zp-bar">
      <div class="zp-bar__fill" style="width:${w}%;background:${color}"></div>
      <div class="zp-bar__m70"></div>
      <div class="zp-bar__m90"></div>
    </div>`;
}

/* Tabela de itens */
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
              <tr class="${i % 2 ? "alt" : ""}">
                <td class="mono">${r.pn || "—"}</td>
                <td>${r.pe || "—"}</td>
                <td>${r.zone || "—"}</td>
                <td class="r">${_fmtCx(r.volExcel)}</td>
                <td class="r bold">${_fmtCx(r.volCalc)}</td>
                <td class="muted">${r.intro || "—"}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>`;
}

/* Aba Situação Atual — v9.2 */
function _tabAtual(m) {
  const sc       = _sevCfg(m.occWithPDPct ?? m.occPct);
  const cap      = m.cap ?? 0;
  const pct      = m.occWithPDPct ?? m.occPct ?? 0;
  const avPct    = cap > 0 ? Math.max(0, ((m.avail ?? 0) / cap) * 100) : 0;
  const totalOcc = m.curOcc + (m.volIntro ?? 0);
  const totalPct = cap > 0 ? (totalOcc / cap) * 100 : 0;
  const availColor = (m.avail ?? 0) > 0 ? "#16a34a" : "#dc2626";

  return `
    <div class="zp-pane" id="zp-pane-atual">

      <!-- 3 métricas topo -->
      <div class="zp-metrics">
        <div class="zp-metric">
          <span class="zp-metric__lbl">Capacidade</span>
          <span class="zp-metric__val">${_fmtMaybe(cap)}</span>
        </div>
        <div class="zp-metric">
          <span class="zp-metric__lbl">Ocupado hoje</span>
          <span class="zp-metric__val" style="color:${sc.fg}">${_fmtCx(m.curOcc)}</span>
          <span class="zp-metric__sub">${(m.occPct ?? 0).toFixed(1)}% da cap.</span>
        </div>
        <div class="zp-metric">
          <span class="zp-metric__lbl">Disponível</span>
          <span class="zp-metric__val" style="color:${availColor}">${_fmtMaybe(m.avail)}</span>
          <span class="zp-metric__sub">${avPct.toFixed(1)}% livre</span>
        </div>
      </div>

      <!-- Régua de ocupação -->
      <div class="zp-occ-section">
        <div class="zp-occ-label">
          <span>Nível de ocupação</span>
          <span class="zp-badge" style="color:${sc.fg};background:${sc.bg};border-color:${sc.border}">
            ${sc.label} · ${pct.toFixed(1)}%
          </span>
        </div>
        ${_bar(pct, sc.fg)}
        <div class="zp-occ-legend">
          <span><span class="zp-dot" style="background:${sc.fg}"></span>Ocupado hoje${m.volIntro > 0 ? " + PD" : ""}</span>
          <span class="muted" style="display:flex;align-items:center;gap:8px">
            <span style="display:flex;align-items:center;gap:3px">
              <span style="width:2px;height:10px;background:#d97706;display:inline-block;border-radius:1px"></span>70%
            </span>
            <span style="display:flex;align-items:center;gap:3px">
              <span style="width:2px;height:10px;background:#dc2626;display:inline-block;border-radius:1px"></span>90%
            </span>
          </span>
        </div>
      </div>

      <!-- Bloco: Impacto da Introdução (PD) -->
      <div class="zp-impact-block">
        <div class="zp-impact-title">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          Impacto da Introdução (PD)
        </div>
        <div class="zp-impact-row">
          <div class="zp-impact-cell">
            <span class="zp-impact-cell__lbl">Ocupado hoje</span>
            <span class="zp-impact-cell__val">${_fmtCx(m.curOcc)}</span>
            <span class="zp-impact-cell__pct">${(m.occPct ?? 0).toFixed(1)}%</span>
          </div>
          <div class="zp-impact-op">+</div>
          <div class="zp-impact-cell zp-impact-cell--pd">
            <span class="zp-impact-cell__lbl">Introdução PD</span>
            <span class="zp-impact-cell__val" style="color:#d97706">${_fmtCx(m.volIntro ?? 0)}</span>
            <span class="zp-impact-cell__pct">${m.volIntro > 0 && cap > 0 ? ((m.volIntro / cap) * 100).toFixed(1) + "%" : "—"}</span>
          </div>
          <div class="zp-impact-op">=</div>
          <div class="zp-impact-cell zp-impact-cell--total" style="border-color:${sc.fg}40">
            <span class="zp-impact-cell__lbl">Total projetado</span>
            <span class="zp-impact-cell__val" style="color:${sc.fg}">${_fmtCx(totalOcc)}</span>
            <span class="zp-impact-cell__pct" style="color:${sc.fg};font-weight:700">${totalPct.toFixed(1)}%</span>
          </div>
        </div>
      </div>

      <!-- Introduções resumo -->
      <div class="zp-intro-section">
        <div class="zp-intro-title">
          Introduções até o período
          ${m.selPeriod ? `<span class="zp-chip">${m.selPeriod}</span>` : ""}
        </div>
        <div class="zp-intro-row">
          <div class="zp-intro-stat">
            <strong>${m.pnCount}</strong><span>Part Numbers</span>
          </div>
          <div class="zp-intro-stat">
            <strong>${_fmtCx(m.volIntro)}</strong><span>Volume</span>
          </div>
          <div class="zp-intro-stat">
            <strong>${m.avgDr}</strong><span>Daily Rate médio</span>
          </div>
        </div>
      </div>

      ${_tableHtml(m.details, m.selPeriod)}
    </div>`;
}

/* Aba Projeção Futura */
function _tabProj(m) {
  const prodHoje   = m.prodHoje   ?? 0;
  const prodFutura = m.prodFutura ?? 0;

  if (!prodHoje) {
    return `
      <div class="zp-pane" id="zp-pane-proj">
        <div class="zp-empty zp-empty--center">
          <p><strong>Projeção não disponível</strong></p>
          <span>Informe o <strong>Vol. Atual</strong> (veíc./dia) no controle do mapa para ativar o cálculo.</span>
        </div>
      </div>`;
  }

  const futSc  = _sevCfg(m.futPct);
  const curSc  = _sevCfg(m.occPct);
  const fator  = (prodFutura / prodHoje).toFixed(2);
  const delta  = m.futPct != null && m.occPct != null ? (m.futPct - m.occPct) : null;
  const deltaStr = delta != null
    ? `${delta > 0 ? "+" : ""}${delta.toFixed(1)} pp`
    : "—";
  const deltaColor = delta == null ? "#94a3b8" : delta > 2 ? "#dc2626" : delta < -2 ? "#16a34a" : "#64748b";

  return `
    <div class="zp-pane" id="zp-pane-proj">

      <!-- Hero: % futuro -->
      ${m.futPct != null ? `
        <div class="zp-proj-hero" style="border-color:${futSc.border}">
          <div>
            <div class="zp-proj-hero__pct" style="color:${futSc.fg}">${m.futPct.toFixed(1)}%</div>
            <div class="zp-proj-hero__lbl">Ocupação futura projetada</div>
            <span class="zp-badge" style="color:${futSc.fg};background:${futSc.bg};border-color:${futSc.border}">${futSc.label}</span>
          </div>
          <div class="zp-proj-hero__compare">
            <div class="zp-proj-vs">
              <span style="color:${curSc.fg}">${(m.occPct ?? 0).toFixed(1)}%</span>
              <span class="zp-proj-vs__arrow">→</span>
              <span style="color:${futSc.fg};font-weight:800">${m.futPct.toFixed(1)}%</span>
            </div>
            <span class="zp-proj-delta" style="color:${deltaColor}">${deltaStr}</span>
          </div>
        </div>
        ${_bar(m.futPct, futSc.fg)}
      ` : ""}

      <!-- Fórmula -->
      <div class="zp-formula">
        <div class="zp-formula__title">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          Fórmula de projeção
        </div>
        <div class="zp-formula__eq">
          <div class="zp-formula__term">
            <span class="zp-formula__val">${_fmtCx(m.curOcc)}</span>
            <span class="zp-formula__lbl">Ocup. hoje</span>
          </div>
          <span class="zp-formula__op">×</span>
          <div class="zp-formula__frac">
            <span>${_fmtVeic(prodFutura)}</span>
            <span class="zp-formula__frac-bar"></span>
            <span>${_fmtVeic(prodHoje)}</span>
          </div>
          <span class="zp-formula__op">=</span>
          <div class="zp-formula__term zp-formula__term--res" style="border-color:${futSc.border}">
            <span class="zp-formula__val" style="color:${futSc.fg}">${_fmtCx(m.baseProjected)}</span>
            <span class="zp-formula__lbl">Ocup. base futura</span>
          </div>
        </div>
        <div class="zp-formula__note">
          Fator ${fator}×
          ${m.volIntro > 0 ? `· +${_fmtCx(m.volIntro)} introduções Excel` : "· sem introduções no período"}
        </div>
      </div>

    </div>`;
}

/* Popup principal */
function _buildPopupHtml(zoneName, m) {
  const mainSev = m.futPct != null ? _sev(m.futPct) : _sev(m.occWithPDPct ?? m.occPct);
  const sc      = SEV[mainSev] ?? SEV.none;
  const todayPct = Math.min(100, m.occWithPDPct ?? m.occPct ?? 0);
  const futPct   = m.futPct != null ? Math.min(100, m.futPct) : null;
  const period   = m.selPeriod ? `Até ${m.selPeriod}` : "Todos os períodos";

  return `
    <!-- CABEÇALHO -->
    <div class="zp-hd" style="background:${_headerGradient(mainSev)}">
      <div class="zp-hd__info">
        <span class="zp-hd__name">${zoneName}</span>
        <span class="zp-hd__period">${period}</span>
      </div>
      <div class="zp-hd__right">
        <div class="zp-hd__pcts">
          <span class="zp-hd__pct-lbl">Hoje</span>
          <span class="zp-hd__pct-val">${(m.occWithPDPct ?? m.occPct ?? 0).toFixed(0)}%</span>
          ${futPct != null ? `
            <span class="zp-hd__pct-sep">→</span>
            <span class="zp-hd__pct-lbl">Futuro</span>
            <span class="zp-hd__pct-val zp-hd__pct-val--fut">${futPct.toFixed(0)}%</span>` : ""}
        </div>
        <span class="zp-hd__status">${sc.label}</span>
        <button class="zp-hd__close" type="button" aria-label="Fechar">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- MINI GAUGE NO HEADER -->
    <div class="zp-hd-gauge">
      <div class="zp-hd-gauge__today" style="width:${todayPct.toFixed(1)}%;background:${sc.fg}44"></div>
      ${futPct != null ? `<div class="zp-hd-gauge__fut" style="width:${futPct.toFixed(1)}%;border-right:2px solid ${sc.fg}"></div>` : ""}
    </div>

    <!-- ABAS -->
    <div class="zp-tabs">
      <button class="zp-tab zp-tab--active" data-tab="atual" type="button">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        Situação Atual
        <span class="zp-tab__pill" style="color:${SEV[_sev(m.occWithPDPct ?? m.occPct)].fg}">
          ${(m.occWithPDPct ?? m.occPct ?? 0).toFixed(0)}%
        </span>
      </button>
      <button class="zp-tab" data-tab="proj" type="button">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        Projeção Futura
        ${m.futPct != null ? `<span class="zp-tab__pill" style="color:${SEV[_sev(m.futPct)].fg}">${m.futPct.toFixed(0)}%</span>` : ""}
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

  let left = hr.right + GAP;
  let top  = hr.top + hr.height / 2 - ph / 2;

  if (left + pw > vw - GAP) left = hr.left - pw - GAP;
  if (left < GAP)            left = Math.max(GAP, hr.left + hr.width / 2 - pw / 2);
  top  = Math.max(GAP, Math.min(top,  vh - ph - GAP));
  left = Math.max(GAP, Math.min(left, vw - pw - GAP));

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
   HOTSPOT
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
    <span class="zo-hs__dot" style="background:${sc.fg}" aria-hidden="true"></span>`;

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
   CSS INJETADO — v9.2 Clean
========================================================================== */
(function _injectStyles() {
  if (document.getElementById("zo-styles-v92")) return;
  ["zo-styles-v91","zo-styles-v90","zo-styles-v82","zo-styles-v81","zo-styles-v8","zo-future-styles","zo-styles-v5"]
    .forEach(id => document.getElementById(id)?.remove());

  const s = document.createElement("style");
  s.id = "zo-styles-v92";
  s.textContent = `

    /* ── HOTSPOT ─────────────────────────────────────────────── */
    .zo-hotspot {
      position:absolute; display:flex; flex-direction:column;
      align-items:center; justify-content:center; gap:3px;
      background:transparent; border:3px solid transparent;
      border-radius:8px; cursor:pointer; padding:6px 8px; z-index:3;
      transition:border-color .15s,background .15s,box-shadow .15s;
    }
    .zo-hotspot--low    { border-color:rgba(22,163,74,.95);  background:rgba(22,163,74,.16);  }
    .zo-hotspot--medium { border-color:rgba(217,119,6,.96);  background:rgba(217,119,6,.17);  }
    .zo-hotspot--high   { border-color:rgba(220,38,38,.96);  background:rgba(220,38,38,.17);  }
    .zo-hotspot:hover   { transform:scale(1.01); }
    .zo-hotspot--open   { box-shadow:inset 0 0 0 2px rgba(255,255,255,.62),0 0 0 2px rgba(0,21,51,.34); }
    .zo-hs__name,.zo-hs__rate { color:#001533; background:rgba(255,255,255,.9); border:1px solid rgba(255,255,255,.95); border-radius:5px; padding:2px 6px; line-height:1.2; }
    .zo-hs__name { font-size:11px; font-weight:900; }
    .zo-hs__rate { font-size:16px; font-weight:800; padding:2px 8px; display:flex; align-items:center; gap:3px; }
    .zo-hs__tag  { font-size:9px; font-weight:600; text-transform:uppercase; color:rgba(0,21,51,.6); background:rgba(255,255,255,.75); border-radius:3px; padding:1px 4px; }
    .zo-hs__dot  { width:10px; height:10px; border-radius:50%; border:2px solid #fff; }
    .zo-hs__trend { font-size:12px; font-weight:700; }
    .zo-hs__trend--up { color:#dc2626; }
    .zo-hs__trend--dn { color:#16a34a; }
    .zo-hs__trend--eq { color:#94a3b8; }

    /* ── POPUP ───────────────────────────────────────────────── */
    .zp-popup {
      position:fixed; z-index:9999;
      width:380px; max-height:88vh;
      display:flex; flex-direction:column; overflow:hidden;
      background:#fff; border-radius:12px;
      border:1.5px solid #e2e8f0;
      box-shadow:0 20px 50px rgba(0,0,0,.16),0 6px 16px rgba(0,0,0,.10);
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      animation:zp-in .17s cubic-bezier(.22,.68,0,1.15) forwards;
    }
    @keyframes zp-in { from{opacity:0;transform:translateY(6px) scale(.97)} to{opacity:1;transform:none} }
    .zp-popup--low    { border-color:#bbf7d0; }
    .zp-popup--medium { border-color:#fde68a; }
    .zp-popup--high   { border-color:#fecaca; }

    /* ── HEADER ──────────────────────────────────────────────── */
    .zp-hd {
      display:flex; align-items:center; justify-content:space-between;
      padding:14px 16px 10px; flex-shrink:0; border-radius:10px 10px 0 0;
    }
    .zp-hd__info { display:flex; flex-direction:column; gap:3px; }
    .zp-hd__name { font-size:16px; font-weight:800; color:#fff; letter-spacing:-.02em; }
    .zp-hd__period { font-size:11px; color:rgba(255,255,255,.6); }
    .zp-hd__right { display:flex; align-items:center; gap:10px; }
    .zp-hd__pcts { display:flex; align-items:baseline; gap:5px; }
    .zp-hd__pct-lbl { font-size:10px; color:rgba(255,255,255,.55); }
    .zp-hd__pct-val { font-size:15px; font-weight:800; color:#fff; }
    .zp-hd__pct-val--fut { opacity:.85; }
    .zp-hd__pct-sep { color:rgba(255,255,255,.4); font-size:12px; }
    .zp-hd__status { font-size:11px; font-weight:600; color:rgba(255,255,255,.8); background:rgba(0,0,0,.2); padding:3px 9px; border-radius:20px; white-space:nowrap; }
    .zp-hd__close {
      background:rgba(255,255,255,.15); border:1px solid rgba(255,255,255,.3);
      border-radius:6px; color:rgba(255,255,255,.7); cursor:pointer;
      padding:5px 7px; display:flex; align-items:center; transition:background .12s;
    }
    .zp-hd__close:hover { background:rgba(255,255,255,.28); color:#fff; }

    /* mini gauge */
    .zp-hd-gauge { position:relative; height:3px; flex-shrink:0; background:rgba(0,0,0,.08); }
    .zp-hd-gauge__today { position:absolute; top:0; left:0; height:100%; transition:width .4s; }
    .zp-hd-gauge__fut   { position:absolute; top:0; left:0; height:100%; background:transparent; transition:width .4s; }

    /* ── ABAS ────────────────────────────────────────────────── */
    .zp-tabs { display:flex; border-bottom:1px solid #f1f5f9; background:#fafafa; flex-shrink:0; }
    .zp-tab {
      flex:1; display:flex; align-items:center; justify-content:center; gap:5px;
      padding:10px 8px; font-size:12px; font-weight:500; color:#64748b;
      background:none; border:none; border-bottom:2px solid transparent;
      cursor:pointer; transition:color .12s, border-color .12s; white-space:nowrap;
    }
    .zp-tab:hover { color:#0f172a; }
    .zp-popup--low    .zp-tab--active { color:#166534; border-bottom-color:#16a34a; font-weight:700; }
    .zp-popup--medium .zp-tab--active { color:#78350f; border-bottom-color:#d97706; font-weight:700; }
    .zp-popup--high   .zp-tab--active { color:#7f1d1d; border-bottom-color:#dc2626; font-weight:700; }
    .zp-popup--none   .zp-tab--active { color:#1e3a5f; border-bottom-color:#2563a8; font-weight:700; }
    .zp-tab__pill {
      font-size:10px; font-weight:700;
      padding:1px 7px; border-radius:10px;
      background:rgba(0,0,0,.06);
    }

    /* ── BODY ────────────────────────────────────────────────── */
    .zp-body { overflow-y:auto; flex:1; scrollbar-width:thin; scrollbar-color:#e2e8f0 transparent; }
    .zp-pane { padding:14px 16px 16px; }

    /* ── MÉTRICAS (sóbrias — sem fundo colorido) ─────────────── */
    .zp-metrics { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-bottom:14px; }
    .zp-metric {
      background:#f8fafc; border:1px solid #e2e8f0; border-radius:9px;
      padding:10px 10px 8px; display:flex; flex-direction:column; gap:2px;
    }
    .zp-metric__lbl { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:#94a3b8; }
    .zp-metric__val { font-size:13px; font-weight:800; color:#0f172a; line-height:1.1; }
    .zp-metric__sub { font-size:10px; color:#94a3b8; }

    /* ── BADGE INLINE ────────────────────────────────────────── */
    .zp-badge {
      display:inline-flex; align-items:center;
      font-size:10px; font-weight:700; padding:2px 8px;
      border-radius:10px; border:1px solid; white-space:nowrap;
    }

    /* ── BARRA ───────────────────────────────────────────────── */
    .zp-occ-section { margin-bottom:12px; }
    .zp-occ-label { display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:.06em; color:#94a3b8; }
    .zp-bar { position:relative; height:8px; background:#f1f5f9; border-radius:4px; overflow:visible; margin-bottom:5px; }
    .zp-bar__fill { height:100%; border-radius:4px; transition:width .5s; }
    .zp-bar__m70 { position:absolute; top:-4px; bottom:-4px; left:70%; width:2px; background:#d97706; border-radius:1px; z-index:2; }
    .zp-bar__m90 { position:absolute; top:-4px; bottom:-4px; left:90%; width:2px; background:#dc2626; border-radius:1px; z-index:2; }
    .zp-occ-legend { display:flex; align-items:center; justify-content:space-between; font-size:10px; color:#94a3b8; gap:6px; }
    .zp-dot { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:4px; vertical-align:middle; }
    .muted { color:#94a3b8; }

    /* ── IMPACTO PD ──────────────────────────────────────────── */
    .zp-impact-block {
      margin-bottom:14px;
      background:#f8fafc;
      border:1px solid #e2e8f0;
      border-radius:10px;
      padding:10px 12px;
    }
    .zp-impact-title {
      display:flex; align-items:center; gap:5px;
      font-size:9px; font-weight:700;
      text-transform:uppercase; letter-spacing:.07em;
      color:#94a3b8; margin-bottom:10px;
    }
    .zp-impact-row {
      display:flex; align-items:center; gap:6px;
    }
    .zp-impact-cell {
      flex:1; background:#fff; border:1px solid #e2e8f0;
      border-radius:8px; padding:8px 10px;
      display:flex; flex-direction:column; gap:2px;
    }
    .zp-impact-cell--pd    { border-color:#fde68a; background:#fffbeb; }
    .zp-impact-cell--total { border-width:1.5px; }
    .zp-impact-cell__lbl {
      font-size:9px; font-weight:700;
      text-transform:uppercase; letter-spacing:.05em; color:#94a3b8;
    }
    .zp-impact-cell__val { font-size:13px; font-weight:800; color:#0f172a; line-height:1.1; }
    .zp-impact-cell__pct { font-size:10px; color:#94a3b8; }
    .zp-impact-op { font-size:18px; font-weight:700; color:#cbd5e1; flex-shrink:0; }

    /* ── INTRODUÇÕES ─────────────────────────────────────────── */
    .zp-intro-section { margin-bottom:12px; }
    .zp-intro-title { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:#94a3b8; margin-bottom:6px; display:flex; align-items:center; gap:8px; }
    .zp-chip { font-size:10px; font-weight:700; padding:1px 8px; border-radius:10px; background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; }
    .zp-intro-row { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; }
    .zp-intro-stat { background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:8px 6px; text-align:center; display:flex; flex-direction:column; gap:2px; }
    .zp-intro-stat strong { font-size:12px; font-weight:800; color:#0f172a; line-height:1; }
    .zp-intro-stat span   { font-size:9px; color:#94a3b8; }

    /* ── TABELA ──────────────────────────────────────────────── */
    .zp-table-block { margin-top:12px; }
    .zp-table-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:#94a3b8; }
    .zp-table-badge { font-size:10px; font-weight:600; padding:1px 8px; border-radius:10px; background:#001533; color:#fff; }
    .zp-table-scroll { overflow-x:auto; border-radius:8px; border:1px solid #f1f5f9; }
    .zp-table { width:100%; border-collapse:collapse; font-size:11px; min-width:320px; }
    .zp-table th { padding:7px 8px; background:#001533; color:rgba(255,255,255,.85); font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; text-align:left; white-space:nowrap; }
    .zp-table td { padding:5px 8px; color:#334155; border-bottom:1px solid #f8fafc; }
    .zp-table tr.alt td { background:#fafafa; }
    .zp-table tbody tr:last-child td { border-bottom:none; }
    .zp-table th.r, .zp-table td.r { text-align:right; }
    .zp-table td.mono { font-family:monospace; font-size:10px; font-weight:700; color:#1a4d8f; max-width:80px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .zp-table td.bold  { font-weight:700; }
    .zp-table td.muted { color:#94a3b8; font-size:10px; white-space:nowrap; }

    /* ── EMPTY ───────────────────────────────────────────────── */
    .zp-empty { display:flex; flex-direction:column; align-items:center; gap:6px; padding:20px; text-align:center; color:#94a3b8; }
    .zp-empty--center { padding:36px 20px; }
    .zp-empty p    { font-size:12px; color:#64748b; margin:0; }
    .zp-empty span { font-size:11px; }

    /* ── PROJEÇÃO HERO ───────────────────────────────────────── */
    .zp-proj-hero { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 16px; border:1.5px solid; border-radius:10px; margin-bottom:12px; background:#fafafa; }
    .zp-proj-hero__pct    { font-size:32px; font-weight:900; line-height:1; letter-spacing:-.03em; }
    .zp-proj-hero__lbl    { font-size:10px; color:#94a3b8; margin-bottom:4px; }
    .zp-proj-hero__compare{ display:flex; flex-direction:column; align-items:flex-end; gap:6px; }
    .zp-proj-vs { display:flex; align-items:center; gap:8px; }
    .zp-proj-vs > span    { font-size:15px; font-weight:700; }
    .zp-proj-vs__arrow    { color:#cbd5e1; font-size:14px; }
    .zp-proj-delta        { font-size:11px; font-weight:700; padding:2px 8px; background:rgba(0,0,0,.05); border-radius:6px; }

    /* ── FÓRMULA ─────────────────────────────────────────────── */
    .zp-formula { background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-top:10px; }
    .zp-formula__title { display:flex; align-items:center; gap:5px; font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.07em; color:#94a3b8; margin-bottom:10px; }
    .zp-formula__eq  { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
    .zp-formula__term { display:flex; flex-direction:column; align-items:center; gap:2px; background:#fff; border-radius:7px; padding:6px 10px; border:1px solid #e2e8f0; }
    .zp-formula__term--res { border-width:1.5px; }
    .zp-formula__val { font-size:12px; font-weight:800; color:#0f172a; white-space:nowrap; }
    .zp-formula__lbl { font-size:9px; color:#94a3b8; white-space:nowrap; }
    .zp-formula__op  { font-size:18px; font-weight:700; color:#cbd5e1; flex-shrink:0; }
    .zp-formula__frac { display:flex; flex-direction:column; align-items:center; background:#fff; border-radius:7px; padding:4px 10px; border:1px solid #e2e8f0; gap:1px; }
    .zp-formula__frac > span { font-size:11px; font-weight:700; color:#0f172a; white-space:nowrap; }
    .zp-formula__frac > span:last-child { font-weight:500; color:#64748b; }
    .zp-formula__frac-bar { width:100%; height:1px; background:#e2e8f0; margin:1px 0; }
    .zp-formula__note { font-size:10px; color:#94a3b8; margin-top:8px; }

    /* ── BADGES RODAPÉ ───────────────────────────────────────── */
    .wh-trigger-badge { white-space:nowrap; }

    /* ── MOBILE ──────────────────────────────────────────────── */
    @media (max-width:480px) {
      .zp-popup { width:calc(100vw - 16px) !important; left:8px !important; max-height:88vh; }
      .zp-metrics { grid-template-columns:repeat(3,1fr); }
      .zp-intro-row { grid-template-columns:repeat(2,1fr); }
      .zp-impact-row { flex-wrap:wrap; }
      .zp-impact-cell { min-width:calc(50% - 6px); }
      .zp-impact-op { display:none; }
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
