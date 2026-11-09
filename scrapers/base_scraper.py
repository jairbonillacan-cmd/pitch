"""Clase base obligatoria con Scrapling (v0.5.1+) para la rama web-scraping de PitchLab.

REGLA DE INGENIERÍA:
Toda extracción en esta rama debe realizarse exclusivamente mediante Scrapling
(`FetcherSession`, `StealthySession`, `AsyncStealthySession`, `RemoteSession`, `Spider`
o el CLI `scrapling extract ... --ai-targeted`).
Cada captura queda sellada con `captured_at_utc` (ISO-8601 UTC) y `sha256` para
garantizar la regla anti-leakage (`captured_at_utc <= predicted_at_utc`).
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import sys
from typing import Any

from scrapling.fetchers import (
    AsyncStealthySession,
    FetcherSession,
    RemoteSession,
    StealthySession,
)

ROOT_DIR = Path(__file__).resolve().parent.parent
CATALOG_PATH = ROOT_DIR / "config" / "sources_catalog.json"
DATA_RAW_DIR = ROOT_DIR / "data" / "raw"


def utc_now_iso() -> str:
    """Devuelve el timestamp actual en UTC ISO-8601."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def sha256_text(content: str | bytes) -> str:
    """Calcula el hash SHA-256 hexadecimal de un texto o bytes."""
    raw = content.encode("utf-8") if isinstance(content, str) else content
    return hashlib.sha256(raw).hexdigest()


def load_sources_catalog(catalog_path: Path = CATALOG_PATH) -> dict[str, Any]:
    """Carga y valida el catálogo maestro de fuentes de web scraping."""
    data = json.loads(catalog_path.read_text(encoding="utf-8"))
    engine = data.get("engine", {})
    if engine.get("library") != "scrapling" or not engine.get("strict_rules", {}).get(
        "exclusive_scrapling_only"
    ):
        raise ValueError("El catálogo debe exigir el uso exclusivo de Scrapling.")
    return data


class PitchLabScraplingBase:
    """Envoltorio estándar sobre Scrapling con sellado `captured_at_utc` y `sha256`."""

    def __init__(self, source_id: str, catalog_path: Path = CATALOG_PATH) -> None:
        self.catalog = load_sources_catalog(catalog_path)
        sources_by_id = {s["id"]: s for s in self.catalog.get("sources", [])}
        if source_id not in sources_by_id:
            raise KeyError(
                f"Fuente '{source_id}' no encontrada en {catalog_path}. "
                f"Disponibles: {sorted(sources_by_id.keys())}"
            )
        self.source = sources_by_id[source_id]
        self.source_id = source_id
        self.category = self.source["category"]
        self.config = self.source.get("scrapling_config", {})

    def save_raw_snapshot(
        self,
        payload: Any,
        url: str,
        label: str = "snapshot",
        extra_meta: dict[str, Any] | None = None,
    ) -> Path:
        """Guarda un snapshot inmutable en `data/raw/{category}/{source_id}/{YYYY-MM-DD}/`."""
        captured_at = utc_now_iso()
        date_folder = captured_at[:10]
        target_dir = DATA_RAW_DIR / self.category / self.source_id / date_folder
        target_dir.mkdir(parents=True, exist_ok=True)

        serialized_payload = (
            payload
            if isinstance(payload, str)
            else json.dumps(payload, ensure_ascii=False, sort_keys=True)
        )
        content_hash = sha256_text(serialized_payload)
        safe_ts = captured_at.replace(":", "").replace("-", "")
        out_path = target_dir / f"{safe_ts}_{label}_{content_hash[:10]}.json"

        envelope = {
            "source_id": self.source_id,
            "source_name": self.source["name"],
            "category": self.category,
            "url": url,
            "scrapling_mode": self.source["scrapling_mode"],
            "captured_at_utc": captured_at,
            "sha256": content_hash,
            "meta": extra_meta or {},
            "payload": payload,
        }
        out_path.write_text(
            json.dumps(envelope, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        return out_path

    def fetch_static(self, url: str | None = None):
        """Modo 1: `FetcherSession` con impersonación TLS de Chrome y cabeceras stealth."""
        target_url = url or self.source["base_url"]
        impersonate = self.config.get("impersonate", "chrome")
        stealthy_headers = self.config.get("stealthy_headers", True)
        http3 = self.config.get("http3", True)
        adaptive = self.config.get("adaptive", True)

        with FetcherSession(
            impersonate=impersonate,
            stealthy_headers=stealthy_headers,
            http3=http3,
        ) as session:
            return session.get(target_url, adaptive=adaptive)

    def fetch_stealthy(
        self, url: str | None = None, cdp_url: str | None = None
    ):
        """Modo 2: `StealthySession` (Cloudflare Turnstile) o `RemoteSession` (CDP)."""
        target_url = url or self.source["base_url"]
        if cdp_url:
            with RemoteSession(cdp_url=cdp_url, new_context=False) as session:
                return session.fetch(target_url)

        with StealthySession(
            headless=self.config.get("headless", True),
            solve_cloudflare=self.config.get("solve_cloudflare", True),
            network_idle=self.config.get("network_idle", True),
            block_ads=True,
        ) as session:
            return session.fetch(target_url, google_search=False)

    async def capture_network_json(
        self, url: str | None = None, api_url_pattern: str | None = None
    ) -> list[dict[str, Any]]:
        """Modo 3: `AsyncStealthySession(record_requests=True)` para capturar JSON/XHR."""
        target_url = url or self.source["base_url"]
        pattern = api_url_pattern or self.config.get("api_url_pattern", r".*")
        captured: list[dict[str, Any]] = []

        async with AsyncStealthySession(
            headless=self.config.get("headless", True),
            solve_cloudflare=self.config.get("solve_cloudflare", True),
            record_requests=True,
            block_ads=True,
        ) as session:
            await session.fetch(
                target_url, network_idle=self.config.get("network_idle", True)
            )

        for resp in session.network.search(url_pattern=pattern, limit=None):
            captured.append(
                {
                    "network_id": resp.meta.get("network_id"),
                    "url": resp.url,
                    "status": resp.status,
                    "resource_type": resp.meta.get("resource_type"),
                    "body": resp.body,
                }
            )
        return captured

    def extract_markdown_cli(
        self, url: str | None = None, out_name: str = "article.md"
    ) -> Path:
        """Modo 5: Ejecuta el binario `scrapling extract ... --ai-targeted`."""
        target_url = url or self.source["base_url"]
        captured_at = utc_now_iso()
        date_folder = captured_at[:10]
        target_dir = DATA_RAW_DIR / self.category / self.source_id / date_folder
        target_dir.mkdir(parents=True, exist_ok=True)
        out_path = target_dir / out_name

        scrapling_bin = Path(sys.executable).parent / (
            "scrapling.exe" if sys.platform == "win32" else "scrapling"
        )
        subcmd = self.config.get("cli_command", "extract get").split()
        cmd = [str(scrapling_bin), *subcmd, target_url, str(out_path), "--ai-targeted"]
        subprocess.run(cmd, check=True)
        return out_path


def _cli() -> None:
    parser = argparse.ArgumentParser(
        description="Gestor y verificador del catálogo de fuentes con Scrapling."
    )
    parser.add_argument(
        "--verify-catalog",
        action="store_true",
        help="Verifica el esquema del catálogo y realiza una prueba local de snapshot.",
    )
    parser.add_argument(
        "--list-sources",
        action="store_true",
        help="Lista todas las fuentes configuradas en sources_catalog.json.",
    )
    args = parser.parse_args()

    catalog = load_sources_catalog()
    sources = catalog.get("sources", [])

    if args.list_sources:
        for src in sources:
            print(
                f"[{src['priority']}] {src['id']:34s} | {src['category']:22s} | "
                f"mode={src['scrapling_mode']:17s} | {src['base_url']}"
            )

    if args.verify_catalog:
        categories = {c["id"] for c in catalog.get("categories", [])}
        required_ids = {"opta_player_stats", "statiskicks", "pinnacle", "caliente_mx"}
        present_ids = {s["id"] for s in sources}
        missing = required_ids - present_ids
        if missing:
            raise AssertionError(f"Faltan fuentes obligatorias: {missing}")
        for s in sources:
            assert s["category"] in categories, f"Categoría inválida en {s['id']}"
            assert s["scrapling_mode"] in {
                "fetcher_session",
                "stealthy_session",
                "network_recorder",
                "spider",
                "cli_ai_targeted",
            }, f"Modo Scrapling inválido en {s['id']}"
        print(
            f"OK: Catálogo verificado ({len(sources)} fuentes en {len(categories)} categorías, "
            f"motor={catalog['engine']['library']} >= {catalog['engine']['min_version']})."
        )


if __name__ == "__main__":
    _cli()
