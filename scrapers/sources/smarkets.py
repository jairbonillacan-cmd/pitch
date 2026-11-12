"""Adaptador y parser limpio para Smarkets Exchange API v3 (`https://api.smarkets.com/v3/`).

Estado en `docs/LEGAL_FUENTES_CUOTAS.md`: `blocked_pending_owner_decision`.
- En inspección real sin evasión (`2026-11-12T14:55Z` y Ola 5 `2026-11-10T16:00Z`), `api.smarkets.com/v3/events/`
  devuelve `HTTP 403` con cabecera `CF-Mitigated: challenge` (`"Smarkets - Security Check"`).
- Además, los Términos de Uso de `docs.smarkets.com` exigen cuenta verificada, aprobación explícita del
  *API Request Form* (£150) y sesión autenticada (`SMARKETS_SESSION_TOKEN`).
- Por Regla #7 (prohibido `solve_cloudflare` o evasión anti-bot), `SmarketsApiV3Adapter` está bloqueado
  (`blocked_pending_owner_decision`) y excluido del programador activo.
- Incluye el parser completo `parse_smarkets_v3_bundle(...)` que une `/v3/events/` + `/v3/markets/` +
  `/v3/contracts/` + `/v3/quotes/` (corrigiendo el hueco de Ola 3 donde faltaba `/contracts/`) para uso
  inmediato si el propietario obtiene cuenta Smarkets API v3 aprobada.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Mapping, Sequence

from scrapers.sources.base import (
    SourceBlockedError,
    SourceMetadata,
    normalize_line_value,
    validate_and_normalize_tick_rows,
)
from scrapers.sources.team_resolution import (
    build_canonical_event_id,
    resolve_canonical_team,
    resolve_sport_and_league,
    slugify_team,
)

SMARKETS_API_V3_BASE = "https://api.smarkets.com/v3"

SMARKETS_METADATA = SourceMetadata(
    source_id="smarkets",
    display_name="Smarkets Exchange API v3",
    kind="sharp",
    legal_status="blocked_pending_owner_decision",
    official_api=True,
    required_env_vars=("SMARKETS_SESSION_TOKEN",),
    requires_antibot_evasion=True,
    rate_limit_rps=2.0,
    legal_reason=(
        "Acceso anónimo a api.smarkets.com/v3/events/ bloqueado por reto anti-bot Cloudflare "
        "(HTTP 403, CF-Mitigated: challenge / 'Smarkets - Security Check') y los ToS de Smarkets API "
        "exigen aprobación formal de cuenta API (£150) + SMARKETS_SESSION_TOKEN. Prohibido evadir con solve_cloudflare."
    ),
    inspected_endpoints=(
        "https://smarkets.com/robots.txt",
        "https://api.smarkets.com/robots.txt",
        f"{SMARKETS_API_V3_BASE}/events/?state=upcoming&type=football_match&limit=3",
    ),
)


def bps_to_decimal_odds(implied_bps: Any) -> float | None:
    """Convierte precio implícito de Smarkets en puntos base (`1..9999`, donde `5000 = 50% -> 2.00`) a decimal."""
    if implied_bps is None or isinstance(implied_bps, bool):
        return None
    try:
        bps = float(implied_bps)
    except (TypeError, ValueError):
        return None
    if bps <= 0.0 or bps >= 10000.0:
        return None
    return round(10000.0 / bps, 6)


def _extract_league_hint_from_slug(full_slug: str) -> str:
    parts = [p for p in full_slug.strip("/").split("/") if p]
    # Ejemplo: `/sport/football/england-premier-league/2026/...`
    if len(parts) >= 3 and parts[0] == "sport":
        return parts[2]
    return full_slug


def _parse_smarkets_teams(event_obj: Mapping[str, Any]) -> tuple[str, str] | None:
    ev_name = str(event_obj.get("name") or "").strip()
    for sep in (" vs ", " v ", " @ "):
        if sep in ev_name:
            left, right = [p.strip() for p in ev_name.split(sep, 1)]
            if left and right:
                return (right, left) if sep == " @ " else (left, right)
    return None


def parse_smarkets_v3_bundle(
    *,
    events: Sequence[Mapping[str, Any]],
    markets: Sequence[Mapping[str, Any]],
    contracts: Sequence[Mapping[str, Any]],
    quotes: Mapping[str, Mapping[str, Any]],
    captured_at_iso: str,
    raw_sha256: str,
) -> list[dict[str, Any]]:
    """Une determinísticamente `events + markets + contracts + quotes` de Smarkets API v3.

    En Smarkets API v3, `offers` representa liquidez disponible para que el apostador haga *back*
    (comprar el contrato), expresada en probabilidad implícita en puntos base (`10000 / bps = decimal`).
    """
    events_by_id: dict[str, Mapping[str, Any]] = {
        str(e["id"]): e for e in events if isinstance(e, Mapping) and e.get("id") is not None
    }
    markets_by_id: dict[str, Mapping[str, Any]] = {
        str(m["id"]): m for m in markets if isinstance(m, Mapping) and m.get("id") is not None
    }

    candidates: list[dict[str, Any]] = []

    for contract in contracts:
        if not isinstance(contract, Mapping) or contract.get("id") is None:
            continue
        cid = str(contract["id"])
        mid = str(contract.get("market_id") or "")
        mkt = markets_by_id.get(mid)
        if mkt is None:
            continue
        ev_id_raw = str(mkt.get("event_id") or "")
        ev = events_by_id.get(ev_id_raw)
        if ev is None:
            continue

        ev_state = str(ev.get("state") or "").strip().lower()
        if ev_state in ("live", "ended", "settled", "cancelled"):
            continue

        teams = _parse_smarkets_teams(ev)
        start_dt = str(ev.get("start_datetime") or "").strip()
        if teams is None or not start_dt:
            continue
        home_raw, away_raw = teams

        ev_type = str(ev.get("type") or "").strip().lower()
        league_hint = _extract_league_hint_from_slug(str(ev.get("full_slug") or ""))
        sp_lg = resolve_sport_and_league(ev_type, league_hint)
        if sp_lg is None:
            continue
        canon_sport, canon_league = sp_lg

        try:
            canon_event_id = build_canonical_event_id(canon_sport, canon_league, start_dt, home_raw, away_raw)
        except ValueError:
            continue

        home_slug = slugify_team(resolve_canonical_team(home_raw, canon_sport, canon_league))
        away_slug = slugify_team(resolve_canonical_team(away_raw, canon_sport, canon_league))

        quote_obj = quotes.get(cid)
        if not isinstance(quote_obj, Mapping):
            continue
        offers = quote_obj.get("offers") or []
        if not offers or not isinstance(offers[0], Mapping):
            continue
        # Mejor precio disponible para apostar a favor (back): mayor cuota decimal = menor bps en offers
        best_bps = min(
            (float(o["price"]) for o in offers if isinstance(o, Mapping) and o.get("price") is not None),
            default=None,
        )
        price_dec = bps_to_decimal_odds(best_bps)
        if price_dec is None:
            continue

        mslug = str(mkt.get("slug") or mkt.get("market_type", {}).get("name") if isinstance(mkt.get("market_type"), Mapping) else mkt.get("slug") or "").strip().lower()
        mname = str(mkt.get("name") or "").strip().lower()
        cslug = str(contract.get("slug") or contract.get("outcome_or_type") or "").strip().lower()
        cname = str(contract.get("name") or "").strip()

        canon_mkt: str | None = None
        canon_line: float | None = None
        selection: str | None = None

        if mslug in ("full-time-result", "winner", "moneyline", "to-win") or mname in ("full-time result", "winner", "moneyline"):
            canon_mkt = "1x2" if canon_sport == "football" else "moneyline"
            canon_line = None
            if cslug in ("draw", "tie") or cname.lower() in ("draw", "tie"):
                if canon_mkt != "1x2":
                    continue
                selection = "draw"
            elif cslug == "home":
                selection = "home"
            elif cslug == "away":
                selection = "away"
            else:
                c_team_slug = slugify_team(resolve_canonical_team(cname, canon_sport, canon_league))
                if c_team_slug == home_slug:
                    selection = "home"
                elif c_team_slug == away_slug:
                    selection = "away"

        elif "over-under" in mslug or "over/under" in mname or "total" in mslug:
            canon_mkt = "totals"
            param = mkt.get("market_type", {}).get("param") if isinstance(mkt.get("market_type"), Mapping) else mkt.get("line")
            if param is None:
                # Extraer línea de slugs como `over-under-2-5` -> `2.5`
                tail = mslug.replace("over-under-", "").replace("-", ".")
                canon_line = normalize_line_value(tail)
            else:
                canon_line = normalize_line_value(param)
            if "over" in cslug or cname.lower().startswith("over"):
                selection = "over"
            elif "under" in cslug or cname.lower().startswith("under"):
                selection = "under"

        elif mslug in ("both-teams-to-score", "btts") and canon_sport == "football":
            canon_mkt = "btts"
            canon_line = None
            if cslug == "yes" or cname.lower() == "yes":
                selection = "yes"
            elif cslug == "no" or cname.lower() == "no":
                selection = "no"

        elif mslug in ("draw-no-bet", "dnb") and canon_sport == "football":
            canon_mkt = "dnb"
            canon_line = None
            c_team_slug = slugify_team(resolve_canonical_team(cname, canon_sport, canon_league))
            if cslug == "home" or c_team_slug == home_slug:
                selection = "home"
            elif cslug == "away" or c_team_slug == away_slug:
                selection = "away"

        if canon_mkt is None or selection is None:
            continue

        candidates.append(
            {
                "event_id": canon_event_id,
                "sport": canon_sport,
                "league": canon_league,
                "market": canon_mkt,
                "line": canon_line,
                "selection": selection,
                "book": "smarkets",
                "price_decimal": price_dec,
                "ts_captured": captured_at_iso,
                "ts_event_start": start_dt,
                "source": "scraped_ws",
                "raw_sha256": raw_sha256,
            }
        )

    rows, _ = validate_and_normalize_tick_rows(candidates)
    return rows


class SmarketsApiV3Adapter:
    """Adaptador Smarkets v3 bloqueado por decisión pendiente del propietario (`blocked_pending_owner_decision`)."""

    metadata = SMARKETS_METADATA

    def fetch_snapshots(
        self,
        *,
        sports: Sequence[str] = ("football", "nfl"),
        captured_at: datetime | None = None,
    ) -> list[dict[str, Any]]:
        raise SourceBlockedError(self.metadata.legal_reason)
