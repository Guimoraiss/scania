"""
LCB Capacity Analytics
utils/sheet_detector.py  (v3 — revisão integrada)

Detecta automaticamente:
  - Qual aba contém a tabela de peças (maior densidade de keywords canônicas)
  - Qual linha é o cabeçalho real (ignora linhas de título/merge)
"""

from __future__ import annotations

import pandas as pd

from utils.column_mapper import FIELD_DEFINITIONS, _normalize, _similarity

SHEET_SIGNAL_KEYWORDS = [
    "part number", "pn", "description", "descrição",
    "pckg", "storage zone", "projeto", "project",
    "cxs/periodo", "introduction date",
]

MAX_HEADER_SCAN_ROWS = 25


# ---------------------------------------------------------------------------
# Pontuação de abas
# ---------------------------------------------------------------------------

def _score_sheet(xl: pd.ExcelFile, sheet_name: str) -> float:
    try:
        df = xl.parse(sheet_name, header=None, nrows=MAX_HEADER_SCAN_ROWS)
    except Exception:
        return 0.0

    score = 0.0
    for _, row in df.iterrows():
        for cell in row:
            if not isinstance(cell, str):
                continue
            norm_cell = _normalize(cell)
            for kw in SHEET_SIGNAL_KEYWORDS:
                if _similarity(kw, norm_cell) >= 0.80:
                    score += 1
                    break
    return score


def detect_best_sheet(xl: pd.ExcelFile) -> str:
    """Retorna o nome da aba mais provável para conter os dados de peças."""
    scores = {s: _score_sheet(xl, s) for s in xl.sheet_names}
    return max(scores, key=lambda s: scores[s])


# ---------------------------------------------------------------------------
# Detecção de linha de cabeçalho
# ---------------------------------------------------------------------------

def _row_header_score(row: pd.Series) -> float:
    aliases_flat: list[str] = []
    for _, (_, aliases) in FIELD_DEFINITIONS.items():
        aliases_flat.extend(aliases)

    score = 0.0
    for cell in row:
        if not isinstance(cell, str) or not cell.strip():
            continue
        norm_cell = _normalize(cell)
        for alias in aliases_flat:
            if _similarity(alias, norm_cell) >= 0.78:
                score += 1
                break
    return score


def detect_header_row(xl: pd.ExcelFile, sheet_name: str) -> int:
    """Retorna o índice (0-based) da linha que é o cabeçalho real."""
    raw = xl.parse(sheet_name, header=None, nrows=MAX_HEADER_SCAN_ROWS)

    best_idx = 0
    best_score = 0.0

    for i, row in raw.iterrows():
        score = _row_header_score(row)
        if score > best_score:
            best_score = score
            best_idx = int(i)  # type: ignore[arg-type]

    return best_idx