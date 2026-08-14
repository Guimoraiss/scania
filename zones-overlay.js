"use strict";

/* ==========================================================================
   LCB Capacity Analytics — zones-overlay.js (v7)

   MUDANÇAS v7 (sobre v6):
   ✔ Posições dos hotspots recalibradas com base nas demarcações reais (print 2)
   ✔ Blue Box Individual: faixa horizontal estreita ABAIXO do Blue Box Pallet
   ✔ T;M;4;0;X;90: bloco na coluna direita, logo ABAIXO do Blocado
   ✔ Zonas são 100% independentes — não há risco de mistura entre elas
   ✔ _classifyZone com ordem segura: BBI antes de BBP, TM40X90 antes de Blocado
========================================================================== */

/* --------------------------------------------------------------------------
   MAPA DE ZONAS — posições em % relativas ao warehouse-map
   Calibradas sobre as demarcações verdes/vermelhas da imagem de referência

   Layout visual (imagem 2):
   ┌──────────┬──────────────────────────────────────┬────────────┐
   │          │         BASE 10   (top 9–34%)         │            │
   │  área    ├──────────────────────────────────────┤  BLOCADO   │
   │  esq.    │         BASE 20   (top 34–57%)        │  (9–57%)   │
   │          ├──────────────────┬───────────────────┼────────────┤
   │          │  BLUE BOX PALLET │                   │ T;M;4;0;   │
   │          │   (57–82%)       │                   │ X;90       │
   │          ├──────────────────┤                   │ (57–82%)   │
   │          │  BLUE BOX INDIV. │                   │            │
   │          │   (82–93%)       │                   │            │
   └──────────┴──────────────────┴───────────────────┴────────────┘
-------------------------------------------------------------------------- */
const OVERLAY_ZONES = {
  "Base 10": {
  id: "base10",
  label: "Base 10",
  abbr: "B10",
  headerColor: "#1a4d8f",
  defaultCapacity: 68000,
  defaultOcc: 82,
  hotspots: [
    {
      top: "10.30%", left: "27.35%", width: "49.95%", height: "25.20%", showLabel: true
    },
  ],
},

"Base 20": {
  id: "base20",
  label: "Base 20",
  abbr: "B20",
  headerColor: "#1a4d8f",
  defaultCapacity: 55200,
  defaultOcc: 79,
  hotspots: [
    {
      top: "36.40%", left: "27.22%", width: "50.39%", height: "20.82%", showLabel: true
    },
  ],
},
  "Blue Box Pallet": {
    id: "bbpallet",
    label: "Blue Box Pallet",
    abbr: "BBP",
    headerColor: "#0e7490",
    defaultCapacity: 16_000,
    defaultOcc: 74,
    hotspots: [
      // Bloco azul/verde central — da metade até ~82% vertical, esquerda central
      { top: "58.00%", left: "23.50%", width: "25.50%", height: "23.00%", showLabel: true },
    ],
  },
  "Blocado": {
  id: "blocado",
  label: "Blocado",
  abbr: "BL",
  headerColor: "#7c3aed",
  defaultCapacity: 19800,
  defaultOcc: 45,
  hotspots: [
    {
      top: "7.10%",
      left: "77.95%",
      width: "16.10%",
      height: "40.40%",
      showLabel: true
    },
  ],
},

  // ── NOVAS ZONAS v7 — posições recalibradas ────────────────────────────────

 "Blue Box Individual": {
  id: "bbindividual",
  label: "Blue Box Individual",
  abbr: "BBI",
  headerColor: "#0f766e",
  defaultCapacity: 4_200,
  defaultOcc: 55,
  hotspots: [
    // abaixado um pouco e mais alinhado com o contorno vermelho
    { top: "84.20%", left: "24.10%", width: "24.20%", height: "4.80%", showLabel: true },
  ],
},

"T;M;4;0;X;90": {
  id: "tm40x90",
  label: "T;M;4;0;X;90",
  abbr: "TM",
  headerColor: "#b91c1c",
  defaultCapacity: 8000,
  defaultOcc: 30,
  hotspots: [
    {
      top: "48.50%", left: "77.90%", width: "16.10%", height: "8.10%", showLabel: true
    },
  ],
},
};

/* --------------------------------------------------------------------------
   ZONE_ORDER — ordem de renderização e iteração
-------------------------------------------------------------------------- */
const ZONE_ORDER = [
  "Base 10",
  "Base 20",
  "Blue Box Pallet",
  "Blocado",
  "Blue Box Individual",
  "T;M;4;0;X;90",
];

/* Estado interno */
const _state = {
  selectedPeriod:  null,
  selectedProject: null,
  thresholdMedium: 70,
  thresholdHigh:   90,
};

let _listenersAttached = false;
let _activeZoneName    = null;
let _activeHotspotEl   = null;

/* ==========================================================================
   UTILS
========================================================================== */

function _strip(v) {
  return String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function _norm(v) {
  return _strip(v).trim().replace(/\s+/g, " ").toUpperCase();
}

function _compact(v) {
  return _norm(v).replace(/\s+/g, "");
}

function _txt(item, keys) {
  for (const k of keys) {
    const v = item?.[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return "";
}

function _num(item, keys) {
  for (const k of keys) {
    const n = Number(item?.[k]);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function _fmtCx(v) {
  return `${Number(v ?? 0).toLocaleString("pt-BR")} cx`;
}

function _fmtMaybe(v) {
  if (v == null) return "Não informado";
  const n = Number(v);
  return Number.isFinite(n) ? _fmtCx(n) : "Não informado";
}

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

  const d = new Date(s);
  if (!isNaN(d)) return d.getFullYear() * 12 + d.getMonth() + 1;
  return null;
}

/* ==========================================================================
   CLASSIFICAÇÃO DE ZONA
   Ordem importa:
   1. Blue Box Individual ANTES de Blue Box Pallet (para não fazer match errado)
   2. T;M;4;0;X;90 ANTES de Blocado (fix: TM40X90 não pode cair em Blocado)
========================================================================== */

function _classifyZone(raw) {
  const c = _compact(raw ?? "");
  if (!c) return null;

  // Porta Pallets simples (sem prefixo Blue Box)
  // "Base 10" e "Base 20" puros — não podem ter "BLUEBOX" antes
  if (/^BASE10$|^BASE_10$|^BASE-10$|^PORTAPALLET$/.test(c))    return "Base 10";
  if (/^BASE20$|^BASE_20$|^BASE-20$/.test(c))                   return "Base 20";

  // Blue Box — Individual ANTES de qualquer outro Blue Box
  if (/BLUEBOXINDIVIDUAL|BBINDIVIDUAL|BB_INDIVIDUAL/.test(c))   return "Blue Box Individual";

  // Blue Box Pallet = "Blue Box Base 10" + "Blue Box Base 20" + "Blue Box Pallet" genérico
  if (/BLUEBOXBASE10|BLUEBOXBASE_10|BLUEBOXB10/.test(c))        return "Blue Box Pallet";
  if (/BLUEBOXBASE20|BLUEBOXBASE_20|BLUEBOXB20/.test(c))        return "Blue Box Pallet";
  if (/BLUEBOXPALLET|BBPALLET|BB_PALLET/.test(c))               return "Blue Box Pallet";

  // T;M;4;0;X;90 — ANTES de Blocado
  if (
    /TM40X90|TM4\.0X90/.test(c) ||
    raw?.trim() === "T;M;4;0;X;90"
  )                                                               return "T;M;4;0;X;90";

  // Blocado — apenas após descartar T;M;4;0;X;90
  if (/BLOCADO|BLOQUEADO/.test(c))                              return "Blocado";

  return null;
}

function classifyZone(raw) { return _classifyZone(raw); }

/* Getters de campos do item */
const _zone  = i => _classifyZone(_txt(i, ["storage_zone","storageZone","zona","zone","local_armazenagem"]));
const _proj  = i => _txt(i, ["projeto","project","project_name","projectName"]);
const _pn    = i => _txt(i, ["part_number","pn","partNumber","PN"]);
const _desc  = i => _txt(i, ["descricao","desc","description","DESCRICAO"]);
const _pe    = i => _txt(i, ["pe","PE","pckg_type","pckgType"]);
const _intro = i => _txt(i, ["introduction_date","introductionDate","intro_date","introDate","data_intro"]);
const _vol   = i => _num(i, ["volume_calculado_periodo","calc","cxs_periodo","volC","volume_contratado","volume"]);
const _cap   = i => {
  const d = _num(i, ["capacity","capacidade","total_slots","slots_total","capacidade_total"]);
  if (d > 0) return d;
  return _num(i, ["volume_contratado","volumeContratado","volC"]);
};
const _blk   = i => _num(i, ["bloqueado","blocked","slots_bloqueados","bloq_code"]);
const _dr    = i => _num(i, ["daily_rate","dailyRate","dr","DR"]);

/* --------------------------------------------------------------------------
   Capacidade padrão por zona — fallback quando o Excel não informa
-------------------------------------------------------------------------- */
function _inputCapacity(zoneName) {
  const pp = +document.getElementById("caCapPortaPallets")?.value || 0;
  const bl = +document.getElementById("caCapBlocado")?.value      || 0;
  const bb = +document.getElementById("caCapBlueBox")?.value      || 0;
  switch (zoneName) {
    case "Base 10":             return Math.round(pp / 2) || OVERLAY_ZONES["Base 10"].defaultCapacity;
    case "Base 20":             return Math.round(pp / 2) || OVERLAY_ZONES["Base 20"].defaultCapacity;
    case "Blue Box Pallet":     return bb || OVERLAY_ZONES["Blue Box Pallet"].defaultCapacity;
    case "Blue Box Individual": return OVERLAY_ZONES["Blue Box Individual"].defaultCapacity;
    case "Blocado":             return bl || OVERLAY_ZONES["Blocado"].defaultCapacity;
    case "T;M;4;0;X;90":       return OVERLAY_ZONES["T;M;4;0;X;90"].defaultCapacity;
    default:                    return 0;
  }
}

/* ==========================================================================
   AGREGAÇÃO
========================================================================== */

function aggregateByZone(items, opts = {}) {
  const projFilter = opts.project && _norm(opts.project) !== "TODOS"
    ? _norm(opts.project) : null;

  let selKey = opts.selectedPeriod ? _periodKey(opts.selectedPeriod) : null;
  if (selKey === null) {
    let max = null;
    for (const it of items || []) {
      const k = _periodKey(_intro(it));
      if (k !== null && (max === null || k > max)) max = k;
    }
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

    if (projFilter) {
      const ip = _proj(it);
      if (ip && _norm(ip) !== projFilter) continue;
    }

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
      g.details.push({
        pn, desc: _desc(it), pe: _pe(it), zone: _zone(it) || "—",
        volExcel: _num(it, ["cxs_periodo","volC"]),
        volCalc:  _num(it, ["volume_calculado_periodo","calc","cxs_periodo"]),
        intro:    _intro(it),
        introKey,
      });
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
    const g    = groups[zoneName];
    let   cap  = g.cap > 0 ? Math.round(g.cap) : _inputCapacity(zoneName);
    if (!cap || cap < 0) cap = null;

    const curOcc   = Math.round(g.curOcc);
    const projOcc  = Math.round(Math.max(g.projOcc, curOcc));
    const blocked  = Math.round(g.blocked);
    const avail    = cap === null ? null : Math.max(0, cap - projOcc - blocked);
    const occPct   = cap === null ? null : (projOcc / cap) * 100;
    const sev      = _sev(occPct);

    const sortedDetails = g.details.slice().sort((a, b) => {
      if (a.introKey == null && b.introKey == null) return 0;
      if (a.introKey == null) return 1;
      if (b.introKey == null) return -1;
      return a.introKey - b.introKey;
    });

    result[zoneName] = {
      name: zoneName, abbr: OVERLAY_ZONES[zoneName].abbr,
      curOcc, projOcc, blocked, avail, cap, occPct,
      volIntro:   Math.max(0, projOcc - curOcc),
      count:      g.count,
      pnCount:    g.pns.size,
      details:    sortedDetails,
      capItems:   g.capItems,
      hasCap:     cap !== null,
      sev,
      avgDr:      g.count > 0 ? (g.dr / g.count).toFixed(2) : "0,00",
      selPeriod:  opts.selectedPeriod ?? null,
    };
  }
  return result;
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

  return `
    <div class="zo-popup__header" style="background:${color}">
      <div class="zo-popup__header-text">
        <strong class="zo-popup__zone-name">${zoneName}</strong>
        <span class="zo-popup__zone-sub">${period}</span>
      </div>
      <span class="zo-popup__risk-badge"
        style="background:${m.sev === "high" ? "rgba(220,38,38,.18)" : m.sev === "medium" ? "rgba(217,119,6,.18)" : "rgba(22,163,74,.18)"};
               border-color:${sevClr};color:${sevClr}">
        ${_sevLabel(m.sev)}
      </span>
      <button class="zo-popup__close" type="button" aria-label="Fechar popup">×</button>
    </div>

    <div class="zo-popup__body">
      <div class="zo-popup__bar-wrap">
        <div class="zo-popup__bar-track">
          <div class="zo-popup__bar-fill" style="width:${pct.toFixed(1)}%;background:${sevClr}"></div>
          ${pct > 90 ? '<div class="zo-popup__bar-danger-line"></div>' : ""}
        </div>
        <span class="zo-popup__bar-pct">${m.occPct == null ? "s/ cap." : m.occPct.toFixed(1) + "%"}</span>
      </div>

      <div class="zo-popup__section-title">Ocupação</div>
      <div class="zo-popup__grid">
        ${_rowHtml("Ocup. atual",      _fmtCx(m.curOcc))}
        ${_rowHtml("Vol. introduzido", _fmtCx(m.volIntro))}
        ${_rowHtml("Ocup. projetada",  _fmtCx(m.projOcc))}
        ${_rowHtml("% ocupação",       m.occPct == null ? "Sem cap." : m.occPct.toFixed(1) + "%")}
      </div>

      <div class="zo-popup__section-title">Capacidade</div>
      <div class="zo-popup__grid">
        ${_rowHtml("Cap. total",       _fmtMaybe(m.cap))}
        ${_rowHtml("Disponível",       _fmtMaybe(m.avail))}
        ${_rowHtml("Bloqueado",        _fmtCx(m.blocked))}
        ${_rowHtml("Daily Rate médio", m.avgDr)}
      </div>

      <div class="zo-popup__section-title">Itens</div>
      <div class="zo-popup__grid">
        ${_rowHtml("Qtde de itens",  m.count)}
        ${_rowHtml("Part Numbers",   m.pnCount)}
        ${_rowHtml("Com capacidade", m.capItems)}
        ${_rowHtml("Risco",          _sevLabel(m.sev))}
      </div>

      ${_tableHtml(m.details, m.selPeriod)}
    </div>`;
}

/* ==========================================================================
   POPUP FLUTUANTE — montado no <body> para escapar do overflow:hidden do mapa
========================================================================== */

let _activePopupEl = null;

function _removeFloatingPopup() {
  if (_activePopupEl) {
    _activePopupEl.remove();
    _activePopupEl = null;
  }
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
  const pw  = popup.offsetWidth  || 320;
  const ph  = popup.offsetHeight || 440;
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

/* ==========================================================================
   LISTENERS GLOBAIS
========================================================================== */

function _ensureListeners() {
  if (_listenersAttached) return;
  _listenersAttached = true;

  document.addEventListener("click", e => {
    if (e.target.closest(".zo-hotspot") || e.target.closest(".zo-popup-float")) return;
    _closeAllPopups();
  }, { capture: true });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") _closeAllPopups();
  });
}

/* ==========================================================================
   CRIAÇÃO DO HOTSPOT
========================================================================== */

function _createHotspot(zoneName, cfg, hotspotCfg, m, map, hotspotIndex = 0) {
  const sevCls = m.sev === "none" ? "low" : m.sev;
  const clr    = _sevColor(m.sev);
  const occLbl = m.occPct == null ? "—" : `${m.occPct.toFixed(0)}%`;

  const hs = document.createElement("button");
  hs.type      = "button";
  hs.className = `zo-hotspot zo-hotspot--${sevCls}`;
  hs.setAttribute("data-zone-overlay", zoneName);
  hs.setAttribute("aria-label",    `${zoneName} — ${m.occPct == null ? "capacidade não informada" : `ocupação ${m.occPct.toFixed(1)}%`}`);
  hs.setAttribute("aria-haspopup", "dialog");
  hs.setAttribute("aria-expanded", "false");

  Object.assign(hs.style, {
    top:    hotspotCfg.top,
    left:   hotspotCfg.left,
    width:  hotspotCfg.width,
    height: hotspotCfg.height,
  });

  const showLabel = hotspotCfg.showLabel !== false;
  hs.innerHTML = showLabel ? `
    <span class="zo-hs__name">${zoneName}</span>
    <span class="zo-hs__rate">${occLbl}</span>
    <span class="zo-hs__dot" style="background:${clr}" aria-hidden="true"></span>` : `
    <span class="sr-only">${zoneName} — ${occLbl}</span>`;

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
      popup.setAttribute("role",       "dialog");
      popup.setAttribute("aria-label", `Detalhes — ${zoneName}`);
      popup.setAttribute("aria-modal", "true");
      popup.innerHTML = _buildPopupHtml(zoneName, m);
      document.body.appendChild(popup);
      _activePopupEl = popup;

      requestAnimationFrame(() => {
        _positionPopup(popup, hs);
      });

      popup.querySelector(".zo-popup__close")?.addEventListener("click", e => {
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
    const m   = agg[z];
    const pct = m?.occPct;
    const sev = _sev(pct);
    const cls = sev === "high" ? "critical" : sev === "medium" ? "warning" : "ok";
    return `<span class="wh-trigger-badge wh-trigger-badge--${cls}">
      ${OVERLAY_ZONES[z].abbr} · ${pct == null ? "—" : Math.round(pct) + "%"}
    </span>`;
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
  _state.selectedProject = (opts.project && _norm(opts.project) !== "TODOS")
    ? opts.project : _state.selectedProject;

  let items = [];
  if (Array.isArray(source))  items = source;
  else if (source?.itens)     items = source.itens;
  else if (source?.items)     items = source.items;
  else if (source?.rows)      items = source.rows;
  else {
    const lr = window.lcbApi?.getLastResult?.();
    if (lr?.itens) items = lr.itens;
  }

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
    hotspots.forEach((hotspotCfg, index) => {
      _createHotspot(zoneName, cfg, hotspotCfg, agg[zoneName], map, index);
    });
  }

  _syncBadges(agg);
  return agg;
}

function setOverlayContext(ctx = {}) {
  _state.selectedPeriod  = ctx.selectedPeriod  ?? _state.selectedPeriod;
  _state.selectedProject = (ctx.project && _norm(ctx.project) !== "TODOS")
    ? ctx.project : _state.selectedProject;
  _state.thresholdMedium = +ctx.thresholdMedium || _state.thresholdMedium;
  _state.thresholdHigh   = +ctx.thresholdHigh   || _state.thresholdHigh;
}

function getOverlayContext() { return { ..._state }; }

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
  periodKey:  _periodKey,
  closeAll:   _closeAllPopups,
};