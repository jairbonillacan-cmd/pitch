"""Registro legal centralizado de las 7 fuentes auditadas (`docs/LEGAL_FUENTES_CUOTAS.md`).

Garantiza por construcción que **ninguna** fuente `blocked_pending_owner_decision` ni ninguna fuente
`api_only` con credenciales ausentes entre activa a `scrapers/cadence_scheduler.py`.
"""

from __future__ import annotations

from datetime import datetime
import os
from typing import Any, Mapping, Sequence

from scrapers.sources.base import (
    HttpTransportProtocol,
    OddsSourceAdapter,
    SourceBlockedError,
    SourceMetadata,
)
from scrapers.sources.betfair import BETFAIR_METADATA, BetfairExchangeAdapter
from scrapers.sources.codere import CODERE_METADATA, CodereAdapter
from scrapers.sources.smarkets import SMARKETS_METADATA, SmarketsApiV3Adapter
from scrapers.sources.the_odds_api import (
    BOOKMAKER_KEY_MAP as THE_ODDS_API_BOOKMAKER_MAP,
    THE_ODDS_API_METADATA,
    TheOddsApiAdapter,
)

PINNACLE_METADATA = SourceMetadata(
    source_id="pinnacle",
    display_name="Pinnacle (Web / Arcadia Guest API / B2B)",
    kind="sharp",
    legal_status="blocked_pending_owner_decision",
    official_api=True,
    required_env_vars=("PINNACLE_B2B_API_KEY",),
    requires_antibot_evasion=True,
    rate_limit_rps=0.25,
    legal_reason=(
        "Los ToS de Pinnacle prohíben expresamente bots/scrapers sobre páginas web o APIs internas "
        "(guest.api.arcadia.pinnacle.com), el scraper previo usaba solve_cloudflare=True y no existe "
        "contrato/credencial B2B activa (PINNACLE_B2B_API_KEY ausente). Consumible legalmente vía The Odds API."
    ),
    inspected_endpoints=(
        "https://www.pinnacle.com/robots.txt",
        "https://guest.api.arcadia.pinnacle.com/0.1/sports",
    ),
)

CALIENTE_METADATA = SourceMetadata(
    source_id="caliente",
    display_name="Caliente.mx (sports.caliente.mx)",
    kind="recreational",
    legal_status="blocked_pending_owner_decision",
    official_api=False,
    required_env_vars=(),
    requires_antibot_evasion=True,
    rate_limit_rps=0.2,
    legal_reason=(
        "GET limpio sin evasión a https://sports.caliente.mx/es_MX/Futbol devuelve HTTP 403 "
        "(CF-Mitigated: challenge / 'Just a moment...'), carece de API oficial pública y los ToS de "
        "Caliplay S.A.P.I. de C.V. prohíben extracción automatizada."
    ),
    inspected_endpoints=(
        "https://www.caliente.mx/robots.txt",
        "https://sports.caliente.mx/robots.txt",
        "https://sports.caliente.mx/es_MX/Futbol",
    ),
)

ACTION_NETWORK_METADATA = SourceMetadata(
    source_id="action_network",
    display_name="Action Network (actionnetwork.com)",
    kind="aggregator",
    legal_status="blocked_pending_owner_decision",
    official_api=False,
    required_env_vars=(),
    requires_antibot_evasion=True,
    rate_limit_rps=0.2,
    legal_reason=(
        "Cláusula expresa en https://www.actionnetwork.com/terms (HTTP 200 OBSERVADO) prohíbe "
        "'deep-link', 'page-scrape', 'robot' o 'spider' sin consentimiento escrito previo; carece de API pública."
    ),
    inspected_endpoints=(
        "https://www.actionnetwork.com/robots.txt",
        "https://www.actionnetwork.com/terms",
    ),
)


class BlockedSourceStubAdapter:
    """Adaptador centinela que impide ejecutar fuentes bloqueadas por Regla #7."""

    def __init__(self, metadata: SourceMetadata) -> None:
        self.metadata = metadata

    def fetch_snapshots(
        self,
        *,
        sports: Sequence[str] = ("football", "nfl"),
        captured_at: datetime | None = None,
    ) -> list[dict[str, Any]]:
        raise SourceBlockedError(self.metadata.legal_reason)


AUDITED_SOURCES_METADATA: tuple[SourceMetadata, ...] = (
    PINNACLE_METADATA,
    SMARKETS_METADATA,
    CALIENTE_METADATA,
    CODERE_METADATA,
    BETFAIR_METADATA,
    THE_ODDS_API_METADATA,
    ACTION_NETWORK_METADATA,
)


def get_allowed_canonical_books() -> frozenset[str]:
    """Devuelve el conjunto de nombres `book` canónicos permitidos por las fuentes `ok`/`api_only`."""
    books = set(THE_ODDS_API_BOOKMAKER_MAP.values())
    books.add("betfair_exchange")
    return frozenset(books)


def build_all_registered_adapters(
    *,
    env: Mapping[str, str] | None = None,
    transports: Mapping[str, HttpTransportProtocol] | None = None,
) -> dict[str, OddsSourceAdapter]:
    """Instancia todos los adaptadores del registro (incluidos centinelas bloqueados para auditoría/tests)."""
    env_map = os.environ if env is None else env
    tmap = transports or {}
    return {
        "pinnacle": BlockedSourceStubAdapter(PINNACLE_METADATA),
        "smarkets": SmarketsApiV3Adapter(),
        "caliente": BlockedSourceStubAdapter(CALIENTE_METADATA),
        "codere": CodereAdapter(),
        "betfair_exchange": BetfairExchangeAdapter(env=env_map, transport=tmap.get("betfair_exchange")),
        "the_odds_api": TheOddsApiAdapter(env=env_map, transport=tmap.get("the_odds_api")),
        "action_network": BlockedSourceStubAdapter(ACTION_NETWORK_METADATA),
    }


def build_active_source_adapters(
    *,
    env: Mapping[str, str] | None = None,
    transports: Mapping[str, HttpTransportProtocol] | None = None,
) -> list[OddsSourceAdapter]:
    """Devuelve ÚNICAMENTE las fuentes aprobadas (`ok` / `api_only`) con credenciales presentes en `env`.

    Jamás incluye una fuente `blocked_pending_owner_decision` ni una fuente sin credenciales requeridas.
    """
    env_map = os.environ if env is None else env
    all_adapters = build_all_registered_adapters(env=env_map, transports=transports)
    active: list[OddsSourceAdapter] = []
    for meta in AUDITED_SOURCES_METADATA:
        if meta.is_eligible_for_scheduler(env_map):
            active.append(all_adapters[meta.source_id])
    return active


def summarize_legal_registry(env: Mapping[str, str] | None = None) -> dict[str, Any]:
    """Genera el desglose legal para `health.json` y reportes del programador."""
    env_map = os.environ if env is None else env
    approved_sources: list[dict[str, Any]] = []
    active_source_ids: list[str] = []
    credential_pending_sources: list[dict[str, Any]] = []
    blocked_sources: list[dict[str, Any]] = []

    for meta in AUDITED_SOURCES_METADATA:
        if meta.legal_status == "blocked_pending_owner_decision":
            blocked_sources.append(
                {
                    "source": meta.source_id,
                    "display_name": meta.display_name,
                    "kind": meta.kind,
                    "status": "blocked_pending_owner_decision",
                    "reason": meta.legal_reason,
                }
            )
        else:
            creds_ok = meta.credentials_present(env_map)
            eligible = meta.is_eligible_for_scheduler(env_map)
            entry = {
                "source": meta.source_id,
                "display_name": meta.display_name,
                "kind": meta.kind,
                "status": meta.legal_status,
                "required_env_vars": list(meta.required_env_vars),
                "credentials_present": creds_ok,
                "active_in_scheduler": eligible,
            }
            approved_sources.append(entry)
            if eligible:
                active_source_ids.append(meta.source_id)
            elif not creds_ok:
                credential_pending_sources.append(entry)

    return {
        "approved_sources": approved_sources,
        "active_sources": active_source_ids,
        "credential_pending_sources": credential_pending_sources,
        "blocked_sources": blocked_sources,
    }
