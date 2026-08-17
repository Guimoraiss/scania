"use strict";

/* ==========================================================================
   LCB Capacity Analytics — zones-overlay.js (v7.5)

   MUDANÇAS v7.5:
   ✔ aggregateByZone exporta occPct real por zona (vinda do Excel)
   ✔ _calcOcupacaoFutura usa occPct de CADA zona individualmente
   ✔ Popup mostra % Ocup. Futura colorida por zona
   ✔ Badges no rodapé mostram atual → futuro por zona
   ✔ setOverlayContext aceita volumeAtual e volumeFuturo (mesma unidade: veículos/dia)
   ✔ Retorna agg com occPct por zona para o app.js usar nos badges
========================================================================== */

const OVERLAY_ZONES = {
  "Base 10": {
    id: "base10", label: "Base 10", abbr: "B10",
    headerColor: "#1a4d8f", defaultCapacity: 68000, defaultOcc: 82,
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
  // Projeção futura — MESMA UNIDADE (veículos/dia)
  volumeAtual:  0,   // volume atual de produção (veículos/dia) — campo "Volume Produto Atual"
  volumeFuturo: 0,   // volume futuro (veículos/dia) — slider "Volume Produção Futura"
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
function _fmtMaybe(v) { if (v == null) return "Não informado"; const n = Number(v); return Number.isFinite(n) ? _fmtCx(n) : "Não informado"; }

function _periodKey(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const n = _norm(s);
  let m = n.match(/^Q([1-4])\s*[-/ ]\s*(19\d{2}|20\d{2})$/);
  if (m) return +m[2] * 12 + +m[1] * 3;
  m = n.match(/^(19\d{2}|20\d{2})\s*[-/ ]\s*Q([1-4])$/);
  if (m) return +m[1] * 12 + +m[2] * 3;
  const MON = { JAN:1,FEV:2,MAR:3,ABR:4,MAI:5,JUN:6,JUL:7,AGO:8,SET:9,OUT:10,NOV:11,DEZ:12 };
  m = n.match(/^(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s*[-/ ]\s*(19\d{2}|20\d{2})$/);
  if (m) return +m[2] * 12 + MON[m[1]];
  m = n.match(/^(19\d{2}|20\d{2})\s*[-/ ]\s*(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)$/);
  if (m) return +m[1] * 12 + MON[m[2]];
  const d = new Date(s); if (!isNaN(d)) return d.getFullYear() * 12 + d.getMonth() + 1;
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
const _cap   = i => { const d = _num(i, ["capacity","capacidade","total_slots","slots_total","capacidade_total"]); if (d > 0) return d; return _num(i, ["volume_contratado","volumeContratado","volC"]); };
const _blk   = i => _num(i, ["bloqueado","blocked","slots_bloqueados","bloq_code"]);
const _dr    = i => _num(i, ["daily_rate","dailyRate","dr","DR"]);

function _inputCapacity(zoneName) {
  const b10  = Number(document.getElementById("caCapPortaPalletsB10")?.value)   || 0;
  const b20  = Number(document.getElementById("caCapPortaPalletsB20")?.value)   || 0;
  const bb10 = Number(document.getElementById("caCapBlueBoxB10")?.value)        || 0;
  const bb20 = Number(document.getElementById("caCapBlueBoxB20")?.value)        || 0;
  const bbi  = Number(document.getElementById("caCapBlueBoxIndividual")?.value) || 0;
  const bl   = Number(document.getElementById("caCapBlocado")?.value)           || 0;
  const tmx  = Number(document.getElementById("caCapTMX")?.value)               || 0;
  switch (zoneName) {
    case "Base 10":             return b10;
    case "Base 20":             return b20;
    case "Blue Box Base 10":    return bb10;
    case "Blue Box Base 20":    return bb20;
    case "Blue Box Individual": return bbi;
    case "Blocado":             return bl;
    case "T;M;4;0;X;90":       return tmx;
    default:                    return 0;
  }
}

/* ==========================================================================
   CÁLCULO DE OCUPAÇÃO FUTURA POR ZONA

   Fórmula:
     % Futura (zona) = occPct_zona × (volumeFuturo / volumeAtual)

   Onde volumeAtual e volumeFuturo são AMBOS em veículos/dia.
   - volumeAtual  = campo "Volume Produto Atual (veíc./dia)" preenchido pelo usuário
   - volumeFuturo = slider "Volume Produção Futura" no mapa

   Cada zona tem seu próprio occPct calculado pelo aggregateByZone a partir
   das introduções reais do Excel — por isso o resultado é diferente por zona.
========================================================================== */
function _calcOcupacaoFutura(occPctZona) {
  const volumeAtual  = _state.volumeAtual;
  const volumeFuturo = _state.volumeFuturo;

  // Sem volume atual preenchido → não calcula
  if (!volumeAtual || volumeAtual <= 0) return null;
  // Sem ocupação real da zona → não calcula
  if (occPctZona == null || !Number.isFinite(occPctZona)) return null;

  const fator  = volumeFuturo / volumeAtual;
  const futuro = occPctZona * fator;
  return Math.min(Math.max(futuro, 0), 999); // sem cap artificial — mostra saturação real
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

/* ==========================================================================
   AGREGAÇÃO
========================================================================== */
function aggregateByZone(items, opts = {}) {
  const projFilter = opts.project && _norm(opts.project) !== "TODOS" ? _norm(opts.project) : null;

  let selKey = opts.selectedPeriod ? _periodKey(opts.selectedPeriod) : null;
  if (selKey === null) {
    let max = null;
    for (const it of items || []) { const k = _periodKey(_intro(it)); if (k !== null && (max === null || k > max)) max = k; }
    selKey = max;
  }

  const groups = {};
  for (const z of ZONE_ORDER) {
    groups[z] = { pns: new Set(), details: [], count: 0, curOcc: 0, projOcc: 0, cap: 0, capItems: 0, blocked: 0, dr: 0 };
  }

  for (const it of items || []) {
    const z = _zone(it);
    const g = groups[z];
    if (!g) continue;
    if (projFilter) { const ip = _proj(it); if (ip && _norm(ip) !== projFilter) continue; }

    const pn       = _pn(it);
    const introKey = _periodKey(_intro(it));
    const vol      = _vol(it);
    const blocked  = _blk(it);
    const cap      = _cap(it);
    const dr       = _dr(it);

    if (pn) g.pns.add(pn);
    g.count   += 1;
    g.blocked += blocked;
    g.dr      += dr;
    if (cap > 0) { g.cap += cap; g.capItems++; }

    const visibleInTimeline = selKey === null || introKey === null || introKey <= selKey;
    if (visibleInTimeline && g.details.length < 100 && pn) {
      g.details.push({ pn, desc: _desc(it), pe: _pe(it), zone: _zone(it) || "—",
        volExcel: _num(it, ["cxs_periodo","volC"]),
        volCalc:  _num(it, ["volume_calculado_periodo","calc","cxs_periodo"]),
        intro: _intro(it), introKey });
    }

    if (selKey !== null && introKey !== null) {
      if (introKey < selKey)  g.curOcc  += vol;
      if (introKey <= selKey) g.projOcc += vol;
    } else {
      g.projOcc += vol;
    }
  }

  const result = {};
  for (const zoneName of ZONE_ORDER) {
    const g   = groups[zoneName];
    let cap   = _inputCapacity(zoneName);
    if (cap <= 0 && g.cap > 0) cap = Math.round(g.cap);
    if (cap < 0) cap = null;

    const curOcc  = Math.round(g.curOcc);
    const projOcc = Math.round(Math.max(g.projOcc, curOcc));
    const blocked = Math.round(g.blocked);
    const avail   = cap === null ? null : Math.max(0, cap - projOcc - blocked);

    // occPct é a ocupação REAL desta zona, calculada a partir do Excel
    const occPct  = (cap !== null && cap > 0) ? (projOcc / cap) * 100 : null;
    const sev     = _sev(occPct);

    // Ocupação futura desta zona específica
    const futPct = _calcOcupacaoFutura(occPct);

    const sortedDetails = g.details.slice().sort((a, b) => {
      if (a.introKey == null && b.introKey == null) return 0;
      if (a.introKey == null) return 1;
      if (b.introKey == null) return -1;
      return a.introKey - b.introKey;
    });

    result[zoneName] = {
      name: zoneName, abbr: OVERLAY_ZONES[zoneName].abbr,
      curOcc, projOcc, blocked, avail, cap, occPct,
      futPct,   // <-- ocupação futura individual desta zona
      volIntro:  Math.max(0, projOcc - curOcc),
      count:     g.count,
      pnCount:   g.pns.size,
      details:   sortedDetails,
      capItems:  g.capItems,
      hasCap:    cap !== null && cap > 0,
      sev,
      avgDr:     g.count > 0 ? (g.dr / g.count).toFixed(2) : "0,00",
      selPeriod: opts.selectedPeriod ?? null,
    };
  }
  return result;
}

/* ==========================================================================
   HTML DO POPUP
========================================================================== */
function _tableHtml(details, selPeriod) {
  if (!details?.length) {
    const periodMsg = selPeriod
      ? `Nenhuma peça introduzida até <strong>${selPeriod}</strong> nesta zona.`
      : "Nenhum item classificado nesta zona.";
    return `<p class="zo-popup__no-data">${periodMsg}<br><small>Verifique a coluna <em>storage_zone</em> e <em>introduction_date</em> do Excel.</small></p>`;
  }
  const periodLabel = selPeriod ? ` — introduzidas até ${selPeriod}` : "";
  return `
    <div class="zo-popup__items-title">
      Itens extraídos do Excel
      <span class="zo-popup__items-count">${details.length} peça(s)${periodLabel}</span>
    </div>
    <div class="zo-popup__items-table-wrap">
      <table class="zo-popup__items-table">
        <thead><tr><th>PN</th><th>PE</th><th>Zona</th><th class="num">Vol. Excel</th><th class="num">Vol. Calc.</th><th>Intro</th></tr></thead>
        <tbody>
          ${details.map(r => `
            <tr>
              <td class="pn-cell" title="${r.pn}">${r.pn || "—"}</td>
              <td>${r.pe || "—"}</td>
              <td>${r.zone || "—"}</td>
              <td class="num">${_fmtCx(r.volExcel)}</td>
              <td class="num">${_fmtCx(r.volCalc)}</td>
              <td>${r.intro || "—"}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

function _rowHtml(label, value) {
  return `<div class="zo-popup__row"><span class="zo-popup__row-label">${label}</span><strong class="zo-popup__row-value">${value}</strong></div>`;
}

function _buildPopupHtml(zoneName, m) {
  const cfg    = OVERLAY_ZONES[zoneName];
  const color  = cfg.headerColor;
  const pct    = m.occPct == null ? 0 : Math.min(100, Math.max(0, m.occPct));
  const sevClr = _sevColor(m.sev);
  const period = m.selPeriod ? `Até ${m.selPeriod}` : "Sem filtro de período";

  // Ocupação futura desta zona (já calculada no aggregateByZone)
  const futPct  = m.futPct;
  const futSev  = futPct !== null ? _sev(futPct) : "none";
  const futClr  = _sevColor(futSev);

  const temVolume = _state.volumeAtual > 0;
  const fator     = temVolume ? (_state.volumeFuturo / _state.volumeAtual).toFixed(2) : "—";

  return `
    <div class="zo-popup__header" style="background:${color}">
      <div class="zo-popup__header-text">
        <strong class="zo-popup__zone-name">${zoneName}</strong>
        <span class="zo-popup__zone-sub">${period}</span>
      </div>
      <span class="zo-popup__risk-badge"
        style="background:${m.sev==="high"?"rgba(220,38,38,.18)":m.sev==="medium"?"rgba(217,119,6,.18)":"rgba(22,163,74,.18)"};border-color:${sevClr};color:${sevClr}">
        ${_sevLabel(m.sev)}
      </span>
      <button class="zo-popup__close" type="button" aria-label="Fechar popup">×</button>
    </div>

    <div class="zo-popup__body">

      <!-- BARRA ATUAL -->
      <div class="zo-popup__bar-wrap">
        <div class="zo-popup__bar-track">
          <div class="zo-popup__bar-fill" style="width:${pct.toFixed(1)}%;background:${sevClr}"></div>
          ${pct > 90 ? '<div class="zo-popup__bar-danger-line"></div>' : ""}
        </div>
        <span class="zo-popup__bar-pct">${m.occPct == null ? "s/ cap." : m.occPct.toFixed(1) + "%"}</span>
      </div>

      <!-- BARRA FUTURA (se disponível) -->
      ${futPct !== null ? (() => {
        const futBarPct = Math.min(futPct, 100);
        return `
        <div class="zo-popup__bar-wrap" style="margin-top:4px">
          <div class="zo-popup__bar-track" style="background:#f1f5f9">
            <div class="zo-popup__bar-fill" style="width:${futBarPct.toFixed(1)}%;background:${futClr};opacity:0.7"></div>
            ${futBarPct >= 90 ? '<div class="zo-popup__bar-danger-line"></div>' : ""}
          </div>
          <span class="zo-popup__bar-pct" style="color:${futClr}">${futPct.toFixed(1)}% ↗</span>
        </div>`;
      })() : ""}

      <!-- SEÇÃO OCUPAÇÃO ATUAL -->
      <div class="zo-popup__section-title">Ocupação Atual</div>
      <div class="zo-popup__grid">
        ${_rowHtml("Ocup. atual (cx)",   _fmtCx(m.curOcc))}
        ${_rowHtml("Vol. introduzido",   _fmtCx(m.volIntro))}
        ${_rowHtml("Ocup. projetada (cx)", _fmtCx(m.projOcc))}
        ${_rowHtml("% ocupação atual",   m.occPct == null ? "Sem cap." : m.occPct.toFixed(1) + "%")}
      </div>

      <!-- SEÇÃO PROJEÇÃO FUTURA -->
      <div class="zo-popup__section-title" style="margin-top:10px">
        Projeção Futura
        ${temVolume
          ? `<span style="font-size:9px;font-weight:400;text-transform:none;letter-spacing:0;color:#94a3b8;display:block;margin-top:1px">
              Atual: ${Number(_state.volumeAtual).toLocaleString("pt-BR")} veíc./dia →
              Futuro: ${Number(_state.volumeFuturo).toLocaleString("pt-BR")} veíc./dia
              (fator ${fator}×)
             </span>`
          : `<span style="font-size:9px;font-weight:400;text-transform:none;color:#f59e0b;display:block;margin-top:1px">
              ⚠ Preencha "Volume Produto Atual" para calcular
             </span>`
        }
      </div>
      <div class="zo-popup__grid" style="${futPct !== null ? `border:1.5px dashed ${futClr};border-radius:6px;padding:6px 8px;` : ""}">
        ${futPct !== null
          ? `
            <div class="zo-popup__row">
              <span class="zo-popup__row-label">% Ocup. Futura</span>
              <strong class="zo-popup__row-value" style="color:${futClr};font-size:14px;font-weight:900">${futPct.toFixed(1)}%</strong>
            </div>
            <div class="zo-popup__row">
              <span class="zo-popup__row-label">Risco futuro</span>
              <strong class="zo-popup__row-value" style="color:${futClr}">${_sevLabel(futSev)}</strong>
            </div>
            <div class="zo-popup__row">
              <span class="zo-popup__row-label">Fator de escala</span>
              <strong class="zo-popup__row-value">${fator}×</strong>
            </div>
            <div class="zo-popup__row">
              <span class="zo-popup__row-label">Variação</span>
              <strong class="zo-popup__row-value" style="color:${futClr}">
                ${m.occPct != null ? (futPct - m.occPct > 0 ? "+" : "") + (futPct - m.occPct).toFixed(1) + " pp" : "—"}
              </strong>
            </div>
          `
          : `<p class="zo-popup__no-data" style="margin:0">Informe o Volume Produto Atual (veíc./dia) nos parâmetros para ver a projeção.</p>`
        }
      </div>

      <!-- SEÇÃO CAPACIDADE -->
      <div class="zo-popup__section-title" style="margin-top:10px">Capacidade</div>
      <div class="zo-popup__grid">
        ${_rowHtml("Cap. total",       _fmtMaybe(m.cap))}
        ${_rowHtml("Disponível",       _fmtMaybe(m.avail))}
        ${_rowHtml("Bloqueado",        _fmtCx(m.blocked))}
        ${_rowHtml("Daily Rate médio", m.avgDr)}
      </div>

      <!-- SEÇÃO ITENS -->
      <div class="zo-popup__section-title" style="margin-top:10px">Itens</div>
      <div class="zo-popup__grid">
        ${_rowHtml("Qtde de itens",  m.count)}
        ${_rowHtml("Part Numbers",   m.pnCount)}
        ${_rowHtml("Com capacidade", m.capItems)}
        ${_rowHtml("Risco atual",    _sevLabel(m.sev))}
      </div>

      ${_tableHtml(m.details, m.selPeriod)}
    </div>`;
}

/* ==========================================================================
   POPUP FLUTUANTE
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
  const pw  = popup.offsetWidth  || 340;
  const ph  = popup.offsetHeight || 500;
  const GAP = 8;
  let left = hr.right + GAP;
  let top  = hr.top + hr.height / 2 - ph / 2;
  if (left + pw > vw - GAP) left = hr.left - pw - GAP;
  if (left < GAP)            left = hr.left + hr.width / 2 - pw / 2;
  top  = Math.max(GAP, Math.min(top,  vh - ph - GAP));
  left = Math.max(GAP, Math.min(left, vw - pw - GAP));
  popup.style.left = `${left + window.scrollX}px`;
  popup.style.top  = `${top  + window.scrollY}px`;
}

function _ensureListeners() {
  if (_listenersAttached) return;
  _listenersAttached = true;
  document.addEventListener("click", e => {
    if (e.target.closest(".zo-hotspot") || e.target.closest(".zo-popup-float")) return;
    _closeAllPopups();
  }, { capture: true });
  document.addEventListener("keydown", e => { if (e.key === "Escape") _closeAllPopups(); });
}

/* ==========================================================================
   CRIAÇÃO DO HOTSPOT
========================================================================== */
function _createHotspot(zoneName, cfg, hotspotCfg, m, map) {
  const sevCls = m.sev === "none" ? "low" : m.sev;
  const clr    = _sevColor(m.sev);
  const occLbl = m.occPct == null ? "—" : `${m.occPct.toFixed(0)}%`;

  // Indicador futuro: usa futPct já calculado por zona no aggregateByZone
  const futPct = m.futPct;
  const futClr = futPct !== null ? _sevColor(_sev(futPct)) : null;
  const futLbl = futPct !== null ? `→ ${futPct.toFixed(0)}%` : "";

  const hs = document.createElement("button");
  hs.type      = "button";
  hs.className = `zo-hotspot zo-hotspot--${sevCls}`;
  hs.setAttribute("data-zone-overlay", zoneName);
  hs.setAttribute("aria-label", `${zoneName} — atual ${occLbl}${futLbl ? `, futuro ${futPct.toFixed(0)}%` : ""}`);
  hs.setAttribute("aria-haspopup", "dialog");
  hs.setAttribute("aria-expanded", "false");
  Object.assign(hs.style, { top: hotspotCfg.top, left: hotspotCfg.left, width: hotspotCfg.width, height: hotspotCfg.height });

  const showLabel = hotspotCfg.showLabel !== false;
  hs.innerHTML = showLabel ? `
    <span class="zo-hs__name">${zoneName}</span>
    <span class="zo-hs__rate">${occLbl}</span>
    ${futLbl ? `<span class="zo-hs__future" style="color:${futClr}">${futLbl}</span>` : ""}
    <span class="zo-hs__dot" style="background:${clr}" aria-hidden="true"></span>`
  : `<span class="sr-only">${zoneName} — ${occLbl}</span>`;

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
      popup.className = `zo-popup-float zo-popup zo-popup--${sevCls}`;
      popup.setAttribute("role", "dialog");
      popup.setAttribute("aria-label", `Detalhes — ${zoneName}`);
      popup.setAttribute("aria-modal", "true");
      popup.innerHTML = _buildPopupHtml(zoneName, m);
      document.body.appendChild(popup);
      _activePopupEl = popup;
      requestAnimationFrame(() => _positionPopup(popup, hs));
      popup.querySelector(".zo-popup__close")?.addEventListener("click", e => { e.stopPropagation(); _closeAllPopups(); });
      popup.addEventListener("click", e => e.stopPropagation());
    }
  });
  hs.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); hs.click(); } });
  map.appendChild(hs);
}

/* ==========================================================================
   BADGES RODAPÉ — mostra atual → futuro por zona
========================================================================== */
function _syncBadges(agg) {
  const cont = document.getElementById("warehouseTriggerBadges");
  if (!cont) return;
  cont.innerHTML = ZONE_ORDER.map(z => {
    const m      = agg[z];
    const pct    = m?.occPct;
    const futPct = m?.futPct;
    const sev    = _sev(pct);
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
    const hotspots = cfg.hotspots || (cfg.hotspot ? [cfg.hotspot] : []);
    hotspots.forEach((hotspotCfg) => _createHotspot(zoneName, cfg, hotspotCfg, agg[zoneName], map));
  }

  _syncBadges(agg);
  return agg;
}

/* ==========================================================================
   setOverlayContext — aceita volumeAtual e volumeFuturo em veículos/dia
========================================================================== */
function setOverlayContext(ctx = {}) {
  _state.selectedPeriod  = ctx.selectedPeriod  ?? _state.selectedPeriod;
  _state.selectedProject = (ctx.project && _norm(ctx.project) !== "TODOS") ? ctx.project : _state.selectedProject;
  _state.thresholdMedium = +ctx.thresholdMedium || _state.thresholdMedium;
  _state.thresholdHigh   = +ctx.thresholdHigh   || _state.thresholdHigh;
  // Ambos em veículos/dia
  if (ctx.volumeAtual  != null) _state.volumeAtual  = +ctx.volumeAtual;
  if (ctx.volumeFuturo != null) _state.volumeFuturo = +ctx.volumeFuturo;
}

function getOverlayContext() { return { ..._state }; }

/* ==========================================================================
   CSS INJETADO — estilos extras para projeção futura
========================================================================== */
(function _injectStyles() {
  if (document.getElementById("zo-future-styles")) return;
  const s = document.createElement("style");
  s.id = "zo-future-styles";
  s.textContent = `
    .zo-hs__future {
      display: inline-block;
      font-size: 11px;
      font-weight: 900;
      background: rgba(255,255,255,.88);
      border: 1px solid rgba(255,255,255,.95);
      border-radius: 4px;
      padding: 1px 5px;
      margin-top: 1px;
      box-shadow: 0 1px 3px rgba(15,23,42,.18);
    }
    .zo-hs__name, .zo-hs__rate {
      background: rgba(255,255,255,.88);
      border: 1px solid rgba(255,255,255,.95);
      border-radius: 5px;
      padding: 2px 6px;
      text-shadow: none;
      box-shadow: 0 1px 4px rgba(15,23,42,.18);
    }
    .zo-hs__name { font-size: 11px; font-weight: 900; color: #001533; }
    .zo-hs__rate { font-size: 15px; line-height: 1; color: #001533; }
    .wh-trigger-badge { white-space: nowrap; }
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