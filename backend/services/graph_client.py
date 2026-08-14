"""
LCB Capacity Analytics
services/graph_client.py

Cliente Outlook Desktop para o pipeline diário do e-mail OCUPAÇÃO LCB.
Sem Azure / Microsoft Graph.

Requer:
    pip install pywin32 python-dotenv
    Outlook Desktop instalado e logado no Windows
"""

from __future__ import annotations

import os
import re
import shutil
import tempfile
import unicodedata
from datetime import date, datetime
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

try:
    import pythoncom
    import win32com.client as win32
except ImportError as exc:
    raise RuntimeError(
        "Dependências do Outlook Desktop não encontradas. "
        "Instale com: pip install pywin32"
    ) from exc

load_dotenv()

# ============================================================================
# CONFIGURAÇÕES
# ============================================================================

BASE_DIR = Path(__file__).resolve().parents[1].resolve()

ATTACHMENT_DIR = (BASE_DIR / "attachments").resolve()
ATTACHMENT_DIR.mkdir(parents=True, exist_ok=True)

TEMP_DIR = (Path(tempfile.gettempdir()) / "lcb_outlook_tmp").resolve()
TEMP_DIR.mkdir(parents=True, exist_ok=True)

EMAIL_USER = os.getenv("EMAIL_USER", "").strip().lower()
EMAIL_SENDERS = [
    s.strip().lower()
    for s in os.getenv("EMAIL_SENDERS", "").replace(";", ",").split(",")
    if s.strip()
]

# ignora anexos muito pequenos se parecerem logo/assinatura
MIN_ATTACHMENT_BYTES = int(os.getenv("LCB_MIN_ATTACHMENT_BYTES", "50000"))

if not EMAIL_USER:
    raise RuntimeError("EMAIL_USER não configurado no .env.")

if not EMAIL_SENDERS:
    raise RuntimeError(
        "EMAIL_SENDERS não configurado no .env. "
        "Exemplo: EMAIL_SENDERS=franciane.das.gracas.salino@scania.com"
    )

_ALLOWED_SENDERS_NORM: list[str] = []
for s in EMAIL_SENDERS:
    s_norm = unicodedata.normalize("NFKD", s)
    s_norm = "".join(ch for ch in s_norm if not unicodedata.combining(ch))
    s_norm = re.sub(r"\s+", " ", s_norm).strip().upper()
    _ALLOWED_SENDERS_NORM.append(s_norm)


def _norm_text(value: str) -> str:
    value = str(value or "")
    value = unicodedata.normalize("NFKD", value)
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = re.sub(r"\s+", " ", value).strip().upper()
    return value


def _safe_filename(name: str) -> str:
    name = str(name or "ocupacao_lcb.png")
    name = re.sub(r'[<>:"/\\|?*]+', "_", name)
    name = name.strip(" .")
    return name or "ocupacao_lcb.png"


def _looks_like_logo_or_signature(name: str) -> bool:
    n = _norm_text(name)
    negative_tokens = (
        "LOGO",
        "SCANIA",
        "SIGNATURE",
        "ASSINATURA",
        "FOOTER",
        "HEADER",
        "ICON",
        "FAVICON",
        "BANNER",
        "SOCIAL",
    )
    return any(tok in n for tok in negative_tokens)


# ============================================================================
# CLIENT
# ============================================================================

class OutlookClient:
    def __init__(self) -> None:
        self.outlook = None
        self.namespace = None

    def connect(self) -> None:
        if self.namespace is not None:
            return

        pythoncom.CoInitialize()
        self.outlook = win32.Dispatch("Outlook.Application")
        self.namespace = self.outlook.GetNamespace("MAPI")

    @staticmethod
    def _safe_date(value: Optional[date]) -> date:
        return value or date.today()

    @staticmethod
    def _sender_allowed(sender_name: str, sender_email: str) -> bool:
        candidate = _norm_text(f"{sender_name} {sender_email}")
        return any(allowed in candidate for allowed in _ALLOWED_SENDERS_NORM)

    @staticmethod
    def _get_sender_info(mail_item) -> tuple[str, str]:
        sender_name = str(getattr(mail_item, "SenderName", "") or "").strip()
        sender_email = str(getattr(mail_item, "SenderEmailAddress", "") or "").strip()

        try:
            sender_type = str(getattr(mail_item, "SenderEmailType", "") or "").upper()
        except Exception:
            sender_type = ""

        if sender_type == "EX":
            try:
                sender = mail_item.Sender
                if sender is not None:
                    ex_user = sender.GetExchangeUser()
                    if ex_user is not None:
                        smtp = getattr(ex_user, "PrimarySmtpAddress", "") or ""
                        if smtp:
                            sender_email = str(smtp).strip()

                    ex_dl = sender.GetExchangeDistributionList()
                    if ex_dl is not None:
                        smtp = getattr(ex_dl, "PrimarySmtpAddress", "") or ""
                        if smtp:
                            sender_email = str(smtp).strip()
            except Exception:
                pass

            try:
                pa = mail_item.PropertyAccessor
                smtp = pa.GetProperty(
                    "http://schemas.microsoft.com/mapi/proptag/0x39FE001E"
                )
                if smtp:
                    sender_email = str(smtp).strip()
            except Exception:
                pass

        return sender_name, sender_email.lower()

    def _iter_inbox_items(self, target_date: date):
        inbox = self.namespace.GetDefaultFolder(6)  # olFolderInbox
        items = inbox.Items
        items.Sort("[ReceivedTime]", True)

        total = int(getattr(items, "Count", 0) or 0)
        limit = min(total, 200)

        for idx in range(1, limit + 1):
            try:
                item = items.Item(idx)
            except Exception:
                continue

            try:
                if getattr(item, "Class", None) != 43:  # MailItem
                    continue
            except Exception:
                continue

            try:
                received_time = item.ReceivedTime
                if received_time.date() != target_date:
                    continue
            except Exception:
                continue

            yield item

    def find_daily_email(self, target_date: Optional[date] = None):
        target_date = self._safe_date(target_date)
        self.connect()

        print(
            f"[outlook_client] Buscando relatório de {target_date.isoformat()}...",
            flush=True,
        )

        for i, mail_item in enumerate(self._iter_inbox_items(target_date), start=1):
            sender_name, sender_email = self._get_sender_info(mail_item)
            subject = str(getattr(mail_item, "Subject", "") or "")

            print(
                f"[outlook_client] candidato {i}: "
                f"sender_name={sender_name} | sender_email={sender_email} | subject={subject}",
                flush=True,
            )

            subject_norm = _norm_text(subject)

            if not self._sender_allowed(sender_name, sender_email):
                continue

            if "OCUPACAO" not in subject_norm or "LCB" not in subject_norm:
                continue

            print(
                f"[outlook_client] E-mail encontrado: "
                f"sender={_norm_text(f'{sender_name} {sender_email}')} subject={subject}",
                flush=True,
            )
            return mail_item

        return None

    @staticmethod
    def _attachment_score(attachment) -> int:
        score = 0
        name = str(getattr(attachment, "FileName", "") or "").lower()
        size = int(getattr(attachment, "Size", 0) or 0)

        if re.search(r"\.(png|jpg|jpeg|webp|gif|bmp)$", name, re.IGNORECASE):
            score += 100
        if "ocup" in name:
            score += 120
        if "lcb" in name:
            score += 80
        if "report" in name or "relat" in name:
            score += 60
        if "daily" in name:
            score += 30

        if _looks_like_logo_or_signature(name):
            score -= 150

        if size < MIN_ATTACHMENT_BYTES:
            score -= 80

        score += int(size / 10000)
        return score

    def choose_attachment(self, mail_item):
        attachments = getattr(mail_item, "Attachments", None)
        if attachments is None:
            return None

        total = int(getattr(attachments, "Count", 0) or 0)
        if total <= 0:
            return None

        scored = []
        for i in range(1, total + 1):
            try:
                att = attachments.Item(i)
            except Exception:
                continue

            file_name = str(getattr(att, "FileName", "") or "")
            size = int(getattr(att, "Size", 0) or 0)

            if size < MIN_ATTACHMENT_BYTES and _looks_like_logo_or_signature(file_name):
                continue

            scored.append((self._attachment_score(att), att))

        if not scored:
            return None

        scored.sort(key=lambda x: x[0], reverse=True)
        return scored[0][1]

    def download_attachment(self, mail_item) -> Optional[Path]:
        attachment = self.choose_attachment(mail_item)
        if attachment is None:
            return None

        file_name = _safe_filename(getattr(attachment, "FileName", "") or "ocupacao_lcb.png")
        ext = Path(file_name).suffix or ".png"

        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        temp_path = (TEMP_DIR / f"ocupacao_lcb_{stamp}{ext}").resolve()
        final_path = (ATTACHMENT_DIR / f"ocupacao_lcb_{stamp}{ext}").resolve()

        print(f"[outlook_client] Salvando anexo em temp: {temp_path}", flush=True)

        temp_path.parent.mkdir(parents=True, exist_ok=True)
        final_path.parent.mkdir(parents=True, exist_ok=True)

        attachment.SaveAsFile(str(temp_path))
        shutil.copy2(temp_path, final_path)

        try:
            temp_path.unlink(missing_ok=True)
        except Exception:
            pass

        print(f"[outlook_client] Anexo copiado para: {final_path}", flush=True)
        return final_path

    def fetch_daily_attachment(self, target_date: Optional[date] = None) -> Optional[Path]:
        target_date = self._safe_date(target_date)

        email = self.find_daily_email(target_date)
        if email is None:
            print("[outlook_client] Nenhum e-mail compatível encontrado.", flush=True)
            return None

        return self.download_attachment(email)

    def fetch_daily_email_metadata(self, target_date: Optional[date] = None) -> Optional[dict]:
        target_date = self._safe_date(target_date)

        email = self.find_daily_email(target_date)
        if not email:
            return None

        sender_name, sender_email = self._get_sender_info(email)
        attachments = getattr(email, "Attachments", None)
        has_attachments = bool(attachments and int(getattr(attachments, "Count", 0) or 0) > 0)

        return {
            "subject": str(getattr(email, "Subject", "") or ""),
            "receivedTime": str(getattr(email, "ReceivedTime", "") or ""),
            "sender_name": sender_name,
            "sender_email": sender_email,
            "hasAttachments": has_attachments,
        }


_client = OutlookClient()


def fetch_daily_attachment(target_date: Optional[date] = None) -> Optional[Path]:
    return _client.fetch_daily_attachment(target_date)


def fetch_daily_email_metadata(target_date: Optional[date] = None) -> Optional[dict]:
    return _client.fetch_daily_email_metadata(target_date)


if __name__ == "__main__":
    image = fetch_daily_attachment()

    if image:
        print(f"\nImagem salva em:\n{image}")
    else:
        print("\nNenhum relatório encontrado.")