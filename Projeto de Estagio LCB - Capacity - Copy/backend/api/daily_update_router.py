"""
daily_update_router.py
-----------------------
Router FastAPI para ingestão e consulta dos dados diários de ocupação do LCB.

Registre no seu main.py:
    from daily_update_router import router as daily_router
    app.include_router(daily_router)

Endpoints:
    POST /capacity/daily-update          <- recebe payload do scheduler.py
    GET  /capacity/today                 <- frontend consome dados do dia
    GET  /capacity/history               <- histórico dos últimos N dias
    GET  /capacity/today/zona/{nome}     <- zona específica
    GET  /capacity/pipeline-status       <- verifica se dados já chegaram hoje
"""

import os
import json
import logging
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Header, status
from pydantic import BaseModel, Field

log = logging.getLogger("lcb.daily_update")

router = APIRouter(prefix="/capacity", tags=["Daily Occupancy"])

# ── Storage em JSON (sem banco, fácil de migrar depois) ───────────────────────
DATA_DIR = Path(os.getenv("LCB_DATA_DIR", "data/daily"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

FASTAPI_SECRET = os.getenv("FASTAPI_SECRET", "")


# ── Schemas Pydantic ──────────────────────────────────────────────────────────

class Subzona(BaseModel):
    tipo_base:    str
    ocupadas:     Optional[int]   = None
    capacidade:   Optional[int]   = None
    ocupacao_pct: Optional[float] = None


class ZonaOcupacao(BaseModel):
    zona:         str
    tipo:         Optional[str]   = None
    slots_usados: Optional[int]   = None
    total_slots:  Optional[int]   = None
    ocupacao_pct: Optional[float] = None
    subzonas:     list[Subzona]   = Field(default_factory=list)


class ResumoGrupo(BaseModel):
    grupo:        str
    ocupacao_pct: Optional[float] = None


class DailyUpdatePayload(BaseModel):
    data_referencia:         Optional[str]   = None   # "DD/MM/AAAA"
    ocupacao_geral_pct:      Optional[float] = None
    total_locacoes_ocupadas: Optional[int]   = None
    total_capacidade:        Optional[int]   = None
    zonas:    list[ZonaOcupacao] = Field(default_factory=list)
    resumos:  list[ResumoGrupo]  = Field(default_factory=list)
    avisos:   list[str]          = Field(default_factory=list)
    fonte:    str = "email_diario"
    processado_em: Optional[str] = None


class DailyUpdateResponse(BaseModel):
    status:          str
    data_referencia: Optional[str]
    zonas_salvas:    int
    arquivo:         str


# ── Helpers de I/O ────────────────────────────────────────────────────────────

def _filepath(ref_date: date) -> Path:
    return DATA_DIR / f"{ref_date.isoformat()}.json"


def _load(ref_date: date) -> Optional[dict]:
    path = _filepath(ref_date)
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return None


def _save(ref_date: date, data: dict) -> Path:
    path = _filepath(ref_date)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def _parse_ref_date(data_str: Optional[str]) -> date:
    """Converte 'DD/MM/AAAA' ou 'AAAA-MM-DD' para date. Fallback: hoje."""
    if not data_str:
        return date.today()
    for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(data_str, fmt).date()
        except ValueError:
            continue
    return date.today()


def _auth_check(secret: Optional[str]):
    """Valida o header X-LCB-Secret se FASTAPI_SECRET estiver configurado."""
    if FASTAPI_SECRET and secret != FASTAPI_SECRET:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="X-LCB-Secret inválido ou ausente.",
        )


def _enrich_risk(doc: dict) -> dict:
    """Adiciona risk_level a cada zona com base na ocupacao_pct."""
    for zona in doc.get("zonas", []):
        pct = zona.get("ocupacao_pct") or 0
        zona["risk_level"] = (
            "HIGH"   if pct >= 90 else
            "MEDIUM" if pct >= 70 else
            "LOW"
        )
    return doc


# ── POST: recebe dados do scheduler ──────────────────────────────────────────

@router.post(
    "/daily-update",
    response_model=DailyUpdateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Ingestão diária de ocupação (scheduler → FastAPI)",
)
async def daily_update(
    payload: DailyUpdatePayload,
    x_lcb_secret: Optional[str] = Header(default=None),
):
    """
    Recebe o payload gerado pelo scheduler.py e persiste os dados do dia.
    Chamado automaticamente às 06:30 todo dia.
    """
    _auth_check(x_lcb_secret)

    ref_date = _parse_ref_date(payload.data_referencia)

    doc = payload.model_dump()
    doc["_salvo_em"]       = datetime.now().isoformat()
    doc["_data_iso"]       = ref_date.isoformat()
    doc["data_referencia"] = ref_date.strftime("%d/%m/%Y")

    _enrich_risk(doc)

    path = _save(ref_date, doc)
    log.info(f"[daily-update] {ref_date} salvo → {path} ({len(doc['zonas'])} zonas)")

    return DailyUpdateResponse(
        status="ok",
        data_referencia=doc["data_referencia"],
        zonas_salvas=len(doc["zonas"]),
        arquivo=path.name,
    )


# ── GET: frontend consome dados do dia ───────────────────────────────────────

@router.get(
    "/today",
    summary="Ocupação do dia (consumido pelo frontend)",
)
async def get_today(ref_date: Optional[str] = None):
    """
    Retorna os dados de ocupação do dia atual.
    Faz fallback automático para o dia anterior se hoje ainda não tiver dados.

    Query: ?ref_date=2026-07-22  (opcional)
    """
    target = date.fromisoformat(ref_date) if ref_date else date.today()
    doc    = _load(target)

    if doc is None:
        yesterday = target - timedelta(days=1)
        doc = _load(yesterday)
        if doc is None:
            raise HTTPException(
                status_code=404,
                detail=f"Sem dados para {target.isoformat()} nem para o dia anterior.",
            )
        doc["_aviso"] = f"Dados do dia anterior ({yesterday.isoformat()}) — pipeline ainda não rodou hoje."

    return doc


# ── GET: histórico ────────────────────────────────────────────────────────────

@router.get(
    "/history",
    summary="Histórico de ocupação (últimos N dias)",
)
async def get_history(days: int = 30):
    """
    Retorna resumo diário dos últimos N dias.
    Útil para o gráfico de tendência no frontend.
    """
    if days < 1 or days > 365:
        raise HTTPException(status_code=400, detail="days deve ser entre 1 e 365.")

    history = []
    today   = date.today()

    for i in range(days):
        d   = today - timedelta(days=i)
        doc = _load(d)
        if not doc:
            continue

        history.append({
            "data":               d.isoformat(),
            "ocupacao_geral_pct": doc.get("ocupacao_geral_pct"),
            "total_ocupadas":     doc.get("total_locacoes_ocupadas"),
            "total_capacidade":   doc.get("total_capacidade"),
            "zonas_resumo": [
                {
                    "zona":         z.get("zona"),
                    "ocupacao_pct": z.get("ocupacao_pct"),
                    "risk_level":   z.get("risk_level"),
                }
                for z in doc.get("zonas", [])
            ],
        })

    return {
        "periodo_dias": days,
        "registros":    len(history),
        "dados":        history,
    }


# ── GET: zona específica ──────────────────────────────────────────────────────

@router.get(
    "/today/zona/{nome}",
    summary="Dados detalhados de uma zona específica",
)
async def get_zona_today(nome: str, ref_date: Optional[str] = None):
    """
    Retorna os dados completos de uma zona: ocupação, subzonas, risk_level.

    Exemplos:
        GET /capacity/today/zona/LRA
        GET /capacity/today/zona/LCKD
        GET /capacity/today/zona/LBB
    """
    target = date.fromisoformat(ref_date) if ref_date else date.today()
    doc    = _load(target)

    if doc is None:
        raise HTTPException(status_code=404, detail=f"Sem dados para {target.isoformat()}.")

    zona = next(
        (z for z in doc.get("zonas", []) if z.get("zona", "").upper() == nome.upper()),
        None,
    )

    if zona is None:
        disponiveis = [z.get("zona") for z in doc.get("zonas", [])]
        raise HTTPException(
            status_code=404,
            detail=f"Zona '{nome}' não encontrada. Disponíveis: {disponiveis}",
        )

    return {
        "data_referencia": doc.get("data_referencia"),
        "ocupacao_geral_pct": doc.get("ocupacao_geral_pct"),
        "zona": zona,
    }


# ── GET: status do pipeline ───────────────────────────────────────────────────

@router.get(
    "/pipeline-status",
    summary="Verifica se os dados do dia já chegaram",
)
async def pipeline_status():
    """
    Retorna se o pipeline já rodou hoje.
    O frontend usa isso para mostrar o badge 'Dados atualizados' ou 'Aguardando'.
    """
    today = date.today()
    doc   = _load(today)

    files     = sorted(DATA_DIR.glob("*.json"), reverse=True)
    last_file = files[0] if files else None
    last_date = last_file.stem if last_file else None

    return {
        "today":                   today.isoformat(),
        "dados_hoje":              doc is not None,
        "ultima_atualizacao":      doc.get("_salvo_em")          if doc else None,
        "ocupacao_geral_pct":      doc.get("ocupacao_geral_pct") if doc else None,
        "ultimo_dia_disponivel":   last_date,
        "total_dias_historico":    len(files),
    }