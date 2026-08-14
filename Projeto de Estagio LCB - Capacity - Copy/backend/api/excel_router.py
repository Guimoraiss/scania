
"""
LCB Capacity Analytics
api/excel_router.py

Endpoints:
  POST /excel/upload
  GET  /excel/projetos
  GET  /excel/projects
  GET  /excel/cache/status
  POST /excel/simulate
  POST /excel/project/simulate

O último upload é armazenado em dois locais:

  1. services.excel_service
     Usado pela simulação de projetos.

  2. request.app.state
     Usado pelas rotas de Capacity e Machine Learning.

Isso garante que /excel e /capacity utilizem exatamente
os mesmos itens dentro do processo FastAPI.
"""

from __future__ import annotations

from fastapi import (
    APIRouter,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
)
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

from schemas.excel_schema import (
    ProjFuturoResponse,
    SimulacaoRequest,
    SimulacaoResponse,
)

from services.excel_service import (
    clear_cache,
    get_cached_items,
    list_projects,
    parse_excel,
    simulate_project,
)


router = APIRouter(
    prefix="/excel",
    tags=["Projeção Futura"],
)


# ---------------------------------------------------------------------------
# Cache compartilhado pelo FastAPI
# ---------------------------------------------------------------------------

def _get_state_items(
    request: Request,
) -> list:
    return list(
        getattr(
            request.app.state,
            "lcb_items",
            [],
        )
    )


def _get_state_projects(
    request: Request,
) -> list:
    return list(
        getattr(
            request.app.state,
            "lcb_projects",
            [],
        )
    )


def _store_state_cache(
    request: Request,
    items: list,
    projects: list,
) -> None:
    request.app.state.lcb_items = list(items)
    request.app.state.lcb_projects = list(projects)


def _clear_state_cache(
    request: Request,
) -> None:
    request.app.state.lcb_items = []
    request.app.state.lcb_projects = []


# ---------------------------------------------------------------------------
# Payload de projetos
# ---------------------------------------------------------------------------

def _projects_payload(
    request: Request,
    key_name: str,
) -> JSONResponse:
    projects = _get_state_projects(request)

    # Compatibilidade com o cache interno do excel_service.
    if not projects:
        projects = list_projects()

    if not projects:
        raise HTTPException(
            status_code=404,
            detail="Nenhum arquivo carregado ainda.",
        )

    return JSONResponse(
        content={
            key_name: [
                project.model_dump()
                for project in projects
            ]
        }
    )


# ---------------------------------------------------------------------------
# POST /excel/upload
# ---------------------------------------------------------------------------

@router.post(
    "/upload",
    response_model=ProjFuturoResponse,
    summary="Upload e parse universal de arquivo de Projeção Futura",
    description=(
        "Aceita .xlsx, .xls ou .csv. "
        "Detecta automaticamente aba, cabeçalho e colunas. "
        "Retorna os projetos e itens encontrados no arquivo."
    ),
)
async def upload_excel(
    request: Request,
    file: UploadFile = File(...),
    period_days: int = Form(15),
    default_daily_rate: float = Form(7.0),
) -> ProjFuturoResponse:
    content = await file.read()

    if not content:
        raise HTTPException(
            status_code=400,
            detail="Arquivo vazio.",
        )

    filename = file.filename or "upload.xlsx"

    try:
        # Pandas e OpenPyXL são síncronos.
        # A thread evita bloquear o loop principal do FastAPI.
        result = await run_in_threadpool(
            parse_excel,
            content=content,
            filename=filename,
            period_days=period_days,
            default_daily_rate=default_daily_rate,
        )

        upload_is_valid = (
            result.status in {"success", "partial"}
            and bool(result.itens)
        )

        if upload_is_valid:
            _store_state_cache(
                request=request,
                items=result.itens,
                projects=result.projetos,
            )
        else:
            clear_cache()
            _clear_state_cache(request)

        return result

    except ValueError as exc:
        clear_cache()
        _clear_state_cache(request)

        raise HTTPException(
            status_code=422,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        clear_cache()
        _clear_state_cache(request)

        raise HTTPException(
            status_code=500,
            detail=(
                "Erro interno ao processar arquivo: "
                f"{exc}"
            ),
        ) from exc


# ---------------------------------------------------------------------------
# GET /excel/projetos
# ---------------------------------------------------------------------------

@router.get(
    "/projetos",
    summary="Lista projetos do último upload",
)
async def projetos_excel(
    request: Request,
) -> JSONResponse:
    return _projects_payload(
        request=request,
        key_name="projetos",
    )


# ---------------------------------------------------------------------------
# GET /excel/projects
# ---------------------------------------------------------------------------

@router.get(
    "/projects",
    summary="Alias em inglês de /excel/projetos",
)
async def projects_alias(
    request: Request,
) -> JSONResponse:
    return _projects_payload(
        request=request,
        key_name="projects",
    )


# ---------------------------------------------------------------------------
# GET /excel/cache/status
# ---------------------------------------------------------------------------

@router.get(
    "/cache/status",
    summary="Verifica o cache do último upload",
)
async def cache_status(
    request: Request,
) -> JSONResponse:
    state_items = _get_state_items(request)
    state_projects = _get_state_projects(request)

    service_items = get_cached_items()
    service_projects = list_projects()

    return JSONResponse(
        content={
            "arquivo_carregado": bool(state_items),
            "app_state": {
                "total_itens": len(state_items),
                "total_projetos": len(state_projects),
                "projetos": [
                    project.nome
                    for project in state_projects
                ],
            },
            "excel_service": {
                "total_itens": len(service_items),
                "total_projetos": len(service_projects),
                "projetos": [
                    project.nome
                    for project in service_projects
                ],
            },
            "cache_sincronizado": (
                len(state_items) == len(service_items)
                and len(state_projects) == len(service_projects)
            ),
        }
    )


# ---------------------------------------------------------------------------
# POST /excel/simulate
# ---------------------------------------------------------------------------

@router.post(
    "/simulate",
    response_model=SimulacaoResponse,
    summary="Simula capacidade para um projeto específico",
    description=(
        "Filtra os itens do último upload pelo projeto informado. "
        "Retorna indicadores, itens e distribuição por zona."
    ),
)
async def simulate(
    req: SimulacaoRequest,
) -> SimulacaoResponse:
    result = await run_in_threadpool(
        simulate_project,
        req,
    )

    if result.status == "error":
        raise HTTPException(
            status_code=400,
            detail=(
                result.avisos[0]
                if result.avisos
                else "Erro na simulação."
            ),
        )

    return result


# ---------------------------------------------------------------------------
# POST /excel/project/simulate
# ---------------------------------------------------------------------------

@router.post(
    "/project/simulate",
    response_model=SimulacaoResponse,
    summary="Alias de /excel/simulate",
)
async def simulate_alias(
    req: SimulacaoRequest,
) -> SimulacaoResponse:
    return await simulate(req)