"""Scraper Profundo Ola 4 (Wave 4 European Stadiums, Pinnacle Multi-League & RotoWire All-Leagues) con Scrapling.

Cubre:
1. `open_meteo_nflweather` (`environment_referees`):
   - 60 estadios de las 5 grandes ligas europeas (20 EPL + 10 LaLiga + 10 Bundesliga + 10 Serie A + 10 Ligue 1).
   - Pronóstico horario de 7 días (`168h` por estadio = `10,080` puntos horarios) con temperatura, humedad, precipitación, viento (mph), ráfagas (mph) y elevación (m).
   - Label: `open_meteo_60_european_stadiums_7d`.
2. `pinnacle` (`odds_casinos`):
   - Captura profunda vía `AsyncStealthySession(headless=True, solve_cloudflare=True, record_requests=True)` sobre 10 ligas/deportes (EPL, LaLiga, Bundesliga, Serie A, Ligue 1, Champions League, Liga MX, NFL, NBA, NHL) extrayendo matchups y mercados straight/spread/totals de Arcadia Guest API + DOM.
   - Label: `pinnacle_multileague_europe_us_sports_deep`.
3. `rotowire_lineups_injuries` (`injuries_lineups`):
   - Extracción multi-liga y multi-deporte vía `FetcherSession(impersonate="chrome", stealthy_headers=True)` en RotoWire (`EPL`, `LIGA`, `BUND`, `SERI`, `FRAN`, `UCL`, `LMX`, `NBA`, `NHL`, más tablas JSON de lesiones de NFL, NBA y NHL).
   - Label: `rotowire_all_leagues_lineups_and_injuries_deep`.
"""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
import re
import sys
from typing import Any

from scrapling.fetchers import AsyncStealthySession, FetcherSession
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


def _american_to_decimal(american: float | int | None) -> float | None:
    if american is None:
        return None
    try:
        val = float(american)
    except (TypeError, ValueError):
        return None
    if val == 0:
        return None
    if val > 0:
        return round(1.0 + (val / 100.0), 4)
    return round(1.0 + (100.0 / abs(val)), 4)


# ===========================================================================
# 1. OPEN-METEO 60 EUROPEAN TOP-5 LEAGUE STADIUMS (7-DAY HOURLY FORECAST)
# ===========================================================================

EUROPEAN_60_STADIUMS_CATALOG: list[dict[str, Any]] = [
    # --- 20 Premier League (EPL) ---
    {"stadium_id": "epl_emirates_arsenal", "name": "Emirates Stadium", "league": "epl", "city": "London", "teams": ["Arsenal"], "roof_type": "open", "latitude": 51.5549, "longitude": -0.1084},
    {"stadium_id": "epl_villa_park_aston_villa", "name": "Villa Park", "league": "epl", "city": "Birmingham", "teams": ["Aston Villa"], "roof_type": "open", "latitude": 52.5092, "longitude": -1.8847},
    {"stadium_id": "epl_vitality_bournemouth", "name": "Vitality Stadium (Dean Court)", "league": "epl", "city": "Bournemouth", "teams": ["Bournemouth"], "roof_type": "open", "latitude": 50.7352, "longitude": -1.8383},
    {"stadium_id": "epl_gtech_brentford", "name": "Gtech Community Stadium", "league": "epl", "city": "London", "teams": ["Brentford"], "roof_type": "open", "latitude": 51.4908, "longitude": -0.2886},
    {"stadium_id": "epl_amex_brighton", "name": "American Express Stadium", "league": "epl", "city": "Brighton", "teams": ["Brighton & Hove Albion"], "roof_type": "open", "latitude": 50.8616, "longitude": -0.0837},
    {"stadium_id": "epl_stamford_bridge_chelsea", "name": "Stamford Bridge", "league": "epl", "city": "London", "teams": ["Chelsea"], "roof_type": "open", "latitude": 51.4817, "longitude": -0.1910},
    {"stadium_id": "epl_selhurst_park_crystal_palace", "name": "Selhurst Park", "league": "epl", "city": "London", "teams": ["Crystal Palace"], "roof_type": "open", "latitude": 51.3983, "longitude": -0.0856},
    {"stadium_id": "epl_goodison_everton", "name": "Goodison Park / Everton Stadium", "league": "epl", "city": "Liverpool", "teams": ["Everton"], "roof_type": "open", "latitude": 53.4388, "longitude": -2.9663},
    {"stadium_id": "epl_craven_cottage_fulham", "name": "Craven Cottage", "league": "epl", "city": "London", "teams": ["Fulham"], "roof_type": "open", "latitude": 51.4749, "longitude": -0.2217},
    {"stadium_id": "epl_portman_road_ipswich", "name": "Portman Road", "league": "epl", "city": "Ipswich", "teams": ["Ipswich Town"], "roof_type": "open", "latitude": 52.0544, "longitude": 1.1456},
    {"stadium_id": "epl_king_power_leicester", "name": "King Power Stadium", "league": "epl", "city": "Leicester", "teams": ["Leicester City"], "roof_type": "open", "latitude": 52.6204, "longitude": -1.1422},
    {"stadium_id": "epl_anfield_liverpool", "name": "Anfield", "league": "epl", "city": "Liverpool", "teams": ["Liverpool"], "roof_type": "open", "latitude": 53.4308, "longitude": -2.9608},
    {"stadium_id": "epl_etihad_man_city", "name": "Etihad Stadium", "league": "epl", "city": "Manchester", "teams": ["Manchester City"], "roof_type": "open", "latitude": 53.4831, "longitude": -2.2004},
    {"stadium_id": "epl_old_trafford_man_utd", "name": "Old Trafford", "league": "epl", "city": "Manchester", "teams": ["Manchester United"], "roof_type": "open", "latitude": 53.4631, "longitude": -2.2913},
    {"stadium_id": "epl_st_james_park_newcastle", "name": "St James' Park", "league": "epl", "city": "Newcastle upon Tyne", "teams": ["Newcastle United"], "roof_type": "open", "latitude": 54.9756, "longitude": -1.6217},
    {"stadium_id": "epl_city_ground_nottingham_forest", "name": "The City Ground", "league": "epl", "city": "Nottingham", "teams": ["Nottingham Forest"], "roof_type": "open", "latitude": 52.9400, "longitude": -1.1328},
    {"stadium_id": "epl_st_marys_southampton", "name": "St Mary's Stadium", "league": "epl", "city": "Southampton", "teams": ["Southampton"], "roof_type": "open", "latitude": 50.9058, "longitude": -1.3911},
    {"stadium_id": "epl_tottenham_hotspur_spurs", "name": "Tottenham Hotspur Stadium", "league": "epl", "city": "London", "teams": ["Tottenham Hotspur"], "roof_type": "retractable", "latitude": 51.6042, "longitude": -0.0662},
    {"stadium_id": "epl_london_stadium_west_ham", "name": "London Stadium", "league": "epl", "city": "London", "teams": ["West Ham United"], "roof_type": "open", "latitude": 51.5387, "longitude": -0.0166},
    {"stadium_id": "epl_molineux_wolves", "name": "Molineux Stadium", "league": "epl", "city": "Wolverhampton", "teams": ["Wolverhampton Wanderers"], "roof_type": "open", "latitude": 52.5902, "longitude": -2.1304},

    # --- 10 LaLiga (Spain) ---
    {"stadium_id": "laliga_santiago_bernabeu_real_madrid", "name": "Estadio Santiago Bernabéu", "league": "laliga", "city": "Madrid", "teams": ["Real Madrid"], "roof_type": "retractable", "latitude": 40.4531, "longitude": -3.6883},
    {"stadium_id": "laliga_lluis_companys_camp_nou_barcelona", "name": "Estadi Olímpic Lluís Companys / Spotify Camp Nou", "league": "laliga", "city": "Barcelona", "teams": ["Barcelona"], "roof_type": "open", "latitude": 41.3648, "longitude": 2.1557},
    {"stadium_id": "laliga_metropolitano_atletico", "name": "Riyadh Air Metropolitano", "league": "laliga", "city": "Madrid", "teams": ["Atlético de Madrid"], "roof_type": "open", "latitude": 40.4362, "longitude": -3.5995},
    {"stadium_id": "laliga_san_mames_athletic", "name": "Estadio San Mamés", "league": "laliga", "city": "Bilbao", "teams": ["Athletic Club"], "roof_type": "open", "latitude": 43.2641, "longitude": -2.9494},
    {"stadium_id": "laliga_reale_arena_real_sociedad", "name": "Reale Arena (Anoeta)", "league": "laliga", "city": "San Sebastián", "teams": ["Real Sociedad"], "roof_type": "open", "latitude": 43.3014, "longitude": -1.9736},
    {"stadium_id": "laliga_la_ceramica_villarreal", "name": "Estadio de la Cerámica", "league": "laliga", "city": "Villarreal", "teams": ["Villarreal"], "roof_type": "open", "latitude": 39.9442, "longitude": -0.1036},
    {"stadium_id": "laliga_benito_villamarin_betis", "name": "Estadio Benito Villamarín", "league": "laliga", "city": "Sevilla", "teams": ["Real Betis"], "roof_type": "open", "latitude": 37.3564, "longitude": -5.9817},
    {"stadium_id": "laliga_sanchez_pizjuan_sevilla", "name": "Estadio Ramón Sánchez-Pizjuán", "league": "laliga", "city": "Sevilla", "teams": ["Sevilla"], "roof_type": "open", "latitude": 37.3840, "longitude": -5.9706},
    {"stadium_id": "laliga_mestalla_valencia", "name": "Estadio de Mestalla", "league": "laliga", "city": "Valencia", "teams": ["Valencia"], "roof_type": "open", "latitude": 39.4747, "longitude": -0.3586},
    {"stadium_id": "laliga_montilivi_girona", "name": "Estadi Montilivi", "league": "laliga", "city": "Girona", "teams": ["Girona"], "roof_type": "open", "latitude": 41.9614, "longitude": 2.8286},

    # --- 10 Bundesliga (Germany) ---
    {"stadium_id": "bundesliga_allianz_arena_bayern", "name": "Allianz Arena", "league": "bundesliga", "city": "Munich", "teams": ["Bayern Munich"], "roof_type": "open", "latitude": 48.2188, "longitude": 11.6247},
    {"stadium_id": "bundesliga_signal_iduna_dortmund", "name": "Signal Iduna Park", "league": "bundesliga", "city": "Dortmund", "teams": ["Borussia Dortmund"], "roof_type": "open", "latitude": 51.4926, "longitude": 7.4519},
    {"stadium_id": "bundesliga_bayarena_leverkusen", "name": "BayArena", "league": "bundesliga", "city": "Leverkusen", "teams": ["Bayer Leverkusen"], "roof_type": "open", "latitude": 51.0383, "longitude": 7.0022},
    {"stadium_id": "bundesliga_red_bull_arena_leipzig", "name": "Red Bull Arena", "league": "bundesliga", "city": "Leipzig", "teams": ["RB Leipzig"], "roof_type": "open", "latitude": 51.3458, "longitude": 12.3489},
    {"stadium_id": "bundesliga_deutsche_bank_frankfurt", "name": "Deutsche Bank Park", "league": "bundesliga", "city": "Frankfurt", "teams": ["Eintracht Frankfurt"], "roof_type": "retractable", "latitude": 50.0686, "longitude": 8.6455},
    {"stadium_id": "bundesliga_mhparena_stuttgart", "name": "MHPArena", "league": "bundesliga", "city": "Stuttgart", "teams": ["VfB Stuttgart"], "roof_type": "open", "latitude": 48.7923, "longitude": 9.2320},
    {"stadium_id": "bundesliga_europa_park_freiburg", "name": "Europa-Park Stadion", "league": "bundesliga", "city": "Freiburg", "teams": ["SC Freiburg"], "roof_type": "open", "latitude": 48.0211, "longitude": 7.8298},
    {"stadium_id": "bundesliga_volkswagen_wolfsburg", "name": "Volkswagen Arena", "league": "bundesliga", "city": "Wolfsburg", "teams": ["VfL Wolfsburg"], "roof_type": "open", "latitude": 52.4328, "longitude": 10.8039},
    {"stadium_id": "bundesliga_borussia_park_gladbach", "name": "Borussia-Park", "league": "bundesliga", "city": "Mönchengladbach", "teams": ["Borussia Mönchengladbach"], "roof_type": "open", "latitude": 51.1746, "longitude": 6.3855},
    {"stadium_id": "bundesliga_weserstadion_bremen", "name": "Weserstadion", "league": "bundesliga", "city": "Bremen", "teams": ["Werder Bremen"], "roof_type": "open", "latitude": 53.0664, "longitude": 8.8376},

    # --- 10 Serie A (Italy) ---
    {"stadium_id": "seriea_san_siro_inter", "name": "Stadio Giuseppe Meazza (San Siro)", "league": "serie-a", "city": "Milan", "teams": ["Inter Milan"], "roof_type": "open", "latitude": 45.4781, "longitude": 9.1240},
    {"stadium_id": "seriea_san_siro_ac_milan", "name": "San Siro (AC Milan)", "league": "serie-a", "city": "Milan", "teams": ["AC Milan"], "roof_type": "open", "latitude": 45.4785, "longitude": 9.1235},
    {"stadium_id": "seriea_allianz_stadium_juventus", "name": "Allianz Stadium", "league": "serie-a", "city": "Turin", "teams": ["Juventus"], "roof_type": "open", "latitude": 45.1096, "longitude": 7.6413},
    {"stadium_id": "seriea_maradona_napoli", "name": "Stadio Diego Armando Maradona", "league": "serie-a", "city": "Naples", "teams": ["Napoli"], "roof_type": "open", "latitude": 40.8280, "longitude": 14.1931},
    {"stadium_id": "seriea_olimpico_roma", "name": "Stadio Olimpico (Roma)", "league": "serie-a", "city": "Rome", "teams": ["AS Roma"], "roof_type": "open", "latitude": 41.9341, "longitude": 12.4547},
    {"stadium_id": "seriea_olimpico_lazio", "name": "Stadio Olimpico (Lazio)", "league": "serie-a", "city": "Rome", "teams": ["Lazio"], "roof_type": "open", "latitude": 41.9339, "longitude": 12.4545},
    {"stadium_id": "seriea_gewiss_atalanta", "name": "Gewiss Stadium", "league": "serie-a", "city": "Bergamo", "teams": ["Atalanta"], "roof_type": "open", "latitude": 45.7089, "longitude": 9.6808},
    {"stadium_id": "seriea_artemio_franchi_fiorentina", "name": "Stadio Artemio Franchi", "league": "serie-a", "city": "Florence", "teams": ["Fiorentina"], "roof_type": "open", "latitude": 43.7808, "longitude": 11.2823},
    {"stadium_id": "seriea_dall_ara_bologna", "name": "Stadio Renato Dall'Ara", "league": "serie-a", "city": "Bologna", "teams": ["Bologna"], "roof_type": "open", "latitude": 44.4922, "longitude": 11.3098},
    {"stadium_id": "seriea_grande_torino", "name": "Stadio Olimpico Grande Torino", "league": "serie-a", "city": "Turin", "teams": ["Torino"], "roof_type": "open", "latitude": 45.0418, "longitude": 7.6500},

    # --- 10 Ligue 1 (France) ---
    {"stadium_id": "ligue1_parc_des_princes_psg", "name": "Parc des Princes", "league": "ligue-1", "city": "Paris", "teams": ["Paris Saint-Germain"], "roof_type": "open", "latitude": 48.8414, "longitude": 2.2530},
    {"stadium_id": "ligue1_velodrome_marseille", "name": "Stade Vélodrome", "league": "ligue-1", "city": "Marseille", "teams": ["Olympique de Marseille"], "roof_type": "open", "latitude": 43.2698, "longitude": 5.3958},
    {"stadium_id": "ligue1_groupama_lyon", "name": "Groupama Stadium", "league": "ligue-1", "city": "Décines-Charpieu / Lyon", "teams": ["Olympique Lyonnais"], "roof_type": "open", "latitude": 45.7653, "longitude": 4.9820},
    {"stadium_id": "ligue1_louis_ii_monaco", "name": "Stade Louis II", "league": "ligue-1", "city": "Monaco", "teams": ["AS Monaco"], "roof_type": "open", "latitude": 43.7276, "longitude": 7.4156},
    {"stadium_id": "ligue1_pierre_mauroy_lille", "name": "Decathlon Arena - Stade Pierre-Mauroy", "league": "ligue-1", "city": "Villeneuve-d'Ascq / Lille", "teams": ["Lille OSC"], "roof_type": "retractable", "latitude": 50.6119, "longitude": 3.1305},
    {"stadium_id": "ligue1_allianz_riviera_nice", "name": "Allianz Riviera", "league": "ligue-1", "city": "Nice", "teams": ["OGC Nice"], "roof_type": "open", "latitude": 43.7051, "longitude": 7.1926},
    {"stadium_id": "ligue1_bollaert_lens", "name": "Stade Bollaert-Delelis", "league": "ligue-1", "city": "Lens", "teams": ["RC Lens"], "roof_type": "open", "latitude": 50.4329, "longitude": 2.8150},
    {"stadium_id": "ligue1_roazhon_park_rennes", "name": "Roazhon Park", "league": "ligue-1", "city": "Rennes", "teams": ["Stade Rennais"], "roof_type": "open", "latitude": 48.1075, "longitude": -1.7128},
    {"stadium_id": "ligue1_meinau_strasbourg", "name": "Stade de la Meinau", "league": "ligue-1", "city": "Strasbourg", "teams": ["RC Strasbourg"], "roof_type": "open", "latitude": 48.5600, "longitude": 7.7550},
    {"stadium_id": "ligue1_beaujoire_nantes", "name": "Stade de la Beaujoire", "league": "ligue-1", "city": "Nantes", "teams": ["FC Nantes"], "roof_type": "open", "latitude": 47.2560, "longitude": -1.5247},
]


def scrape_open_meteo_60_european_stadiums() -> dict[str, Any]:
    """1. Extrae pronóstico horario de 7 días (168h) y altitud para 60 estadios europeos (5 ligas)."""
    scraper = PitchLabScraplingBase("open_meteo_nflweather")
    base_url = "https://api.open-meteo.com/v1/forecast"

    stadium_forecasts: list[dict[str, Any]] = []
    http_trace: list[dict[str, Any]] = []
    total_hourly_points = 0

    batch_size = 12
    with FetcherSession(impersonate="chrome", stealthy_headers=True) as session:
        for start_idx in range(0, len(EUROPEAN_60_STADIUMS_CATALOG), batch_size):
            batch = EUROPEAN_60_STADIUMS_CATALOG[start_idx : start_idx + batch_size]
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
            results_list = (
                parsed
                if isinstance(parsed, list)
                else ([parsed] if isinstance(parsed, dict) else [])
            )

            for idx, stadium in enumerate(batch):
                loc_data = (
                    results_list[idx]
                    if idx < len(results_list) and isinstance(results_list[idx], dict)
                    else {}
                )
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
                        "hourly_points_count": len(hourly_points),
                        "hourly_forecast_7d": hourly_points,
                    }
                )

    leagues_breakdown: dict[str, int] = {}
    for s in stadium_forecasts:
        lg = s["league"]
        leagues_breakdown[lg] = leagues_breakdown.get(lg, 0) + 1

    payload = {
        "captured_at_utc": utc_now_iso(),
        "source_id": "open_meteo_nflweather",
        "summary": {
            "total_stadiums": len(stadium_forecasts),
            "leagues_breakdown": leagues_breakdown,
            "total_hourly_weather_points": total_hourly_points,
        },
        "http_trace": http_trace,
        "stadiums": stadium_forecasts,
    }

    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url=base_url,
        label="open_meteo_60_european_stadiums_7d",
        extra_meta={
            "record_count": len(stadium_forecasts),
            "total_hourly_weather_points": total_hourly_points,
            "leagues_breakdown": leagues_breakdown,
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
# 2. PINNACLE DEEP MULTI-LEAGUE & MULTI-SPORT ARCADIA CAPTURE
# ===========================================================================

PINNACLE_DEEP_URLS: list[str] = [
    "https://www.pinnacle.com/es/soccer/england-premier-league/matchups/",
    "https://www.pinnacle.com/es/soccer/spain-la-liga/matchups/",
    "https://www.pinnacle.com/es/soccer/germany-bundesliga/matchups/",
    "https://www.pinnacle.com/es/soccer/italy-serie-a/matchups/",
    "https://www.pinnacle.com/es/soccer/france-ligue-1/matchups/",
    "https://www.pinnacle.com/es/soccer/uefa-champions-league/matchups/",
    "https://www.pinnacle.com/es/soccer/mexico-liga-mx/matchups/",
    "https://www.pinnacle.com/es/football/nfl/matchups/",
    "https://www.pinnacle.com/es/basketball/nba/matchups/",
    "https://www.pinnacle.com/es/hockey/nhl/matchups/",
]


def _normalize_arcadia_matchup(item: dict[str, Any]) -> dict[str, Any]:
    participants = item.get("participants", [])
    home = next((p.get("name") for p in participants if p.get("alignment") == "home"), None)
    away = next((p.get("name") for p in participants if p.get("alignment") == "away"), None)
    if not home and len(participants) >= 2:
        home = participants[0].get("name")
        away = participants[1].get("name")
    league = item.get("league") or {}
    return {
        "matchup_id": item.get("id"),
        "parent_id": item.get("parentId"),
        "kickoff_utc": item.get("startTime"),
        "home_team": home,
        "away_team": away,
        "league_id": league.get("id"),
        "league_name": league.get("name"),
        "sport_name": (league.get("sport") or {}).get("name"),
        "is_live": item.get("isLive", False),
        "status": item.get("status"),
        "rotation": item.get("rotation"),
    }


def _normalize_arcadia_market(mkt: dict[str, Any]) -> dict[str, Any]:
    prices = []
    for p in mkt.get("prices", []):
        am = p.get("price")
        prices.append(
            {
                "designation": p.get("designation"),
                "points": p.get("points"),
                "american_odds": am,
                "decimal_odds": _american_to_decimal(am),
            }
        )
    limits = mkt.get("limits", [])
    max_limit = None
    for lim in limits:
        if isinstance(lim, dict) and lim.get("amount"):
            max_limit = lim.get("amount")
            break
    return {
        "matchup_id": mkt.get("matchupId"),
        "market_key": mkt.get("key"),
        "market_type": mkt.get("type"),
        "period": mkt.get("period"),
        "is_alternate": mkt.get("isAlternate", False),
        "cutoff_at": mkt.get("cutoffAt"),
        "max_limit_usd": max_limit,
        "prices": prices,
    }


async def _scrape_pinnacle_multileague_async() -> dict[str, Any]:
    scraper = PitchLabScraplingBase("pinnacle")
    arcadia_endpoints: list[dict[str, Any]] = []
    matchups_by_id: dict[Any, dict[str, Any]] = {}
    markets_list: list[dict[str, Any]] = []
    dom_pages: list[dict[str, Any]] = []

    async with AsyncStealthySession(
        headless=True,
        solve_cloudflare=True,
        record_requests=True,
        block_ads=True,
        timeout=45000,
        max_recorded_requests=2500,
    ) as session:
        for url in PINNACLE_DEEP_URLS:
            try:
                page = await session.fetch(
                    url,
                    wait_until="domcontentloaded",
                    wait=3500,
                    google_search=False,
                )
                title = (page.css("title::text").get() or "").strip()
                price_spans = [
                    t.strip()
                    for t in page.css("span::text, button::text").getall()
                    if re.fullmatch(r"[+-]?\d+(\.\d+)?", t.strip())
                ]
                team_spans = [
                    t.strip()
                    for t in page.css(
                        "[class*='gameInfoLabel']::text, [class*='participant']::text, [class*='ellipsis']::text"
                    ).getall()
                    if len(t.strip()) >= 3
                ]
                dom_pages.append(
                    {
                        "url": url,
                        "status": getattr(page, "status", None),
                        "title": title,
                        "dom_odds_count": len(price_spans),
                        "dom_teams_sample": team_spans[:30],
                    }
                )
            except Exception as exc:
                dom_pages.append({"url": url, "error": str(exc)})

        all_responses = session.network.search(
            url_pattern=r"(guest\.api\.arcadia\.pinnacle\.com|pinnacle\.com)",
            limit=None,
        )
        for resp in all_responses:
            if "arcadia.pinnacle.com" not in resp.url and resp.meta.get("resource_type") not in (
                "xhr",
                "fetch",
            ):
                continue
            parsed = _safe_json_loads(resp.body) if resp.body else None
            if parsed is None:
                continue
            arcadia_endpoints.append(
                {
                    "network_id": resp.meta.get("network_id"),
                    "url": resp.url,
                    "status": resp.status,
                    "record_count": len(parsed) if isinstance(parsed, (list, dict)) else 1,
                }
            )
            if "/matchups" in resp.url and isinstance(parsed, list):
                for item in parsed:
                    if isinstance(item, dict) and item.get("participants"):
                        norm_m = _normalize_arcadia_matchup(item)
                        mid = norm_m.get("matchup_id")
                        if mid is not None:
                            matchups_by_id[mid] = norm_m
            elif "/markets/" in resp.url and isinstance(parsed, list):
                for mkt in parsed:
                    if isinstance(mkt, dict) and mkt.get("matchupId"):
                        markets_list.append(_normalize_arcadia_market(mkt))

    unique_matchups = list(matchups_by_id.values())
    leagues_summary: dict[str, int] = {}
    for m in unique_matchups:
        lname = m.get("league_name") or "Unknown League"
        leagues_summary[lname] = leagues_summary.get(lname, 0) + 1

    total_records = len(unique_matchups) + len(markets_list)

    payload = {
        "captured_at_utc": utc_now_iso(),
        "source_id": "pinnacle",
        "target_urls": PINNACLE_DEEP_URLS,
        "summary": {
            "pages_visited": len(dom_pages),
            "arcadia_api_calls_captured": len(arcadia_endpoints),
            "unique_matchups_count": len(unique_matchups),
            "markets_count": len(markets_list),
            "total_records": total_records,
            "top_leagues_by_matchups": dict(
                sorted(leagues_summary.items(), key=lambda kv: kv[1], reverse=True)[:25]
            ),
        },
        "dom_pages": dom_pages,
        "arcadia_endpoints": arcadia_endpoints[:120],
        "matchups": unique_matchups[:1200],
        "markets": markets_list[:2500],
    }

    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url=PINNACLE_DEEP_URLS[0],
        label="pinnacle_multileague_europe_us_sports_deep",
        extra_meta=payload["summary"],
    )
    sha256_val = json.loads(out_path.read_text(encoding="utf-8"))["sha256"]
    return {
        "source_id": scraper.source_id,
        "category": scraper.category,
        "path": str(out_path),
        "matchups_count": len(unique_matchups),
        "markets_count": len(markets_list),
        "record_count": total_records,
        "sha256": sha256_val,
    }


def scrape_pinnacle_multileague_deep() -> dict[str, Any]:
    return asyncio.run(_scrape_pinnacle_multileague_async())


# ===========================================================================
# 3. ROTOWIRE DEEP MULTI-LEAGUE LINEUPS & INJURY TABLES (9 LEAGUES + INJURIES)
# ===========================================================================

ROTOWIRE_LINEUP_PAGES: list[tuple[str, str, str]] = [
    ("soccer", "epl", "https://www.rotowire.com/soccer/lineups.php?league=EPL"),
    ("soccer", "laliga", "https://www.rotowire.com/soccer/lineups.php?league=LIGA"),
    ("soccer", "bundesliga", "https://www.rotowire.com/soccer/lineups.php?league=BUND"),
    ("soccer", "serie-a", "https://www.rotowire.com/soccer/lineups.php?league=SERI"),
    ("soccer", "ligue-1", "https://www.rotowire.com/soccer/lineups.php?league=FRAN"),
    ("soccer", "ucl", "https://www.rotowire.com/soccer/lineups.php?league=UCL"),
    ("soccer", "liga-mx", "https://www.rotowire.com/soccer/lineups.php?league=LMX"),
    ("basketball", "nba", "https://www.rotowire.com/basketball/nba-lineups.php"),
    ("hockey", "nhl", "https://www.rotowire.com/hockey/nhl-lineups.php"),
]

ROTOWIRE_INJURY_ENDPOINTS: list[tuple[str, str]] = [
    ("nfl", "https://www.rotowire.com/football/tables/injury-report.php?team=ALL&pos=ALL"),
    ("nba", "https://www.rotowire.com/basketball/tables/injury-report.php?team=ALL&pos=ALL"),
    ("nhl", "https://www.rotowire.com/hockey/tables/injury-report.php?team=ALL&pos=ALL"),
]


def _parse_rotowire_lineup_list(ul_node: Any) -> dict[str, Any]:
    status_nodes = ul_node.css("li.lineup__status")
    status_text = status_nodes[0].get_all_text(strip=True) if status_nodes else "Expected"
    confirmed_status = "confirmed" if "confirm" in status_text.lower() else "predicted"

    starters: list[dict[str, str]] = []
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
            starters.append(entry)
            if designation.upper() in {"QUES", "DOUBT", "GTD", "DTD"}:
                questionable.append(entry)
        else:
            if designation.upper() in {"OUT", "SUS", "INJ", "IR", "OFS"}:
                injured_out.append(entry)
            else:
                questionable.append(entry)

    return {
        "confirmed_status": confirmed_status,
        "raw_status_label": status_text,
        "starters": starters,
        "injured_out_players": injured_out,
        "questionable_players": questionable,
    }


def scrape_rotowire_all_leagues_deep() -> dict[str, Any]:
    """3. Extrae alineaciones probables/confirmadas y lesionados de 9 ligas + tablas de lesiones NFL/NBA/NHL."""
    scraper = PitchLabScraplingBase("rotowire_lineups_injuries")

    http_trace: list[dict[str, Any]] = []
    lineup_matchups: list[dict[str, Any]] = []
    injury_table_records: list[dict[str, Any]] = []
    total_lineup_players = 0

    with FetcherSession(impersonate="chrome", stealthy_headers=True) as session:
        for sport, league_code, url in ROTOWIRE_LINEUP_PAGES:
            try:
                resp = session.get(url, timeout=25)
                boxes = resp.css(".lineup__box")
                page_matchups = 0
                for box in boxes:
                    teams = [t.get_all_text(strip=True) for t in box.css(".lineup__mteam")]
                    abbrs = [a.get_all_text(strip=True) for a in box.css(".lineup__abbr")]
                    home_team = (
                        teams[1]
                        if len(teams) >= 2
                        else (abbrs[1] if len(abbrs) >= 2 else "Home")
                    )
                    away_team = (
                        teams[0]
                        if len(teams) >= 1
                        else (abbrs[0] if len(abbrs) >= 1 else "Away")
                    )

                    home_ul = box.css("ul.lineup__list.is-home")
                    visit_ul = box.css("ul.lineup__list.is-visit")
                    if not home_ul and not visit_ul:
                        continue

                    home_data = _parse_rotowire_lineup_list(home_ul[0]) if home_ul else {}
                    away_data = _parse_rotowire_lineup_list(visit_ul[0]) if visit_ul else {}

                    players_in_box = (
                        len(home_data.get("starters", []))
                        + len(home_data.get("injured_out_players", []))
                        + len(home_data.get("questionable_players", []))
                        + len(away_data.get("starters", []))
                        + len(away_data.get("injured_out_players", []))
                        + len(away_data.get("questionable_players", []))
                    )
                    total_lineup_players += players_in_box
                    page_matchups += 1

                    lineup_matchups.append(
                        {
                            "sport": sport,
                            "league": league_code,
                            "home_team": home_team,
                            "away_team": away_team,
                            "home_lineup": home_data,
                            "away_lineup": away_data,
                            "total_players_listed": players_in_box,
                        }
                    )

                http_trace.append(
                    {
                        "url": url,
                        "league": league_code,
                        "status": resp.status,
                        "matchups_extracted": page_matchups,
                    }
                )
            except Exception as exc:
                http_trace.append({"url": url, "league": league_code, "error": str(exc)})

        for league_code, inj_url in ROTOWIRE_INJURY_ENDPOINTS:
            try:
                resp = session.get(inj_url, timeout=25)
                parsed = _safe_json_loads(resp.body)
                rows_count = 0
                if isinstance(parsed, list):
                    for item in parsed:
                        if isinstance(item, dict) and item.get("player"):
                            rows_count += 1
                            injury_table_records.append(
                                {
                                    "league": league_code,
                                    "player_id": item.get("ID"),
                                    "player_name": item.get("player"),
                                    "team": item.get("team"),
                                    "position": item.get("position"),
                                    "injury": item.get("injury"),
                                    "status_designation": item.get("status"),
                                    "est_return": item.get("rdate"),
                                    "player_url": item.get("URL"),
                                }
                            )
                http_trace.append(
                    {
                        "url": inj_url,
                        "league": league_code,
                        "status": resp.status,
                        "injuries_extracted": rows_count,
                    }
                )
            except Exception as exc:
                http_trace.append({"url": inj_url, "league": league_code, "error": str(exc)})

    matchups_by_league: dict[str, int] = {}
    for m in lineup_matchups:
        lg = m["league"]
        matchups_by_league[lg] = matchups_by_league.get(lg, 0) + 1

    total_records = len(lineup_matchups) + total_lineup_players + len(injury_table_records)

    payload = {
        "captured_at_utc": utc_now_iso(),
        "source_id": "rotowire_lineups_injuries",
        "summary": {
            "lineup_matchups_count": len(lineup_matchups),
            "matchups_by_league": matchups_by_league,
            "total_lineup_players_extracted": total_lineup_players,
            "injury_table_records_count": len(injury_table_records),
            "total_records": total_records,
        },
        "http_trace": http_trace,
        "lineup_matchups": lineup_matchups,
        "injury_table_records": injury_table_records,
    }

    out_path = scraper.save_raw_snapshot(
        payload=payload,
        url=ROTOWIRE_LINEUP_PAGES[0][2],
        label="rotowire_all_leagues_lineups_and_injuries_deep",
        extra_meta=payload["summary"],
    )
    sha256_val = json.loads(out_path.read_text(encoding="utf-8"))["sha256"]
    return {
        "source_id": scraper.source_id,
        "category": scraper.category,
        "path": str(out_path),
        "lineup_matchups_count": len(lineup_matchups),
        "total_lineup_players": total_lineup_players,
        "injury_table_records_count": len(injury_table_records),
        "record_count": total_records,
        "sha256": sha256_val,
    }


def run_wave4_scrapers(only_source: str = "all") -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []

    if only_source in ("all", "open_meteo_nflweather"):
        print("-> [1/3] Extrayendo Open-Meteo 60 Estadios Europeos (EPL, LaLiga, Bundesliga, Serie A, Ligue 1)...")
        res = scrape_open_meteo_60_european_stadiums()
        results.append(res)
        print(
            f"   OK open_meteo_nflweather: stadiums={res['stadiums_count']} "
            f"(hourly_pts={res['hourly_points_count']}) | sha256={res['sha256'][:12]}"
        )

    if only_source in ("all", "rotowire_lineups_injuries"):
        print("-> [2/3] Extrayendo RotoWire Multi-League Lineups & Injury Tables (9 ligas)...")
        res = scrape_rotowire_all_leagues_deep()
        results.append(res)
        print(
            f"   OK rotowire_lineups_injuries: matchups={res['lineup_matchups_count']}, "
            f"players={res['total_lineup_players']}, injuries={res['injury_table_records_count']} "
            f"| sha256={res['sha256'][:12]}"
        )

    if only_source in ("all", "pinnacle"):
        print("-> [3/3] Extrayendo Pinnacle Arcadia Multi-League (Europa Top-5 + UCL + Liga MX + NFL + NBA + NHL)...")
        res = scrape_pinnacle_multileague_deep()
        results.append(res)
        print(
            f"   OK pinnacle: matchups={res['matchups_count']}, markets={res['markets_count']} "
            f"| sha256={res['sha256'][:12]}"
        )

    return results


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Wave 4 Deep Scraper: 60 European Stadiums, Pinnacle Multi-League, RotoWire All-Leagues"
    )
    parser.add_argument(
        "--source",
        default="all",
        choices=["all", "open_meteo_nflweather", "rotowire_lineups_injuries", "pinnacle"],
        help="Fuente específica a ejecutar o 'all'",
    )
    args = parser.parse_args()
    summary = run_wave4_scrapers(args.source)
    print("\n=== RESUMEN WAVE 4 DEEP EXTRACTION ===")
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
