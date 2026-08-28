"use strict";

/* ==========================================================================
   LCB Capacity Analytics — zones-overlay.js v8.2
   Fórmula de ocupação futura por zona:
     Ocup.Futura_cx  = Ocup.Hoje_cx × (ProdFutura / ProdHoje)
     Ocup.Futura_%   = Ocup.Futura_cx / Capacidade_zona × 100
   _state.volumeAtual  = Produção Hoje   (veíc./dia — campo "Vol. Atual")
   _state.volumeFuturo = Produção Futura (veíc./dia — campo "Vol. Futuro")
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
  volumeAtual:  0,   // Produção Hoje   (veíc./dia)
  volumeFuturo: 0,   // Produção Futura (veíc./dia)
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
function _fmtMaybe(v) { if (v == null) return "Não informado"; const n = Number(v); return Number.isFinite(n) ? _fmtCx(n) : "Não informado"; }

function _periodKey(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const n = _norm(s);

  const MON = { JAN:1,FEV:2,MAR:3,ABR:4,MAI:5,JUN:6,JUL:7,AGO:8,SET:9,OUT:10,NOV:11,DEZ:12 };

  // "JUL/2028" ou "JUL 2028" ou "JUL-2028" (com ou sem espaço)
  let m = n.match(/^(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)[\/\-\s]*(19\d{2}|20\d{2})$/);
  if (m) return +m[2] * 12 + MON[m[1]];

  // "2028/JUL" ou "2028-JUL"
  m = n.match(/^(19\d{2}|20\d{2})[\/\-\s]*(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)$/);
  if (m) return +m[1] * 12 + MON[m[2]];

  // "Q1/2028" ou "Q1 2028"
  m = n.match(/^Q([1-4])[\/\-\s]*(19\d{2}|20\d{2})$/);
  if (m) return +m[2] * 12 + +m[1] * 3;

  // "2028/Q1"
  m = n.match(/^(19\d{2}|20\d{2})[\/\-\s]*Q([1-4])$/);
  if (m) return +m[1] * 12 + +m[2] * 3;

  // Formatos numéricos: 2028-07, 07/2028
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
const _blk   = i => _num(i, ["bloqueado","blocked","slots_bloqueados","bloq_code"]);
const _dr    = i => _num(i, ["daily_rate","dailyRate","dr","DR"]);

function _physicalCapacity(zoneName) {
  /* Lê a capacidade diretamente dos inputs "Capacidade LCB"
     para garantir que o overlay sempre reflete o que o usuário configurou.
     Fallback para defaultCapacity caso o campo não exista. */
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

  // fallback: defaultCapacity do OVERLAY_ZONES
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
   CÁLCULO DE OCUPAÇÃO FUTURA POR ZONA — v8.2
   Fórmula:
     Ocup.Futura_cx = Ocup.Hoje_cx × (ProdFutura / ProdHoje)
     Ocup.Futura_%  = Ocup.Futura_cx / Capacidade × 100

   _state.volumeAtual  = Produção Hoje   (veíc./dia)
   _state.volumeFuturo = Produção Futura (veíc./dia)
   currentOccupied     = Ocup.Hoje em caixas (por zona)
   introVolume         = volume de introduções do Excel até o período
========================================================================== */
function _calcOcupacaoFutura(currentOccupied, introVolume, capacity) {
  const prodHoje   = Number(_state.volumeAtual)  || 0;
  const prodFutura = Number(_state.volumeFuturo) || 0;

  if (prodHoje <= 0 || capacity <= 0) return null;

  const fator = prodFutura / prodHoje;

  // Ocup. base projetada: escala a ocupação atual pela razão de produção
  const baseProjected = Math.max(0, currentOccupied * fator);

  // Adiciona introduções do Excel (volume novo de PD no período)
  const projectedOccupied = Math.max(0, baseProjected + Math.max(0, introVolume));

  // % de ocupação futura
  const futurePct = (projectedOccupied / capacity) * 100;

  return { fator, baseProjected, introVolume: Math.max(0, introVolume), projectedOccupied, futurePct };
}

/* ==========================================================================
   SEVERIDADE / COR
========================================================================== */
function _sev(pct) {
  if (pct == null || !Number.isFinite(+pct)) return "none";
  if (+pct > 90)  return "high";
  if (+pct >= 70) return "medium";
  return "low";
}
function _sevColor(sev) {
  return sev === "high" ? "#dc2626" : sev === "medium" ? "#d97706" : sev === "low" ? "#16a34a" : "#94a3b8";
}
function _sevLabel(sev) {
  return sev === "high" ? "Crítico" : sev === "medium" ? "Atenção" : sev === "low" ? "Disponível" : "Sem dados";
}
function _sevBg(sev) {
  return sev === "high" ? "#fef2f2" : sev === "medium" ? "#fffbeb" : sev === "low" ? "#f0fdf4" : "#f8fafc";
}
function _sevBorder(sev) {
  return sev === "high" ? "#fecaca" : sev === "medium" ? "#fde68a" : sev === "low" ? "#bbf7d0" : "#e2e8f0";
}
function _sevHeaderGradient(sev) {
  if (sev === "high")   return "linear-gradient(135deg, #991b1b, #dc2626)";
  if (sev === "medium") return "linear-gradient(135deg, #92400e, #d97706)";
  if (sev === "low")    return "linear-gradient(135deg, #166534, #16a34a)";
  return "linear-gradient(135deg, #1a4d8f, #2563a8)";
}

/* ==========================================================================
   AGREGAÇÃO
========================================================================== */
function aggregateByZone(items, opts = {}) {
  const projFilter = opts.project && _norm(opts.project) !== "TODOS" ? _norm(opts.project) : null;

  // Se selectedPeriod foi passado: tenta parsear.
  // Se parsear falhou (formato inesperado): usa null = sem filtro de data (mostra tudo).
  // Se selectedPeriod não foi passado (undefined/null): também sem filtro.
  // O fallback de "pegar máximo" foi removido — interferia na timeline.
  let selKey = null;
  if (opts.selectedPeriod) {
    selKey = _periodKey(opts.selectedPeriod);
    // Se não conseguiu parsear, trata como "mostrar tudo" (selKey = null)
  }

  const groups = {};
  for (const z of ZONE_ORDER) {
    groups[z] = { pns: new Set(), details: [], count: 0, introVolume: 0, blocked: 0, dr: 0 };
  }

  for (const it of items || []) {
    const z = _zone(it);
    const g = groups[z];
    if (!g) continue;
    if (projFilter) { const ip = _proj(it); if (ip && _norm(ip) !== projFilter) continue; }

    const pn       = _pn(it);
    const introKey = _periodKey(_intro(it));
    const vol      = Math.max(0, _vol(it));
    const blocked  = Math.max(0, _blk(it));
    const dr       = _dr(it);

    if (pn) g.pns.add(pn);
    g.count   += 1;
    g.blocked += blocked;
    g.dr      += dr;

    // Visível na timeline:
    // - selKey null → mostra tudo (sem filtro de período)
    // - introKey null → item sem data de introdução → sempre inclui
    // - introKey <= selKey → introduzido até o período selecionado
    const visibleInTimeline = selKey === null || introKey === null || introKey <= selKey;
    if (visibleInTimeline) {
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
  }

  const result = {};
  for (const zoneName of ZONE_ORDER) {
    const g           = groups[zoneName];
    const cap         = _physicalCapacity(zoneName);
    const curOcc      = Math.round(_inputCurrentOccupied(zoneName));
    const introVolume = Math.round(g.introVolume);
    const blocked     = Math.round(g.blocked);

    const occPct   = cap > 0 ? (curOcc / cap) * 100 : null;
    const future   = _calcOcupacaoFutura(curOcc, introVolume, cap);
    const futPct   = future?.futurePct ?? null;
    const projOcc  = Math.round(future?.projectedOccupied ?? curOcc);
    const baseProj = Math.round(future?.baseProjected ?? curOcc);
    const avail    = cap > 0 ? Math.max(0, cap - projOcc - blocked) : null;
    const sev      = _sev(futPct ?? occPct);

    const sortedDetails = g.details.slice().sort((a, b) => {
      if (a.introKey == null && b.introKey == null) return 0;
      if (a.introKey == null) return 1;
      if (b.introKey == null) return -1;
      return a.introKey - b.introKey;
    });

    result[zoneName] = {
      name: zoneName, abbr: OVERLAY_ZONES[zoneName].abbr,
      curOcc, baseProjected: baseProj, projOcc, blocked, avail, cap,
      occPct, futPct, fator: future?.fator ?? null, volIntro: introVolume,
      count: g.count, pnCount: g.pns.size, details: sortedDetails,
      hasCap: cap > 0, sev,
      avgDr: g.count > 0 ? (g.dr / g.count).toFixed(2) : "0,00",
      selPeriod: opts.selectedPeriod ?? null,
      prodHoje:   _state.volumeAtual,
      prodFutura: _state.volumeFuturo,
    };
  }
  return result;
}


/* ==========================================================================
   HTML DO POPUP — redesign v9.0 (BI-grade)
========================================================================== */

function _tableHtml(details, selPeriod) {
  if (!details?.length) {
    const periodMsg = selPeriod
      ? `Nenhuma peça introduzida até <strong>${selPeriod}</strong> nesta zona.`
      : "Nenhum item classificado nesta zona.";
    return `
      <div class="zo-no-data">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".35"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
        <p>${periodMsg}</p>
        <span>Verifique as colunas <em>storage_zone</em> e <em>introduction_date</em></span>
      </div>`;
  }
  const periodLabel = selPeriod ? `até ${selPeriod}` : "todos os períodos";
  return `
    <div class="zo-items-block">
      <div class="zo-items-header">
        <span class="zo-items-header__title">Itens introduzidos</span>
        <span class="zo-items-header__badge">${details.length} peça(s) · ${periodLabel}</span>
      </div>
      <div class="zo-items-table-wrap">
        <table class="zo-items-table">
          <thead>
            <tr><th>PN</th><th>PE</th><th>Zona</th><th class="num">Vol. Excel</th><th class="num">Vol. Calc.</th><th>Introdução</th></tr>
          </thead>
          <tbody>
            ${details.map((r, i) => `
              <tr class="${i % 2 !== 0 ? "alt" : ""}">
                <td class="pn">${r.pn || "—"}</td>
                <td>${r.pe || "—"}</td>
                <td>${r.zone || "—"}</td>
                <td class="num">${_fmtCx(r.volExcel)}</td>
                <td class="num bold">${_fmtCx(r.volCalc)}</td>
                <td class="date">${r.intro || "—"}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>`;
}

function _kpiCard(label, value, sub, color) {
  return `
    <div class="zo-kpi">
      <span class="zo-kpi__label">${label}</span>
      <strong class="zo-kpi__value" style="color:${color || "inherit"}">${value}</strong>
      ${sub ? `<span class="zo-kpi__sub">${sub}</span>` : ""}
    </div>`;
}

function _occBar(pct, color, showThresholds) {
  const w = Math.min(100, Math.max(0, pct ?? 0));
  return `
    <div class="zo-occ-bar-wrap">
      <div class="zo-occ-bar">
        <div class="zo-occ-bar__fill" style="width:${w.toFixed(1)}%;background:${color}">
          ${w >= 18 ? `<span class="zo-occ-bar__label-in">${w.toFixed(1)}%</span>` : ""}
        </div>
        ${showThresholds ? `
          <div class="zo-occ-bar__mark" style="left:80%" title="80%"></div>
          <div class="zo-occ-bar__mark zo-occ-bar__mark--crit" style="left:90%" title="90%"></div>` : ""}
      </div>
      ${w < 18 ? `<span class="zo-occ-bar__label-out" style="color:${color}">${w.toFixed(1)}%</span>` : ""}
    </div>`;
}

/* -- ABA SITUAÇÃO ATUAL -- */
function _buildTabAtual(m) {
  const sevCur = _sev(m.occPct);
  const curClr = _sevColor(sevCur);
  const cap    = m.cap ?? 0;
  const avail  = m.avail ?? 0;
  const occPct = m.occPct ?? 0;
  const availPct = cap > 0 ? Math.max(0, (avail / cap) * 100) : 0;

  return `
    <div class="zo-tab-pane" id="zo-tab-atual">

      <div class="zo-kpi-row zo-kpi-row--2">
        ${_kpiCard("Ocupado Hoje", _fmtCx(m.curOcc), `${occPct.toFixed(1)}% utilizado`, curClr)}
        ${_kpiCard("Disponível", _fmtMaybe(avail), `${availPct.toFixed(1)}% livre`, avail > 0 ? "#16a34a" : "#dc2626")}
      </div>

      <div class="zo-section">
        <div class="zo-section__hd">
          <span class="zo-section__label">Nível de Ocupação</span>
          <span class="zo-section__badge" style="background:${_sevBg(sevCur)};color:${curClr};border-color:${_sevBorder(sevCur)}">${_sevLabel(sevCur)}</span>
        </div>
        ${_occBar(occPct, curClr, true)}
        <div class="zo-occ-sub-row">
          <span class="zo-occ-sub-lbl">Bloqueado</span>
          <div class="zo-occ-sub-bar">
            <div style="width:${cap > 0 ? Math.min(100,(m.blocked/cap)*100).toFixed(1) : 0}%;background:#94a3b8;height:100%;border-radius:3px"></div>
          </div>
          <span class="zo-occ-sub-val">${_fmtCx(m.blocked)}</span>
        </div>
      </div>

      <div class="zo-detail-grid">
        <div class="zo-detail-item">
          <span class="zo-detail-item__lbl">Total</span>
          <span class="zo-detail-item__val">${_fmtMaybe(cap)}</span>
        </div>
        <div class="zo-detail-item">
          <span class="zo-detail-item__lbl">Ocupado</span>
          <span class="zo-detail-item__val" style="color:${curClr}">${_fmtCx(m.curOcc)}</span>
        </div>
        <div class="zo-detail-item">
          <span class="zo-detail-item__lbl">Bloqueado</span>
          <span class="zo-detail-item__val">${_fmtCx(m.blocked)}</span>
        </div>
        <div class="zo-detail-item zo-detail-item--hl" style="border-color:${avail > 0 ? "#16a34a" : "#dc2626"}">
          <span class="zo-detail-item__lbl">Disponível</span>
          <span class="zo-detail-item__val" style="color:${avail > 0 ? "#16a34a" : "#dc2626"}">${_fmtMaybe(avail)}</span>
        </div>
      </div>

      <div class="zo-section" style="margin-top:12px">
        <div class="zo-section__hd">
          <span class="zo-section__label">Introduções até o período</span>
          ${m.selPeriod ? `<span class="zo-period-chip">${m.selPeriod}</span>` : ""}
        </div>
        <div class="zo-intro-grid">
          <div class="zo-intro-item">
            <span class="zo-intro-item__val">${m.count}</span>
            <span class="zo-intro-item__lbl">Itens</span>
          </div>
          <div class="zo-intro-item">
            <span class="zo-intro-item__val">${m.pnCount}</span>
            <span class="zo-intro-item__lbl">Part Numbers</span>
          </div>
          <div class="zo-intro-item">
            <span class="zo-intro-item__val">${_fmtCx(m.volIntro)}</span>
            <span class="zo-intro-item__lbl">Volume</span>
          </div>
          <div class="zo-intro-item">
            <span class="zo-intro-item__val">${m.avgDr}</span>
            <span class="zo-intro-item__lbl">Daily Rate médio</span>
          </div>
        </div>
      </div>

      ${_tableHtml(m.details, m.selPeriod)}
    </div>`;
}

/* -- ABA PROJEÇÃO FUTURA -- */
function _buildTabProjecao(m) {
  const futPct     = m.futPct;
  const futSev     = futPct !== null ? _sev(futPct) : "none";
  const futClr     = _sevColor(futSev);
  const curClr     = _sevColor(_sev(m.occPct));
  const prodHoje   = m.prodHoje   ?? _state.volumeAtual;
  const prodFutura = m.prodFutura ?? _state.volumeFuturo;

  if (!prodHoje) {
    return `
      <div class="zo-tab-pane" id="zo-tab-proj">
        <div class="zo-empty-state">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" opacity=".3"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <p class="zo-empty-state__title">Projeção não disponível</p>
          <p class="zo-empty-state__desc">Informe o <strong>Vol. Atual</strong> (veíc./dia) no controle do mapa para ativar o cálculo de ocupação futura por zona.</p>
        </div>
      </div>`;
  }

  const fator    = (prodFutura / prodHoje);
  const fatorStr = fator.toFixed(2);
  const delta    = (futPct !== null && m.occPct != null) ? (futPct - m.occPct) : null;
  const deltaAbs = delta != null ? Math.abs(delta).toFixed(1) : "—";
  const deltaIcon = delta != null ? (delta > 0.5 ? "▲" : delta < -0.5 ? "▼" : "→") : "";
  const deltaClr  = delta != null ? (delta > 2 ? "#dc2626" : delta < -2 ? "#16a34a" : "#64748b") : "#64748b";

  return `
    <div class="zo-tab-pane" id="zo-tab-proj">

      ${futPct !== null ? `
        <div class="zo-proj-hero" style="border-color:${_sevBorder(futSev)};background:${_sevBg(futSev)}">
          <div class="zo-proj-hero__left">
            <span class="zo-proj-hero__lbl">Ocupação Futura</span>
            <span class="zo-proj-hero__pct" style="color:${futClr}">${futPct.toFixed(1)}%</span>
            <span class="zo-proj-hero__status" style="color:${futClr}">${_sevLabel(futSev)}</span>
          </div>
          <div class="zo-proj-hero__right">
            <div class="zo-proj-hero__vs">
              <div class="zo-proj-hero__vs-item">
                <span class="zo-proj-hero__vs-lbl">Hoje</span>
                <span class="zo-proj-hero__vs-val" style="color:${curClr}">${m.occPct != null ? m.occPct.toFixed(1)+"%" : "—"}</span>
              </div>
              <span class="zo-proj-hero__vs-arr">→</span>
              <div class="zo-proj-hero__vs-item">
                <span class="zo-proj-hero__vs-lbl">Futuro</span>
                <span class="zo-proj-hero__vs-val" style="color:${futClr};font-weight:800">${futPct.toFixed(1)}%</span>
              </div>
            </div>
            <span class="zo-proj-hero__delta" style="color:${deltaClr}">${deltaIcon} ${deltaAbs} pp</span>
          </div>
        </div>
      ` : ""}

      <div class="zo-formula-block">
        <div class="zo-formula-block__hd">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          Fórmula de projeção
        </div>
        <div class="zo-formula-eq">
          <div class="zo-formula-term">
            <span class="zo-formula-term__val">${_fmtCx(m.curOcc)}</span>
            <span class="zo-formula-term__lbl">Ocup. Hoje</span>
          </div>
          <span class="zo-formula-op">×</span>
          <div class="zo-formula-frac">
            <span class="zo-formula-frac__num">${_fmtVeic(prodFutura)}</span>
            <span class="zo-formula-frac__bar"></span>
            <span class="zo-formula-frac__den">${_fmtVeic(prodHoje)}</span>
          </div>
          <span class="zo-formula-op">=</span>
          <div class="zo-formula-term zo-formula-term--res" style="border-color:${_sevBorder(futSev)};background:${_sevBg(futSev)}">
            <span class="zo-formula-term__val" style="color:${futClr}">${_fmtCx(m.baseProjected)}</span>
            <span class="zo-formula-term__lbl" style="color:${futClr}">Ocup. base futura</span>
          </div>
        </div>
        <div class="zo-formula-note">
          Fator ${fatorStr}× ${m.volIntro > 0 ? `· +${_fmtCx(m.volIntro)} introduções Excel` : "· sem introduções no período"}
        </div>
      </div>

      ${futPct !== null ? `
        <div class="zo-breakdown__row zo-breakdown__row--pct" style="background:${_sevBg(futSev)};border-radius:8px;padding:12px 14px;margin-top:8px">
          <span style="color:${futClr};font-weight:600">Taxa de ocupação futura</span>
          <span style="color:${futClr};font-weight:800;font-size:18px">${futPct.toFixed(1)}%</span>
        </div>
      ` : `
        <div class="zo-empty-state" style="margin-top:12px">
          <p class="zo-empty-state__title">Sem dados de projeção</p>
          <p class="zo-empty-state__desc">Não foi possível calcular a ocupação futura para esta zona.</p>
        </div>
      `}
    </div>`;
}

/* -- POPUP PRINCIPAL v9.0 -- */
function _buildPopupHtml(zoneName, m) {
  const sevCur  = _sev(m.occPct);
  const sevFut  = m.futPct != null ? _sev(m.futPct) : null;
  const mainSev = sevFut ?? sevCur;
  const curClr  = _sevColor(sevCur);
  const futClr  = _sevColor(sevFut ?? "none");
  const period  = m.selPeriod ? `Até ${m.selPeriod}` : "Todos os períodos";
  const todayW  = Math.min(100, m.occPct ?? 0);
  const futureW = m.futPct != null ? Math.min(100, m.futPct) : null;

  return `
    <div class="zo-hd" style="background:${_sevHeaderGradient(mainSev)}">
      <div class="zo-hd__left">
        <div class="zo-hd__zone">${zoneName}</div>
        <div class="zo-hd__meta">
          <span class="zo-hd__period">${period}</span>
          ${m.cap > 0 ? `<span class="zo-hd__cap">Cap. ${_fmtCx(m.cap)}</span>` : ""}
        </div>
      </div>
      <div class="zo-hd__right">
        <div class="zo-hd__pills">
          ${m.occPct != null ? `<span class="zo-hd__pill">Hoje ${m.occPct.toFixed(0)}%</span>` : ""}
          ${m.futPct != null ? `<span class="zo-hd__pill zo-hd__pill--fut">Futuro ${m.futPct.toFixed(0)}%</span>` : ""}
        </div>
        <span class="zo-hd__status-pill">${_sevLabel(mainSev)}</span>
        <button class="zo-hd__close" type="button" aria-label="Fechar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>
    <div class="zo-hd-bar">
      <div class="zo-hd-bar__fill" style="width:${todayW.toFixed(1)}%;background:${curClr}aa"></div>
      ${futureW != null ? `<div class="zo-hd-bar__fut" style="width:${futureW.toFixed(1)}%;border-right:2.5px solid ${futClr}"></div>` : ""}
      ${todayW >= 90 ? `<div class="zo-hd-bar__mark" style="left:90%"></div>` : ""}
    </div>
    <div class="zo-tabs" role="tablist">
      <button class="zo-tab zo-tab--active" role="tab" data-tab="atual" aria-selected="true">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        Situação Atual
        ${m.occPct != null ? `<span class="zo-tab__badge" style="background:${_sevBg(sevCur)};color:${curClr};border-color:${_sevBorder(sevCur)}">${m.occPct.toFixed(0)}%</span>` : ""}
      </button>
      <button class="zo-tab" role="tab" data-tab="proj" aria-selected="false">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        Projeção Futura
        ${m.futPct != null ? `<span class="zo-tab__badge" style="background:${_sevBg(sevFut)};color:${futClr};border-color:${_sevBorder(sevFut)}">${m.futPct.toFixed(0)}%</span>` : ""}
      </button>
    </div>
    <div class="zo-body">
      ${_buildTabAtual(m)}
      ${_buildTabProjecao(m)}
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
  const pw  = popup.offsetWidth  || 360;
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
  const tabs  = popup.querySelectorAll(".zo-tab");
  const panes = popup.querySelectorAll(".zo-tab-pane");

  tabs.forEach(tab => {
    tab.addEventListener("click", e => {
      e.stopPropagation();
      const target = tab.dataset.tab;
      tabs.forEach(t => {
        const isActive = t.dataset.tab === target;
        t.classList.toggle("zo-tab--active", isActive);
        t.setAttribute("aria-selected", String(isActive));
      });
      panes.forEach(p => { p.style.display = p.id === `zo-tab-${target}` ? "block" : "none"; });
    });
  });
  panes.forEach((p, i) => { p.style.display = i === 0 ? "block" : "none"; });
}

function _ensureListeners() {
  if (_listenersAttached) return;
  _listenersAttached = true;
  document.addEventListener("click", e => {
    if (e.target.closest(".zo-hotspot") || e.target.closest(".zo-popup-float")) return;
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
  const sevCls = m.sev === "none" ? "low" : m.sev;
  const clr    = _sevColor(m.sev);

  // Mostra % futura se disponível, % atual caso contrário
  const mainPct  = m.futPct !== null ? m.futPct : m.occPct;
  const mainLbl  = mainPct != null ? `${mainPct.toFixed(0)}%` : "—";
  const isFuture = m.futPct !== null;

  let trendIcon = "";
  if (isFuture && m.occPct != null) {
    const delta = m.futPct - m.occPct;
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
    <span class="zo-hs__dot" style="background:${clr}" aria-hidden="true"></span>`;

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
      popup.className = `zo-popup-float zo-popup--${sevCls}`;
      popup.setAttribute("role", "dialog");
      popup.setAttribute("aria-label", `Detalhes — ${zoneName}`);
      popup.setAttribute("aria-modal", "true");
      popup.innerHTML = _buildPopupHtml(zoneName, m);

      document.body.appendChild(popup);
      _activePopupEl = popup;
      _initTabListeners(popup);

      requestAnimationFrame(() => requestAnimationFrame(() => _positionPopup(popup, hs)));

      popup.querySelector(".zo-hd__close")?.addEventListener("click", e => {
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
    const cfg      = OVERLAY_ZONES[zoneName];
    const hotspots = cfg.hotspots || [];
    hotspots.forEach(hsCfg => _createHotspot(zoneName, cfg, hsCfg, agg[zoneName], map));
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
  // volumeAtual  = Produção Hoje   (veíc./dia)
  // volumeFuturo = Produção Futura (veíc./dia)
  if (ctx.volumeAtual  != null) _state.volumeAtual  = +ctx.volumeAtual;
  if (ctx.volumeFuturo != null) _state.volumeFuturo = +ctx.volumeFuturo;
}

function getOverlayContext() { return { ..._state }; }

/* ==========================================================================
   CSS INJETADO — v8.2 (adiciona .zo-formula-box)
========================================================================== */

/* ==========================================================================
   CSS INJETADO — v9.0
========================================================================== */
(function _injectStyles() {
  if (document.getElementById("zo-styles-v90")) return;
  ["zo-styles-v82","zo-styles-v81","zo-styles-v8","zo-future-styles","zo-styles-v5"].forEach(id => {
    document.getElementById(id)?.remove();
  });

  const s = document.createElement("style");
  s.id = "zo-styles-v90";
  s.textContent = `

    /* ── HOTSPOT ─────────────────────────────────────────────── */
    .zo-hotspot {
      position:absolute; display:flex; flex-direction:column;
      align-items:center; justify-content:center; gap:3px;
      background:transparent; border:3px solid transparent;
      border-radius:8px; cursor:pointer; padding:6px 8px; z-index:3;
      transition:border-color .15s,background .15s,box-shadow .15s;
      box-shadow:inset 0 0 0 1px rgba(255,255,255,.35),0 2px 8px rgba(15,23,42,.18);
    }
    .zo-hotspot--low   { border-color:rgba(22,163,74,.95);  background:rgba(22,163,74,.16);  box-shadow:inset 0 0 0 1px rgba(255,255,255,.38),0 0 0 1px rgba(22,163,74,.18),0 3px 10px rgba(22,163,74,.22); }
    .zo-hotspot--medium{ border-color:rgba(217,119,6,.96); background:rgba(217,119,6,.17); box-shadow:inset 0 0 0 1px rgba(255,255,255,.36),0 0 0 1px rgba(217,119,6,.18),0 3px 10px rgba(217,119,6,.24); }
    .zo-hotspot--high  { border-color:rgba(220,38,38,.96);  background:rgba(220,38,38,.17);  box-shadow:inset 0 0 0 1px rgba(255,255,255,.36),0 0 0 1px rgba(220,38,38,.18),0 3px 10px rgba(220,38,38,.24); }
    .zo-hotspot:hover  { transform:scale(1.01); box-shadow:inset 0 0 0 1px rgba(255,255,255,.5),0 0 0 2px rgba(255,255,255,.55),0 5px 16px rgba(15,23,42,.28); }
    .zo-hotspot--open  { box-shadow:inset 0 0 0 2px rgba(255,255,255,.62),0 0 0 2px rgba(0,21,51,.34),0 6px 18px rgba(15,23,42,.32); }
    .zo-hs__name,.zo-hs__rate { color:#001533; background:rgba(255,255,255,.86); border:1px solid rgba(255,255,255,.95); border-radius:5px; padding:2px 6px; line-height:1.2; box-shadow:0 1px 4px rgba(15,23,42,.18); }
    .zo-hs__name { font-size:11px; font-weight:900; }
    .zo-hs__rate { font-size:16px; font-weight:800; padding:2px 8px; display:flex; align-items:center; gap:3px; }
    .zo-hs__tag  { font-size:9px; font-weight:600; text-transform:uppercase; letter-spacing:.04em; color:rgba(0,21,51,.7); background:rgba(255,255,255,.75); border-radius:3px; padding:1px 4px; }
    .zo-hs__dot  { width:12px; height:12px; border-radius:50%; border:2px solid #fff; box-shadow:0 0 0 2px rgba(0,21,51,.35),0 2px 7px rgba(15,23,42,.35); margin-top:1px; }
    .zo-hs__trend { font-size:12px; font-weight:700; }
    .zo-hs__trend--up { color:#dc2626; }
    .zo-hs__trend--dn { color:#16a34a; }
    .zo-hs__trend--eq { color:#94a3b8; }

    /* ── POPUP CONTAINER ─────────────────────────────────────── */
    .zo-popup-float {
      position:fixed; z-index:9999;
      width:380px; max-height:90vh;
      overflow:hidden; display:flex; flex-direction:column;
      background:#ffffff; border-radius:14px;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      box-shadow:0 25px 60px rgba(0,0,0,.22),0 8px 20px rgba(0,0,0,.14);
      animation:zo-in .18s cubic-bezier(.22,.68,0,1.2) forwards;
    }
    @keyframes zo-in { from{opacity:0;transform:translateY(8px) scale(.96)} to{opacity:1;transform:translateY(0) scale(1)} }
    .zo-popup--low    { border:2px solid #16a34a; }
    .zo-popup--medium { border:2px solid #d97706; }
    .zo-popup--high   { border:2px solid #dc2626; }
    .zo-popup--none   { border:2px solid #e2e8f0; }

    /* ── HEADER ──────────────────────────────────────────────── */
    .zo-hd {
      display:flex; align-items:flex-start; justify-content:space-between;
      padding:14px 16px 12px; border-radius:12px 12px 0 0; flex-shrink:0;
    }
    .zo-hd__left { display:flex; flex-direction:column; gap:3px; }
    .zo-hd__zone { font-size:15px; font-weight:800; color:#fff; letter-spacing:-.02em; }
    .zo-hd__meta { display:flex; align-items:center; gap:8px; }
    .zo-hd__period { font-size:11px; color:rgba(255,255,255,.65); }
    .zo-hd__cap    { font-size:11px; color:rgba(255,255,255,.5); }
    .zo-hd__right  { display:flex; align-items:center; gap:8px; }
    .zo-hd__pills  { display:flex; gap:5px; }
    .zo-hd__pill   { font-size:10px; font-weight:700; padding:2px 8px; border-radius:20px; background:rgba(255,255,255,.15); color:#fff; white-space:nowrap; }
    .zo-hd__pill--fut { background:rgba(255,255,255,.28); }
    .zo-hd__status-pill { font-size:11px; font-weight:600; padding:3px 10px; border-radius:20px; background:rgba(0,0,0,.2); color:#fff; border:1px solid rgba(255,255,255,.25); white-space:nowrap; }
    .zo-hd__close { background:rgba(255,255,255,.15); border:1px solid rgba(255,255,255,.3); border-radius:7px; color:rgba(255,255,255,.8); cursor:pointer; padding:5px 7px; display:flex; align-items:center; justify-content:center; transition:background .12s; }
    .zo-hd__close:hover { background:rgba(255,255,255,.3); color:#fff; }

    /* ── MINI GAUGE (header) ─────────────────────────────────── */
    .zo-hd-bar { position:relative; height:4px; flex-shrink:0; }
    .zo-hd-bar__fill { position:absolute; top:0; left:0; height:100%; transition:width .4s ease; }
    .zo-hd-bar__fut  { position:absolute; top:0; left:0; height:100%; background:transparent; transition:width .4s ease; }
    .zo-hd-bar__mark { position:absolute; top:0; bottom:0; width:2px; background:rgba(220,38,38,.7); }

    /* ── ABAS ────────────────────────────────────────────────── */
    .zo-tabs { display:flex; border-bottom:1px solid #f1f5f9; background:#fafafa; flex-shrink:0; }
    .zo-tab  {
      flex:1; display:flex; align-items:center; justify-content:center; gap:5px;
      padding:10px 10px; font-size:12px; font-weight:500; color:#64748b;
      background:none; border:none; border-bottom:2.5px solid transparent;
      cursor:pointer; transition:color .15s,border-color .15s; white-space:nowrap;
    }
    .zo-tab:hover { color:#0f172a; }
    .zo-popup--low    .zo-tab--active { color:#14532d; border-bottom-color:#16a34a; font-weight:700; }
    .zo-popup--medium .zo-tab--active { color:#78350f; border-bottom-color:#d97706; font-weight:700; }
    .zo-popup--high   .zo-tab--active { color:#7f1d1d; border-bottom-color:#dc2626; font-weight:700; }
    .zo-popup--none   .zo-tab--active { color:#0f172a; border-bottom-color:#1a4d8f; font-weight:700; }
    .zo-tab__badge { font-size:10px; font-weight:700; padding:1px 7px; border-radius:10px; border:1px solid transparent; }

    /* ── BODY / PANES ────────────────────────────────────────── */
    .zo-body { overflow-y:auto; flex:1; scrollbar-width:thin; scrollbar-color:#e2e8f0 transparent; }
    .zo-popup--low    .zo-body { scrollbar-color:#16a34a transparent; }
    .zo-popup--medium .zo-body { scrollbar-color:#d97706 transparent; }
    .zo-popup--high   .zo-body { scrollbar-color:#dc2626 transparent; }
    .zo-tab-pane { padding:14px 16px 16px; display:none; }

    /* ── KPI ROW ─────────────────────────────────────────────── */
    .zo-kpi-row { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-bottom:14px; }
    .zo-kpi-row--2 { grid-template-columns:repeat(2,1fr); }
    .zo-kpi { background:#f8fafc; border:1px solid #f1f5f9; border-radius:9px; padding:10px 10px 8px; display:flex; flex-direction:column; gap:2px; }
    .zo-popup--low    .zo-kpi { background:#f0fdf4; border-color:#d1fae5; }
    .zo-popup--medium .zo-kpi { background:#fffbeb; border-color:#fde68a; }
    .zo-popup--high   .zo-kpi { background:#fef2f2; border-color:#fecaca; }
    .zo-kpi__label { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:#94a3b8; }
    .zo-kpi__value { font-size:13px; font-weight:800; color:#0f172a; line-height:1.1; }
    .zo-kpi__sub   { font-size:10px; color:#94a3b8; }

    /* ── SECTION ─────────────────────────────────────────────── */
    .zo-section { margin-bottom:12px; }
    .zo-section__hd { display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; }
    .zo-section__label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:#94a3b8; }
    .zo-popup--low    .zo-section__label { color:#166534; }
    .zo-popup--medium .zo-section__label { color:#92400e; }
    .zo-popup--high   .zo-section__label { color:#991b1b; }
    .zo-section__badge { font-size:10px; font-weight:700; padding:2px 8px; border-radius:10px; border:1px solid; }

    /* ── BARRA DE OCUPAÇÃO ───────────────────────────────────── */
    .zo-occ-bar-wrap { display:flex; align-items:center; gap:8px; }
    .zo-occ-bar { flex:1; height:10px; background:#f1f5f9; border-radius:5px; overflow:visible; position:relative; }
    .zo-popup--low    .zo-occ-bar { background:rgba(22,163,74,.1); }
    .zo-popup--medium .zo-occ-bar { background:rgba(217,119,6,.1); }
    .zo-popup--high   .zo-occ-bar { background:rgba(220,38,38,.1); }
    .zo-occ-bar__fill { height:100%; border-radius:5px; display:flex; align-items:center; justify-content:flex-end; padding-right:6px; transition:width .5s ease; position:relative; }
    .zo-occ-bar__label-in  { font-size:9px; font-weight:700; color:#fff; white-space:nowrap; }
    .zo-occ-bar__label-out { font-size:11px; font-weight:700; white-space:nowrap; }
    .zo-occ-bar__mark { position:absolute; top:-3px; bottom:-3px; width:2px; background:rgba(217,119,6,.6); border-radius:1px; }
    .zo-occ-bar__mark--crit { background:rgba(220,38,38,.7); }
    .zo-occ-sub-row { display:flex; align-items:center; gap:8px; margin-top:6px; }
    .zo-occ-sub-lbl { font-size:10px; color:#94a3b8; min-width:56px; }
    .zo-occ-sub-bar { flex:1; height:4px; background:#f1f5f9; border-radius:2px; overflow:hidden; }
    .zo-occ-sub-val { font-size:10px; font-weight:600; color:#94a3b8; min-width:60px; text-align:right; }

    /* ── DETAIL GRID ─────────────────────────────────────────── */
    .zo-detail-grid { display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:6px; margin-bottom:4px; }
    @media(max-width:420px){ .zo-detail-grid { grid-template-columns:1fr 1fr; } }
    .zo-detail-item { background:#f8fafc; border:1px solid #f1f5f9; border-radius:8px; padding:8px 8px 6px; display:flex; flex-direction:column; gap:3px; }
    .zo-detail-item--hl { border-width:2px; }
    .zo-detail-item__lbl { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:#94a3b8; }
    .zo-detail-item__val { font-size:12px; font-weight:700; color:#0f172a; }

    /* ── INTRO GRID ──────────────────────────────────────────── */
    .zo-intro-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; }
    .zo-intro-item { background:#f8fafc; border:1px solid #f1f5f9; border-radius:8px; padding:8px 6px 7px; text-align:center; display:flex; flex-direction:column; gap:2px; }
    .zo-intro-item__val { font-size:12px; font-weight:800; color:#0f172a; line-height:1; }
    .zo-intro-item__lbl { font-size:9px; color:#94a3b8; }
    .zo-period-chip { font-size:10px; font-weight:700; padding:2px 8px; border-radius:10px; background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; }

    /* ── TABELA DE ITENS ─────────────────────────────────────── */
    .zo-items-block { margin-top:14px; }
    .zo-items-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; }
    .zo-items-header__title { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:#94a3b8; }
    .zo-popup--low    .zo-items-header__title { color:#166534; }
    .zo-popup--medium .zo-items-header__title { color:#92400e; }
    .zo-popup--high   .zo-items-header__title { color:#991b1b; }
    .zo-items-header__badge { font-size:10px; font-weight:600; padding:1px 8px; border-radius:10px; color:#fff; }
    .zo-popup--low    .zo-items-header__badge { background:#16a34a; }
    .zo-popup--medium .zo-items-header__badge { background:#d97706; }
    .zo-popup--high   .zo-items-header__badge { background:#dc2626; }
    .zo-popup--none   .zo-items-header__badge { background:#1a4d8f; }
    .zo-items-table-wrap { border-radius:8px; overflow:hidden; border:1px solid #f1f5f9; }
    .zo-popup--low    .zo-items-table-wrap { border-color:#bbf7d0; }
    .zo-popup--medium .zo-items-table-wrap { border-color:#fde68a; }
    .zo-popup--high   .zo-items-table-wrap { border-color:#fecaca; }
    .zo-items-table { width:100%; border-collapse:collapse; font-size:11px; min-width:320px; }
    .zo-items-table th { padding:7px 8px; font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:#fff; text-align:left; white-space:nowrap; }
    .zo-popup--low    .zo-items-table th { background:#166534; }
    .zo-popup--medium .zo-items-table th { background:#92400e; }
    .zo-popup--high   .zo-items-table th { background:#991b1b; }
    .zo-popup--none   .zo-items-table th { background:#001533; }
    .zo-items-table td { padding:5px 8px; color:#334155; border-bottom:1px solid #f8fafc; }
    .zo-items-table tr.alt td { background:#fafafa; }
    .zo-popup--low    .zo-items-table tr.alt td { background:#f0fdf4; }
    .zo-popup--medium .zo-items-table tr.alt td { background:#fffbeb; }
    .zo-popup--high   .zo-items-table tr.alt td { background:#fef2f2; }
    .zo-items-table tbody tr:last-child td { border-bottom:none; }
    .zo-items-table th.num, .zo-items-table td.num { text-align:right; }
    .zo-items-table td.pn   { font-family:monospace; font-size:10px; font-weight:700; max-width:80px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .zo-popup--low    .zo-items-table td.pn { color:#166534; }
    .zo-popup--medium .zo-items-table td.pn { color:#92400e; }
    .zo-popup--high   .zo-items-table td.pn { color:#991b1b; }
    .zo-popup--none   .zo-items-table td.pn { color:#1a4d8f; }
    .zo-items-table td.bold { font-weight:700; }
    .zo-items-table td.date { color:#94a3b8; font-size:10px; white-space:nowrap; }

    /* ── SEM DADOS ───────────────────────────────────────────── */
    .zo-no-data { display:flex; flex-direction:column; align-items:center; gap:6px; padding:20px; text-align:center; color:#94a3b8; }
    .zo-no-data p    { font-size:12px; color:#64748b; margin:0; }
    .zo-no-data span { font-size:11px; }
    .zo-empty-state  { display:flex; flex-direction:column; align-items:center; gap:8px; padding:32px 20px; text-align:center; }
    .zo-empty-state__title { font-size:13px; font-weight:700; color:#475569; margin:0; }
    .zo-empty-state__desc  { font-size:12px; color:#94a3b8; margin:0; max-width:250px; line-height:1.55; }

    /* ── PROJEÇÃO HERO ───────────────────────────────────────── */
    .zo-proj-hero { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 16px; border:2px solid; border-radius:10px; margin-bottom:14px; }
    .zo-proj-hero__left { display:flex; flex-direction:column; gap:3px; }
    .zo-proj-hero__lbl  { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.07em; color:#94a3b8; }
    .zo-proj-hero__pct  { font-size:30px; font-weight:900; line-height:1; letter-spacing:-.03em; }
    .zo-proj-hero__status { font-size:11px; font-weight:700; }
    .zo-proj-hero__right { display:flex; flex-direction:column; align-items:flex-end; gap:6px; }
    .zo-proj-hero__vs   { display:flex; align-items:center; gap:8px; }
    .zo-proj-hero__vs-item { display:flex; flex-direction:column; align-items:center; gap:1px; }
    .zo-proj-hero__vs-lbl { font-size:9px; color:#94a3b8; }
    .zo-proj-hero__vs-val { font-size:14px; font-weight:700; }
    .zo-proj-hero__vs-arr { font-size:16px; color:#cbd5e1; }
    .zo-proj-hero__delta  { font-size:11px; font-weight:700; padding:2px 8px; background:rgba(0,0,0,.06); border-radius:6px; }

    /* ── BARRAS COMPARATIVAS ─────────────────────────────────── */
    .zo-compare-block { display:flex; flex-direction:column; gap:7px; margin-bottom:14px; }
    .zo-compare-row   { display:flex; align-items:center; gap:10px; }
    .zo-compare-row__lbl { font-size:11px; font-weight:600; color:#94a3b8; min-width:44px; }

    /* ── FÓRMULA ─────────────────────────────────────────────── */
    .zo-formula-block { background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:12px; }
    .zo-popup--low    .zo-formula-block { background:#f0fdf4; border-color:#bbf7d0; }
    .zo-popup--medium .zo-formula-block { background:#fffbeb; border-color:#fde68a; }
    .zo-popup--high   .zo-formula-block { background:#fef2f2; border-color:#fecaca; }
    .zo-formula-block__hd { display:flex; align-items:center; gap:5px; font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.07em; color:#94a3b8; margin-bottom:10px; }
    .zo-popup--low    .zo-formula-block__hd { color:#166534; }
    .zo-popup--medium .zo-formula-block__hd { color:#92400e; }
    .zo-popup--high   .zo-formula-block__hd { color:#991b1b; }
    .zo-formula-eq { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
    .zo-formula-term { display:flex; flex-direction:column; align-items:center; gap:2px; background:rgba(255,255,255,.75); border-radius:7px; padding:6px 10px; border:1px solid rgba(0,0,0,.07); }
    .zo-formula-term--res { border-width:1.5px; }
    .zo-formula-term__val { font-size:12px; font-weight:800; color:#0f172a; white-space:nowrap; }
    .zo-formula-term__lbl { font-size:9px; color:#94a3b8; white-space:nowrap; }
    .zo-formula-op  { font-size:18px; font-weight:700; color:#94a3b8; flex-shrink:0; }
    .zo-formula-frac { display:flex; flex-direction:column; align-items:center; background:rgba(255,255,255,.75); border-radius:7px; padding:4px 10px; border:1px solid rgba(0,0,0,.07); }
    .zo-formula-frac__num { font-size:11px; font-weight:700; color:#0f172a; white-space:nowrap; }
    .zo-formula-frac__den { font-size:11px; font-weight:600; color:#64748b; white-space:nowrap; }
    .zo-formula-frac__bar { width:100%; height:1.5px; background:#cbd5e1; margin:2px 0; }
    .zo-formula-note { font-size:10px; color:#94a3b8; margin-top:8px; display:flex; gap:10px; flex-wrap:wrap; }

    /* ── BREAKDOWN ───────────────────────────────────────────── */
    .zo-breakdown { border:1px solid #f1f5f9; border-radius:10px; overflow:hidden; margin-top:12px; }
    .zo-popup--low    .zo-breakdown { border-color:#bbf7d0; }
    .zo-popup--medium .zo-breakdown { border-color:#fde68a; }
    .zo-popup--high   .zo-breakdown { border-color:#fecaca; }
    .zo-breakdown__title { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.07em; color:#94a3b8; padding:8px 12px 6px; background:#f8fafc; border-bottom:1px solid #f1f5f9; }
    .zo-popup--low    .zo-breakdown__title { background:#f0fdf4; color:#166534; }
    .zo-popup--medium .zo-breakdown__title { background:#fffbeb; color:#92400e; }
    .zo-popup--high   .zo-breakdown__title { background:#fef2f2; color:#991b1b; }
    .zo-breakdown__row { display:flex; justify-content:space-between; align-items:center; padding:6px 12px; border-bottom:1px solid #f8fafc; font-size:12px; color:#475569; }
    .zo-breakdown__row:last-child { border-bottom:none; }
    .zo-breakdown__row--op    { color:#94a3b8; font-style:italic; }
    .zo-breakdown__row--sub   { background:#f8fafc; }
    .zo-breakdown__row--total { padding:9px 12px; border-top:1.5px solid; border-bottom:1.5px solid; }
    .zo-breakdown__row--pct   { padding:9px 12px; }

    /* ── BADGES RODAPÉ ───────────────────────────────────────── */
    .wh-trigger-badge { white-space:nowrap; }

    /* ── MOBILE ──────────────────────────────────────────────── */
    @media (max-width:480px) {
      .zo-popup-float { width:calc(100vw - 16px) !important; left:8px !important; max-height:85vh; }
      .zo-kpi-row     { grid-template-columns:repeat(3,1fr); }
      .zo-intro-grid  { grid-template-columns:repeat(2,1fr); }
      .zo-detail-grid { grid-template-columns:1fr 1fr; }
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
