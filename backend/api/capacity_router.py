"""
LCB Capacity Analytics
api/capacity_router.py

Endpoints:
  GET  /capacity/zones
  POST /capacity/zones/analyze
  GET  /capacity/zones/summary

As rotas utilizam request.app.state para acessar exatamente
os mesmos itens armazenados pelo POST /excel/upload.
"""

from __future__ import annotations

from typing import Optional

from fastapi import (
    APIRouter,
    HTTPException,
    Query,
    Request,
)
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from services.capacity_service import calculate_zones


router = APIRouter(
    prefix="/capacity",
    tags=["Capacity"],
)


# ---------------------------------------------------------------------------
# Request da análise completa
# ---------------------------------------------------------------------------

class ZonesAnalyzeRequest(BaseModel):
    total_capacity_lcb: Optional[float] = Field(
        default=None,
        ge=1,
        description=(
            "Capacidade total do LCB em caixas. "
            "Quando não informada, o serviço calcula "
            "a partir das zonas disponíveis."
        ),
    )

    forecast_horizon: int = Field(
        default=3,
        ge=1,
        le=12,
        description="Quantidade de períodos futuros para o forecast.",
    )

    include_forecast: bool = Field(
        default=True,
        description="Ativa ou desativa o forecast por zona.",
    )

    projeto: Optional[str] = Field(
        default=None,
        description=(
            "Nome do projeto para filtrar. "
            "Use null para analisar todos os projetos."
        ),
    )

    threshold_medium: float = Field(
        default=70.0,
        ge=0,
        le=100,
        description="Limiar de atenção em percentual.",
    )

    threshold_high: float = Field(
        default=90.0,
        ge=0,
        le=100,
        description="Limiar crítico em percentual.",
    )


# ---------------------------------------------------------------------------
# Cache compartilhado
# ---------------------------------------------------------------------------

def _load_items(
    request: Request,
) -> list:
    items = getattr(
        request.app.state,
        "lcb_items",
        [],
    )

    if not items:
        raise HTTPException(
            status_code=400,
            detail=(
                "Nenhum arquivo carregado no cache da aplicação. "
                "Faça o upload via POST /excel/upload primeiro."
            ),
        )

    return list(items)


# ---------------------------------------------------------------------------
# Filtro de projeto
# ---------------------------------------------------------------------------

def _filter_project(
    items: list,
    project: Optional[str],
) -> list:
    if not project:
        return items

    normalized_project = project.strip().casefold()

    filtered_items = [
        item
        for item in items
        if (
            item.projeto
            and item.projeto.strip().casefold()
            == normalized_project
        )
    ]

    if filtered_items:
        return filtered_items

    available_projects = sorted({
        item.projeto
        for item in items
        if item.projeto
    })

    raise HTTPException(
        status_code=404,
        detail={
            "message": (
                f"Projeto '{project}' não encontrado."
            ),
            "projetos_disponiveis": available_projects,
        },
    )


# ---------------------------------------------------------------------------
# Reclassificação com thresholds informados pelo frontend
# ---------------------------------------------------------------------------

def _apply_risk_thresholds(
    result,
    threshold_medium: float,
    threshold_high: float,
):
    if threshold_medium >= threshold_high:
        raise HTTPException(
            status_code=422,
            detail=(
                "threshold_medium deve ser menor "
                "que threshold_high."
            ),
        )

    updated_zones = []

    risk_counts = {
        "HIGH": 0,
        "MEDIUM": 0,
        "LOW": 0,
    }

    for zone in result.zonas:
        occupation = float(
            zone.ocupacao_pct or 0.0
        )

        if occupation >= threshold_high:
            risk_level = "HIGH"
            risk_label = (
                f"Crítico — {occupation:.1f}% "
                f"(limite {threshold_high:.0f}%)"
            )

        elif occupation >= threshold_medium:
            risk_level = "MEDIUM"
            risk_label = (
                f"Atenção — {occupation:.1f}% "
                f"(limite {threshold_medium:.0f}%)"
            )

        else:
            risk_level = "LOW"
            risk_label = (
                f"Normal — {occupation:.1f}%"
            )

        risk_counts[risk_level] += 1

        updated_zones.append(
            zone.model_copy(
                update={
                    "risk_level": risk_level,
                    "risk_label": risk_label,
                }
            )
        )

    return result.model_copy(
        update={
            "zonas": updated_zones,
            "zonas_high_risk": risk_counts["HIGH"],
            "zonas_medium_risk": risk_counts["MEDIUM"],
            "zonas_low_risk": risk_counts["LOW"],
        }
    )


# ---------------------------------------------------------------------------
# GET /capacity/zones
# ---------------------------------------------------------------------------

@router.get(
    "/zones",
    summary="Ocupação atual por zona do LCB",
    description=(
        "Retorna ocupação por zona utilizando os itens "
        "armazenados pelo último POST /excel/upload."
    ),
)
async def get_zones(
    request: Request,

    projeto: Optional[str] = Query(
        default=None,
        description="Filtrar por projeto.",
    ),

    include_forecast: bool = Query(
        default=False,
        description="Incluir forecast por zona.",
    ),

    horizon: int = Query(
        default=3,
        ge=1,
        le=12,
        description="Quantidade de períodos futuros.",
    ),

    capacity: Optional[float] = Query(
        default=None,
        ge=1,
        description="Capacidade total do LCB.",
    ),
) -> JSONResponse:
    items = _load_items(request)

    items = _filter_project(
        items=items,
        project=projeto,
    )

    result = calculate_zones(
        items=items,
        total_capacity_lcb=capacity,
        forecast_horizon=horizon,
        include_forecast=include_forecast,
    )

    return JSONResponse(
        content=result.model_dump()
    )


# ---------------------------------------------------------------------------
# POST /capacity/zones/analyze
# ---------------------------------------------------------------------------

@router.post(
    "/zones/analyze",
    summary="Análise completa de zonas com classificação de risco",
    description=(
        "Executa ocupação por zona e classificação de risco "
        "utilizando os itens do último upload. "
        "Forecast ML disponível no Step 2."
    ),
)
async def analyze_zones(
    payload: ZonesAnalyzeRequest,
    request: Request,
) -> JSONResponse:
    items = _load_items(request)

    items = _filter_project(
        items=items,
        project=payload.projeto,
    )

    result = calculate_zones(
        items=items,
        total_capacity_lcb=payload.total_capacity_lcb,
        forecast_horizon=payload.forecast_horizon,
        include_forecast=payload.include_forecast,
    )

    result = _apply_risk_thresholds(
        result=result,
        threshold_medium=payload.threshold_medium,
        threshold_high=payload.threshold_high,
    )

    return JSONResponse(
        content=result.model_dump()
    )


# ---------------------------------------------------------------------------
# GET /capacity/zones/summary
# ---------------------------------------------------------------------------

@router.get(
    "/zones/summary",
    summary="Resumo geral das zonas",
    description=(
        "Retorna indicadores gerais e até três zonas críticas. "
        "Não executa forecast para manter a resposta rápida."
    ),
)
async def zones_summary(
    request: Request,

    capacity: Optional[float] = Query(
        default=None,
        ge=1,
        description="Capacidade total do LCB.",
    ),
) -> JSONResponse:
    items = _load_items(request)

    result = calculate_zones(
        items=items,
        total_capacity_lcb=capacity,
        forecast_horizon=3,
        include_forecast=False,
    )

    critical_zones = [
        zone.model_dump()
        for zone in result.zonas
        if zone.risk_level == "HIGH"
    ][:3]

    return JSONResponse(
        content={
            "status": result.status,
            "total_slots_lcb": result.total_slots_lcb,
            "total_usado_lcb": result.total_usado_lcb,
            "total_bloqueado_lcb": result.total_bloqueado_lcb,
            "ocupacao_geral_pct": result.ocupacao_geral_pct,
            "zonas_high_risk": result.zonas_high_risk,
            "zonas_medium_risk": result.zonas_medium_risk,
            "zonas_low_risk": result.zonas_low_risk,
            "zonas_criticas": critical_zones,
            "total_zonas": result.total_zonas,
            "avisos": result.avisos,
        }
    )