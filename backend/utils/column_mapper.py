"""
LCB Capacity Analytics
utils/column_mapper.py  (v4 — novas colunas adicionadas)

Mapeia colunas do arquivo para campos canônicos usando:
  1. Match exato normalizado
  2. Aliases pré-definidos
  3. Fuzzy matching (difflib SequenceMatcher)
"""

from __future__ import annotations

import unicodedata
from difflib import SequenceMatcher
from typing import Optional

# ---------------------------------------------------------------------------
# Definição canônica de campos
# (obrigatório, [aliases em ordem de prioridade])
# ---------------------------------------------------------------------------

FIELD_DEFINITIONS: dict[str, tuple[bool, list[str]]] = {
    # Obrigatório — identificador da peça
    "part_number": (True, [
        "part number", "part_number", "partnumber", "pn",
        "codigo", "código", "item", "numero peca", "número peça",
    ]),

    "descricao": (False, [
        "description", "descrição", "denominação", "denominacao",
        "nome", "name", "desc",
    ]),

    "projeto": (False, [
        "projeto", "project", "proj",
    ]),

    "introduction_date": (False, [
        "introduction date", "data introducao", "data introdução",
        "intro date", "introduction_date", "data intro",
    ]),

    "pckg_type": (False, [
        "pckg type", "packing environment", "pckg_type", "pe",
        "embalagem", "package", "pkg", "tipo embalagem",
        "packing type", "package type",
    ]),

    "storage_zone": (False, [
        "storage zone", "zona armazenagem", "zona",
        "storage_zone", "armazenagem", "zone", "zona de armazenagem",
    ]),

    "cxs_periodo": (False, [
        "cxs/periodo", "cxs/período", "caixas periodo",
        "caixas/periodo", "boxes/period", "cxs_periodo",
    ]),

    # -----------------------------------------------------------------------
    # Colunas novas identificadas no Excel
    # -----------------------------------------------------------------------

    "volume_anual": (False, [
        "volume anual", "volume_anual", "vol anual", "vol. anual",
        "annual volume", "volume/ano",
    ]),

    "qtd_pcs_cx": (False, [
        "qtd de pcs/cx", "qtd pcs/cx", "qtd de pcs cx",
        "qtd_pcs_cx", "pcs/cx", "pecas por caixa", "peças por caixa",
        "qty pcs/box", "qty per box", "pcs per box",
    ]),

    "qtd_cxs_ano": (False, [
        "qtd cxs/ano", "qtd_cxs_ano", "caixas/ano",
        "boxes/year", "qty cxs/ano",
    ]),

    "qtd_cxs_dia": (False, [
        "qtd cxs/dia", "qtd_cxs_dia", "caixas/dia",
        "boxes/day", "qty cxs/dia", "consumo diario caixas",
    ]),

    "origem": (False, [
        "origem", "origin", "procedencia", "procedência",
        "fonte", "source",
    ]),

    "dias_periodo": (False, [
        "dias do periodo", "dias do período", "dias_periodo",
        "dias periodo", "days period", "days of period",
        "periodo em dias", "período em dias",
    ]),

    # -----------------------------------------------------------------------
    # Campos extras de outros formatos (mantidos da v3)
    # -----------------------------------------------------------------------

    "qtde_pns_por_caixa": (False, [
        "qtde pns/caixa", "qtde_pns", "pns/caixa",
        "qty/box", "quantidade por caixa",
    ]),
    "daily_rate": (False, [
        "daily rate", "daily_rate", "taxa diaria",
        "taxa diária", "consumo diario", "consumo/dia",
    ]),
    "volume_contratado": (False, [
        "volume contratado", "volume_contratado", "contratado",
    ]),
    "bloqueado": (False, [
        "bloqueado", "bloq", "bloq_code", "blocked", "bloquado",
    ]),
    "valor_total": (False, [
        "valor total", "valor_total", "total value", "valor estoque",
        "mu", "mu_total",
    ]),
}

REQUIRED_FIELDS = {k for k, (req, _) in FIELD_DEFINITIONS.items() if req}
OPTIONAL_FIELDS = {k for k, (req, _) in FIELD_DEFINITIONS.items() if not req}

FUZZY_THRESHOLD = 0.72


# ---------------------------------------------------------------------------
# Normalização
# ---------------------------------------------------------------------------

def _normalize(s: str) -> str:
    s = s.lower().strip()
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return " ".join(s.split())


def _similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, _normalize(a), _normalize(b)).ratio()


# ---------------------------------------------------------------------------
# Mapeamento
# ---------------------------------------------------------------------------

def map_columns(headers: list[str]) -> dict[str, Optional[str]]:
    """Retorna {canonical_field: nome_real_no_arquivo | None}."""
    norm_headers = {_normalize(h): h for h in headers}
    mapping: dict[str, Optional[str]] = {}
    used: set[str] = set()

    for canonical, (_, aliases) in FIELD_DEFINITIONS.items():
        found: Optional[str] = None

        # 1. Exato
        for alias in aliases:
            norm_alias = _normalize(alias)
            if norm_alias in norm_headers and norm_headers[norm_alias] not in used:
                found = norm_headers[norm_alias]
                break

        # 2. Fuzzy
        if found is None:
            best_score = 0.0
            best_col: Optional[str] = None
            for norm_h, raw_h in norm_headers.items():
                if raw_h in used:
                    continue
                for alias in aliases:
                    score = _similarity(alias, norm_h)
                    if score > best_score:
                        best_score = score
                        best_col = raw_h
            if best_score >= FUZZY_THRESHOLD:
                found = best_col

        mapping[canonical] = found
        if found:
            used.add(found)

    return mapping


def missing_required(mapping: dict[str, Optional[str]]) -> list[str]:
    return [f for f in REQUIRED_FIELDS if not mapping.get(f)]


def missing_optional(mapping: dict[str, Optional[str]]) -> list[str]:
    return [f for f in OPTIONAL_FIELDS if not mapping.get(f)]


def build_validation_messages(
    mapping: dict[str, Optional[str]],
    absent_req: list[str],
    absent_opt: list[str],
) -> list[str]:
    msgs: list[str] = []
    if absent_req:
        msgs.append(f"Colunas obrigatórias não encontradas: {', '.join(absent_req)}.")
    if absent_opt:
        msgs.append(f"Colunas opcionais ausentes (usando defaults): {', '.join(absent_opt)}.")
    if not absent_req and not absent_opt:
        msgs.append("Todas as colunas foram mapeadas com sucesso.")
    mapped_log = [f"{c}→'{v}'" for c, v in mapping.items() if v]
    if mapped_log:
        msgs.append("Mapeamento detectado: " + ", ".join(mapped_log))
    return msgs
