"""Adaptador legal `api_only` para Betfair Exchange API-NG (`https://api.betfair.com/exchange/betting/rest/v1.0/`).

Estado en `docs/LEGAL_FUENTES_CUOTAS.md`: `api_only`.
- Jamás hace scraping web sobre `www.betfair.com` (bloqueado por `HTTP 403` y prohibido por ToS).
- Consume únicamente los endpoints oficiales JSON-RPC/REST de Betfair Exchange API-NG cuando
  `BETFAIR_APP_KEY` y `BETFAIR_SESSION_TOKEN` están configurados en el entorno.
"""

from __future__ import annotations

from datetime import datetime, timezone
import os
import re
from typing import Any, Mapping, Sequence

from scrapers.sources.base import (
    CleanScraplingHttpTransport,
    HttpTransportProtocol,
    MissingCredentialsError,
    PerSourceRateLimiter,
    SourceMetadata,
    normalize_line_value,
    sha256_payload,
    validate_and_normalize_tick_rows,
)
from scrapers.sources.team_resolution import (
    build_canonical_event_id,
    format_utc_iso,
    resolve_canonical_team,
    resolve_sport_and_league,
    slugify_team,
)

BETFAIR_API_NG_BASE = "https://api.betfair.com/exchange/betting/rest/v1.0"

# Event Type IDs oficiales de Betfair Exchange: 1 = Soccer, 6423 = American Football
BETFAIR_EVENT_TYPE_IDS: dict[str, str] = {
    "football": "1",
    "nfl": "6423",
}

BETFAIR_METADATA = SourceMetadata(
    source_id="betfair_exchange",
    display_name="Betfair Exchange API-NG",
    kind="sharp",
    legal_status="api_only",
    official_api=True,
    required_env_vars=("BETFAIR_APP_KEY", "BETFAIR_SESSION_TOKEN"),
    requires_antibot_evasion=False,
    rate_limit_rps=2.0,
    legal_reason=(
        "Betfair Exchange API-NG oficial documentada (docs.developer.betfair.com); "
        "requiere BETFAIR_APP_KEY y BETFAIR_SESSION_TOKEN (ausentes en entorno). Scraping web prohibido."
    ),
    inspected_endpoints=(
        "https://www.betfair.com/robots.txt",
        f"{BETFAIR_API_NG_BASE}/listMarketCatalogue/",
        f"{BETFAIR_API_NG_BASE}/listMarketBook/",
    ),
)

_OU_LINE_RE = re.compile(r"OVER_UNDER_(\d)(\d)$")


def _parse_event_teams(event_name: str) -> tuple[str, str] | None:
    for sep in (" v ", " vs ", " @ "):
        if sep in event_name:
            left, right = [p.strip() for p in event_name.split(sep, 1)]
            if left and right:
                # En formato US `"Away @ Home"`, invertir a `(home, away)`
                return (right, left) if sep == " @ " else (left, right)
    return None


def parse_betfair_catalogue_and_books(
    catalogue: Sequence[Mapping[str, Any]],
    market_books: Sequence[Mapping[str, Any]],
    *,
    sport: str,
    captured_at_iso: str,
    raw_sha256: str,
) -> list[dict[str, Any]]:
    """Une `listMarketCatalogue` y `listMarketBook` de Betfair API-NG al esquema `11 + 1`."""
    cat_by_market_id: dict[str, Mapping[str, Any]] = {}
    for item in catalogue:
        if isinstance(item, Mapping) and item.get("marketId"):
            cat_by_market_id[str(item["marketId"])] = item

    candidates: list[dict[str, Any]] = []

    for mb in market_books:
        if not isinstance(mb, Mapping):
            continue
        if bool(mb.get("inplay", False)):
            continue
        mid = str(mb.get("marketId") or "")
        cat = cat_by_market_id.get(mid)
        if cat is None:
            continue

        ev = cat.get("event") or {}
        comp = cat.get("competition") or {}
        desc = cat.get("description") or {}
        ev_name = str(ev.get("name") or "").strip()
        open_date = str(ev.get("openDate") or cat.get("marketStartTime") or "").strip()
        comp_name = str(comp.get("name") or ("NFL" if sport == "nfl" else "")).strip()

        teams = _parse_event_teams(ev_name)
        if teams is None or not open_date:
            continue
        home_raw, away_raw = teams

        sp_lg = resolve_sport_and_league(sport, comp_name)
        if sp_lg is None:
            continue
        canon_sport, canon_league = sp_lg

        try:
            event_id = build_canonical_event_id(canon_sport, canon_league, open_date, home_raw, away_raw)
        except ValueError:
            continue

        home_slug = slugify_team(resolve_canonical_team(home_raw, canon_sport, canon_league))
        away_slug = slugify_team(resolve_canonical_team(away_raw, canon_sport, canon_league))

        runner_names: dict[int, str] = {}
        for r_cat in cat.get("runners") or []:
            if isinstance(r_cat, Mapping) and r_cat.get("selectionId") is not None:
                runner_names[int(r_cat["selectionId"])] = str(r_cat.get("runnerName") or "").strip()

        mtype = str(desc.get("marketType") or cat.get("marketName") or "").strip().upper()
        ou_match = _OU_LINE_RE.search(mtype)

        if mtype in ("MATCH_ODDS", "MONEY_LINE"):
            has_draw = any(n.lower() in ("the draw", "draw") for n in runner_names.values())
            canon_mkt = "1x2" if (has_draw or canon_sport == "football") else "moneyline"
            canon_line: float | None = None
        elif ou_match:
            canon_mkt = "totals"
            canon_line = normalize_line_value(float(f"{ou_match.group(1)}.{ou_match.group(2)}"))
        else:
            continue

        for runner in mb.get("runners") or []:
            if not isinstance(runner, Mapping) or runner.get("selectionId") is None:
                continue
            if str(runner.get("status") or "ACTIVE").upper() != "ACTIVE":
                continue
            sid = int(runner["selectionId"])
            rname = runner_names.get(sid, "")
            rlow = rname.lower()

            ex = runner.get("ex") or {}
            atb = ex.get("availableToBack") or []
            if not atb or not isinstance(atb[0], Mapping):
                continue
            best_back_price = atb[0].get("price")

            if canon_mkt in ("1x2", "moneyline"):
                if rlow in ("the draw", "draw"):
                    if canon_mkt != "1x2":
                        continue
                    sel = "draw"
                else:
                    rslug = slugify_team(resolve_canonical_team(rname, canon_sport, canon_league))
                    if rslug == home_slug:
                        sel = "home"
                    elif rslug == away_slug:
                        sel = "away"
                    else:
                        continue
            else:
                if "over" in rlow:
                    sel = "over"
                elif "under" in rlow:
                    sel = "under"
                else:
                    continue

            candidates.append(
                {
                    "event_id": event_id,
                    "sport": canon_sport,
                    "league": canon_league,
                    "market": canon_mkt,
                    "line": canon_line,
                    "selection": sel,
                    "book": "betfair_exchange",
                    "price_decimal": best_back_price,
                    "ts_captured": captured_at_iso,
                    "ts_event_start": open_date,
                    "source": "scraped_ws",
                    "raw_sha256": raw_sha256,
                }
            )

    rows, _ = validate_and_normalize_tick_rows(candidates)
    return rows


class BetfairExchangeAdapter:
    """Adaptador oficial para Betfair Exchange API-NG."""

    metadata = BETFAIR_METADATA

    def __init__(
        self,
        *,
        env: Mapping[str, str] | None = None,
        transport: HttpTransportProtocol | None = None,
        max_results: int = 100,
    ) -> None:
        self._env = os.environ if env is None else env
        self.transport = transport or CleanScraplingHttpTransport(
            rate_limiter=PerSourceRateLimiter(self.metadata.rate_limit_rps)
        )
        self.max_results = max_results

    def fetch_snapshots(
        self,
        *,
        sports: Sequence[str] = ("football", "nfl"),
        captured_at: datetime | None = None,
    ) -> list[dict[str, Any]]:
        if not self.metadata.credentials_present(self._env):
            raise MissingCredentialsError(
                "BETFAIR_APP_KEY y/o BETFAIR_SESSION_TOKEN ausentes en el entorno; Betfair API-NG inactiva."
            )
        app_key = str(self._env["BETFAIR_APP_KEY"]).strip()
        session_token = str(self._env["BETFAIR_SESSION_TOKEN"]).strip()
        auth_headers = {
            "X-Application": app_key,
            "X-Authentication": session_token,
        }

        cap_dt = captured_at or datetime.now(timezone.utc)
        cap_iso = format_utc_iso(cap_dt)
        all_rows: list[dict[str, Any]] = []

        for sp in sports:
            sp_norm = sp.strip().lower()
            ev_type_id = BETFAIR_EVENT_TYPE_IDS.get(sp_norm)
            if not ev_type_id:
                continue

            cat_resp = self.transport.request(
                "POST",
                f"{BETFAIR_API_NG_BASE}/listMarketCatalogue/",
                headers=auth_headers,
                json_body={
                    "filter": {
                        "eventTypeIds": [ev_type_id],
                        "inPlayOnly": False,
                        "marketTypeCodes": ["MATCH_ODDS", "MONEY_LINE", "OVER_UNDER_25"],
                    },
                    "maxResults": str(self.max_results),
                    "marketProjection": ["EVENT", "COMPETITION", "RUNNER_DESCRIPTION", "MARKET_DESCRIPTION", "MARKET_START_TIME"],
                },
            )
            catalogue = cat_resp.json()
            if not isinstance(catalogue, list) or not catalogue:
                continue

            market_ids = [str(item["marketId"]) for item in catalogue if isinstance(item, Mapping) and item.get("marketId")]
            if not market_ids:
                continue

            book_resp = self.transport.request(
                "POST",
                f"{BETFAIR_API_NG_BASE}/listMarketBook/",
                headers=auth_headers,
                json_body={
                    "marketIds": market_ids[:40],
                    "priceProjection": {"priceData": ["EX_BEST_OFFERS"]},
                },
            )
            market_books = book_resp.json()
            if not isinstance(market_books, list):
                continue

            combined_sha = sha256_payload({"catalogue_sha": cat_resp.sha256, "book_sha": book_resp.sha256})
            rows = parse_betfair_catalogue_and_books(
                catalogue,
                market_books,
                sport=sp_norm,
                captured_at_iso=cap_iso,
                raw_sha256=combined_sha,
            )
            all_rows.extend(rows)

        deduped, _ = validate_and_normalize_tick_rows(all_rows)
        return deduped
