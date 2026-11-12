"""Revisión legal y parser estructurado de eventos/equipos para Codere MX (`v3.2` · `B3` Paso 4).

Diagnóstico documentado en `docs/LEGAL_FUENTES_CUOTAS.md` §3:
1. El dominio heredado `https://m.codere.mx/deportes/#/HomePage` devuelve `HTTP 404` (`OBSERVADO`).
2. El sportsbook vigente `https://apuestas.codere.mx/robots.txt` (`HTTP 200`) declara explícitamente:
     `User-agent: *`
     `Disallow: /`
     `Allow: /es_MX$`
   prohibiendo el rastreo automatizado de ligas, partidos, mercados y feeds bajo `apuestas.codere.mx`.
3. Por Regla #7 y Ficha B3 Paso 4, Codere queda marcada `blocked_pending_owner_decision` y `CodereAdapter`
   jamás ejecuta peticiones de scraping ni evasión anti-bot (`solve_cloudflare`).
4. Para dejar corregido el defecto estructural del scraper de Ola 2 (que extraía tokens sueltos `+240` sin
   partido ni equipos), `parse_codere_events_payload(...)` implementa la extracción determinista completa
   de `home_team`, `away_team`, `ts_event_start`, `event_id` canónico y mercados sobre payloads JSON
   estructurados (en caso de que el propietario habilite un feed oficial/afiliado autorizado), rechazando
   cualquier cuota huérfana sin equipos ni hora de inicio verificable.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Mapping, Sequence

from scrapers.sources.base import (
    SourceBlockedError,
    SourceMetadata,
    american_to_decimal,
    normalize_line_value,
    validate_and_normalize_tick_rows,
)
from scrapers.sources.team_resolution import (
    PSEUDO_TEAM_LABELS,
    build_canonical_event_id,
    resolve_canonical_team,
    resolve_sport_and_league,
    slugify_team,
)

CODERE_METADATA = SourceMetadata(
    source_id="codere",
    display_name="Codere México (apuestas.codere.mx)",
    kind="recreational",
    legal_status="blocked_pending_owner_decision",
    official_api=False,
    required_env_vars=(),
    requires_antibot_evasion=True,
    rate_limit_rps=0.25,
    legal_reason=(
        "https://apuestas.codere.mx/robots.txt declara 'User-agent: * / Disallow: / / Allow: /es_MX$' "
        "(HTTP 200 OBSERVADO), m.codere.mx devuelve HTTP 404 y los ToS de Libros Foráneos S.A. de C.V. "
        "prohíben extracción automatizada sin autorización."
    ),
    inspected_endpoints=(
        "https://apuestas.codere.mx/robots.txt",
        "https://www.codere.mx/robots.txt",
        "https://m.codere.mx/robots.txt",
        "https://www.codere.mx/ayuda/legal/terminos-y-condiciones",
    ),
)


def _extract_codere_teams(ev: Mapping[str, Any]) -> tuple[str, str] | None:
    home = str(ev.get("HomeTeam") or ev.get("home_team") or ev.get("ParticipantHome") or "").strip()
    away = str(ev.get("AwayTeam") or ev.get("away_team") or ev.get("ParticipantAway") or "").strip()
    if home and away:
        return (home, away)

    participants = ev.get("Participants") or ev.get("participants") or []
    if isinstance(participants, Sequence) and not isinstance(participants, (str, bytes)) and len(participants) >= 2:
        p_home: str | None = None
        p_away: str | None = None
        for idx, p in enumerate(participants):
            if not isinstance(p, Mapping):
                continue
            pname = str(p.get("Name") or p.get("name") or "").strip()
            is_home = p.get("IsHome") if "IsHome" in p else p.get("is_home")
            if is_home is True:
                p_home = pname
            elif is_home is False:
                p_away = pname
            elif idx == 0 and p_home is None:
                p_home = pname
            elif idx == 1 and p_away is None:
                p_away = pname
        if p_home and p_away:
            return (p_home, p_away)

    ev_name = str(ev.get("Name") or ev.get("event_name") or ev.get("MatchName") or "").strip()
    for sep in (" vs ", " vs. ", " - ", " v "):
        if sep in ev_name:
            left, right = [s.strip() for s in ev_name.split(sep, 1)]
            if left and right:
                return (left, right)
    return None


def _coerce_codere_decimal_price(sel_obj: Mapping[str, Any]) -> float | None:
    dec_raw = sel_obj.get("Odd") if "Odd" in sel_obj else sel_obj.get("price_decimal", sel_obj.get("decimal_odds"))
    if dec_raw is not None and not isinstance(dec_raw, bool):
        try:
            val = float(dec_raw)
            if val >= 1.01:
                return round(val, 6)
        except (TypeError, ValueError):
            pass
    am_raw = sel_obj.get("AmericanOdd") if "AmericanOdd" in sel_obj else sel_obj.get("american_odds")
    return american_to_decimal(am_raw)


def parse_codere_events_payload(
    payload: Mapping[str, Any] | Sequence[Mapping[str, Any]],
    *,
    captured_at_iso: str,
    raw_sha256: str,
) -> list[dict[str, Any]]:
    """Extrae cuotas con equipos y `event_id` canónico desde estructuras de eventos de Codere.

    Corrige el defecto de Ola 2 (`codere_mx_odds_selection` sin equipos ni partido): cualquier
    token o selección que carezca de `home_team`, `away_team` o `ts_event_start` es descartado.
    """
    if isinstance(payload, Mapping):
        raw_events = (
            payload.get("events")
            or payload.get("Events")
            or (payload.get("ContentAPI") or {}).get("Events")
            if isinstance(payload.get("ContentAPI"), Mapping)
            else payload.get("events") or payload.get("Events") or []
        )
    else:
        raw_events = payload

    if not isinstance(raw_events, Sequence) or isinstance(raw_events, (str, bytes)):
        return []

    candidates: list[dict[str, Any]] = []

    for ev in raw_events:
        if not isinstance(ev, Mapping):
            continue
        if bool(ev.get("IsLive") or ev.get("is_live")):
            continue

        teams = _extract_codere_teams(ev)
        if teams is None:
            continue
        home_raw, away_raw = teams
        if home_raw.lower() in PSEUDO_TEAM_LABELS or away_raw.lower() in PSEUDO_TEAM_LABELS:
            continue

        start_raw = str(
            ev.get("StartDate")
            or ev.get("ts_event_start")
            or ev.get("kickoff_utc")
            or ev.get("StartTimeUtc")
            or ""
        ).strip()
        if not start_raw:
            continue

        sport_hint = ev.get("SportName") or ev.get("sport") or "football"
        league_hint = ev.get("LeagueName") or ev.get("league") or "MEX"
        sp_lg = resolve_sport_and_league(sport_hint, league_hint)
        if sp_lg is None:
            continue
        canon_sport, canon_league = sp_lg

        try:
            event_id = build_canonical_event_id(canon_sport, canon_league, start_raw, home_raw, away_raw)
        except ValueError:
            continue

        home_slug = slugify_team(resolve_canonical_team(home_raw, canon_sport, canon_league))
        away_slug = slugify_team(resolve_canonical_team(away_raw, canon_sport, canon_league))

        markets = ev.get("Games") or ev.get("Markets") or ev.get("markets") or []
        if not isinstance(markets, Sequence) or isinstance(markets, (str, bytes)):
            continue

        for mkt in markets:
            if not isinstance(mkt, Mapping):
                continue
            mname = str(mkt.get("Name") or mkt.get("market") or mkt.get("MarketType") or "").strip().lower()
            mcode = str(mkt.get("ShortName") or mkt.get("Key") or "").strip().upper()
            results = mkt.get("Results") or mkt.get("Selections") or mkt.get("selections") or []
            if not isinstance(results, Sequence) or isinstance(results, (str, bytes)):
                continue

            if mcode in ("MRES", "1X2") or mname in ("1x2", "resultado del partido", "ganador del partido", "moneyline"):
                has_draw = any(
                    str(r.get("Name") or r.get("selection") or "").strip().lower() in ("empate", "draw", "x")
                    for r in results
                    if isinstance(r, Mapping)
                )
                canon_mkt = "1x2" if (has_draw or canon_sport == "football") else "moneyline"
                for r in results:
                    if not isinstance(r, Mapping):
                        continue
                    rname = str(r.get("Name") or r.get("selection") or "").strip()
                    rlow = rname.lower()
                    price_dec = _coerce_codere_decimal_price(r)
                    if rlow in ("1", "home", "local"):
                        sel = "home"
                    elif rlow in ("x", "empate", "draw"):
                        if canon_mkt != "1x2":
                            continue
                        sel = "draw"
                    elif rlow in ("2", "away", "visitante"):
                        sel = "away"
                    else:
                        rslug = slugify_team(resolve_canonical_team(rname, canon_sport, canon_league))
                        if rslug == home_slug:
                            sel = "home"
                        elif rslug == away_slug:
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
                            "book": "codere",
                            "price_decimal": price_dec,
                            "ts_captured": captured_at_iso,
                            "ts_event_start": start_raw,
                            "source": "scraped_ws",
                            "raw_sha256": raw_sha256,
                        }
                    )

            elif "total" in mname or "más/menos" in mname or "mas/menos" in mname or mname == "totals":
                line_mkt = normalize_line_value(mkt.get("SpecialOddsValue") or mkt.get("line"))
                for r in results:
                    if not isinstance(r, Mapping):
                        continue
                    rlow = str(r.get("Name") or r.get("selection") or "").strip().lower()
                    line_use = normalize_line_value(r.get("line")) if r.get("line") is not None else line_mkt
                    if line_use is None:
                        continue
                    if rlow.startswith("más") or rlow.startswith("mas") or rlow.startswith("over"):
                        sel = "over"
                    elif rlow.startswith("menos") or rlow.startswith("under"):
                        sel = "under"
                    else:
                        continue
                    candidates.append(
                        {
                            "event_id": event_id,
                            "sport": canon_sport,
                            "league": canon_league,
                            "market": "totals",
                            "line": line_use,
                            "selection": sel,
                            "book": "codere",
                            "price_decimal": _coerce_codere_decimal_price(r),
                            "ts_captured": captured_at_iso,
                            "ts_event_start": start_raw,
                            "source": "scraped_ws",
                            "raw_sha256": raw_sha256,
                        }
                    )

    rows, _ = validate_and_normalize_tick_rows(candidates)
    return rows


class CodereAdapter:
    """Adaptador Codere MX bloqueado (`blocked_pending_owner_decision`) por `robots.txt` y ToS."""

    metadata = CODERE_METADATA

    def fetch_snapshots(
        self,
        *,
        sports: Sequence[str] = ("football", "nfl"),
        captured_at: datetime | None = None,
    ) -> list[dict[str, Any]]:
        raise SourceBlockedError(self.metadata.legal_reason)
