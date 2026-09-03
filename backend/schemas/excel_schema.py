"""
LCB Capacity Analytics
schemas/excel_schema.py  (v5 — novos campos do Excel adicionados)

Novos campos em ProjFuturoItem:
  - volume_anual   : Volume Anual
  - qtd_pcs_cx     : Qtd de Pcs/Cx
  - qtd_cxs_ano    : Qtd Cxs/Ano
  - qtd_cxs_dia    : Qtd Cxs/Dia
  - dias_periodo   : Dias do Período
"""

from __future__ import annotations
from typing import Optional
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Item de peça — Projeção Futura
# ---------------------------------------------------------------------------

class ProjFuturoItem(BaseModel):
    """Linha do arquivo de Projeção Futura após parse e normalização."""

    part_number: str = Field(..., description="Part Number da peça.")
    descricao: str = Field("", description="Descrição da peça.")
    projeto: str = Field("", description="Nome do projeto.")
    introduction_date: str = Field("", description="Data de introdução (ex: Q1-2026).")
    pckg_type: str = Field("", description="Tipo de embalagem / Packing Type.")
    storage_zone: str = Field("", description="Zona de armazenagem.")

    cxs_periodo: Optional[float] = Field(
        None, ge=0,
        description="Caixas/Período conforme arquivo. None quando ausente ou nulo.",
    )
    volume_calculado_periodo: float = Field(
        0.0, ge=0,
        description="Volume calculado para o período (estratégia de fallback documentada).",
    )
    calculo_fonte: str = Field(
        "sem_dado",
        description="Fonte: cxs_periodo | daily_rate | contratado_proporcional | sem_dado.",
    )

    # Campos dashboard (v4)
    bloqueado: Optional[float] = Field(None, ge=0, description="Qtde bloqueada (BLOQ_CODE).")
    origem: str = Field("", description="Origem: IMPORTADO | NACIONAL.")
    valor_total: Optional[float] = Field(None, ge=0, description="Valor total do estoque (MU).")
    volume_contratado: Optional[float] = Field(None, ge=0, description="Capacidade total da zona (STORE).")

    # Campos novos do Excel (v5)
    volume_anual: Optional[float] = Field(None, ge=0, description="Volume Anual.")
    qtd_pcs_cx: Optional[float] = Field(None, ge=0, description="Qtd de Pcs/Cx (peças por caixa).")
    qtd_cxs_ano: Optional[float] = Field(None, ge=0, description="Qtd Cxs/Ano (caixas por ano).")
    qtd_cxs_dia: Optional[float] = Field(None, ge=0, description="Qtd Cxs/Dia (caixas por dia).")
    dias_periodo: Optional[float] = Field(None, ge=0, description="Dias do Período.")


# ---------------------------------------------------------------------------
# Resumo por projeto — usado no ComboBox do frontend
# ---------------------------------------------------------------------------

class ProjetoSummary(BaseModel):
    nome: str
    total_itens: int
    total_cxs_periodo: float = Field(0.0)
    introduction_dates: list[str] = Field(default_factory=list)
    storage_zones: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Ocupação por zona — v4
# ---------------------------------------------------------------------------

class ZoneRiskLevel(str):
    LOW    = "LOW"
    MEDIUM = "MEDIUM"
    HIGH   = "HIGH"


class ZoneOccupancy(BaseModel):
    """
    Ocupação real de uma zona de armazenagem do LCB.
    Alinhada com a lógica do dashboard Power BI (DIVIDE_GBL = MU_usado / STORE_total).
    """
    zona: str = Field(..., description="Código da zona (LRA, LRB, LCK, etc.)")

    # Capacidade
    total_slots: float = Field(0.0, ge=0, description="Capacidade total (STORE).")
    slots_usados: float = Field(0.0, ge=0, description="Slots em uso (MU).")
    slots_bloqueados: float = Field(0.0, ge=0, description="Slots bloqueados (BLOQ_CODE).")
    slots_disponiveis: float = Field(0.0, description="Slots disponíveis = total - usado.")

    # KPIs de ocupação — mesma lógica do DIVIDE_GBL do Power BI
    ocupacao_pct: float = Field(0.0, ge=0, description="% ocupação = MU / STORE × 100.")
    ocupacao_bloqueado_pct: float = Field(0.0, ge=0, description="% ocupação incluindo bloqueados.")

    # Breakdown nacional/importado
    pct_nacional: float = Field(0.0, ge=0, le=100)
    pct_importado: float = Field(0.0, ge=0, le=100)

    # Classificação de risco — thresholds reais do setor (70% / 90%)
    risk_level: str = Field("LOW", description="LOW | MEDIUM | HIGH")
    risk_label: str = Field("", description="Descrição do status para o frontend.")

    # Part numbers na zona
    total_part_numbers: int = Field(0, ge=0)
    valor_estoque: float = Field(0.0, ge=0, description="Valor total do estoque na zona.")

    # Forecast ML (preenchido quando disponível)
    forecast_proximos_periodos: list[float] = Field(
        default_factory=list,
        description="Previsão de caixas para os próximos N períodos (demand_forecaster).",
    )
    tendencia: str = Field("", description="crescente | decrescente | estavel | sem_dados")


class ZonesResponse(BaseModel):
    """
    Resposta de GET /capacity/zones e POST /capacity/zones/analyze.

    status: 'success' | 'partial' | 'error'
    """
    status: str = Field(..., pattern=r"^(success|partial|error)$")

    # Resumo geral — equivalente ao GENERAL PANEL do dashboard
    total_slots_lcb: float = Field(0.0, ge=0, description="Capacidade total do LCB.")
    total_usado_lcb: float = Field(0.0, ge=0, description="Total em uso no LCB.")
    total_bloqueado_lcb: float = Field(0.0, ge=0, description="Total bloqueado no LCB.")
    ocupacao_geral_pct: float = Field(0.0, ge=0, description="% ocupação geral do LCB.")

    # Contagem de risco por zona
    zonas_high_risk: int = Field(0, ge=0)
    zonas_medium_risk: int = Field(0, ge=0)
    zonas_low_risk: int = Field(0, ge=0)

    # Detalhe por zona (ordenadas por ocupação desc)
    zonas: list[ZoneOccupancy] = Field(default_factory=list)

    avisos: list[str] = Field(default_factory=list)
    messages: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Validação de colunas
# ---------------------------------------------------------------------------

class UploadValidation(BaseModel):
    valido: bool = True
    colunas_detectadas: list[str] = Field(default_factory=list)
    colunas_mapeadas: dict[str, str] = Field(default_factory=dict)
    colunas_ausentes: list[str] = Field(default_factory=list)
    mensagens: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Metadados do arquivo
# ---------------------------------------------------------------------------

class UploadMetadata(BaseModel):
    nome_arquivo: str
    formato: str
    tamanho_bytes: int = Field(..., ge=0)
    total_linhas: int = Field(..., ge=0)
    linhas_validas: int = Field(..., ge=0)
    linhas_ignoradas: int = Field(..., ge=0)
    sheet_name: Optional[str] = None
    header_row: int = Field(0)
    headers_originais: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Resposta do upload
# ---------------------------------------------------------------------------

class ProjFuturoResponse(BaseModel):
    """
    Payload retornado por POST /excel/upload.

    status: 'success' | 'partial' | 'error'
    """
    status: str = Field(..., pattern=r"^(success|partial|error)$")
    schema_tipo: str = Field("projecao_futura")
    metadata: UploadMetadata
    validacao: UploadValidation

    projetos: list[ProjetoSummary] = Field(default_factory=list)
    itens: list[ProjFuturoItem] = Field(default_factory=list)

    # Campos mantidos para compatibilidade com api.js existente
    total_volume_periodo: float = Field(0.0, ge=0)
    total_volume_contratado: float = Field(0.0, ge=0)
    daily_rate_medio: float = Field(0.0, ge=0)

    messages: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Request de simulação
# ---------------------------------------------------------------------------

class SimulacaoRequest(BaseModel):
    """Payload enviado pelo frontend para simular um projeto."""
    projeto: str = Field(..., description="Nome exato do projeto.")
    period_days: int = Field(15, ge=1, le=365)
    default_daily_rate: float = Field(7.0, ge=0)

    # Parâmetros de capacidade enviados pelo frontend
    capacity: float = Field(140_000.0, ge=1, description="Capacidade total do LCB (caixas).")
    current_occupation: float = Field(0.0, ge=0, description="Ocupação atual (caixas).")
    safety_margin: float = Field(0.0, ge=0, le=100, description="Margem de segurança (%).")


# ---------------------------------------------------------------------------
# Resposta da simulação
# ---------------------------------------------------------------------------

class SimulacaoResponse(BaseModel):
    """
    Resposta de POST /excel/simulate.

    status: 'success' | 'partial' | 'error' | 'warning' | 'critical'
    """
    status: str

    projeto: str
    introduction_date: Optional[str] = None
    total_parts: int = 0

    # KPIs — compatíveis com _renderKpisFromApi do api.js
    total_volume_periodo: float = Field(0.0, ge=0)
    total_volume_contratado: float = Field(0.0, ge=0)
    daily_rate_medio: float = Field(0.0, ge=0)

    projected_occupation: float = Field(0.0, ge=0)
    available_capacity: float = Field(0.0)
    occupation_rate: float = Field(0.0, ge=0)
    usable_capacity: float = Field(0.0, ge=0)

    por_zona: dict[str, float] = Field(default_factory=dict)
    itens: list[ProjFuturoItem] = Field(default_factory=list)
    avisos: list[str] = Field(default_factory=list)
