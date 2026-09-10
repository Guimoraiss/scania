"use strict";

/* =========================================================================
   LCB ASSISTENTE IA — chat.js
   Lê window.LCBState (exposto pelo app.js com: window.LCBState = State)
========================================================================= */

const LCBChat = (() => {

  const MAX_HISTORY  = 12;
  const MAX_CHARS    = 500;
  const TYPING_DELAY = 500;

  const SYSTEM_PROMPT = `Você é o Assistente LCB — especialista sênior em logística e análise de capacidade do Logistics Center Brazil (LCB) da Scania.

## Zonas do armazém
- Base 10 / Base 20 → Porta Pallets (armazenagem em rack vertical)
- T, M, 4, 0, X, 90 → Blocado (peças aguardando liberação)
- Blue Box Individual / Expedição → Blue Box

## Regras de risco (taxa de ocupação)
- < 70%: Baixo — situação confortável
- 70–90%: Médio — atenção necessária, monitorar
- > 90%: Alto — ação imediata recomendada

## Seu comportamento
- Responda sempre em português brasileiro, de forma direta e objetiva
- Use dados concretos: percentuais, volumes em caixas (cx), prazos em dias
- Quando detectar risco alto, recomende uma ação imediata específica
- Ao analisar dados fornecidos, extraia insights acionáveis
- Se não houver dados, oriente o usuário a carregá-los pelo painel de contexto
- Ao final de análises complexas, ofereça uma pergunta de acompanhamento relevante
- Nunca invente dados — baseie-se exclusivamente no que foi fornecido`;

  let history  = [];
  let context  = null;
  let isTyping = false;

  const $ = (id) => document.getElementById(id);

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", _setup);
    } else {
      _setup();
    }
  }

  function _setup() {
    document.querySelectorAll('.nav-link[data-page="chat"]').forEach(link => {
      link.addEventListener("click", () => setTimeout(_onScreenActivated, 80));
    });

    $("chatInput")?.addEventListener("input",   _onInputChange);
    $("chatInput")?.addEventListener("keydown", _onKeyDown);
    $("chatSendBtn")?.addEventListener("click", () => _send());
    $("chatBtnLoadContext")?.addEventListener("click", _loadContextFromDashboard);
    $("chatBtnApplyManual")?.addEventListener("click", _applyManualContext);
    $("chatBtnClear")?.addEventListener("click",  _clearChat);
    $("chatBtnExport")?.addEventListener("click", _exportChat);

    document.querySelectorAll(".chat-suggestion-pill").forEach(btn => {
      btn.addEventListener("click", () => { if (btn.dataset.text) _send(btn.dataset.text); });
    });

    _appendMessage("assistant",
      "Olá! Sou o **Assistente LCB** da Scania.\n\n" +
      "Posso analisar a **ocupação por zona**, classificar **riscos** e recomendar " +
      "onde **investir em expansão**.\n\n" +
      "Para respostas mais precisas, carregue os dados do armazém clicando em " +
      "**Usar dados da análise atual** no painel à esquerda."
    );
  }

  // ── Ativação da tela ──────────────────────────────────────────────────────
  function _onScreenActivated() {
    if (!context && _hasDashboardData()) {
      _loadContextFromDashboard(null, true);
    }
    $("chatInput")?.focus();
  }

  function _hasDashboardData() {
    return !!(window.LCBState?.lastResult);
  }

  // ── Contexto do dashboard ─────────────────────────────────────────────────
  function _loadContextFromDashboard(e, silent = false) {
    const result = window.LCBState?.lastResult;

    if (!result) {
      if (!silent) _setContextStatus("warn", "Rode uma análise primeiro na aba Análise de Capacidade.");
      return;
    }

    context = {
      fonte:     "Dashboard LCB",
      timestamp: new Date().toLocaleString("pt-BR"),
      resumo: {
        capacidadeTotal:      result.capacity     ?? 0,
        ocupacaoAtual:        result.currentOcc   ?? 0,
        capacidadeDisponivel: result.available    ?? 0,
        taxaOcupacaoPct:      result.occRate      ?? 0,
        status:               result.status       ?? "ok",
        volumePD:             result.volumePeriod ?? 0,
        margemSeguranca:      result.safetyAbs    ?? 0,
      },
      zonas: {
        portaPalletsBase10:  _zona(result.capPortaPalletsB10,      result.occPortaPalletsB10),
        portaPalletsBase20:  _zona(result.capPortaPalletsB20,      result.occPortaPalletsB20),
        blueBoxBase10:       _zona(result.capBlueBoxB10,           result.occBlueBoxB10),
        blueBoxBase20:       _zona(result.capBlueBoxB20,           result.occBlueBoxB20),
        blueBoxIndividual:   _zona(result.capBlueBoxIndividual,    result.occBlueBoxIndividual),
        blocado:             _zona(result.capBlocado,              result.occBlocado),
        tmx:                 _zona(result.capTMX,                  result.occTMX),
      },
    };

    // Calcula % de ocupação por zona
    Object.values(context.zonas).forEach(z => {
      z.ocupacaoPct = z.capacidade > 0 ? +((z.ocupado / z.capacidade) * 100).toFixed(1) : 0;
    });

    _updateContextBadge(true);
    if (!silent) _setContextStatus("ok", "Dados da análise carregados com sucesso.");
  }

  function _zona(cap, occ) {
    const c = cap ?? 0, o = occ ?? 0;
    return { capacidade: c, ocupado: o, disponivel: Math.max(0, c - o) };
  }

  function _applyManualContext() {
    const raw = $("chatManualContext")?.value?.trim();
    if (!raw) { _setContextStatus("warn", "Cole os dados antes de aplicar."); return; }
    context = { fonte: "Manual", timestamp: new Date().toLocaleString("pt-BR"), dados: raw };
    _updateContextBadge(true);
    _setContextStatus("ok", "Dados manuais aplicados.");
  }

  function _updateContextBadge(active) {
    const badge = $("chatContextBadge");
    if (!badge) return;
    badge.textContent = active ? "✓ Contexto ativo" : "Sem contexto";
    badge.className   = `chat-context-badge ${active ? "chat-context-badge--active" : "chat-context-badge--inactive"}`;
  }

  function _setContextStatus(type, msg) {
    const el = $("chatContextStatus");
    if (!el) return;
    const icons = {
      ok:   `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
      warn: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    };
    el.className = `chat-context-status chat-context-status--${type}`;
    el.innerHTML = `${icons[type] ?? ""} ${msg}`;
  }

  // ── Input ─────────────────────────────────────────────────────────────────
  function _onInputChange(e) {
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 112) + "px";
    const count = $("chatCharCount");
    if (count) count.textContent = `${ta.value.length} / ${MAX_CHARS}`;
  }

  function _onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); _send(); }
  }

  // ── Envio ─────────────────────────────────────────────────────────────────
  async function _send(overrideText) {
    if (isTyping) return;
    const ta   = $("chatInput");
    const text = (overrideText ?? ta?.value ?? "").trim();
    if (!text) return;

    if (ta && !overrideText) {
      ta.value = "";
      ta.style.height = "auto";
      const count = $("chatCharCount");
      if (count) count.textContent = `0 / ${MAX_CHARS}`;
    }

    _appendMessage("user", text);
    isTyping = true;
    _showTyping();

    let userContent = text;
    if (context) {
      userContent += `\n\n---\n**Dados do armazém LCB (${context.timestamp}):**\n\`\`\`json\n${JSON.stringify(context, null, 2)}\n\`\`\``;
    }

    try {
      const res = await fetch("/chat/", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: history.slice(-(MAX_HISTORY * 2)),
          context: context,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data  = await res.json();
      const reply = data?.reply;
      if (!reply) throw new Error("Resposta vazia.");

      history.push({ role: "user",      content: text  });
      history.push({ role: "assistant", content: reply });

      setTimeout(() => {
        _removeTyping();
        _appendMessage("assistant", reply, _detectIntent(text));
        isTyping = false;
      }, TYPING_DELAY);

    } catch (err) {
      console.error("[LCBChat]", err);
      setTimeout(() => {
        _removeTyping();
        _appendError("Não foi possível conectar ao assistente. Verifique se o backend está rodando.");
        isTyping = false;
      }, TYPING_DELAY);
    }
  }

  // ── Intenção ──────────────────────────────────────────────────────────────
  function _detectIntent(text) {
    const t = text.toLowerCase();
    if (/risco|crítico|alto|saturad|perigo|urgente/.test(t))           return "risco";
    if (/expan|investir|ampliar|crescer|nova área|espaço/.test(t))     return "expansao";
    if (/projeção|previsão|futuro|próximo|dias|semanas|meses/.test(t)) return "projecao";
    if (/redistribu|mover|transferir|otimizar/.test(t))                return "redistribuicao";
    return "geral";
  }

  const INTENT_CONFIG = {
    risco:          { label: "Risco",         color: "#dc2626", bg: "rgba(220,38,38,.10)"  },
    expansao:       { label: "Expansão",       color: "#16a34a", bg: "rgba(22,163,74,.10)"  },
    projecao:       { label: "Projeção",       color: "#2563eb", bg: "rgba(37,99,235,.10)"  },
    redistribuicao: { label: "Redistribuição", color: "#d97706", bg: "rgba(217,119,6,.10)"  },
    geral:          { label: "Análise",        color: "#475569", bg: "rgba(71,85,105,.10)"  },
  };

  // ── Render mensagens ──────────────────────────────────────────────────────
  function _appendMessage(role, text, intent) {
    const box = $("chatMessages");
    if (!box) return;

    const row = document.createElement("div");
    row.className = `chat-msg-row chat-msg-row--${role}`;

    const avatar = document.createElement("div");
    avatar.className = `chat-avatar chat-avatar--${role}`;
    avatar.innerHTML = role === "user"
      ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`
      : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`;

    const wrap = document.createElement("div");
    wrap.className = "chat-bubble-wrap";

    const bubble = document.createElement("div");
    bubble.className = `chat-bubble chat-bubble--${role}`;

    if (role === "assistant" && intent && intent !== "geral") {
      const cfg   = INTENT_CONFIG[intent];
      const badge = document.createElement("span");
      badge.className = "chat-intent-badge";
      badge.style.cssText = `color:${cfg.color};background:${cfg.bg};border-color:${cfg.color}40`;
      badge.textContent   = cfg.label;
      bubble.appendChild(badge);
    }

    const textEl = document.createElement("div");
    textEl.className = "chat-bubble-text";
    textEl.innerHTML  = _renderMarkdown(text);
    bubble.appendChild(textEl);

    const time = document.createElement("span");
    time.className   = "chat-time";
    time.textContent = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

    wrap.appendChild(bubble);
    wrap.appendChild(time);

    if (role === "user") { row.appendChild(wrap); row.appendChild(avatar); }
    else                 { row.appendChild(avatar); row.appendChild(wrap); }

    box.appendChild(row);
    box.scrollTop = box.scrollHeight;
  }

  function _appendError(msg) {
    const box = $("chatMessages");
    if (!box) return;
    const el = document.createElement("div");
    el.className   = "chat-error-msg";
    el.textContent = msg;
    box.appendChild(el);
    box.scrollTop = box.scrollHeight;
  }

  function _showTyping() {
    const box = $("chatMessages");
    if (!box) return;
    const row = document.createElement("div");
    row.id        = "chatTypingRow";
    row.className = "chat-msg-row chat-msg-row--assistant";
    const av = document.createElement("div");
    av.className = "chat-avatar chat-avatar--assistant";
    av.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`;
    const dots = document.createElement("div");
    dots.className = "chat-typing-dots";
    dots.innerHTML = "<span></span><span></span><span></span>";
    row.appendChild(av);
    row.appendChild(dots);
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;
  }

  function _removeTyping() { $("chatTypingRow")?.remove(); }

  // ── Markdown mínimo ───────────────────────────────────────────────────────
  function _renderMarkdown(text) {
    return text
      .replace(/&/g,  "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g,     "<em>$1</em>")
      .replace(/`(.+?)`/g,       "<code>$1</code>")
      .replace(/^#{1,3}\s+(.+)$/gm, "<strong>$1</strong>")
      .replace(/\n/g, "<br>");
  }

  // ── Utilitários ───────────────────────────────────────────────────────────
  function _clearChat() {
    if (!confirm("Limpar toda a conversa?")) return;
    history = [];
    const box = $("chatMessages");
    if (box) box.innerHTML = "";
    _appendMessage("assistant", "Conversa reiniciada. Como posso ajudar?");
  }

  function _exportChat() {
    const rows = document.querySelectorAll(".chat-msg-row");
    if (!rows.length) return;
    const lines = [
      "Exportação — Assistente LCB | Scania",
      `Data: ${new Date().toLocaleString("pt-BR")}`,
      "=".repeat(50),
    ];
    rows.forEach(row => {
      const isUser = row.classList.contains("chat-msg-row--user");
      const textEl = row.querySelector(".chat-bubble-text");
      if (!textEl) return;
      lines.push(`\n[${isUser ? "Você" : "Assistente"}]\n${textEl.innerText}`);
    });
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `lcb-chat-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return { init };

})();

LCBChat.init();
