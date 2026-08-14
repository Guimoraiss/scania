"""
LCB Capacity Analytics
scheduler.py
------------
Agendador diário do pipeline de ocupação do LCB.

Fluxo:
    06:30 todo dia útil
        → graph_client.py   — baixa imagem do email (Outlook Desktop)
        → ocr_parser.py     — faz OCR local e extrai JSON
        → POST /capacity/daily-update  — atualiza o backend FastAPI

Uso:
    cd backend
    python scheduler.py --run-now
    python scheduler.py --date 2026-07-22
    python scheduler.py
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from datetime import date
from pathlib import Path
from zoneinfo import ZoneInfo

import requests
from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger
from dotenv import load_dotenv

# ----------------------------------------------------------------------------
# Ajusta o path para que "services" seja importável mesmo executando
# "python .\scheduler\scheduler.py" dentro da pasta backend.
# ----------------------------------------------------------------------------
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from services.graph_client import fetch_daily_attachment
from services.ocr_parser import parse_and_save, to_fastapi_payload

load_dotenv()

FASTAPI_URL = os.getenv("FASTAPI_URL", "http://localhost:8000")
FASTAPI_SECRET = os.getenv("FASTAPI_SECRET", "")
TIMEZONE = os.getenv("SCHEDULER_TIMEZONE", "America/Sao_Paulo")
RUN_HOUR = int(os.getenv("SCHEDULER_HOUR", "6"))
RUN_MINUTE = int(os.getenv("SCHEDULER_MINUTE", "30"))

LOG_DIR = BACKEND_DIR / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

PENDING_DIR = BACKEND_DIR / "pending_uploads"
PENDING_DIR.mkdir(parents=True, exist_ok=True)


def trace(message: str) -> None:
    """Mostra mensagem no terminal mesmo quando o logger não estiver evidente."""
    print(message, flush=True)


def setup_logger() -> logging.Logger:
    logger = logging.getLogger("lcb_scheduler")
    if logger.handlers:
        return logger

    logger.setLevel(logging.INFO)
    logger.propagate = False

    fmt = logging.Formatter(
        "[%(asctime)s] %(levelname)s  %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    ch = logging.StreamHandler(sys.stdout)
    ch.setFormatter(fmt)
    logger.addHandler(ch)

    fh = logging.FileHandler(
        LOG_DIR / f"scheduler_{date.today().isoformat()}.log",
        encoding="utf-8",
    )
    fh.setFormatter(fmt)
    logger.addHandler(fh)

    return logger


log = setup_logger()


def post_to_fastapi(payload: dict) -> bool:
    """Envia os dados de ocupação para o endpoint /capacity/daily-update."""
    url = f"{FASTAPI_URL}/capacity/daily-update"
    headers = {"Content-Type": "application/json"}
    if FASTAPI_SECRET:
        headers["X-LCB-Secret"] = FASTAPI_SECRET

    try:
        trace(f"[scheduler] POST {url}")
        response = requests.post(url, json=payload, headers=headers, timeout=30)
        response.raise_for_status()
        log.info("[fastapi] ✅ POST %s → %s", url, response.status_code)
        trace(f"[scheduler] ✅ FastAPI respondeu {response.status_code}")
        return True
    except requests.exceptions.ConnectionError:
        log.warning("[fastapi] ⚠️ Backend indisponível em %s — dados salvos localmente", url)
        trace("[scheduler] ⚠️ Backend indisponível; salvando localmente")
        return False
    except requests.exceptions.HTTPError as e:
        log.error("[fastapi] ❌ HTTP %s: %s", e.response.status_code, e.response.text[:300])
        trace(f"[scheduler] ❌ HTTP {e.response.status_code}: {e.response.text[:200]}")
        return False
    except Exception as e:
        log.error("[fastapi] ❌ Erro inesperado: %s", e)
        trace(f"[scheduler] ❌ Erro inesperado no POST: {e}")
        return False


def save_payload_locally(payload: dict, ref_date: date) -> Path:
    """Salva o payload em disco caso o FastAPI esteja indisponível."""
    path = PENDING_DIR / f"payload_{ref_date.isoformat()}.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    log.info("[scheduler] Payload salvo localmente: %s", path)
    trace(f"[scheduler] Payload salvo localmente em: {path}")
    return path


def retry_pending_uploads() -> None:
    """Tenta reenviar payloads que falharam em dias anteriores."""
    files = sorted(PENDING_DIR.glob("payload_*.json"))
    if not files:
        return

    log.info("[scheduler] Tentando reenviar %d payload(s) pendente(s)...", len(files))
    trace(f"[scheduler] reenviando {len(files)} payload(s) pendente(s)...")

    for f in files:
        try:
            payload = json.loads(f.read_text(encoding="utf-8"))
            if post_to_fastapi(payload):
                f.unlink(missing_ok=True)
                log.info("[scheduler] ✅ Reenviado e removido: %s", f.name)
                trace(f"[scheduler] ✅ removido {f.name}")
        except Exception as e:
            log.warning("[scheduler] ⚠️ Falha ao reenviar %s: %s", f.name, e)
            trace(f"[scheduler] ⚠️ falha ao reenviar {f.name}: {e}")


def run_daily_pipeline(target_date: date | None = None) -> bool:
    """
    Pipeline completo de ingestão diária:
        1. Baixa imagem do email via Outlook Desktop
        2. Extrai dados com OCR local
        3. Posta no FastAPI (com fallback local)
    """
    target_date = target_date or date.today()

    trace("[scheduler] entrou no pipeline")
    trace(f"[scheduler] data alvo: {target_date.isoformat()}")

    log.info("=" * 60)
    log.info("PIPELINE LCB — %s", target_date.isoformat())
    log.info("=" * 60)

    retry_pending_uploads()

    # 1) Buscar anexo do email diário
    log.info("[step 1/3] Buscando email no Outlook...")
    trace("[scheduler] step 1/3 -> buscando email no Outlook...")

    image_path = fetch_daily_attachment(target_date)
    if image_path is None:
        log.warning("[step 1/3] ⚠️ Imagem não encontrada. Pipeline abortado.")
        trace("[scheduler] ⚠️ imagem não encontrada")
        log.info("           Possíveis causas:")
        log.info("           - Email ainda não chegou")
        log.info("           - Remetente não bate com EMAIL_SENDERS")
        log.info("           - Assunto não bate com OCUPAÇÃO LCB")
        log.info("           - Email não está na Inbox principal do Outlook")
        return False

    log.info("[step 1/3] ✅ Imagem baixada: %s", image_path)
    trace(f"[scheduler] ✅ imagem baixada: {image_path}")

    # 2) Extrair JSON
    log.info("[step 2/3] Extraindo dados...")
    trace("[scheduler] step 2/3 -> extraindo dados...")

    try:
        data = parse_and_save(image_path)
        zonas_count = len(data.get("zonas", []))
        ocupacao = data.get("ocupacao_geral_pct")
        log.info("[step 2/3] ✅ Extraído: %s%% ocupação, %d zonas", ocupacao, zonas_count)
        trace(f"[scheduler] ✅ extraído: ocupacao={ocupacao}% zonas={zonas_count}")
    except Exception as e:
        log.error("[step 2/3] ❌ Erro no OCR: %s", e)
        trace(f"[scheduler] ❌ erro no OCR: {e}")
        return False

    # 3) POST no backend
    log.info("[step 3/3] Enviando para o backend FastAPI...")
    trace("[scheduler] step 3/3 -> enviando para FastAPI...")

    payload = to_fastapi_payload(data)
    success = post_to_fastapi(payload)
    if not success:
        save_payload_locally(payload, target_date)

    log.info("=" * 60)
    log.info("PIPELINE CONCLUÍDO — %s", "✅ OK" if success else "⚠️ salvo localmente")
    log.info("=" * 60)
    trace(f"[scheduler] pipeline concluído -> {'OK' if success else 'salvo localmente'}")
    return success


def start_scheduler() -> None:
    """Inicia o agendador em foreground."""
    tz = ZoneInfo(TIMEZONE)
    scheduler = BlockingScheduler(timezone=tz)

    scheduler.add_job(
        func=run_daily_pipeline,
        trigger=CronTrigger(hour=RUN_HOUR, minute=RUN_MINUTE, timezone=tz),
        id="lcb_daily_pipeline",
        name="LCB Daily Occupancy Pipeline",
        misfire_grace_time=3600,
        coalesce=True,
    )

    next_run = scheduler.get_jobs()[0].next_run_time
    log.info("[scheduler] ✅ Agendado para %02d:%02d (%s)", RUN_HOUR, RUN_MINUTE, TIMEZONE)
    log.info("[scheduler] Próxima execução: %s", next_run.strftime("%d/%m/%Y %H:%M:%S"))
    log.info("[scheduler] Pressione Ctrl+C para parar\n")

    trace(f"[scheduler] agendado para {RUN_HOUR:02d}:{RUN_MINUTE:02d} ({TIMEZONE})")
    trace(f"[scheduler] próxima execução: {next_run.strftime('%d/%m/%Y %H:%M:%S')}")

    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        log.info("[scheduler] Parado pelo usuário.")
        trace("[scheduler] parado pelo usuário")


def main() -> int:
    parser = argparse.ArgumentParser(description="Scheduler do pipeline de ocupação LCB")
    parser.add_argument("--run-now", action="store_true", help="Executa o pipeline agora (modo teste)")
    parser.add_argument("--date", type=str, metavar="YYYY-MM-DD", help="Processa uma data específica (ex: 2026-07-22)")
    args = parser.parse_args()

    trace("[scheduler] entrou no main()")
    trace(f"[scheduler] args = {args}")

    if args.date:
        target = date.fromisoformat(args.date)
        log.info("[scheduler] Modo manual — data: %s", target.isoformat())
        trace(f"[scheduler] modo manual -> {target.isoformat()}")
        return 0 if run_daily_pipeline(target) else 1

    if args.run_now:
        log.info("[scheduler] Modo teste — executando agora...")
        trace("[scheduler] modo teste -> executando agora")
        return 0 if run_daily_pipeline() else 1

    start_scheduler()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())