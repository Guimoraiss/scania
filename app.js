"use strict";

/* =========================================================================
   CONSTANTES GLOBAIS
========================================================================= */

const PERIODS = [
  "JAN/2026","FEV/2026","MAR/2026","ABR/2026",
  "MAI/2026","JUN/2026","JUL/2026","AGO/2026",
  "SET/2026","OUT/2026","NOV/2026","DEZ/2026",
  "JAN/2027","FEV/2027","MAR/2027","ABR/2027",
  "MAI/2027","JUN/2027","JUL/2027","AGO/2027",
  "SET/2027","OUT/2027","NOV/2027","DEZ/2027",
  "JAN/2028","FEV/2028","MAR/2028","ABR/2028",
  "MAI/2028","JUN/2028","JUL/2028","AGO/2028",
  "SET/2028","OUT/2028","NOV/2028","DEZ/2028",
  "JAN/2029","FEV/2029","MAR/2029","ABR/2029",
  "MAI/2029","JUN/2029","JUL/2029","AGO/2029",
  "SET/2029","OUT/2029","NOV/2029","DEZ/2029",
  "JAN/2030","FEV/2030","MAR/2030","ABR/2030",
  "MAI/2030","JUN/2030","JUL/2030","AGO/2030",
  "SET/2030","OUT/2030","NOV/2030","DEZ/2030",
];

const STATUS_THRESHOLD = { WARNING: 80, CRITICAL: 90 };
const LOCALE = "pt-BR";

/* =========================================================================
   ZONE_DATA — zonas reais do LCB (v7.3: bbpallet → bbpalletb10 + bbpalletb20)
========================================================================= */
const ZONE_DATA = {
  base10: {
    name:     "BASE 10",
    baseOcc:  82,
    capacity: 37_400,
    note:     "Armazenamento em pallet racks verticais — setor superior (BASE 10).",
    color:    "#4c1d95",
  },
  base20: {
    name:     "BASE 20",
    baseOcc:  79,
    capacity: 30_600,
    note:     "Armazenamento em pallet racks verticais — setor inferior (BASE 20).",
    color:    "#5b21b6",
  },
  blocado: {
    name:     "BLOCADO",
    baseOcc:  45,
    capacity: 19_800,
    note:     "Peças bloqueadas aguardando liberação de qualidade ou fiscal.",
    color:    "#6b21a8",
  },
  embalagem: {
    name:     "EMBALAGEM",
    baseOcc:  60,
    capacity: 8_400,
    note:     "Estação de embalagem e preparo de peças para envio.",
    color:    "#166534",
  },
  recebimento: {
    name:     "RECEBIMENTO",
    baseOcc:  38,
    capacity: 9_600,
    note:     "Dock de recebimento e conferência de materiais.",
    color:    "#1e40af",
  },
  bbpalletb10: {
    name:     "BLUE BOX BASE 10",
    baseOcc:  74,
    capacity: 8_000,
    note:     "Armazenamento de blue boxes em pallets — Base 10.",
    color:    "#0e7490",
  },
  bbpalletb20: {
    name:     "BLUE BOX BASE 20",
    baseOcc:  74,
    capacity: 8_000,
    note:     "Armazenamento de blue boxes em pallets — Base 20.",
    color:    "#0891b2",
  },
  bbindividual: {
    name:     "BLUE BOX INDIVIDUAL",
    baseOcc:  55,
    capacity: 4_200,
    note:     "Estoque de blue boxes individuais prontas para uso na linha.",
    color:    "#0f766e",
  },
  tmx: {
    name:     "T;M;4;0;X;90",
    baseOcc:  30,
    capacity: 0,
    note:     "Zona de armazenagem T;M;4;0;X;90.",
    color:    "#b45309",
  },
  expedicao: {
    name:     "EXPEDIÇÃO",
    baseOcc:  68,
    capacity: 22_000,
    note:     "Área de triagem e expedição de caixas para a produção.",
    color:    "#92400e",
  },
  kd: {
    name:     "KD",
    baseOcc:  50,
    capacity: 5_600,
    note:     "Kits de peças pré-montados para consumo direto na linha de produção.",
    color:    "#1d4ed8",
  },
  im: {
    name:     "I&M",
    baseOcc:  30,
    capacity: 3_200,
    note:     "Inspeção de qualidade e manutenção de embalagens retornáveis.",
    color:    "#991b1b",
  },
};

/* Posições SVG de cada zona (viewBox 1200×760) */
const ZONE_LAYOUT = {
  embalagem:    { x: 6,   y: 6,   w: 194, h: 594 },
  recebimento:  { x: 6,   y: 600, w: 124, h: 132 },
  base10:       { x: 200, y: 6,   w: 808, h: 300 },
  base20:       { x: 200, y: 306, w: 808, h: 248 },
  blocado:      { x: 1008, y: 6,  w: 226, h: 560 },
  bbpalletb10:  { x: 130, y: 554, w: 422, h: 65  },
  bbpalletb20:  { x: 130, y: 619, w: 422, h: 65  },
  bbindividual: { x: 130, y: 684, w: 422, h: 50  },
  tmx:          { x: 552, y: 306, w: 456, h: 248 },
  expedicao:    { x: 552, y: 554, w: 456, h: 180 },
  kd:           { x: 1008, y: 566, w: 226, h: 80 },
  im:           { x: 1008, y: 646, w: 226, h: 88 },
};

const CHART_LABELS = ["Jan/26","Fev/26","Mar/26","Abr/26","Mai/26","Jun/26","Jul/26","Ago/26","Set/26","Out/26","Nov/26","Dez/26"];

const PROJECTS = [
  { id: "todos",      label: "Todos",      color: "#475569" },
  { id: "china",      label: "China",      color: "#123b70" },
  { id: "europa",     label: "Europa",     color: "#0e7490" },
  { id: "bev",        label: "BEV",        color: "#16a34a" },
  { id: "powertrain", label: "Powertrain", color: "#7c3aed" },
];

const ICONS = {
  boxes:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`,
  shield:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  users:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  trending: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,
  check:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  alert:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  percent:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  lock:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  layers:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
  cube:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>`,
};

/* =========================================================================
   ESTADO
========================================================================= */
const State = {
  periodIndex:         0,
  productionVolume:    75,
  currentPage:         "analise",
  selectedProject:     "todos",
  selectedProjectName: "",
  lastResult:          null,
  lastRows:            [],
  hasRealData:         false,
};

let _caChart      = null;
let _donutChart   = null;
let _calcListenerAttached = false;

/* =========================================================================
   HELPERS
========================================================================= */
const fmt = {
  int:   (v) => Number(v).toLocaleString(LOCALE),
  dec:   (v) => Number(v).toFixed(1).replace(".", ","),
  pct:   (v) => `${Math.round(v)}%`,
  boxes: (v) => `${fmt.int(v)} cx`,
};

function statusByRate(rate) {
  if (rate >= STATUS_THRESHOLD.CRITICAL) return "critical";
  if (rate >= STATUS_THRESHOLD.WARNING)  return "warning";
  return "ok";
}

function el(id)  { return document.getElementById(id); }
function qs(sel) { return document.querySelector(sel); }

function formatTimestamp() {
  const now = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

/* =========================================================================
   SINCRONIZA ZONE_DATA COM OS CAMPOS DE CAPACIDADE DIGITADOS (v7.3)
========================================================================= */
function syncZoneCapacitiesFromInputs() {
  const capBlocado           = Number(el("caCapBlocado")?.value)           || 0;
  const capPortaPalletsB10   = Number(el("caCapPortaPalletsB10")?.value)   || 0;
  const capPortaPalletsB20   = Number(el("caCapPortaPalletsB20")?.value)   || 0;
  const capBlueBoxB10        = Number(el("caCapBlueBoxB10")?.value)        || 0;
  const capBlueBoxB20        = Number(el("caCapBlueBoxB20")?.value)        || 0;
  const capBlueBoxIndividual = Number(el("caCapBlueBoxIndividual")?.value) || 0;
  const capTMX               = Number(el("caCapTMX")?.value)               || 0;

  ZONE_DATA.base10.capacity       = capPortaPalletsB10;
  ZONE_DATA.base20.capacity       = capPortaPalletsB20;
  ZONE_DATA.blocado.capacity      = capBlocado;
  ZONE_DATA.bbpalletb10.capacity  = capBlueBoxB10;
  ZONE_DATA.bbpalletb20.capacity  = capBlueBoxB20;
  ZONE_DATA.bbindividual.capacity = capBlueBoxIndividual;
  ZONE_DATA.tmx.capacity          = capTMX;
}

/* =========================================================================
   HELPER — lê os valores de projeção futura dos inputs e repassa ao overlay
========================================================================= */
function _syncFutureVolumeContext() {
  const currentOcc  = Number(el("caCurrentOccupation")?.value) || 0;
  const volumeAtual = Number(el("caVolumeFuturo")?.value)      || 0;
  const volumeFut   = Number(el("productionVolume")?.value)    || 0;

  window.lcbZonesOverlay?.setOverlayContext?.({
    currentOcc,
    volumeAtual,
    volumeFuturo: volumeFut,
  });
}

/* =========================================================================
   NAVEGAÇÃO SPA
========================================================================= */
function showPage(page) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("screen--active"));
  const target = el(`screen-${page}`);
  if (target) target.classList.add("screen--active");

  document.querySelectorAll(".nav-link").forEach(link => {
    const isActive = link.dataset.page === page;
    link.classList.toggle("active", isActive);
    if (isActive) link.setAttribute("aria-current", "page");
    else          link.removeAttribute("aria-current");
  });

  if (window.innerWidth <= 768) {
    const shell = el("app");
    if (shell.classList.contains("sidebar-open")) {
      shell.classList.remove("sidebar-open");
      el("sidebarOverlay")?.classList.remove("active");
      el("menuToggle")?.setAttribute("aria-expanded", "false");
    }
  }

  if (page === "analise" && _caChart)    setTimeout(() => _caChart.resize(), 200);
  if (page === "analise" && _donutChart) setTimeout(() => _donutChart.resize(), 200);

  State.currentPage = page;
}

/* =========================================================================
   SIDEBAR / MENU
========================================================================= */
function initMenu() {
  const menuToggle     = el("menuToggle");
  const sidebarOverlay = el("sidebarOverlay");
  const shell          = el("app");
  if (!menuToggle) return;

  menuToggle.addEventListener("click", () => {
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      const isOpen = shell.classList.toggle("sidebar-open");
      sidebarOverlay?.classList.toggle("active", isOpen);
      menuToggle.setAttribute("aria-expanded", String(isOpen));
    } else {
      const isCollapsed = shell.classList.toggle("sidebar-collapsed");
      menuToggle.setAttribute("aria-expanded", String(!isCollapsed));
      setTimeout(() => {
        if (_caChart)    _caChart.resize();
        if (_donutChart) _donutChart.resize();
      }, 300);
    }
  });

  sidebarOverlay?.addEventListener("click", () => {
    shell.classList.remove("sidebar-open");
    sidebarOverlay.classList.remove("active");
    menuToggle.setAttribute("aria-expanded", "false");
  });

  document.querySelectorAll(".nav-link").forEach(link => {
    link.addEventListener("click", e => {
      e.preventDefault();
      const page = link.dataset.page;
      if (page) showPage(page);
    });
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 768 && shell.classList.contains("sidebar-open")) {
      shell.classList.remove("sidebar-open");
      sidebarOverlay?.classList.remove("active");
    }
    if (_caChart)    _caChart.resize();
    if (_donutChart) _donutChart.resize();
  });
}

/* =========================================================================
   TIMELINE — quarter helpers
========================================================================= */
const _MONTH_TO_NUM = {
  JAN:1,FEV:2,MAR:3,ABR:4,MAI:5,JUN:6,
  JUL:7,AGO:8,SET:9,OUT:10,NOV:11,DEZ:12,
};

function periodToQuarterLabel(period) {
  const [mon, year] = period.split("/");
  const m = _MONTH_TO_NUM[mon] ?? 1;
  const q = m <= 3 ? 1 : m <= 6 ? 2 : m <= 9 ? 3 : 4;
  return `Q${q}/${year}`;
}

function renderTimelineTicks() {
  const rangeEl = el("timelineRange");
  const wrapEl  = el("sliderTicksWrap");
  if (!rangeEl) return;

  rangeEl.max = PERIODS.length - 1;

  if (!wrapEl) return;

  const total = PERIODS.length;
  const ticks = [];

  PERIODS.forEach((p, i) => {
    const [mon] = p.split("/");
    const m = _MONTH_TO_NUM[mon] ?? 1;
    if (m !== 1 && m !== 4 && m !== 7 && m !== 10) return;
    const pct = (i / (total - 1)) * 100;
    const label = periodToQuarterLabel(p);
    ticks.push({ pct, label, i });
  });

  wrapEl.innerHTML = ticks.map(({ pct, label }) => `
    <span class="timeline-tick" style="left:${pct}%">
      <span class="timeline-tick__mark"></span>
      <span class="timeline-tick__label">${label}</span>
    </span>`).join("");
}

/* =========================================================================
   MAPA — controles inline (timeline + produção)
========================================================================= */
function initMapControls() {
  el("timelineRange")?.addEventListener("input", e => {
    State.periodIndex = Number(e.target.value);
    renderSliderProgress(State.periodIndex);

    const periodLabel = el("selectedPeriod");
    if (periodLabel) {
      periodLabel.textContent = PERIODS[State.periodIndex];
    }

    if (State.hasRealData && State.lastResult) {
      syncWarehouseFromResult(State.lastResult);
    } else {
      updateWarehouseSimulated();
    }
  });

  el("productionVolume")?.addEventListener("input", e => {
    const v = Number(e.target.value);
    State.productionVolume = Number.isFinite(v) && v >= 0 ? v : 0;
    // Repassa volume futuro ao overlay ao mudar o slider
    _syncFutureVolumeContext();
    if (State.hasRealData && State.lastResult) {
      syncWarehouseFromResult(State.lastResult);
    } else {
      updateWarehouseSimulated();
    }
  });

  el("modalClose")?.addEventListener("click", () => el("zoneModal")?.close());
  el("zoneModal")?.addEventListener("click", e => {
    if (e.target === el("zoneModal")) el("zoneModal").close();
  });

  Tooltip.init();
  renderTimelineTicks();
  renderSliderProgress(State.periodIndex);
}

/* =========================================================================
   WAREHOUSE TRIGGER BADGES (v7.3)
========================================================================= */
function updateWarehouseTriggerBadges(rates) {
  const container = el("warehouseTriggerBadges");
  if (!container) return;

  const featured = [
    { id: "base10",      label: "BASE 10"    },
    { id: "base20",      label: "BASE 20"    },
    { id: "bbpalletb10", label: "BB P. B10"  },
    { id: "bbpalletb20", label: "BB P. B20"  },
  ];

  container.innerHTML = featured.map(({ id, label }) => {
    const rate   = rates[id] ?? ZONE_DATA[id]?.baseOcc ?? 0;
    const status = statusByRate(rate);
    return `<span class="wh-trigger-badge wh-trigger-badge--${status}">${label} · ${rate}%</span>`;
  }).join("");

  Object.entries(rates).forEach(([id, rate]) => {
    const btn = qs(`.lcb-zone[data-zone="${id}"]`);
    if (btn) btn.setAttribute("data-current-rate", String(rate));
  });
}

function updateWarehouseTriggerSub(result) {
  const sub = el("warehouseTriggerSub");
  if (!sub || !result) return;
  const occRate = Math.round(result.occRate ?? 0);
  const status  = result.status ?? "ok";
  const labels  = {
    ok:       "✓ LCB suporta a demanda",
    warning:  "⚠ Monitoramento necessário",
    critical: "✗ Capacidade insuficiente",
  };
  sub.textContent = `${labels[status]} · Taxa projetada: ${occRate}%`;
}

/* =========================================================================
   WAREHOUSE OVERLAY
========================================================================= */
function renderWarehouseOverlay(sourceRows, result) {
  const overlay = window.lcbZonesOverlay;
  if (!overlay || typeof overlay.renderZoneOverlay !== "function") return;

  const rows = Array.isArray(sourceRows) && sourceRows.length > 0
    ? sourceRows
    : (Array.isArray(State.lastRows) ? State.lastRows : []);

  const selectedPeriod = el("selectedPeriod")?.textContent
    || PERIODS[State.periodIndex]
    || null;

  const project = State.selectedProject;

  // Passa contexto incluindo valores para cálculo de ocupação futura
  overlay.setOverlayContext?.({
    selectedPeriod,
    project,
    thresholdMedium: STATUS_THRESHOLD.WARNING,
    thresholdHigh:   STATUS_THRESHOLD.CRITICAL,
    currentOcc:   Number(el("caCurrentOccupation")?.value) || 0,
    volumeAtual:  Number(el("caVolumeFuturo")?.value)      || 0,
    volumeFuturo: State.productionVolume                   || 0,
  });

  overlay.renderZoneOverlay(rows, {
    selectedPeriod,
    project,
    thresholdMedium: STATUS_THRESHOLD.WARNING,
    thresholdHigh:   STATUS_THRESHOLD.CRITICAL,
  });
}

/* =========================================================================
   WAREHOUSE SIMULADO (fallback sem dados reais)
========================================================================= */
function calcZoneRates(periodIndex, productionVolume) {
  const clamp  = v => Math.min(99, Math.round(v));
  const factor = 1 + periodIndex * 0.007 + productionVolume * 0.0003;
  const rates  = {};
  Object.entries(ZONE_DATA).forEach(([id, z]) => {
    rates[id] = clamp(z.baseOcc * factor);
  });
  return rates;
}

function updateWarehouseSimulated() {
  const zones = calcZoneRates(State.periodIndex, State.productionVolume);
  renderZones(zones);
  updateWarehouseTriggerBadges(zones);

  const rows = Array.isArray(State.lastRows) && State.lastRows.length > 0
    ? State.lastRows
    : buildMockRows(calcCA(getCAInputs()));

  renderWarehouseOverlay(rows, {
    selectedPeriod:  PERIODS[State.periodIndex],
    project:         State.selectedProject,
    thresholdMedium: STATUS_THRESHOLD.WARNING,
    thresholdHigh:   STATUS_THRESHOLD.CRITICAL,
  });
}

/* =========================================================================
   WAREHOUSE — SINCRONIZAÇÃO COM DADOS REAIS
========================================================================= */
function syncWarehouseFromResult(result) {
  if (!result) return;

  const projectedOcc = Math.round(result.projectedOcc ?? result.projected ?? 0);

  const zoneKeys  = Object.keys(ZONE_DATA);
  const zoneTotal = zoneKeys.reduce((a, k) => a + ZONE_DATA[k].capacity, 0);
  const rates = {};
  zoneKeys.forEach(id => {
    const z     = ZONE_DATA[id];
    const share = zoneTotal > 0 ? z.capacity / zoneTotal : 0;
    const zOcc  = Math.round(z.capacity * (z.baseOcc / 100));
    const zAdd  = Math.round(projectedOcc * share);
    const zProj = Math.min(z.capacity, zOcc + zAdd);
    rates[id]   = z.capacity > 0 ? Math.round((zProj / z.capacity) * 100) : 0;
  });

  renderZones(rates);
  updateWarehouseTriggerBadges(rates);
  updateWarehouseTriggerSub(result);

  renderWarehouseOverlay(State.lastRows, result);
  renderSliderProgress(State.periodIndex);
}

/* =========================================================================
   ZONES RENDER
========================================================================= */
function renderZones(rates) {
  Object.entries(rates).forEach(([id, rate]) => {
    const btn = qs(`.lcb-zone[data-zone="${id}"]`);
    if (!btn) return;
    const name = ZONE_DATA[id]?.name ?? id;
    btn.setAttribute("aria-label", `${name} — ocupação: ${rate}%`);
    btn.setAttribute("data-current-rate", String(rate));
  });
}

function renderSliderProgress(periodIndex) {
  const rangeEl = el("timelineRange");
  if (!rangeEl) return;
  const pct  = (periodIndex / Number(rangeEl.max)) * 100;
  const fill = el("sliderProgress");
  if (fill) {
    fill.style.cssText = `
      position:absolute; left:0; top:50%; transform:translateY(-50%);
      height:6px; width:${pct}%; background:var(--color-brand-900);
      border-radius:3px; pointer-events:none; z-index:0;
    `;
  }
}

/* =========================================================================
   TOOLTIP — zonas via .lcb-zone[data-zone]
========================================================================= */
const Tooltip = {
  el: null,

  init() {
    this.el = el("zoneTooltip");
    document.querySelectorAll(".lcb-zone").forEach(btn => {
      btn.addEventListener("mouseenter", () => this.show(btn));
      btn.addEventListener("mouseleave", () => this.hide());
      btn.addEventListener("focus",      () => this.show(btn));
      btn.addEventListener("blur",       () => this.hide());
      btn.addEventListener("click",      () => { this.hide(); this.openModal(btn); });
      btn.addEventListener("keydown",    e  => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); btn.click(); }
      });
    });
  },

  _getRate(id) {
    const attr = qs(`.lcb-zone[data-zone="${id}"]`)?.getAttribute("data-current-rate");
    return attr ? parseInt(attr) : (ZONE_DATA[id]?.baseOcc ?? 50);
  },

  show(btn) {
    if (!this.el) return;
    const id   = btn.dataset.zone;
    const data = ZONE_DATA[id];
    if (!data) return;

    const rate   = this._getRate(id);
    const status = statusByRate(rate);
    const labels = { ok: "DISPONÍVEL", warning: "ATENÇÃO", critical: "CRÍTICO" };
    const cap    = data.capacity;
    const avail  = cap > 0 ? Math.round(cap * (1 - rate / 100)) : 0;

    el("tooltipName").textContent       = data.name;
    el("tooltipStatus").textContent     = labels[status];
    el("tooltipStatus").className       = `tooltip-status tooltip-status--${status}`;
    el("tooltipOccupation").textContent = fmt.pct(rate);
    el("tooltipCapacity").textContent   = cap > 0 ? fmt.boxes(cap) : "Não configurado";
    el("tooltipAvailable").textContent  = cap > 0 ? fmt.boxes(avail) : "—";
    el("tooltipNote").textContent       = data.note;

    const map  = el("warehouseMap");
    const mapR = map.getBoundingClientRect();
    const svg  = map.querySelector("svg");
    const svgR = svg ? svg.getBoundingClientRect() : mapR;
    const scX  = svgR.width  / 1240;
    const scY  = svgR.height / 740;
    const lay  = ZONE_LAYOUT[id];
    const cx   = lay ? (lay.x + lay.w / 2) * scX : mapR.width / 2;
    const ty   = lay ? lay.y * scY : 0;
    const th   = this.el.offsetHeight || 140;

    let top  = ty - th - 8;
    let left = cx - 115;
    if (top < 0)                 top  = lay ? (lay.y + lay.h) * scY + 8 : th + 8;
    if (left < 0)                left = 4;
    if (left + 230 > mapR.width) left = mapR.width - 234;

    this.el.style.top  = top  + "px";
    this.el.style.left = left + "px";
    this.el.classList.add("visible");
    this.el.setAttribute("aria-hidden", "false");
  },

  hide() {
    if (!this.el) return;
    this.el.classList.remove("visible");
    this.el.setAttribute("aria-hidden", "true");
  },

  openModal(btn) {
    const modal = el("zoneModal");
    const body  = el("modalBody");
    if (!modal || !body) return;
    const id   = btn.dataset.zone;
    const data = ZONE_DATA[id];
    if (!data) return;

    const rate   = this._getRate(id);
    const status = statusByRate(rate);
    const labels = { ok: "DISPONÍVEL", warning: "ATENÇÃO", critical: "CRÍTICO" };
    const cap    = data.capacity;
    const avail  = cap > 0 ? Math.round(cap * (1 - rate / 100)) : 0;
    const period = el("selectedPeriod")?.textContent || "—";

    el("modalTitle").textContent = data.name;
    body.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <span style="font-size:.75rem;color:#475569">Período: <strong>${period}</strong></span>
        <span style="padding:3px 10px;border-radius:5px;font-size:.7rem;font-weight:700;letter-spacing:.06em;
          background:var(--color-${status}-bg);border:1.5px solid var(--color-${status}-border);
          color:var(--color-${status === "ok" ? "ok-border" : status})">${labels[status]}</span>
      </div>
      <dl style="display:flex;flex-direction:column">
        ${[
          ["Zona",             data.name],
          ["Ocupação atual",   fmt.pct(rate)],
          ["Capacidade total", cap > 0 ? fmt.boxes(cap) : "Não configurado"],
          ["Disponível",       cap > 0 ? fmt.boxes(avail) : "—"],
        ].map(([k, v]) => `
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f1f5f9">
            <dt style="font-size:.875rem;color:#475569">${k}</dt>
            <dd style="font-size:.875rem;font-weight:700;color:#0f172a">${v}</dd>
          </div>`).join("")}
      </dl>
      <p style="margin-top:14px;font-size:.8125rem;color:#94a3b8">${data.note}</p>
    `;
    modal.showModal();
  },
};

/* =========================================================================
   FILTRO POR PROJETO
========================================================================= */
function initProjectFilter() {
  const container = el("caProjectFilter");
  if (!container) return;
  container.innerHTML = PROJECTS.map(p => `
    <button
      class="ca-project-chip ${p.id === State.selectedProject ? "ca-project-chip--active" : ""}"
      data-project="${p.id}" type="button"
      style="--chip-color: ${p.color}"
      aria-pressed="${p.id === State.selectedProject}"
    >${p.label}</button>
  `).join("");
  container.addEventListener("click", e => {
    const btn = e.target.closest(".ca-project-chip");
    if (!btn) return;
    const projectId = btn.dataset.project;
    State.selectedProject = projectId;
    container.querySelectorAll(".ca-project-chip").forEach(chip => {
      const isActive = chip.dataset.project === projectId;
      chip.classList.toggle("ca-project-chip--active", isActive);
      chip.setAttribute("aria-pressed", String(isActive));
    });
    if (el("caResultCards")?.style.display !== "none") handleCalcClick();
  });
}

/* =========================================================================
   DRAWER
========================================================================= */
function drawerNumber(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}
function drawerText(value, fallback = "—") { return String(value ?? "").trim() || fallback; }
function escapeDrawerHtml(value) {
  return String(value ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function buildRealZoneRows(rows, result) {
  const groups      = new Map();
  const backendZones = Array.isArray(result?.zones) ? result.zones : [];
  const backendByName = new Map(
    backendZones.map(zone => [String(zone?.zona ?? "").trim().toUpperCase(), zone])
  );

  (rows || []).forEach(row => {
    const name  = drawerText(row.storage_zone ?? row.storageZone ?? row.zona, "Sem Zona");
    const key   = name.toUpperCase();
    if (!groups.has(key)) {
      groups.set(key, {
        id: key.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        name, itemCount: 0, volumePD: 0, contracted: 0, blocked: 0, stockValue: 0,
      });
    }
    const group = groups.get(key);
    group.itemCount  += 1;
    group.volumePD   += drawerNumber(row.calc, row.volume_calculado_periodo, row.cxs_periodo);
    group.contracted += drawerNumber(row.volC, row.volume_contratado);
    group.blocked    += drawerNumber(row.bloqueado);
    group.stockValue += drawerNumber(row.valor_total);
  });

  if (groups.size === 0 && result?.porZona && typeof result.porZona === "object") {
    Object.entries(result.porZona).forEach(([name, value]) => {
      const key = String(name).trim().toUpperCase();
      groups.set(key, {
        id: key.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        name: drawerText(name, "Sem Zona"),
        itemCount: 0, volumePD: drawerNumber(value), contracted: 0, blocked: 0, stockValue: 0,
      });
    });
  }

  return [...groups.entries()].map(([key, group]) => {
    const backend     = backendByName.get(key);
    const capacity    = drawerNumber(backend?.total_slots, group.contracted);
    const occupied    = drawerNumber(backend?.slots_usados, group.volumePD);
    const blocked     = drawerNumber(backend?.slots_bloqueados, group.blocked);
    const hasCapacity = capacity > 0;
    const available   = backend?.slots_disponiveis != null
      ? drawerNumber(backend.slots_disponiveis)
      : hasCapacity ? Math.max(0, capacity - occupied - blocked) : null;
    const rate   = backend?.ocupacao_pct != null
      ? drawerNumber(backend.ocupacao_pct)
      : hasCapacity ? ((occupied + blocked) / capacity) * 100 : null;
    const status = backend?.risk_level === "HIGH"   ? "critical" :
                   backend?.risk_level === "MEDIUM" ? "warning"  :
                   rate == null ? "ok" : statusByRate(rate);
    return { ...group, capacity, occupied, blocked, available, rate, status, hasCapacity };
  }).sort((a, b) => {
    const rA = a.rate == null ? -1 : a.rate;
    const rB = b.rate == null ? -1 : b.rate;
    return rB - rA || b.volumePD - a.volumePD;
  });
}

const Drawer = {
  isOpen: false,

  open(rows, result) {
    const drawer  = el("detailsDrawer");
    const overlay = el("drawerOverlay");
    if (!drawer || !overlay) return;
    this._renderContent(rows, result);
    drawer.classList.add("drawer--open");
    overlay.classList.add("active");
    drawer.setAttribute("aria-hidden", "false");
    el("drawerClose")?.focus();
    document.body.style.overflow = "hidden";
    this.isOpen = true;
  },

  close() {
    const drawer  = el("detailsDrawer");
    const overlay = el("drawerOverlay");
    if (!drawer || !overlay) return;
    drawer.classList.remove("drawer--open");
    overlay.classList.remove("active");
    drawer.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    this.isOpen = false;
    el("btnOpenDrawer")?.focus();
  },

  _renderContent(rows, result) {
    const project      = PROJECTS.find(p => p.id === State.selectedProject) ?? PROJECTS[0];
    const projectLabel = State.selectedProjectName || result?.projectName || project.label;
    const status       = result?.status ?? "ok";
    const cap          = result?.capacity ?? 140_000;

    const titleEl = el("drawerTitle");
    if (titleEl) titleEl.textContent = `Itens — ${projectLabel}`;

    const metaEl = el("drawerMeta");
    if (metaEl) {
      const projOcc = result?.projectedOcc ?? result?.projected ?? 0;
      const avail   = result?.available ?? 0;
      const occRate = result?.occRate ?? 0;
      const sc = {
        ok:       { bg:"var(--color-ok-bg)",       border:"var(--color-ok-border)",       text:"var(--color-ok)" },
        warning:  { bg:"var(--color-warning-bg)",  border:"var(--color-warning-border)",  text:"var(--color-warning)" },
        critical: { bg:"var(--color-critical-bg)", border:"var(--color-critical-border)", text:"var(--color-critical)" },
      }[status];
      metaEl.innerHTML = `<div class="drawer-meta__chips">
        <span class="drawer-meta__chip">
          <span class="drawer-meta__chip-label">Projeto</span>
          <span class="drawer-meta__chip-value" style="color:${project.color}">${escapeDrawerHtml(projectLabel)}</span>
        </span>
        <span class="drawer-meta__chip">
          <span class="drawer-meta__chip-label">Itens analisados</span>
          <span class="drawer-meta__chip-value">${rows.length}</span>
        </span>
        <span class="drawer-meta__chip">
          <span class="drawer-meta__chip-label">Ocupação projetada</span>
          <span class="drawer-meta__chip-value">${fmt.int(Math.round(projOcc))} cx</span>
        </span>
        <span class="drawer-meta__chip">
          <span class="drawer-meta__chip-label">Disponível</span>
          <span class="drawer-meta__chip-value">${fmt.int(Math.round(avail))} cx</span>
        </span>
        <span class="drawer-meta__chip drawer-meta__chip--status"
          style="background:${sc.bg};border-color:${sc.border};color:${sc.text}">
          ${{ ok:"✓ SUPORTA", warning:"⚠ ATENÇÃO", critical:"✗ INSUFICIENTE" }[status]} · ${fmt.dec(occRate)}%
        </span>
      </div>`;
    }

    const bodyEl = el("drawerBody");
    if (!bodyEl) return;

    const zoneRows = buildRealZoneRows(rows, result);
    const dot      = s => ({
      ok:       `<span class="dz-dot dz-dot--ok"></span>`,
      warning:  `<span class="dz-dot dz-dot--warn"></span>`,
      critical: `<span class="dz-dot dz-dot--crit"></span>`,
    }[s] ?? "");

    const zoneSection = `
      <div class="drawer-section">
        <h3 class="drawer-section__title">Distribuição Real por Zona de Armazenagem</h3>
        ${zoneRows.length
          ? `<div class="drawer-zones">
              ${zoneRows.map(zone => {
                const bw  = zone.hasCapacity ? Math.min(100, (zone.occupied / zone.capacity) * 100) : 0;
                const aw  = zone.hasCapacity ? Math.min(100 - bw, (zone.blocked / zone.capacity) * 100) : 0;
                const rL  = zone.rate == null ? "s/ capacidade" : `${fmt.dec(zone.rate)}%`;
                const cL  = zone.hasCapacity ? `${fmt.int(Math.round(zone.capacity))} cx` : "Não informado";
                const aL  = zone.available == null ? "—" : `${fmt.int(Math.round(zone.available))} cx`;
                return `
                  <div class="drawer-zone-card drawer-zone-card--${zone.status}">
                    <div class="drawer-zone-card__header">
                      ${dot(zone.status)}
                      <span class="drawer-zone-card__name">${escapeDrawerHtml(zone.name)}</span>
                      <span style="margin-left:auto;color:#64748b;font-size:.68rem">${zone.itemCount} item(ns)</span>
                      <span class="drawer-zone-card__rate">${rL}</span>
                    </div>
                    <div class="drawer-zone-card__bar">
                      <div class="drawer-zone-card__bar-fill drawer-zone-card__bar-fill--base"
                        style="width:${bw.toFixed(1)}%"></div>
                      <div class="drawer-zone-card__bar-fill drawer-zone-card__bar-fill--added"
                        style="width:${aw.toFixed(1)}%;left:${bw.toFixed(1)}%"></div>
                    </div>
                    <div class="drawer-zone-card__stats">
                      <span><span class="dz-label">Capacidade</span><strong>${cL}</strong></span>
                      <span><span class="dz-label">Volume PD</span><strong>${fmt.int(Math.round(zone.volumePD))} cx</strong></span>
                      <span><span class="dz-label">Bloqueado</span><strong>${fmt.int(Math.round(zone.blocked))} cx</strong></span>
                      <span><span class="dz-label">Disponível</span><strong>${aL}</strong></span>
                    </div>
                  </div>`;
              }).join("")}
            </div>`
          : `<div class="drawer-empty">
               <span class="drawer-empty__icon">📦</span>
               <p>Nenhuma zona identificada.</p>
             </div>`
        }
      </div>`;

    if (!rows?.length) {
      bodyEl.innerHTML = zoneSection + `
        <div class="drawer-empty">
          <span class="drawer-empty__icon">📭</span>
          <p>Nenhum item disponível.</p>
        </div>`;
      return;
    }

    const totContracted = rows.reduce((s, r) => s + drawerNumber(r.volC, r.volume_contratado), 0);
    const totCalc       = rows.reduce((s, r) => s + drawerNumber(r.calc, r.volume_calculado_periodo), 0);
    const totBlocked    = rows.reduce((s, r) => s + drawerNumber(r.bloqueado), 0);
    const totExcel      = rows.reduce((s, r) => {
      const raw  = r.cxs_periodo;
      const calc = drawerNumber(r.calc, r.volume_calculado_periodo);
      return s + (raw != null && raw !== "" ? drawerNumber(raw) : calc);
    }, 0);

    bodyEl.innerHTML = zoneSection + `
      <div class="drawer-section">
        <h3 class="drawer-section__title">Itens Analisados</h3>
        <div class="drawer-table-wrap">
          <table class="drawer-table">
            <thead>
              <tr>
                <th>PN</th><th>Descrição</th><th>PE</th>
                <th class="num">Vol. Excel</th><th class="num">Vol. Calculado</th>
                <th>Zona</th><th>Data Intro</th><th class="num">Daily Rate</th>
                <th class="num">Vol. Contratado</th><th class="num">Bloqueado</th>
                <th>Origem</th><th>Fonte</th><th class="num">Impacto</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(row => {
                const calc   = drawerNumber(row.calc, row.volume_calculado_periodo);
                const raw    = row.cxs_periodo;
                const excel  = raw != null && raw !== "" ? drawerNumber(raw) : calc;
                const impact = cap > 0 ? ((calc / cap) * 100).toFixed(2).replace(".", ",") : "0,00";
                return `<tr>
                  <td class="drawer-table__pn">${escapeDrawerHtml(drawerText(row.pn ?? row.part_number))}</td>
                  <td>${escapeDrawerHtml(drawerText(row.desc ?? row.descricao))}</td>
                  <td>${escapeDrawerHtml(drawerText(row.pe ?? row.pckg_type))}</td>
                  <td class="num">${fmt.int(Math.round(excel))}</td>
                  <td class="num"><strong>${fmt.int(Math.round(calc))}</strong></td>
                  <td>${escapeDrawerHtml(drawerText(row.storage_zone ?? row.storageZone))}</td>
                  <td>${escapeDrawerHtml(drawerText(row.introduction_date))}</td>
                  <td class="num">${fmt.dec(drawerNumber(row.dr, row.daily_rate))}</td>
                  <td class="num">${fmt.int(Math.round(drawerNumber(row.volC, row.volume_contratado)))}</td>
                  <td class="num">${fmt.int(Math.round(drawerNumber(row.bloqueado)))}</td>
                  <td>${escapeDrawerHtml(drawerText(row.origem))}</td>
                  <td>${escapeDrawerHtml(drawerText(row.calculo_fonte))}</td>
                  <td class="num drawer-table__impact">${impact}%</td>
                </tr>`;
              }).join("")}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="3">Totais</td>
                <td class="num">${fmt.int(Math.round(totExcel))}</td>
                <td class="num">${fmt.int(Math.round(totCalc))}</td>
                <td colspan="3">—</td>
                <td class="num">${fmt.int(Math.round(totContracted))}</td>
                <td class="num">${fmt.int(Math.round(totBlocked))}</td>
                <td colspan="3">—</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>`;

    const footerEl = el("drawerFooterInfo");
    if (footerEl) footerEl.textContent = `${rows.length} item(s) · Calculado em ${formatTimestamp()}`;
  },

  exportCSV(rows) {
    if (!rows || rows.length === 0) return;
    const clean = v => String(v ?? "").replaceAll(";", ",").replaceAll("\n", " ").replaceAll("\r", " ");
    const csv = [
      ["PN","Descrição","PE","Vol. Excel","Vol. Calculado","Zona","Data Intro","Daily Rate","Vol. Contratado","Bloqueado","Origem","Fonte"].join(";"),
      ...rows.map(row => [
        row.pn ?? row.part_number ?? "",
        row.desc ?? row.descricao ?? "",
        row.pe ?? row.pckg_type ?? "",
        row.cxs_periodo != null && row.cxs_periodo !== ""
          ? drawerNumber(row.cxs_periodo)
          : drawerNumber(row.calc, row.volume_calculado_periodo),
        drawerNumber(row.calc, row.volume_calculado_periodo),
        row.storage_zone ?? "",
        row.introduction_date ?? "",
        drawerNumber(row.dr, row.daily_rate),
        drawerNumber(row.volC, row.volume_contratado),
        drawerNumber(row.bloqueado),
        row.origem ?? "",
        row.calculo_fonte ?? "",
      ].map(clean).join(";")),
    ];
    const blob = new Blob(["\uFEFF" + csv.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `lcb_${State.selectedProject}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },
};

function initDrawer() {
  el("drawerClose")?.addEventListener("click",     () => Drawer.close());
  el("drawerOverlay")?.addEventListener("click",   () => Drawer.close());
  el("drawerBtnExport")?.addEventListener("click", () => Drawer.exportCSV(State.lastRows));
  el("btnOpenDrawer")?.addEventListener("click",   () => {
    if (State.lastResult) Drawer.open(State.lastRows, State.lastResult);
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && Drawer.isOpen) Drawer.close();
  });
}

/* =========================================================================
   ANÁLISE DE CAPACIDADE — CÁLCULO LOCAL (v7.3)
========================================================================= */
function getCAInputs() {
  return {
    capacity:              Number(el("caLcbCapacity")?.value)            || 140_000,
    currentOcc:            Number(el("caCurrentOccupation")?.value)      || 110_000,
    periodDays:            Number(el("caAnalysisPeriod")?.value)         || 15,
    safetyMargin:          Number(el("caSafetyMargin")?.value)           || 0,
    dailyRate:             7,
    capBlocado:            Number(el("caCapBlocado")?.value)             || 19_800,
    capPortaPalletsB10:    Number(el("caCapPortaPalletsB10")?.value)     || 37_400,
    capPortaPalletsB20:    Number(el("caCapPortaPalletsB20")?.value)     || 30_600,
    capBlueBoxB10:         Number(el("caCapBlueBoxB10")?.value)          || 8_000,
    capBlueBoxB20:         Number(el("caCapBlueBoxB20")?.value)          || 8_000,
    capBlueBoxIndividual:  Number(el("caCapBlueBoxIndividual")?.value)   || 4_200,
    capTMX:                Number(el("caCapTMX")?.value)                 || 0,
    volumeAtual:           Number(el("caVolumeFuturo")?.value)           || 0,
  };
}

function calcCA(inputs) {
  const { capacity, currentOcc, periodDays, safetyMargin, dailyRate } = inputs;
  const projectFactors = { todos: 1, china: 1.0, europa: 0.85, bev: 1.2, powertrain: 0.95 };
  const factor         = projectFactors[State.selectedProject] ?? 1;
  const volumePeriod   = State.productionVolume * periodDays;
  const totalProjection = Math.round(volumePeriod * dailyRate * factor);
  const usableCapacity  = Math.round(capacity * (1 - safetyMargin / 100));
  const projectedOcc    = currentOcc + totalProjection;
  const available       = capacity - projectedOcc;
  const occRate         = (projectedOcc / capacity) * 100;
  const status          = statusByRate(occRate);
  return {
    volumePeriod: totalProjection, totalProjection, capacity, currentOcc,
    usableCapacity, projectedOcc, available, occRate, status, periodDays, dailyRate,
    capBlocado:          inputs.capBlocado,
    capPortaPalletsB10:  inputs.capPortaPalletsB10,
    capPortaPalletsB20:  inputs.capPortaPalletsB20,
    capBlueBoxB10:       inputs.capBlueBoxB10,
    capBlueBoxB20:       inputs.capBlueBoxB20,
    capBlueBoxIndividual:inputs.capBlueBoxIndividual,
    capTMX:              inputs.capTMX,
    // Mantém o nome volumeFuturo internamente para compatibilidade com o restante do código
    volumeFuturo:        inputs.volumeAtual,
    volumeAtual:         inputs.volumeAtual,
  };
}

/* buildMockRows — v7.3: zonas separadas Blue Box B10 / B20 */
function buildMockRows(result) {
  const periods = ["JAN/2026", "MAR/2026", "MAI/2026", "JUL/2026"];
  const zones   = ["Base 10", "Base 20", "Blue Box Base 10", "Blue Box Base 20"];

  return [
    { pn: "PN-1001", desc: "Peça exemplo A", pe: "EA", dr: result.dailyRate,     volC: result.volumePeriod * 0.22, storage_zone: zones[0], introduction_date: periods[0] },
    { pn: "PN-2032", desc: "Peça exemplo B", pe: "EA", dr: result.dailyRate + 1, volC: result.volumePeriod * 0.18, storage_zone: zones[1], introduction_date: periods[1] },
    { pn: "PN-3307", desc: "Peça exemplo C", pe: "EA", dr: result.dailyRate + 2, volC: result.volumePeriod * 0.15, storage_zone: zones[2], introduction_date: periods[2] },
    { pn: "PN-4410", desc: "Peça exemplo D", pe: "EA", dr: result.dailyRate + 3, volC: result.volumePeriod * 0.11, storage_zone: zones[3], introduction_date: periods[3] },
  ].map(r => ({
    ...r,
    calc:        Math.round(r.dr * result.periodDays),
    cxs_periodo: Math.round(r.dr * result.periodDays),
    projeto:     State.selectedProjectName || State.selectedProject,
  }));
}

/* =========================================================================
   CHARTS
========================================================================= */
function renderCAChart(result) {
  const canvas = el("caCapacityChart");
  if (!canvas || typeof Chart === "undefined") {
    if (typeof Chart === "undefined") setTimeout(() => renderCAChart(result), 200);
    return;
  }
  const cap      = Math.round(result.capacity);
  const usable   = Math.round(result.usableCapacity ?? result.usable ?? cap);
  const currOcc  = Math.round(result.currentOcc);
  const projOcc  = Math.round(result.projectedOcc ?? result.projected ?? 0);
  const critical = Math.round(cap * 0.9);
  const months   = CHART_LABELS;
  const n        = months.length;
  const makeL    = (s, e) => months.map((_, i) => Math.round(s + (e - s) * (i / (n - 1))));

  const datasets = [
    { label: "Cap. Total",           data: months.map(() => cap),      borderColor: "rgba(143,183,240,0.7)", borderWidth: 1.5, borderDash: [10,6], pointRadius: 0, fill: false, tension: 0, order: 5 },
    { label: "Cap. Utilizável",      data: months.map(() => usable),   borderColor: "rgba(37,99,168,0.6)",   borderWidth: 1.5, borderDash: [6,4],  pointRadius: 0, fill: false, tension: 0, order: 4 },
    { label: "Ocup. Atual",          data: makeL(currOcc, currOcc),    borderColor: "#94a3b8",               borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0.2, order: 3 },
    { label: "Ocup. Projetada",      data: makeL(currOcc, projOcc),    borderColor: "#001533",               borderWidth: 2.5, pointRadius: ctx => (ctx.dataIndex === 0 || ctx.dataIndex === n - 1) ? 4 : 0, pointBackgroundColor: "#001533", pointBorderColor: "#fff", pointBorderWidth: 2, fill: { target: "2", above: "rgba(0,21,51,0.07)" }, tension: 0.3, order: 2 },
    { label: "Limite Crítico (90%)", data: months.map(() => critical), borderColor: "rgba(220,38,38,0.65)",  borderWidth: 1.5, borderDash: [5,4], pointRadius: 0, fill: false, tension: 0, order: 1 },
  ];

  const tickMax = Math.ceil(cap * 1.12 / 10_000) * 10_000;
  const tickMin = Math.floor(Math.min(currOcc, projOcc) * 0.85 / 10_000) * 10_000;

  const opts = {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "rgba(0,21,51,0.95)", titleColor: "rgba(255,255,255,0.6)",
        titleFont: { size: 11, weight: "600" }, bodyColor: "#ffffff",
        bodyFont: { size: 12 }, padding: { x: 14, y: 10 }, cornerRadius: 8,
        borderColor: "rgba(255,255,255,0.08)", borderWidth: 1, boxPadding: 4,
        callbacks: {
          title(i)  { return i[0]?.label ?? ""; },
          label(ctx){ return ctx.parsed.y == null ? "" : `  ●  ${ctx.dataset.label}: ${Number(ctx.parsed.y).toLocaleString("pt-BR")} cx`; },
          afterBody(){ return [""]; },
        },
        filter(i){ return i.dataset.label !== "_ref"; },
      },
    },
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { color: "#94a3b8", font: { size: 11 }, maxRotation: 0, padding: 8 } },
      y: {
        min: tickMin, max: tickMax,
        grid: { color: "rgba(226,232,240,0.5)", drawBorder: false, lineWidth: 1 },
        border: { display: false, dash: [4,4] },
        ticks: { color: "#94a3b8", font: { size: 11 }, callback: v => (v / 1_000).toFixed(0) + "k", maxTicksLimit: 7, padding: 8 },
      },
    },
    animation: { duration: 700, easing: "easeOutCubic" },
  };

  if (_caChart) {
    _caChart.data.labels   = months;
    _caChart.data.datasets = datasets;
    _caChart.options       = opts;
    _caChart.update();
  } else {
    _caChart = new Chart(canvas, { type: "line", data: { labels: months, datasets }, options: opts });
  }
}

function renderDonutChart(result) {
  const canvas = el("caDonutChart");
  if (!canvas || typeof Chart === "undefined") {
    if (typeof Chart === "undefined") setTimeout(() => renderDonutChart(result), 200);
    return;
  }
  const cap     = Math.round(result.capacity);
  const currOcc = Math.round(result.currentOcc);
  const volPD   = Math.round(result.volumePeriod ?? result.totalProjection ?? 0);
  const margin  = Math.round(cap * ((Number(el("caSafetyMargin")?.value) || 0) / 100));
  const avail   = Math.max(0, cap - currOcc - volPD - margin);
  const projOcc = Math.round(result.projectedOcc ?? result.projected ?? 0);

  const center  = el("caDonutCenterValue");
  const cenLbl  = el("caDonutCenterLabel");
  if (center) center.textContent = fmt.int(projOcc);
  if (cenLbl) cenLbl.textContent = "caixas";

  const labels = ["Ocupação Atual","Aumento PD Analisado","Margem de Segurança","Disponível"];
  const values = [currOcc, volPD, margin, avail];
  const colors = ["#123b70","#16a34a","#d97706","#e2e8f0"];

  const legendEl = el("caDonutLegendList");
  if (legendEl) {
    legendEl.innerHTML = labels.map((l, i) => `
      <li class="ca-donut-legend-item">
        <span class="ca-donut-legend-dot" style="background:${colors[i]}"></span>
        <span class="ca-donut-legend-label">${l}</span>
        <span class="ca-donut-legend-value">${fmt.int(values[i])}</span>
      </li>`).join("");
  }

  const data = {
    labels,
    datasets: [{
      data: values,
      backgroundColor: colors,
      borderColor: ["#fff","#fff","#fff","#fff"],
      borderWidth: 2,
      hoverOffset: 4,
    }],
  };
  const opts = {
    responsive: true, maintainAspectRatio: false, cutout: "68%",
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#001533", bodyColor: "#fff", padding: 10, cornerRadius: 8,
        callbacks: {
          label(ctx) {
            return ` ${ctx.label}: ${Number(ctx.parsed).toLocaleString("pt-BR")} cx (${((ctx.parsed / cap) * 100).toFixed(1)}%)`;
          },
        },
      },
    },
    animation: { duration: 600, easing: "easeOutQuart" },
  };

  if (_donutChart) {
    _donutChart.data    = data;
    _donutChart.options = opts;
    _donutChart.update();
  } else {
    _donutChart = new Chart(canvas, { type: "doughnut", data, options: opts });
  }
}

/* =========================================================================
   ENGINE
========================================================================= */
function renderEngine(result) {
  const container = el("caEngineContainer");
  if (!container) return;
  const cap     = Math.round(result.capacity);
  const currOcc = Math.round(result.currentOcc);
  const margin  = Math.round(cap * ((Number(el("caSafetyMargin")?.value) || 0) / 100));
  const volPD   = Math.round(result.volumePeriod ?? result.totalProjection ?? 0);
  const avail   = cap - currOcc - margin - volPD;
  const status  = result.status ?? statusByRate(result.occRate);
  const rClass  = status === "critical" ? "ca-engine-step--crit" :
                  status === "warning"  ? "ca-engine-step--warn" :
                  "ca-engine-step--ok";

  const step = (tag, value, label) => `
    <div class="ca-engine-step">
      <span class="ca-engine-step__tag">${tag}</span>
      <span class="ca-engine-step__value">${fmt.int(value)}</span>
      <span class="ca-engine-step__label">${label}</span>
    </div>`;
  const op = (sym, eq = false) =>
    `<div class="ca-engine-op${eq ? " ca-engine-op--eq" : ""}">${sym}</div>`;

  container.innerHTML = `
    <div class="ca-engine">
      ${step("CAPACIDADE", cap,     "Capacidade Total")}
      ${op("−")}
      ${step("OCUPAÇÃO",   currOcc, "Ocupação Atual")}
      ${op("−")}
      ${step("MARGEM",     margin,  "Margem de Segurança")}
      ${op("−")}
      ${step("VOLUME PD",  volPD,   "Aumento PD Analisado")}
      ${op("=", true)}
      <div class="ca-engine-step ${rClass}">
        <span class="ca-engine-step__tag">RESULTADO</span>
        <span class="ca-engine-step__value">${fmt.int(avail)}</span>
        <span class="ca-engine-step__label">Capacidade Disponível</span>
      </div>
    </div>`;
}

/* =========================================================================
   VEREDICTO, KPIS, RECOMENDAÇÃO
========================================================================= */
function renderCAVerdict(result) {
  const verdict = el("caVerdict");
  const icon    = el("caVerdictIcon");
  const title   = el("caVerdictTitle");
  const sub     = el("caVerdictSub");
  if (!verdict) return;

  verdict.classList.remove("warning", "critical");

  if (result.status === "critical") {
    verdict.classList.add("critical");
    if (icon)  icon.textContent  = "✗";
    if (title) title.textContent = "CAPACIDADE INSUFICIENTE PARA A DEMANDA";
    if (sub)   sub.textContent   = "A ocupação projetada excede a capacidade utilizável do LCB.";
  } else if (result.status === "warning") {
    verdict.classList.add("warning");
    if (icon)  icon.textContent  = "!";
    if (title) title.textContent = "ATENÇÃO: CENÁRIO REQUER MONITORAMENTO";
    if (sub)   sub.textContent   = "O cenário está dentro da margem de atenção. Acompanhe de perto.";
  } else {
    if (icon)  icon.textContent  = "✓";
    if (title) title.textContent = "LCB SUPORTA A DEMANDA PROJETADA";
    if (sub)   sub.textContent   = "Com a margem de segurança aplicada, ainda há capacidade disponível.";
  }

  const ts = el("headerTimestamp");
  if (ts) ts.innerHTML = `Último cálculo: <strong>${formatTimestamp()}</strong>`;
}

/* =========================================================================
   renderCAKpis — v7.3
========================================================================= */
function renderCAKpis(result) {
  const grid = el("caKpiGrid");
  if (!grid) return;

  const cap     = result.capacity;
  const currOcc = result.currentOcc;
  const avail   = result.available ?? 0;
  const occRate = result.occRate ?? 0;
  const status  = result.status ?? statusByRate(occRate);

  const capBlocado           = result.capBlocado           ?? Number(el("caCapBlocado")?.value)           ?? 19_800;
  const capPortaPalletsB10   = result.capPortaPalletsB10   ?? Number(el("caCapPortaPalletsB10")?.value)   ?? 37_400;
  const capPortaPalletsB20   = result.capPortaPalletsB20   ?? Number(el("caCapPortaPalletsB20")?.value)   ?? 30_600;
  const capBlueBoxB10        = result.capBlueBoxB10        ?? Number(el("caCapBlueBoxB10")?.value)        ?? 8_000;
  const capBlueBoxB20        = result.capBlueBoxB20        ?? Number(el("caCapBlueBoxB20")?.value)        ?? 8_000;
  const capBlueBoxIndividual = result.capBlueBoxIndividual ?? Number(el("caCapBlueBoxIndividual")?.value) ?? 4_200;
  const capTMX               = result.capTMX               ?? Number(el("caCapTMX")?.value)               ?? 0;
  const volumeAtual          = result.volumeAtual          ?? Number(el("caVolumeFuturo")?.value)         ?? 0;

  // Cálculo da ocupação futura global
  const volumeFuturo = State.productionVolume || 0;
  const occFuturaGlobal = (volumeAtual > 0 && occRate > 0)
    ? Math.min((occRate * (volumeFuturo / volumeAtual)), 200)
    : null;

  const kSC = status === "critical" ? "ca-kpi--crit" :
              status === "warning"  ? "ca-kpi--warn" : "ca-kpi--ok";

  const kpi = (label, value, unit, desc, iconKey, cls = "") => `
    <div class="ca-kpi ${cls}">
      <div class="ca-kpi__header">
        <span class="ca-kpi__label">${label}</span>
        <span class="ca-kpi__icon">${ICONS[iconKey] ?? ""}</span>
      </div>
      <strong class="ca-kpi__value">${value}</strong>
      <span class="ca-kpi__unit">${unit}</span>
      <span class="ca-kpi__desc">${desc}</span>
    </div>`;

  // KPI de ocupação futura com classe dinâmica
  const occFuturaStr = occFuturaGlobal !== null
    ? `${occFuturaGlobal.toFixed(1).replace(".", ",")}%`
    : "—";
  const occFuturaStatus = occFuturaGlobal !== null ? statusByRate(occFuturaGlobal) : "ok";
  const occFuturaClass  = occFuturaGlobal !== null
    ? (occFuturaStatus === "critical" ? "ca-kpi--crit" : occFuturaStatus === "warning" ? "ca-kpi--warn" : "ca-kpi--ok")
    : "";

  grid.innerHTML =
    kpi("Capacidade Total",        fmt.int(cap),                        "caixas", "Espaço físico total do LCB",          "boxes") +
    kpi("Ocupação Atual",          fmt.int(Math.round(currOcc)),        "caixas", "Inventário atual no LCB",             "users") +
    kpi("Capacidade Disponível",   fmt.int(Math.round(avail)),          "caixas", "Folga após introdução do PD",         "check",   kSC) +
    kpi("Ocup. Futura Projetada",  occFuturaStr,                        "%",      `Com ${fmt.int(volumeFuturo)} veíc./dia`,  "trending", occFuturaClass) +
    kpi("Blocado",                 fmt.int(capBlocado),                 "caixas", "Cap. zona de bloqueio",               "lock",    "ca-kpi--highlight") +
    kpi("Porta Pallets Base 10",   fmt.int(capPortaPalletsB10),         "caixas", "Cap. Base 10",                        "layers",  "ca-kpi--highlight") +
    kpi("Porta Pallets Base 20",   fmt.int(capPortaPalletsB20),         "caixas", "Cap. Base 20",                        "layers",  "ca-kpi--highlight") +
    kpi("Blue Box Base 10",        fmt.int(capBlueBoxB10),              "caixas", "Cap. Blue Box pallet base 10",        "cube",    "ca-kpi--highlight") +
    kpi("Blue Box Base 20",        fmt.int(capBlueBoxB20),              "caixas", "Cap. Blue Box pallet base 20",        "cube",    "ca-kpi--highlight") +
    kpi("Blue Box Individual",     fmt.int(capBlueBoxIndividual),       "caixas", "Cap. Blue Box individual",            "cube",    "ca-kpi--highlight") +
    kpi("T;M;4;0;X;90",           fmt.int(capTMX),                     "caixas", "Cap. zona T;M;4;0;X;90",             "layers",  "ca-kpi--highlight") +
    kpi("Volume Produto Atual",    fmt.int(volumeAtual),                "caixas", "Volume de produto informado",         "boxes",   "ca-kpi--highlight");
}

function renderCARecommendation(result) {
  const panel   = el("caRecommendationPanel");
  const textEl  = el("caRecommendationText");
  if (!textEl) return;

  const project = PROJECTS.find(p => p.id === State.selectedProject);
  const pLabel  = project ? ` (${project.label})` : "";

  const icons  = { ok: "🛡️", warning: "⚠️", critical: "🚨" };
  const titles = {
    ok:       `O LCB suporta a demanda projetada${pLabel}`,
    warning:  `Atenção: cenário${pLabel} exige monitoramento`,
    critical: `Capacidade insuficiente para a demanda${pLabel}`,
  };
  const texts = {
    ok:       "O LCB suporta a demanda projetada com folga operacional. O cenário é favorável para a introdução planejada no período definido.",
    warning:  "O cenário está na faixa de atenção. A operação é viável, mas é necessário monitorar as introduções e o uso das áreas de armazenagem ao longo do período.",
    critical: "A demanda projetada ultrapassa a capacidade utilizável do LCB. Recomenda-se redistribuição de volume, revisão da janela de introdução ou expansão de capacidade física.",
  };

  const s       = result.status;
  const iconEl  = el("caRecommendationIcon");
  const titleEl = el("caRecommendationTitle");
  if (iconEl)  iconEl.textContent  = icons[s];
  if (titleEl) titleEl.textContent = titles[s];
  if (textEl)  textEl.textContent  = texts[s];
  if (panel)   { panel.classList.remove("warning", "critical"); if (s !== "ok") panel.classList.add(s); }
}

function _showResultPanels() {
  const ph    = el("caResultPlaceholder");
  const cards = el("caResultCards");
  if (ph)    ph.style.display    = "none";
  if (cards) cards.style.display = "flex";
}

/* =========================================================================
   ORQUESTRADOR — handleCalcClick
========================================================================= */
function handleCalcClick() {
  window.lcbApi?.runIfFileLoaded(
    (calcResult) => {
      const simulation = window.lcbApi?.getLastResult?.() || {};
      const rawItems   = Array.isArray(simulation.itens) ? simulation.itens : [];

      State.lastRows = rawItems.map((item) => ({
        ...item,
        pn:                item.part_number       ?? item.pn    ?? "",
        desc:              item.descricao         ?? item.desc  ?? "",
        pe:                item.pckg_type         ?? item.pe    ?? "",
        dr:                item.daily_rate        ?? item.dr    ?? 0,
        volC:              item.volume_contratado ?? item.volC  ?? 0,
        cxs_periodo:       item.cxs_periodo       ?? null,
        calc:              item.volume_calculado_periodo ?? item.cxs_periodo ?? 0,
        storage_zone:      item.storage_zone      ?? item.storageZone ?? item.zona ?? "",
        introduction_date: item.introduction_date ?? item.introductionDate ?? "",
        bloqueado:         item.bloqueado         ?? 0,
        origem:            item.origem            ?? "",
        calculo_fonte:     item.calculo_fonte     ?? "",
        valor_total:       item.valor_total       ?? 0,
      }));

      State.selectedProjectName = simulation.projeto || State.selectedProjectName;

      const inputs = getCAInputs();
      const resultForRender = {
        status:              calcResult.status,
        occRate:             calcResult.occRate,
        volumePeriod:        calcResult.volumePeriod,
        capacity:            calcResult.capacity,
        currentOcc:          calcResult.currentOcc,
        usableCapacity:      calcResult.usable,
        projectedOcc:        calcResult.projected,
        available:           calcResult.available,
        increaseNeeded:      calcResult.increaseNeeded,
        totalProjection:     calcResult.volumePeriod,
        projectName:         simulation.projeto || "",
        porZona:             simulation.por_zona || {},
        zones:               Array.isArray(simulation.zones) ? simulation.zones : [],
        capBlocado:          inputs.capBlocado,
        capPortaPalletsB10:  inputs.capPortaPalletsB10,
        capPortaPalletsB20:  inputs.capPortaPalletsB20,
        capBlueBoxB10:       inputs.capBlueBoxB10,
        capBlueBoxB20:       inputs.capBlueBoxB20,
        capBlueBoxIndividual:inputs.capBlueBoxIndividual,
        capTMX:              inputs.capTMX,
        volumeFuturo:        inputs.volumeAtual,
        volumeAtual:         inputs.volumeAtual,
      };

      renderAll(resultForRender);
    },
    () => runLocalCACalculation()
  );
}

function renderAll(result) {
  State.lastResult  = result;
  State.hasRealData = true;

  renderCAVerdict(result);
  renderCAKpis(result);
  renderDonutChart(result);
  renderEngine(result);
  renderCARecommendation(result);
  _showResultPanels();

  syncWarehouseFromResult(result);

  if (Drawer.isOpen) Drawer.open(State.lastRows, result);
}

function runLocalCACalculation() {
  const inputs  = getCAInputs();
  const result  = calcCA(inputs);
  State.lastRows = buildMockRows(result);
  renderAll(result);
}

/* =========================================================================
   EVENTOS DE ANÁLISE (v7.3)
========================================================================= */
function initAnalise() {
  if (!_calcListenerAttached) {
    el("btnCalcAnalise")?.addEventListener("click", handleCalcClick);
    _calcListenerAttached = true;
  }

  el("btnUseMock")?.addEventListener("click", () => {
    const defaults = {
      caLcbCapacity:           140_000,
      caCurrentOccupation:     110_000,
      caAnalysisPeriod:        15,
      caSafetyMargin:          10,
      caCapBlocado:            19_800,
      caCapPortaPalletsB10:    37_400,
      caCapPortaPalletsB20:    30_600,
      caCapBlueBoxB10:         8_000,
      caCapBlueBoxB20:         8_000,
      caCapBlueBoxIndividual:  4_200,
      caCapTMX:                0,
      caVolumeFuturo:          0,
    };
    Object.entries(defaults).forEach(([id, v]) => {
      const e = el(id);
      if (e) e.value = v;
    });
    syncZoneCapacitiesFromInputs();
    runLocalCACalculation();
  });

  [
    "caLcbCapacity", "caCurrentOccupation", "caAnalysisPeriod", "caSafetyMargin",
    "caCapBlocado",
    "caCapPortaPalletsB10", "caCapPortaPalletsB20",
    "caCapBlueBoxB10",      "caCapBlueBoxB20",
    "caCapBlueBoxIndividual",
    "caCapTMX",
    "caVolumeFuturo",
  ].forEach(id => {
    el(id)?.addEventListener("input", () => {
      syncZoneCapacitiesFromInputs();
      // Sempre que mudar volume atual ou ocupação, atualiza contexto do overlay
      _syncFutureVolumeContext();
      if (el("caResultCards")?.style.display !== "none") handleCalcClick();
    });
  });

  const uploadZone  = el("uploadZone");
  const excelInput  = el("excelInput");
  const uploadLabel = el("uploadLabel");

  function applyFile(file) {
    if (!file) return;
    uploadZone?.classList.remove("upload-error");
    uploadZone?.classList.add("file-loaded");
    if (uploadLabel) {
      uploadLabel.innerHTML = `
        <span class="upload-zone__filename">✓ ${file.name}</span>
        <span class="upload-zone__meta">${(file.size / 1024).toFixed(1)} KB · Pronto para calcular</span>`;
    }
  }

  excelInput?.addEventListener("change", e => applyFile(e.target.files?.[0]));

  uploadZone?.addEventListener("dragover", e => {
    e.preventDefault();
    uploadZone.classList.add("drag-over");
  });
  uploadZone?.addEventListener("dragleave", () => {
    uploadZone?.classList.remove("drag-over");
  });
  uploadZone?.addEventListener("drop", e => {
    e.preventDefault();
    uploadZone?.classList.remove("drag-over");
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    applyFile(file);
    const dt = new DataTransfer();
    dt.items.add(file);
    if (excelInput) {
      excelInput.files = dt.files;
      excelInput.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
}

/* =========================================================================
   INICIALIZAÇÃO
========================================================================= */
function init() {
  try {
    initMenu();
    initProjectFilter();
    initDrawer();
    initAnalise();
    initMapControls();

    syncZoneCapacitiesFromInputs();

    const defaultRates = {};
    Object.entries(ZONE_DATA).forEach(([id, z]) => { defaultRates[id] = z.baseOcc; });
    updateWarehouseTriggerBadges(defaultRates);
    renderZones(defaultRates);
    renderSliderProgress(0);

    const bootstrapResult = calcCA(getCAInputs());
    State.lastRows = buildMockRows(bootstrapResult);
    renderWarehouseOverlay(State.lastRows, {
      ...bootstrapResult,
      selectedPeriod: PERIODS[State.periodIndex],
      project:        State.selectedProject,
    });

    showPage("analise");
    console.info("[LCB] v7.4 — Ocupação futura por zona integrada");
  } catch (err) {
    console.error("[LCB] Erro na inicialização:", err);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}