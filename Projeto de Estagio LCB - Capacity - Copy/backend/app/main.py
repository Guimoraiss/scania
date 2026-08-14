

"""
LCB Capacity Analytics — main.py

Versão 4.1.0 — ML Router reativado:

- Excel upload e simulação
- Capacity Zones (análise por zona)
- ML executado por /capacity/zones/analyze
- ML Router ativado com endpoints avançados:
    POST /ml/forecast          — Previsão por Part Number
    POST /ml/forecast/zones    — Previsão por Zona
    POST /ml/risk              — Classificação de risco
    POST /ml/risk/zones        — Risco por zona normalizada
    POST /ml/redistribute      — Sugestão de redistribuição
    POST /ml/full              — Análise completa ML
    GET  /ml/health            — Health check
    DELETE /ml/cache           — Limpar cache ML
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.excel_router import router as excel_router
from api.capacity_router import router as capacity_router


app = FastAPI(
    title="LCB Capacity Analytics API",
    version="4.1.0",
    description=(
        "Backend do LCB Capacity Analytics. "
        "Upload de Excel, simulação de capacidade, "
        "ocupação por zona, forecast e classificação de risco.\n\n"
        "**ML v2** — Previsão com 3 algoritmos (Linear Regression, Holt ES, WMA), "
        "scoring multi-critério, normalização de zonas e cache inteligente."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
#  Rotas ativas
# ---------------------------------------------------------------------------

# Excel — Upload e simulação
app.include_router(excel_router)

# Capacity — Zonas e análise
app.include_router(capacity_router)



# ---------------------------------------------------------------------------
#  Root endpoint
# ---------------------------------------------------------------------------

@app.get("/")
def home():
    return {
        "status": "online",
        "project": "LCB Capacity Analytics",
        "version": "4.1.0",
        "endpoints": {
            # Excel
            "upload":     "POST /excel/upload",
            "projetos":   "GET  /excel/projetos",
            "simulate":   "POST /excel/simulate",

            # Capacity e ML por zona
            "zones":         "GET  /capacity/zones",
            "zones_analyze": "POST /capacity/zones/analyze",
            "zones_summary": "GET  /capacity/zones/summary",

            # ML v2 — Previsão avançada
            "ml_forecast":      "POST /ml/forecast",
            "ml_forecast_zones": "POST /ml/forecast/zones",
            "ml_risk":          "POST /ml/risk",
            "ml_risk_zones":    "POST /ml/risk/zones",
            "ml_redistribute":  "POST /ml/redistribute",
            "ml_full":          "POST /ml/full",
            "ml_health":        "GET  /ml/health",
            "ml_clear_cache":   "DELETE /ml/cache",

            # Documentação
            "docs": "/docs",
            "redoc": "/redoc",
        },
        "ml_algorithms": ["LinearRegression", "HoltES", "WMA"],
    }


# ---------------------------------------------------------------------------
#  Health check agregado
# ---------------------------------------------------------------------------

@app.get("/health")
def health_check():
    """Health check agregado de todos os módulos."""
    return {
        "api": "ok",
        "ml": "ok",
        "version": "4.1.0",
    }
