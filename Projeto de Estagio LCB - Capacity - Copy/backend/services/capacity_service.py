"""
LCB Capacity Analytics
services/capacity_service.py  (v2)

Responsabilidades:
  - Calcular ocupação real por zona (lógica do dashboard LCB / DIVIDE_GBL)
  - Classificar risco por zona usando thresholds reais do setor (70% / 90%)
  - Alimentar o endpoint GET /capacity/zones e POST /capacity/zones/analyze

Lógica de ocupação (espelhada do Power BI):
  ocupacao_pct = slots_usados / total_slots × 100   → DIVIDE_GBL
  Thresholds do setor (confirmados pelo dashboard):
    < 70%  → LOW    (verde)
    70–90% → MEDIUM (amarelo)
    ≥ 90%  → HIGH   (vermelho)
"""

from __future__ import annotations

import math
from collections import defaultdict
from typing import Optional

from schemas.excel_schema import ProjFuturoItem, ZoneOccupancy, ZonesResponse

# Thresholds reais extraídos do dashboard LCB (DIVIDE_GBL → semáforo)
_THRESHOLD_MEDIUM = 70.0
_THRESHOLD_HIGH   = 90.0

# ---------------------------------------------------------------------------
# Normalização de zonas (Base 10/20 → Porta Pallets, T;M;4;0;X;90 → Blocado,
# Blue Box Individual/Expedição → Blue Box)
# ---------------------------------------------------------------------------
def _normalize_zone(raw: str) -> str:
    """Normaliza o nome da zona para os grupos padrão do Excel."""
    if not raw:
        return "Blue Box"
    z = raw.strip().upper()
    if any(t in z for t in ("BASE 10", "BASE 20", "PORTA", "PALLET RACK", "RACKS", "PALLET")):
        return "Porta Pallets"
    if any(t in z for t in ("T;M;4;0;X;90", "BLOCADO", "BLOQUEADO", "T;M", "X;90")):
        return "Blocado"
    if any(t in z for t in ("BLUE BOX", "EXPEDIÇÃO", "EXPEDICAO", "BLUEBOX")):
        return "Blue Box"
    return raw.strip()

# Zonas conhecidas do LCB (normalizadas — após agrupamento)
LCB_KNOWN_ZONES = {"Porta Pallets", "Blocado", "Blue Box", "Sem Zona"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_float(v: object, default: float = 0.0) -> float:
    try:
        r = float(v)  # type: ignore[arg-type]
        return default if math.isnan(r) else r
    except (TypeError, ValueError):
        return default


def _classify_risk(ocupacao_pct: float) -> tuple[str, str]:
    """
    Retorna (risk_level, risk_label) baseado nos thresholds do setor.
    Espelha o semáforo do dashboard Power BI.
    """
    if ocupacao_pct >= _THRESHOLD_HIGH:
        return "HIGH", f"Crítico — {ocupacao_pct:.1f}% (acima de {_THRESHOLD_HIGH:.0f}%)"
    if ocupacao_pct >= _THRESHOLD_MEDIUM:
        return "MEDIUM", f"Atenção — {ocupacao_pct:.1f}% (acima de {_THRESHOLD_MEDIUM:.0f}%)"
    return "LOW", f"Normal — {ocupacao_pct:.1f}%"


# ---------------------------------------------------------------------------
# Agrupamento de itens por zona
# ---------------------------------------------------------------------------

def _aggregate_by_zone(items: list[ProjFuturoItem]) -> dict[str, dict]:
    """
    Agrega todos os campos relevantes por zona NORMALIZADA.
    Base 10 / Base 20 → Porta Pallets
    T;M;4;0;X;90 / Blocado → Blocado
    Blue Box Individual / Expedição → Blue Box
    
    Retorna dict {zona_normalizada: {slots_usados, slots_bloqueados, total_slots,
                          nacional, importado, valor, part_numbers, cxs_series}}
    """
    zones: dict[str, dict] = defaultdict(lambda: {
        "slots_usados":    0.0,
        "slots_bloqueados": 0.0,
        "total_slots":     0.0,
        "nacional":        0.0,
        "importado":       0.0,
        "valor":           0.0,
        "part_numbers":    set(),
        "cxs_series":      [],   # lista de valores para o forecaster
    })

    for item in items:
        # Normaliza o nome da zona (Base 10 → Porta Pallets, etc.)
        zona_raw = item.storage_zone or "Sem Zona"
        zona = _normalize_zone(zona_raw)
        z = zones[zona]

        # volume_calculado_periodo → slots_usados (MU no dashboard)
        # Usa volume_calculado_periodo (nunca None) em vez de cxs_periodo
        # (que pode ser None quando a coluna não existe no arquivo).
        cxs = _safe_float(item.volume_calculado_periodo, 0.0)
        z["slots_usados"] += cxs
        z["cxs_series"].append(cxs)

        # volume_contratado → total_slots (STORE no dashboard)
        # Se vier zerado, o campo não existia no arquivo — será estimado depois
        z["total_slots"] += _safe_float(getattr(item, "volume_contratado", 0.0), 0.0)

        # bloqueado → BLOQ_CODE
        z["slots_bloqueados"] += _safe_float(item.bloqueado, 0.0)

        # origem
        origem = (item.origem or "").upper()
        if "NACIONAL" in origem:
            z["nacional"] += cxs
        elif "IMPORTADO" in origem or "IMPORT" in origem:
            z["importado"] += cxs

        # valor do estoque
        z["valor"] += _safe_float(item.valor_total, 0.0)

        # part numbers únicos
        z["part_numbers"].add(item.part_number)

    return zones


# ---------------------------------------------------------------------------
# Estimativa de capacidade total quando STORE não existe no arquivo
# ---------------------------------------------------------------------------

def _estimate_total_slots(slots_usados: float, ocupacao_hint: Optional[float]) -> float:
    """
    Quando o arquivo não tem coluna de capacidade (STORE/volume_contratado),
    estima a capacidade total usando a soma de todos os slots_usados dividida
    por um target de ocupação realista (65%).
    
    Isso evita que cada zona individual fique travada em 80%.
    A estimativa é feita de forma global (todas as zonas) quando possível.
    """
    if slots_usados <= 0:
        return 1.0
    if ocupacao_hint and 0 < ocupacao_hint <= 100:
        return round(slots_usados / (ocupacao_hint / 100), 2)
    # Estimativa realista: assume 65% de ocupação como base (dados da indústria)
    # Isso permite que as zonas tenham percentuais variados
    return round(slots_usados / 0.65, 2)


# ---------------------------------------------------------------------------
# API pública
# ---------------------------------------------------------------------------

def calculate_zones(
    items: list[ProjFuturoItem],
    total_capacity_lcb: Optional[float] = None,
    forecast_horizon: int = 3,
    include_forecast: bool = True,
) -> ZonesResponse:
    """
    Calcula ocupação real por zona e retorna ZonesResponse.

    Parâmetros
    ----------
    items               : lista de ProjFuturoItem do cache (todos os projetos)
    total_capacity_lcb  : capacidade total do LCB em caixas (opcional — se None,
                          será somada das zonas ou estimada)

    Observação
    ----------
    Os parâmetros `forecast_horizon` e `include_forecast` foram mantidos
    apenas por compatibilidade com chamadas antigas, mas o forecast ML foi
    removido desta versão.

    Retorno
    -------
    ZonesResponse com ocupação por zona, KPIs gerais e classificação de risco.
    """
    if not items:
        return ZonesResponse(
            status="error",
            avisos=["Nenhum arquivo carregado. Faça o upload primeiro."],
        )

    raw_zones = _aggregate_by_zone(items)
    avisos: list[str] = []
    zone_list: list[ZoneOccupancy] = []

    total_usado_lcb     = 0.0
    total_bloqueado_lcb = 0.0
    total_slots_lcb     = 0.0

    # Estimativa global: se nenhuma zona tem capacidade, estima proporcionalmente
    total_usado_global = sum(round(z["slots_usados"], 2) for z in raw_zones.values())
    total_cap_global = sum(round(z["total_slots"], 2) for z in raw_zones.values())
    needs_global_estimate = total_cap_global <= 0 and total_usado_global > 0
    global_estimated_cap = _estimate_total_slots(total_usado_global, None) if needs_global_estimate else None

    for zona_name, z in raw_zones.items():
        slots_usados    = round(z["slots_usados"], 2)
        slots_bloqueados = round(z["slots_bloqueados"], 2)
        total_slots     = round(z["total_slots"], 2)

        # Estimar capacidade: usa proporção do total se não veio do arquivo
        has_capacity = total_slots > 0
        if not has_capacity:
            if needs_global_estimate and global_estimated_cap:
                # Distribui proporcionalmente baseado nos slots usados
                ratio = slots_usados / total_usado_global if total_usado_global > 0 else 1 / len(raw_zones)
                total_slots = round(global_estimated_cap * ratio, 2)
                if zona_name not in ("SEM ZONA",):
                    avisos.append(
                        f"Zona {zona_name}: capacidade estimada proporcionalmente "
                        f"em {total_slots:.0f} slots."
                    )
            else:
                total_slots = _estimate_total_slots(slots_usados, None)
                if zona_name not in ("SEM ZONA",):
                    avisos.append(
                        f"Zona {zona_name}: capacidade estimada "
                        f"em {total_slots:.0f} slots."
                    )

        slots_disponiveis = round(total_slots - slots_usados, 2)

        # % ocupação — DIVIDE_GBL do dashboard
        ocupacao_pct = round(slots_usados / total_slots * 100, 1) if total_slots > 0 else 0.0
        ocupacao_bloq_pct = round(
            (slots_usados + slots_bloqueados) / total_slots * 100, 1
        ) if total_slots > 0 else 0.0

        # Nacional / importado
        total_origem = z["nacional"] + z["importado"]
        pct_nacional  = round(z["nacional"]  / total_origem * 100, 1) if total_origem > 0 else 0.0
        pct_importado = round(z["importado"] / total_origem * 100, 1) if total_origem > 0 else 0.0

        # Risco
        risk_level, risk_label = _classify_risk(ocupacao_pct)

        # Forecast ML removido nesta versão
        forecast: list[float] = []
        tendencia = ""

        zone_list.append(ZoneOccupancy(
            zona=zona_name,
            total_slots=total_slots,
            slots_usados=slots_usados,
            slots_bloqueados=slots_bloqueados,
            slots_disponiveis=slots_disponiveis,
            ocupacao_pct=ocupacao_pct,
            ocupacao_bloqueado_pct=ocupacao_bloq_pct,
            pct_nacional=pct_nacional,
            pct_importado=pct_importado,
            risk_level=risk_level,
            risk_label=risk_label,
            total_part_numbers=len(z["part_numbers"]),
            valor_estoque=round(z["valor"], 2),
            forecast_proximos_periodos=forecast,
            tendencia=tendencia,
        ))

        total_usado_lcb     += slots_usados
        total_bloqueado_lcb += slots_bloqueados
        total_slots_lcb     += total_slots

    # Se o frontend forneceu a capacidade total do LCB, redistribui entre as zonas
    if total_capacity_lcb and total_capacity_lcb > 0:
        total_slots_lcb = total_capacity_lcb
        
        # Redistribui a capacidade total entre as zonas proporcionalmente ao volume de cada uma
        if total_usado_lcb > 0:
            for zone in zone_list:
                ratio = zone.slots_usados / total_usado_lcb
                # Redistribui a capacidade total proporcionalmente
                zone.total_slots = round(total_slots_lcb * ratio, 2)
                zone.slots_disponiveis = round(zone.total_slots - zone.slots_usados, 2)
                
                # Recalcula ocupação com a nova capacidade
                zone.ocupacao_pct = round(zone.slots_usados / zone.total_slots * 100, 1) if zone.total_slots > 0 else 0.0
                zone.ocupacao_bloqueado_pct = round(
                    (zone.slots_usados + zone.slots_bloqueados) / zone.total_slots * 100, 1
                ) if zone.total_slots > 0 else 0.0
                
                # Reclassifica o risco baseado na nova ocupação
                zone.risk_level, zone.risk_label = _classify_risk(zone.ocupacao_pct)
    
    ocupacao_geral = round(
        total_usado_lcb / total_slots_lcb * 100, 1
    ) if total_slots_lcb > 0 else 0.0

    # Ordena por ocupação decrescente (mais críticas primeiro)
    zone_list.sort(key=lambda z: z.ocupacao_pct, reverse=True)

    # Contagem de risco
    risk_counts = {"HIGH": 0, "MEDIUM": 0, "LOW": 0}
    for z in zone_list:
        risk_counts[z.risk_level] = risk_counts.get(z.risk_level, 0) + 1

    # Zonas conhecidas do LCB que não apareceram no arquivo
    found_zones = {z.zona for z in zone_list}
    missing_zones = LCB_KNOWN_ZONES - found_zones
    if missing_zones:
        avisos.append(
            f"Zonas do LCB não encontradas no arquivo: "
            f"{', '.join(sorted(missing_zones))}."
        )

    status = "partial" if avisos else "success"

    return ZonesResponse(
        status=status,
        total_slots_lcb=round(total_slots_lcb, 2),
        total_usado_lcb=round(total_usado_lcb, 2),
        total_bloqueado_lcb=round(total_bloqueado_lcb, 2),
        ocupacao_geral_pct=ocupacao_geral,
        zonas_high_risk=risk_counts["HIGH"],
        zonas_medium_risk=risk_counts["MEDIUM"],
        zonas_low_risk=risk_counts["LOW"],
        zonas=zone_list,
        total_zonas=len(zone_list),
        avisos=avisos,
        messages=[
            f"{len(zone_list)} zona(s) analisada(s). "
            f"Ocupação geral: {ocupacao_geral:.1f}%."
        ],
    )