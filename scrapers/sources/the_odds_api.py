"""Adaptador legal `api_only` para The Odds API v4 (`https://api.the-odds-api.com/v4/`).

Estado en `docs/LEGAL_FUENTES_CUOTAS.md`: `api_only`.
- No requiere evasión anti-bot (`cf-mitigated: ""`).
- Requiere `THE_ODDS_API_KEY` en el entorno. Si no está configurada, permanece inactivo en el programador.
- Extrae simultáneamente casas sharp (`pinnacle`, `smarkets`, `betfair_exchange`) y recreativas
  (`bet365`, `draftkings`, `fanduel`, `betmgm`, `codere`, `bwin`, `william_hill`, `betrivers`).

Presupuesto de créditos (plan gratuito Starter = 500 créditos/mes):
- Cada llamada a `/odds` cuesta `n_mercados × n_regiones` créditos por liga. `/events` es gratis.
- Por defecto se pide solo `regions=eu` (incluye Pinnacle y Betfair EU) y `markets=h2h`: 1 crédito por liga.
- `OddsApiBudget` reparte el saldo del mes en partes iguales por día, deja una reserva, espera un
  intervalo mínimo entre capturas de la misma liga y omite ligas sin partidos en la ventana
  (consulta gratuita a `/events`). El gasto se persiste en un JSON junto a las series de cuotas.
- Variables opcionales: `THE_ODDS_API_MONTHLY_CREDITS` (`500`; `0` = sin tope, para planes de pago),
  `THE_ODDS_API_RESERVE_CREDITS` (`25`), `THE_ODDS_API_MIN_INTERVAL_MINUTES` (`180`),
  `THE_ODDS_API_LOOKAHEAD_HOURS` (`48`), `THE_ODDS_API_REGIONS` (`eu`), `THE_ODDS_API_MARKETS` (`h2h`),
  `THE_ODDS_API_LEAGUES` (claves de The Odds API separadas por coma; por defecto todas las configuradas).
"""

from __future__ import annotations

import calendar
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
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


DEFAULT_REGIONS = "eu"
DEFAULT_MARKETS = "h2h"
BUDGET_LEDGER_FILENAME = "the_odds_api_budget.json"


def _env_number(env: Mapping[str, str], name: str, default: float) -> float:
    raw = str(env.get(name) or "").strip()
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError as exc:
        raise ValueError(f"{name} debe ser numérico, se recibió {raw!r}") from exc


def _csv_count(value: str) -> int:
    return len([p for p in value.split(",") if p.strip()])


def _parse_int_header(value: str | None) -> int | None:
    if value is None:
        return None
    try:
        return int(float(value))
    except ValueError:
        return None


@dataclass(frozen=True)
class OddsApiBudgetConfig:
    """Límites de gasto. `monthly_credits=None` desactiva el tope (planes de pago)."""

    monthly_credits: int | None = 500
    reserve_credits: int = 25
    min_interval_minutes: float = 180.0
    lookahead_hours: float = 48.0

    @classmethod
    def unlimited(cls) -> "OddsApiBudgetConfig":
        return cls(monthly_credits=None, reserve_credits=0, min_interval_minutes=0.0)

    @classmethod
    def from_env(cls, env: Mapping[str, str]) -> "OddsApiBudgetConfig":
        monthly = int(_env_number(env, "THE_ODDS_API_MONTHLY_CREDITS", 500))
        return cls(
            monthly_credits=monthly if monthly > 0 else None,
            reserve_credits=int(_env_number(env, "THE_ODDS_API_RESERVE_CREDITS", 25)),
            min_interval_minutes=_env_number(env, "THE_ODDS_API_MIN_INTERVAL_MINUTES", 180.0),
            lookahead_hours=_env_number(env, "THE_ODDS_API_LOOKAHEAD_HOURS", 48.0),
        )


@dataclass
class OddsApiBudget:
    """Libro de gasto mensual persistido en JSON; decide si una liga puede consultarse ahora."""

    config: OddsApiBudgetConfig
    path: Path | None = None
    month: str = ""
    credits_used: int = 0
    by_day: dict[str, int] = field(default_factory=dict)
    last_call_by_league: dict[str, str] = field(default_factory=dict)
    remaining_header: int | None = None

    @classmethod
    def load(cls, config: OddsApiBudgetConfig, path: Path | None) -> "OddsApiBudget":
        budget = cls(config=config, path=path)
        if path is not None and path.exists():
            data = json.loads(path.read_text(encoding="utf-8"))
            budget.month = str(data.get("month") or "")
            budget.credits_used = int(data.get("credits_used") or 0)
            budget.by_day = {str(k): int(v) for k, v in (data.get("by_day") or {}).items()}
            budget.last_call_by_league = {str(k): str(v) for k, v in (data.get("last_call_by_league") or {}).items()}
            rem = data.get("remaining_header")
            budget.remaining_header = int(rem) if rem is not None else None
        return budget

    def _roll_month(self, now: datetime) -> None:
        month = now.strftime("%Y-%m")
        if self.month != month:
            self.month = month
            self.credits_used = 0
            self.by_day = {}

    def daily_allowance(self, now: datetime) -> float | None:
        """Créditos que se pueden gastar hoy: saldo restante del mes repartido entre los días que faltan."""
        if self.config.monthly_credits is None:
            return None
        self._roll_month(now)
        today = now.strftime("%Y-%m-%d")
        used_today = self.by_day.get(today, 0)
        available = self.config.monthly_credits - self.config.reserve_credits - (self.credits_used - used_today)
        days_in_month = calendar.monthrange(now.year, now.month)[1]
        days_left = days_in_month - now.day + 1
        return max(0.0, available / days_left)

    def check(self, league_key: str, cost: int, now: datetime) -> str | None:
        """Devuelve el motivo para omitir la llamada, o `None` si se puede gastar."""
        self._roll_month(now)
        last_iso = self.last_call_by_league.get(league_key)
        if last_iso and self.config.min_interval_minutes > 0:
            last_dt = datetime.fromisoformat(last_iso.replace("Z", "+00:00"))
            if now - last_dt < timedelta(minutes=self.config.min_interval_minutes):
                return "intervalo_minimo"
        if self.config.monthly_credits is None:
            return None
        if self.remaining_header is not None and self.remaining_header - cost < self.config.reserve_credits:
            return "reserva_mensual"
        allowance = self.daily_allowance(now)
        used_today = self.by_day.get(now.strftime("%Y-%m-%d"), 0)
        if allowance is not None and used_today + cost > allowance:
            return "tope_diario"
        return None

    def record(self, league_key: str, cost: int, now: datetime, remaining: int | None) -> None:
        self._roll_month(now)
        today = now.strftime("%Y-%m-%d")
        self.credits_used += cost
        self.by_day[today] = self.by_day.get(today, 0) + cost
        self.last_call_by_league[league_key] = format_utc_iso(now)
        if remaining is not None:
            self.remaining_header = remaining

    def save(self) -> None:
        if self.path is None:
            return
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "month": self.month,
            "credits_used": self.credits_used,
            "by_day": self.by_day,
            "last_call_by_league": self.last_call_by_league,
            "remaining_header": self.remaining_header,
            "monthly_credits": self.config.monthly_credits,
            "reserve_credits": self.config.reserve_credits,
        }
        self.path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


class TheOddsApiAdapter:
    """Cliente oficial de The Odds API v4 con presupuesto de créditos y límite de tasa."""

    metadata = THE_ODDS_API_METADATA

    def __init__(
        self,
        *,
        env: Mapping[str, str] | None = None,
        transport: HttpTransportProtocol | None = None,
        regions: str | None = None,
        markets: str | None = None,
        budget: OddsApiBudgetConfig | None = None,
        budget_path: Path | None = None,
        precheck_events: bool = True,
    ) -> None:
        self._env = os.environ if env is None else env
        self.transport = transport or CleanScraplingHttpTransport(
            rate_limiter=PerSourceRateLimiter(self.metadata.rate_limit_rps)
        )
        self.regions = regions or str(self._env.get("THE_ODDS_API_REGIONS") or DEFAULT_REGIONS).strip()
        self.markets = markets or str(self._env.get("THE_ODDS_API_MARKETS") or DEFAULT_MARKETS).strip()
        self.budget_config = budget or OddsApiBudgetConfig.from_env(self._env)
        # El programador fija `budget_path` dentro de su `output_dir` si queda en `None`.
        self.budget_path = budget_path
        self._memory_budget: OddsApiBudget | None = None
        self.precheck_events = precheck_events
        leagues_raw = str(self._env.get("THE_ODDS_API_LEAGUES") or "").strip()
        self.league_filter = frozenset(p.strip() for p in leagues_raw.split(",") if p.strip()) or None
        self.last_quota_headers: dict[str, str] = {}
        self.last_budget_report: dict[str, Any] = {}

    @property
    def credits_per_call(self) -> int:
        return _csv_count(self.markets) * _csv_count(self.regions)

    def _has_events_in_window(self, api_key: str, api_sport_key: str, cap_dt: datetime) -> bool:
        """Consulta gratuita a `/events` para no gastar créditos en ligas sin partidos próximos."""
        resp = self.transport.request(
            "GET",
            f"{THE_ODDS_API_BASE_URL}/sports/{api_sport_key}/events",
            params={
                "apiKey": api_key,
                "dateFormat": "iso",
                "commenceTimeFrom": format_utc_iso(cap_dt),
                "commenceTimeTo": format_utc_iso(cap_dt + timedelta(hours=self.budget_config.lookahead_hours)),
            },
        )
        payload = resp.json()
        return isinstance(payload, list) and len(payload) > 0

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
        if self.budget_path is not None or self._memory_budget is None:
            self._memory_budget = OddsApiBudget.load(self.budget_config, self.budget_path)
        budget = self._memory_budget
        cost = self.credits_per_call
        fetched: list[str] = []
        skipped: dict[str, str] = {}

        all_rows: list[dict[str, Any]] = []
        for sp in sports:
            sp_norm = sp.strip().lower()
            for api_sport_key, canon_league in SPORT_TO_API_KEYS.get(sp_norm, ()):
                if self.league_filter is not None and api_sport_key not in self.league_filter:
                    continue
                reason = budget.check(api_sport_key, cost, cap_dt)
                if reason is None and self.precheck_events and not self._has_events_in_window(
                    api_key, api_sport_key, cap_dt
                ):
                    reason = "sin_partidos_en_ventana"
                if reason is not None:
                    skipped[api_sport_key] = reason
                    continue

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
                actual_cost = _parse_int_header(hdrs_low.get("x-requests-last"))
                budget.record(
                    api_sport_key,
                    actual_cost if actual_cost is not None else cost,
                    cap_dt,
                    _parse_int_header(hdrs_low.get("x-requests-remaining")),
                )
                fetched.append(api_sport_key)

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

        budget.save()
        allowance = budget.daily_allowance(cap_dt)
        self.last_budget_report = {
            "credits_per_call": cost,
            "regions": self.regions,
            "markets": self.markets,
            "leagues_fetched": fetched,
            "leagues_skipped": skipped,
            "month_credits_used": budget.credits_used,
            "today_credits_used": budget.by_day.get(cap_dt.strftime("%Y-%m-%d"), 0),
            "today_allowance": round(allowance, 2) if allowance is not None else None,
            "remaining_header": budget.remaining_header,
        }
        deduped, _ = validate_and_normalize_tick_rows(all_rows)
        return deduped
