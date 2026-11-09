"""Scraper Profundo Ola 3 (Wave 3 Deep Extraction) para PitchLab usando exclusivamente Scrapling.

Cubre extracción masiva y profunda sobre:
1. `open_meteo_nflweather` (`environment_referees`):
   - Los 18 estadios de Liga MX (cubriendo los 18 clubes) + los 30 estadios de NFL (cubriendo las 32 franquicias) = 48 estadios.
   - Pronóstico horario de 7 días (168 horas por estadio = 8,064 registros horarios) con temperatura, humedad, precipitación, viento (mph), ráfagas (mph) y altitud (m).
   - Label: `open_meteo_48_ligamx_nfl_stadiums_7d`.
2. `worldfootball_nflpenalties_referees` (`environment_referees`):
   - Árbitros de las 6 ligas de fútbol en WorldFootball (Liga MX Apertura y Clausura, Premier League, LaLiga, Bundesliga, Serie A, Ligue 1).
   - Cuadrillas arbitrales NFL (`all-referees.php`), castigos por equipo (`nflpenalties.com`) y catálogo completo de tipos de castigo (`all-penalties.php`: Offensive Holding, Pass Interference, Roughing the Passer, Unnecessary Roughness, False Start, etc. con conteo, yardas y split local/visitante).
   - Label: `referees_6leagues_and_nfl_penalties_deep`.
3. `action_network_splits` (`odds_casinos`):
   - Extracción multi-deporte y multi-liga (`nfl/public-betting`, `nfl/odds`, `ncaaf/public-betting`, `ncaaf/odds`, `nhl/public-betting`, `nhl/odds`, `nba/public-betting`, `nba/odds`, `soccer/public-betting`, `soccer/odds`, `champions-league/odds`, `premier-league/odds`, `la-liga/odds`, `mlb/public-betting`, `mlb/odds`) vía `__NEXT_DATA__` con líneas por casa de apuestas y splits de tickets/dinero.
   - Label: `action_network_multisport_splits_deep`.
4. `betfair_smarkets_exchange` (`odds_casinos`):
   - Eventos de exchange en Smarkets API v3 (`football_match` limit=100, `american_football_match` limit=50, `ice_hockey_match` limit=50), mercados asociados (`/v3/events/{ids}/markets/`) y cotizaciones reales back/lay con liquidez (`/v3/markets/{ids}/quotes/`).
   - Label: `smarkets_exchange_events_markets_quotes_deep`.
"""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
import re
import sys
from typing import Any

from scrapling.fetchers import AsyncStealthySession, FetcherSession, StealthySession
from scrapling.parser import Selector

SCRIPT_DIR = Path(__file__).resolve().parent
WORKTREE_ROOT = SCRIPT_DIR.parent
if str(WORKTREE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKTREE_ROOT))

from scrapers.base_scraper import PitchLabScraplingBase, utc_now_iso  # noqa: E402


def _safe_json_loads(raw: bytes | str | None) -> Any | None:
    if not raw:
        return None
    try:
        text = raw.decode("utf-8", errors="replace") if isinstance(raw, bytes) else raw
        return json.loads(text)
    except Exception:
        return None


def _response_text(resp: Any) -> str:
    body = getattr(resp, "body", b"")
    if isinstance(body, bytes):
        return body.decode("utf-8", errors="replace")
    if isinstance(body, str):
        return body
    return str(getattr(resp, "text", "") or "")


# ===========================================================================
# 1. OPEN-METEO 48 STADIUMS (18 LIGA MX + 30 NFL) 7-DAY HOURLY FORECAST
# ===========================================================================

STADIUMS_48_CATALOG: list[dict[str, Any]] = [
    # --- 18 Estadios de Liga MX (18 clubes) ---
    {
        "stadium_id": "ligamx_ciudad_de_los_deportes_america",
        "name": "Estadio Ciudad de los Deportes (CDMX)",
        "league": "liga-mx",
        "city": "Ciudad de México",
        "teams": ["América"],
        "roof_type": "open",
        "latitude": 19.3835,
        "longitude": -99.1782,
    },
    {
        "stadium_id": "ligamx_azteca_cruz_azul_cdmx",
        "name": "Estadio Azteca / Ciudad de los Deportes (Cruz Azul CDMX)",
        "league": "liga-mx",
        "city": "Ciudad de México",
        "teams": ["Cruz Azul"],
        "roof_type": "open",
        "latitude": 19.3029,
        "longitude": -99.1505,
    },
    {
        "stadium_id": "ligamx_nemesio_diez_toluca",
        "name": "Estadio Nemesio Díez",
        "league": "liga-mx",
        "city": "Toluca, Estado de México",
        "teams": ["Toluca"],
        "roof_type": "open",
        "latitude": 19.2874,
        "longitude": -99.6672,
    },
    {
        "stadium_id": "ligamx_akron_chivas",
        "name": "Estadio Akron",
        "league": "liga-mx",
        "city": "Zapopan / Guadalajara, Jalisco",
        "teams": ["Chivas"],
        "roof_type": "open",
        "latitude": 20.6817,
        "longitude": -103.4628,
    },
    {
        "stadium_id": "ligamx_jalisco_atlas",
        "name": "Estadio Jalisco",
        "league": "liga-mx",
        "city": "Guadalajara, Jalisco",
        "teams": ["Atlas"],
        "roof_type": "open",
        "latitude": 20.7050,
        "longitude": -103.3281,
    },
    {
        "stadium_id": "ligamx_bbva_monterrey",
        "name": "Estadio BBVA",
        "league": "liga-mx",
        "city": "Guadalupe / Monterrey, Nuevo León",
        "teams": ["Monterrey"],
        "roof_type": "open",
        "latitude": 25.6691,
        "longitude": -100.2445,
    },
    {
        "stadium_id": "ligamx_universitario_tigres",
        "name": "Estadio Universitario (El Volcán)",
        "league": "liga-mx",
        "city": "San Nicolás de los Garza, Nuevo León",
        "teams": ["Tigres UANL"],
        "roof_type": "open",
        "latitude": 25.7226,
        "longitude": -100.3120,
    },
    {
        "stadium_id": "ligamx_olimpico_universitario_pumas",
        "name": "Estadio Olímpico Universitario",
        "league": "liga-mx",
        "city": "Ciudad de México",
        "teams": ["Pumas UNAM"],
        "roof_type": "open",
        "latitude": 19.3319,
        "longitude": -99.1921,
    },
    {
        "stadium_id": "ligamx_hidalgo_pachuca",
        "name": "Estadio Hidalgo",
        "league": "liga-mx",
        "city": "Pachuca, Hidalgo",
        "teams": ["Pachuca"],
        "roof_type": "open",
        "latitude": 20.1053,
        "longitude": -98.7561,
    },
    {
        "stadium_id": "ligamx_leon_nou_camp",
        "name": "Estadio León (Nou Camp)",
        "league": "liga-mx",
        "city": "León, Guanajuato",
        "teams": ["León"],
        "roof_type": "open",
        "latitude": 21.1156,
        "longitude": -101.6578,
    },
    {
        "stadium_id": "ligamx_corona_tsm_santos",
        "name": "Estadio Corona (TSM)",
        "league": "liga-mx",
        "city": "Torreón, Coahuila",
        "teams": ["Santos Laguna"],
        "roof_type": "open",
        "latitude": 25.6539,
        "longitude": -103.3506,
    },
    {
        "stadium_id": "ligamx_corregidora_queretaro",
        "name": "Estadio Corregidora",
        "league": "liga-mx",
        "city": "Querétaro, Querétaro",
        "teams": ["Querétaro"],
        "roof_type": "open",
        "latitude": 20.5778,
        "longitude": -100.3664,
    },
    {
        "stadium_id": "ligamx_cuauhtemoc_puebla",
        "name": "Estadio Cuauhtémoc",
        "league": "liga-mx",
        "city": "Puebla, Puebla",
        "teams": ["Puebla"],
        "roof_type": "open",
        "latitude": 19.0778,
        "longitude": -98.1644,
    },
    {
        "stadium_id": "ligamx_victoria_necaxa",
        "name": "Estadio Victoria",
        "league": "liga-mx",
        "city": "Aguascalientes, Aguascalientes",
        "teams": ["Necaxa"],
        "roof_type": "open",
        "latitude": 21.8806,
        "longitude": -102.2756,
    },
    {
        "stadium_id": "ligamx_alfonso_lastras_san_luis",
        "name": "Estadio Alfonso Lastras Ramírez",
        "league": "liga-mx",
        "city": "San Luis Potosí, SLP",
        "teams": ["Atlético San Luis"],
        "roof_type": "open",
        "latitude": 22.1389,
        "longitude": -100.9508,
    },
    {
        "stadium_id": "ligamx_caliente_tijuana",
        "name": "Estadio Caliente",
        "league": "liga-mx",
        "city": "Tijuana, Baja California",
        "teams": ["Tijuana"],
        "roof_type": "open",
        "latitude": 32.5064,
        "longitude": -116.9939,
    },
    {
        "stadium_id": "ligamx_benito_juarez_fc_juarez",
        "name": "Estadio Olímpico Benito Juárez",
        "league": "liga-mx",
        "city": "Ciudad Juárez, Chihuahua",
        "teams": ["Juárez"],
        "roof_type": "open",
        "latitude": 31.7556,
        "longitude": -106.4731,
    },
    {
        "stadium_id": "ligamx_el_encanto_mazatlan",
        "name": "Estadio El Encanto",
        "league": "liga-mx",
        "city": "Mazatlán, Sinaloa",
        "teams": ["Mazatlán"],
        "roof_type": "open",
        "latitude": 23.2986,
        "longitude": -106.4258,
    },
    # --- 30 Estadios de NFL (32 franquicias) ---
    {
        "stadium_id": "nfl_state_farm_cardinals",
        "name": "State Farm Stadium",
        "league": "nfl",
        "city": "Glendale, AZ",
        "teams": ["Arizona Cardinals"],
        "roof_type": "retractable",
        "latitude": 33.5276,
        "longitude": -112.2626,
    },
    {
        "stadium_id": "nfl_mercedes_benz_falcons",
        "name": "Mercedes-Benz Stadium",
        "league": "nfl",
        "city": "Atlanta, GA",
        "teams": ["Atlanta Falcons"],
        "roof_type": "retractable",
        "latitude": 33.7554,
        "longitude": -84.4010,
    },
    {
        "stadium_id": "nfl_mt_bank_ravens",
        "name": "M&T Bank Stadium",
        "league": "nfl",
        "city": "Baltimore, MD",
        "teams": ["Baltimore Ravens"],
        "roof_type": "open",
        "latitude": 39.2780,
        "longitude": -76.6227,
    },
    {
        "stadium_id": "nfl_highmark_bills",
        "name": "Highmark Stadium",
        "league": "nfl",
        "city": "Orchard Park, NY",
        "teams": ["Buffalo Bills"],
        "roof_type": "open",
        "latitude": 42.7738,
        "longitude": -78.7870,
    },
    {
        "stadium_id": "nfl_bank_of_america_panthers",
        "name": "Bank of America Stadium",
        "league": "nfl",
        "city": "Charlotte, NC",
        "teams": ["Carolina Panthers"],
        "roof_type": "open",
        "latitude": 35.2258,
        "longitude": -80.8528,
    },
    {
        "stadium_id": "nfl_soldier_field_bears",
        "name": "Soldier Field",
        "league": "nfl",
        "city": "Chicago, IL",
        "teams": ["Chicago Bears"],
        "roof_type": "open",
        "latitude": 41.8623,
        "longitude": -87.6167,
    },
    {
        "stadium_id": "nfl_paycor_bengals",
        "name": "Paycor Stadium",
        "league": "nfl",
        "city": "Cincinnati, OH",
        "teams": ["Cincinnati Bengals"],
        "roof_type": "open",
        "latitude": 39.0955,
        "longitude": -84.5161,
    },
    {
        "stadium_id": "nfl_huntington_bank_browns",
        "name": "Huntington Bank Field",
        "league": "nfl",
        "city": "Cleveland, OH",
        "teams": ["Cleveland Browns"],
        "roof_type": "open",
        "latitude": 41.5061,
        "longitude": -81.6995,
    },
    {
        "stadium_id": "nfl_att_stadium_cowboys",
        "name": "AT&T Stadium",
        "league": "nfl",
        "city": "Arlington, TX",
        "teams": ["Dallas Cowboys"],
        "roof_type": "retractable",
        "latitude": 32.7473,
        "longitude": -97.0945,
    },
    {
        "stadium_id": "nfl_empower_mile_high_broncos",
        "name": "Empower Field at Mile High",
        "league": "nfl",
        "city": "Denver, CO",
        "teams": ["Denver Broncos"],
        "roof_type": "open",
        "latitude": 39.7439,
        "longitude": -105.0201,
    },
    {
        "stadium_id": "nfl_ford_field_lions",
        "name": "Ford Field",
        "league": "nfl",
        "city": "Detroit, MI",
        "teams": ["Detroit Lions"],
        "roof_type": "dome",
        "latitude": 42.3400,
        "longitude": -83.0456,
    },
    {
        "stadium_id": "nfl_lambeau_field_packers",
        "name": "Lambeau Field",
        "league": "nfl",
        "city": "Green Bay, WI",
        "teams": ["Green Bay Packers"],
        "roof_type": "open",
        "latitude": 44.5013,
        "longitude": -88.0622,
    },
    {
        "stadium_id": "nfl_nrg_stadium_texans",
        "name": "NRG Stadium",
        "league": "nfl",
        "city": "Houston, TX",
        "teams": ["Houston Texans"],
        "roof_type": "retractable",
        "latitude": 29.6847,
        "longitude": -95.4107,
    },
    {
        "stadium_id": "nfl_lucas_oil_colts",
        "name": "Lucas Oil Stadium",
        "league": "nfl",
        "city": "Indianapolis, IN",
        "teams": ["Indianapolis Colts"],
        "roof_type": "retractable",
        "latitude": 39.7601,
        "longitude": -86.1639,
    },
    {
        "stadium_id": "nfl_everbank_jaguars",
        "name": "EverBank Stadium",
        "league": "nfl",
        "city": "Jacksonville, FL",
        "teams": ["Jacksonville Jaguars"],
        "roof_type": "open",
        "latitude": 30.3239,
        "longitude": -81.6373,
    },
    {
        "stadium_id": "nfl_arrowhead_chiefs",
        "name": "GEHA Field at Arrowhead Stadium",
        "league": "nfl",
        "city": "Kansas City, MO",
        "teams": ["Kansas City Chiefs"],
        "roof_type": "open",
        "latitude": 39.0489,
        "longitude": -94.4839,
    },
    {
        "stadium_id": "nfl_allegiant_raiders",
        "name": "Allegiant Stadium",
        "league": "nfl",
        "city": "Las Vegas, NV",
        "teams": ["Las Vegas Raiders"],
        "roof_type": "dome",
        "latitude": 36.0909,
        "longitude": -115.1833,
    },
    {
        "stadium_id": "nfl_sofi_rams_chargers",
        "name": "SoFi Stadium",
        "league": "nfl",
        "city": "Inglewood, CA",
        "teams": ["Los Angeles Rams", "Los Angeles Chargers"],
        "roof_type": "dome",
        "latitude": 33.9535,
        "longitude": -118.3392,
    },
    {
        "stadium_id": "nfl_hard_rock_dolphins",
        "name": "Hard Rock Stadium",
        "league": "nfl",
        "city": "Miami Gardens, FL",
        "teams": ["Miami Dolphins"],
        "roof_type": "open",
        "latitude": 25.9580,
        "longitude": -80.2389,
    },
    {
        "stadium_id": "nfl_us_bank_vikings",
        "name": "U.S. Bank Stadium",
        "league": "nfl",
        "city": "Minneapolis, MN",
        "teams": ["Minnesota Vikings"],
        "roof_type": "dome",
        "latitude": 44.9736,
        "longitude": -93.2575,
    },
    {
        "stadium_id": "nfl_gillette_patriots",
        "name": "Gillette Stadium",
        "league": "nfl",
        "city": "Foxborough, MA",
        "teams": ["New England Patriots"],
        "roof_type": "open",
        "latitude": 42.0909,
        "longitude": -71.2643,
    },
    {
        "stadium_id": "nfl_caesars_superdome_saints",
        "name": "Caesars Superdome",
        "league": "nfl",
        "city": "New Orleans, LA",
        "teams": ["New Orleans Saints"],
        "roof_type": "dome",
        "latitude": 29.9511,
        "longitude": -90.0812,
    },
    {
        "stadium_id": "nfl_metlife_giants_jets",
        "name": "MetLife Stadium",
        "league": "nfl",
        "city": "East Rutherford, NJ",
        "teams": ["New York Giants", "New York Jets"],
        "roof_type": "open",
        "latitude": 40.8128,
        "longitude": -74.0742,
    },
    {
        "stadium_id": "nfl_lincoln_financial_eagles",
        "name": "Lincoln Financial Field",
        "league": "nfl",
        "city": "Philadelphia, PA",
        "teams": ["Philadelphia Eagles"],
        "roof_type": "open",
        "latitude": 39.9008,
        "longitude": -75.1675,
    },
    {
        "stadium_id": "nfl_acrisure_steelers",
        "name": "Acrisure Stadium",
        "league": "nfl",
        "city": "Pittsburgh, PA",
        "teams": ["Pittsburgh Steelers"],
        "roof_type": "open",
        "latitude": 40.4468,
        "longitude": -80.0158,
    },
    {
        "stadium_id": "nfl_levis_49ers",
        "name": "Levi's Stadium",
        "league": "nfl",
        "city": "Santa Clara, CA",
        "teams": ["San Francisco 49ers"],
        "roof_type": "open",
        "latitude": 37.4032,
        "longitude": -121.9698,
    },
    {
        "stadium_id": "nfl_lumen_field_seahawks",
        "name": "Lumen Field",
        "league": "nfl",
        "city": "Seattle, WA",
        "teams": ["Seattle Seahawks"],
        "roof_type": "open",
        "latitude": 47.5952,
        "longitude": -122.3316,
    },
    {
        "stadium_id": "nfl_raymond_james_buccaneers",
        "name": "Raymond James Stadium",
        "league": "nfl",
        "city": "Tampa, FL",
        "teams": ["Tampa Bay Buccaneers"],
        "roof_type": "open",
        "latitude": 27.9759,
        "longitude": -82.5033,
    },
    {
        "stadium_id": "nfl_nissan_stadium_titans",
        "name": "Nissan Stadium",
        "league": "nfl",
        "city": "Nashville, TN",
        "teams": ["Tennessee Titans"],
        "roof_type": "open",
        "latitude": 36.1665,
        "longitude": -86.7713,
    },
    {
        "stadium_id": "nfl_northwest_commanders",
        "name": "Northwest Stadium",
        "league": "nfl",
        "city": "Landover, MD",
        "teams": ["Washington Commanders"],
        "roof_type": "open",
        "latitude": 38.9076,
        "longitude": -76.8645,
    },
]


def scrape_open_meteo_48_stadiums_deep() -> dict[str, Any]:
    """1. Extrae pronóstico horario de 7 días (168h) y altitud para los 48 estadios (18 Liga MX + 30 NFL)."""
    scraper = PitchLabScraplingBase("open_meteo_nflweather")
    base_url = "https://api.open-meteo.com/v1/forecast"

    stadium_forecasts: list[dict[str, Any]] = []
    http_trace: list[dict[str, Any]] = []
    total_hourly_points = 0

    # Consultar en lotes de 12 estadios usando coordenadas separadas por coma en Open-Meteo API
    batch_size = 12
    with FetcherSession(impersonate="chrome", stealthy_headers=True) as session:
        for start_idx in range(0, len(STADIUMS_48_CATALOG), batch_size):
            batch = STADIUMS_48_CATALOG[start_idx : start_idx + batch_size]
            lats = ",".join(str(s["latitude"]) for s in batch)
            lons = ",".join(str(s["longitude"]) for s in batch)
            query_url = (
                f"{base_url}?latitude={lats}&longitude={lons}"
                "&hourly=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_gusts_10m"
                "&wind_speed_unit=mph&forecast_days=7&timezone=UTC"
            )
            resp = session.get(query_url, timeout=30)
            http_trace.append(
                {
                    "batch_start": start_idx,
                    "batch_count": len(batch),
                    "status": resp.status,
                    "url": query_url,
                }
            )
            parsed = _safe_json_loads(resp.body)
            results_list = parsed if isinstance(parsed, list) else ([parsed] if isinstance(parsed, dict) else [])

            for idx, stadium in enumerate(batch):
                loc_data = results_list[idx] if idx < len(results_list) and isinstance(results_list[idx], dict) else {}
                hourly = loc_data.get("hourly") or {}
                times = hourly.get("time") or []
                temps = hourly.get("temperature_2m") or []
                humidities = hourly.get("relative_humidity_2m") or []
                precips = hourly.get("precipitation") or []
                winds = hourly.get("wind_speed_10m") or []
                gusts = hourly.get("wind_gusts_10m") or []

                hourly_points: list[dict[str, Any]] = []
                for h_idx, ts in enumerate(times[:168]):
                    hourly_points.append(
                        {
                            "timestamp_utc": ts,
                            "temperature_c": temps[h_idx] if h_idx < len(temps) else None,
                            "humidity_pct": humidities[h_idx] if h_idx < len(humidities) else None,
                            "precipitation_mm": precips[h_idx] if h_idx < len(precips) else None,
                            "wind_speed_mph": winds[h_idx] if h_idx < len(winds) else None,
                            "wind_gusts_mph": gusts[h_idx] if h_idx < len(gusts) else None,
                        }
                    )

                total_hourly_points += len(hourly_points)
                elevation_m = float(loc_data.get("elevation") or 0.0)
                roof_type = stadium["roof_type"]
                is_dome_or_retractable = roof_type in ("dome", "retractable")
                clean_winds = [float(w) for w in winds if w is not None]
                clean_gusts = [float(g) for g in gusts if g is not None]
                clean_precips = [float(p) for p in precips if p is not None]
                clean_temps = [float(t) for t in temps if t is not None]

                stadium_forecasts.append(
                    {
                        "stadium_id": stadium["stadium_id"],
                        "stadium_name": stadium["name"],
                        "league": stadium["league"],
                        "city": stadium["city"],
                        "teams": stadium["teams"],
                        "roof_type": roof_type,
                        "is_dome_or_retractable": is_dome_or_retractable,
                        "latitude": loc_data.get("latitude", stadium["latitude"]),
                        "longitude": loc_data.get("longitude", stadium["longitude"]),
                        "elevation_m": elevation_m,
                        "is_high_altitude_gt_1500m": elevation_m >= 1500.0,
                        "max_wind_mph_7d": round(max(clean_winds), 2) if clean_winds else None,
                        "max_gust_mph_7d": round(max(clean_gusts), 2) if clean_gusts else None,
                        "total_precip_mm_7d": round(sum(clean_precips), 2) if clean_precips else 0.0,
                        "min_temp_c_7d": round(min(clean_temps), 2) if clean_temps else None,
                        "max_temp_c_7d": round(max(clean_temps), 2) if clean_temps else None,
                        "nfl_wind_alert_gt_15mph": (not is_dome_or_retractable)
                        and bool(clean_winds and max(clean_winds) >= 15.0),
                        "hourly_points_count": len(hourly_points),
                        "hourly_forecast_7d": hourly_points,
                    }
                )

    liga_mx_count = sum(1 for s in stadium_forecasts if s["league"] == "liga-mx")
    nfl_count = sum(1 for s in stadium_forecasts if s["league"] == "nfl")
    high_alt_count = sum(1 for s in stadium_forecasts if s["is_high_altitude_gt_1500m"])

    payload = {
        "captured_at_utc": utc_now_iso(),
        "source_id": "open_meteo_nflweather",
        "summary": {
            "total_stadiums": len(stadium_forecasts),
            "liga_mx_stadiums": liga_mx_count,
            "nfl_stadiums": nfl_count,
            "high_altitude_stadiums_gt_1500m": high_alt_count,
            "total_hourly_weather_points": total_hourly_points,
        },
        "http_trace": http_trace,
        "stadiums": stadium_forecasts,
    }

    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url=base_url,
        label="open_meteo_48_ligamx_nfl_stadiums_7d",
        extra_meta={
            "record_count": len(stadium_forecasts),
            "total_hourly_weather_points": total_hourly_points,
            "liga_mx_stadiums": liga_mx_count,
            "nfl_stadiums": nfl_count,
            "high_altitude_stadiums_gt_1500m": high_alt_count,
        },
    )
    sha256_val = json.loads(out_path.read_text(encoding="utf-8"))["sha256"]
    return {
        "source_id": scraper.source_id,
        "category": scraper.category,
        "path": str(out_path),
        "stadiums_count": len(stadium_forecasts),
        "hourly_points_count": total_hourly_points,
        "record_count": len(stadium_forecasts),
        "sha256": sha256_val,
    }


# ===========================================================================
# 2. WORLDFOOTBALL (6 SOCCER LEAGUES) + NFLPENALTIES DEEP REFEREES & PENALTIES
# ===========================================================================

WORLDFOOTBALL_LEAGUE_TARGETS: list[tuple[str, str, str]] = [
    (
        "liga-mx",
        "2025-2026-apertura",
        "https://www.worldfootball.net/referees/mex-primera-division-2025-2026-apertura/1/",
    ),
    (
        "liga-mx",
        "2025-2026-clausura",
        "https://www.worldfootball.net/referees/mex-primera-division-2025-2026-clausura/1/",
    ),
    (
        "liga-mx",
        "2024-2025-clausura",
        "https://www.worldfootball.net/referees/mex-primera-division-2024-2025-clausura/1/",
    ),
    (
        "epl",
        "2025-2026",
        "https://www.worldfootball.net/referees/eng-premier-league-2025-2026/1/",
    ),
    (
        "laliga",
        "2025-2026",
        "https://www.worldfootball.net/referees/esp-primera-division-2025-2026/1/",
    ),
    (
        "bundesliga",
        "2025-2026",
        "https://www.worldfootball.net/referees/bundesliga-2025-2026/1/",
    ),
    (
        "serie-a",
        "2025-2026",
        "https://www.worldfootball.net/referees/ita-serie-a-2025-2026/1/",
    ),
    (
        "ligue-1",
        "2025-2026",
        "https://www.worldfootball.net/referees/fra-ligue-1-2025-2026/1/",
    ),
]


def _parse_worldfootball_referees_table(
    response: Any, league_code: str, season_slug: str
) -> list[dict[str, Any]]:
    referees: list[dict[str, Any]] = []
    for tr in response.css("table tr"):
        tds = [c.get_all_text(strip=True) for c in tr.css("td")]
        if len(tds) < 8:
            continue
        name = tds[2] if len(tds) > 2 else ""
        matches_str = tds[4] if len(tds) > 4 else ""
        if not name or not matches_str.isdigit():
            continue

        matches = int(matches_str)
        yellow = int(tds[5]) if len(tds) > 5 and tds[5].isdigit() else 0
        yellow_red = int(tds[6]) if len(tds) > 6 and tds[6].isdigit() else 0
        red = int(tds[7]) if len(tds) > 7 and tds[7].isdigit() else 0
        penalties = int(tds[8]) if len(tds) > 8 and tds[8].isdigit() else 0

        denom = max(1, matches)
        referees.append(
            {
                "league": league_code,
                "season": season_slug,
                "referee_name": name,
                "country": tds[3] if len(tds) > 3 else "",
                "games_officiated": matches,
                "yellow_cards_total": yellow,
                "second_yellow_red_total": yellow_red,
                "direct_red_cards_total": red,
                "penalties_total": penalties,
                "yellow_cards_per_game": round(yellow / denom, 3),
                "red_cards_per_game": round((yellow_red + red) / denom, 3),
                "penalties_per_game": round(penalties / denom, 3),
            }
        )
    return referees


def _parse_nflpenalties_referee_crews(response: Any, season_year: int) -> list[dict[str, Any]]:
    crews: list[dict[str, Any]] = []

    def _to_float(val: str) -> float | None:
        try:
            return float(val)
        except (ValueError, TypeError):
            return None

    for tr in response.css("table tbody tr, table tr"):
        tds = [c.get_all_text(strip=True) for c in tr.css("td")]
        if len(tds) < 12:
            continue
        ref_name = tds[0]
        games_str = tds[1]
        if not ref_name or not games_str.isdigit():
            continue
        crews.append(
            {
                "league": "nfl",
                "season": season_year,
                "referee_name": ref_name,
                "games_officiated": int(games_str),
                "total_penalties": int(tds[2]) if tds[2].isdigit() else None,
                "total_yards": int(tds[3]) if tds[3].isdigit() else None,
                "total_dismissed": int(tds[4]) if tds[4].isdigit() else None,
                "total_flags": int(tds[5]) if tds[5].isdigit() else None,
                "home_penalties_total": int(tds[6]) if tds[6].isdigit() else None,
                "away_penalties_total": int(tds[7]) if tds[7].isdigit() else None,
                "nfl_penalties_per_game": _to_float(tds[8]),
                "nfl_penalty_yards_per_game": _to_float(tds[9]),
                "dismissed_per_game": _to_float(tds[10]),
                "total_flags_per_game": _to_float(tds[11]),
                "home_penalties_per_game": _to_float(tds[12]) if len(tds) > 12 else None,
                "away_penalties_per_game": _to_float(tds[13]) if len(tds) > 13 else None,
            }
        )
    return crews


def _parse_nflpenalties_teams_table(response: Any) -> list[dict[str, Any]]:
    teams: list[dict[str, Any]] = []
    for tr in response.css("table tbody tr, table tr"):
        tds = [c.get_all_text(strip=True) for c in tr.css("td")]
        if len(tds) < 13:
            continue
        team_name = tds[0]
        games_str = tds[1]
        if not team_name or not games_str.isdigit():
            continue
        games = max(1, int(games_str))
        against_count = int(tds[3]) if tds[3].isdigit() else 0
        against_yards = int(tds[4]) if tds[4].isdigit() else 0
        teams.append(
            {
                "team": team_name,
                "games": int(games_str),
                "plays": int(tds[2]) if tds[2].isdigit() else None,
                "penalties_against_count": against_count,
                "penalties_against_yards": against_yards,
                "penalties_beneficiary_count": int(tds[5]) if tds[5].isdigit() else None,
                "beneficiary_yards": int(tds[6]) if len(tds) > 6 and tds[6].isdigit() else None,
                "net_count": int(tds[7]) if len(tds) > 7 and tds[7].lstrip("-").isdigit() else None,
                "net_yards": int(tds[8]) if len(tds) > 8 and tds[8].lstrip("-").isdigit() else None,
                "penalties_per_game": round(against_count / games, 2),
                "penalty_yards_per_game": round(against_yards / games, 2),
            }
        )
    return teams


def _parse_nflpenalties_all_penalties(response: Any) -> list[dict[str, Any]]:
    """Extrae todos los tipos de castigo en `https://www.nflpenalties.com/all-penalties.php`."""
    penalty_types: list[dict[str, Any]] = []

    def _to_float(val: str) -> float | None:
        try:
            return float(val.replace(",", ""))
        except (ValueError, TypeError):
            return None

    def _to_int(val: str) -> int | None:
        cleaned = val.replace(",", "").strip()
        return int(cleaned) if cleaned.lstrip("-").isdigit() else None

    for tr in response.css("table tbody tr"):
        tds = [c.get_all_text(strip=True) for c in tr.css("td")]
        if len(tds) < 9:
            continue
        penalty_name = tds[0]
        count_val = _to_int(tds[1])
        if not penalty_name or count_val is None:
            continue

        home_count = _to_int(tds[7]) or 0
        away_count = _to_int(tds[8]) or 0
        total_ha = max(1, home_count + away_count)

        penalty_types.append(
            {
                "penalty_name": penalty_name,
                "total_count": count_val,
                "count_per_game": _to_float(tds[2]),
                "count_per_play": _to_float(tds[3]),
                "total_yards": _to_int(tds[4]),
                "yards_per_game": _to_float(tds[5]),
                "yards_per_play": _to_float(tds[6]),
                "home_count": home_count,
                "away_count": away_count,
                "home_share_pct": round((home_count / total_ha) * 100.0, 2),
                "away_share_pct": round((away_count / total_ha) * 100.0, 2),
                "fewest_flags_teams": tds[9] if len(tds) > 9 else None,
                "worst_offender_team": tds[10] if len(tds) > 10 else None,
                "biggest_beneficiary_team": tds[11] if len(tds) > 11 else None,
                "smallest_beneficiary_team": tds[12] if len(tds) > 12 else None,
                "offsetting_count": _to_int(tds[13]) if len(tds) > 13 else None,
                "declined_count": _to_int(tds[14]) if len(tds) > 14 else None,
            }
        )
    return penalty_types


def scrape_worldfootball_nflpenalties_deep() -> dict[str, Any]:
    """2. Extrae árbitros de las 6 ligas de fútbol en WorldFootball + desglose profundo de NFLPenalties."""
    scraper = PitchLabScraplingBase("worldfootball_nflpenalties_referees")

    nflp_home_url = "https://www.nflpenalties.com/"
    nflp_refs_2025_url = "https://www.nflpenalties.com/all-referees.php?year=2025"
    nflp_refs_2024_url = "https://www.nflpenalties.com/all-referees.php?year=2024"
    nflp_all_penalties_url = "https://www.nflpenalties.com/all-penalties.php"

    http_trace: list[dict[str, Any]] = []
    soccer_referees: list[dict[str, Any]] = []
    nfl_referee_crews: list[dict[str, Any]] = []
    nfl_team_penalties: list[dict[str, Any]] = []
    nfl_penalty_types: list[dict[str, Any]] = []

    # Paso 1: NFLPenalties vía FetcherSession
    with FetcherSession(impersonate="chrome", stealthy_headers=True) as session:
        resp_home = session.get(nflp_home_url, timeout=25)
        http_trace.append({"url": nflp_home_url, "mode": "FetcherSession", "status": resp_home.status})
        if resp_home.status == 200:
            nfl_team_penalties = _parse_nflpenalties_teams_table(resp_home)

        for yr, ref_url in [(2025, nflp_refs_2025_url), (2024, nflp_refs_2024_url)]:
            resp_refs = session.get(ref_url, timeout=25)
            http_trace.append({"url": ref_url, "mode": "FetcherSession", "status": resp_refs.status})
            if resp_refs.status == 200:
                nfl_referee_crews.extend(_parse_nflpenalties_referee_crews(resp_refs, yr))

        resp_pen_types = session.get(nflp_all_penalties_url, timeout=25)
        http_trace.append(
            {"url": nflp_all_penalties_url, "mode": "FetcherSession", "status": resp_pen_types.status}
        )
        if resp_pen_types.status == 200:
            nfl_penalty_types = _parse_nflpenalties_all_penalties(resp_pen_types)

    # Paso 2: WorldFootball 6 ligas vía StealthySession (resuelve Cloudflare)
    with StealthySession(
        headless=True, solve_cloudflare=True, network_idle=True, block_ads=True, timeout=45000
    ) as stealth_session:
        for league_code, season_slug, wf_url in WORLDFOOTBALL_LEAGUE_TARGETS:
            try:
                wf_page = stealth_session.fetch(wf_url, google_search=False)
                parsed_refs = _parse_worldfootball_referees_table(wf_page, league_code, season_slug)
                http_trace.append(
                    {
                        "url": wf_url,
                        "league": league_code,
                        "season": season_slug,
                        "mode": "StealthySession",
                        "status": getattr(wf_page, "status", None),
                        "referees_extracted": len(parsed_refs),
                    }
                )
                soccer_referees.extend(parsed_refs)
            except Exception as exc:
                http_trace.append(
                    {
                        "url": wf_url,
                        "league": league_code,
                        "season": season_slug,
                        "mode": "StealthySession",
                        "error": str(exc),
                    }
                )

    leagues_counts: dict[str, int] = {}
    for ref in soccer_referees:
        lg = ref["league"]
        leagues_counts[lg] = leagues_counts.get(lg, 0) + 1

    total_records = (
        len(soccer_referees)
        + len(nfl_referee_crews)
        + len(nfl_team_penalties)
        + len(nfl_penalty_types)
    )

    payload = {
        "captured_at_utc": utc_now_iso(),
        "source_id": "worldfootball_nflpenalties_referees",
        "summary": {
            "total_records": total_records,
            "soccer_referees_count": len(soccer_referees),
            "soccer_leagues_covered": sorted(leagues_counts.keys()),
            "soccer_referees_by_league": leagues_counts,
            "nfl_referee_crews_count": len(nfl_referee_crews),
            "nfl_team_penalties_count": len(nfl_team_penalties),
            "nfl_penalty_types_count": len(nfl_penalty_types),
        },
        "http_trace": http_trace,
        "soccer_referees": soccer_referees,
        "nfl_referee_crews": nfl_referee_crews,
        "nfl_team_penalties": nfl_team_penalties,
        "nfl_penalty_types": nfl_penalty_types,
    }

    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url=WORLDFOOTBALL_LEAGUE_TARGETS[0][2],
        label="referees_6leagues_and_nfl_penalties_deep",
        extra_meta=payload["summary"],
    )
    sha256_val = json.loads(out_path.read_text(encoding="utf-8"))["sha256"]
    return {
        "source_id": scraper.source_id,
        "category": scraper.category,
        "path": str(out_path),
        "record_count": total_records,
        "soccer_referees_count": len(soccer_referees),
        "soccer_leagues_counts": leagues_counts,
        "nfl_referee_crews_count": len(nfl_referee_crews),
        "nfl_team_penalties_count": len(nfl_team_penalties),
        "nfl_penalty_types_count": len(nfl_penalty_types),
        "sha256": sha256_val,
    }


# ===========================================================================
# 3. ACTION NETWORK MULTI-SPORT & MULTI-LEAGUE SPLITS & ODDS DEEP
# ===========================================================================

ACTION_NETWORK_DEEP_URLS: list[str] = [
    "https://www.actionnetwork.com/nfl/public-betting",
    "https://www.actionnetwork.com/nfl/odds",
    "https://www.actionnetwork.com/ncaaf/public-betting",
    "https://www.actionnetwork.com/ncaaf/odds",
    "https://www.actionnetwork.com/nhl/public-betting",
    "https://www.actionnetwork.com/nhl/odds",
    "https://www.actionnetwork.com/nba/public-betting",
    "https://www.actionnetwork.com/nba/odds",
    "https://www.actionnetwork.com/soccer/public-betting",
    "https://www.actionnetwork.com/soccer/odds",
    "https://www.actionnetwork.com/champions-league/odds",
    "https://www.actionnetwork.com/premier-league/odds",
    "https://www.actionnetwork.com/la-liga/odds",
    "https://www.actionnetwork.com/bundesliga/odds",
    "https://www.actionnetwork.com/serie-a/odds",
    "https://www.actionnetwork.com/ligue-1/odds",
    "https://www.actionnetwork.com/mlb/public-betting",
]


def _normalize_action_network_game_deep(g: dict[str, Any], source_url: str) -> dict[str, Any]:
    teams = g.get("teams") or []
    home_id = g.get("home_team_id")
    away_id = g.get("away_team_id")
    home_team = next((t for t in teams if t.get("id") == home_id), teams[0] if teams else {})
    away_team = next((t for t in teams if t.get("id") == away_id), teams[1] if len(teams) > 1 else {})

    markets = g.get("markets") or {}
    odds_list = g.get("odds") or []
    extracted_markets: list[dict[str, Any]] = []

    if isinstance(markets, dict):
        for book_id, book_data in markets.items():
            if not isinstance(book_data, dict):
                continue
            event_mkts = book_data.get("event") or book_data
            if not isinstance(event_mkts, dict):
                continue
            for mkt_type, outcomes in event_mkts.items():
                if not isinstance(outcomes, list):
                    continue
                for out in outcomes:
                    if not isinstance(out, dict):
                        continue
                    bet_info = out.get("bet_info") or {}
                    tickets = bet_info.get("tickets") or {}
                    money = bet_info.get("money") or {}
                    t_pct = tickets.get("percent")
                    m_pct = money.get("percent")
                    divergence = (
                        round(float(m_pct) - float(t_pct), 2)
                        if t_pct is not None and m_pct is not None
                        else None
                    )
                    extracted_markets.append(
                        {
                            "book_id": str(book_id),
                            "market_type": mkt_type,
                            "side": out.get("side"),
                            "value": out.get("value"),
                            "odds": out.get("odds"),
                            "is_live": out.get("is_live"),
                            "tickets_pct": t_pct,
                            "tickets_value": tickets.get("value"),
                            "money_pct": m_pct,
                            "money_value": money.get("value"),
                            "money_minus_tickets_pct": divergence,
                            "reverse_line_movement_signal": bool(
                                divergence is not None and divergence >= 15.0
                            ),
                        }
                    )

    if not extracted_markets and isinstance(odds_list, list):
        for odd in odds_list:
            if isinstance(odd, dict):
                extracted_markets.append(
                    {
                        "book_id": str(odd.get("book_id")),
                        "market_type": odd.get("type", "game"),
                        "ml_home": odd.get("ml_home"),
                        "ml_away": odd.get("ml_away"),
                        "ml_draw": odd.get("ml_draw"),
                        "spread_home": odd.get("spread_home"),
                        "spread_away": odd.get("spread_away"),
                        "total": odd.get("total"),
                        "ml_home_tickets_pct": odd.get("ml_home_public"),
                        "ml_home_money_pct": odd.get("ml_home_money"),
                        "spread_home_tickets_pct": odd.get("spread_home_public"),
                        "spread_home_money_pct": odd.get("spread_home_money"),
                        "total_over_tickets_pct": odd.get("total_over_public"),
                        "total_over_money_pct": odd.get("total_over_money"),
                    }
                )

    return {
        "game_id": g.get("id"),
        "league_name": g.get("league_name"),
        "sport": source_url.split("actionnetwork.com/")[-1].split("/")[0],
        "season": g.get("season"),
        "week": g.get("week"),
        "start_time": g.get("start_time"),
        "status": g.get("status"),
        "num_bets": g.get("num_bets"),
        "home_team": home_team.get("full_name") or home_team.get("display_name"),
        "away_team": away_team.get("full_name") or away_team.get("display_name"),
        "home_abbr": home_team.get("abbr"),
        "away_abbr": away_team.get("abbr"),
        "source_url": source_url,
        "markets_count": len(extracted_markets),
        "markets": extracted_markets[:80],
    }


def scrape_action_network_splits_deep() -> dict[str, Any]:
    """3. Extrae juegos, líneas de casas de apuestas y splits de tickets/dinero multi-deporte en Action Network."""
    scraper = PitchLabScraplingBase("action_network_splits")

    pages_extracted: list[dict[str, Any]] = []
    all_games: list[dict[str, Any]] = []

    with FetcherSession(impersonate="chrome", stealthy_headers=True) as session:
        for url in ACTION_NETWORK_DEEP_URLS:
            try:
                resp = session.get(url, timeout=25)
                title = (resp.css("title::text").get() or "").strip()
                next_data_raw = resp.css("script#__NEXT_DATA__::text").get()
                page_games: list[dict[str, Any]] = []
                league_name = None

                if next_data_raw:
                    parsed = _safe_json_loads(next_data_raw)
                    if isinstance(parsed, dict):
                        page_props = (parsed.get("props") or {}).get("pageProps") or {}
                        scoreboard = page_props.get("scoreboardResponse") or {}
                        raw_games = scoreboard.get("games") or page_props.get("games") or []
                        league_name = page_props.get("league")
                        if isinstance(raw_games, list):
                            for g in raw_games:
                                if isinstance(g, dict):
                                    page_games.append(_normalize_action_network_game_deep(g, url))

                pages_extracted.append(
                    {
                        "url": url,
                        "status": resp.status,
                        "title": title,
                        "league": league_name,
                        "games_extracted": len(page_games),
                        "markets_extracted": sum(pg["markets_count"] for pg in page_games),
                    }
                )
                all_games.extend(page_games)
            except Exception as exc:
                pages_extracted.append({"url": url, "error": str(exc)})

    games_by_id: dict[Any, dict[str, Any]] = {}
    for g in all_games:
        gid = g.get("game_id") or f"{g.get('away_team')}_{g.get('home_team')}_{g.get('start_time')}"
        if gid not in games_by_id or g.get("markets_count", 0) > games_by_id[gid].get("markets_count", 0):
            games_by_id[gid] = g

    unique_games = list(games_by_id.values())
    total_book_markets = sum(g.get("markets_count", 0) for g in unique_games)
    total_records = len(unique_games) + total_book_markets

    payload = {
        "captured_at_utc": utc_now_iso(),
        "source_id": "action_network_splits",
        "target_urls": ACTION_NETWORK_DEEP_URLS,
        "summary": {
            "pages_fetched": len(pages_extracted),
            "unique_games_extracted": len(unique_games),
            "total_game_records_across_views": len(all_games),
            "total_bookmaker_market_outcomes": total_book_markets,
            "total_records": total_records,
        },
        "pages": pages_extracted,
        "games": unique_games,
    }

    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url=ACTION_NETWORK_DEEP_URLS[0],
        label="action_network_multisport_splits_deep",
        extra_meta=payload["summary"],
    )
    sha256_val = json.loads(out_path.read_text(encoding="utf-8"))["sha256"]
    return {
        "source_id": scraper.source_id,
        "category": scraper.category,
        "path": str(out_path),
        "unique_games_count": len(unique_games),
        "total_bookmaker_market_outcomes": total_book_markets,
        "record_count": total_records,
        "sha256": sha256_val,
    }


# ===========================================================================
# 4. SMARKETS EXCHANGE EVENTS, MARKETS & QUOTES DEEP (BIDS / OFFERS LIQUIDITY)
# ===========================================================================

SMARKETS_EVENT_ENDPOINTS: list[tuple[str, str]] = [
    (
        "football_match",
        "https://api.smarkets.com/v3/events/?state=upcoming&type=football_match&limit=100",
    ),
    (
        "american_football_match",
        "https://api.smarkets.com/v3/events/?state=upcoming&type=american_football_match&limit=50",
    ),
    (
        "ice_hockey_match",
        "https://api.smarkets.com/v3/events/?state=upcoming&type=ice_hockey_match&limit=50",
    ),
]


def _extract_json_from_page_or_resp(obj: Any, session: Any = None, target_url: str = "") -> Any | None:
    """Extrae JSON tanto de una respuesta FetcherSession como de un documento o red de AsyncStealthySession."""
    try:
        raw_all = obj.get_all_text(strip=True)
        if raw_all and (raw_all.startswith("{") or raw_all.startswith("[")):
            parsed = _safe_json_loads(raw_all)
            if parsed is not None:
                return parsed
    except Exception:
        pass
    try:
        pre_nodes = obj.css("pre")
        if pre_nodes:
            pre_txt = pre_nodes[0].get_all_text(strip=True)
            parsed = _safe_json_loads(pre_txt)
            if parsed is not None:
                return parsed
    except Exception:
        pass
    direct = _safe_json_loads(_response_text(obj))
    if direct is not None:
        return direct
    if session is not None and hasattr(session, "network"):
        for net_resp in reversed(session.network.search(limit=None)):
            if target_url and target_url not in net_resp.url:
                continue
            if net_resp.body:
                parsed = _safe_json_loads(net_resp.body)
                if parsed is not None:
                    return parsed
    return None


async def _scrape_smarkets_exchange_async() -> tuple[
    list[dict[str, Any]],
    list[dict[str, Any]],
    list[dict[str, Any]],
    list[dict[str, Any]],
]:
    http_trace: list[dict[str, Any]] = []
    events_extracted: list[dict[str, Any]] = []
    markets_extracted: list[dict[str, Any]] = []
    quotes_extracted: list[dict[str, Any]] = []

    # Paso 1: Intentar FetcherSession primero según especificación
    with FetcherSession(impersonate="chrome", stealthy_headers=True) as session:
        for ev_type, url in SMARKETS_EVENT_ENDPOINTS:
            try:
                resp = session.get(url, timeout=20)
                parsed = _extract_json_from_page_or_resp(resp)
                evs = parsed.get("events", []) if isinstance(parsed, dict) else []
                http_trace.append(
                    {
                        "url": url,
                        "event_type": ev_type,
                        "mode": "FetcherSession",
                        "status": resp.status,
                        "events_count": len(evs),
                    }
                )
                for ev in evs:
                    if isinstance(ev, dict):
                        events_extracted.append(
                            {
                                "event_id": str(ev.get("id")),
                                "name": ev.get("name"),
                                "short_name": ev.get("short_name"),
                                "full_slug": ev.get("full_slug"),
                                "start_datetime": ev.get("start_datetime"),
                                "state": ev.get("state"),
                                "type": ev.get("type", ev_type),
                                "bettable": ev.get("bettable"),
                                "parent_id": str(ev.get("parent_id")),
                            }
                        )
            except Exception as exc:
                http_trace.append({"url": url, "mode": "FetcherSession", "error": str(exc)})

    # Paso 2: AsyncStealthySession(solve_cloudflare=True, record_requests=True) para eventos + markets + quotes
    async with AsyncStealthySession(
        headless=True,
        solve_cloudflare=True,
        record_requests=True,
        block_ads=True,
        timeout=45000,
        max_recorded_requests=1000,
    ) as stealth:
        if not events_extracted:
            for ev_type, url in SMARKETS_EVENT_ENDPOINTS:
                try:
                    page = await stealth.fetch(
                        url, wait_until="domcontentloaded", wait=2500, google_search=False
                    )
                    parsed = _extract_json_from_page_or_resp(page, stealth, f"type={ev_type}")
                    evs = parsed.get("events", []) if isinstance(parsed, dict) else []
                    http_trace.append(
                        {
                            "url": url,
                            "event_type": ev_type,
                            "mode": "AsyncStealthySession",
                            "status": getattr(page, "status", None),
                            "events_count": len(evs),
                        }
                    )
                    for ev in evs:
                        if isinstance(ev, dict):
                            events_extracted.append(
                                {
                                    "event_id": str(ev.get("id")),
                                    "name": ev.get("name"),
                                    "short_name": ev.get("short_name"),
                                    "full_slug": ev.get("full_slug"),
                                    "start_datetime": ev.get("start_datetime"),
                                    "state": ev.get("state"),
                                    "type": ev.get("type", ev_type),
                                    "bettable": ev.get("bettable"),
                                    "parent_id": str(ev.get("parent_id")),
                                }
                            )
                except Exception as exc:
                    http_trace.append(
                        {"url": url, "mode": "AsyncStealthySession", "error": str(exc)}
                    )

        # Seleccionar lotes de eventos próximos (fútbol, NFL/fútbol americano y hockey) para extraer `/markets/`
        football_ids = [e["event_id"] for e in events_extracted if e["type"] == "football_match"][:15]
        am_football_ids = [
            e["event_id"] for e in events_extracted if e["type"] == "american_football_match"
        ][:10]
        hockey_ids = [e["event_id"] for e in events_extracted if e["type"] == "ice_hockey_match"][:10]
        selected_event_ids = football_ids + am_football_ids + hockey_ids

        for batch_start in range(0, len(selected_event_ids), 10):
            batch_eids = selected_event_ids[batch_start : batch_start + 10]
            if not batch_eids:
                continue
            eid_csv = ",".join(batch_eids)
            mkts_url = f"https://api.smarkets.com/v3/events/{eid_csv}/markets/"
            try:
                mkt_page = await stealth.fetch(
                    mkts_url, wait_until="domcontentloaded", wait=2000, google_search=False
                )
                mkt_json = _extract_json_from_page_or_resp(mkt_page, stealth, eid_csv)
                mkts_list = mkt_json.get("markets", []) if isinstance(mkt_json, dict) else []
                http_trace.append(
                    {
                        "url": mkts_url,
                        "mode": "AsyncStealthySession",
                        "status": getattr(mkt_page, "status", None),
                        "markets_count": len(mkts_list),
                    }
                )
                for m in mkts_list:
                    if isinstance(m, dict):
                        markets_extracted.append(
                            {
                                "market_id": str(m.get("id")),
                                "event_id": str(m.get("event_id")),
                                "name": m.get("name"),
                                "slug": m.get("slug"),
                                "market_type": (m.get("market_type") or {}).get("name")
                                if isinstance(m.get("market_type"), dict)
                                else m.get("market_type"),
                                "state": m.get("state"),
                                "bettable": m.get("bettable"),
                                "inplay_enabled": m.get("inplay_enabled"),
                                "complete": m.get("complete"),
                            }
                        )
            except Exception as exc:
                http_trace.append(
                    {"url": mkts_url, "mode": "AsyncStealthySession", "error": str(exc)}
                )

        # Priorizar mercados principales (Winner, Full-time result, Over/Under, To win, Moneyline, Spread)
        priority_keywords = (
            "winner",
            "full-time",
            "over/under",
            "to win",
            "moneyline",
            "handicap",
            "btts",
            "draw",
        )
        priority_markets = [
            m["market_id"]
            for m in markets_extracted
            if any(
                k in (m.get("name") or "").lower() or k in (m.get("slug") or "").lower()
                for k in priority_keywords
            )
        ]
        if len(priority_markets) < 45:
            for m in markets_extracted:
                if m["market_id"] not in priority_markets:
                    priority_markets.append(m["market_id"])

        selected_market_ids = priority_markets[:60]
        for q_start in range(0, len(selected_market_ids), 15):
            batch_mids = selected_market_ids[q_start : q_start + 15]
            if not batch_mids:
                continue
            mid_csv = ",".join(batch_mids)
            quotes_url = f"https://api.smarkets.com/v3/markets/{mid_csv}/quotes/"
            try:
                q_page = await stealth.fetch(
                    quotes_url, wait_until="domcontentloaded", wait=2000, google_search=False
                )
                q_json = _extract_json_from_page_or_resp(q_page, stealth, mid_csv)
                http_trace.append(
                    {
                        "url": quotes_url,
                        "mode": "AsyncStealthySession",
                        "status": getattr(q_page, "status", None),
                        "contracts_quoted": len(q_json) if isinstance(q_json, dict) else 0,
                    }
                )
                if isinstance(q_json, dict):
                    for contract_id, quote_data in q_json.items():
                        if not isinstance(quote_data, dict):
                            continue
                        bids = quote_data.get("bids") or []
                        offers = quote_data.get("offers") or []
                        if not bids and not offers:
                            continue
                        best_bid_bps = (
                            bids[0].get("price") if bids and isinstance(bids[0], dict) else None
                        )
                        best_offer_bps = (
                            offers[0].get("price")
                            if offers and isinstance(offers[0], dict)
                            else None
                        )
                        best_back_decimal = (
                            round(10000.0 / float(best_offer_bps), 4)
                            if best_offer_bps and float(best_offer_bps) > 0
                            else None
                        )
                        best_lay_decimal = (
                            round(10000.0 / float(best_bid_bps), 4)
                            if best_bid_bps and float(best_bid_bps) > 0
                            else None
                        )
                        total_bid_qty = sum(
                            int(b.get("quantity", 0)) for b in bids if isinstance(b, dict)
                        )
                        total_offer_qty = sum(
                            int(o.get("quantity", 0)) for o in offers if isinstance(o, dict)
                        )
                        quotes_extracted.append(
                            {
                                "contract_id": str(contract_id),
                                "best_bid_implied_bps": best_bid_bps,
                                "best_offer_implied_bps": best_offer_bps,
                                "best_back_decimal_odds": best_back_decimal,
                                "best_lay_decimal_odds": best_lay_decimal,
                                "total_bid_quantity_units": total_bid_qty,
                                "total_offer_quantity_units": total_offer_qty,
                                "bids_depth": bids[:5],
                                "offers_depth": offers[:5],
                            }
                        )
            except Exception as exc:
                http_trace.append(
                    {"url": quotes_url, "mode": "AsyncStealthySession", "error": str(exc)}
                )

    return http_trace, events_extracted, markets_extracted, quotes_extracted


def scrape_smarkets_exchange_deep() -> dict[str, Any]:
    """4. Extrae eventos multi-deporte, mercados y cotizaciones back/lay (`bids`/`offers`) en Smarkets API v3."""
    scraper = PitchLabScraplingBase("betfair_smarkets_exchange")
    http_trace, events_extracted, markets_extracted, quotes_extracted = asyncio.run(
        _scrape_smarkets_exchange_async()
    )

    events_by_type: dict[str, int] = {}
    for ev in events_extracted:
        t = ev.get("type", "unknown")
        events_by_type[t] = events_by_type.get(t, 0) + 1

    total_records = len(events_extracted) + len(markets_extracted) + len(quotes_extracted)

    payload = {
        "captured_at_utc": utc_now_iso(),
        "source_id": "betfair_smarkets_exchange",
        "target_urls": [u for _, u in SMARKETS_EVENT_ENDPOINTS],
        "summary": {
            "events_extracted_count": len(events_extracted),
            "events_by_sport_type": events_by_type,
            "markets_extracted_count": len(markets_extracted),
            "active_contract_quotes_count": len(quotes_extracted),
            "total_records": total_records,
        },
        "http_trace": http_trace,
        "exchange_events": events_extracted,
        "exchange_markets": markets_extracted[:400],
        "exchange_quotes": quotes_extracted,
    }

    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url=SMARKETS_EVENT_ENDPOINTS[0][1],
        label="smarkets_exchange_events_markets_quotes_deep",
        extra_meta=payload["summary"],
    )
    sha256_val = json.loads(out_path.read_text(encoding="utf-8"))["sha256"]
    return {
        "source_id": scraper.source_id,
        "category": scraper.category,
        "path": str(out_path),
        "events_count": len(events_extracted),
        "markets_count": len(markets_extracted),
        "quotes_count": len(quotes_extracted),
        "record_count": total_records,
        "sha256": sha256_val,
    }


def run_wave3_deep_odds_env_referees(only_source: str = "all") -> list[dict[str, Any]]:
    """Ejecuta las 4 extracciones profundas de Ola 3 y devuelve el resumen."""
    results: list[dict[str, Any]] = []

    if only_source in ("all", "open_meteo_nflweather"):
        print("-> [1/4] Extrayendo Open-Meteo 48 Estadios (18 Liga MX + 30 NFL, 7d 168h)...")
        res = scrape_open_meteo_48_stadiums_deep()
        results.append(res)
        print(
            f"   OK open_meteo_nflweather: stadiums={res['stadiums_count']} "
            f"(hourly_pts={res['hourly_points_count']}) | sha256={res['sha256'][:12]}"
        )

    if only_source in ("all", "worldfootball_nflpenalties_referees"):
        print("-> [2/4] Extrayendo WorldFootball (6 ligas) + NFLPenalties (crews, teams, all-penalties)...")
        res = scrape_worldfootball_nflpenalties_deep()
        results.append(res)
        print(
            f"   OK worldfootball_nflpenalties_referees: records={res['record_count']} "
            f"(soccer_refs={res['soccer_referees_count']}, nfl_pen_types={res['nfl_penalty_types_count']}) "
            f"| sha256={res['sha256'][:12]}"
        )

    if only_source in ("all", "action_network_splits"):
        print("-> [3/4] Extrayendo Action Network Splits & Odds Multi-Deporte...")
        res = scrape_action_network_splits_deep()
        results.append(res)
        print(
            f"   OK action_network_splits: games={res['unique_games_count']} "
            f"(market_outcomes={res['total_bookmaker_market_outcomes']}) | sha256={res['sha256'][:12]}"
        )

    if only_source in ("all", "betfair_smarkets_exchange"):
        print("-> [4/4] Extrayendo Smarkets Exchange Events, Markets & Quotes (Back/Lay Liquidity)...")
        res = scrape_smarkets_exchange_deep()
        results.append(res)
        print(
            f"   OK betfair_smarkets_exchange: events={res['events_count']}, "
            f"markets={res['markets_count']}, quotes={res['quotes_count']} | sha256={res['sha256'][:12]}"
        )

    return results


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Wave 3 Deep Scraper: Open-Meteo 48 Stadiums, 6-League + NFL Referees, Action Network Splits, Smarkets Exchange"
    )
    parser.add_argument(
        "--source",
        default="all",
        choices=[
            "all",
            "open_meteo_nflweather",
            "worldfootball_nflpenalties_referees",
            "action_network_splits",
            "betfair_smarkets_exchange",
        ],
        help="Fuente específica a ejecutar o 'all'",
    )
    args = parser.parse_args()
    summary = run_wave3_deep_odds_env_referees(args.source)
    print("\n=== RESUMEN WAVE 3 DEEP EXTRACTION ===")
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
