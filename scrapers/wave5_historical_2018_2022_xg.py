"""Scraper Wave 5 (Historical xG Backfill 2018–2023) para `understat` y `fbref`.

REGLA DE INGENIERÍA:
Exclusivamente utiliza Scrapling (`FetcherSession`, `StealthySession`, `AsyncStealthySession`,
`Selector`) a través de `PitchLabScraplingBase` (`scrapers/base_scraper.py`).
Prohibido importar `requests`, `urllib`, `httpx`, `curl`, `bs4` o `playwright` directo.
Cada captura queda sellada con `captured_at_utc` y `sha256` en `data/raw/advanced_stats_xg/`.

Objetivos Wave 5:
1. `understat` (`label="understat_5leagues_2018_2022_history"`):
   - Extrae las 25 combinaciones liga-temporada:
     `EPL`, `La_liga`, `Bundesliga`, `Serie_A`, `Ligue_1` × `2022`, `2021`, `2020`, `2019`, `2018`.
   - Intenta primero `https://understat.com/league/{league}/{year}` con `FetcherSession`
     (`impersonate="chrome"`, `stealthy_headers=True`). Si el origen devuelve shell SPA sin
     `teamsData`/`datesData` o da timeout, consulta automáticamente el CDX API de Wayback Machine
     con la misma `FetcherSession` y descarga el snapshot completo post-temporada (`id_`).
   - Decodifica el 100% de `datesData` (~9,130 partidos con `xG`, marcador y `forecast` win/draw/loss)
     y `teamsData` (490 equipos-temporada con agregados y serie completa partido a partido `history`
     con `xG`, `xGA`, `npxG`, `npxGA`, `ppda`, `ppda_allowed`, `deep`, `deep_allowed`, `xpts`),
     más el top-25 de jugadores por liga-temporada (`playersData` resumido).

2. `fbref` (`label="fbref_ligamx_2018_2023_historical_fixtures_xg"`):
   - Extrae las 5 temporadas históricas de Liga MX (`comps/31`):
     `2022-2023`, `2021-2022`, `2020-2021`, `2019-2020` y `2018-2019`, tanto en
     `Scores-and-Fixtures` como en `Stats` (10 páginas en total).
   - Usa `StealthySession(headless=True, solve_cloudflare=True, network_idle=True)` con pausa
     cortés (`3.5s`) y respaldo automático vía Wayback Machine CDX (`FetcherSession`) si Cloudflare
     limita alguna URL, además de enriquecimiento automático desde snapshots pre-2026 de Wayback
     para recuperar `home_xg`, `away_xg` y métricas Opta de equipo eliminadas del sitio vivo en 2026.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import sys
import time
from typing import Any

from scrapling.fetchers import (
    FetcherSession,
    StealthySession,
)
from scrapling.parser import Selector

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from scrapers.base_scraper import (  # noqa: E402
    DATA_RAW_DIR,
    PitchLabScraplingBase,
    sha256_text,
    utc_now_iso,
)

ALLOWED_WAVE5_LABELS: frozenset[str] = frozenset(
    {
        "understat_5leagues_2018_2022_history",
        "fbref_ligamx_2018_2023_historical_fixtures_xg",
    }
)


def _response_text(resp: Any) -> str:
    """Convierte el cuerpo de un Response/Selector de Scrapling a texto UTF-8 seguro."""
    if resp is None:
        return ""
    body = getattr(resp, "body", b"")
    if isinstance(body, bytes) and body:
        return body.decode("utf-8", errors="replace")
    if isinstance(body, str) and body:
        return body
    text = getattr(resp, "text", "")
    if text:
        return str(text)
    html_attr = getattr(resp, "html_content", "")
    return str(html_attr or "")


def _safe_json_loads(raw: bytes | str | None) -> Any | None:
    """Parsea JSON de forma segura devolviendo None si falla."""
    if not raw:
        return None
    try:
        text = raw.decode("utf-8", errors="replace") if isinstance(raw, bytes) else raw
        text_stripped = text.strip()
        if not text_stripped:
            return None
        return json.loads(text_stripped)
    except Exception:
        return None


def _clean_previous_wave5_snapshots(category: str, source_id: str, label: str) -> None:
    """Elimina ÚNICAMENTE snapshots previos con el mismo `label` exclusivo de Wave 5."""
    if label not in ALLOWED_WAVE5_LABELS:
        raise ValueError(f"Label no autorizado para limpieza en Wave 5: {label}")
    src_dir = DATA_RAW_DIR / category / source_id
    if src_dir.exists():
        for json_file in src_dir.rglob(f"*_{label}_*.json"):
            json_file.unlink(missing_ok=True)


def _decode_understat_js_var(escaped_str: str) -> Any:
    """Decodifica cadenas hexadecimales \\xNN de Understat (`JSON.parse('...')`)."""
    raw_bytes = escaped_str.encode("utf-8").decode("unicode_escape").encode("latin1")
    return json.loads(raw_bytes.decode("utf-8", errors="replace"))


def _safe_float(val: Any, default: float = 0.0) -> float:
    try:
        return float(val)
    except (TypeError, ValueError):
        return default


def _safe_optional_float(val: Any) -> float | None:
    if val is None:
        return None
    s = str(val).strip().replace(",", "")
    if not s:
        return None
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


def _safe_int(val: Any, default: int = 0) -> int:
    try:
        return int(float(val))
    except (TypeError, ValueError):
        return default


def _fetcher_get_with_retries(
    session: FetcherSession,
    url: str,
    timeout: int = 30,
    retries: int = 3,
    backoff_sec: float = 1.8,
) -> Any | None:
    """Realiza un GET resiliente con `FetcherSession` ante errores transitorios o 503."""
    for attempt in range(retries):
        try:
            resp = session.get(url, stealthy_headers=True, timeout=timeout)
            status = getattr(resp, "status", None)
            if status == 200:
                return resp
            if status in (429, 500, 502, 503, 504) and attempt + 1 < retries:
                time.sleep(backoff_sec * (attempt + 1))
                continue
            return resp
        except Exception:
            if attempt + 1 < retries:
                time.sleep(backoff_sec * (attempt + 1))
    return None


def _verify_saved_snapshot(snapshot_path: Path) -> tuple[bool, str]:
    """Verifica criptográficamente el `sha256` del envoltorio contra su `payload`."""
    envelope = json.loads(snapshot_path.read_text(encoding="utf-8"))
    stored_sha = str(envelope.get("sha256") or "")
    payload = envelope.get("payload")
    canonical = (
        payload
        if isinstance(payload, str)
        else json.dumps(payload, ensure_ascii=False, sort_keys=True)
    )
    computed_sha = sha256_text(canonical)
    return (stored_sha == computed_sha and bool(stored_sha)), computed_sha


# ===========================================================================
# 1. UNDERSTAT: 5 LIGAS EUROPEAS × 5 TEMPORADAS HISTÓRICAS (2018–2022)
# ===========================================================================
UNDERSTAT_LEAGUES: list[str] = [
    "EPL",
    "La_liga",
    "Bundesliga",
    "Serie_A",
    "Ligue_1",
]
UNDERSTAT_YEARS: list[str] = ["2022", "2021", "2020", "2019", "2018"]


def _query_cdx_timestamps(
    session: FetcherSession,
    target_url_no_scheme: str,
    from_ts: str | None = None,
    to_ts: str | None = None,
    limit: int = -8,
    min_length: int = 40000,
) -> list[tuple[str, str, int]]:
    """Consulta el CDX API de Wayback Machine con `FetcherSession` y filtra snapshots completos."""
    params = [
        f"url={target_url_no_scheme}",
        "output=json",
        "filter=statuscode:200",
    ]
    if from_ts:
        params.append(f"from={from_ts}")
    if to_ts:
        params.append(f"to={to_ts}")
    if limit != 0:
        params.append(f"limit={limit}")

    cdx_url = "https://web.archive.org/cdx/search/cdx?" + "&".join(params)
    resp = _fetcher_get_with_retries(session, cdx_url, timeout=25, retries=3)
    if resp is None or getattr(resp, "status", None) != 200:
        return []

    parsed = _safe_json_loads(_response_text(resp))
    if not isinstance(parsed, list) or len(parsed) <= 1:
        return []

    header = parsed[0]
    try:
        ts_idx = header.index("timestamp")
        orig_idx = header.index("original")
        len_idx = header.index("length")
    except ValueError:
        ts_idx, orig_idx, len_idx = 1, 2, 6

    candidates: list[tuple[str, str, int]] = []
    for row in parsed[1:]:
        if not isinstance(row, list) or len(row) <= max(ts_idx, orig_idx, len_idx):
            continue
        ts_val = str(row[ts_idx]).strip()
        orig_val = str(row[orig_idx]).strip()
        raw_len = str(row[len_idx]).strip()
        byte_len = int(raw_len) if raw_len.isdigit() else 0
        if byte_len >= min_length:
            candidates.append((ts_val, orig_val, byte_len))

    # Ordenar del más reciente al más antiguo
    candidates.sort(key=lambda x: x[0], reverse=True)
    return candidates


def _fetch_understat_league_season_html(
    session: FetcherSession, league_code: str, season_yr: str
) -> tuple[str, bool, str | None, str | None]:
    """Obtiene el HTML con `teamsData` y `datesData` para `(league_code, season_yr)`.

    1) Intenta el origen vivo `https://understat.com/league/{league}/{year}`.
    2) Si no trae `teamsData`/`datesData`, consulta Wayback CDX post-temporada (`from={year+1}0601`).
    3) Si no hay captura post-temporada en `/{year}` (ej. `Serie_A/2022`), consulta la URL raíz
       de la liga en el verano inmediatamente posterior al cierre de esa temporada
       (`from={year+1}0605&to={year+1}0812`).
    4) Como último respaldo, consulta CDX sin restricción `from`.
    """
    live_url = f"https://understat.com/league/{league_code}/{season_yr}"
    live_resp = _fetcher_get_with_retries(session, live_url, timeout=20, retries=2)
    live_html = _response_text(live_resp)
    if "teamsData" in live_html and "datesData" in live_html:
        return live_html, False, None, None

    end_year = int(season_yr) + 1
    post_season_from = f"{end_year}0601"
    # Antes de la migración SPA de finales de 2025 para garantizar HTML con JSON embebido
    pre_spa_to = "20251125"

    # Intento CDX A: URL específica `/league/{league}/{year}` capturada tras concluir la temporada
    candidates_a = _query_cdx_timestamps(
        session,
        target_url_no_scheme=f"understat.com/league/{league_code}/{season_yr}",
        from_ts=post_season_from,
        to_ts=pre_spa_to,
        limit=-8,
        min_length=40000,
    )
    for ts_val, orig_url, _ in candidates_a:
        arch_url = f"https://web.archive.org/web/{ts_val}id_/{orig_url}"
        arch_resp = _fetcher_get_with_retries(session, arch_url, timeout=35, retries=3)
        arch_html = _response_text(arch_resp)
        if "teamsData" in arch_html and "datesData" in arch_html:
            return arch_html, True, arch_url, ts_val

    # Intento CDX B: URL raíz `/league/{league}` en el verano posterior al final de la temporada
    # (resuelve temporadas como Serie_A 2022 donde /Serie_A/2022 sólo se archivó en marzo 2023)
    candidates_b = _query_cdx_timestamps(
        session,
        target_url_no_scheme=f"understat.com/league/{league_code}",
        from_ts=f"{end_year}0605",
        to_ts=f"{end_year}0812",
        limit=-6,
        min_length=40000,
    )
    for ts_val, orig_url, _ in candidates_b:
        arch_url = f"https://web.archive.org/web/{ts_val}id_/{orig_url}"
        arch_resp = _fetcher_get_with_retries(session, arch_url, timeout=35, retries=3)
        arch_html = _response_text(arch_resp)
        if "teamsData" in arch_html and "datesData" in arch_html:
            # Verificar que la temporada activa corresponda a `season_yr`
            dm = re.search(r"var\s+datesData\s*=\s*JSON\.parse\('([^']+)'\)", arch_html)
            if dm:
                sample_dates = _decode_understat_js_var(dm.group(1))
                if (
                    isinstance(sample_dates, list)
                    and sample_dates
                    and str(sample_dates[0].get("datetime") or "").startswith(season_yr)
                ):
                    return arch_html, True, arch_url, ts_val

    # Intento CDX C: Sin filtro `from` (cualquier snapshot disponible > 40KB)
    candidates_c = _query_cdx_timestamps(
        session,
        target_url_no_scheme=f"understat.com/league/{league_code}/{season_yr}",
        from_ts=None,
        to_ts=pre_spa_to,
        limit=-10,
        min_length=40000,
    )
    if not candidates_c:
        candidates_c = _query_cdx_timestamps(
            session,
            target_url_no_scheme=f"understat.com/league/{league_code}/{season_yr}",
            from_ts=None,
            to_ts=None,
            limit=-10,
            min_length=10000,
        )
    for ts_val, orig_url, _ in candidates_c:
        arch_url = f"https://web.archive.org/web/{ts_val}id_/{orig_url}"
        arch_resp = _fetcher_get_with_retries(session, arch_url, timeout=35, retries=3)
        arch_html = _response_text(arch_resp)
        if "teamsData" in arch_html and "datesData" in arch_html:
            return arch_html, True, arch_url, ts_val

    return live_html, False, None, None


def _parse_understat_historical_page(
    html_text: str, league_code: str, season_label: str
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], int, int]:
    """Decodifica `teamsData` (con `history`), `datesData` (100%) y top-25 `playersData`."""
    teams_match = re.search(
        r"var\s+teamsData\s*=\s*JSON\.parse\('([^']+)'\)", html_text
    )
    dates_match = re.search(
        r"var\s+datesData\s*=\s*JSON\.parse\('([^']+)'\)", html_text
    )
    players_match = re.search(
        r"var\s+playersData\s*=\s*JSON\.parse\('([^']+)'\)", html_text
    )

    raw_teams = _decode_understat_js_var(teams_match.group(1)) if teams_match else {}
    raw_dates = _decode_understat_js_var(dates_match.group(1)) if dates_match else []
    raw_players = (
        _decode_understat_js_var(players_match.group(1)) if players_match else []
    )

    teams_list: list[dict[str, Any]] = []
    history_rows_count = 0

    if isinstance(raw_teams, dict):
        for team_id, team_obj in raw_teams.items():
            if not isinstance(team_obj, dict):
                continue
            history_raw = team_obj.get("history") or []
            normalized_history: list[dict[str, Any]] = []
            ppda_vals: list[float] = []
            ppda_allowed_vals: list[float] = []

            for h in history_raw:
                if not isinstance(h, dict):
                    continue
                ppda_obj = h.get("ppda") if isinstance(h.get("ppda"), dict) else {}
                ppda_all_obj = (
                    h.get("ppda_allowed")
                    if isinstance(h.get("ppda_allowed"), dict)
                    else {}
                )
                ppda_ratio: float | None = None
                if _safe_float(ppda_obj.get("def")) > 0:
                    ppda_ratio = round(
                        _safe_float(ppda_obj.get("att"))
                        / _safe_float(ppda_obj.get("def")),
                        3,
                    )
                    ppda_vals.append(ppda_ratio)

                ppda_allowed_ratio: float | None = None
                if _safe_float(ppda_all_obj.get("def")) > 0:
                    ppda_allowed_ratio = round(
                        _safe_float(ppda_all_obj.get("att"))
                        / _safe_float(ppda_all_obj.get("def")),
                        3,
                    )
                    ppda_allowed_vals.append(ppda_allowed_ratio)

                normalized_history.append(
                    {
                        "date": h.get("date"),
                        "h_a": h.get("h_a"),
                        "result": h.get("result"),
                        "scored": _safe_int(h.get("scored")),
                        "missed": _safe_int(h.get("missed")),
                        "pts": _safe_int(h.get("pts")),
                        "xG": round(_safe_float(h.get("xG")), 4),
                        "xGA": round(_safe_float(h.get("xGA")), 4),
                        "npxG": round(_safe_float(h.get("npxG")), 4),
                        "npxGA": round(_safe_float(h.get("npxGA")), 4),
                        "npxGD": round(_safe_float(h.get("npxGD")), 4),
                        "xpts": round(_safe_float(h.get("xpts")), 4),
                        "deep": _safe_int(h.get("deep")),
                        "deep_allowed": _safe_int(h.get("deep_allowed")),
                        "wins": _safe_int(h.get("wins")),
                        "draws": _safe_int(h.get("draws")),
                        "loses": _safe_int(h.get("loses")),
                        "ppda": ppda_obj,
                        "ppda_ratio": ppda_ratio,
                        "ppda_allowed": ppda_all_obj,
                        "ppda_allowed_ratio": ppda_allowed_ratio,
                    }
                )

            history_rows_count += len(normalized_history)
            xg_sum = round(sum(m["xG"] for m in normalized_history), 3)
            xga_sum = round(sum(m["xGA"] for m in normalized_history), 3)
            npxg_sum = round(sum(m["npxG"] for m in normalized_history), 3)
            npxga_sum = round(sum(m["npxGA"] for m in normalized_history), 3)
            xpts_sum = round(sum(m["xpts"] for m in normalized_history), 3)
            pts_sum = sum(m["pts"] for m in normalized_history)
            scored_sum = sum(m["scored"] for m in normalized_history)
            missed_sum = sum(m["missed"] for m in normalized_history)
            wins_sum = sum(m["wins"] for m in normalized_history)
            draws_sum = sum(m["draws"] for m in normalized_history)
            loses_sum = sum(m["loses"] for m in normalized_history)
            deep_sum = sum(m["deep"] for m in normalized_history)
            deep_all_sum = sum(m["deep_allowed"] for m in normalized_history)

            teams_list.append(
                {
                    "league": league_code,
                    "season": season_label,
                    "team_id": str(team_obj.get("id") or team_id),
                    "team_title": team_obj.get("title"),
                    "matches_played": len(normalized_history),
                    "wins": wins_sum,
                    "draws": draws_sum,
                    "loses": loses_sum,
                    "scored": scored_sum,
                    "missed": missed_sum,
                    "pts": pts_sum,
                    "xPTS": xpts_sum,
                    "xPTS_diff": round(xpts_sum - pts_sum, 3),
                    "xG": xg_sum,
                    "xGA": xga_sum,
                    "npxG": npxg_sum,
                    "npxGA": npxga_sum,
                    "npxGD": round(npxg_sum - npxga_sum, 3),
                    "deep_completions": deep_sum,
                    "deep_allowed": deep_all_sum,
                    "ppda_avg": round(sum(ppda_vals) / len(ppda_vals), 3)
                    if ppda_vals
                    else None,
                    "ppda_allowed_avg": round(
                        sum(ppda_allowed_vals) / len(ppda_allowed_vals), 3
                    )
                    if ppda_allowed_vals
                    else None,
                    "history": normalized_history,
                }
            )

    teams_list.sort(key=lambda t: t["xPTS"], reverse=True)

    matches_list: list[dict[str, Any]] = []
    if isinstance(raw_dates, list):
        for m in raw_dates:
            if not isinstance(m, dict):
                continue
            h_obj = m.get("h") if isinstance(m.get("h"), dict) else {}
            a_obj = m.get("a") if isinstance(m.get("a"), dict) else {}
            goals_obj = m.get("goals") if isinstance(m.get("goals"), dict) else {}
            xg_obj = m.get("xG") if isinstance(m.get("xG"), dict) else {}
            fc_obj = m.get("forecast") if isinstance(m.get("forecast"), dict) else {}

            h_xg_raw = _safe_optional_float(xg_obj.get("h"))
            a_xg_raw = _safe_optional_float(xg_obj.get("a"))
            fc_w_raw = _safe_optional_float(fc_obj.get("w"))
            fc_d_raw = _safe_optional_float(fc_obj.get("d"))
            fc_l_raw = _safe_optional_float(fc_obj.get("l"))

            matches_list.append(
                {
                    "match_id": str(m.get("id")),
                    "league": league_code,
                    "season": season_label,
                    "datetime": m.get("datetime"),
                    "is_result": bool(m.get("isResult")),
                    "home_team_id": str(h_obj.get("id") or ""),
                    "home_team": h_obj.get("title"),
                    "home_short_title": h_obj.get("short_title"),
                    "away_team_id": str(a_obj.get("id") or ""),
                    "away_team": a_obj.get("title"),
                    "away_short_title": a_obj.get("short_title"),
                    "home_goals": _safe_int(goals_obj.get("h"))
                    if goals_obj.get("h") is not None
                    else None,
                    "away_goals": _safe_int(goals_obj.get("a"))
                    if goals_obj.get("a") is not None
                    else None,
                    "home_xG": round(h_xg_raw, 4) if h_xg_raw is not None else None,
                    "away_xG": round(a_xg_raw, 4) if a_xg_raw is not None else None,
                    "forecast_win": round(fc_w_raw, 4) if fc_w_raw is not None else None,
                    "forecast_draw": round(fc_d_raw, 4) if fc_d_raw is not None else None,
                    "forecast_loss": round(fc_l_raw, 4) if fc_l_raw is not None else None,
                }
            )

    players_discovered = len(raw_players) if isinstance(raw_players, list) else 0
    players_parsed: list[dict[str, Any]] = []
    if isinstance(raw_players, list):
        for p in raw_players:
            if not isinstance(p, dict):
                continue
            xg_val = round(_safe_float(p.get("xG")), 4)
            xa_val = round(_safe_float(p.get("xA")), 4)
            players_parsed.append(
                {
                    "player_id": str(p.get("id")),
                    "player_name": p.get("player_name"),
                    "league": league_code,
                    "season": season_label,
                    "team_title": p.get("team_title"),
                    "position": p.get("position"),
                    "games": _safe_int(p.get("games")),
                    "time_minutes": _safe_int(p.get("time")),
                    "goals": _safe_int(p.get("goals")),
                    "npg": _safe_int(p.get("npg")),
                    "assists": _safe_int(p.get("assists")),
                    "shots": _safe_int(p.get("shots")),
                    "key_passes": _safe_int(p.get("key_passes")),
                    "xG": xg_val,
                    "npxG": round(_safe_float(p.get("npxG")), 4),
                    "xA": xa_val,
                    "xG_plus_xA": round(xg_val + xa_val, 4),
                    "xGChain": round(_safe_float(p.get("xGChain")), 4),
                    "xGBuildup": round(_safe_float(p.get("xGBuildup")), 4),
                }
            )
    players_parsed.sort(
        key=lambda p: (p["xG_plus_xA"], p["xG"], p["time_minutes"]),
        reverse=True,
    )
    top_25_players = players_parsed[:25]

    return (
        teams_list,
        matches_list,
        top_25_players,
        history_rows_count,
        players_discovered,
    )


def scrape_understat_wave5_2018_2022() -> dict[str, Any]:
    """Extrae las 25 combinaciones liga-temporada (`2018`–`2022`) de Understat."""
    scraper = PitchLabScraplingBase("understat")
    label = "understat_5leagues_2018_2022_history"
    _clean_previous_wave5_snapshots(scraper.category, scraper.source_id, label)

    historical_seasons_data: dict[str, dict[str, Any]] = {}
    total_teams = 0
    total_team_history_rows = 0
    total_matches = 0
    total_played_matches_with_xg = 0
    total_players_discovered = 0
    total_top_players = 0

    with FetcherSession(impersonate="chrome", stealthy_headers=True) as session:
        idx = 0
        for league_code in UNDERSTAT_LEAGUES:
            for season_yr in UNDERSTAT_YEARS:
                idx += 1
                live_url = f"https://understat.com/league/{league_code}/{season_yr}"
                html_text, used_archive, archive_url, archive_ts = (
                    _fetch_understat_league_season_html(session, league_code, season_yr)
                )
                (
                    teams_list,
                    matches_list,
                    top_25_players,
                    hist_rows,
                    players_disc,
                ) = _parse_understat_historical_page(html_text, league_code, season_yr)

                played_xg_count = sum(
                    1
                    for m in matches_list
                    if m.get("is_result")
                    and m.get("home_xG") is not None
                    and m.get("away_xG") is not None
                )

                key = f"{league_code}_{season_yr}"
                historical_seasons_data[key] = {
                    "league": league_code,
                    "season": season_yr,
                    "live_url": live_url,
                    "used_archive_mirror": used_archive,
                    "archive_url": archive_url,
                    "archive_timestamp": archive_ts,
                    "teams_count": len(teams_list),
                    "team_match_history_rows": hist_rows,
                    "matches_count": len(matches_list),
                    "played_matches_with_xg_count": played_xg_count,
                    "players_discovered_count": players_disc,
                    "top_25_players_count": len(top_25_players),
                    "teams": teams_list,
                    "matches": matches_list,
                    "top_25_players": top_25_players,
                }

                total_teams += len(teams_list)
                total_team_history_rows += hist_rows
                total_matches += len(matches_list)
                total_played_matches_with_xg += played_xg_count
                total_players_discovered += players_disc
                total_top_players += len(top_25_players)

                print(
                    f"   [{idx:02d}/25] {key:16s} | teams={len(teams_list):2d} | "
                    f"matches={len(matches_list):3d} (xG={played_xg_count:3d}) | "
                    f"hist_rows={hist_rows:3d} | archive={used_archive} ({archive_ts})"
                )
                time.sleep(0.35)

    total_records = (
        total_teams + total_team_history_rows + total_matches + total_top_players
    )

    payload = {
        "source": "understat",
        "wave": "wave5_historical_2018_2022",
        "target_leagues": UNDERSTAT_LEAGUES,
        "target_seasons": UNDERSTAT_YEARS,
        "summary": {
            "leagues_count": len(UNDERSTAT_LEAGUES),
            "seasons_per_league": len(UNDERSTAT_YEARS),
            "historical_league_seasons_scraped": len(historical_seasons_data),
            "historical_teams_extracted": total_teams,
            "historical_team_history_rows": total_team_history_rows,
            "historical_matches_datesData_extracted": total_matches,
            "historical_played_matches_with_xg": total_played_matches_with_xg,
            "historical_players_discovered": total_players_discovered,
            "historical_top_players_extracted": total_top_players,
            "total_records": total_records,
        },
        "historical_seasons_2018_2022": historical_seasons_data,
    }

    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url="https://understat.com/league/EPL/2022",
        label=label,
        extra_meta=payload["summary"],
    )
    ok_sha, sha256_val = _verify_saved_snapshot(out_path)
    if not ok_sha:
        raise RuntimeError(f"Error de integridad SHA-256 en {out_path}")

    return {
        "source_id": "understat",
        "label": label,
        "path": str(out_path),
        "records": total_records,
        "summary": payload["summary"],
        "sha256": sha256_val,
        "sha256_verified": ok_sha,
    }


# ===========================================================================
# 2. FBREF: LIGA MX HISTÓRICO 2018–2023 (SCORES & FIXTURES + STATS CON XG)
# ===========================================================================
FBREF_LIGAMX_SEASONS: list[tuple[str, str, str]] = [
    # (season_label, active_season_closing_from, active_season_closing_to)
    ("2022-2023", "20230501", "20230705"),
    ("2021-2022", "20220515", "20220705"),
    ("2020-2021", "20210515", "20210715"),
    ("2019-2020", "20200515", "20200720"),
    ("2018-2019", "20190515", "20190715"),
]


def _parse_fbref_all_stats_tables(
    page_or_resp: Any, season_label: str
) -> list[dict[str, Any]]:
    """Extrae TODAS las tablas `table.stats_table` (DOM directo + comentarios HTML `<!-- ... -->`)."""
    if page_or_resp is None:
        return []

    html_text = _response_text(page_or_resp)
    sel = page_or_resp if isinstance(page_or_resp, Selector) else Selector(html_text)

    raw_tables: list[Any] = list(
        sel.css(
            "table.stats_table, table[id*='sched'], table[id*='results'], table[id*='stats_squads']"
        )
    )

    # Extraer SIEMPRE también tablas comentadas `<!-- ... <table ...> ... -->`
    if html_text:
        for comment_match in re.finditer(r"<!--(.*?)-->", html_text, re.DOTALL):
            comment_html = comment_match.group(1)
            if "<table" in comment_html and (
                "stats_table" in comment_html
                or "stats_squads" in comment_html
                or "sched" in comment_html
                or "results" in comment_html
            ):
                sub_sel = Selector(comment_html)
                raw_tables.extend(sub_sel.css("table"))

    tables_out: list[dict[str, Any]] = []
    seen_table_ids: set[str] = set()

    for idx, tbl in enumerate(raw_tables[:45]):
        table_id = tbl.attrib.get("id") or f"stats_table_{idx + 1}"
        if table_id in seen_table_ids:
            continue
        seen_table_ids.add(table_id)

        caption = " ".join(tbl.css("caption::text").getall()).strip()
        rows_data: list[dict[str, Any]] = []
        for tr in tbl.css("tbody tr"):
            tr_class = tr.attrib.get("class") or ""
            if (
                "thead" in tr_class
                or "spacer" in tr_class
                or "partial_table" in tr_class
            ):
                continue

            row_dict: dict[str, Any] = {}
            for cell in tr.css("th, td"):
                stat_name = cell.attrib.get("data-stat")
                if not stat_name:
                    continue
                val = " ".join(cell.css("::text, *::text").getall()).strip()
                if val:
                    row_dict[stat_name] = val

            if not row_dict:
                continue

            # Filtrar cabeceras repetidas dentro de tbody
            if str(row_dict.get("date") or "").lower() == "date" or (
                str(row_dict.get("home_team") or "").lower() == "home"
            ):
                continue

            if row_dict.get("home_team") and row_dict.get("away_team"):
                h_xg_f = _safe_optional_float(
                    row_dict.get("home_xg") or row_dict.get("xg_a")
                )
                a_xg_f = _safe_optional_float(
                    row_dict.get("away_xg") or row_dict.get("xg_b")
                )
                if h_xg_f is not None:
                    row_dict["home_xg"] = round(h_xg_f, 2)
                else:
                    row_dict.pop("home_xg", None)
                if a_xg_f is not None:
                    row_dict["away_xg"] = round(a_xg_f, 2)
                else:
                    row_dict.pop("away_xg", None)

                row_dict["season"] = season_label
                if not row_dict.get("team"):
                    row_dict["team"] = (
                        f"{row_dict['home_team']} vs {row_dict['away_team']}"
                    )
                rows_data.append(row_dict)
            elif (
                row_dict.get("team")
                or row_dict.get("squad")
                or len(row_dict) >= 4
            ):
                row_dict.setdefault("season", season_label)
                rows_data.append(row_dict)

        if rows_data:
            tables_out.append(
                {
                    "table_id": table_id,
                    "caption": caption,
                    "rows_count": len(rows_data),
                    "rows": rows_data[:600],
                }
            )

    return tables_out


def _count_fixture_xg_rows(tables: list[dict[str, Any]]) -> int:
    count = 0
    for tbl in tables:
        for r in tbl.get("rows") or []:
            if r.get("home_xg") is not None and r.get("away_xg") is not None:
                count += 1
    return count


def _has_squad_xg_columns(tables: list[dict[str, Any]]) -> bool:
    for tbl in tables:
        for r in tbl.get("rows") or []:
            if any(
                k in r
                for k in ("xg", "xg_for", "npxg", "npxg_for", "psxg_gk", "xg_assist")
            ):
                return True
    return False


def _fetch_fbref_wayback_tables(
    fs: FetcherSession,
    cdx_target_no_scheme: str,
    season_label: str,
    from_ts: str | None = None,
    to_ts: str | None = None,
) -> tuple[list[dict[str, Any]], str | None, str | None]:
    """Busca en Wayback CDX con `FetcherSession` y parsea tablas históricas de FBref."""
    candidates = _query_cdx_timestamps(
        fs,
        target_url_no_scheme=cdx_target_no_scheme,
        from_ts=from_ts,
        to_ts=to_ts,
        limit=-6,
        min_length=25000,
    )
    for ts_val, orig_url, _ in candidates:
        arch_url = f"https://web.archive.org/web/{ts_val}id_/{orig_url}"
        resp = _fetcher_get_with_retries(fs, arch_url, timeout=35, retries=3)
        if resp is not None and getattr(resp, "status", None) == 200:
            parsed_tables = _parse_fbref_all_stats_tables(resp, season_label)
            if parsed_tables:
                return parsed_tables, arch_url, ts_val
    return [], None, None


def _enrich_fixtures_with_archive_xg(
    base_tables: list[dict[str, Any]], archive_tables: list[dict[str, Any]]
) -> int:
    """Inyecta `home_xg` y `away_xg` de un snapshot Opta pre-2026 en las tablas de partidos."""
    xg_lookup: dict[tuple[str, str, str], tuple[float, float]] = {}
    xg_pair_lookup: dict[tuple[str, str, str], tuple[float, float]] = {}

    for tbl in archive_tables:
        for r in tbl.get("rows") or []:
            h_xg = r.get("home_xg")
            a_xg = r.get("away_xg")
            h_tm = str(r.get("home_team") or "").strip()
            a_tm = str(r.get("away_team") or "").strip()
            dt = str(r.get("date") or "").strip()
            rnd = str(r.get("round") or "").strip()
            if h_xg is not None and a_xg is not None and h_tm and a_tm:
                if dt:
                    xg_lookup[(dt, h_tm, a_tm)] = (float(h_xg), float(a_xg))
                xg_pair_lookup[(rnd, h_tm, a_tm)] = (float(h_xg), float(a_xg))

    enriched_cells = 0
    for tbl in base_tables:
        for r in tbl.get("rows") or []:
            if r.get("home_xg") is not None and r.get("away_xg") is not None:
                continue
            h_tm = str(r.get("home_team") or "").strip()
            a_tm = str(r.get("away_team") or "").strip()
            dt = str(r.get("date") or "").strip()
            rnd = str(r.get("round") or "").strip()
            match_xg = xg_lookup.get((dt, h_tm, a_tm)) or xg_pair_lookup.get(
                (rnd, h_tm, a_tm)
            )
            if match_xg is not None:
                r["home_xg"] = match_xg[0]
                r["away_xg"] = match_xg[1]
                enriched_cells += 1
    return enriched_cells


def _merge_stats_tables_with_archive_xg(
    base_tables: list[dict[str, Any]], archive_tables: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Fusiona columnas avanzadas Opta (`xg`, `npxg`, `psxg`, `sca`, `gca`) en tablas `Stats`."""
    if not base_tables:
        return archive_tables
    if not archive_tables:
        return base_tables

    arch_by_id = {t["table_id"]: t for t in archive_tables if t.get("table_id")}
    merged: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    for bt in base_tables:
        tid = str(bt.get("table_id") or "")
        seen_ids.add(tid)
        at = arch_by_id.get(tid)
        if not at:
            merged.append(bt)
            continue

        arch_rows_by_team: dict[str, dict[str, Any]] = {}
        for ar in at.get("rows") or []:
            t_key = str(ar.get("team") or ar.get("squad") or "").strip()
            if t_key:
                arch_rows_by_team[t_key] = ar

        for br in bt.get("rows") or []:
            t_key = str(br.get("team") or br.get("squad") or "").strip()
            ar = arch_rows_by_team.get(t_key)
            if ar:
                for k, v in ar.items():
                    if k not in br or br[k] in ("", None):
                        br[k] = v
        merged.append(bt)

    # Añadir cualquier tabla adicional Opta del archivo que no estuviera en el DOM vivo
    for at in archive_tables:
        tid = str(at.get("table_id") or "")
        if tid and tid not in seen_ids:
            merged.append(at)
            seen_ids.add(tid)

    return merged


def _parse_score_goals(score_raw: str | None) -> tuple[int | None, int | None]:
    if not score_raw:
        return None, None
    cleaned = re.sub(r"\([^)]*\)", "", str(score_raw)).strip()
    m = re.search(r"(\d+)\s*[–\-:]\s*(\d+)", cleaned)
    if not m:
        return None, None
    return int(m.group(1)), int(m.group(2))


def scrape_fbref_wave5_ligamx_2018_2023() -> dict[str, Any]:
    """Extrae Liga MX 2018–2023 (5 temporadas × Scores-and-Fixtures + Stats = 10 páginas) en FBref."""
    scraper = PitchLabScraplingBase("fbref")
    label = "fbref_ligamx_2018_2023_historical_fixtures_xg"
    _clean_previous_wave5_snapshots(scraper.category, scraper.source_id, label)

    targets: list[dict[str, str]] = []
    for season_label, act_from, act_to in FBREF_LIGAMX_SEASONS:
        targets.append(
            {
                "competition": f"liga-mx-{season_label}-fixtures-xg",
                "season_label": season_label,
                "page_type": "scores_and_fixtures",
                "live_url": f"https://fbref.com/en/comps/31/{season_label}/schedule/{season_label}-Liga-MX-Scores-and-Fixtures",
                "cdx_path": f"fbref.com/en/comps/31/{season_label}/schedule/{season_label}-Liga-MX-Scores-and-Fixtures",
                "active_cdx_path": "fbref.com/en/comps/31/schedule/Liga-MX-Scores-and-Fixtures",
                "active_from": act_from,
                "active_to": act_to,
            }
        )
        targets.append(
            {
                "competition": f"liga-mx-{season_label}-stats",
                "season_label": season_label,
                "page_type": "season_stats",
                "live_url": f"https://fbref.com/en/comps/31/{season_label}/{season_label}-Liga-MX-Stats",
                "cdx_path": f"fbref.com/en/comps/31/{season_label}/{season_label}-Liga-MX-Stats",
                "active_cdx_path": "fbref.com/en/comps/31/Liga-MX-Stats",
                "active_from": act_from,
                "active_to": act_to,
            }
        )

    comps_extracted: list[dict[str, Any]] = []
    unique_matches_by_key: dict[tuple[str, str, str, str], dict[str, Any]] = {}
    total_rows = 0
    total_fixture_table_rows = 0
    total_fixture_rows_with_xg = 0
    total_stats_table_rows = 0

    with (
        StealthySession(
            headless=True,
            solve_cloudflare=True,
            network_idle=True,
            block_ads=True,
            timeout=60000,
        ) as stealth_session,
        FetcherSession(impersonate="chrome", stealthy_headers=True) as archive_fs,
    ):
        for idx, tgt in enumerate(targets, start=1):
            comp_slug = tgt["competition"]
            season_label = tgt["season_label"]
            page_type = tgt["page_type"]
            live_url = tgt["live_url"]

            page = None
            live_status: int | None = None
            page_title: str | None = None
            used_archive_fallback = False
            used_archive_xg_enrichment = False
            archive_url_used: str | None = None
            archive_ts_used: str | None = None

            try:
                page = stealth_session.fetch(
                    live_url,
                    wait_until="domcontentloaded",
                    wait=3000,
                    google_search=False,
                )
                live_status = getattr(page, "status", None)
                page_title = (page.css("title::text").get() or "").strip() or None
            except Exception:
                page = None

            tables = (
                _parse_fbref_all_stats_tables(page, season_label)
                if (page is not None and live_status == 200)
                else []
            )

            # Respaldo automático vía Wayback CDX si Cloudflare rate-limitó o no hubo tablas
            if not tables:
                arch_tables, arch_u, arch_ts = _fetch_fbref_wayback_tables(
                    archive_fs,
                    cdx_target_no_scheme=tgt["cdx_path"],
                    season_label=season_label,
                    to_ts="20260115",
                )
                if not arch_tables:
                    arch_tables, arch_u, arch_ts = _fetch_fbref_wayback_tables(
                        archive_fs,
                        cdx_target_no_scheme=tgt["cdx_path"],
                        season_label=season_label,
                    )
                if arch_tables:
                    tables = arch_tables
                    used_archive_fallback = True
                    archive_url_used = arch_u
                    archive_ts_used = arch_ts

            # Enriquecimiento histórico de xG Opta desde snapshots pre-enero-2026 en Wayback
            if page_type == "scores_and_fixtures" and _count_fixture_xg_rows(tables) == 0:
                xg_tables, arch_u, arch_ts = _fetch_fbref_wayback_tables(
                    archive_fs,
                    cdx_target_no_scheme=tgt["cdx_path"],
                    season_label=season_label,
                    to_ts="20260115",
                )
                if _count_fixture_xg_rows(xg_tables) == 0:
                    xg_tables, arch_u, arch_ts = _fetch_fbref_wayback_tables(
                        archive_fs,
                        cdx_target_no_scheme=tgt["active_cdx_path"],
                        season_label=season_label,
                        from_ts=tgt["active_from"],
                        to_ts=tgt["active_to"],
                    )
                if xg_tables and _count_fixture_xg_rows(xg_tables) > 0:
                    enriched = _enrich_fixtures_with_archive_xg(tables, xg_tables)
                    if enriched > 0:
                        used_archive_xg_enrichment = True
                        archive_url_used = arch_u
                        archive_ts_used = arch_ts

            elif page_type == "season_stats" and not _has_squad_xg_columns(tables):
                xg_stats_tables, arch_u, arch_ts = _fetch_fbref_wayback_tables(
                    archive_fs,
                    cdx_target_no_scheme=tgt["cdx_path"],
                    season_label=season_label,
                    to_ts="20260115",
                )
                if xg_stats_tables and _has_squad_xg_columns(xg_stats_tables):
                    tables = _merge_stats_tables_with_archive_xg(tables, xg_stats_tables)
                    used_archive_xg_enrichment = True
                    archive_url_used = arch_u
                    archive_ts_used = arch_ts

            comp_rows_count = sum(len(t.get("rows", [])) for t in tables)
            total_rows += comp_rows_count
            page_xg_rows = 0

            if page_type == "scores_and_fixtures":
                total_fixture_table_rows += comp_rows_count
                page_xg_rows = _count_fixture_xg_rows(tables)
                total_fixture_rows_with_xg += page_xg_rows

                # Consolidar partidos únicos por `(season, date, home_team, away_team)`
                for tbl in tables:
                    for r in tbl.get("rows") or []:
                        dt = str(r.get("date") or "").strip()
                        h_tm = str(r.get("home_team") or "").strip()
                        a_tm = str(r.get("away_team") or "").strip()
                        if not dt or not h_tm or not a_tm:
                            continue
                        ukey = (season_label, dt, h_tm, a_tm)
                        hg, ag = _parse_score_goals(r.get("score"))
                        cand_obj = {
                            "season": season_label,
                            "date": dt,
                            "round": r.get("round"),
                            "gameweek": r.get("gameweek"),
                            "dayofweek": r.get("dayofweek"),
                            "start_time": r.get("start_time"),
                            "home_team": h_tm,
                            "away_team": a_tm,
                            "score": r.get("score"),
                            "home_goals": hg,
                            "away_goals": ag,
                            "home_xg": r.get("home_xg"),
                            "away_xg": r.get("away_xg"),
                            "venue": r.get("venue"),
                            "referee": r.get("referee"),
                            "attendance": r.get("attendance"),
                        }
                        prev = unique_matches_by_key.get(ukey)
                        if prev is None or (
                            prev.get("home_xg") is None
                            and cand_obj.get("home_xg") is not None
                        ) or (not prev.get("round") and cand_obj.get("round")):
                            unique_matches_by_key[ukey] = cand_obj
            else:
                total_stats_table_rows += comp_rows_count

            comps_extracted.append(
                {
                    "competition": comp_slug,
                    "season_label": season_label,
                    "page_type": page_type,
                    "live_url": live_url,
                    "status": live_status,
                    "title": page_title,
                    "used_archive_fallback": used_archive_fallback,
                    "used_archive_xg_enrichment": used_archive_xg_enrichment,
                    "archive_url": archive_url_used,
                    "archive_timestamp": archive_ts_used,
                    "tables_count": len(tables),
                    "total_rows": comp_rows_count,
                    "fixture_rows_with_xg": page_xg_rows
                    if page_type == "scores_and_fixtures"
                    else None,
                    "tables": tables,
                }
            )

            print(
                f"   [{idx:02d}/10] {comp_slug:32s} | status={live_status} | "
                f"tables={len(tables):2d} | rows={comp_rows_count:3d} | "
                f"xg_rows={page_xg_rows:3d} | fallback={used_archive_fallback} | "
                f"xg_enrich={used_archive_xg_enrichment}"
            )

            if idx < len(targets):
                time.sleep(3.5)

    unique_matches_list = sorted(
        unique_matches_by_key.values(),
        key=lambda x: (str(x.get("date") or ""), str(x.get("home_team") or "")),
    )
    unique_played_matches = sum(
        1 for m in unique_matches_list if m.get("home_goals") is not None
    )
    unique_matches_with_xg = sum(
        1
        for m in unique_matches_list
        if m.get("home_xg") is not None and m.get("away_xg") is not None
    )

    seasons_breakdown: dict[str, dict[str, int]] = {}
    for season_label, _, _ in FBREF_LIGAMX_SEASONS:
        s_matches = [m for m in unique_matches_list if m["season"] == season_label]
        s_tables = sum(
            c["tables_count"]
            for c in comps_extracted
            if c["season_label"] == season_label
        )
        seasons_breakdown[season_label] = {
            "tables_extracted": s_tables,
            "unique_fixtures": len(s_matches),
            "unique_played_matches": sum(
                1 for m in s_matches if m.get("home_goals") is not None
            ),
            "unique_matches_with_xg": sum(
                1
                for m in s_matches
                if m.get("home_xg") is not None and m.get("away_xg") is not None
            ),
        }

    payload = {
        "source": "fbref",
        "wave": "wave5_ligamx_historical_2018_2023",
        "captured_at_utc": utc_now_iso(),
        "target_seasons": [s for s, _, _ in FBREF_LIGAMX_SEASONS],
        "target_urls": [t["live_url"] for t in targets],
        "summary": {
            "seasons_scraped": len(FBREF_LIGAMX_SEASONS),
            "competitions_pages_scraped": len(comps_extracted),
            "total_tables_extracted": sum(
                c.get("tables_count", 0) for c in comps_extracted
            ),
            "historical_fixture_rows_extracted": total_fixture_table_rows,
            "historical_fixture_rows_with_xg": total_fixture_rows_with_xg,
            "historical_season_stats_rows_extracted": total_stats_table_rows,
            "total_stat_and_fixture_rows": total_rows,
            "unique_historical_matches_extracted": len(unique_matches_list),
            "unique_played_matches_extracted": unique_played_matches,
            "unique_historical_matches_with_xg": unique_matches_with_xg,
            "seasons_breakdown": seasons_breakdown,
        },
        "competitions": comps_extracted,
        "unique_historical_matches": unique_matches_list,
    }

    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url=targets[0]["live_url"],
        label=label,
        extra_meta=payload["summary"],
    )
    ok_sha, sha256_val = _verify_saved_snapshot(out_path)
    if not ok_sha:
        raise RuntimeError(f"Error de integridad SHA-256 en {out_path}")

    return {
        "source_id": "fbref",
        "label": label,
        "path": str(out_path),
        "records": total_rows,
        "unique_matches": len(unique_matches_list),
        "unique_matches_with_xg": unique_matches_with_xg,
        "summary": payload["summary"],
        "sha256": sha256_val,
        "sha256_verified": ok_sha,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Wave 5 Historical xG 2018–2023 Scraper (Understat 5 Ligas + FBref Liga MX)."
    )
    parser.add_argument(
        "--source",
        choices=["all", "understat", "fbref"],
        default="all",
        help="Fuente a ejecutar (por defecto: all).",
    )
    args = parser.parse_args()

    print(
        f"[{utc_now_iso()}] Iniciando Wave 5 Historical xG Backfill (2018–2023) con Scrapling exclusivo..."
    )
    results: list[dict[str, Any]] = []

    if args.source in ("all", "understat"):
        print(
            "-> [1/2] Understat: 5 ligas europeas × 5 temporadas (2018–2022 = 25 combinaciones liga-temporada)..."
        )
        res_u = scrape_understat_wave5_2018_2022()
        results.append(res_u)
        print(
            f"   OK understat: records={res_u['records']} | "
            f"matches={res_u['summary']['historical_matches_datesData_extracted']} "
            f"(xG={res_u['summary']['historical_played_matches_with_xg']}) | "
            f"sha256={res_u['sha256']} | verified={res_u['sha256_verified']}"
        )

    if args.source in ("all", "fbref"):
        print(
            "-> [2/2] FBref: Liga MX Histórico 2018–2023 (5 temporadas × Scores-and-Fixtures + Stats = 10 páginas)..."
        )
        res_f = scrape_fbref_wave5_ligamx_2018_2023()
        results.append(res_f)
        print(
            f"   OK fbref: rows={res_f['records']} | "
            f"unique_matches={res_f['unique_matches']} (xG={res_f['unique_matches_with_xg']}) | "
            f"sha256={res_f['sha256']} | verified={res_f['sha256_verified']}"
        )

    print("\n=== RESUMEN WAVE 5 HISTORICAL XG (2018-2023) ===")
    for r in results:
        print(
            f"- {r['source_id']} ({r['label']}): records={r['records']} | "
            f"sha256={r['sha256']} | verified={r['sha256_verified']} | path={r['path']}"
        )


if __name__ == "__main__":
    main()
