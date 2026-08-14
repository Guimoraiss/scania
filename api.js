/**
 * LCB Capacity Analytics — api.js  (v4.2 — alinhado ao backend atual)
 *
 * Backend esperado:
 *   - POST /excel/upload
 *   - POST /excel/simulate
 *   - GET  /capacity/zones/summary
 *   - POST /capacity/zones/analyze
 *
 * Removido:
 *   - /ml/full
 *
 * A aba ML chama diretamente /capacity/zones/analyze.
 */

"use strict";

/* =========================================================================
   CONFIGURAÇÃO
========================================================================= */

const API_BASE_URL = String(
  window.LCB_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");
const ENDPOINTS = {
  upload:       `${API_BASE_URL}/excel/upload`,
  simulate:     `${API_BASE_URL}/excel/simulate`,
  zones:        `${API_BASE_URL}/capacity/zones/summary`,
  zonesAnalyze: `${API_BASE_URL}/capacity/zones/analyze`,
};

/* =========================================================================
   ESTADO LOCAL
========================================================================= */

let _lastUploadResult = null;   // ProjFuturoResponse
let _lastSimulResult   = null;  // SimulacaoResponse
let _lastZonesResult   = null;   // ZonesResponse
let _lastMLResult      = null;   // Resultado da análise ML / zonas
let _selectedProject   = null;   // string
let _uploadedFile      = null;   // File (mantido por compatibilidade)

/* =========================================================================
   HELPERS DE UI
========================================================================= */

function _elById(id) {
  return document.getElementById(id);
}

function _showUploadFeedback(type, text) {
  const zone  = _elById("uploadZone");
  const label = _elById("uploadLabel");
  if (!zone || !label) return;

  zone.classList.remove("file-loaded", "drag-over", "upload-error");
  if (type === "success") zone.classList.add("file-loaded");
  if (type === "error")   zone.classList.add("upload-error");
  label.textContent = text;
}

function _setCalcLoading(loading) {
  const btn = _elById("btnCalcAnalise");
  if (!btn) return;
  btn.disabled = loading;
  btn.dataset.originalText = btn.dataset.originalText ?? btn.textContent;
  btn.textContent = loading ? "Processando…" : btn.dataset.originalText;
}

function _setMLLoading(loading) {
  const btn = _elById("btnRunML");
  if (!btn) return;
  btn.disabled = loading;
  btn.dataset.originalText = btn.dataset.originalText ?? btn.textContent;
  btn.textContent = loading ? "Analisando com IA…" : btn.dataset.originalText;
}

/* =========================================================================
   FORMATAÇÃO
========================================================================= */

const _fmt = {
  int: (v) => Number(v).toLocaleString("pt-BR"),
  dec: (v) => Number(v).toFixed(1).replace(".", ","),
  pct: (v) => `${Number(v).toFixed(1).replace(".", ",")}%`,
};

/* =========================================================================
   COMBOBOX DE PROJETOS
========================================================================= */

function _renderProjectCombo(projetos) {
  let wrapper = _elById("projectComboWrapper");

  if (!wrapper) {
    const uploadField = _elById("uploadZone")?.closest(".ca-field--upload");
    if (!uploadField) return;

    wrapper = document.createElement("div");
    wrapper.id = "projectComboWrapper";
    wrapper.className = "ca-field";
    wrapper.style.display = "none";
    wrapper.innerHTML = `
      <label class="ca-label" for="projectCombo">Selecionar Projeto para Simular</label>
      <select id="projectCombo" class="ca-input">
        <option value="">— Escolha um projeto —</option>
      </select>
      <p class="ca-field__hint" id="projectComboHint"></p>
    `;

    uploadField.insertAdjacentElement("afterend", wrapper);

    _elById("projectCombo")?.addEventListener("change", async (e) => {
      const proj = e.target.value;
      if (!proj) return;
      _selectedProject = proj;
      await _runSimulation(proj);
    });
  }

  const sel = _elById("projectCombo");
  if (!sel) return;

  sel.innerHTML = '<option value="">— Escolha um projeto —</option>';
  projetos.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.nome;
    opt.textContent = `${p.nome}  (${p.total_itens} peças · ${_fmt.int(p.total_cxs_periodo)} cx)`;
    sel.appendChild(opt);
  });

  if (_selectedProject) sel.value = _selectedProject;
  wrapper.style.display = "flex";

  const hint = _elById("projectComboHint");
  if (hint) hint.textContent = `${projetos.length} projeto(s) encontrado(s) no arquivo.`;
}

/* =========================================================================
   UPLOAD
========================================================================= */

async function _uploadExcel() {
  const input = _elById("excelInput");
  if (!input?.files?.length) return null;

  _uploadedFile = input.files[0];

  const formData = new FormData();
  formData.append("file", _uploadedFile);
  formData.append("period_days", _elById("caAnalysisPeriod")?.value || "15");
  formData.append("default_daily_rate", _elById("caDefaultDailyRate")?.value || "7");

  const response = await fetch(ENDPOINTS.upload, {
    method: "POST",
    body: formData,
  });

  const json = await response.json().catch(() => {
    throw new Error(`Resposta inválida do servidor (status ${response.status}).`);
  });

  if (!response.ok) throw new Error(json?.detail ?? `Erro ${response.status}`);
  return json;
}

/* =========================================================================
   SIMULAÇÃO
========================================================================= */

async function _runSimulation(projeto) {
  if (!projeto) return;
  _setCalcLoading(true);

  try {
    const body = {
      projeto,
      period_days: Number(_elById("caAnalysisPeriod")?.value) || 15,
      default_daily_rate: Number(_elById("caDefaultDailyRate")?.value) || 7,
      capacity: Number(_elById("caLcbCapacity")?.value) || 140_000,
      current_occupation: Number(_elById("caCurrentOccupation")?.value) || 0,
      safety_margin: Number(_elById("caSafetyMargin")?.value) || 0,
    };

    const response = await fetch(ENDPOINTS.simulate, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const json = await response.json().catch(() => {
      throw new Error(`Resposta inválida do servidor (status ${response.status}).`);
    });

    if (!response.ok) throw new Error(json?.detail ?? `Erro ${response.status}`);

    _lastSimulResult = json;

    const calcResult = _renderKpisFromSimulacao(json);
    _renderTableFromSimulacao(json.itens);
    _renderValidationAvisos(json.avisos);
    _renderZonasInfo(json.por_zona);

    if (typeof window._onSimulacaoSuccess === "function") {
      window._onSimulacaoSuccess(calcResult);
    }

    await fetchZonesSummary();
  } catch (err) {
    console.error("[LCB API] Erro na simulação:", err);
    _showUploadFeedback("error", `⚠️ ${err.message}`);
  } finally {
    _setCalcLoading(false);
  }
}

/* =========================================================================
   CAPACITY ZONES — resumo rápido
========================================================================= */

async function fetchZonesSummary() {
  try {
    const capacity = Number(_elById("caLcbCapacity")?.value) || 140_000;
    const url = `${ENDPOINTS.zones}?capacity=${capacity}`;
    const response = await fetch(url);
    if (!response.ok) return;

    const json = await response.json();
    _lastZonesResult = json;

    if (typeof window._onZonesSummaryReady === "function") {
      window._onZonesSummaryReady(json);
    }
  } catch (err) {
    console.warn("[LCB API] Zones summary não disponível:", err.message);
  }
}

/* =========================================================================
   ML / ZONES ANALYZE
========================================================================= */

async function runMLAnalysis(projeto) {
  _setMLLoading(true);

  try {
    const body = {
      total_capacity_lcb: Number(_elById("mlCapacity")?.value) || 140_000,
      zone_capacities: {},
      forecast_horizon: Number(_elById("mlForecastHorizon")?.value) || 3,
      include_forecast: true,
      projeto: projeto || _selectedProject || null,
    };

    const response = await fetch(ENDPOINTS.zonesAnalyze, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const json = await response.json().catch(() => {
      throw new Error(`Resposta inválida do servidor (status ${response.status}).`);
    });

    if (!response.ok) throw new Error(json?.detail ?? `Erro ${response.status}`);

    _lastMLResult = json;
    _lastZonesResult = json;

    if (typeof window._onMLReady === "function") {
      window._onMLReady(json);
    }

    return json;
  } finally {
    _setMLLoading(false);
  }
}

/* =========================================================================
   RENDER: KPIs
========================================================================= */

function _renderKpisFromSimulacao(data) {
  const capacity   = Number(_elById("caLcbCapacity")?.value) || 140_000;
  const usable     = Math.round(data.usable_capacity);
  const currentOcc = Math.round(data.projected_occupation - data.total_volume_periodo);
  const projected  = Math.round(data.projected_occupation);
  const available  = Math.round(data.available_capacity);
  const occRate    = data.occupation_rate;
  const volPeriod  = data.total_volume_periodo;

  const increaseNeeded = projected > usable
    ? ((projected - usable) / capacity) * 100
    : 0;

  const set = (id, v) => {
    const e = _elById(id);
    if (e) e.textContent = v;
  };

  set("kpiVolumePeriod", _fmt.int(Math.round(volPeriod)));
  set("kpiTotalCapacity", _fmt.int(capacity));
  set("kpiUsableCapacity", _fmt.int(usable));
  set("kpiCurrentOcc", _fmt.int(currentOcc));
  set("kpiProjectedOcc", _fmt.int(projected));
  set("kpiAvailable", _fmt.int(available));
  set("kpiOccRate", _fmt.dec(occRate));
  set("kpiIncrease", increaseNeeded > 0 ? _fmt.dec(increaseNeeded) : "0,0");

  return {
    capacity,
    currentOcc,
    usable,
    usableCapacity: usable,
    projected,
    projectedOcc: projected,
    available,
    occRate,
    increaseNeeded,
    volumePeriod: volPeriod,
    status: data.status === "critical"
      ? "critical"
      : data.status === "warning"
        ? "warning"
        : "ok",
  };
}

/* =========================================================================
   RENDER: TABELA
========================================================================= */

function _renderTableFromSimulacao(itens) {
  if (!itens) return;

  const table = _elById("caItemsTable");
  if (table) {
    const thead = table.querySelector("thead tr");
    if (thead) {
      thead.innerHTML = `
        <th>Part Number</th>
        <th>Descrição</th>
        <th>PE / Embalagem</th>
        <th>Zona Armazenagem</th>
        <th>Data Intro</th>
        <th class="num">Cxs/Período</th>
      `;
    }
  }

  const body  = _elById("caTableBody");
  const foot  = _elById("caTableFoot");
  const badge = _elById("caTableBadge");
  if (!body) return;

  body.innerHTML = itens.map((item) => `
    <tr>
      <td>${item.part_number || "—"}</td>
      <td>${item.descricao || "—"}</td>
      <td>${item.pckg_type || "—"}</td>
      <td>${item.storage_zone || "—"}</td>
      <td>${item.introduction_date || "—"}</td>
      <td class="num">${_fmt.int(Math.round(item.volume_calculado_periodo ?? 0))}</td>
    </tr>
  `).join("");

  const totCalc = itens.reduce((a, r) => a + (r.volume_calculado_periodo ?? 0), 0);
  if (foot) {
    foot.innerHTML = `
      <tr>
        <td colspan="5">Total do Projeto</td>
        <td class="num">${_fmt.int(Math.round(totCalc))}</td>
      </tr>
    `;
  }

  if (badge) badge.textContent = `${itens.length} ${itens.length === 1 ? "peça" : "peças"}`;
}

/* =========================================================================
   RENDER: AVISOS E ZONAS
========================================================================= */

function _renderValidationAvisos(avisos) {
  const container = _elById("caRecommendationText");
  if (!container || !avisos?.length) return;
  container.textContent = "ℹ️ " + avisos.join(" | ");
}

function _renderZonasInfo(porZona) {
  const hint = _elById("projectComboHint");
  if (!hint || !porZona || !Object.keys(porZona).length) return;
  const zonaStr = Object.entries(porZona)
    .sort((a, b) => b[1] - a[1])
    .map(([z, v]) => `${z}: ${_fmt.int(v)} cx`)
    .join("  ·  ");
  hint.textContent = "Distribuição por zona — " + zonaStr;
}

/* =========================================================================
   API PÚBLICA
========================================================================= */

async function runIfFileLoaded(onSuccess, onNoFile) {
  const input   = _elById("excelInput");
  const hasFile  = input?.files?.length > 0;

  if (!hasFile) {
    onNoFile?.();
    return;
  }

  window._onSimulacaoSuccess = onSuccess;
  _setCalcLoading(true);

  try {
    const data = await _uploadExcel();
    _lastUploadResult = data;

    if (data.status === "error") {
      const msg = data.validacao?.mensagens?.[0] ?? "Erro no arquivo enviado.";
      _showUploadFeedback("error", `⚠️ ${msg}`);
      return;
    }

    const label = data.status === "partial"
      ? `⚠️ ${data.metadata.nome_arquivo} (colunas opcionais ausentes)`
      : `✓ ${data.metadata.nome_arquivo} — ${data.metadata.linhas_validas} peças`;
    _showUploadFeedback(data.status === "partial" ? "warning" : "success", label);

    if (data.projetos?.length) {
      _renderProjectCombo(data.projetos);

      const autoProj = _selectedProject && data.projetos.find(p => p.nome === _selectedProject)
        ? _selectedProject
        : data.projetos.length === 1
          ? data.projetos[0].nome
          : null;

      if (autoProj) {
        _selectedProject = autoProj;
        const sel = _elById("projectCombo");
        if (sel) sel.value = autoProj;
        await _runSimulation(autoProj);
      } else {
        _setCalcLoading(false);
      }
    } else {
      _showUploadFeedback("error", "⚠️ Nenhum projeto encontrado no arquivo.");
    }
  } catch (err) {
    console.error("[LCB API] Erro no upload:", err);
    _showUploadFeedback("error", `⚠️ ${err.message}`);
    _setCalcLoading(false);
  }
}

function getLastResult()      { return _lastSimulResult ?? _lastUploadResult; }
function getLastZonesResult() { return _lastZonesResult; }
function getLastMLResult()    { return _lastMLResult; }

/* =========================================================================
   EXPOSIÇÃO GLOBAL
========================================================================= */

window.lcbApi = {
  ...(window.lcbApi || {}),
  runIfFileLoaded,
  runMLAnalysis,
  fetchZonesSummary,
  getLastResult,
  getLastZonesResult,
  getLastMLResult,
};
