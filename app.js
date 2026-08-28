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
   ZONE_DATA — zonas reais do LCB
========================================================================= */
const ZONE_DATA = {
  base10: {
    name:     "BASE 10",
    baseOcc:  82,
    capacity: 68_000,
    note:     "Armazenamento em pallet racks verticais — setor superior (BASE 10).",
    color:    "#4c1d95",
  },
  base20: {
    name:     "BASE 20",
    baseOcc:  79,
    capacity: 55_200,
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
    capacity: 8_000,
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
   LEITURA DAS CAPACIDADES POR ZONA (seção "Capacidade LCB")
   Retorna a capacidade física de cada zona a partir dos inputs novos.
========================================================================= */
function getZoneCapacities() {
  return {
    portaPalletsB10:   Number(el("caLcbCapPortaPalletsB10")?.value)   || 0,
    portaPalletsB20:   Number(el("caLcbCapPortaPalletsB20")?.value)   || 0,
    blueBoxB10:        Number(el("caLcbCapBlueBoxB10")?.value)        || 0,
    blueBoxB20:        Number(el("caLcbCapBlueBoxB20")?.value)        || 0,
    blueBoxIndividual: Number(el("caLcbCapBlueBoxIndividual")?.value) || 0,
    blocado:           Number(el("caLcbCapBlocado")?.value)           || 0,
    tmx:               Number(el("caLcbCapTMX")?.value)               || 0,
    // volumeFuturo lido do controle do mapa (caVolumeFuturo)
  };
}

/* =========================================================================
   LEITURA DAS OCUPAÇÕES POR ZONA (seção "Ocupadas por Tipo")
========================================================================= */
function getZoneOccupied() {
  return {
    portaPalletsB10:    Number(el("caCapPortaPalletsB10")?.value)    || 0,
    portaPalletsB20:    Number(el("caCapPortaPalletsB20")?.value)    || 0,
    blueBoxB10:         Number(el("caCapBlueBoxB10")?.value)         || 0,
    blueBoxB20:         Number(el("caCapBlueBoxB20")?.value)         || 0,
    blueBoxIndividual:  Number(el("caCapBlueBoxIndividual")?.value)  || 0,
    blocado:            Number(el("caCapBlocado")?.value)            || 0,
    tmx:                Number(el("caCapTMX")?.value)                || 0,
  };
}

/* =========================================================================
   SUBTRAÇÃO POR ZONA: capacidade − ocupada
   Atualiza os spans "Disponível: X cx" ao lado de cada campo de ocupação,
   e retorna o objeto com os disponíveis calculados.
========================================================================= */
function calcAndRenderZoneDisponivel() {
  const cap = getZoneCapacities();
  const occ = getZoneOccupied();

  const pairs = [
    { dispId: "dispPortaPalletsB10",    cap: cap.portaPalletsB10,   occ: occ.portaPalletsB10   },
    { dispId: "dispPortaPalletsB20",    cap: cap.portaPalletsB20,   occ: occ.portaPalletsB20   },
    { dispId: "dispBlueBoxB10",         cap: cap.blueBoxB10,        occ: occ.blueBoxB10        },
    { dispId: "dispBlueBoxB20",         cap: cap.blueBoxB20,        occ: occ.blueBoxB20        },
    { dispId: "dispBlueBoxIndividual",  cap: cap.blueBoxIndividual, occ: occ.blueBoxIndividual },
    { dispId: "dispBlocado",            cap: cap.blocado,           occ: occ.blocado           },
    { dispId: "dispTMX",                cap: cap.tmx,               occ: occ.tmx               },
  ];

  const result = {};
  pairs.forEach(({ dispId, cap: c, occ: o }) => {
    const disp = Math.max(0, c - o);
    const dispEl = el(dispId);
    if (dispEl) {
      const pct    = c > 0 ? Math.round((o / c) * 100) : 0;
      const status = statusByRate(pct);
      const colorMap = { ok: "#16a34a", warning: "#d97706", critical: "#dc2626" };
      dispEl.textContent = `Disponível: ${fmt.int(disp)} cx (${pct}%)`;
      dispEl.style.color = colorMap[status];
    }
    result[dispId] = disp;
  });

  return result;
}

/* =========================================================================
   TOTAIS CALCULADOS A PARTIR DAS ZONAS

   capacity   = soma de todas as capacidades por zona
   currentOcc = soma de todas as ocupações por zona

   Esses dois valores substituem os campos únicos que foram removidos
   (caLcbCapacity e caCurrentOccupation).
========================================================================= */
function calcTotalsFromZones() {
  const cap = getZoneCapacities();
  const occ = getZoneOccupied();

  const capacity = (
    cap.portaPalletsB10 +
    cap.portaPalletsB20 +
    cap.blueBoxB10 +
    cap.blueBoxB20 +
    cap.blueBoxIndividual +
    cap.blocado +
    cap.tmx
  );

  const currentOcc = (
    occ.portaPalletsB10 +
    occ.portaPalletsB20 +
    occ.blueBoxB10 +
    occ.blueBoxB20 +
    occ.blueBoxIndividual +
    occ.blocado +
    occ.tmx
  );

  return { capacity, currentOcc };
}

/* =========================================================================
   SINCRONIZA OCUPAÇÃO ATUAL POR ZONA no ZONE_DATA (para o mapa/overlay)
========================================================================= */
function syncZoneCapacitiesFromInputs() {
  const cap = getZoneCapacities();
  const occ = getZoneOccupied();

  // Atualiza ZONE_DATA com capacidades reais dos inputs de Capacidade LCB
  if (ZONE_DATA.base10)       ZONE_DATA.base10.capacity       = cap.portaPalletsB10;
  if (ZONE_DATA.base20)       ZONE_DATA.base20.capacity       = cap.portaPalletsB20;
  if (ZONE_DATA.bbpalletb10)  ZONE_DATA.bbpalletb10.capacity  = cap.blueBoxB10;
  if (ZONE_DATA.bbpalletb20)  ZONE_DATA.bbpalletb20.capacity  = cap.blueBoxB20;
  if (ZONE_DATA.bbindividual) ZONE_DATA.bbindividual.capacity = cap.blueBoxIndividual;
  if (ZONE_DATA.blocado)      ZONE_DATA.blocado.capacity      = cap.blocado;
  if (ZONE_DATA.tmx)          ZONE_DATA.tmx.capacity         = cap.tmx;

  // Atualiza ocupação atual e baseOcc para o overlay
  const zoneOccMap = {
    base10:       occ.portaPalletsB10,
    base20:       occ.portaPalletsB20,
    bbpalletb10:  occ.blueBoxB10,
    bbpalletb20:  occ.blueBoxB20,
    bbindividual: occ.blueBoxIndividual,
    blocado:      occ.blocado,
    tmx:          occ.tmx,
  };

  Object.entries(zoneOccMap).forEach(([id, value]) => {
    const zone = ZONE_DATA[id];
    if (!zone) return;
    zone.occupied = value;
    zone.baseOcc  = zone.capacity > 0 ? (value / zone.capacity) * 100 : 0;
  });

  // Renderiza os disponíveis nos inputs
  calcAndRenderZoneDisponivel();
}

/* =========================================================================
   CONTEXTO DA PREVISÃO POR ZONA
========================================================================= */
function _getZoneCurrentOccupied() {
  const occ = getZoneOccupied();
  return {
    "Base 10":             occ.portaPalletsB10,
    "Base 20":             occ.portaPalletsB20,
    "Blue Box Base 10":    occ.blueBoxB10,
    "Blue Box Base 20":    occ.blueBoxB20,
    "Blue Box Individual": occ.blueBoxIndividual,
    "Blocado":             occ.blocado,
    "T;M;4;0;X;90":       occ.tmx,
  };
}

function _syncFutureVolumeContext() {
  // caVolumeFuturo = Produção HOJE (veíc./dia) — campo Vol. Atual no mapa
  // productionVolume = Produção FUTURA (veíc./dia) — campo Vol. Futuro no mapa
  // Fórmula overlay: OcupFutura% = (OcupHoje_cx / Cap_zona) × (ProdFutura / ProdHoje) × 100
  const producaoHoje   = Number(el("caVolumeFuturo")?.value)   || 0;
  const producaoFutura = Number(el("productionVolume")?.value) || 0;

  window.lcbZonesOverlay?.setOverlayContext?.({
    zoneCurrentOccupied: _getZoneCurrentOccupied(),
    volumeAtual:  producaoHoje,    // Produção Hoje
    volumeFuturo: producaoFutura,  // Produção Futura
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

function renderTimelineTicks(periodsOverride) {
  const rangeEl = el("timelineRange");
  const wrapEl  = el("sliderTicksWrap");
  if (!rangeEl) return;

  // Usa o array de períodos do Excel se disponível, senão usa o padrão
  const activePeriods = periodsOverride || PERIODS;
  rangeEl.max = activePeriods.length - 1;
  // Atualiza referência global usada pelo listener
  State._activePeriods = activePeriods;

  if (!wrapEl) return;

  const total = activePeriods.length;
  const ticks = [];

  activePeriods.forEach((p, i) => {
    const [mon] = p.split("/");
    const m = _MONTH_TO_NUM[mon] ?? 1;
    if (m !== 1 && m !== 4 && m !== 7 && m !== 10) return;
    const pct = (i / Math.max(total - 1, 1)) * 100;
    const label = periodToQuarterLabel(p);
    ticks.push({ pct, label, i });
  });

  // Se poucos ticks (dados densos), mostra um por período
  if (ticks.length === 0) {
    activePeriods.forEach((p, i) => {
      const pct = (i / Math.max(activePeriods.length - 1, 1)) * 100;
      ticks.push({ pct, label: p, i });
    });
  }

  wrapEl.innerHTML = ticks.map(({ pct, label }) => `
    <span class="timeline-tick" style="left:${pct}%">
      <span class="timeline-tick__mark"></span>
      <span class="timeline-tick__label">${label}</span>
    </span>`).join("");
}

/* =========================================================================
   CALIBRA TIMELINE COM PERÍODOS REAIS DO EXCEL
   Extrai todas as datas de introduction_date únicas, ordena,
   e reconfigura o slider para cobrir exatamente esse range.
========================================================================= */
function calibrateTimelineFromRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return;

  const MON_PT = ["JAN","FEV","MAR","ABR","MAI","JUN","JUL","AGO","SET","OUT","NOV","DEZ"];

  // Coleta chaves únicas de introduction_date
  const keySet = new Set();
  rows.forEach(row => {
    const raw = row.introduction_date ?? row.introductionDate ?? row.intro_date ?? "";
    if (!raw) return;
    const k = window.lcbZonesOverlay?.periodKey?.(raw);
    if (k != null && Number.isFinite(k)) keySet.add(k);
  });

  // Sem datas no Excel → usa PERIODS padrão, não interfere
  if (keySet.size === 0) return;

  const sortedKeys = [...keySet].sort((a, b) => a - b);
  const minKey = sortedKeys[0];
  const maxKey = sortedKeys[sortedKeys.length - 1];

  // Proteção: range muito grande (>120 meses = 10 anos) → usa PERIODS
  if (maxKey - minKey > 120) return;

  // Gera labels mês a mês entre min e max
  const periods = [];
  for (let k = minKey; k <= maxKey; k++) {
    const rawMonth = k % 12;
    const month = rawMonth === 0 ? 12 : rawMonth;
    const year  = rawMonth === 0 ? Math.floor(k / 12) - 1 : Math.floor(k / 12);
    if (month >= 1 && month <= 12 && year >= 2020) {
      periods.push(`${MON_PT[month - 1]}/${year}`);
    }
  }

  if (periods.length < 2) return; // Menos de 2 períodos → não vale calibrar

  State._activePeriods = periods;
  State.periodIndex    = 0;

  const rangeEl = el("timelineRange");
  if (rangeEl) {
    rangeEl.min   = 0;
    rangeEl.max   = periods.length - 1;
    rangeEl.value = 0;
  }

  const periodLabel = el("selectedPeriod");
  if (periodLabel) periodLabel.textContent = periods[0];

  renderTimelineTicks(periods);
  renderSliderProgress(0);

  console.info(`[LCB] Timeline: ${periods[0]} → ${periods[periods.length - 1]} (${periods.length} meses)`);
}


function initMapControls() {
  el("timelineRange")?.addEventListener("input", e => {
    State.periodIndex = Number(e.target.value);
    renderSliderProgress(State.periodIndex);

    // Usa períodos do Excel se disponível, senão fallback ao array padrão
    const activePeriods = State._activePeriods || PERIODS;
    const currentPeriod = activePeriods[State.periodIndex] || PERIODS[State.periodIndex];

    const periodLabel = el("selectedPeriod");
    if (periodLabel) periodLabel.textContent = currentPeriod;

    if (State.hasRealData && State.lastResult) {
      syncWarehouseFromResult(State.lastResult);
    } else {
      updateWarehouseSimulated();
    }
  });

  el("productionVolume")?.addEventListener("input", e => {
    const v = Number(e.target.value);
    State.productionVolume = Number.isFinite(v) && v >= 0 ? v : 0;
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
   WAREHOUSE TRIGGER BADGES
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
    return `<span class="wh-trigger-badge wh-trigger-badge--${status}">${label} · ${Math.round(rate)}%</span>`;
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

  // Usa períodos calibrados com o Excel se disponível
  const activePeriods  = State._activePeriods || PERIODS;
  const selectedPeriod = el("selectedPeriod")?.textContent
    || activePeriods[State.periodIndex]
    || null;

  const project = State.selectedProject;

  overlay.setOverlayContext?.({
    selectedPeriod,
    project,
    thresholdMedium: STATUS_THRESHOLD.WARNING,
    thresholdHigh:   STATUS_THRESHOLD.CRITICAL,
    zoneCurrentOccupied: _getZoneCurrentOccupied(),
    volumeAtual:  Number(el("caVolumeFuturo")?.value)    || 0,  // Produção Hoje
    volumeFuturo: Number(el("productionVolume")?.value)  || State.productionVolume || 0,  // Produção Futura
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
function calcZoneRates() {
  const rates = {};
  Object.entries(ZONE_DATA).forEach(([id, z]) => {
    const occupied = Number(z.occupied ?? 0);
    rates[id] = z.capacity > 0 ? Math.max(0, Math.round((occupied / z.capacity) * 100)) : 0;
  });
  return rates;
}

function updateWarehouseSimulated() {
  const zones = calcZoneRates();
  renderZones(zones);
  updateWarehouseTriggerBadges(zones);

  const inputs = getCAInputs();
  const rows = Array.isArray(State.lastRows) && State.lastRows.length > 0
    ? State.lastRows
    : buildMockRows(calcCA(inputs));

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

  syncZoneCapacitiesFromInputs();
  _syncFutureVolumeContext();

  const rates = calcZoneRates();
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
    const cap          = result?.capacity ?? 0;

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
   ANÁLISE DE CAPACIDADE — CÁLCULO LOCAL

   capacity   = soma automática das zonas de Capacidade LCB
   currentOcc = soma automática das zonas de Ocupadas por Tipo
   safetyMargin é calculada sobre a capacity total
========================================================================= */
function getCAInputs() {
  const { capacity, currentOcc } = calcTotalsFromZones();
  const cap = getZoneCapacities();
  const occ = getZoneOccupied();

  return {
    // Totais calculados automaticamente pelas zonas
    capacity,
    currentOcc,

    // Margem de segurança — único campo mantido do bloco antigo
    safetyMargin: Number(el("caSafetyMargin")?.value) || 0,

    // Defaults de operação
    periodDays: 15,
    dailyRate:  7,

    // Capacidades individuais por zona (para KPIs e overlay)
    capPortaPalletsB10:   cap.portaPalletsB10,
    capPortaPalletsB20:   cap.portaPalletsB20,
    capBlueBoxB10:        cap.blueBoxB10,
    capBlueBoxB20:        cap.blueBoxB20,
    capBlueBoxIndividual: cap.blueBoxIndividual,
    capBlocado:           cap.blocado,
    capTMX:               cap.tmx,

    // Ocupações individuais por zona (para KPIs e overlay)
    occPortaPalletsB10:   occ.portaPalletsB10,
    occPortaPalletsB20:   occ.portaPalletsB20,
    occBlueBoxB10:        occ.blueBoxB10,
    occBlueBoxB20:        occ.blueBoxB20,
    occBlueBoxIndividual: occ.blueBoxIndividual,
    occBlocado:           occ.blocado,
    occTMX:               occ.tmx,

    volumeAtual: Number(el("caVolumeFuturo")?.value) || 0,
  };
}

function calcCA(inputs, totalProjectionOverride) {
  const { capacity, currentOcc, periodDays, safetyMargin, dailyRate } = inputs;
  const projectFactors = { todos: 1, china: 1.0, europa: 0.85, bev: 1.2, powertrain: 0.95 };
  const factor          = projectFactors[State.selectedProject] ?? 1;
  const volumePeriod    = State.productionVolume * periodDays;

  // Se veio override do backend, usa ele; senão calcula local
  const totalProjection = totalProjectionOverride != null
    ? Math.round(totalProjectionOverride)
    : Math.round(volumePeriod * dailyRate * factor);

  const safetyAbs       = Math.round(capacity * (safetyMargin / 100));
  const usableCapacity  = Math.max(0, capacity - safetyAbs);
  const projectedOcc    = currentOcc + totalProjection;

  const available = capacity - currentOcc - safetyAbs - totalProjection;

  const occRate = capacity > 0
    ? Math.min((projectedOcc / capacity) * 100, 200)
    : 200;

  const status = available < 0 ? "critical" : statusByRate(occRate);

  return {
    volumePeriod: totalProjection, totalProjection, capacity, currentOcc,
    usableCapacity, projectedOcc, available, occRate, status,
    safetyAbs, periodDays, dailyRate,
    capPortaPalletsB10:   inputs.capPortaPalletsB10,
    capPortaPalletsB20:   inputs.capPortaPalletsB20,
    capBlueBoxB10:        inputs.capBlueBoxB10,
    capBlueBoxB20:        inputs.capBlueBoxB20,
    capBlueBoxIndividual: inputs.capBlueBoxIndividual,
    capBlocado:           inputs.capBlocado,
    capTMX:               inputs.capTMX,
    occPortaPalletsB10:   inputs.occPortaPalletsB10,
    occPortaPalletsB20:   inputs.occPortaPalletsB20,
    occBlueBoxB10:        inputs.occBlueBoxB10,
    occBlueBoxB20:        inputs.occBlueBoxB20,
    occBlueBoxIndividual: inputs.occBlueBoxIndividual,
    occBlocado:           inputs.occBlocado,
    occTMX:               inputs.occTMX,
    volumeAtual:          inputs.volumeAtual,
    volumeFuturo:         inputs.volumeAtual,
  };
}

/* buildMockRows */
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
   DONUT CHART
   Os valores refletem diretamente a subtração zona a zona:
     - Ocupação Atual  = soma das ocupadas
     - Aumento PD      = volume projetado do PD
     - Margem Seg.     = % sobre a capacidade total
     - Disponível      = capacity - currOcc - volPD - margin
========================================================================= */
function renderDonutChart(result) {
  const canvas = el("caDonutChart");
  if (!canvas || typeof Chart === "undefined") {
    if (typeof Chart === "undefined") setTimeout(() => renderDonutChart(result), 200);
    return;
  }

  const cap     = Math.round(result.capacity);
  const currOcc = Math.round(result.currentOcc);
  const volPD   = Math.round(result.volumePeriod ?? result.totalProjection ?? 0);
  // Usa safetyAbs do result se disponível, senão recalcula
  const margin  = result.safetyAbs != null
    ? Math.round(result.safetyAbs)
    : Math.round(cap * ((Number(el("caSafetyMargin")?.value) || 0) / 100));
  // Disponível nunca negativo no donut — zero se excedeu
  const availRaw = cap - currOcc - volPD - margin;
  const avail    = Math.max(0, availRaw);
  const projOcc  = Math.round(result.projectedOcc ?? result.projected ?? (currOcc + volPD));

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
            const pct = cap > 0 ? ((ctx.parsed / cap) * 100).toFixed(1) : "0,0";
            return ` ${ctx.label}: ${Number(ctx.parsed).toLocaleString("pt-BR")} cx (${pct}%)`;
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
   Reflete a subtração: Capacidade − Ocupação − Margem − Volume PD = Disponível
========================================================================= */
function renderEngine(result) {
  const container = el("caEngineContainer");
  if (!container) return;

  const cap     = Math.round(result.capacity);
  const currOcc = Math.round(result.currentOcc);
  // Usa safetyAbs do result se disponível, senão recalcula
  const margin  = result.safetyAbs != null
    ? Math.round(result.safetyAbs)
    : Math.round(cap * ((Number(el("caSafetyMargin")?.value) || 0) / 100));
  const volPD   = Math.round(result.volumePeriod ?? result.totalProjection ?? 0);
  const avail   = cap - currOcc - margin - volPD;

  // Status real: crítico se negativo
  const status  = avail < 0 ? "critical" : (result.status ?? statusByRate(result.occRate));
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
      ${step("CAPACIDADE", cap,     "Σ Capacidade por Zona")}
      ${op("−")}
      ${step("OCUPAÇÃO",   currOcc, "Σ Ocupação por Zona")}
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
   VEREDICTO
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
   KPIs — mostra capacidade e ocupação por zona + disponível calculado
========================================================================= */
function renderCAKpis(result) {
  const grid = el("caKpiGrid");
  if (!grid) return;

  const cap     = result.capacity;
  const currOcc = result.currentOcc;
  const avail   = result.available ?? (cap - currOcc);
  const occRate = result.occRate ?? 0;
  const status  = result.status ?? statusByRate(occRate);

  const kSC = status === "critical" ? "ca-kpi--crit" :
              status === "warning"  ? "ca-kpi--warn" : "ca-kpi--ok";

  // Disponíveis por zona: capacidade − ocupada
  const dispB10  = Math.max(0, (result.capPortaPalletsB10   || 0) - (result.occPortaPalletsB10   || 0));
  const dispB20  = Math.max(0, (result.capPortaPalletsB20   || 0) - (result.occPortaPalletsB20   || 0));
  const dispBB10 = Math.max(0, (result.capBlueBoxB10        || 0) - (result.occBlueBoxB10        || 0));
  const dispBB20 = Math.max(0, (result.capBlueBoxB20        || 0) - (result.occBlueBoxB20        || 0));
  const dispBBI  = Math.max(0, (result.capBlueBoxIndividual || 0) - (result.occBlueBoxIndividual || 0));
  const dispBloc = Math.max(0, (result.capBlocado           || 0) - (result.occBlocado           || 0));
  const dispTMX  = Math.max(0, (result.capTMX               || 0) - (result.occTMX               || 0));

  // Fórmula: Ocup. Futura % = (OcupHoje_cx × ProdFutura / ProdHoje) / Capacidade × 100
  const producaoHoje   = Number(el("caVolumeFuturo")?.value)   || 0;
  const producaoFutura = Number(el("productionVolume")?.value) || State.productionVolume || 0;
  const capacidadeTotal = cap || 1;
  const occFuturaGlobal = (producaoHoje > 0 && cap > 0)
    ? Math.min(((currOcc * producaoFutura / producaoHoje) / capacidadeTotal) * 100, 200)
    : null;

  const occFuturaStr    = occFuturaGlobal !== null ? `${occFuturaGlobal.toFixed(1).replace(".", ",")}%` : "—";
  const occFuturaStatus = occFuturaGlobal !== null ? statusByRate(occFuturaGlobal) : "ok";
  const occFuturaClass  = occFuturaGlobal !== null
    ? (occFuturaStatus === "critical" ? "ca-kpi--crit" : occFuturaStatus === "warning" ? "ca-kpi--warn" : "ca-kpi--ok")
    : "";

  const availDisplay = avail < 0
    ? `−${fmt.int(Math.abs(Math.round(avail)))}`
    : fmt.int(Math.round(avail));
  const availDesc = avail < 0
    ? `Excedido em ${fmt.int(Math.abs(Math.round(avail)))} cx`
    : "Folga após introdução do PD";

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

  grid.innerHTML =
    kpi("Capacidade Total (Σ Zonas)", fmt.int(cap),                        "caixas", "Soma das capacidades por zona",        "boxes") +
    kpi("Ocupação Total (Σ Zonas)",   fmt.int(Math.round(currOcc)),        "caixas", "Soma das ocupações por zona",          "users") +
    kpi("Capacidade Disponível",      availDisplay,                        "caixas", availDesc,                             "check",   kSC) +
    kpi("Ocup. Futura Projetada",     occFuturaStr,                        "%",      `${fmt.int(Math.round(currOcc))} cx × ${fmt.int(producaoFutura)} ÷ ${fmt.int(producaoHoje)} veíc./dia`,   "trending", occFuturaClass) +
    kpi("Disp. Porta Pallets B10",    fmt.int(dispB10),                   "caixas", `Cap ${fmt.int(result.capPortaPalletsB10 || 0)} − Occ ${fmt.int(result.occPortaPalletsB10 || 0)}`,  "layers",  "ca-kpi--highlight") +
    kpi("Disp. Porta Pallets B20",    fmt.int(dispB20),                   "caixas", `Cap ${fmt.int(result.capPortaPalletsB20 || 0)} − Occ ${fmt.int(result.occPortaPalletsB20 || 0)}`,  "layers",  "ca-kpi--highlight") +
    kpi("Disp. Blue Box B10",         fmt.int(dispBB10),                  "caixas", `Cap ${fmt.int(result.capBlueBoxB10 || 0)} − Occ ${fmt.int(result.occBlueBoxB10 || 0)}`,            "cube",    "ca-kpi--highlight") +
    kpi("Disp. Blue Box B20",         fmt.int(dispBB20),                  "caixas", `Cap ${fmt.int(result.capBlueBoxB20 || 0)} − Occ ${fmt.int(result.occBlueBoxB20 || 0)}`,            "cube",    "ca-kpi--highlight") +
    kpi("Disp. Blue Box Individual",  fmt.int(dispBBI),                   "caixas", `Cap ${fmt.int(result.capBlueBoxIndividual || 0)} − Occ ${fmt.int(result.occBlueBoxIndividual || 0)}`, "cube", "ca-kpi--highlight") +
    kpi("Disp. Blocado",              fmt.int(dispBloc),                  "caixas", `Cap ${fmt.int(result.capBlocado || 0)} − Occ ${fmt.int(result.occBlocado || 0)}`,                   "lock",    "ca-kpi--highlight") +
    kpi("Disp. T;M;4;0;X;90",        fmt.int(dispTMX),                   "caixas", `Cap ${fmt.int(result.capTMX || 0)} − Occ ${fmt.int(result.occTMX || 0)}`,                           "layers",  "ca-kpi--highlight");
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

      const inputs     = getCAInputs();
      // Recalcula localmente usando o volumePeriod REAL do backend
      // para garantir que status/available batem com o que é exibido
      const backendVol = calcResult.volumePeriod ?? 0;
      const localCalc  = calcCA(inputs, backendVol);

      const resultForRender = {
        // Tudo de localCalc — calculado com volumePeriod real do backend
        status:               localCalc.status,
        occRate:              localCalc.occRate,
        available:            localCalc.available,
        safetyAbs:            localCalc.safetyAbs,
        projectedOcc:         localCalc.projectedOcc,
        usableCapacity:       localCalc.usableCapacity,
        volumePeriod:         localCalc.volumePeriod,
        totalProjection:      localCalc.totalProjection,
        capacity:             localCalc.capacity,
        currentOcc:           localCalc.currentOcc,
        increaseNeeded:       calcResult.increaseNeeded,
        projectName:          simulation.projeto || "",
        porZona:              simulation.por_zona || {},
        zones:                Array.isArray(simulation.zones) ? simulation.zones : [],
        capPortaPalletsB10:   inputs.capPortaPalletsB10,
        capPortaPalletsB20:   inputs.capPortaPalletsB20,
        capBlueBoxB10:        inputs.capBlueBoxB10,
        capBlueBoxB20:        inputs.capBlueBoxB20,
        capBlueBoxIndividual: inputs.capBlueBoxIndividual,
        capBlocado:           inputs.capBlocado,
        capTMX:               inputs.capTMX,
        occPortaPalletsB10:   inputs.occPortaPalletsB10,
        occPortaPalletsB20:   inputs.occPortaPalletsB20,
        occBlueBoxB10:        inputs.occBlueBoxB10,
        occBlueBoxB20:        inputs.occBlueBoxB20,
        occBlueBoxIndividual: inputs.occBlueBoxIndividual,
        occBlocado:           inputs.occBlocado,
        occTMX:               inputs.occTMX,
        volumeAtual:          inputs.volumeAtual,
        volumeFuturo:         inputs.volumeAtual,
      };

      renderAll(resultForRender);
    },
    () => runLocalCACalculation()
  );
}

function renderAll(result) {
  State.lastResult  = result;
  State.hasRealData = true;

  // Calibra a timeline apenas na primeira vez que dados reais chegam
  // (evita resetar o slider a cada recálculo manual)
  if (!State._timelineCalibrated && Array.isArray(State.lastRows) && State.lastRows.length > 0) {
    calibrateTimelineFromRows(State.lastRows);
    State._timelineCalibrated = true;
  }

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
   EVENTOS DE ANÁLISE
========================================================================= */
function initAnalise() {
  if (!_calcListenerAttached) {
    el("btnCalcAnalise")?.addEventListener("click", handleCalcClick);
    _calcListenerAttached = true;
  }

  el("btnUseMock")?.addEventListener("click", () => {
    // Valores padrão para Capacidade LCB
    const capDefaults = {
      caLcbCapPortaPalletsB10:   68_000,
      caLcbCapPortaPalletsB20:   55_200,
      caLcbCapBlueBoxB10:        8_000,
      caLcbCapBlueBoxB20:        8_000,
      caLcbCapBlueBoxIndividual: 4_200,
      caLcbCapBlocado:           19_800,
      caLcbCapTMX:               8_000,
      caSafetyMargin:            10,
    };
    // Valores padrão para Ocupadas por Tipo
    const occDefaults = {
      caCapPortaPalletsB10:   37_400,
      caCapPortaPalletsB20:   30_600,
      caCapBlueBoxB10:        8_000,
      caCapBlueBoxB20:        8_000,
      caCapBlueBoxIndividual: 4_200,
      caCapBlocado:           19_800,
      caCapTMX:               0,
      caVolumeFuturo:         0,
    };
    Object.entries({ ...capDefaults, ...occDefaults }).forEach(([id, v]) => {
      const e = el(id);
      if (e) e.value = v;
    });
    syncZoneCapacitiesFromInputs();
    runLocalCACalculation();
  });

  // IDs dos campos de Capacidade LCB
  const capIds = [
    "caLcbCapPortaPalletsB10", "caLcbCapPortaPalletsB20",
    "caLcbCapBlueBoxB10",      "caLcbCapBlueBoxB20",
    "caLcbCapBlueBoxIndividual","caLcbCapBlocado",
    "caLcbCapTMX",
    "caSafetyMargin",
  ];

  // IDs dos campos de Ocupadas por Tipo
  const occIds = [
    "caCapPortaPalletsB10", "caCapPortaPalletsB20",
    "caCapBlueBoxB10",      "caCapBlueBoxB20",
    "caCapBlueBoxIndividual","caCapBlocado",
    "caCapTMX",             "caVolumeFuturo",
  ];

  [...capIds, ...occIds].forEach(id => {
    el(id)?.addEventListener("input", () => {
      syncZoneCapacitiesFromInputs();
      _syncFutureVolumeContext();
      // Recalcula e atualiza disponíveis em tempo real
      calcAndRenderZoneDisponivel();
      if (el("caResultCards")?.style.display !== "none") handleCalcClick();
    });
  });

  const uploadZone  = el("uploadZone");
  const excelInput  = el("excelInput");
  const uploadLabel = el("uploadLabel");

  function applyFile(file) {
    if (!file) return;
    // Novo arquivo → reseta calibração da timeline para o próximo cálculo
    State._timelineCalibrated = false;
    State._activePeriods      = null;
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
    initDrawer();
    initAnalise();
    initMapControls();

    // Sincroniza zonas e renderiza disponíveis na carga inicial
    syncZoneCapacitiesFromInputs();
    calcAndRenderZoneDisponivel();

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
    console.info("[LCB] v8.0 — Capacidade e ocupação calculadas por zona");
  } catch (err) {
    console.error("[LCB] Erro na inicialização:", err);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
