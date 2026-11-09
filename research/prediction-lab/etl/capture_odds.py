#!/usr/bin/env python3
"""Captura snapshots fechados de las cuotas pre-partido de football-data.co.uk.

Motivación (limitación P0 del ciclo 1): football-data.co.uk publica cuotas de cierre
por partido en sus CSV históricos, pero **no publica el timestamp en que esas cuotas
fueron válidas**. Sin un instante de captura propio no se puede medir CLV (closing
line value). Este script resuelve la mitad del problema: fija el instante.

Qué hace
--------
1. Descarga `fixtures.csv` (cuotas pre-partido de las próximas jornadas) con
   User-Agent de navegador, siguiendo el redirect www -> apex.
2. Valida el payload: columnas esperadas, tamaño mínimo, filas parseables, cuotas
   presentes. Si algo no cuadra, falla con código 2 y **no escribe nada**.
3. Escribe `data/snapshots/odds_<UTC ISO compacta>.csv` conservando las columnas
   originales tal cual (como texto, sin re-formatear floats) y añadiendo:
       captured_at_utc   instante UTC de la petición (no del fichero del proveedor)
       source_url        URL efectiva de la que se descargó
4. Actualiza `data/snapshots/manifest.json` con bytes, sha256, filas, columnas,
   cabeceras HTTP y metadatos de cobertura.

Idempotencia
------------
La clave es el **sha256 del payload crudo** (`payload_sha256`), no el del fichero
escrito: el CSV escrito lleva `captured_at_utc`, así que su hash cambia en cada
ejecución aunque las cuotas sean idénticas. Si el payload ya está en el manifiesto
y el fichero existe con su hash intacto, no se duplica nada (exit 0, status
"duplicate"). `--force` escribe igualmente un snapshot nuevo.

Uso
---
    ./.venv/bin/python etl/capture_odds.py                # captura normal
    ./.venv/bin/python etl/capture_odds.py --dry-run      # descarga + valida, no escribe
    ./.venv/bin/python etl/capture_odds.py --out-dir /tmp/snap
    ./.venv/bin/python etl/capture_odds.py --verify       # re-valida hashes del manifiesto

Ejecución diaria (NO instalado por este script; ver reports/A13_odds_snapshots.md)
---------------------------------------------------------------------------------
cron (captura a las 12:05 UTC, log a logs/capture_odds.log):

    5 12 * * * cd /Users/jairbonilla/PitchLab-Prediction-Lab/research/prediction-lab \
      && ./.venv/bin/python etl/capture_odds.py >> logs/capture_odds.log 2>&1

launchd (~/Library/LaunchAgents/com.pitchlab.capture-odds.plist), StartCalendarInterval
con Hour=12 Minute=5, ProgramArguments con el python del venv y el script, y
StandardOutPath/StandardErrorPath a logs/. Cargar con `launchctl bootstrap gui/$(id -u) <plist>`.

Códigos de salida: 0 ok/duplicado, 1 error de red, 2 payload inválido, 3 manifiesto corrupto.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
import sys
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Iterable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_OUT_DIR = os.path.join(ROOT, "data", "snapshots")
SOURCE_URL = "https://www.football-data.co.uk/fixtures.csv"

# UA de navegador: robots.txt permite `User-agent: *` (Disallow vacío) y bloquea
# explícitamente UAs de crawlers de IA. Una petición al día, sin paralelismo.
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

MANIFEST_NAME = "manifest.json"
SCHEMA_VERSION = 1

# Columnas sin las cuales el snapshot no sirve para CLV 1X2.
CORE_COLUMNS = ("Div", "Date", "Time", "HomeTeam", "AwayTeam")
REQUIRED_ODDS = (
    "B365H", "B365D", "B365A",
    "AvgH", "AvgD", "AvgA",
    "MaxH", "MaxD", "MaxA",
)
# Columnas que enriquezen el snapshot pero cuya ausencia no lo invalida.
OPTIONAL_ODDS = (
    "BFDH", "BFDD", "BFDA", "BVH", "BVD", "BVA", "BWH", "BWD", "BWA",
    "PPH", "PPD", "PPA", "SKBH", "SKBD", "SKBA", "BFEH", "BFED", "BFEA",
    "B365>2.5", "B365<2.5", "Max>2.5", "Max<2.5", "Avg>2.5", "Avg<2.5",
    "BFE>2.5", "BFE<2.5", "AHh", "B365AHH", "B365AHA",
)

MIN_ROWS = 20
MIN_BYTES = 5_000
MAX_BYTES = 5_000_000
DATE_FORMATS = ("%d/%m/%Y", "%d/%m/%y")


class CaptureError(RuntimeError):
    """Payload descargado que no cumple el contrato del snapshot."""

    exit_code = 2


# --------------------------------------------------------------------------- #
# Utilidades
# --------------------------------------------------------------------------- #
def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso_utc(dt: datetime) -> str:
    """2026-11-09T09:58:03Z (segundos, sin microsegundos)."""
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def compact_utc(dt: datetime) -> str:
    """20261109T095803Z — válido en nombres de fichero y ordenable lexicográficamente."""
    return dt.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def sha256_hex(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def parse_fixture_date(value: str) -> str | None:
    v = (value or "").strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(v, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def parse_http_date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = parsedate_to_datetime(value)
    except (TypeError, ValueError):
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def atomic_write(path: str, payload: bytes) -> None:
    """Escribe con temporal + os.replace para no dejar ficheros a medias."""
    directory = os.path.dirname(path) or "."
    os.makedirs(directory, exist_ok=True)
    tmp = os.path.join(directory, f".{os.path.basename(path)}.tmp.{os.getpid()}")
    try:
        with open(tmp, "wb") as fh:
            fh.write(payload)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


# --------------------------------------------------------------------------- #
# Descarga
# --------------------------------------------------------------------------- #
def http_get(url: str, timeout: float, retries: int = 3, backoff: float = 2.0) -> tuple[bytes, dict[str, Any]]:
    """GET con reintentos solo para fallos transitorios (red, timeout, 5xx).

    `request_started_at_utc` se toma inmediatamente antes de abrir la conexión: es
    el instante que se propaga como `captured_at_utc`. No se usa Last-Modified
    porque describe cuándo el proveedor generó el fichero, no cuándo lo leímos.
    """
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "text/csv,text/plain,*/*",
        "Accept-Language": "en-GB,en;q=0.9,es;q=0.8",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Connection": "close",
    }
    last_error: Exception | None = None
    for attempt in range(1, retries + 1):
        started = utc_now()
        request = Request(url, headers=headers, method="GET")
        try:
            with urlopen(request, timeout=timeout) as response:
                status = getattr(response, "status", None) or response.getcode()
                body = response.read()
                completed = utc_now()
                meta = {
                    "request_started_at_utc": iso_utc(started),
                    "download_completed_at_utc": iso_utc(completed),
                    "download_seconds": round((completed - started).total_seconds(), 3),
                    "http_status": int(status),
                    "resolved_url": response.geturl(),
                    "content_type": response.headers.get("Content-Type"),
                    "content_length_header": response.headers.get("Content-Length"),
                    "etag": response.headers.get("ETag"),
                    "last_modified": response.headers.get("Last-Modified"),
                    "http_date": response.headers.get("Date"),
                    "server": response.headers.get("Server"),
                    "attempt": attempt,
                }
            if meta["http_status"] != 200:
                raise CaptureError(f"HTTP {meta['http_status']} al pedir {url}")
            return body, meta
        except HTTPError as exc:  # 4xx no se reintenta
            last_error = exc
            if 400 <= exc.code < 500 and exc.code != 429:
                raise CaptureError(f"HTTP {exc.code} al pedir {url}: {exc.reason}") from exc
            if attempt == retries:
                break
        except (URLError, TimeoutError, ConnectionError, OSError) as exc:
            last_error = exc
            if attempt == retries:
                break
        time.sleep(backoff ** (attempt - 1))
    raise ConnectionError(f"no se pudo descargar {url} tras {retries} intentos: {last_error}")


# --------------------------------------------------------------------------- #
# Validación del payload
# --------------------------------------------------------------------------- #
def decode_payload(raw: bytes) -> str:
    if not raw:
        raise CaptureError("respuesta vacía")
    if len(raw) < MIN_BYTES:
        raise CaptureError(f"payload demasiado pequeño: {len(raw)} bytes < {MIN_BYTES}")
    if len(raw) > MAX_BYTES:
        raise CaptureError(f"payload anómalamente grande: {len(raw)} bytes > {MAX_BYTES}")
    for encoding in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise CaptureError("no se pudo decodificar el payload")


def parse_payload(raw: bytes) -> tuple[list[str], list[list[str]], dict[str, Any]]:
    """Devuelve (cabecera, filas válidas, diagnóstico). No escribe nada."""
    text = decode_payload(raw)
    reader = csv.reader(io.StringIO(text, newline=""))
    try:
        header = [h.strip() for h in next(reader)]
    except StopIteration as exc:
        raise CaptureError("CSV sin cabecera") from exc

    if len(header) < 10:
        raise CaptureError(f"cabecera sospechosamente corta: {len(header)} columnas")
    if len(set(header)) != len(header):
        dupes = sorted({h for h in header if header.count(h) > 1})
        raise CaptureError(f"columnas duplicadas en cabecera: {dupes}")

    missing_core = [c for c in CORE_COLUMNS if c not in header]
    if missing_core:
        raise CaptureError(f"faltan columnas núcleo: {missing_core}")
    missing_odds = [c for c in REQUIRED_ODDS if c not in header]
    if missing_odds:
        raise CaptureError(f"faltan columnas de cuotas 1X2 obligatorias: {missing_odds}")

    index = {name: i for i, name in enumerate(header)}
    rows: list[list[str]] = []
    dropped: list[dict[str, Any]] = []
    for line_no, raw_row in enumerate(reader, start=2):
        if not any((cell or "").strip() for cell in raw_row):
            continue
        row = list(raw_row) + [""] * (len(header) - len(raw_row))
        row = row[: len(header)]
        div = row[index["Div"]].strip()
        home = row[index["HomeTeam"]].strip()
        away = row[index["AwayTeam"]].strip()
        date_iso = parse_fixture_date(row[index["Date"]])
        if not div or not home or not away or not date_iso:
            dropped.append({"line": line_no, "div": div, "date": row[index["Date"]],
                            "home": home, "away": away})
            continue
        rows.append(row)

    if len(rows) < MIN_ROWS:
        raise CaptureError(f"solo {len(rows)} filas válidas (< {MIN_ROWS}); ¿fin de temporada o HTML?")
    if len(dropped) > max(5, len(rows) // 10):
        raise CaptureError(f"demasiadas filas descartadas: {len(dropped)} de {len(rows) + len(dropped)}")

    def present(cols: Iterable[str]) -> list[str]:
        return [c for c in cols if c in index]

    def nonnull(cols: Iterable[str]) -> dict[str, int]:
        out: dict[str, int] = {}
        for col in cols:
            i = index[col]
            out[col] = sum(1 for r in rows if r[i].strip() not in ("", "NA", "N/A", "nan"))
        return out

    close_columns = [c for c in header if c.endswith(("CH", "CD", "CA")) and len(c) <= 6]
    odds_nonnull = nonnull(REQUIRED_ODDS)
    if odds_nonnull["B365H"] < len(rows) * 0.5:
        raise CaptureError(
            f"B365H solo poblada en {odds_nonnull['B365H']}/{len(rows)} filas; "
            "el fichero parece vacío o a medio publicar"
        )

    dates = sorted({parse_fixture_date(r[index["Date"]]) for r in rows} - {None})
    diagnostics = {
        "n_rows": len(rows),
        "n_columns": len(header),
        "n_dropped": len(dropped),
        "dropped_sample": dropped[:5],
        "columns_present": header,
        "columns_missing_optional": [c for c in OPTIONAL_ODDS if c not in index],
        "date_min": dates[0] if dates else None,
        "date_max": dates[-1] if dates else None,
        "divisions": sorted({r[index["Div"]].strip() for r in rows}),
        "odds_nonnull": odds_nonnull,
        "close_odds_columns_present": close_columns,
        "close_odds_nonnull_total": sum(nonnull(close_columns).values()) if close_columns else 0,
    }
    return header, rows, diagnostics


# --------------------------------------------------------------------------- #
# Snapshot
# --------------------------------------------------------------------------- #
def build_snapshot_csv(header: list[str], rows: list[list[str]], captured_at: datetime,
                       source_url: str) -> bytes:
    """Serializa el CSV del snapshot preservando los valores originales como texto."""
    buffer = io.StringIO(newline="")
    writer = csv.writer(buffer, lineterminator="\n", quoting=csv.QUOTE_MINIMAL)
    writer.writerow(list(header) + ["captured_at_utc", "source_url"])
    stamp = iso_utc(captured_at)
    for row in rows:
        writer.writerow(list(row) + [stamp, source_url])
    return buffer.getvalue().encode("utf-8")


def load_manifest(path: str) -> dict[str, Any]:
    if not os.path.exists(path):
        return {"schema_version": SCHEMA_VERSION, "source_url": SOURCE_URL, "snapshots": []}
    try:
        with open(path, "r", encoding="utf-8") as fh:
            manifest = json.load(fh)
    except (json.JSONDecodeError, OSError) as exc:
        raise RuntimeError(f"manifiesto ilegible en {path}: {exc}") from exc
    if not isinstance(manifest, dict) or not isinstance(manifest.get("snapshots"), list):
        raise RuntimeError(f"manifiesto con estructura inesperada en {path}")
    manifest.setdefault("schema_version", SCHEMA_VERSION)
    manifest.setdefault("source_url", SOURCE_URL)
    return manifest


def save_manifest(path: str, manifest: dict[str, Any]) -> None:
    manifest["updated_at_utc"] = iso_utc(utc_now())
    manifest["n_snapshots"] = len(manifest["snapshots"])
    manifest["snapshots"].sort(key=lambda e: e.get("captured_at_utc", ""))
    payload = json.dumps(manifest, indent=2, ensure_ascii=False, sort_keys=False) + "\n"
    atomic_write(path, payload.encode("utf-8"))


def find_duplicate(manifest: dict[str, Any], payload_sha: str) -> dict[str, Any] | None:
    for entry in manifest["snapshots"]:
        if entry.get("payload_sha256") == payload_sha:
            return entry
    return None


def verify_manifest(out_dir: str) -> int:
    path = os.path.join(out_dir, MANIFEST_NAME)
    try:
        manifest = load_manifest(path)
    except RuntimeError as exc:
        print(f"[verify] ERROR {exc}", file=sys.stderr)
        return 3
    if not manifest["snapshots"]:
        print("[verify] manifiesto vacío")
        return 0
    bad = 0
    for entry in manifest["snapshots"]:
        target = os.path.join(out_dir, entry["file"])
        if not os.path.exists(target):
            print(f"[verify] FALTA {entry['file']}")
            bad += 1
            continue
        with open(target, "rb") as fh:
            digest = sha256_hex(fh.read())
        if digest != entry.get("sha256"):
            print(f"[verify] HASH DISTINTO {entry['file']}: {digest[:12]} != {str(entry.get('sha256'))[:12]}")
            bad += 1
        else:
            print(f"[verify] ok {entry['file']} ({entry.get('n_rows')} filas)")
    print(f"[verify] {len(manifest['snapshots'])} snapshots, {bad} con problemas")
    return 0 if bad == 0 else 3


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def run(args: argparse.Namespace) -> int:
    out_dir = os.path.abspath(args.out_dir)
    manifest_path = os.path.join(out_dir, MANIFEST_NAME)

    try:
        manifest = load_manifest(manifest_path)
    except RuntimeError as exc:
        print(f"[capture] ERROR {exc}", file=sys.stderr)
        return 3

    print(f"[capture] GET {args.url}")
    try:
        raw, meta = http_get(args.url, timeout=args.timeout, retries=args.retries)
    except CaptureError as exc:
        print(f"[capture] PAYLOAD INVÁLIDO: {exc}", file=sys.stderr)
        return 2
    except ConnectionError as exc:
        print(f"[capture] ERROR DE RED: {exc}", file=sys.stderr)
        return 1

    payload_sha = sha256_hex(raw)
    captured_at = datetime.fromisoformat(meta["request_started_at_utc"].replace("Z", "+00:00"))

    try:
        header, rows, diag = parse_payload(raw)
    except CaptureError as exc:
        print(f"[capture] PAYLOAD INVÁLIDO: {exc}", file=sys.stderr)
        return 2

    http_dt = parse_http_date(meta.get("http_date"))
    last_mod = parse_http_date(meta.get("last_modified"))
    skew = (captured_at - http_dt).total_seconds() if http_dt else None
    staleness = (captured_at - last_mod).total_seconds() / 3600 if last_mod else None

    print(f"[capture] HTTP {meta['http_status']} · {len(raw):,} bytes · sha256 {payload_sha[:16]}…")
    print(f"[capture] {diag['n_rows']} filas · {diag['n_columns']} columnas · "
          f"{len(diag['divisions'])} divisiones · {diag['date_min']} → {diag['date_max']}")
    print(f"[capture] captured_at_utc={iso_utc(captured_at)} · desfase vs Date del servidor="
          f"{skew if skew is None else round(skew, 1)}s")
    if staleness is not None:
        print(f"[capture] Last-Modified={meta['last_modified']} → fichero con "
              f"{staleness:.1f} h de antigüedad en el momento de la captura")
    print(f"[capture] cuotas de cierre no nulas en origen: {diag['close_odds_nonnull_total']} "
          f"(columnas {len(diag['close_odds_columns_present'])} presentes)")

    duplicate = find_duplicate(manifest, payload_sha)
    if duplicate and not args.force:
        target = os.path.join(out_dir, duplicate["file"])
        intact = os.path.exists(target) and sha256_hex(open(target, "rb").read()) == duplicate.get("sha256")
        if intact:
            print(f"[capture] DUPLICADO: payload idéntico a {duplicate['file']} "
                  f"(capturado {duplicate['captured_at_utc']}); no se escribe nada.")
            return 0
        print(f"[capture] payload ya conocido pero {duplicate['file']} falta o corrupto: se repara.")

    file_name = f"odds_{compact_utc(captured_at)}.csv"
    target = os.path.join(out_dir, file_name)
    if os.path.exists(target) and not args.force:
        suffix = 1
        while os.path.exists(target):
            target = os.path.join(out_dir, f"odds_{compact_utc(captured_at)}_{suffix:02d}.csv")
            suffix += 1
        file_name = os.path.basename(target)

    snapshot_bytes = build_snapshot_csv(header, rows, captured_at, meta["resolved_url"])

    if args.dry_run:
        print(f"[capture] DRY-RUN: escribiría {file_name} "
              f"({len(snapshot_bytes):,} bytes, {diag['n_rows']} filas) y actualizaría {manifest_path}")
        return 0

    os.makedirs(out_dir, exist_ok=True)
    atomic_write(target, snapshot_bytes)
    file_sha = sha256_hex(snapshot_bytes)

    entry = {
        "file": file_name,
        "path": os.path.relpath(target, ROOT),
        "bytes": len(snapshot_bytes),
        "sha256": file_sha,
        "payload_sha256": payload_sha,
        "payload_bytes": len(raw),
        "n_rows": diag["n_rows"],
        "n_columns": diag["n_columns"],
        "n_dropped": diag["n_dropped"],
        "captured_at_utc": iso_utc(captured_at),
        "request_started_at_utc": meta["request_started_at_utc"],
        "download_completed_at_utc": meta["download_completed_at_utc"],
        "download_seconds": meta["download_seconds"],
        "source_url": meta["resolved_url"],
        "http": {
            "status": meta["http_status"],
            "content_type": meta["content_type"],
            "content_length_header": meta["content_length_header"],
            "etag": meta["etag"],
            "last_modified": meta["last_modified"],
            "server_date": meta["http_date"],
            "server": meta["server"],
            "clock_skew_seconds": None if skew is None else round(skew, 1),
            "source_staleness_hours": None if staleness is None else round(staleness, 2),
        },
        "date_min": diag["date_min"],
        "date_max": diag["date_max"],
        "divisions": diag["divisions"],
        "columns_present": diag["columns_present"],
        "columns_missing_optional": diag["columns_missing_optional"],
        "odds_nonnull": diag["odds_nonnull"],
        "close_odds_columns_present": diag["close_odds_columns_present"],
        "close_odds_nonnull_total": diag["close_odds_nonnull_total"],
    }

    if duplicate:
        # Reemplaza la entrada del mismo payload (reparación / --force) en vez de duplicarla.
        manifest["snapshots"] = [e for e in manifest["snapshots"] if e.get("payload_sha256") != payload_sha]
    manifest["snapshots"].append(entry)
    save_manifest(manifest_path, manifest)

    print(f"[capture] escrito {target} ({len(snapshot_bytes):,} bytes, sha256 {file_sha[:16]}…)")
    print(f"[capture] manifiesto actualizado: {manifest_path} "
          f"({len(manifest['snapshots'])} snapshots)")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Captura un snapshot fechado de fixtures.csv (cuotas pre-partido).",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--out-dir", default=DEFAULT_OUT_DIR, help="directorio de snapshots")
    parser.add_argument("--url", default=SOURCE_URL, help="URL de fixtures.csv")
    parser.add_argument("--dry-run", action="store_true",
                        help="descarga y valida, pero no escribe snapshot ni manifiesto")
    parser.add_argument("--force", action="store_true",
                        help="escribe aunque el payload ya exista en el manifiesto")
    parser.add_argument("--timeout", type=float, default=30.0, help="timeout por intento (s)")
    parser.add_argument("--retries", type=int, default=3, help="intentos ante fallo transitorio")
    parser.add_argument("--verify", action="store_true",
                        help="solo re-valida los sha256 del manifiesto y sale")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.verify:
        return verify_manifest(os.path.abspath(args.out_dir))
    return run(args)


if __name__ == "__main__":
    sys.exit(main())
