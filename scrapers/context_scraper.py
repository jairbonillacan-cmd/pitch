"""Scrapers de Contexto (Categorías 3, 4 y 5) para PitchLab usando exclusivamente Scrapling.

Cubre:
1. `transfermarkt_injuries` (`injuries_lineups`): Lesiones, sanciones, motivo, fecha estimada de retorno y valor de mercado (€) en Liga MX y Premier League.
2. `rotowire_lineups_injuries` (`injuries_lineups`): Alineaciones probables/confirmadas de fútbol y reporte de lesiones de NFL.
3. `mediotiempo_record_mx` (`news_press_sentiment`): Titulares de Liga MX, señales de cambio de DT/rotación y extracción Markdown con `scrapling extract get ... --ai-targeted`.
4. `open_meteo_nflweather` (`environment_referees`): Pronóstico horario de temperatura, viento, ráfagas, precipitación y altitud (m) para estadios de Liga MX y NFL.
"""

from __future__ import annotations

import json
from pathlib import Path
import re
import sys
from typing import Any

from scrapling.fetchers import FetcherSession

# Permitir ejecución directa desde la raíz o desde el directorio scrapers/
SCRIPT_DIR = Path(__file__).resolve().parent
WORKTREE_ROOT = SCRIPT_DIR.parent
if str(WORKTREE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKTREE_ROOT))

from scrapers.base_scraper import PitchLabScraplingBase, utc_now_iso  # noqa: E402


LIGA_MX_CLUB_KEYWORDS: dict[str, list[str]] = {
    "América": ["américa", "america", "águilas", "aguilas", "coapa"],
    "Chivas": ["chivas", "guadalajara", "rebaño", "rebano"],
    "Cruz Azul": ["cruz azul", "máquina", "maquina", "celestes"],
    "Pumas UNAM": ["pumas", "unam", "universitarios", "pedregal"],
    "Tigres UANL": ["tigres", "uanl", "felinos"],
    "Monterrey": ["monterrey", "rayados", "pandilla"],
    "Toluca": ["toluca", "diablos", "escarlatas"],
    "León": ["león", "leon", "esmeraldas", "fiera"],
    "Atlas": ["atlas", "rojinegros", "rojinegra"],
    "Pachuca": ["pachuca", "tuzos"],
    "Santos Laguna": ["santos", "laguna", "guerreros"],
    "Tijuana": ["tijuana", "xolos"],
    "Necaxa": ["necaxa", "rayos"],
    "Puebla": ["puebla", "franja"],
    "Querétaro": ["querétaro", "queretaro", "gallos"],
    "Mazatlán": ["mazatlán", "mazatlan", "cañoneros"],
    "Juárez": ["juárez", "juarez", "bravos"],
    "Atlético San Luis": ["san luis", "potosinos"],
}

STADIUMS_CATALOG: list[dict[str, Any]] = [
    {
        "stadium_id": "estadio_ciudad_de_los_deportes_azteca_cdmx",
        "name": "Estadio Azteca / Estadio Ciudad de los Deportes (CDMX)",
        "league": "liga-mx",
        "city": "Ciudad de México",
        "teams": ["América", "Cruz Azul"],
        "latitude": 19.3029,
        "longitude": -99.1505,
        "is_dome": False,
    },
    {
        "stadium_id": "estadio_nemesio_diez_toluca",
        "name": "Estadio Nemesio Díez (Toluca)",
        "league": "liga-mx",
        "city": "Toluca",
        "teams": ["Toluca"],
        "latitude": 19.2874,
        "longitude": -99.6672,
        "is_dome": False,
    },
    {
        "stadium_id": "estadio_akron_guadalajara",
        "name": "Estadio Akron (Guadalajara)",
        "league": "liga-mx",
        "city": "Zapopan / Guadalajara",
        "teams": ["Chivas"],
        "latitude": 20.6817,
        "longitude": -103.4628,
        "is_dome": False,
    },
    {
        "stadium_id": "estadio_bbva_monterrey",
        "name": "Estadio BBVA (Monterrey)",
        "league": "liga-mx",
        "city": "Guadalupe / Monterrey",
        "teams": ["Monterrey"],
        "latitude": 25.6691,
        "longitude": -100.2445,
        "is_dome": False,
    },
    {
        "stadium_id": "lambeau_field_green_bay",
        "name": "Lambeau Field (Green Bay)",
        "league": "nfl",
        "city": "Green Bay, WI",
        "teams": ["Green Bay Packers"],
        "latitude": 44.5013,
        "longitude": -88.0622,
        "is_dome": False,
    },
    {
        "stadium_id": "highmark_stadium_buffalo",
        "name": "Highmark Stadium (Buffalo)",
        "league": "nfl",
        "city": "Orchard Park, NY",
        "teams": ["Buffalo Bills"],
        "latitude": 42.7738,
        "longitude": -78.7870,
        "is_dome": False,
    },
    {
        "stadium_id": "arrowhead_stadium_kansas_city",
        "name": "GEHA Field at Arrowhead Stadium (Kansas City)",
        "league": "nfl",
        "city": "Kansas City, MO",
        "teams": ["Kansas City Chiefs"],
        "latitude": 39.0489,
        "longitude": -94.4839,
        "is_dome": False,
    },
]


def parse_market_value_eur(raw_value: str) -> float | None:
    """Convierte cadenas de valor de mercado de Transfermarkt ('3.00 M€', '800 mil €', '€22.00M') a euros."""
    if not raw_value:
        return None
    cleaned = raw_value.strip().lower().replace(",", ".")
    match = re.search(r"(\d+(?:\.\d+)?)", cleaned)
    if not match:
        return None
    amount = float(match.group(1))
    if "mill" in cleaned or "m€" in cleaned or cleaned.endswith("m"):
        return round(amount * 1_000_000, 2)
    if "mil" in cleaned or "k" in cleaned or "tsd" in cleaned:
        return round(amount * 1_000, 2)
    return amount


def _parse_transfermarkt_league_table(response, league_code: str) -> list[dict[str, Any]]:
    """Extrae filas de `table.items tbody tr` en páginas de lesiones de liga de Transfermarkt."""
    records: list[dict[str, Any]] = []
    for tr in response.css("table.items > tbody > tr"):
        tds = [td.get_all_text(strip=True) for td in tr.css("td")]
        if len(tds) < 8:
            continue

        player_links = [
            a.get_all_text(strip=True)
            for a in tr.css("td.hauptlink a")
            if a.get_all_text(strip=True)
        ]
        player_name = player_links[0] if player_links else (tds[2] if len(tds) > 2 else tds[0])
        position = tds[3] if len(tds) > 3 else ""

        club_imgs = tr.css("td.zentriert a img")
        club_name = ""
        for img in club_imgs:
            candidate = (img.attrib.get("title") or img.attrib.get("alt") or "").strip()
            if candidate and candidate != player_name:
                club_name = candidate
                break

        if len(tds) >= 11:
            age = tds[5]
            reason = tds[7]
            since_date = tds[8]
            expected_return = tds[9]
            raw_mv = tds[10]
        else:
            age = ""
            reason = tds[5] if len(tds) > 5 else ""
            since_date = ""
            expected_return = tds[6] if len(tds) > 6 else ""
            raw_mv = tds[7] if len(tds) > 7 else ""

        if not player_name:
            continue

        records.append(
            {
                "league": league_code,
                "record_type": "injury",
                "player_name": player_name,
                "club": club_name,
                "position": position,
                "age": int(age) if age.isdigit() else None,
                "injury_or_suspension_reason": reason,
                "since_date": since_date or None,
                "expected_return_date": expected_return or None,
                "market_value_raw": raw_mv or None,
                "market_value_eur": parse_market_value_eur(raw_mv),
            }
        )
    return records


def _parse_transfermarkt_club_sperren_table(
    response, club_name: str, league_code: str
) -> list[dict[str, Any]]:
    """Extrae filas de `sperrenundverletzungen/verein/.../plus/1` (lesiones y sanciones por club)."""
    records: list[dict[str, Any]] = []
    current_section = "injury_or_suspension"
    for tr in response.css("table.items > tbody > tr"):
        tds = [td.get_all_text(strip=True) for td in tr.css("td")]
        if len(tds) == 1 and tds[0]:
            label_lower = tds[0].lower()
            if "lesion" in label_lower or "injur" in label_lower:
                current_section = "injury"
            elif "sancion" in label_lower or "ausf" in label_lower or "suspens" in label_lower:
                current_section = "suspension"
            else:
                current_section = "yellow_card_risk"
            continue

        if len(tds) < 9 or current_section == "yellow_card_risk":
            continue

        player_name = tds[2] if len(tds) > 2 else ""
        position = tds[3] if len(tds) > 3 else ""
        age = tds[4] if len(tds) > 4 else ""
        reason = tds[5] if len(tds) > 5 else ""
        since_date = tds[6] if len(tds) > 6 else ""
        expected_return = tds[7] if len(tds) > 7 else ""
        matches_missed = tds[8] if len(tds) > 8 else ""
        raw_mv = tds[-1] if tds else ""

        if not player_name:
            continue

        records.append(
            {
                "league": league_code,
                "record_type": current_section,
                "player_name": player_name,
                "club": club_name,
                "position": position,
                "age": int(age) if age.isdigit() else None,
                "injury_or_suspension_reason": reason,
                "since_date": since_date or None,
                "expected_return_date": expected_return or None,
                "matches_missed": int(matches_missed) if matches_missed.isdigit() else None,
                "market_value_raw": raw_mv or None,
                "market_value_eur": parse_market_value_eur(raw_mv),
            }
        )
    return records


def scrape_transfermarkt_injuries() -> dict[str, Any]:
    """Extrae jugadores lesionados y sancionados de Transfermarkt (Liga MX y Premier League)."""
    scraper = PitchLabScraplingBase("transfermarkt_injuries")
    requested_urls = [
        "https://www.transfermarkt.mx/liga-mx-apertura/sperrenundverletzungen/wettbewerb/MEXA",
        "https://www.transfermarkt.com/premier-league/sperrenundverletzungen/wettbewerb/GB1",
    ]
    effective_league_urls = [
        ("liga-mx", "https://www.transfermarkt.mx/liga-mx-apertura/verletztespieler/wettbewerb/MEXA/plus/1"),
        ("epl", "https://www.transfermarkt.com/premier-league/verletztespieler/wettbewerb/GB1/plus/1"),
    ]
    club_sperren_urls = [
        ("liga-mx", "CF América", "https://www.transfermarkt.mx/cf-america/sperrenundverletzungen/verein/3631/plus/1"),
        ("liga-mx", "CD Guadalajara", "https://www.transfermarkt.mx/cd-guadalajara/sperrenundverletzungen/verein/6711/plus/1"),
    ]

    all_records: list[dict[str, Any]] = []
    http_trace: list[dict[str, Any]] = []

    with FetcherSession(impersonate="chrome", stealthy_headers=True) as session:
        # 1. Sondear URLs solicitadas y resolver automáticamente a la vista detallada `/verletztespieler/.../plus/1`
        for req_url in requested_urls:
            resp = session.get(req_url)
            http_trace.append({"url": req_url, "status": resp.status})
            if resp.status == 200:
                league_tag = "liga-mx" if "MEXA" in req_url else "epl"
                all_records.extend(_parse_transfermarkt_league_table(resp, league_tag))

        # 2. Extraer tablas completas de liga (Liga MX + Premier League) con fechas y valores de mercado
        for league_code, url in effective_league_urls:
            resp = session.get(url)
            http_trace.append({"url": url, "status": resp.status})
            if resp.status == 200:
                all_records.extend(_parse_transfermarkt_league_table(resp, league_code))

        # 3. Extraer endpoint `sperrenundverletzungen` por club en Liga MX
        for league_code, club_name, url in club_sperren_urls:
            resp = session.get(url)
            http_trace.append({"url": url, "status": resp.status})
            if resp.status == 200:
                all_records.extend(
                    _parse_transfermarkt_club_sperren_table(resp, club_name, league_code)
                )

    payload = {
        "captured_at_utc": utc_now_iso(),
        "total_records": len(all_records),
        "leagues_covered": ["liga-mx", "epl"],
        "http_trace": http_trace,
        "records": all_records,
    }
    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url=requested_urls[0],
        label="transfermarkt_injuries_mexa_gb1",
        extra_meta={
            "record_count": len(all_records),
            "liga_mx_count": sum(1 for r in all_records if r["league"] == "liga-mx"),
            "epl_count": sum(1 for r in all_records if r["league"] == "epl"),
        },
    )
    return {
        "source_id": scraper.source_id,
        "category": scraper.category,
        "path": str(out_path),
        "record_count": len(all_records),
        "sha256": json.loads(out_path.read_text(encoding="utf-8"))["sha256"],
    }


def _parse_rotowire_lineup_list(ul_node) -> dict[str, Any]:
    """Extrae estado (Confirmed/Predicted), 11 titular y lesionados/dudosos de una lista `.lineup__list`."""
    status_nodes = ul_node.css("li.lineup__status")
    status_text = status_nodes[0].get_all_text(strip=True) if status_nodes else "Unknown"
    confirmed_status = "confirmed" if "confirm" in status_text.lower() else "predicted"

    starting_11: list[dict[str, str]] = []
    injured_out: list[dict[str, str]] = []
    questionable: list[dict[str, str]] = []

    in_injuries_section = False
    for li in ul_node.css("li"):
        li_class = li.attrib.get("class", "")
        if "lineup__title" in li_class:
            in_injuries_section = True
            continue
        if "lineup__player" not in li_class:
            continue

        parts = [p.strip() for p in li.get_all_text(strip=True).splitlines() if p.strip()]
        if not parts:
            continue
        pos = parts[0] if len(parts) >= 2 else ""
        player_name = parts[1] if len(parts) >= 2 else parts[0]
        designation = parts[2] if len(parts) >= 3 else ""

        entry = {
            "player_name": player_name,
            "position": pos,
            "designation": designation or ("STARTER" if not in_injuries_section else "OUT"),
        }
        if not in_injuries_section:
            starting_11.append(entry)
            if designation.upper() in {"QUES", "DOUBT", "GTD"}:
                questionable.append(entry)
        else:
            if designation.upper() in {"OUT", "SUS", "INJ"}:
                injured_out.append(entry)
            else:
                questionable.append(entry)

    return {
        "confirmed_status": confirmed_status,
        "raw_status_label": status_text,
        "starting_11_players": starting_11,
        "injured_out_players": injured_out,
        "questionable_players": questionable,
    }


def scrape_rotowire_lineups_injuries() -> dict[str, Any]:
    """Extrae alineaciones probables/confirmadas de fútbol y el reporte de lesiones de NFL en RotoWire."""
    scraper = PitchLabScraplingBase("rotowire_lineups_injuries")
    soccer_url = "https://www.rotowire.com/soccer/lineups.php"
    nfl_page_url = "https://www.rotowire.com/football/injury-report.php"
    nfl_table_url = "https://www.rotowire.com/football/tables/injury-report.php?team=ALL&pos=ALL"

    soccer_matchups: list[dict[str, Any]] = []
    nfl_injuries: list[dict[str, Any]] = []

    with FetcherSession(impersonate="chrome", stealthy_headers=True) as session:
        soccer_resp = session.get(soccer_url)
        for box in soccer_resp.css(".lineup__box"):
            teams = [t.get_all_text(strip=True) for t in box.css(".lineup__mteam")]
            abbrs = [a.get_all_text(strip=True) for a in box.css(".lineup__abbr")]
            home_team = teams[0] if len(teams) >= 1 else (abbrs[0] if abbrs else "Home")
            away_team = teams[1] if len(teams) >= 2 else (abbrs[1] if len(abbrs) > 1 else "Away")

            home_ul = box.css("ul.lineup__list.is-home")
            visit_ul = box.css("ul.lineup__list.is-visit")
            if not home_ul and not visit_ul:
                continue

            home_data = _parse_rotowire_lineup_list(home_ul[0]) if home_ul else {}
            away_data = _parse_rotowire_lineup_list(visit_ul[0]) if visit_ul else {}
            soccer_matchups.append(
                {
                    "home_team": home_team,
                    "away_team": away_team,
                    "home_lineup": home_data,
                    "away_lineup": away_data,
                }
            )

        nfl_page_resp = session.get(nfl_page_url)
        nfl_page_title = (
            nfl_page_resp.css("title")[0].get_all_text(strip=True)
            if nfl_page_resp.css("title")
            else "NFL Injury Report"
        )

        nfl_ajax_resp = session.get(nfl_table_url)
        if nfl_ajax_resp.status == 200 and nfl_ajax_resp.body:
            raw_nfl = json.loads(nfl_ajax_resp.body.decode("utf-8"))
            if isinstance(raw_nfl, list):
                for item in raw_nfl:
                    nfl_injuries.append(
                        {
                            "player_id": item.get("ID"),
                            "player_name": item.get("player"),
                            "team": item.get("team"),
                            "position": item.get("position"),
                            "injury": item.get("injury"),
                            "game_status_designation": item.get("status"),
                            "player_url": item.get("URL"),
                        }
                    )

    total_records = len(soccer_matchups) + len(nfl_injuries)
    payload = {
        "captured_at_utc": utc_now_iso(),
        "soccer_lineups_url": soccer_url,
        "nfl_injury_report_url": nfl_page_url,
        "nfl_injury_table_endpoint": nfl_table_url,
        "nfl_page_title": nfl_page_title,
        "soccer_matchups_count": len(soccer_matchups),
        "nfl_injuries_count": len(nfl_injuries),
        "soccer_matchups": soccer_matchups,
        "nfl_injuries": nfl_injuries,
    }
    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url=soccer_url,
        label="rotowire_soccer_lineups_nfl_injuries",
        extra_meta={
            "record_count": total_records,
            "soccer_matchups_count": len(soccer_matchups),
            "nfl_injuries_count": len(nfl_injuries),
        },
    )
    return {
        "source_id": scraper.source_id,
        "category": scraper.category,
        "path": str(out_path),
        "record_count": total_records,
        "sha256": json.loads(out_path.read_text(encoding="utf-8"))["sha256"],
    }


def _detect_clubs_and_signals(headline: str) -> dict[str, Any]:
    """Detecta clubes de Liga MX mencionados y señales de cambio de DT o rotación."""
    lower = headline.lower()
    clubs = [
        club
        for club, keywords in LIGA_MX_CLUB_KEYWORDS.items()
        if any(kw in lower for kw in keywords)
    ]
    manager_signal = any(
        kw in lower
        for kw in [
            "dt",
            "técnico",
            "tecnico",
            "entrenador",
            "cesado",
            "despedido",
            "renuncia",
            "interino",
            "directiva",
            "presidencia",
        ]
    )
    rotation_signal = any(
        kw in lower
        for kw in [
            "rotación",
            "rotacion",
            "alterno",
            "suplentes",
            "regla de menores",
            "descanso",
            "baja",
            "lesión",
        ]
    )
    return {
        "clubs_mentioned": clubs,
        "manager_change_signal": manager_signal,
        "rotation_announcement": rotation_signal,
    }


def scrape_mediotiempo_record_mx() -> dict[str, Any]:
    """Extrae titulares de Liga MX desde Mediotiempo usando `extract_markdown_cli` (--ai-targeted) y `FetcherSession`."""
    scraper = PitchLabScraplingBase("mediotiempo_record_mx")
    target_url = scraper.source["base_url"]

    # 1. Ejecutar el CLI de Scrapling con `--ai-targeted` mediante el método base
    md_path = scraper.extract_markdown_cli(
        url=target_url, out_name="mediotiempo_liga_mx_ai_targeted.md"
    )
    markdown_content = md_path.read_text(encoding="utf-8") if md_path.exists() else ""

    # 2. Extraer titulares estructurados con FetcherSession
    headlines: list[dict[str, Any]] = []
    seen_titles: set[str] = set()

    with FetcherSession(impersonate="chrome", stealthy_headers=True) as session:
        resp = session.get(target_url)
        for heading in resp.css("h1, h2, h3"):
            title = heading.get_all_text(strip=True)
            if not title or len(title) < 20 or title in seen_titles:
                continue

            links = heading.css("a")
            if not links and heading.parent:
                links = heading.parent.css("a")
            href = links[0].attrib.get("href", "") if links else ""
            if href.startswith("/"):
                href = f"https://www.mediotiempo.com{href}"

            seen_titles.add(title)
            signals = _detect_clubs_and_signals(title)
            headlines.append(
                {
                    "headline": title,
                    "url": href or target_url,
                    "published_at_utc": utc_now_iso(),
                    "clubs_mentioned": signals["clubs_mentioned"],
                    "manager_change_signal": signals["manager_change_signal"],
                    "rotation_announcement": signals["rotation_announcement"],
                }
            )

    payload = {
        "captured_at_utc": utc_now_iso(),
        "source_url": target_url,
        "cli_markdown_file": md_path.name,
        "cli_markdown_char_length": len(markdown_content),
        "cli_markdown_excerpt": markdown_content[:2500],
        "headlines_count": len(headlines),
        "headlines": headlines,
    }
    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url=target_url,
        label="mediotiempo_liga_mx_headlines",
        extra_meta={
            "record_count": len(headlines),
            "cli_markdown_path": str(md_path),
            "cli_markdown_chars": len(markdown_content),
        },
    )
    return {
        "source_id": scraper.source_id,
        "category": scraper.category,
        "path": str(out_path),
        "markdown_path": str(md_path),
        "record_count": len(headlines),
        "sha256": json.loads(out_path.read_text(encoding="utf-8"))["sha256"],
    }


def scrape_open_meteo_nflweather() -> dict[str, Any]:
    """Consulta Open-Meteo API con `FetcherSession` para estadios de Liga MX y NFL."""
    scraper = PitchLabScraplingBase("open_meteo_nflweather")
    base_url = scraper.source["base_url"]
    stadium_forecasts: list[dict[str, Any]] = []

    with FetcherSession(impersonate="chrome", stealthy_headers=True) as session:
        for stadium in STADIUMS_CATALOG:
            query_url = (
                f"{base_url}?latitude={stadium['latitude']}&longitude={stadium['longitude']}"
                "&hourly=temperature_2m,wind_speed_10m,wind_gusts_10m,precipitation,relative_humidity_2m"
                "&wind_speed_unit=mph&forecast_days=2&timezone=UTC"
            )
            resp = session.get(query_url)
            data = json.loads(resp.body.decode("utf-8"))
            hourly = data.get("hourly", {})
            times = hourly.get("time", [])
            temps = hourly.get("temperature_2m", [])
            winds = hourly.get("wind_speed_10m", [])
            gusts = hourly.get("wind_gusts_10m", [])
            precips = hourly.get("precipitation", [])
            humidities = hourly.get("relative_humidity_2m", [])

            hourly_samples = []
            for idx in range(min(24, len(times))):
                hourly_samples.append(
                    {
                        "timestamp_utc": times[idx],
                        "temperature_c": temps[idx] if idx < len(temps) else None,
                        "wind_speed_mph": winds[idx] if idx < len(winds) else None,
                        "wind_gusts_mph": gusts[idx] if idx < len(gusts) else None,
                        "precipitation_mm": precips[idx] if idx < len(precips) else None,
                        "humidity_pct": humidities[idx] if idx < len(humidities) else None,
                    }
                )

            stadium_forecasts.append(
                {
                    "stadium_id": stadium["stadium_id"],
                    "stadium_name": stadium["name"],
                    "league": stadium["league"],
                    "city": stadium["city"],
                    "teams": stadium["teams"],
                    "latitude": data.get("latitude", stadium["latitude"]),
                    "longitude": data.get("longitude", stadium["longitude"]),
                    "stadium_elevation_m": data.get("elevation"),
                    "is_dome": stadium["is_dome"],
                    "next_24h_summary": {
                        "max_wind_speed_mph": max(winds[:24]) if winds else None,
                        "max_wind_gusts_mph": max(gusts[:24]) if gusts else None,
                        "total_precipitation_mm": round(sum(precips[:24]), 2) if precips else 0.0,
                        "min_temperature_c": min(temps[:24]) if temps else None,
                        "max_temperature_c": max(temps[:24]) if temps else None,
                    },
                    "hourly_forecast_24h": hourly_samples,
                }
            )

    payload = {
        "captured_at_utc": utc_now_iso(),
        "stadiums_count": len(stadium_forecasts),
        "stadiums": stadium_forecasts,
    }
    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url=base_url,
        label="open_meteo_stadiums_forecast",
        extra_meta={
            "record_count": len(stadium_forecasts),
            "liga_mx_stadiums": sum(1 for s in stadium_forecasts if s["league"] == "liga-mx"),
            "nfl_stadiums": sum(1 for s in stadium_forecasts if s["league"] == "nfl"),
        },
    )
    return {
        "source_id": scraper.source_id,
        "category": scraper.category,
        "path": str(out_path),
        "record_count": len(stadium_forecasts),
        "sha256": json.loads(out_path.read_text(encoding="utf-8"))["sha256"],
    }


def run_all_context_scrapers() -> list[dict[str, Any]]:
    """Ejecuta los 4 scrapers de contexto (Categorías 3, 4 y 5) y devuelve el resumen."""
    results = [
        scrape_transfermarkt_injuries(),
        scrape_rotowire_lineups_injuries(),
        scrape_mediotiempo_record_mx(),
        scrape_open_meteo_nflweather(),
    ]
    print(json.dumps(results, indent=2, ensure_ascii=False))
    return results


if __name__ == "__main__":
    run_all_context_scrapers()
