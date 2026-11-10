"""Scraper Wave 5: Estadísticas Avanzadas Multi-Deporte Norteamericano (NHL, MLB, NBA, NCAAF).

REGLA DE INGENIERÍA:
Exclusivamente utiliza Scrapling (`FetcherSession`, `Selector`) desde
`.worktrees\\web-scraping\\.venv\\Scripts\\python.exe` y `PitchLabScraplingBase`
(`scrapers/base_scraper.py`). Prohibido `requests`, `urllib`, `httpx`, `curl`, `bs4`
o `playwright` suelto.

Objetivos de Extracción Real (Wave 5 — `advanced_stats_xg`):
1. `nhl_moneypuck_hockeyref` (`label="nhl_32teams_xg_corsi_fenwick_moneypuck"`):
   32 franquicias NHL a lo largo de múltiples temporadas (`2023-24`, `2024-25`, `2025-26`, `2026-27`)
   combinando MoneyPuck (`all` y `5on5`), Hockey-Reference y ESPN NHL Standings.
2. `mlb_fangraphs_baseballref` (`label="mlb_30teams_batting_pitching_fip_woba"`):
   30 franquicias MLB (`2024`, `2025`, `2026`) combinando MLB StatsAPI (`teams`, `hitting`,
   `pitching`, `standings`, `divisions`) y Baseball-Reference (`OPS+`, `FIP` oficial, `wOBA`, Pythag 1.83).
3. `nba_bballref_fourfactors` (`label="nba_30teams_four_factors_ortg_drtg"`):
   30 franquicias NBA (`2024-25`, `2025-26`, `2026-27`) desde Basketball-Reference
   (`Four Factors`, `ORtg`, `DRtg`, `NetRtg`, `Pace`, `SRS`, descomentando tablas HTML si aplica)
   y ESPN NBA Standings.
4. `ncaaf_cfb_sp_plus_srs` (`label="ncaaf_fbs_teams_srs_ypp_conferences"`):
   134–138 programas FBS de NCAAF (`2024`, `2025`, `2026`) combinando ESPN College Football
   Standings (`group=80`), ESPN FPI / Resume, ESPN Team Offense/Defense y TeamRankings
   (`off_yards_per_play`, `def_yards_per_play`, `SRS`, `SOS` y `pythag_win_pct_237`).
"""

from __future__ import annotations

import csv
import io
import json
from pathlib import Path
import re
import statistics
import sys
from typing import Any
import unicodedata

from scrapling.fetchers import FetcherSession
from scrapling.parser import Selector

SCRIPT_DIR = Path(__file__).resolve().parent
WORKTREE_ROOT = SCRIPT_DIR.parent
if str(WORKTREE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKTREE_ROOT))

from scrapers.base_scraper import (  # noqa: E402
    DATA_RAW_DIR,
    PitchLabScraplingBase,
    sha256_text,
    utc_now_iso,
)


# ---------------------------------------------------------------------------
# Utilidades comunes
# ---------------------------------------------------------------------------
def _response_text(resp: Any) -> str:
    """Extrae texto UTF-8 seguro desde un Response de Scrapling."""
    if resp is None:
        return ""
    body = getattr(resp, "body", b"")
    if isinstance(body, bytes):
        return body.decode("utf-8", errors="replace")
    if isinstance(body, str) and body:
        return body
    text = getattr(resp, "text", "")
    return str(text or "")


def _safe_json_loads(raw: bytes | str | None) -> Any | None:
    """Parsea JSON de forma segura sin lanzar excepción."""
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


def _to_float(val: Any, default: float | None = None) -> float | None:
    """Convierte cadenas numéricas (con signos +, comas o puntos iniciales) a float."""
    if val is None:
        return default
    if isinstance(val, (int, float)):
        return float(val)
    cleaned = str(val).strip().replace(",", "").replace("+", "")
    if not cleaned or cleaned in {"-", "--", "N/A", "null"}:
        return default
    try:
        return float(cleaned)
    except ValueError:
        return default


def _to_int(val: Any, default: int | None = None) -> int | None:
    """Convierte un valor numérico a entero de forma segura."""
    flt = _to_float(val, None)
    if flt is None:
        return default
    return int(round(flt))


def _pythag_win_pct(scored: float | None, allowed: float | None, exponent: float) -> float | None:
    """Calcula expectativa pitagórica generalizada: S^exp / (S^exp + A^exp)."""
    if scored is None or allowed is None or scored < 0 or allowed < 0:
        return None
    if scored == 0 and allowed == 0:
        return None
    s_pow = float(scored) ** exponent
    a_pow = float(allowed) ** exponent
    denom = s_pow + a_pow
    if denom <= 0:
        return None
    return round(s_pow / denom, 4)


def _remove_previous_label_snapshots(category: str, source_id: str, label: str) -> None:
    """Elimina ÚNICAMENTE snapshots previos que coincidan con el `label` propio de Wave 5."""
    src_dir = DATA_RAW_DIR / category / source_id
    if not src_dir.exists():
        return
    for json_file in src_dir.rglob(f"*_{label}_*.json"):
        json_file.unlink(missing_ok=True)


def _verify_saved_snapshot_sha256(snapshot_path: Path) -> str:
    """Verifica criptográficamente el envoltorio JSON guardado y devuelve su `sha256`."""
    envelope = json.loads(snapshot_path.read_text(encoding="utf-8"))
    stored_sha = str(envelope.get("sha256") or "")
    payload = envelope.get("payload")
    canonical = (
        payload
        if isinstance(payload, str)
        else json.dumps(payload, ensure_ascii=False, sort_keys=True)
    )
    computed = sha256_text(canonical)
    if not stored_sha or computed != stored_sha:
        raise ValueError(
            f"Fallo de integridad SHA-256 en {snapshot_path}: stored={stored_sha} vs computed={computed}"
        )
    return stored_sha


def _parse_sportsref_tables(html_text: str) -> dict[str, Selector]:
    """Extrae todas las tablas con `id` del DOM directo y dentro de comentarios `<!-- ... -->`."""
    tables: dict[str, Selector] = {}
    if not html_text:
        return tables

    root_sel = Selector(html_text)
    for tbl in root_sel.css("table"):
        tid = tbl.attrib.get("id")
        if tid:
            tables[tid] = tbl

    for comment_match in re.finditer(
        r"<!--(.*?<table[^>]*>.*?</table>.*?)-->", html_text, re.DOTALL
    ):
        comment_sel = Selector(comment_match.group(1))
        for tbl in comment_sel.css("table"):
            tid = tbl.attrib.get("id")
            if tid and tid not in tables:
                tables[tid] = tbl

    return tables


# ===========================================================================
# 1. NHL: MONEYPUCK + HOCKEY-REFERENCE + ESPN STANDINGS (32 FRANQUICIAS)
# ===========================================================================
NHL_SEASONS_CONFIG: list[tuple[int, int, str]] = [
    (2023, 2024, "2023-24"),
    (2024, 2025, "2024-25"),
    (2025, 2026, "2025-26"),
    (2026, 2027, "2026-27"),
]

HOCKEYREF_TO_NHL_ABBR: dict[str, str] = {
    "VEG": "VGK",
}

ESPN_TO_NHL_ABBR: dict[str, str] = {
    "LA": "LAK",
    "NJ": "NJD",
    "SJ": "SJS",
    "TB": "TBL",
    "UTAH": "UTA",
    "VEG": "VGK",
}

NHL_TEAM_FULL_NAMES: dict[str, str] = {
    "ANA": "Anaheim Ducks",
    "ARI": "Arizona Coyotes",
    "BOS": "Boston Bruins",
    "BUF": "Buffalo Sabres",
    "CAR": "Carolina Hurricanes",
    "CBJ": "Columbus Blue Jackets",
    "CGY": "Calgary Flames",
    "CHI": "Chicago Blackhawks",
    "COL": "Colorado Avalanche",
    "DAL": "Dallas Stars",
    "DET": "Detroit Red Wings",
    "EDM": "Edmonton Oilers",
    "FLA": "Florida Panthers",
    "LAK": "Los Angeles Kings",
    "MIN": "Minnesota Wild",
    "MTL": "Montreal Canadiens",
    "NJD": "New Jersey Devils",
    "NSH": "Nashville Predators",
    "NYI": "New York Islanders",
    "NYR": "New York Rangers",
    "OTT": "Ottawa Senators",
    "PHI": "Philadelphia Flyers",
    "PIT": "Pittsburgh Penguins",
    "SEA": "Seattle Kraken",
    "SJS": "San Jose Sharks",
    "STL": "St. Louis Blues",
    "TBL": "Tampa Bay Lightning",
    "TOR": "Toronto Maple Leafs",
    "UTA": "Utah Hockey Club",
    "VAN": "Vancouver Canucks",
    "VGK": "Vegas Golden Knights",
    "WPG": "Winnipeg Jets",
    "WSH": "Washington Capitals",
}


def _parse_moneypuck_csv(csv_text: str) -> dict[tuple[str, str], dict[str, str]]:
    """Parsea el CSV de equipos de MoneyPuck indexado por `(team_abbr, situation)`."""
    out: dict[tuple[str, str], dict[str, str]] = {}
    reader = csv.reader(io.StringIO(csv_text))
    headers: list[str] | None = None
    for raw_row in reader:
        if not raw_row:
            continue
        if headers is None:
            headers = [h.strip() for h in raw_row]
            continue
        row_map: dict[str, str] = {}
        for idx, col_name in enumerate(headers):
            if idx < len(raw_row) and col_name not in row_map:
                row_map[col_name] = raw_row[idx].strip()
        team_abbr = row_map.get("team", "").upper().replace(".", "")
        if team_abbr in {"LA", "NJ", "SJ", "TB"}:
            team_abbr = ESPN_TO_NHL_ABBR[team_abbr]
        situation = row_map.get("situation", "").strip()
        if team_abbr and situation in {"all", "5on5"}:
            out[(team_abbr, situation)] = row_map
    return out


def _parse_hockeyref_season(html_text: str) -> dict[str, dict[str, Any]]:
    """Extrae clasificación oficial y métricas 5v5 de Hockey-Reference por franquicia."""
    tables = _parse_sportsref_tables(html_text)
    by_abbr: dict[str, dict[str, Any]] = {}

    for conf_label, tid in [("Eastern", "standings_EAS"), ("Western", "standings_WES")]:
        tbl = tables.get(tid)
        if not tbl:
            continue
        for tr in tbl.css("tbody tr"):
            tr_class = tr.attrib.get("class") or ""
            if "thead" in tr_class or "spacer" in tr_class:
                continue
            href = tr.css("th a::attr(href), td a::attr(href)").get() or ""
            m = re.search(r"/teams/([A-Z]{3})/", href)
            if not m:
                continue
            raw_code = m.group(1)
            abbr = HOCKEYREF_TO_NHL_ABBR.get(raw_code, raw_code)
            stats_row: dict[str, str] = {}
            for cell in tr.css("th, td"):
                stat_key = cell.attrib.get("data-stat")
                val = " ".join(cell.css("::text, *::text").getall()).strip()
                if stat_key and val:
                    stats_row[stat_key] = val
            clean_name = re.sub(r"[\*\+\s]+$", "", stats_row.get("team_name", "")).strip()
            by_abbr[abbr] = {
                "team_name": clean_name or NHL_TEAM_FULL_NAMES.get(abbr, abbr),
                "conference": conf_label,
                "games_played": _to_int(stats_row.get("games")),
                "wins": _to_int(stats_row.get("wins")),
                "losses": _to_int(stats_row.get("losses")),
                "ot_losses": _to_int(stats_row.get("losses_ot")),
                "points": _to_int(stats_row.get("points")),
                "goals_for": _to_int(stats_row.get("goals")),
                "goals_against": _to_int(stats_row.get("opp_goals")),
                "srs": _to_float(stats_row.get("srs")),
                "sos": _to_float(stats_row.get("sos")),
                "reg_wins": _to_int(stats_row.get("reg_wins")),
            }

    adv_tbl = tables.get("stats_adv")
    if adv_tbl:
        for tr in adv_tbl.css("tbody tr"):
            if "thead" in (tr.attrib.get("class") or ""):
                continue
            href = tr.css("th a::attr(href), td a::attr(href)").get() or ""
            m = re.search(r"/teams/([A-Z]{3})/", href)
            if not m:
                continue
            abbr = HOCKEYREF_TO_NHL_ABBR.get(m.group(1), m.group(1))
            adv_stats: dict[str, str] = {}
            for cell in tr.css("th, td"):
                stat_key = cell.attrib.get("data-stat")
                val = " ".join(cell.css("::text, *::text").getall()).strip()
                if stat_key and val:
                    adv_stats[stat_key] = val
            if abbr in by_abbr:
                by_abbr[abbr]["hockeyref_cf_pct_5on5"] = _to_float(adv_stats.get("corsi_pct_5on5"))
                by_abbr[abbr]["hockeyref_ff_pct_5on5"] = _to_float(adv_stats.get("fenwick_pct_5on5"))
                by_abbr[abbr]["pdo_5on5"] = _to_float(adv_stats.get("pdo"))

    return by_abbr


def _parse_espn_nhl_standings(espn_json: dict[str, Any] | None) -> dict[str, dict[str, Any]]:
    """Extrae clasificación NHL desde el JSON abierto de ESPN."""
    out: dict[str, dict[str, Any]] = {}
    if not isinstance(espn_json, dict):
        return out
    for ch in espn_json.get("children") or []:
        conf_name = ch.get("name") or ""
        entries = list((ch.get("standings") or {}).get("entries") or [])
        for sub in ch.get("children") or []:
            entries.extend((sub.get("standings") or {}).get("entries") or [])
        for entry in entries:
            team = entry.get("team") or {}
            raw_abbr = str(team.get("abbreviation") or "").upper()
            abbr = ESPN_TO_NHL_ABBR.get(raw_abbr, raw_abbr)
            stat_map: dict[str, Any] = {}
            for st in entry.get("stats") or []:
                sname = st.get("name")
                if sname and sname not in stat_map:
                    stat_map[sname] = st.get("value") if st.get("value") is not None else st.get("displayValue")
            if abbr:
                out[abbr] = {
                    "team_name": team.get("displayName"),
                    "conference": "Eastern" if "East" in conf_name else ("Western" if "West" in conf_name else conf_name),
                    "games_played": _to_int(stat_map.get("gamesPlayed")),
                    "wins": _to_int(stat_map.get("wins")),
                    "losses": _to_int(stat_map.get("losses")),
                    "ot_losses": _to_int(stat_map.get("otLosses") or stat_map.get("overtimeLosses")),
                    "points": _to_int(stat_map.get("points")),
                    "goals_for": _to_int(stat_map.get("pointsFor")),
                    "goals_against": _to_int(stat_map.get("pointsAgainst")),
                    "playoff_seed": _to_int(stat_map.get("playoffSeed")),
                }
    return out


def scrape_nhl_moneypuck_hockeyref() -> dict[str, Any]:
    """1. Extrae las 32 franquicias NHL (MoneyPuck CSV + Hockey-Reference + ESPN Standings)."""
    scraper = PitchLabScraplingBase("nhl_moneypuck_hockeyref")
    label = "nhl_32teams_xg_corsi_fenwick_moneypuck"
    _remove_previous_label_snapshots(scraper.category, scraper.source_id, label)

    espn_url = "https://site.api.espn.com/apis/v2/sports/hockey/nhl/standings"
    target_urls: list[str] = [espn_url]
    team_seasons: list[dict[str, Any]] = []
    seasons_summary: list[dict[str, Any]] = []

    with FetcherSession(impersonate="chrome", stealthy_headers=True) as session:
        espn_resp = session.get(espn_url, timeout=25)
        espn_json = _safe_json_loads(_response_text(espn_resp))
        espn_live = _parse_espn_nhl_standings(espn_json)
        espn_season_year = ((espn_json or {}).get("season") or {}).get("year")

        for mp_year, hr_year, season_label in NHL_SEASONS_CONFIG:
            mp_url = f"https://moneypuck.com/moneypuck/playerData/seasonSummary/{mp_year}/regular/teams.csv"
            hr_url = f"https://www.hockey-reference.com/leagues/NHL_{hr_year}.html"
            target_urls.extend([mp_url, hr_url])

            mp_resp = session.get(mp_url, timeout=25)
            mp_map = _parse_moneypuck_csv(_response_text(mp_resp))

            hr_resp = session.get(hr_url, timeout=25)
            hr_map = _parse_hockeyref_season(_response_text(hr_resp))

            season_abbrs = sorted({abbr for (abbr, sit) in mp_map.keys() if sit == "all"})
            season_rows: list[dict[str, Any]] = []

            for abbr in season_abbrs:
                mp_all = mp_map.get((abbr, "all"), {})
                mp_5v5 = mp_map.get((abbr, "5on5"), {})
                hr_info = hr_map.get(abbr, {})
                espn_info = espn_live.get(abbr, {}) if hr_year == espn_season_year else {}

                gp = hr_info.get("games_played") or espn_info.get("games_played") or _to_int(mp_all.get("games_played"))
                wins = hr_info.get("wins") if hr_info.get("wins") is not None else espn_info.get("wins")
                losses = hr_info.get("losses") if hr_info.get("losses") is not None else espn_info.get("losses")
                ot_losses = hr_info.get("ot_losses") if hr_info.get("ot_losses") is not None else espn_info.get("ot_losses")
                points = hr_info.get("points") if hr_info.get("points") is not None else espn_info.get("points")

                gf = hr_info.get("goals_for") or espn_info.get("goals_for") or _to_int(mp_all.get("goalsFor"))
                ga = hr_info.get("goals_against") or espn_info.get("goals_against") or _to_int(mp_all.get("goalsAgainst"))

                xgf_all = _to_float(mp_all.get("xGoalsFor"))
                xga_all = _to_float(mp_all.get("xGoalsAgainst"))
                xg_pct_all = (
                    round(100.0 * xgf_all / (xgf_all + xga_all), 2)
                    if xgf_all is not None and xga_all is not None and (xgf_all + xga_all) > 0
                    else round((_to_float(mp_all.get("xGoalsPercentage")) or 0.0) * 100.0, 2)
                )

                cf_all = _to_float(mp_all.get("shotAttemptsFor"))
                ca_all = _to_float(mp_all.get("shotAttemptsAgainst"))
                corsi_pct_all = (
                    round(100.0 * cf_all / (cf_all + ca_all), 2)
                    if cf_all is not None and ca_all is not None and (cf_all + ca_all) > 0
                    else round((_to_float(mp_all.get("corsiPercentage")) or 0.0) * 100.0, 2)
                )

                ff_all = _to_float(mp_all.get("unblockedShotAttemptsFor"))
                fa_all = _to_float(mp_all.get("unblockedShotAttemptsAgainst"))
                fenwick_pct_all = (
                    round(100.0 * ff_all / (ff_all + fa_all), 2)
                    if ff_all is not None and fa_all is not None and (ff_all + fa_all) > 0
                    else round((_to_float(mp_all.get("fenwickPercentage")) or 0.0) * 100.0, 2)
                )

                xgf_5v5 = _to_float(mp_5v5.get("xGoalsFor"))
                xga_5v5 = _to_float(mp_5v5.get("xGoalsAgainst"))
                xg_pct_5v5 = (
                    round(100.0 * xgf_5v5 / (xgf_5v5 + xga_5v5), 2)
                    if xgf_5v5 is not None and xga_5v5 is not None and (xgf_5v5 + xga_5v5) > 0
                    else None
                )
                cf_5v5 = _to_float(mp_5v5.get("shotAttemptsFor"))
                ca_5v5 = _to_float(mp_5v5.get("shotAttemptsAgainst"))
                corsi_pct_5v5 = (
                    round(100.0 * cf_5v5 / (cf_5v5 + ca_5v5), 2)
                    if cf_5v5 is not None and ca_5v5 is not None and (cf_5v5 + ca_5v5) > 0
                    else None
                )
                ff_5v5 = _to_float(mp_5v5.get("unblockedShotAttemptsFor"))
                fa_5v5 = _to_float(mp_5v5.get("unblockedShotAttemptsAgainst"))
                fenwick_pct_5v5 = (
                    round(100.0 * ff_5v5 / (ff_5v5 + fa_5v5), 2)
                    if ff_5v5 is not None and fa_5v5 is not None and (ff_5v5 + fa_5v5) > 0
                    else None
                )

                saved_unblocked = _to_float(mp_all.get("savedUnblockedShotAttemptsAgainst"))
                save_pct_unblocked = (
                    round(saved_unblocked / fa_all, 4)
                    if saved_unblocked is not None and fa_all and fa_all > 0
                    else None
                )

                row_obj = {
                    "team_abbr": abbr,
                    "team_name": hr_info.get("team_name")
                    or espn_info.get("team_name")
                    or NHL_TEAM_FULL_NAMES.get(abbr, abbr),
                    "conference": hr_info.get("conference") or espn_info.get("conference"),
                    "season": season_label,
                    "moneypuck_season": mp_year,
                    "games_played": gp,
                    "wins": wins,
                    "losses": losses,
                    "ot_losses": ot_losses,
                    "points": points,
                    "goals_for": gf,
                    "goals_against": ga,
                    "xg_for": round(xgf_all, 2) if xgf_all is not None else None,
                    "xg_against": round(xga_all, 2) if xga_all is not None else None,
                    "xg_pct": xg_pct_all,
                    "corsi_for_pct": corsi_pct_5v5 if corsi_pct_5v5 is not None else corsi_pct_all,
                    "fenwick_for_pct": fenwick_pct_5v5 if fenwick_pct_5v5 is not None else fenwick_pct_all,
                    "corsi_for_pct_all": corsi_pct_all,
                    "fenwick_for_pct_all": fenwick_pct_all,
                    "xg_for_5on5": round(xgf_5v5, 2) if xgf_5v5 is not None else None,
                    "xg_against_5on5": round(xga_5v5, 2) if xga_5v5 is not None else None,
                    "xg_pct_5on5": xg_pct_5v5,
                    "corsi_for_pct_5on5": corsi_pct_5v5,
                    "fenwick_for_pct_5on5": fenwick_pct_5v5,
                    "high_danger_xg_for": _to_float(mp_all.get("highDangerxGoalsFor")),
                    "high_danger_xg_against": _to_float(mp_all.get("highDangerxGoalsAgainst")),
                    "high_danger_xg_for_5on5": _to_float(mp_5v5.get("highDangerxGoalsFor")),
                    "high_danger_xg_against_5on5": _to_float(mp_5v5.get("highDangerxGoalsAgainst")),
                    "shots_on_goal_for": _to_int(mp_all.get("shotsOnGoalFor")),
                    "shots_on_goal_against": _to_int(mp_all.get("shotsOnGoalAgainst")),
                    "save_pct_on_unblocked": save_pct_unblocked,
                    "srs": hr_info.get("srs"),
                    "sos": hr_info.get("sos"),
                    "pythag_win_pct_215": _pythag_win_pct(gf, ga, 2.15),
                }
                season_rows.append(row_obj)

            team_seasons.extend(season_rows)
            seasons_summary.append(
                {
                    "season": season_label,
                    "moneypuck_season": mp_year,
                    "moneypuck_status": mp_resp.status,
                    "hockeyref_status": hr_resp.status,
                    "teams_extracted": len(season_rows),
                }
            )

    latest_full_teams = [r for r in team_seasons if r["season"] == "2025-26"]
    current_teams = [r for r in team_seasons if r["season"] == "2026-27"]

    if len(latest_full_teams) != 32:
        raise RuntimeError(f"Se esperaban 32 franquicias NHL en 2025-26, se obtuvieron {len(latest_full_teams)}")

    payload = {
        "source": "nhl_moneypuck_hockeyref",
        "sport": "nhl",
        "captured_at_utc": utc_now_iso(),
        "target_urls": target_urls,
        "summary": {
            "franchises_per_season": 32,
            "seasons_extracted": [s["season"] for s in seasons_summary],
            "latest_full_season": "2025-26",
            "latest_full_season_teams_count": len(latest_full_teams),
            "current_season_teams_count": len(current_teams),
            "total_team_season_records": len(team_seasons),
        },
        "seasons_summary": seasons_summary,
        "teams": latest_full_teams,
        "current_season_teams": current_teams,
        "team_seasons": team_seasons,
    }

    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url="https://moneypuck.com/moneypuck/playerData/seasonSummary/2025/regular/teams.csv",
        label=label,
        extra_meta=payload["summary"],
    )
    sha256_val = _verify_saved_snapshot_sha256(out_path)
    return {
        "source_id": scraper.source_id,
        "label": label,
        "category": scraper.category,
        "path": str(out_path),
        "franchises": len(latest_full_teams),
        "records": len(team_seasons),
        "sha256": sha256_val,
    }


# ===========================================================================
# 2. MLB: MLB STATSAPI + BASEBALL-REFERENCE (30 FRANQUICIAS — FIP & wOBA)
# ===========================================================================
MLB_SEASONS: list[int] = [2024, 2025, 2026]

MLB_LEAGUE_CODES: dict[int, str] = {
    103: "AL",
    104: "NL",
}


def _compute_mlb_woba_est(hit_stat: dict[str, Any]) -> float | None:
    """Calcula `woba_est` con pesos lineales estándar sobre componentes reales de bateo MLB."""
    h = _to_float(hit_stat.get("hits"), 0.0) or 0.0
    d2 = _to_float(hit_stat.get("doubles"), 0.0) or 0.0
    d3 = _to_float(hit_stat.get("triples"), 0.0) or 0.0
    hr = _to_float(hit_stat.get("homeRuns"), 0.0) or 0.0
    bb = _to_float(hit_stat.get("baseOnBalls"), 0.0) or 0.0
    ibb = _to_float(hit_stat.get("intentionalWalks"), 0.0) or 0.0
    hbp = _to_float(hit_stat.get("hitByPitch"), 0.0) or 0.0
    ab = _to_float(hit_stat.get("atBats"), 0.0) or 0.0
    sf = _to_float(hit_stat.get("sacFlies"), 0.0) or 0.0

    ubb = max(0.0, bb - ibb)
    singles = max(0.0, h - d2 - d3 - hr)
    denom = ab + ubb + sf + hbp
    if denom <= 0:
        return None
    numer = (
        0.690 * ubb
        + 0.720 * hbp
        + 0.880 * singles
        + 1.247 * d2
        + 1.578 * d3
        + 2.031 * hr
    )
    return round(numer / denom, 3)


def _parse_mlb_innings_pitched(pitch_stat: dict[str, Any]) -> float | None:
    """Obtiene entradas lanzadas exactas usando `outs / 3.0` (o notación `.1`/`.2` de béisbol)."""
    outs = _to_float(pitch_stat.get("outs"))
    if outs and outs > 0:
        return outs / 3.0
    ip_raw = str(pitch_stat.get("inningsPitched") or "").strip()
    if not ip_raw:
        return None
    if "." in ip_raw:
        whole_str, frac_str = ip_raw.split(".", 1)
        whole = _to_float(whole_str, 0.0) or 0.0
        if frac_str == "1":
            return whole + (1.0 / 3.0)
        if frac_str == "2":
            return whole + (2.0 / 3.0)
    return _to_float(ip_raw)


def _compute_mlb_fip(pitch_stat: dict[str, Any]) -> float | None:
    """Calcula FIP exacto con la fórmula oficial: ((13*HR + 3*(BB+HBP) - 2*SO) / IP) + 3.15."""
    ip = _parse_mlb_innings_pitched(pitch_stat)
    if not ip or ip <= 0:
        return None
    hr = _to_float(pitch_stat.get("homeRuns"), 0.0) or 0.0
    bb = _to_float(pitch_stat.get("baseOnBalls"), 0.0) or 0.0
    hbp = _to_float(
        pitch_stat.get("hitBatsmen")
        if pitch_stat.get("hitBatsmen") is not None
        else pitch_stat.get("hitByPitch"),
        0.0,
    ) or 0.0
    so = _to_float(pitch_stat.get("strikeOuts"), 0.0) or 0.0
    fip_val = ((13.0 * hr + 3.0 * (bb + hbp) - 2.0 * so) / ip) + 3.15
    return round(fip_val, 2)


def _parse_baseballref_season(html_text: str) -> dict[str, dict[str, Any]]:
    """Extrae `ops_plus`, `era_plus` y `fip_bref` por nombre de franquicia desde Baseball-Reference."""
    tables = _parse_sportsref_tables(html_text)
    by_name: dict[str, dict[str, Any]] = {}

    bat_tbl = tables.get("teams_standard_batting")
    if bat_tbl:
        for tr in bat_tbl.css("tbody tr"):
            if "thead" in (tr.attrib.get("class") or ""):
                continue
            t_name = " ".join(tr.css("th[data-stat='team_name'] a::text").getall()).strip()
            if not t_name:
                continue
            stats_row = {
                c.attrib.get("data-stat"): " ".join(c.css("::text, *::text").getall()).strip()
                for c in tr.css("th, td")
                if c.attrib.get("data-stat")
            }
            by_name.setdefault(t_name, {})["ops_plus"] = _to_int(
                stats_row.get("onbase_plus_slugging_plus")
            )

    pit_tbl = tables.get("teams_standard_pitching")
    if pit_tbl:
        for tr in pit_tbl.css("tbody tr"):
            if "thead" in (tr.attrib.get("class") or ""):
                continue
            t_name = " ".join(tr.css("th[data-stat='team_name'] a::text").getall()).strip()
            if not t_name:
                continue
            stats_row = {
                c.attrib.get("data-stat"): " ".join(c.css("::text, *::text").getall()).strip()
                for c in tr.css("th, td")
                if c.attrib.get("data-stat")
            }
            entry = by_name.setdefault(t_name, {})
            entry["era_plus"] = _to_int(stats_row.get("earned_run_avg_plus"))
            entry["fip_bref"] = _to_float(stats_row.get("fip"))

    return by_name


def scrape_mlb_fangraphs_baseballref() -> dict[str, Any]:
    """2. Extrae las 30 franquicias MLB (MLB StatsAPI + Baseball-Reference, temporadas 2024–2026)."""
    scraper = PitchLabScraplingBase("mlb_fangraphs_baseballref")
    label = "mlb_30teams_batting_pitching_fip_woba"
    _remove_previous_label_snapshots(scraper.category, scraper.source_id, label)

    divisions_url = "https://statsapi.mlb.com/api/v1/divisions?sportId=1"
    target_urls: list[str] = [divisions_url]
    team_seasons: list[dict[str, Any]] = []
    seasons_summary: list[dict[str, Any]] = []

    with FetcherSession(impersonate="chrome", stealthy_headers=True) as session:
        div_resp = session.get(divisions_url, timeout=25)
        div_json = _safe_json_loads(_response_text(div_resp)) or {}
        divisions_by_id: dict[int, str] = {
            int(d["id"]): str(d.get("nameShort") or d.get("name") or "")
            for d in (div_json.get("divisions") or [])
            if d.get("id") is not None
        }

        for season_yr in MLB_SEASONS:
            teams_url = f"https://statsapi.mlb.com/api/v1/teams?sportId=1&season={season_yr}"
            stats_url = (
                f"https://statsapi.mlb.com/api/v1/teams/stats"
                f"?stats=season&group=hitting,pitching&sportId=1&season={season_yr}"
            )
            standings_url = (
                f"https://statsapi.mlb.com/api/v1/standings?leagueId=103,104&season={season_yr}"
            )
            bref_url = f"https://www.baseball-reference.com/leagues/majors/{season_yr}.shtml"
            target_urls.extend([teams_url, stats_url, standings_url, bref_url])

            teams_json = _safe_json_loads(_response_text(session.get(teams_url, timeout=25))) or {}
            stats_json = _safe_json_loads(_response_text(session.get(stats_url, timeout=25))) or {}
            standings_json = (
                _safe_json_loads(_response_text(session.get(standings_url, timeout=25))) or {}
            )
            bref_resp = session.get(bref_url, timeout=25)
            bref_by_name = _parse_baseballref_season(_response_text(bref_resp))

            teams_meta: dict[int, dict[str, Any]] = {}
            for tm in teams_json.get("teams") or []:
                tid = int(tm["id"])
                lg_id = int((tm.get("league") or {}).get("id") or 0)
                div_id = int((tm.get("division") or {}).get("id") or 0)
                teams_meta[tid] = {
                    "team_id": tid,
                    "team_abbr": tm.get("abbreviation"),
                    "team_name": tm.get("name"),
                    "league": MLB_LEAGUE_CODES.get(lg_id)
                    or (tm.get("league") or {}).get("abbreviation"),
                    "division": divisions_by_id.get(div_id)
                    or (tm.get("division") or {}).get("name"),
                }

            hitting_by_id: dict[int, dict[str, Any]] = {}
            pitching_by_id: dict[int, dict[str, Any]] = {}
            for grp in stats_json.get("stats") or []:
                gname = ((grp.get("group") or {}).get("displayName") or "").lower()
                for sp in grp.get("splits") or []:
                    tid = int((sp.get("team") or {}).get("id") or 0)
                    st = sp.get("stat") or {}
                    if not tid:
                        continue
                    if gname == "hitting":
                        hitting_by_id[tid] = st
                    elif gname == "pitching":
                        pitching_by_id[tid] = st

            standings_by_id: dict[int, dict[str, Any]] = {}
            for rec_block in standings_json.get("records") or []:
                lg_id = int((rec_block.get("league") or {}).get("id") or 0)
                div_id = int((rec_block.get("division") or {}).get("id") or 0)
                for tr in rec_block.get("teamRecords") or []:
                    tid = int((tr.get("team") or {}).get("id") or 0)
                    if tid:
                        standings_by_id[tid] = {
                            "wins": _to_int(tr.get("wins")),
                            "losses": _to_int(tr.get("losses")),
                            "games_played": _to_int(tr.get("gamesPlayed")),
                            "runs_scored": _to_int(tr.get("runsScored")),
                            "runs_allowed": _to_int(tr.get("runsAllowed")),
                            "league": MLB_LEAGUE_CODES.get(lg_id),
                            "division": divisions_by_id.get(div_id),
                        }

            season_rows: list[dict[str, Any]] = []
            for tid in sorted(teams_meta.keys(), key=lambda x: str(teams_meta[x]["team_abbr"])):
                meta = teams_meta[tid]
                hit = hitting_by_id.get(tid, {})
                pit = pitching_by_id.get(tid, {})
                std = standings_by_id.get(tid, {})
                bref = bref_by_name.get(str(meta["team_name"]), {})

                gp = std.get("games_played") or _to_int(hit.get("gamesPlayed")) or 162
                wins = std.get("wins") if std.get("wins") is not None else _to_int(pit.get("wins"))
                losses = (
                    std.get("losses")
                    if std.get("losses") is not None
                    else _to_int(pit.get("losses"))
                )
                rs = (
                    std.get("runs_scored")
                    if std.get("runs_scored") is not None
                    else _to_int(hit.get("runs"))
                )
                ra = (
                    std.get("runs_allowed")
                    if std.get("runs_allowed") is not None
                    else _to_int(pit.get("runs"))
                )

                era_val = _to_float(pit.get("era"))
                fip_val = _compute_mlb_fip(pit)

                row_obj = {
                    "team_id": tid,
                    "team_abbr": meta["team_abbr"],
                    "team_name": meta["team_name"],
                    "league": meta["league"] or std.get("league"),
                    "division": meta["division"] or std.get("division"),
                    "season": season_yr,
                    "games_played": gp,
                    "wins": wins,
                    "losses": losses,
                    "runs_scored": rs,
                    "runs_allowed": ra,
                    "runs_per_game": round(rs / gp, 3) if rs is not None and gp else None,
                    "runs_allowed_per_game": round(ra / gp, 3) if ra is not None and gp else None,
                    "avg": _to_float(hit.get("avg")),
                    "obp": _to_float(hit.get("obp")),
                    "slg": _to_float(hit.get("slg")),
                    "ops": _to_float(hit.get("ops")),
                    "ops_plus": bref.get("ops_plus"),
                    "woba_est": _compute_mlb_woba_est(hit),
                    "era": era_val,
                    "era_plus": bref.get("era_plus"),
                    "whip": _to_float(pit.get("whip")),
                    "fip": fip_val,
                    "fip_minus_era": (
                        round(fip_val - era_val, 2)
                        if fip_val is not None and era_val is not None
                        else None
                    ),
                    "hr_per_9": _to_float(pit.get("homeRunsPer9")),
                    "so_per_9": _to_float(pit.get("strikeoutsPer9Inn")),
                    "bb_per_9": _to_float(pit.get("walksPer9Inn")),
                    "pythag_win_pct_183": _pythag_win_pct(rs, ra, 1.83),
                }
                season_rows.append(row_obj)

            team_seasons.extend(season_rows)
            seasons_summary.append(
                {
                    "season": season_yr,
                    "baseballref_status": bref_resp.status,
                    "teams_extracted": len(season_rows),
                }
            )

    latest_season_yr = max(MLB_SEASONS)
    latest_teams = [r for r in team_seasons if r["season"] == latest_season_yr]
    if len(latest_teams) != 30:
        raise RuntimeError(f"Se esperaban 30 franquicias MLB, se obtuvieron {len(latest_teams)}")

    payload = {
        "source": "mlb_fangraphs_baseballref",
        "sport": "mlb",
        "captured_at_utc": utc_now_iso(),
        "target_urls": target_urls,
        "summary": {
            "franchises_per_season": 30,
            "seasons_extracted": MLB_SEASONS,
            "latest_season": latest_season_yr,
            "latest_season_teams_count": len(latest_teams),
            "total_team_season_records": len(team_seasons),
        },
        "seasons_summary": seasons_summary,
        "teams": latest_teams,
        "team_seasons": team_seasons,
    }

    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url=f"https://statsapi.mlb.com/api/v1/teams/stats?stats=season&group=hitting,pitching&sportId=1&season={latest_season_yr}",
        label=label,
        extra_meta=payload["summary"],
    )
    sha256_val = _verify_saved_snapshot_sha256(out_path)
    return {
        "source_id": scraper.source_id,
        "label": label,
        "category": scraper.category,
        "path": str(out_path),
        "franchises": len(latest_teams),
        "records": len(team_seasons),
        "sha256": sha256_val,
    }


# ===========================================================================
# 3. NBA: BASKETBALL-REFERENCE FOUR FACTORS + ESPN STANDINGS (30 FRANQUICIAS)
# ===========================================================================
NBA_SEASONS_CONFIG: list[tuple[int, str]] = [
    (2025, "2024-25"),
    (2026, "2025-26"),
    (2027, "2026-27"),
]

ESPN_TO_BREF_NBA_ABBR: dict[str, str] = {
    "BKN": "BRK",
    "CHA": "CHO",
    "GS": "GSW",
    "NO": "NOP",
    "NY": "NYK",
    "PHX": "PHO",
    "SA": "SAS",
    "UTAH": "UTA",
    "WSH": "WAS",
}

BREF_TO_STANDARD_NBA_ABBR: dict[str, str] = {
    "BRK": "BKN",
    "CHO": "CHA",
    "PHO": "PHX",
}


def _parse_espn_nba_standings(espn_json: dict[str, Any] | None) -> dict[str, dict[str, Any]]:
    """Extrae conferencia, rachas y récords desde ESPN NBA Standings indexado por código BRef."""
    out: dict[str, dict[str, Any]] = {}
    if not isinstance(espn_json, dict):
        return out
    for ch in espn_json.get("children") or []:
        conf_raw = str(ch.get("name") or "")
        conf = "Eastern" if "East" in conf_raw else ("Western" if "West" in conf_raw else conf_raw)
        entries = list((ch.get("standings") or {}).get("entries") or [])
        for sub in ch.get("children") or []:
            entries.extend((sub.get("standings") or {}).get("entries") or [])
        for entry in entries:
            tm = entry.get("team") or {}
            espn_code = str(tm.get("abbreviation") or "").upper()
            bref_code = ESPN_TO_BREF_NBA_ABBR.get(espn_code, espn_code)
            stat_map: dict[str, Any] = {}
            for st in entry.get("stats") or []:
                sname = st.get("name")
                if sname and sname not in stat_map:
                    stat_map[sname] = st.get("value") if st.get("value") is not None else st.get("displayValue")
            out[bref_code] = {
                "espn_abbr": espn_code,
                "conference": conf,
                "playoff_seed": _to_int(stat_map.get("playoffSeed")),
                "home_record": stat_map.get("Home"),
                "away_record": stat_map.get("Road"),
            }
    return out


def _parse_bref_nba_season(
    html_text: str, season_label: str, espn_enrichment: dict[str, dict[str, Any]]
) -> list[dict[str, Any]]:
    """Extrae las 30 franquicias NBA con Four Factors, ORtg, DRtg, NetRtg, Pace y SRS."""
    tables = _parse_sportsref_tables(html_text)

    conf_by_bref: dict[str, str] = {}
    for conf_label, tbl_ids in [
        ("Eastern", ["confs_standings_E", "divs_standings_E"]),
        ("Western", ["confs_standings_W", "divs_standings_W"]),
    ]:
        for tid in tbl_ids:
            tbl = tables.get(tid)
            if not tbl:
                continue
            for tr in tbl.css("tbody tr"):
                href = tr.css("th a::attr(href), td a::attr(href)").get() or ""
                m = re.search(r"/teams/([A-Z]{3})/", href)
                if m:
                    conf_by_bref[m.group(1)] = conf_label

    pts_pg_by_bref: dict[str, tuple[int | None, float | None]] = {}
    pg_tbl = tables.get("per_game-team")
    if pg_tbl:
        for tr in pg_tbl.css("tbody tr"):
            if "thead" in (tr.attrib.get("class") or ""):
                continue
            href = tr.css("td[data-stat='team'] a::attr(href)").get() or ""
            m = re.search(r"/teams/([A-Z]{3})/", href)
            if not m:
                continue
            d = {
                c.attrib.get("data-stat"): " ".join(c.css("::text, *::text").getall()).strip()
                for c in tr.css("th, td")
                if c.attrib.get("data-stat")
            }
            pts_pg_by_bref[m.group(1)] = (_to_int(d.get("g")), _to_float(d.get("pts")))

    opp_pts_pg_by_bref: dict[str, float | None] = {}
    opp_tbl = tables.get("per_game-opponent")
    if opp_tbl:
        for tr in opp_tbl.css("tbody tr"):
            if "thead" in (tr.attrib.get("class") or ""):
                continue
            href = tr.css("td[data-stat='team'] a::attr(href)").get() or ""
            m = re.search(r"/teams/([A-Z]{3})/", href)
            if not m:
                continue
            d = {
                c.attrib.get("data-stat"): " ".join(c.css("::text, *::text").getall()).strip()
                for c in tr.css("th, td")
                if c.attrib.get("data-stat")
            }
            opp_pts_pg_by_bref[m.group(1)] = _to_float(d.get("opp_pts") or d.get("pts"))

    rows_out: list[dict[str, Any]] = []
    adv_tbl = tables.get("advanced-team")
    if not adv_tbl:
        return rows_out

    for tr in adv_tbl.css("tbody tr"):
        if "thead" in (tr.attrib.get("class") or ""):
            continue
        href = tr.css("td[data-stat='team'] a::attr(href)").get() or ""
        m = re.search(r"/teams/([A-Z]{3})/", href)
        if not m:
            continue
        bref_code = m.group(1)
        std_abbr = BREF_TO_STANDARD_NBA_ABBR.get(bref_code, bref_code)
        d = {
            c.attrib.get("data-stat"): " ".join(c.css("::text, *::text").getall()).strip()
            for c in tr.css("th, td")
            if c.attrib.get("data-stat")
        }
        clean_name = re.sub(r"[\*\+\s]+$", "", d.get("team", "")).strip()
        gp_pg, pts_pg = pts_pg_by_bref.get(bref_code, (None, None))
        opp_pts_pg = opp_pts_pg_by_bref.get(bref_code)
        wins = _to_int(d.get("wins"))
        losses = _to_int(d.get("losses"))
        gp = gp_pg or ((wins or 0) + (losses or 0))
        espn_info = espn_enrichment.get(bref_code, {})

        ortg = _to_float(d.get("off_rtg"))
        drtg = _to_float(d.get("def_rtg"))
        net_rtg = _to_float(d.get("net_rtg"))
        if net_rtg is None and ortg is not None and drtg is not None:
            net_rtg = round(ortg - drtg, 1)

        rows_out.append(
            {
                "team_abbr": std_abbr,
                "bref_abbr": bref_code,
                "team_name": clean_name,
                "conference": conf_by_bref.get(bref_code) or espn_info.get("conference"),
                "season": season_label,
                "games_played": gp,
                "wins": wins,
                "losses": losses,
                "pts_per_game": pts_pg,
                "opp_pts_per_game": opp_pts_pg,
                "mov": _to_float(d.get("mov")),
                "sos": _to_float(d.get("sos")),
                "srs": _to_float(d.get("srs")),
                "pace": _to_float(d.get("pace")),
                "ortg": ortg,
                "drtg": drtg,
                "net_rtg": net_rtg,
                "ts_pct": _to_float(d.get("ts_pct")),
                "efg_pct": _to_float(d.get("efg_pct")),
                "tov_pct": _to_float(d.get("tov_pct")),
                "orb_pct": _to_float(d.get("orb_pct")),
                "ft_per_fga": _to_float(d.get("ft_rate")),
                "fta_per_fga": _to_float(d.get("fta_per_fga_pct")),
                "opp_efg_pct": _to_float(d.get("opp_efg_pct")),
                "opp_tov_pct": _to_float(d.get("opp_tov_pct")),
                "drb_pct": _to_float(d.get("drb_pct")),
                "opp_ft_per_fga": _to_float(d.get("opp_ft_rate")),
                "pythag_win_pct_1391": _pythag_win_pct(pts_pg, opp_pts_pg, 13.91),
            }
        )

    rows_out.sort(key=lambda r: str(r["team_abbr"]))
    return rows_out


def scrape_nba_bballref_fourfactors() -> dict[str, Any]:
    """3. Extrae las 30 franquicias NBA (Basketball-Reference Four Factors + ESPN Standings)."""
    scraper = PitchLabScraplingBase("nba_bballref_fourfactors")
    label = "nba_30teams_four_factors_ortg_drtg"
    _remove_previous_label_snapshots(scraper.category, scraper.source_id, label)

    espn_url = "https://site.api.espn.com/apis/v2/sports/basketball/nba/standings"
    target_urls: list[str] = [espn_url]
    team_seasons: list[dict[str, Any]] = []
    seasons_summary: list[dict[str, Any]] = []

    with FetcherSession(impersonate="chrome", stealthy_headers=True) as session:
        espn_resp = session.get(espn_url, timeout=25)
        espn_enrichment = _parse_espn_nba_standings(_safe_json_loads(_response_text(espn_resp)))

        for bref_yr, season_label in NBA_SEASONS_CONFIG:
            bref_url = f"https://www.basketball-reference.com/leagues/NBA_{bref_yr}.html"
            target_urls.append(bref_url)
            bref_resp = session.get(bref_url, timeout=25)
            season_rows = _parse_bref_nba_season(
                _response_text(bref_resp), season_label, espn_enrichment
            )
            team_seasons.extend(season_rows)
            seasons_summary.append(
                {
                    "season": season_label,
                    "bref_year": bref_yr,
                    "status": bref_resp.status,
                    "teams_extracted": len(season_rows),
                }
            )

    latest_full_teams = [r for r in team_seasons if r["season"] == "2025-26"]
    current_teams = [r for r in team_seasons if r["season"] == "2026-27"]
    if len(latest_full_teams) != 30:
        raise RuntimeError(
            f"Se esperaban 30 franquicias NBA en 2025-26, se obtuvieron {len(latest_full_teams)}"
        )

    payload = {
        "source": "nba_bballref_fourfactors",
        "sport": "nba",
        "captured_at_utc": utc_now_iso(),
        "target_urls": target_urls,
        "summary": {
            "franchises_per_season": 30,
            "seasons_extracted": [s["season"] for s in seasons_summary],
            "latest_full_season": "2025-26",
            "latest_full_season_teams_count": len(latest_full_teams),
            "current_season_teams_count": len(current_teams),
            "total_team_season_records": len(team_seasons),
        },
        "seasons_summary": seasons_summary,
        "teams": latest_full_teams,
        "current_season_teams": current_teams,
        "team_seasons": team_seasons,
    }

    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url="https://www.basketball-reference.com/leagues/NBA_2026.html",
        label=label,
        extra_meta=payload["summary"],
    )
    sha256_val = _verify_saved_snapshot_sha256(out_path)
    return {
        "source_id": scraper.source_id,
        "label": label,
        "category": scraper.category,
        "path": str(out_path),
        "franchises": len(latest_full_teams),
        "records": len(team_seasons),
        "sha256": sha256_val,
    }


# ===========================================================================
# 4. NCAAF: FBS 130+ EQUIPOS (ESPN STANDINGS + ESPN FPI/STATS + TEAMRANKINGS YPP/SRS/SOS)
# ===========================================================================
NCAAF_SEASONS_CONFIG: list[tuple[int, str | None]] = [
    (2024, "2025-01-22"),
    (2025, "2026-01-22"),
    (2026, None),
]

NCAAF_TEAM_ALIASES: dict[str, str] = {
    "n texas": "north texas",
    "s florida": "south florida",
    "mississippi": "ole miss",
    "j madison": "james madison",
    "e carolina": "east carolina",
    "georgia so": "georgia southern",
    "middle tenn": "middle tennessee",
    "w kentucky": "western kentucky",
    "florida intl": "florida international",
    "s alabama": "south alabama",
    "coastal car": "coastal carolina",
    "n illinois": "northern illinois",
    "w michigan": "western michigan",
    "c michigan": "central michigan",
    "e michigan": "eastern michigan",
    "fla atlantic": "florida atlantic",
    "la tech": "louisiana tech",
    "la monroe": "ul monroe",
    "la lafayette": "louisiana",
    "n mexico state": "new mexico state",
    "appalachian state": "app state",
    "miami fl": "miami",
    "n dakota state": "north dakota state",
    "sac state": "sacramento state",
    "so miss": "southern miss",
    "s miss": "southern miss",
    "boston col": "boston college",
    "va tech": "virginia tech",
    "ga tech": "georgia tech",
}


def _norm_cfb_team_key(raw_name: str | None) -> str:
    """Normaliza nombres de universidades FBS entre ESPN y TeamRankings."""
    s = (
        unicodedata.normalize("NFKD", raw_name or "")
        .encode("ascii", "ignore")
        .decode("ascii")
        .lower()
        .strip()
    )
    s = re.sub(r"\(\d+-\d+(?:-\d+)?\)", "", s).strip()
    if "(oh)" in s:
        return "miami oh"
    s = s.replace("&", "and").replace("'", "").replace(".", "")
    s = re.sub(r"\bst\b", "state", s)
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    return NCAAF_TEAM_ALIASES.get(s, s)


def _extract_espn_fitt_content(html_text: str) -> dict[str, Any]:
    """Extrae `window['__espnfitt__'].page.content` desde páginas HTML de ESPN."""
    m = re.search(
        r"window\['__espnfitt__'\]\s*=\s*(\{.*?\});\s*</script>", html_text, re.DOTALL
    )
    if not m:
        return {}
    parsed = _safe_json_loads(m.group(1))
    if not isinstance(parsed, dict):
        return {}
    return ((parsed.get("page") or {}).get("content") or {})


def _parse_teamrankings_first_metric(html_text: str) -> dict[str, float]:
    """Extrae `{norm_team_key: float_val}` de `table.datatable tbody tr` en TeamRankings."""
    out: dict[str, float] = {}
    if not html_text:
        return out
    sel = Selector(html_text)
    for row in sel.css("table.datatable tbody tr"):
        tds = [
            " ".join(td.css("::text, *::text").getall()).strip()
            for td in row.css("td")
        ]
        if len(tds) < 3:
            continue
        key = _norm_cfb_team_key(tds[1])
        val = _to_float(tds[2])
        if key and val is not None:
            out[key] = val
    return out


def scrape_ncaaf_cfb_sp_plus_srs() -> dict[str, Any]:
    """4. Extrae los 134–138 equipos FBS de NCAAF (`2024`, `2025`, `2026`)."""
    scraper = PitchLabScraplingBase("ncaaf_cfb_sp_plus_srs")
    label = "ncaaf_fbs_teams_srs_ypp_conferences"
    _remove_previous_label_snapshots(scraper.category, scraper.source_id, label)

    target_urls: list[str] = []
    team_seasons: list[dict[str, Any]] = []
    seasons_summary: list[dict[str, Any]] = []

    with FetcherSession(impersonate="chrome", stealthy_headers=True) as session:
        for season_yr, tr_date in NCAAF_SEASONS_CONFIG:
            standings_url = (
                f"https://site.api.espn.com/apis/v2/sports/football/college-football/standings"
                f"?group=80&season={season_yr}"
            )
            fpi_url = f"https://www.espn.com/college-football/fpi/_/season/{season_yr}"
            resume_url = (
                f"https://www.espn.com/college-football/fpi/_/view/resume/season/{season_yr}"
            )
            off_url = (
                f"https://www.espn.com/college-football/stats/team/_/season/{season_yr}/seasontype/2"
            )
            def_url = (
                f"https://www.espn.com/college-football/stats/team/_/view/defense/season/{season_yr}/seasontype/2"
            )
            date_qs = f"?date={tr_date}" if tr_date else ""
            tr_off_ypp_url = (
                f"https://www.teamrankings.com/college-football/stat/yards-per-play{date_qs}"
            )
            tr_def_ypp_url = (
                f"https://www.teamrankings.com/college-football/stat/opponent-yards-per-play{date_qs}"
            )
            tr_sos_url = (
                f"https://www.teamrankings.com/college-football/ranking/schedule-strength-by-other{date_qs}"
            )
            tr_pred_url = (
                f"https://www.teamrankings.com/college-football/ranking/predictive-by-other{date_qs}"
            )
            target_urls.extend(
                [
                    standings_url,
                    fpi_url,
                    resume_url,
                    off_url,
                    def_url,
                    tr_off_ypp_url,
                    tr_def_ypp_url,
                    tr_sos_url,
                    tr_pred_url,
                ]
            )

            # 1. ESPN FBS Standings (group=80)
            std_json = _safe_json_loads(_response_text(session.get(standings_url, timeout=25))) or {}

            # 2. ESPN FPI & Resume (FPI rating + SOS rank)
            fpi_content = _extract_espn_fitt_content(
                _response_text(session.get(fpi_url, timeout=25))
            )
            resume_content = _extract_espn_fitt_content(
                _response_text(session.get(resume_url, timeout=25))
            )
            off_content = _extract_espn_fitt_content(
                _response_text(session.get(off_url, timeout=25))
            )
            def_content = _extract_espn_fitt_content(
                _response_text(session.get(def_url, timeout=25))
            )

            fpi_by_tid: dict[str, dict[str, Any]] = {}
            for item in ((fpi_content.get("table") or {}).get("stats") or []):
                tid = str((item.get("team") or {}).get("id") or "")
                smap = {st.get("name"): st.get("value") for st in (item.get("stats") or [])}
                if tid:
                    fpi_by_tid[tid] = {
                        "fpi": _to_float(smap.get("fpi")),
                        "fpi_rank": _to_int(smap.get("fpirank")),
                        "conference": item.get("conference"),
                    }

            sos_rank_by_tid: dict[str, int | None] = {}
            for item in ((resume_content.get("table") or {}).get("stats") or []):
                tid = str((item.get("team") or {}).get("id") or "")
                smap = {st.get("name"): st.get("value") for st in (item.get("stats") or [])}
                if tid:
                    sos_rank_by_tid[tid] = _to_int(smap.get("avgsosrank"))

            off_ypg_by_tid: dict[str, float | None] = {}
            for item in off_content.get("teamStats") or []:
                tid = str((item.get("team") or {}).get("id") or "")
                smap = {st.get("name"): st.get("value") for st in (item.get("stats") or [])}
                if tid:
                    off_ypg_by_tid[tid] = _to_float(smap.get("yardsPerGame"))

            def_ypg_by_tid: dict[str, float | None] = {}
            for item in def_content.get("teamStats") or []:
                tid = str((item.get("team") or {}).get("id") or "")
                smap = {st.get("name"): st.get("value") for st in (item.get("stats") or [])}
                if tid:
                    def_ypg_by_tid[tid] = _to_float(smap.get("yardsPerGame"))

            # 3. TeamRankings Off YPP, Def YPP, SOS y Predictive Rating
            tr_off_ypp = _parse_teamrankings_first_metric(
                _response_text(session.get(tr_off_ypp_url, timeout=25))
            )
            tr_def_ypp = _parse_teamrankings_first_metric(
                _response_text(session.get(tr_def_ypp_url, timeout=25))
            )
            tr_sos_raw = _parse_teamrankings_first_metric(
                _response_text(session.get(tr_sos_url, timeout=25))
            )
            tr_pred = _parse_teamrankings_first_metric(
                _response_text(session.get(tr_pred_url, timeout=25))
            )

            sos_mean = statistics.mean(tr_sos_raw.values()) if tr_sos_raw else 0.0

            season_rows: list[dict[str, Any]] = []
            seen_tids: set[str] = set()

            for ch in std_json.get("children") or []:
                conf_name = str(ch.get("name") or ch.get("shortName") or "").strip()
                entries = list((ch.get("standings") or {}).get("entries") or [])
                for sub in ch.get("children") or []:
                    entries.extend((sub.get("standings") or {}).get("entries") or [])

                for entry in entries:
                    tm = entry.get("team") or {}
                    tid = str(tm.get("id") or "")
                    if not tid or tid in seen_tids:
                        continue
                    seen_tids.add(tid)

                    # En ESPN CFB `stats` incluye primero las métricas globales (`type` sin prefijo `vsconf_`/`homerecord_`/`awayrecord_`)
                    overall_stats: dict[str, Any] = {}
                    overall_record_str = ""
                    for st in entry.get("stats") or []:
                        stype = str(st.get("type") or "")
                        sname = str(st.get("name") or "")
                        if stype == "total" and st.get("displayValue"):
                            overall_record_str = str(st.get("displayValue"))
                        if "_" not in stype and sname and sname not in overall_stats:
                            overall_stats[sname] = st.get("value")

                    wins = _to_int(overall_stats.get("wins"), 0) or 0
                    losses = 0
                    if overall_record_str and "-" in overall_record_str:
                        rec_parts = overall_record_str.split("-")
                        wins = _to_int(rec_parts[0], wins) or wins
                        losses = _to_int(rec_parts[1], 0) or 0
                    gp = wins + losses

                    pf = _to_int(overall_stats.get("pointsFor"), 0) or 0
                    pa = _to_int(overall_stats.get("pointsAgainst"), 0) or 0
                    ppg = round(pf / gp, 2) if gp > 0 else 0.0
                    opp_ppg = round(pa / gp, 2) if gp > 0 else 0.0
                    diff_pg = round((pf - pa) / gp, 2) if gp > 0 else 0.0

                    # Lookup en diccionarios TeamRankings probando location, shortDisplayName, displayName y abbreviation
                    matched_off_ypp = None
                    matched_def_ypp = None
                    matched_sos_raw = None
                    matched_pred = None
                    for cand in (
                        tm.get("location"),
                        tm.get("shortDisplayName"),
                        tm.get("displayName"),
                        tm.get("abbreviation"),
                        tm.get("name"),
                    ):
                        ckey = _norm_cfb_team_key(cand)
                        if not ckey:
                            continue
                        if matched_off_ypp is None and ckey in tr_off_ypp:
                            matched_off_ypp = tr_off_ypp[ckey]
                        if matched_def_ypp is None and ckey in tr_def_ypp:
                            matched_def_ypp = tr_def_ypp[ckey]
                        if matched_sos_raw is None and ckey in tr_sos_raw:
                            matched_sos_raw = tr_sos_raw[ckey]
                        if matched_pred is None and ckey in tr_pred:
                            matched_pred = tr_pred[ckey]

                    sos_centered = (
                        round(matched_sos_raw - sos_mean, 2)
                        if matched_sos_raw is not None
                        else None
                    )
                    fpi_info = fpi_by_tid.get(tid, {})
                    srs_val = (
                        round(diff_pg + sos_centered, 2)
                        if sos_centered is not None
                        else fpi_info.get("fpi")
                    )
                    pyth_237 = _pythag_win_pct(pf, pa, 2.37)

                    season_rows.append(
                        {
                            "team_id": int(tid) if tid.isdigit() else tid,
                            "team_name": tm.get("displayName") or tm.get("location"),
                            "school_name": tm.get("location"),
                            "team_abbr": tm.get("abbreviation"),
                            "conference": conf_name or fpi_info.get("conference"),
                            "season": season_yr,
                            "games_played": gp,
                            "wins": wins,
                            "losses": losses,
                            "points_for": pf,
                            "points_against": pa,
                            "points_per_game": ppg,
                            "opp_points_per_game": opp_ppg,
                            "point_diff_per_game": diff_pg,
                            "srs": srs_val,
                            "sos": sos_centered,
                            "espn_fpi": fpi_info.get("fpi"),
                            "espn_fpi_rank": fpi_info.get("fpi_rank"),
                            "espn_sos_rank": sos_rank_by_tid.get(tid),
                            "tr_predictive_rating": matched_pred,
                            "off_yards_per_play": matched_off_ypp,
                            "def_yards_per_play": matched_def_ypp,
                            "net_yards_per_play": (
                                round(matched_off_ypp - matched_def_ypp, 2)
                                if matched_off_ypp is not None and matched_def_ypp is not None
                                else None
                            ),
                            "off_yards_per_game": off_ypg_by_tid.get(tid),
                            "def_yards_per_game": def_ypg_by_tid.get(tid),
                            "pythag_win_pct_237": pyth_237,
                            "pythag_win_pct": pyth_237,
                        }
                    )

            season_rows.sort(key=lambda r: str(r["team_name"]))
            team_seasons.extend(season_rows)
            seasons_summary.append(
                {
                    "season": season_yr,
                    "fbs_teams_extracted": len(season_rows),
                    "teams_with_off_ypp": sum(
                        1 for r in season_rows if r["off_yards_per_play"] is not None
                    ),
                    "teams_with_def_ypp": sum(
                        1 for r in season_rows if r["def_yards_per_play"] is not None
                    ),
                    "teams_with_srs_sos": sum(
                        1 for r in season_rows if r["srs"] is not None and r["sos"] is not None
                    ),
                }
            )

    latest_full_teams = [r for r in team_seasons if r["season"] == 2025]
    current_teams = [r for r in team_seasons if r["season"] == 2026]
    if len(latest_full_teams) < 130 or len(current_teams) < 130:
        raise RuntimeError(
            f"Se esperaban 130+ equipos FBS NCAAF, se obtuvieron 2025={len(latest_full_teams)}, 2026={len(current_teams)}"
        )

    payload = {
        "source": "ncaaf_cfb_sp_plus_srs",
        "sport": "ncaaf",
        "captured_at_utc": utc_now_iso(),
        "target_urls": target_urls,
        "summary": {
            "seasons_extracted": [s["season"] for s in seasons_summary],
            "fbs_teams_2024": sum(1 for r in team_seasons if r["season"] == 2024),
            "fbs_teams_2025": len(latest_full_teams),
            "fbs_teams_2026": len(current_teams),
            "total_team_season_records": len(team_seasons),
        },
        "seasons_summary": seasons_summary,
        "teams": latest_full_teams,
        "current_season_teams": current_teams,
        "team_seasons": team_seasons,
    }

    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url="https://site.api.espn.com/apis/v2/sports/football/college-football/standings?group=80&season=2025",
        label=label,
        extra_meta=payload["summary"],
    )
    sha256_val = _verify_saved_snapshot_sha256(out_path)
    return {
        "source_id": scraper.source_id,
        "label": label,
        "category": scraper.category,
        "path": str(out_path),
        "franchises": len(current_teams),
        "records": len(team_seasons),
        "sha256": sha256_val,
    }


def main() -> None:
    print(
        f"[{utc_now_iso()}] Iniciando Wave 5 Multi-Sport Advanced Stats (NHL, MLB, NBA, NCAAF) con Scrapling..."
    )
    results: list[dict[str, Any]] = []

    print("-> [1/4] NHL: 32 franquicias (MoneyPuck xG/Corsi/Fenwick + Hockey-Reference + ESPN)...")
    nhl_res = scrape_nhl_moneypuck_hockeyref()
    results.append(nhl_res)
    print(
        f"   OK: {nhl_res['franchises']} franquicias NHL ({nhl_res['records']} team-seasons) | "
        f"sha256={nhl_res['sha256'][:12]}"
    )

    print("-> [2/4] MLB: 30 franquicias (MLB StatsAPI + Baseball-Reference FIP/wOBA/OPS+/Pythag 1.83)...")
    mlb_res = scrape_mlb_fangraphs_baseballref()
    results.append(mlb_res)
    print(
        f"   OK: {mlb_res['franchises']} franquicias MLB ({mlb_res['records']} team-seasons) | "
        f"sha256={mlb_res['sha256'][:12]}"
    )

    print("-> [3/4] NBA: 30 franquicias (Basketball-Reference Four Factors/ORtg/DRtg/Pace/SRS + ESPN)...")
    nba_res = scrape_nba_bballref_fourfactors()
    results.append(nba_res)
    print(
        f"   OK: {nba_res['franchises']} franquicias NBA ({nba_res['records']} team-seasons) | "
        f"sha256={nba_res['sha256'][:12]}"
    )

    print("-> [4/4] NCAAF: 130+ programas FBS (ESPN Standings/FPI/Off-Def + TeamRankings YPP/SRS/SOS)...")
    ncaaf_res = scrape_ncaaf_cfb_sp_plus_srs()
    results.append(ncaaf_res)
    print(
        f"   OK: {ncaaf_res['franchises']} programas FBS ({ncaaf_res['records']} team-seasons) | "
        f"sha256={ncaaf_res['sha256'][:12]}"
    )

    print("\n=== RESUMEN WAVE 5 MULTI-SPORT ADVANCED STATS ===")
    for r in results:
        print(
            f"- {r['source_id']} ({r['label']}): franchises={r['franchises']} | "
            f"records={r['records']} | sha256={r['sha256']} | path={r['path']}"
        )


if __name__ == "__main__":
    main()
