/**
 * LCB Capacity Analytics — api.js  (v4.3 — multi-projeto)
 *
 * Backend esperado:
 *   - POST /excel/upload
 *   - POST /excel/simulate
 *   - GET  /capacity/zones/summary
 *   - POST /capacity/zones/analyze
 */

"use strict";

/* =========================================================================
   CONFIGURAÇÃO
========================================================================= */

const API_BASE_URL = "http://127.0.0.1:8000";
const ENDPOINTS = {
  upload:       `${API_BASE_URL}/excel/upload`,
  simulate:     `${API_BASE_URL}/excel/simulate`,
  zones:        `${API_BASE_URL}/capacity/zones/summary`,
  zonesAnalyze: `${API_BASE_URL}/capacity/zones/analyze`,
};

/* =========================================================================
   ESTADO LOCAL
========================================================================= */

let _lastUploadResult  = null;
let _lastSimulResult   = null;
let _lastZonesResult   = null;
let _lastMLResult      = null;
let _uploadedFile      = null;

// Multi-projeto: array de nomes selecionados
let _selectedProjects  = [];
// Projetos disponíveis no arquivo carregado
let _availableProjects = [];

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
   COMBOBOX MULTI-PROJETO
========================================================================= */

function _renderProjectCombo(projetos) {
  _availableProjects = projetos;

  // Garante wrapper
  let wrapper = _elById("projectComboWrapper");
  if (!wrapper) {
    const uploadField = _elById("uploadZone")?.closest(".ca-field--upload");
    if (!uploadField) return;

    wrapper = document.createElement("div");
    wrapper.id        = "projectComboWrapper";
    wrapper.className = "ca-field";
    wrapper.style.display = "none";
    uploadField.insertAdjacentElement("afterend", wrapper);
  }

  // Paleta de cores para os projetos
  const PALETTE = [
    "#123b70","#16a34a","#7c3aed","#d97706","#0e7490",
    "#dc2626","#0f766e","#1d4ed8","#92400e","#166534",
  ];

  // Restaura seleção válida (projetos que ainda existem no arquivo)
  const validNomes = new Set(projetos.map(p => p.nome));
  _selectedProjects = _selectedProjects.filter(n => validNomes.has(n));

  wrapper.innerHTML = `
    <label class="ca-label">Selecionar Projeto para Simular</label>

    <div class="mpd-wrap" id="apiMpdWrap">
      <button type="button" class="mpd-trigger" id="apiMpdTrigger"
        aria-haspopup="listbox" aria-expanded="false">
        <span class="mpd-trigger__text" id="apiMpdTriggerText">— Escolha um projeto —</span>
        <svg class="mpd-trigger__chevron" width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      <div class="mpd-panel" id="apiMpdPanel" role="listbox" aria-multiselectable="true" hidden>
        <div class="mpd-panel__header">
          <span class="mpd-panel__title">Projetos no arquivo</span>
          <button type="button" class="mpd-panel__clear" id="apiMpdClear">Limpar</button>
        </div>

        <ul class="mpd-list" id="apiMpdList">
          ${projetos.map((p, i) => `
            <li class="mpd-item" data-nome="${p.nome}" role="option" aria-selected="false" tabindex="0">
              <span class="mpd-item__check">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </span>
              <span class="mpd-item__dot" style="background:${PALETTE[i % PALETTE.length]}"></span>
              <span class="mpd-item__label">${p.nome}</span>
              <span class="mpd-item__meta">${p.total_itens} peças · ${_fmt.int(p.total_cxs_periodo)} cx</span>
            </li>
          `).join("")}
        </ul>

        <div class="mpd-panel__footer">
          <span class="mpd-panel__count" id="apiMpdCount">Nenhum selecionado</span>
          <button type="button" class="mpd-panel__apply" id="apiMpdApply">Simular</button>
        </div>
      </div>
    </div>

    <p class="ca-field__hint" id="projectComboHint">
      ${projetos.length} projeto(s) encontrado(s) no arquivo.
    </p>
  `;

  wrapper.style.display = "flex";

  _attachApiDropdownEvents();
  _updateApiDropdownUI();

  // Auto-seleciona se só há 1 projeto
  if (_selectedProjects.length === 0 && projetos.length === 1) {
    _selectedProjects = [projetos[0].nome];
    _updateApiDropdownUI();
    _runSimulationMulti(_selectedProjects);
  }
}

function _attachApiDropdownEvents() {
  const trigger  = _elById("apiMpdTrigger");
  const panel    = _elById("apiMpdPanel");
  const list     = _elById("apiMpdList");
  const clearBtn = _elById("apiMpdClear");
  const applyBtn = _elById("apiMpdApply");

  if (!trigger || !panel) return;

  // Abre / fecha
  trigger.addEventListener("click", () => {
    const isOpen = !panel.hidden;
    panel.hidden = isOpen;
    trigger.setAttribute("aria-expanded", String(!isOpen));
  });

  // Fecha ao clicar fora
  document.addEventListener("click", (e) => {
    if (!_elById("apiMpdWrap")?.contains(e.target)) {
      if (panel) panel.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
    }
  }, { capture: true });

  // Toggle item
  list?.addEventListener("click", (e) => {
    const item = e.target.closest(".mpd-item");
    if (!item) return;
    _toggleApiProject(item.dataset.nome);
    _updateApiDropdownUI();
  });

  // Teclado
  list?.addEventListener("keydown", (e) => {
    const item = e.target.closest(".mpd-item");
    if (!item) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      _toggleApiProject(item.dataset.nome);
      _updateApiDropdownUI();
    }
  });

  // Limpar
  clearBtn?.addEventListener("click", () => {
    _selectedProjects = [];
    _updateApiDropdownUI();
  });

  // Simular — dispara a simulação mesclada
  applyBtn?.addEventListener("click", () => {
    if (panel) panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    if (_selectedProjects.length > 0) {
      _runSimulationMulti(_selectedProjects);
    }
  });
}

function _toggleApiProject(nome) {
  const idx = _selectedProjects.indexOf(nome);
  if (idx === -1) {
    _selectedProjects.push(nome);
  } else {
    _selectedProjects.splice(idx, 1);
  }
}

function _updateApiDropdownUI() {
  const list     = _elById("apiMpdList");
  const textEl   = _elById("apiMpdTriggerText");
  const countEl  = _elById("apiMpdCount");
  const trigger  = _elById("apiMpdTrigger");
  if (!list) return;

  // Marca / desmarca itens
  list.querySelectorAll(".mpd-item").forEach((item) => {
    const sel = _selectedProjects.includes(item.dataset.nome);
    item.classList.toggle("mpd-item--selected", sel);
    item.setAttribute("aria-selected", String(sel));
  });

  // Texto do trigger
  if (textEl) {
    if (_selectedProjects.length === 0) {
      textEl.textContent = "— Escolha um projeto —";
    } else if (_selectedProjects.length <= 2) {
      textEl.textContent = _selectedProjects.join(" + ");
    } else {
      textEl.textContent = `${_selectedProjects.slice(0, 2).join(" + ")} +${_selectedProjects.length - 2}`;
    }
  }

  // Contador
  if (countEl) {
    const n = _selectedProjects.length;
    countEl.textContent = n === 0
      ? "Nenhum selecionado"
      : `${n} projeto${n > 1 ? "s" : ""} selecionado${n > 1 ? "s" : ""}`;
  }

  // Estado visual do trigger
  if (trigger) {
    trigger.classList.toggle("mpd-trigger--has-selection", _selectedProjects.length > 0);
  }
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
   SIMULAÇÃO SIMPLES (1 projeto — mantido para compatibilidade interna)
========================================================================= */

async function _runSimulation(projeto) {
  return _runSimulationMulti([projeto]);
}

/* =========================================================================
   SIMULAÇÃO MULTI-PROJETO
   Dispara uma chamada por projeto e mescla os resultados.
========================================================================= */

async function _runSimulationMulti(projetos) {
  if (!projetos?.length) return;
  _setCalcLoading(true);

  try {
    // Dispara todas as simulações em paralelo
    const promises = projetos.map((proj) =>
      fetch(ENDPOINTS.simulate, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projeto: proj,
          period_days:         Number(_elById("caAnalysisPeriod")?.value)   || 15,
          default_daily_rate:  Number(_elById("caDefaultDailyRate")?.value)  || 7,
          capacity:            Number(_elById("caLcbCapacity")?.value)        || 140_000,
          current_occupation:  Number(_elById("caCurrentOccupation")?.value) || 0,
          safety_margin:       Number(_elById("caSafetyMargin")?.value)       || 0,
        }),
      }).then((r) => r.json())
    );

    const results = await Promise.all(promises);

    // Verifica erros individuais
    results.forEach((r, i) => {
      if (r?.detail) throw new Error(`${projetos[i]}: ${r.detail}`);
    });

    // Mescla os resultados
    const merged = _mergeSimulResults(results, projetos);
    _lastSimulResult = merged;

    const calcResult = _renderKpisFromSimulacao(merged);
    _renderTableFromSimulacao(merged.itens);
    _renderValidationAvisos(merged.avisos);
    _renderZonasInfo(merged.por_zona);

    // Atualiza hint com distribuição por zona do merge
    _renderZonasInfo(merged.por_zona);

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
   MERGE DE SIMULAÇÕES
   Soma os volumes, concatena itens e agrega zonas.
========================================================================= */

function _mergeSimulResults(results, projetos) {
  // Soma campos numéricos principais
  const totalVolume    = results.reduce((s, r) => s + (r.total_volume_periodo      ?? 0), 0);
  const totalProjOcc   = results.reduce((s, r) => s + (r.projected_occupation      ?? 0), 0);
  const totalAvailable = results.reduce((s, r) => s + (r.available_capacity        ?? 0), 0);
  const totalUsable    = results.reduce((s, r) => s + (r.usable_capacity           ?? 0), 0);

  // Capacidade vem do campo (igual para todos, usa o primeiro)
  const capacity = results[0]?.capacity ?? Number(_elById("caLcbCapacity")?.value) ?? 140_000;

  // Taxa de ocupação consolidada
  const occRate = capacity > 0 ? (totalProjOcc / capacity) * 100 : 0;

  // Status consolidado (pior caso)
  const statusPriority = { critical: 2, warning: 1, ok: 0 };
  const worstStatus = results.reduce((worst, r) => {
    const s = r.status ?? "ok";
    return statusPriority[s] > statusPriority[worst] ? s : worst;
  }, "ok");

  // Concatena todos os itens, marcando a origem
  const itens = results.flatMap((r, i) =>
    (r.itens ?? []).map((item) => ({
      ...item,
      _projeto:      projetos[i],
      projeto:       projetos[i],
    }))
  );

  // Agrega por_zona somando os valores
  const por_zona = {};
  results.forEach((r) => {
    Object.entries(r.por_zona ?? {}).forEach(([zona, val]) => {
      por_zona[zona] = (por_zona[zona] ?? 0) + val;
    });
  });

  // Agrega avisos sem duplicatas
  const avisos = [...new Set(results.flatMap((r) => r.avisos ?? []))];

  // Nome do projeto combinado
  const nomeProjeto = projetos.length === 1
    ? projetos[0]
    : projetos.join(" + ");

  return {
    // Campos que o app.js espera
    projeto:              nomeProjeto,
    projetos:             projetos.map((nome, i) => ({ id: nome, nome })),
    total_volume_periodo: totalVolume,
    projected_occupation: totalProjOcc,
    available_capacity:   totalAvailable,
    usable_capacity:      totalUsable,
    capacity,
    occupation_rate:      occRate,
    status:               worstStatus,
    itens,
    por_zona,
    avisos,
    // Zones do primeiro resultado (estrutura de detalhes por zona)
    zones:  results[0]?.zones ?? [],
  };
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
      projeto: projeto || (_selectedProjects[0] ?? null),
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

    _lastMLResult    = json;
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

  set("kpiVolumePeriod",   _fmt.int(Math.round(volPeriod)));
  set("kpiTotalCapacity",  _fmt.int(capacity));
  set("kpiUsableCapacity", _fmt.int(usable));
  set("kpiCurrentOcc",     _fmt.int(currentOcc));
  set("kpiProjectedOcc",   _fmt.int(projected));
  set("kpiAvailable",      _fmt.int(available));
  set("kpiOccRate",        _fmt.dec(occRate));
  set("kpiIncrease",       increaseNeeded > 0 ? _fmt.dec(increaseNeeded) : "0,0");

  return {
    capacity,
    currentOcc,
    usable,
    usableCapacity:  usable,
    projected,
    projectedOcc:    projected,
    available,
    occRate,
    increaseNeeded,
    volumePeriod:    volPeriod,
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
    const hasMultiProj = _selectedProjects.length > 1;
    if (thead) {
      thead.innerHTML = `
        <th>Part Number</th>
        <th>Descrição</th>
        <th>PE / Embalagem</th>
        <th>Zona Armazenagem</th>
        <th>Data Intro</th>
        <th class="num">Cxs/Período</th>
        ${hasMultiProj ? "<th>Projeto</th>" : ""}
      `;
    }
  }

  const body  = _elById("caTableBody");
  const foot  = _elById("caTableFoot");
  const badge = _elById("caTableBadge");
  if (!body) return;

  const hasMultiProj = _selectedProjects.length > 1;
  const PALETTE = [
    "#123b70","#16a34a","#7c3aed","#d97706","#0e7490",
    "#dc2626","#0f766e","#1d4ed8","#92400e","#166534",
  ];

  body.innerHTML = itens.map((item) => {
    const projIdx  = _selectedProjects.indexOf(item._projeto ?? item.projeto ?? "");
    const projColor = projIdx >= 0 ? PALETTE[projIdx % PALETTE.length] : "#475569";
    return `
      <tr>
        <td>${item.part_number || "—"}</td>
        <td>${item.descricao || "—"}</td>
        <td>${item.pckg_type || "—"}</td>
        <td>${item.storage_zone || "—"}</td>
        <td>${item.introduction_date || "—"}</td>
        <td class="num">${_fmt.int(Math.round(item.volume_calculado_periodo ?? 0))}</td>
        ${hasMultiProj
          ? `<td><span style="display:inline-flex;align-items:center;gap:4px;font-size:.7rem;font-weight:600;color:#0f172a">
               <span style="width:7px;height:7px;border-radius:2px;background:${projColor};flex-shrink:0"></span>
               ${item._projeto ?? item.projeto ?? "—"}
             </span></td>`
          : ""}
      </tr>
    `;
  }).join("");

  const totCalc = itens.reduce((a, r) => a + (r.volume_calculado_periodo ?? 0), 0);
  if (foot) {
    foot.innerHTML = `
      <tr>
        <td colspan="${hasMultiProj ? 6 : 5}">Total ${_selectedProjects.length > 1 ? `(${_selectedProjects.length} projetos)` : "do Projeto"}</td>
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
  const hasFile = input?.files?.length > 0;

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

      // Auto-simula se só houver 1 projeto (já feito dentro de _renderProjectCombo)
      // Se _selectedProjects já tem seleção prévia válida, re-simula
      if (_selectedProjects.length > 0) {
        await _runSimulationMulti(_selectedProjects);
      } else if (data.projetos.length > 1) {
        // Mais de 1 projeto: aguarda o usuário escolher
        _setCalcLoading(false);
      }
    } else {
      _showUploadFeedback("error", "⚠️ Nenhum projeto encontrado no arquivo.");
      _setCalcLoading(false);
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

/* Expõe projetos selecionados para o app.js */
function getSelectedProjects() { return [..._selectedProjects]; }

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
  getSelectedProjects,
};
