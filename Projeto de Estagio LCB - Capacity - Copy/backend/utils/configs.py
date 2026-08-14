"""
LCB Capacity Analytics
utils/configs.py

Configurações compartilhadas para o pipeline diário de leitura do e-mail.
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# Base do pacote backend/
BACKEND_DIR = Path(__file__).resolve().parents[1]
ROOT_DIR = BACKEND_DIR.parent

# ---------------------------------------------------------------------------
# Azure / Microsoft Graph
# ---------------------------------------------------------------------------
AZURE_CLIENT_ID = os.getenv("AZURE_CLIENT_ID", "")
AZURE_CLIENT_SECRET = os.getenv("AZURE_CLIENT_SECRET", "")
AZURE_TENANT_ID = os.getenv("AZURE_TENANT_ID", "")

EMAIL_USER = os.getenv("EMAIL_USER", "")
EMAIL_SENDER = os.getenv("EMAIL_SENDER", "")
EMAIL_SENDERS = [
    s.strip().lower()
    for s in os.getenv("EMAIL_SENDERS", EMAIL_SENDER).replace(";", ",").split(",")
    if s.strip()
]

if not EMAIL_SENDERS and EMAIL_SENDER:
    EMAIL_SENDERS = [EMAIL_SENDER.lower()]

GRAPH_BASE = "https://graph.microsoft.com/v1.0"
GRAPH_SCOPE = ["https://graph.microsoft.com/.default"]

# ---------------------------------------------------------------------------
# AI / OCR
# ---------------------------------------------------------------------------
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-3-5-sonnet-latest")

# ---------------------------------------------------------------------------
# Diretórios do pipeline
# ---------------------------------------------------------------------------
PARSED_DIR = Path(os.getenv("LCB_PARSED_DIR", str(BACKEND_DIR / "data" / "parsed")))
PARSED_DIR.mkdir(parents=True, exist_ok=True)

# nome usado por alguns arquivos
ATTACHMENT_DIR = Path(os.getenv("LCB_ATTACHMENTS_DIR", str(BACKEND_DIR / "attachments")))
ATTACHMENT_DIR.mkdir(parents=True, exist_ok=True)

# alias de compatibilidade
ATTACHMENTS_DIR = ATTACHMENT_DIR

DAILY_DATA_DIR = Path(os.getenv("LCB_DATA_DIR", str(BACKEND_DIR / "data" / "daily")))
DAILY_DATA_DIR.mkdir(parents=True, exist_ok=True)