"""Adaptador legal `api_only` para The Odds API v4 (`https://api.the-odds-api.com/v4/`).

Estado en `docs/LEGAL_FUENTES_CUOTAS.md`: `api_only`.
- No requiere evasión anti-bot (`cf-mitigated: ""`).
- Requiere `THE_ODDS_API_KEY` en el entorno. Si no está configurada, permanece inactivo en el programador.
- Extrae simultáneamente casas sharp (`pinnacle`, `smarkets`, `betfair_exchange`) y recreativas
  (`bet365`, `draftkings`, `fanduel`, `betmgm`, `codere`, `bwin`, `william_hill`, `betrivers`).
"""

from __future__ import annotations

from datetime import datetime, timezone
import os
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

THE_ODDS_API_BASE_URL = "https://api.the-odds-api.com/v4"

SPORT_TO_API_KEYS: dict[str, tuple[tuple[str, str], ...]] = {
    "football": (
        ("soccer_mexico_ligamx", "MEX"),
        ("soccer_epl", "E0"),
        ("soccer_spain_la_liga", "SP1"),
        ("soccer_germany_bundesliga", "D1"),
        ("soccer_italy_serie_a", "I1"),
        ("soccer_france_ligue_one", "F1"),
        ("soccer_uefa_champs_league", "UCL"),
    ),
    "nfl": (
        ("americanfootball_nfl", "NFL"),
    ),
}

BOOKMAKER_KEY_MAP: dict[str, str] = {
    # Sharp
    "pinnacle": "pinnacle",
    "smarkets": "smarkets",
    "betfair_ex_eu": "betfair_exchange",
    "betfair_ex_uk": "betfair_exchange",
    "betfair_ex_au": "betfair_exchange",
    # Recreativas autorizadas vía API oficial
    "bet365": "bet365",
    "draftkings": "draftkings",
    "fanduel": "fanduel",
    "betmgm": "betmgm",
    "betrivers": "betrivers",
    "bwin": "bwin",
    "williamhill": "william_hill",
    "williamhill_us": "william_hill",
    "codere_it": "codere",
    "unibet_eu": "unibet",
    "betonlineag": "betonline",
}

THE_ODDS_API_METADATA = SourceMetadata(
    source_id="the_odds_api",
    display_name="The Odds API (v4 Official REST)",
    kind="aggregator",
    legal_status="api_only",
    official_api=True,
    required_env_vars=("THE_ODDS_API_KEY",),
    requires_antibot_evasion=False,
    rate_limit_rps=1.0,
    legal_reason=(
        "API REST oficial documentada que autoriza ingesta programática de cuotas sharp y recreativas; "
        "inactiva hasta configurar THE_ODDS_API_KEY en el entorno."
    ),
    inspected_endpoints=(f"{THE_ODDS_API_BASE_URL}/sports/",),
)


def parse_the_odds_api_events(
    events_payload: Sequence[Mapping[str, Any]],
    *,
    sport: str,
    league: str,
    captured_at_iso: str,
    raw_sha256: str,
) -> list[dict[str, Any]]:
    """Convierte la respuesta JSON de `/v4/sports/{sport}/odds` al esquema `11 + 1`."""
    resolved = resolve_sport_and_league(sport, league)
    if resolved is None:
        return []
    canon_sport, canon_league = resolved

    candidates: list[dict[str, Any]] = []

    for ev in events_payload:
        if not isinstance(ev, Mapping):
            continue
        home_raw = str(ev.get("home_team") or "").strip()
        away_raw = str(ev.get("away_team") or "").strip()
        commence_raw = str(ev.get("commence_time") or "").strip()
        if not home_raw or not away_raw or not commence_raw:
            continue

        try:
            event_id = build_canonical_event_id(canon_sport, canon_league, commence_raw, home_raw, away_raw)
        except ValueError:
            continue

        canon_home = resolve_canonical_team(home_raw, canon_sport, canon_league)
        canon_away = resolve_canonical_team(away_raw, canon_sport, canon_league)
        home_slug = slugify_team(canon_home)
        away_slug = slugify_team(canon_away)

        for bm in ev.get("bookmakers") or []:
            if not isinstance(bm, Mapping):
                continue
            bm_key = str(bm.get("key") or "").strip().lower()
            canon_book = BOOKMAKER_KEY_MAP.get(bm_key)
            if not canon_book:
                continue

            for mkt in bm.get("markets") or []:
                if not isinstance(mkt, Mapping):
                    continue
                mkey = str(mkt.get("key") or "").strip().lower()
                outcomes = [o for o in (mkt.get("outcomes") or []) if isinstance(o, Mapping)]
                if not outcomes:
                    continue

                if mkey == "h2h":
                    has_draw = any(str(o.get("name") or "").strip().lower() in ("draw", "tie") for o in outcomes)
                    canon_mkt = "1x2" if (has_draw or canon_sport == "football") else "moneyline"
                    for out in outcomes:
                        oname = str(out.get("name") or "").strip()
                        olow = oname.lower()
                        if olow in ("draw", "tie"):
                            if canon_mkt != "1x2":
                                continue
                            sel = "draw"
                        else:
                            oslug = slugify_team(resolve_canonical_team(oname, canon_sport, canon_league))
                            if oslug == home_slug:
                                sel = "home"
                            elif oslug == away_slug:
                                sel = "away"
                            else:
                                continue
                        candidates.append(
                            {
                                "event_id": event_id,
                                "sport": canon_sport,
                                "league": canon_league,
                                "market": canon_mkt,
                                "line": None,
                                "selection": sel,
                                "book": canon_book,
                                "price_decimal": out.get("price"),
                                "ts_captured": captured_at_iso,
                                "ts_event_start": commence_raw,
                                "source": "scraped_ws",
                                "raw_sha256": raw_sha256,
                            }
                        )

                elif mkey == "spreads":
                    canon_mkt = "ah" if canon_sport == "football" else "spread"
                    mapped_sides: list[tuple[str, float | None, Any]] = []
                    home_line: float | None = None
                    for out in outcomes:
                        oname = str(out.get("name") or "").strip()
                        oslug = slugify_team(resolve_canonical_team(oname, canon_sport, canon_league))
                        pt = normalize_line_value(out.get("point"))
                        if oslug == home_slug:
                            sel = "home"
                            if pt is not None:
                                home_line = pt
                        elif oslug == away_slug:
                            sel = "away"
                            if home_line is None and pt is not None:
                                home_line = normalize_line_value(-pt)
                        else:
                            continue
                        mapped_sides.append((sel, pt, out.get("price")))

                    if home_line is None:
                        continue
                    for sel, _, price_val in mapped_sides:
                        candidates.append(
                            {
                                "event_id": event_id,
                                "sport": canon_sport,
                                "league": canon_league,
                                "market": canon_mkt,
                                "line": home_line,
                                "selection": sel,
                                "book": canon_book,
                                "price_decimal": price_val,
                                "ts_captured": captured_at_iso,
                                "ts_event_start": commence_raw,
                                "source": "scraped_ws",
                                "raw_sha256": raw_sha256,
                            }
                        )

                elif mkey == "totals":
                    for out in outcomes:
                        olow = str(out.get("name") or "").strip().lower()
                        if olow not in ("over", "under"):
                            continue
                        pt = normalize_line_value(out.get("point"))
                        if pt is None:
                            continue
                        candidates.append(
                            {
                                "event_id": event_id,
                                "sport": canon_sport,
                                "league": canon_league,
                                "market": "totals",
                                "line": pt,
                                "selection": olow,
                                "book": canon_book,
                                "price_decimal": out.get("price"),
                                "ts_captured": captured_at_iso,
                                "ts_event_start": commence_raw,
                                "source": "scraped_ws",
                                "raw_sha256": raw_sha256,
                            }
                        )

                elif mkey == "btts" and canon_sport == "football":
                    for out in outcomes:
                        olow = str(out.get("name") or "").strip().lower()
                        if olow not in ("yes", "no"):
                            continue
                        candidates.append(
                            {
                                "event_id": event_id,
                                "sport": canon_sport,
                                "league": canon_league,
                                "market": "btts",
                                "line": None,
                                "selection": olow,
                                "book": canon_book,
                                "price_decimal": out.get("price"),
                                "ts_captured": captured_at_iso,
                                "ts_event_start": commence_raw,
                                "source": "scraped_ws",
                                "raw_sha256": raw_sha256,
                            }
                        )

                elif mkey == "draw_no_bet" and canon_sport == "football":
                    for out in outcomes:
                        oname = str(out.get("name") or "").strip()
                        oslug = slugify_team(resolve_canonical_team(oname, canon_sport, canon_league))
                        if oslug == home_slug:
                            sel = "home"
                        elif oslug == away_slug:
                            sel = "away"
                        else:
                            continue
                        candidates.append(
                            {
                                "event_id": event_id,
                                "sport": canon_sport,
                                "league": canon_league,
                                "market": "dnb",
                                "line": None,
                                "selection": sel,
                                "book": canon_book,
                                "price_decimal": out.get("price"),
                                "ts_captured": captured_at_iso,
                                "ts_event_start": commence_raw,
                                "source": "scraped_ws",
                                "raw_sha256": raw_sha256,
                            }
                        )

    rows, _ = validate_and_normalize_tick_rows(candidates)
    return rows


class TheOddsApiAdapter:
    """Cliente oficial de The Odds API v4 con control de cuota y límite de tasa."""

    metadata = THE_ODDS_API_METADATA

    def __init__(
        self,
        *,
        env: Mapping[str, str] | None = None,
        transport: HttpTransportProtocol | None = None,
        regions: str = "eu,uk,us",
        markets: str = "h2h,spreads,totals",
    ) -> None:
        self._env = os.environ if env is None else env
        self.transport = transport or CleanScraplingHttpTransport(
            rate_limiter=PerSourceRateLimiter(self.metadata.rate_limit_rps)
        )
        self.regions = regions
        self.markets = markets
        self.last_quota_headers: dict[str, str] = {}

    def fetch_snapshots(
        self,
        *,
        sports: Sequence[str] = ("football", "nfl"),
        captured_at: datetime | None = None,
    ) -> list[dict[str, Any]]:
        if not self.metadata.credentials_present(self._env):
            raise MissingCredentialsError(
                "THE_ODDS_API_KEY no está configurada en el entorno; the_odds_api requiere credencial oficial."
            )
        api_key = str(self._env["THE_ODDS_API_KEY"]).strip()
        cap_dt = captured_at or datetime.now(timezone.utc)
        cap_iso = format_utc_iso(cap_dt)

        all_rows: list[dict[str, Any]] = []
        for sp in sports:
            sp_norm = sp.strip().lower()
            for api_sport_key, canon_league in SPORT_TO_API_KEYS.get(sp_norm, ()):
                url = f"{THE_ODDS_API_BASE_URL}/sports/{api_sport_key}/odds"
                resp = self.transport.request(
                    "GET",
                    url,
                    params={
                        "apiKey": api_key,
                        "regions": self.regions,
                        "markets": self.markets,
                        "oddsFormat": "decimal",
                        "dateFormat": "iso",
                    },
                )
                hdrs_low = {k.lower(): str(v) for k, v in resp.headers.items()}
                for qk in ("x-requests-remaining", "x-requests-used", "x-requests-last"):
                    if qk in hdrs_low:
                        self.last_quota_headers[qk] = hdrs_low[qk]

                payload = resp.json()
                if isinstance(payload, list):
                    raw_hash = resp.sha256 if resp.body else sha256_payload(payload)
                    rows = parse_the_odds_api_events(
                        payload,
                        sport=sp_norm,
                        league=canon_league,
                        captured_at_iso=cap_iso,
                        raw_sha256=raw_hash,
                    )
                    all_rows.extend(rows)

        deduped, _ = validate_and_normalize_tick_rows(all_rows)
        return deduped
