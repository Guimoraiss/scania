"""
LCB Capacity Analytics
services/ocr_parser.py

OCR local para a imagem de ocupação do LCB.
Sem Claude / Anthropic.

Fluxo:
    1) recebe a imagem baixada do Outlook
    2) corta o cabeçalho/logo para focar no conteúdo útil
    3) faz preprocessamento local
    4) extrai texto com Tesseract
    5) converte em JSON estruturado
    6) salva em disco e devolve payload para o backend

Dependências:
    pip install pytesseract pillow opencv-python numpy python-dotenv
    e instalar o Tesseract OCR no Windows

Uso direto:
    python ocr_parser.py attachments/ocupacao_lcb_2026-07-22.png
"""

from __future__ import annotations

import json
import os
import re
import sys
import unicodedata
from datetime import date, datetime
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from PIL import Image, ImageEnhance, ImageFilter, ImageOps

try:
    import numpy as np
except ImportError:
    np = None

try:
    import cv2
except ImportError:
    cv2 = None

try:
    import pytesseract
except ImportError as exc:
    raise RuntimeError(
        "Dependência 'pytesseract' não encontrada. "
        "Instale com: pip install pytesseract"
    ) from exc

from utils.configs import PARSED_DIR

load_dotenv()

# ---------------------------------------------------------------------------
# Configurações OCR
# ---------------------------------------------------------------------------

TESSERACT_CMD = os.getenv("TESSERACT_CMD", "").strip()
if TESSERACT_CMD:
    pytesseract.pytesseract.tesseract_cmd = TESSERACT_CMD

TESSERACT_LANG = os.getenv("OCR_LANG", "eng+por").strip()
OCR_MAX_WIDTH = int(os.getenv("OCR_MAX_WIDTH", "3200"))
SAVE_OCR_DEBUG = os.getenv("SAVE_OCR_DEBUG", "false").strip().lower() in {
    "1",
    "true",
    "yes",
    "y",
}

OCR_DEBUG_DIR = Path(
    os.getenv("LCB_OCR_DEBUG_DIR", str(PARSED_DIR.parent / "ocr_debug"))
)
OCR_DEBUG_DIR.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# Helpers de normalização
# ---------------------------------------------------------------------------

def _strip_accents(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "")
    return "".join(ch for ch in text if not unicodedata.combining(ch))


def _norm(text: str) -> str:
    text = _strip_accents(text)
    text = re.sub(r"\s+", " ", text)
    return text.strip().upper()


def _extract_ints(text: str) -> list[int]:
    return [int(x) for x in re.findall(r"(?<!\d)(\d{1,9})(?!\d)", text or "")]


def _extract_first_percent(text: str) -> Optional[int]:
    m = re.search(r"\b(\d{1,3})\s*%", text or "")
    if m:
        try:
            return int(m.group(1))
        except ValueError:
            return None
    return None


def _text_score(text: str) -> int:
    """
    Heurística simples para escolher o melhor OCR entre várias tentativas.
    """
    if not text or not text.strip():
        return -1

    norm = _norm(text)
    score = len(text.strip())
    score += 3 * len(_extract_ints(text))

    for token in (
        "OCUPACAO",
        "OCUPAÇÃO",
        "CAPACIDADE",
        "LRA",
        "LRB",
        "LBD",
        "LBB",
        "LCK",
        "LCKD",
        "RACK",
        "BLUE BOX",
        "BLOCADO",
        "TOTAL",
    ):
        if token in norm:
            score += 30

    return score


# ---------------------------------------------------------------------------
# Preprocessamento da imagem
# ---------------------------------------------------------------------------

def _resize_if_needed(img: Image.Image) -> Image.Image:
    if img.width < OCR_MAX_WIDTH:
        ratio = OCR_MAX_WIDTH / float(img.width)
        new_size = (OCR_MAX_WIDTH, max(1, int(img.height * ratio)))
        resampling = getattr(Image, "Resampling", None)
        if resampling is not None:
            img = img.resize(new_size, resampling.LANCZOS)
        else:
            img = img.resize(new_size, Image.LANCZOS)
    return img


def _base_preprocess(image_path: Path) -> Image.Image:
    img = Image.open(image_path).convert("RGB")
    img = _resize_if_needed(img)
    return img


def _crop_report_body(img: Image.Image) -> Image.Image:
    """
    Remove o cabeçalho com logo/branding e mantém o corpo do relatório.
    Ajuste fino: 14% do topo cortado.
    """
    w, h = img.size
    top = int(h * 0.14)
    return img.crop((0, top, w, h))


def _variant_grayscale(img: Image.Image) -> Image.Image:
    out = ImageOps.grayscale(img)
    out = ImageOps.autocontrast(out)
    out = out.filter(ImageFilter.SHARPEN)
    out = ImageEnhance.Sharpness(out).enhance(1.3)
    out = ImageEnhance.Contrast(out).enhance(1.35)
    return out


def _variant_binary(img: Image.Image) -> Image.Image:
    out = ImageOps.grayscale(img)
    out = ImageOps.autocontrast(out)
    if cv2 is not None and np is not None:
        arr = np.array(out)
        _, arr = cv2.threshold(arr, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        out = Image.fromarray(arr)
    else:
        out = out.point(lambda p: 255 if p > 170 else 0)
    return out


def _variant_adaptive(img: Image.Image) -> Image.Image:
    out = ImageOps.grayscale(img)
    out = ImageOps.autocontrast(out)

    if cv2 is not None and np is not None:
        arr = np.array(out)
        arr = cv2.GaussianBlur(arr, (3, 3), 0)
        arr = cv2.adaptiveThreshold(
            arr,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            31,
            11,
        )
        out = Image.fromarray(arr)
    else:
        out = out.point(lambda p: 255 if p > 160 else 0)

    return out


def _variant_sharp(img: Image.Image) -> Image.Image:
    out = ImageOps.grayscale(img)
    out = ImageOps.autocontrast(out)
    out = out.filter(ImageFilter.SHARPEN)
    out = ImageEnhance.Sharpness(out).enhance(1.8)
    out = ImageEnhance.Contrast(out).enhance(1.6)
    return out


def _build_variants(image_path: Path) -> tuple[Image.Image, Image.Image, list[tuple[str, Image.Image]]]:
    base = _base_preprocess(image_path)
    body = _crop_report_body(base)
    variants = [
        ("body_grayscale", _variant_grayscale(body)),
        ("body_binary", _variant_binary(body)),
        ("body_adaptive", _variant_adaptive(body)),
        ("body_sharp", _variant_sharp(body)),
    ]
    return base, body, variants


def _run_ocr(image: Image.Image) -> str:
    """
    Executa OCR com múltiplos configs e escolhe o texto mais útil.
    """
    configs = [
        "--oem 3 --psm 6",
        "--oem 3 --psm 11",
        "--oem 3 --psm 12",
        "--oem 3 --psm 3",
    ]

    best_text = ""
    best_score = -1

    for cfg in configs:
        try:
            text = pytesseract.image_to_string(
                image,
                lang=TESSERACT_LANG,
                config=cfg,
            )
            score = _text_score(text)
            if score > best_score:
                best_score = score
                best_text = text
        except Exception:
            continue

    return best_text.strip()


def _save_debug_artifacts(
    image_name: str,
    variants: list[tuple[str, Image.Image]],
    chosen_text: str,
) -> None:
    if not SAVE_OCR_DEBUG:
        return

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_dir = OCR_DEBUG_DIR / f"{stamp}_{image_name}"
    out_dir.mkdir(parents=True, exist_ok=True)

    for name, img in variants:
        try:
            img.save(out_dir / f"{name}.png")
        except Exception:
            pass

    try:
        (out_dir / "ocr_text.txt").write_text(chosen_text, encoding="utf-8")
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Parsing do texto
# ---------------------------------------------------------------------------

def _parse_date(text: str) -> Optional[str]:
    if not text:
        return None

    m = re.search(r"\b(\d{2}/\d{2}/\d{4})\b", text)
    if m:
        return m.group(1)

    norm_text = _norm(text)
    months = {
        "JANEIRO": 1,
        "FEVEREIRO": 2,
        "MARCO": 3,
        "ABRIL": 4,
        "MAIO": 5,
        "JUNHO": 6,
        "JULHO": 7,
        "AGOSTO": 8,
        "SETEMBRO": 9,
        "OUTUBRO": 10,
        "NOVEMBRO": 11,
        "DEZEMBRO": 12,
    }

    m = re.search(
        r"\b(\d{1,2})\s+DE\s+([A-ZÇ]+)\s+DE\s+(\d{4})\b",
        norm_text,
    )
    if m:
        day = int(m.group(1))
        month_name = m.group(2).replace("Ç", "C")
        year = int(m.group(3))
        month = months.get(month_name)
        if month:
            return f"{day:02d}/{month:02d}/{year}"

    return None


def _parse_time(text: str) -> Optional[str]:
    if not text:
        return None

    m = re.search(r"\b(\d{2}:\d{2})\b", text)
    if m:
        return m.group(1)

    return None


def _value_near_label(lines: list[str], labels: list[str], scan_ahead: int = 3) -> Optional[int]:
    norm_lines = [_norm(line) for line in lines]

    for i, norm_line in enumerate(norm_lines):
        if any(label in norm_line for label in labels):
            same_line_ints = _extract_ints(lines[i])
            if same_line_ints:
                return same_line_ints[-1]

            for j in range(i + 1, min(i + 1 + scan_ahead, len(lines))):
                nxt_ints = _extract_ints(lines[j])
                if nxt_ints:
                    return nxt_ints[0]

    return None


def _parse_global_metrics(
    text: str,
    lines: list[str],
) -> tuple[Optional[int], Optional[int], Optional[int], Optional[str], Optional[str]]:
    top_lines = lines[:30]
    top_text = "\n".join(top_lines)

    date_report = _parse_date(text) or _parse_date(top_text)
    time_report = _parse_time(text) or _parse_time(top_text)

    occ_pct = _extract_first_percent(top_text) or _extract_first_percent(text)

    total_locacoes = _value_near_label(
        lines=top_lines,
        labels=[
            "TOTAL LOCACOES OCUPADAS",
            "TOTAL LOCAÇÕES OCUPADAS",
            "TOTAL LOCACOES",
            "TOTAL OCUPADAS",
        ],
    )

    total_capacidade = _value_near_label(
        lines=top_lines,
        labels=[
            "TOTAL CAPACIDADE INSTALADA",
            "TOTAL CAPACIDADE",
            "CAPACIDADE INSTALADA",
        ],
    )

    if total_locacoes is None or total_capacidade is None:
        big_numbers = [
            n for n in _extract_ints(top_text)
            if n >= 1000 and n <= 999999999
        ]
        if total_locacoes is None and len(big_numbers) >= 1:
            total_locacoes = big_numbers[0]
        if total_capacidade is None and len(big_numbers) >= 2:
            total_capacidade = big_numbers[1]

    return occ_pct, total_locacoes, total_capacidade, date_report, time_report


def _detect_subzone_label(norm_line: str) -> Optional[str]:
    if not norm_line:
        return None

    if "BASE 10" in norm_line or re.search(r"(?<!\d)10(?!\d)", norm_line):
        return "10"

    if "BASE 20" in norm_line or re.search(r"(?<!\d)20(?!\d)", norm_line):
        return "20"

    if ("TM" in norm_line or "T M" in norm_line or "T;M" in norm_line) and "X" in norm_line and "90" in norm_line:
        return "T;M;4;0;X;90"

    if "BLUE BOX INDIVIDUAL" in norm_line:
        return "Blue Box Individual"

    if "EXPEDICAO" in norm_line or "EXPEDIÇÃO" in norm_line:
        return "Blue Box"

    if "BLOCADO" in norm_line:
        return "Blocado"

    if "SEM ZONA" in norm_line:
        return "Sem Zona"

    return None


def _guess_zone_type(zone_name: str, block_text: str) -> str:
    norm = _norm(block_text)

    if "RACK" in norm or zone_name in {"LRA", "LRB", "LCK", "LCKD"}:
        return "RACK"

    if "BLUE BOX" in norm or zone_name in {"LBB", "LBD"}:
        return "BLUE BOX"

    if "BLOCADO" in norm:
        return "BLOCADO"

    return "GERAL"


def _extract_zone_blocks(lines: list[str]) -> dict[str, list[str]]:
    zone_order = ["LRA", "LRB", "LBD", "LBB", "LCK", "LCKD"]
    starts: list[tuple[int, str]] = []

    for idx, line in enumerate(lines):
        norm_line = _norm(line)
        for zone in zone_order:
            if norm_line == zone:
                starts.append((idx, zone))
                break

    blocks: dict[str, list[str]] = {}
    for i, (start_idx, zone) in enumerate(starts):
        end_idx = starts[i + 1][0] if i + 1 < len(starts) else len(lines)
        blocks[zone] = lines[start_idx:end_idx]

    return blocks


def _parse_zone_block(zone_name: str, block_lines: list[str]) -> dict:
    block_text = "\n".join(block_lines)
    zone_type = _guess_zone_type(zone_name, block_text)

    subzonas = []
    total_ocupadas = None
    total_capacidade = None
    total_pct = None

    for raw_line in block_lines:
        norm_line = _norm(raw_line)

        if "TOTAL" in norm_line:
            ints = _extract_ints(raw_line)
            if len(ints) >= 2:
                if total_ocupadas is None:
                    total_ocupadas = ints[-3] if len(ints) >= 3 else ints[-2]
                if total_capacidade is None:
                    total_capacidade = ints[-2] if len(ints) >= 3 else ints[-1]
                if len(ints) >= 3:
                    total_pct = ints[-1]
            continue

        label = _detect_subzone_label(norm_line)
        if not label:
            continue

        ints = _extract_ints(raw_line)
        if len(ints) >= 3:
            ocupadas, capacidade, pct = ints[-3], ints[-2], ints[-1]
        elif len(ints) == 2:
            ocupadas, capacidade = ints[-2], ints[-1]
            pct = round((ocupadas / capacidade) * 100) if capacidade else None
        else:
            continue

        subzonas.append(
            {
                "tipo_base": label,
                "ocupadas": ocupadas,
                "capacidade": capacidade,
                "ocupacao_pct": pct,
            }
        )

    if total_ocupadas is None:
        total_ocupadas = sum(int(x.get("ocupadas") or 0) for x in subzonas)

    if total_capacidade is None:
        total_capacidade = sum(int(x.get("capacidade") or 0) for x in subzonas)

    if total_pct is None and total_ocupadas and total_capacidade:
        total_pct = round((total_ocupadas / total_capacidade) * 100)

    if total_pct is None:
        total_pct = 0

    return {
        "zona": zone_name,
        "tipo": zone_type,
        "subzonas": subzonas,
        "total_ocupadas": total_ocupadas,
        "total_capacidade": total_capacidade,
        "ocupacao_total_pct": total_pct,
    }


def _build_resumos(zones: list[dict]) -> list[dict]:
    resumos = []

    rack_zones = [z for z in zones if z.get("tipo") == "RACK"]
    if rack_zones:
        occ = sum(int(z.get("total_ocupadas") or 0) for z in rack_zones)
        cap = sum(int(z.get("total_capacidade") or 0) for z in rack_zones)
        pct = round((occ / cap) * 100) if cap else 0
        resumos.append(
            {
                "grupo": 'Ocupação Total dos "RACK"',
                "ocupacao_pct": pct,
            }
        )

    blue_box_zones = [z for z in zones if z.get("tipo") == "BLUE BOX"]
    if blue_box_zones:
        occ = sum(int(z.get("total_ocupadas") or 0) for z in blue_box_zones)
        cap = sum(int(z.get("total_capacidade") or 0) for z in blue_box_zones)
        pct = round((occ / cap) * 100) if cap else 0
        resumos.append(
            {
                "grupo": "Ocupação Total do Blue Box",
                "ocupacao_pct": pct,
            }
        )

    return resumos


# ---------------------------------------------------------------------------
# Parser principal
# ---------------------------------------------------------------------------

def parse_image(image_path: Path) -> dict:
    """
    Faz OCR local na imagem e devolve um JSON estruturado.
    """
    if not image_path.exists():
        raise FileNotFoundError(f"Imagem não encontrada: {image_path}")

    print(
        f"[ocr_parser] Lendo imagem: {image_path} ({image_path.stat().st_size:,} bytes)",
        flush=True,
    )

    base, body, variants = _build_variants(image_path)

    full_text = ""
    body_text = ""
    best_text = ""
    best_score = -1
    best_variant_name = None

    # OCR no arquivo inteiro, útil para data/hora/topo
    try:
        full_text = _run_ocr(_variant_grayscale(base))
    except Exception:
        full_text = ""

    # OCR nas regiões recortadas
    for variant_name, image in variants:
        for cfg in ("--oem 3 --psm 6", "--oem 3 --psm 11", "--oem 3 --psm 12", "--oem 3 --psm 3"):
            try:
                text = pytesseract.image_to_string(image, lang=TESSERACT_LANG, config=cfg)
            except Exception:
                continue

            score = _text_score(text)
            if score > best_score:
                best_score = score
                best_text = text
                best_variant_name = f"{variant_name} | {cfg}"

            if _text_score(text) > _text_score(body_text):
                body_text = text

    # escolhe o melhor entre o corpo e o texto completo
    if _text_score(full_text) > _text_score(best_text):
        best_text = full_text
        best_variant_name = "full_image | best_ocr"

    if SAVE_OCR_DEBUG:
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        debug_dir = OCR_DEBUG_DIR / f"{stamp}_{image_path.stem}"
        debug_dir.mkdir(parents=True, exist_ok=True)

        try:
            base.save(debug_dir / "full_base.png")
        except Exception:
            pass

        try:
            body.save(debug_dir / "body_crop.png")
        except Exception:
            pass

        for name, img in variants:
            try:
                img.save(debug_dir / f"{name}.png")
            except Exception:
                pass

        try:
            (debug_dir / "full_text.txt").write_text(full_text or "", encoding="utf-8")
            (debug_dir / "body_text.txt").write_text(body_text or "", encoding="utf-8")
            (debug_dir / "best_text.txt").write_text(best_text or "", encoding="utf-8")
        except Exception:
            pass

    if not best_text.strip():
        raise ValueError("OCR não retornou texto útil.")

    lines = [line.strip() for line in best_text.splitlines() if line.strip()]

    occ_pct, total_locacoes, total_capacidade, data_relatorio, hora_relatorio = _parse_global_metrics(
        best_text, lines
    )

    zone_blocks = _extract_zone_blocks(lines)
    zones = []
    for zone_name, block_lines in zone_blocks.items():
        zones.append(_parse_zone_block(zone_name, block_lines))

    resumos = _build_resumos(zones)

    parsed = {
        "data_relatorio": data_relatorio or date.today().strftime("%d/%m/%Y"),
        "hora_relatorio": hora_relatorio,
        "ocupacao_geral_pct": occ_pct if occ_pct is not None else 0,
        "total_locacoes_ocupadas": total_locacoes if total_locacoes is not None else 0,
        "total_capacidade_instalada": total_capacidade if total_capacidade is not None else 0,
        "zonas": zones,
        "resumos": resumos,
        "avisos": [],
    }

    parsed["_meta"] = {
        "source_image": str(image_path),
        "processed_at": datetime.now().isoformat(timespec="seconds"),
        "ocr_engine": "pytesseract",
        "ocr_language": TESSERACT_LANG,
        "ocr_chars": len(best_text),
        "ocr_lines": len(lines),
        "best_variant": best_variant_name,
    }

    print(
        f"[ocr_parser] ✅ Dados extraídos: {len(zones)} zonas",
        flush=True,
    )
    return parsed


def to_fastapi_payload(data: dict) -> dict:
    """
    Converte os dados extraídos para o formato esperado pelo endpoint /capacity/daily-update.
    """
    zonas_formatadas = []
    for z in data.get("zonas", []):
        zonas_formatadas.append(
            {
                "zona": z.get("zona"),
                "tipo": z.get("tipo"),
                "slots_usados": z.get("total_ocupadas"),
                "total_slots": z.get("total_capacidade"),
                "ocupacao_pct": z.get("ocupacao_total_pct"),
                "subzonas": z.get("subzonas", []),
            }
        )

    return {
        "data_referencia": data.get("data_relatorio"),
        "ocupacao_geral_pct": data.get("ocupacao_geral_pct"),
        "total_locacoes_ocupadas": data.get("total_locacoes_ocupadas"),
        "total_capacidade": data.get("total_capacidade_instalada"),
        "zonas": zonas_formatadas,
        "resumos": data.get("resumos", []),
        "avisos": data.get("avisos", []),
        "fonte": "email_diario_local_ocr",
        "processado_em": data.get("_meta", {}).get("processed_at"),
    }


# ---------------------------------------------------------------------------
# Salvamento em disco
# ---------------------------------------------------------------------------

def save_json(data: dict, output_dir: Path = PARSED_DIR) -> Path:
    """
    Salva o JSON extraído em disco para cache/debug.
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    ref_date = (
        data.get("data_relatorio", date.today().strftime("%d/%m/%Y"))
        .replace("/", "-")
    )

    output_path = output_dir / f"ocupacao_lcb_{ref_date}.json"
    output_path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"[ocr_parser] JSON salvo: {output_path}", flush=True)
    return output_path


def parse_and_save(image_path: Path) -> dict:
    """
    Pipeline completo: OCR → salva JSON → retorna dados.
    """
    data = parse_image(image_path)
    save_json(data)
    return data


# ---------------------------------------------------------------------------
# Execução direta
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python ocr_parser.py <caminho_da_imagem>")
        print("Ex:  python ocr_parser.py attachments/ocupacao_lcb_2026-07-22.png")
        sys.exit(1)

    image_path = Path(sys.argv[1])

    try:
        data = parse_and_save(image_path)

        print("\n" + "=" * 60)
        print("DADOS EXTRAÍDOS")
        print("=" * 60)
        print(f"Data:       {data.get('data_relatorio')}")
        print(f"Hora:       {data.get('hora_relatorio')}")
        print(f"Ocupação:   {data.get('ocupacao_geral_pct')}%")
        print(f"Ocupadas:   {data.get('total_locacoes_ocupadas'):,}")
        print(f"Capacidade: {data.get('total_capacidade_instalada'):,}")

        print("\nZonas encontradas:")
        for zona in data.get("zonas", []):
            pct = zona.get("ocupacao_total_pct", "?")
            print(
                f"  {zona.get('zona', '?'):6} → {pct}% "
                f"({zona.get('total_ocupadas', '?')} / {zona.get('total_capacidade', '?')})"
            )

        print("\nResumos:")
        for r in data.get("resumos", []):
            print(f"  {r['grupo']}: {r['ocupacao_pct']}%")

        print("\n✅ Payload para FastAPI:")
        payload = to_fastapi_payload(data)
        print(json.dumps(payload, ensure_ascii=False, indent=2))

    except FileNotFoundError as e:
        print(f"\n❌ {e}")
        sys.exit(1)
    except ValueError as e:
        print(f"\n❌ Erro ao parsear OCR: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Erro inesperado: {e}")
        sys.exit(1)