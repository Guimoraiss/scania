"""
LCB Capacity Analytics
services/excel_service.py  (v4 — novas colunas do Excel adicionadas)

Responsabilidades:
  - Ler arquivos .xlsx, .xls e .csv
  - Detectar automaticamente aba e cabeçalho
  - Mapear colunas com fuzzy matching
  - Parsear linhas em ProjFuturoItem
  - Agrupar itens por projeto
  - Manter o último upload em cache
  - Simular a capacidade de um projeto específico

Estratégia de cálculo de volume_calculado_periodo:
  1. cxs_periodo         (coluna direta do Excel)
  2. qtd_cxs_dia × dias  (se existir qtd_cxs_dia e dias_periodo)
  3. daily_rate          (fallback legado)
  4. sem_dado

Novidades v4:
  - Leitura de: volume_anual, qtd_pcs_cx, qtd_cxs_ano, qtd_cxs_dia, dias_periodo
  - Estratégia de cálculo aprimorada usando qtd_cxs_dia × dias_periodo
  - Compatível com Excel antigo (colunas novas ficam None se ausentes)
"""

from __future__ import annotations

import io
import math
import threading
from collections import defaultdict
from typing import Optional

import pandas as pd

from schemas.excel_schema import (
    ProjFuturoItem,
    ProjFuturoResponse,
    ProjetoSummary,
    SimulacaoRequest,
    SimulacaoResponse,
    UploadMetadata,
    UploadValidation,
)
from utils.column_mapper import (
    build_validation_messages,
    map_columns,
    missing_optional,
    missing_required,
)
from utils.sheet_detector import detect_best_sheet, detect_header_row


# ---------------------------------------------------------------------------
# Cache em memória
# ---------------------------------------------------------------------------

_cache_lock = threading.RLock()
_cached_items: list[ProjFuturoItem] = []
_cached_projects: list[ProjetoSummary] = []


def get_cached_items() -> list[ProjFuturoItem]:
    with _cache_lock:
        return list(_cached_items)


def get_cached_projects() -> list[ProjetoSummary]:
    with _cache_lock:
        return list(_cached_projects)


def _set_cache(
    items: list[ProjFuturoItem],
    projects: list[ProjetoSummary],
) -> None:
    with _cache_lock:
        _cached_items.clear()
        _cached_items.extend(items)
        _cached_projects.clear()
        _cached_projects.extend(projects)


def clear_cache() -> None:
    _set_cache(items=[], projects=[])


# ---------------------------------------------------------------------------
# Helpers de conversão segura
# ---------------------------------------------------------------------------

def _safe_float(value: object, default: float = 0.0) -> float:
    try:
        if isinstance(value, str):
            text = value.strip()
            if not text:
                return default
            if "," in text and "." not in text:
                text = text.replace(",", ".")
            value = text
        result = float(value)  # type: ignore[arg-type]
        if math.isnan(result) or math.isinf(result):
            return default
        return result
    except (TypeError, ValueError):
        return default


def _optional_nonnegative_float(value: object) -> Optional[float]:
    parsed = _safe_float(value, default=-1.0)
    return parsed if parsed >= 0 else None


def _safe_str(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return ""
    return str(value).strip()


def _model_fields() -> set[str]:
    fields = getattr(ProjFuturoItem, "model_fields", {})
    return set(fields.keys())


# ---------------------------------------------------------------------------
# Limpeza e leitura do arquivo
# ---------------------------------------------------------------------------

def _clean_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    cleaned = df.copy()
    cleaned.columns = [str(column).strip() for column in cleaned.columns]
    cleaned.dropna(how="all", inplace=True)
    cleaned.reset_index(drop=True, inplace=True)
    return cleaned


def _read_dataframe(
    content: bytes,
    filename: str,
) -> tuple[pd.DataFrame, str, Optional[str], int]:
    filename = filename or "upload.xlsx"
    extension = (
        filename.rsplit(".", 1)[-1].lower()
        if "." in filename
        else "xlsx"
    )
    buffer = io.BytesIO(content)

    if extension in {"xlsx", "xls"}:
        engine = "openpyxl" if extension == "xlsx" else "xlrd"
        workbook = pd.ExcelFile(buffer, engine=engine)

        if not workbook.sheet_names:
            raise ValueError("O arquivo Excel não possui nenhuma aba.")

        sheet_name = (
            workbook.sheet_names[0]
            if len(workbook.sheet_names) == 1
            else detect_best_sheet(workbook)
        )
        header_row = detect_header_row(workbook, sheet_name)
        dataframe = workbook.parse(sheet_name, header=header_row)
        return _clean_dataframe(dataframe), extension, sheet_name, header_row

    if extension == "csv":
        for separator in (";", ",", "\t", "|"):
            try:
                buffer.seek(0)
                dataframe = pd.read_csv(buffer, sep=separator, encoding="utf-8-sig")
                if len(dataframe.columns) > 1:
                    return _clean_dataframe(dataframe), "csv", None, 0
            except Exception:
                continue

        buffer.seek(0)
        try:
            dataframe = pd.read_csv(buffer, encoding="utf-8-sig", sep=None, engine="python")
            return _clean_dataframe(dataframe), "csv", None, 0
        except Exception as exc:
            raise ValueError(f"Não foi possível ler o arquivo CSV: {exc}") from exc

    raise ValueError(f"Formato '{extension}' não suportado. Use .xlsx, .xls ou .csv.")


# ---------------------------------------------------------------------------
# Cálculo de volume
# ---------------------------------------------------------------------------

def _calc_volume(
    cxs_periodo: Optional[float],
    qtd_cxs_dia: Optional[float],
    dias_periodo: Optional[float],
    daily_rate: float,
    qtde_pns: float,
    period_days: int,
) -> tuple[float, str]:
    """
    Calcula o volume previsto para o período e informa a fonte.

    Prioridade:
      1. cxs_periodo           — coluna direta do Excel
      2. qtd_cxs_dia × dias    — usando colunas novas do Excel
      3. daily_rate            — fallback legado
      4. sem_dado
    """
    # 1. Direto do Excel
    if cxs_periodo is not None and cxs_periodo > 0:
        return round(cxs_periodo, 2), "cxs_periodo"

    # 2. Qtd Cxs/Dia × Dias do Período (colunas novas)
    if qtd_cxs_dia is not None and qtd_cxs_dia > 0:
        dias = dias_periodo if (dias_periodo and dias_periodo > 0) else period_days
        volume = qtd_cxs_dia * dias
        return round(volume, 2), "qtd_cxs_dia"

    # 3. Daily rate (legado)
    if daily_rate > 0 and qtde_pns > 0:
        volume = (daily_rate / qtde_pns) * period_days
        return round(volume, 2), "daily_rate"

    return 0.0, "sem_dado"


# ---------------------------------------------------------------------------
# Agrupamento por projeto
# ---------------------------------------------------------------------------

def _build_projects(items: list[ProjFuturoItem]) -> list[ProjetoSummary]:
    grouped: dict[str, list[ProjFuturoItem]] = defaultdict(list)

    for item in items:
        project_name = (item.projeto or "Sem Projeto").strip() or "Sem Projeto"
        grouped[project_name].append(item)

    projects: list[ProjetoSummary] = []

    for project_name, rows in sorted(grouped.items(), key=lambda p: p[0].casefold()):
        introduction_dates = sorted({r.introduction_date for r in rows if r.introduction_date})
        storage_zones = sorted({r.storage_zone for r in rows if r.storage_zone})
        total_volume = round(sum(r.volume_calculado_periodo for r in rows), 2)

        projects.append(ProjetoSummary(
            nome=project_name,
            total_itens=len(rows),
            total_cxs_periodo=total_volume,
            introduction_dates=introduction_dates,
            storage_zones=storage_zones,
        ))

    return projects


# ---------------------------------------------------------------------------
# Parser principal
# ---------------------------------------------------------------------------

def parse_excel(
    content: bytes,
    filename: str,
    period_days: int = 15,
    default_daily_rate: float = 7.0,
) -> ProjFuturoResponse:
    """Converte o arquivo em ProjFuturoResponse e atualiza o cache interno."""
    if not content:
        raise ValueError("O arquivo enviado está vazio.")
    if period_days < 1:
        raise ValueError("O período de análise deve ser maior que zero.")

    dataframe, file_format, sheet_name, header_row = _read_dataframe(
        content=content,
        filename=filename,
    )
    total_rows = len(dataframe)

    mapping = map_columns(list(dataframe.columns))
    absent_required = missing_required(mapping)
    absent_optional = missing_optional(mapping)
    messages = build_validation_messages(mapping, absent_required, absent_optional)
    all_missing = list(dict.fromkeys(absent_required + absent_optional))

    validation = UploadValidation(
        valido=len(absent_required) == 0,
        colunas_detectadas=list(dataframe.columns),
        colunas_mapeadas={f: c for f, c in mapping.items() if c},
        colunas_ausentes=all_missing,
        mensagens=messages,
    )

    metadata = UploadMetadata(
        nome_arquivo=filename,
        tamanho_bytes=len(content),
        total_linhas=total_rows,
        linhas_validas=0,
        linhas_ignoradas=total_rows,
        formato=file_format,
        sheet_name=sheet_name,
        header_row=header_row,
        headers_originais=list(dataframe.columns),
    )

    if absent_required:
        clear_cache()
        return ProjFuturoResponse(
            status="error",
            metadata=metadata,
            validacao=validation,
            itens=[],
            projetos=[],
            total_volume_periodo=0.0,
            total_volume_contratado=0.0,
            daily_rate_medio=0.0,
            messages=messages,
        )

    # Suporta os dois nomes usados em versões diferentes do mapper
    quantity_column = (
        mapping.get("qtde_pns_por_caixa")
        or mapping.get("qtde_pns_caixa")
    )

    # -----------------------------------------------------------------------
    # Mapeamento de todas as colunas (antigas + novas)
    # -----------------------------------------------------------------------
    columns = {
        # Colunas originais
        "part_number":       mapping.get("part_number"),
        "descricao":         mapping.get("descricao"),
        "projeto":           mapping.get("projeto"),
        "introduction_date": mapping.get("introduction_date"),
        "pckg_type":         mapping.get("pckg_type"),
        "storage_zone":      mapping.get("storage_zone"),
        "cxs_periodo":       mapping.get("cxs_periodo"),
        "qtde_pns_caixa":    quantity_column,
        "daily_rate":        mapping.get("daily_rate"),
        "volume_contratado": mapping.get("volume_contratado"),
        "bloqueado":         mapping.get("bloqueado"),
        "origem":            mapping.get("origem"),
        "valor_total":       mapping.get("valor_total"),
        # Colunas novas (v4)
        "volume_anual":      mapping.get("volume_anual"),
        "qtd_pcs_cx":        mapping.get("qtd_pcs_cx"),
        "qtd_cxs_ano":       mapping.get("qtd_cxs_ano"),
        "qtd_cxs_dia":       mapping.get("qtd_cxs_dia"),
        "dias_periodo":      mapping.get("dias_periodo"),
    }

    schema_fields = _model_fields()
    items: list[ProjFuturoItem] = []
    skipped_rows = 0

    for _, row in dataframe.iterrows():
        # Validação do part_number
        pn_col = columns["part_number"]
        part_number = _safe_str(row[pn_col]) if pn_col else ""
        if not part_number or part_number.casefold() in {"nan", "none", "null"}:
            skipped_rows += 1
            continue

        # Campos de texto
        description      = _safe_str(row[columns["descricao"]])         if columns["descricao"]         else ""
        project          = _safe_str(row[columns["projeto"]])            if columns["projeto"]            else "Sem Projeto"
        introduction_date= _safe_str(row[columns["introduction_date"]])  if columns["introduction_date"]  else ""
        packaging_type   = _safe_str(row[columns["pckg_type"]])          if columns["pckg_type"]          else ""
        storage_zone     = _safe_str(row[columns["storage_zone"]])       if columns["storage_zone"]       else ""

        project = project or "Sem Projeto"

        # Cxs/Período
        cxs_periodo = (
            _optional_nonnegative_float(row[columns["cxs_periodo"]])
            if columns["cxs_periodo"] else None
        )

        # Daily rate (legado)
        daily_rate = (
            _safe_float(row[columns["daily_rate"]], default_daily_rate)
            if columns["daily_rate"] else default_daily_rate
        )
        daily_rate = max(0.0, daily_rate)

        # Qtd PNs/Caixa (legado)
        quantity_per_box = (
            _safe_float(row[columns["qtde_pns_caixa"]], 1.0)
            if columns["qtde_pns_caixa"] else 1.0
        )
        quantity_per_box = max(1.0, quantity_per_box)

        # Colunas novas
        qtd_cxs_dia = (
            _optional_nonnegative_float(row[columns["qtd_cxs_dia"]])
            if columns["qtd_cxs_dia"] else None
        )
        dias_periodo_val = (
            _optional_nonnegative_float(row[columns["dias_periodo"]])
            if columns["dias_periodo"] else None
        )

        # Cálculo de volume com estratégia aprimorada
        calculated_volume, calculation_source = _calc_volume(
            cxs_periodo=cxs_periodo,
            qtd_cxs_dia=qtd_cxs_dia,
            dias_periodo=dias_periodo_val,
            daily_rate=daily_rate,
            qtde_pns=quantity_per_box,
            period_days=period_days,
        )

        # Monta o dict do item
        item_data: dict[str, object] = {
            "part_number":             part_number,
            "descricao":               description,
            "projeto":                 project,
            "introduction_date":       introduction_date,
            "pckg_type":               packaging_type,
            "storage_zone":            storage_zone,
            "cxs_periodo":             cxs_periodo,
            "volume_calculado_periodo": calculated_volume,
            "calculo_fonte":           calculation_source,
        }

        # Campos opcionais — só adiciona se existem no schema
        if "daily_rate" in schema_fields:
            item_data["daily_rate"] = daily_rate if columns["daily_rate"] else None

        if "qtde_pns_caixa" in schema_fields:
            item_data["qtde_pns_caixa"] = quantity_per_box if columns["qtde_pns_caixa"] else None

        if "volume_contratado" in schema_fields:
            item_data["volume_contratado"] = (
                _optional_nonnegative_float(row[columns["volume_contratado"]])
                if columns["volume_contratado"] else None
            )

        if "bloqueado" in schema_fields:
            item_data["bloqueado"] = (
                _optional_nonnegative_float(row[columns["bloqueado"]])
                if columns["bloqueado"] else None
            )

        if "origem" in schema_fields:
            item_data["origem"] = (
                _safe_str(row[columns["origem"]])
                if columns["origem"] else ""
            )

        if "valor_total" in schema_fields:
            item_data["valor_total"] = (
                _optional_nonnegative_float(row[columns["valor_total"]])
                if columns["valor_total"] else None
            )

        # -----------------------------------------------------------------------
        # Campos novos (v4) — ficam None se a coluna não existir no arquivo
        # -----------------------------------------------------------------------
        if "volume_anual" in schema_fields:
            item_data["volume_anual"] = (
                _optional_nonnegative_float(row[columns["volume_anual"]])
                if columns["volume_anual"] else None
            )

        if "qtd_pcs_cx" in schema_fields:
            item_data["qtd_pcs_cx"] = (
                _optional_nonnegative_float(row[columns["qtd_pcs_cx"]])
                if columns["qtd_pcs_cx"] else None
            )

        if "qtd_cxs_ano" in schema_fields:
            item_data["qtd_cxs_ano"] = (
                _optional_nonnegative_float(row[columns["qtd_cxs_ano"]])
                if columns["qtd_cxs_ano"] else None
            )

        if "qtd_cxs_dia" in schema_fields:
            item_data["qtd_cxs_dia"] = qtd_cxs_dia

        if "dias_periodo" in schema_fields:
            item_data["dias_periodo"] = dias_periodo_val

        items.append(ProjFuturoItem(**item_data))

    projects = _build_projects(items)

    total_volume_periodo = round(sum(i.volume_calculado_periodo for i in items), 2)

    actual_daily_rates = [
        float(getattr(item, "daily_rate"))
        for item in items
        if getattr(item, "daily_rate", None) is not None
        and float(getattr(item, "daily_rate")) > 0
    ]
    daily_rate_medio = (
        round(sum(actual_daily_rates) / len(actual_daily_rates), 2)
        if actual_daily_rates else 0.0
    )

    total_volume_contratado = round(
        sum(float(getattr(item, "volume_contratado", 0.0) or 0.0) for item in items),
        2,
    )

    metadata.linhas_validas = len(items)
    metadata.linhas_ignoradas = skipped_rows

    _set_cache(items=items, projects=projects)

    status = "partial" if absent_optional else "success"

    return ProjFuturoResponse(
        status=status,
        metadata=metadata,
        validacao=validation,
        projetos=projects,
        itens=items,
        total_volume_periodo=total_volume_periodo,
        total_volume_contratado=total_volume_contratado,
        daily_rate_medio=daily_rate_medio,
        messages=messages,
    )


# ---------------------------------------------------------------------------
# Listagem e busca no cache
# ---------------------------------------------------------------------------

def list_projects() -> list[ProjetoSummary]:
    return get_cached_projects()


def _project_items(project: str) -> list[ProjFuturoItem]:
    normalized = project.strip().casefold()
    return [
        item for item in get_cached_items()
        if item.projeto.strip().casefold() == normalized
    ]


# ---------------------------------------------------------------------------
# Simulação de projeto específico
# ---------------------------------------------------------------------------

def simulate_project(req: SimulacaoRequest) -> SimulacaoResponse:
    """Filtra um projeto do cache e calcula os KPIs de capacidade."""
    all_items = get_cached_items()

    if not all_items:
        return SimulacaoResponse(
            status="error",
            projeto=req.projeto,
            avisos=["Nenhum arquivo carregado. Faça o upload primeiro."],
        )

    items = _project_items(req.projeto)

    if not items:
        available_projects = sorted({item.projeto for item in all_items if item.projeto})
        return SimulacaoResponse(
            status="error",
            projeto=req.projeto,
            avisos=[
                f"Projeto '{req.projeto}' não encontrado.",
                "Projetos disponíveis: " + ", ".join(available_projects),
            ],
        )

    total_volume_periodo = round(sum(item.volume_calculado_periodo for item in items), 2)
    total_volume_contratado = round(
        sum(float(getattr(item, "volume_contratado", 0.0) or 0.0) for item in items), 2
    )

    actual_daily_rates = [
        float(getattr(item, "daily_rate"))
        for item in items
        if getattr(item, "daily_rate", None) is not None
        and float(getattr(item, "daily_rate")) > 0
    ]
    daily_rate_medio = (
        round(sum(actual_daily_rates) / len(actual_daily_rates), 2)
        if actual_daily_rates else req.default_daily_rate
    )

    capacity             = req.capacity
    current_occupation   = req.current_occupation
    safety_margin_percent= req.safety_margin

    usable_capacity      = round(capacity * (1 - safety_margin_percent / 100), 2)
    projected_occupation = round(current_occupation + total_volume_periodo, 2)
    available_capacity   = round(capacity - projected_occupation, 2)
    occupation_rate      = round((projected_occupation / capacity * 100) if capacity > 0 else 0.0, 2)

    if occupation_rate >= 90:
        status = "critical"
    elif occupation_rate >= 80:
        status = "warning"
    else:
        status = "success"

    per_zone: dict[str, float] = defaultdict(float)
    for item in items:
        zone = item.storage_zone or "Sem Zona"
        per_zone[zone] += item.volume_calculado_periodo

    per_zone_result = {zone: round(vol, 2) for zone, vol in per_zone.items()}

    warnings: list[str] = []
    missing_volume_count = sum(1 for item in items if item.calculo_fonte == "sem_dado")

    if missing_volume_count:
        warnings.append(
            f"{missing_volume_count} peça(s) sem dado suficiente para "
            "cálculo de volume (volume_calculado_periodo = 0)."
        )
    if all(item.calculo_fonte == "sem_dado" for item in items):
        warnings.append(
            "Nenhuma peça do projeto possui Cxs/Periodo, Qtd Cxs/Dia ou Daily Rate. "
            "O volume calculado é zero."
        )
    if projected_occupation > usable_capacity:
        exceeded = round(projected_occupation - usable_capacity, 2)
        warnings.append(
            f"A demanda projetada excede a capacidade utilizável em {exceeded:,.0f} caixas."
        )

    introduction_date = next(
        (item.introduction_date for item in items if item.introduction_date), None
    )

    return SimulacaoResponse(
        status=status,
        projeto=req.projeto,
        introduction_date=introduction_date,
        total_parts=len(items),
        total_volume_periodo=total_volume_periodo,
        total_volume_contratado=total_volume_contratado,
        daily_rate_medio=daily_rate_medio,
        projected_occupation=projected_occupation,
        available_capacity=available_capacity,
        occupation_rate=occupation_rate,
        usable_capacity=usable_capacity,
        por_zona=per_zone_result,
        itens=items,
        avisos=warnings,
    )
