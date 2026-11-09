"""
Extract enriched Liga MX historical match data from ESPN API:
- Lineups & formations
- Venue & altitude (msnm) + attendance
- In-match boxscore tactical statistics (shots, shots on target, possession, corners, fouls, passes, tackles, interceptions, clearances, blocks)
- Bet365 closing odds (moneyline 1X2, over/under 2.5, spread)
- Canonical IDs with match date: liga-mx:YYYY-MM-DD:home:away (0 collisions)

Target output: data/history/research/liga-mx-enriched.jsonl
"""

import concurrent.futures
import json
import ssl
import sys
import time
import urllib.request
from pathlib import Path

REPO_ROOT = Path(".").resolve()
OUT_PATH = REPO_ROOT / "data" / "history" / "research" / "liga-mx-enriched.jsonl"

ctx = ssl.create_default_context()

ALTITUDES = {
    "Estadio Nemesio Díez": 2667,
    "Estadio Nemesio Diez": 2667,
    "Estadio Nemesio Díez Riega": 2667,
    "Estadio Nemesio Diez Riega": 2667,
    "Estadio Hidalgo": 2426,
    "Estadio Olímpico Universitario": 2284,
    "Estadio Olimpico Universitario": 2284,
    "Estadio Azteca": 2240,
    "Estadio Ciudad de los Deportes": 2240,
    "Estadio Azul": 2240,
    "Estadio Banorte": 2240,
    "Estadio Cuauhtémoc": 2175,
    "Estadio Cuauhtemoc": 2175,
    "Estadio Morelos": 1920,
    "Estadio Victoria": 1888,
    "Estadio Alfonso Lastras Ramírez": 1864,
    "Estadio Alfonso Lastras Ramirez": 1864,
    "Estadio Alfonso Lastras": 1864,
    "Estadio Libertad Financiera": 1864,
    "Estadio Corregidora": 1820,
    "Estadio La Corregidora": 1820,
    "Estadio León": 1815,
    "Estadio Leon": 1815,
    "Estadio Nou Camp": 1815,
    "Estadio Akron": 1566,
    "Estadio Omnilife": 1566,
    "Estadio Chivas": 1566,
    "Estadio Jalisco": 1566,
    "Estadio Olímpico Benito Juárez": 1137,
    "Estadio Olimpico Benito Juarez": 1137,
    "Estadio Corona": 1120,
    "Estadio TSM Corona": 1120,
    "Estadio Universitario": 537,
    "Estadio Universitario (UANL)": 537,
    "Estadio BBVA": 537,
    "Estadio BBVA Bancomer": 537,
    "Estadio Caliente": 40,
    "Estadio de Mazatlán": 10,
    "Estadio de Mazatlan": 10,
    "Estadio El Encanto": 10,
    "Estadio Kraken": 10,
}

CITY_ALTITUDES = {
    "Toluca": 2667,
    "Pachuca": 2426,
    "Mexico City": 2240,
    "Ciudad de México": 2240,
    "Puebla": 2175,
    "Morelia": 1920,
    "Aguascalientes": 1888,
    "San Luis Potosí": 1864,
    "San Luis Potosi": 1864,
    "León": 1815,
    "Leon": 1815,
    "León de los Aldamas": 1815,
    "Leon de los Aldamas": 1815,
    "Querétaro": 1820,
    "Queretaro": 1820,
    "Santiago de Querétaro": 1820,
    "Santiago de Queretaro": 1820,
    "Guadalajara": 1566,
    "Zapopan": 1566,
    "Ciudad Juárez": 1137,
    "Ciudad Juarez": 1137,
    "Juárez": 1137,
    "Torreón": 1120,
    "Torreon": 1120,
    "Monterrey": 537,
    "Guadalupe": 537,
    "San Nicolás de los Garza": 537,
    "San Nicolas de los Garza": 537,
    "Culiacán": 54,
    "Culiacan": 54,
    "Tijuana": 40,
    "Mazatlán": 10,
    "Mazatlan": 10,
}

TEAM_MAP = {
    "227": "liga-mx.america",
    "216": "liga-mx.atlas-guadalajara",
    "15720": "liga-mx.atletico-san-luis",
    "226": "liga-mx.atlante",
    "218": "liga-mx.cruz-azul",
    "219": "liga-mx.deportivo-guadalajara",
    "223": "liga-mx.deportivo-toluca",
    "222": "liga-mx.gallos-blancos",
    "17851": "liga-mx.juarez",
    "228": "liga-mx.leon",
    "20410": "liga-mx.mazatlan",
    "20702": "liga-mx.mazatlan",
    "220": "liga-mx.monterrey",
    "229": "liga-mx.necaxa",
    "234": "liga-mx.pachuca",
    "231": "liga-mx.puebla",
    "233": "liga-mx.pumas-unam",
    "225": "liga-mx.santos-laguna",
    "10125": "liga-mx.tijuana",
    "232": "liga-mx.uanl-tigres",
}

TEAM_HOME_ALTITUDES = {
    "liga-mx.america": 2240,
    "liga-mx.atlas-guadalajara": 1566,
    "liga-mx.atletico-san-luis": 1864,
    "liga-mx.atlante": 2240,
    "liga-mx.cruz-azul": 2240,
    "liga-mx.deportivo-guadalajara": 1566,
    "liga-mx.deportivo-toluca": 2667,
    "liga-mx.gallos-blancos": 1820,
    "liga-mx.juarez": 1137,
    "liga-mx.leon": 1815,
    "liga-mx.mazatlan": 10,
    "liga-mx.monterrey": 537,
    "liga-mx.necaxa": 1888,
    "liga-mx.pachuca": 2426,
    "liga-mx.puebla": 2175,
    "liga-mx.pumas-unam": 2284,
    "liga-mx.santos-laguna": 1120,
    "liga-mx.tijuana": 40,
    "liga-mx.uanl-tigres": 537,
}

TEAM_HOME_VENUES = {
    "liga-mx.america": {"name": "Estadio Ciudad de los Deportes", "city": "Mexico City"},
    "liga-mx.atlas-guadalajara": {"name": "Estadio Jalisco", "city": "Guadalajara"},
    "liga-mx.atletico-san-luis": {"name": "Estadio Alfonso Lastras Ramírez", "city": "San Luis Potosí"},
    "liga-mx.atlante": {"name": "Estadio Ciudad de los Deportes", "city": "Mexico City"},
    "liga-mx.cruz-azul": {"name": "Estadio Ciudad de los Deportes", "city": "Mexico City"},
    "liga-mx.deportivo-guadalajara": {"name": "Estadio Akron", "city": "Guadalajara"},
    "liga-mx.deportivo-toluca": {"name": "Estadio Nemesio Díez Riega", "city": "Toluca"},
    "liga-mx.gallos-blancos": {"name": "Estadio Corregidora", "city": "Santiago de Querétaro"},
    "liga-mx.juarez": {"name": "Estadio Olímpico Benito Juárez", "city": "Ciudad Juárez"},
    "liga-mx.leon": {"name": "Estadio León", "city": "León de los Aldamas"},
    "liga-mx.mazatlan": {"name": "Estadio El Encanto", "city": "Mazatlán"},
    "liga-mx.monterrey": {"name": "Estadio BBVA", "city": "Guadalupe"},
    "liga-mx.necaxa": {"name": "Estadio Victoria", "city": "Aguascalientes"},
    "liga-mx.pachuca": {"name": "Estadio Hidalgo", "city": "Pachuca"},
    "liga-mx.puebla": {"name": "Estadio Cuauhtémoc", "city": "Puebla"},
    "liga-mx.pumas-unam": {"name": "Estadio Olímpico Universitario", "city": "Mexico City"},
    "liga-mx.santos-laguna": {"name": "Estadio Corona", "city": "Torreón"},
    "liga-mx.tijuana": {"name": "Estadio Caliente", "city": "Tijuana"},
    "liga-mx.uanl-tigres": {"name": "Estadio Universitario", "city": "San Nicolás de los Garza"},
}

def american_to_decimal(ml):
    if ml is None:
        return None
    try:
        val = float(ml)
        if val > 0:
            return round((val / 100.0) + 1.0, 3)
        elif val < 0:
            return round((100.0 / abs(val)) + 1.0, 3)
        return None
    except (ValueError, TypeError):
        return None

def extract_decimal_odds(team_odds_obj):
    if not isinstance(team_odds_obj, dict):
        return None
    # 1. Direct decimal odds value (ESPN soccer API provides this under odds.value)
    val = (team_odds_obj.get("odds") or {}).get("value")
    if val is not None:
        try:
            return round(float(val), 3)
        except (ValueError, TypeError):
            pass
    # 2. American moneyline
    ml = team_odds_obj.get("moneyLine")
    if ml is not None:
        return american_to_decimal(ml)
    return None

def safe_int(v):
    if v is None:
        return None
    try:
        return int(str(v).replace(",", "").strip())
    except (ValueError, TypeError):
        return None

def fetch_scoreboard(year):
    url = f"https://site.api.espn.com/apis/site/v2/sports/soccer/mex.1/scoreboard?dates={year}&limit=1000"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, context=ctx, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return data.get("events", [])
        except Exception:
            time.sleep(1.0 * (attempt + 1))
    return []

def fetch_summary(event_id):
    url = f"https://site.api.espn.com/apis/site/v2/sports/soccer/mex.1/summary?event={event_id}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, context=ctx, timeout=15) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception:
            time.sleep(0.6 * (attempt + 1))
    return None

def parse_summary(summary, default_date=None, default_season=None):
    if not summary:
        return None
    header = summary.get("header") or {}
    comp = (header.get("competitions") or [{}])[0]
    competitors = comp.get("competitors") or []
    if len(competitors) < 2:
        return None
    
    home_c = next((c for c in competitors if c.get("homeAway") == "home"), competitors[0])
    away_c = next((c for c in competitors if c.get("homeAway") == "away"), competitors[1])
    
    home_id = str(home_c.get("id"))
    away_id = str(away_c.get("id"))
    home_team = TEAM_MAP.get(home_id, f"liga-mx.{(home_c.get('team') or {}).get('shortDisplayName', '').lower().replace(' ', '-')}")
    away_team = TEAM_MAP.get(away_id, f"liga-mx.{(away_c.get('team') or {}).get('shortDisplayName', '').lower().replace(' ', '-')}")
    
    game_info = summary.get("gameInfo") or {}
    venue_info = game_info.get("venue") or {}
    v_name = venue_info.get("fullName", "") or ""
    v_address = venue_info.get("address") or {}
    v_city = v_address.get("city", "") or ""

    default_venue = TEAM_HOME_VENUES.get(home_team, {})
    v_name = v_name or default_venue.get("name", "")
    v_city = v_city or default_venue.get("city", "")
    v_alt = ALTITUDES.get(v_name) or CITY_ALTITUDES.get(v_city) or TEAM_HOME_ALTITUDES.get(home_team, 1500)
    attendance_val = safe_int(game_info.get("attendance"))

    # Stats
    boxscore = summary.get("boxscore") or {}
    b_teams = boxscore.get("teams") or []
    stats = {}
    for bt in b_teams:
        side = "Home" if str((bt.get("team") or {}).get("id")) == home_id else "Away"
        for st in (bt.get("statistics") or []):
            name = st.get("name")
            val = st.get("displayValue")
            stats[f"{name}_{side}"] = val

    def num_or_none(v):
        if v is None:
            return None
        try:
            return float(str(v).replace("%", "").strip())
        except (ValueError, TypeError):
            return None

    # Rosters
    rosters = summary.get("rosters") or []
    lineups = {}
    for r in rosters:
        t_id = str((r.get("team") or {}).get("id"))
        side = "home" if t_id == home_id else "away"
        formation = r.get("formation")
        starters = []
        subs = []
        for p in (r.get("roster") or []):
            p_info = {
                "name": (p.get("athlete") or {}).get("displayName"),
                "jersey": p.get("jersey"),
                "position": (p.get("position") or {}).get("abbreviation"),
                "starter": p.get("starter", False)
            }
            if p.get("starter"):
                starters.append(p_info)
            else:
                subs.append(p_info)
        lineups[side] = {"formation": formation, "starters": starters, "subs": subs}

    # Odds
    odds_list = summary.get("odds") or []
    bet365 = next((o for o in odds_list if "bet365" in ((o.get("provider") or {}).get("name") or "").lower()), None)
    if not bet365 and odds_list:
        bet365 = odds_list[0]
    
    parsed_odds = None
    if bet365:
        ou = bet365.get("overUnder")
        ou_val = None
        try:
            ou_val = float(ou) if ou is not None else None
        except (ValueError, TypeError):
            ou_val = None

        over25 = None
        under25 = None
        # Validate Bet365 over/under: only assign over25/under25 when line is strictly 2.5
        if ou_val == 2.5:
            over_val = bet365.get("overOdds")
            under_val = bet365.get("underOdds")
            over25 = american_to_decimal(over_val)
            under25 = american_to_decimal(under_val)
            curr = bet365.get("current") or {}
            if over25 is None and (curr.get("over") or {}).get("decimal"):
                try:
                    over25 = float(curr["over"]["decimal"])
                except (ValueError, TypeError):
                    pass
            if under25 is None and (curr.get("under") or {}).get("decimal"):
                try:
                    under25 = float(curr["under"]["decimal"])
                except (ValueError, TypeError):
                    pass

        home_team_odds = bet365.get("homeTeamOdds") or {}
        away_team_odds = bet365.get("awayTeamOdds") or {}
        draw_odds = bet365.get("drawOdds") or {}

        home_ml = home_team_odds.get("moneyLine")
        away_ml = away_team_odds.get("moneyLine")
        draw_ml = draw_odds.get("moneyLine")

        dec_home = extract_decimal_odds(home_team_odds)
        dec_away = extract_decimal_odds(away_team_odds)
        dec_draw = extract_decimal_odds(draw_odds)

        # Fallback to current object if needed
        curr = bet365.get("current") or {}
        if dec_home is None and (curr.get("home") or {}).get("decimal"):
            try:
                dec_home = round(float(curr["home"]["decimal"]), 3)
            except (ValueError, TypeError):
                pass
        if dec_away is None and (curr.get("away") or {}).get("decimal"):
            try:
                dec_away = round(float(curr["away"]["decimal"]), 3)
            except (ValueError, TypeError):
                pass
        if dec_draw is None and (curr.get("draw") or {}).get("decimal"):
            try:
                dec_draw = round(float(curr["draw"]["decimal"]), 3)
            except (ValueError, TypeError):
                pass

        parsed_odds = {
            "source": "espn",
            "provider": (bet365.get("provider") or {}).get("name"),
            "details": bet365.get("details"),
            "overUnder": ou_val,
            "spread": bet365.get("spread"),
            "homeML": home_ml,
            "awayML": away_ml,
            "drawML": draw_ml,
            "home": dec_home,
            "away": dec_away,
            "draw": dec_draw,
            "decimalHome": dec_home,
            "decimalAway": dec_away,
            "decimalDraw": dec_draw,
            "over25": over25,
            "under25": under25,
            "usage": "research-only",
        }

    date_str = comp.get("date") or default_date
    date_part = date_str[:10] if date_str else "unknown"
    season_val = (header.get("season") or {}).get("year") or default_season
    home_slug = home_team.replace("liga-mx.", "")
    away_slug = away_team.replace("liga-mx.", "")

    # Canonical date-based ID eliminating all collisions: liga-mx:YYYY-MM-DD:home:away
    canonical_id = f"liga-mx:{date_part}:{home_slug}:{away_slug}"

    return {
        "id": canonical_id,
        "espn_id": header.get("id"),
        "league": "liga-mx",
        "sport": "soccer",
        "season": str(season_val),
        "date": date_part if date_part != "unknown" else None,
        "kickoff": date_str,
        "homeTeam": home_team,
        "awayTeam": away_team,
        "homeScore": int(home_c.get("score", 0)),
        "awayScore": int(away_c.get("score", 0)),
        "attendance": attendance_val,
        "venue": {
            "name": v_name,
            "city": v_city,
            "altitude_m": v_alt,
            "attendance": attendance_val,
        },
        "stats": {
            # Total shots with fallback to shots to ensure 0 nulls
            "shotsHome": num_or_none(stats.get("totalShots_Home") if stats.get("totalShots_Home") is not None else stats.get("shots_Home")),
            "shotsAway": num_or_none(stats.get("totalShots_Away") if stats.get("totalShots_Away") is not None else stats.get("shots_Away")),
            "shotsOnTargetHome": num_or_none(stats.get("shotsOnTarget_Home")),
            "shotsOnTargetAway": num_or_none(stats.get("shotsOnTarget_Away")),
            "possessionHome": num_or_none(stats.get("possessionPct_Home")),
            "possessionAway": num_or_none(stats.get("possessionPct_Away")),
            "cornersHome": num_or_none(stats.get("wonCorners_Home") if stats.get("wonCorners_Home") is not None else stats.get("corners_Home")),
            "cornersAway": num_or_none(stats.get("wonCorners_Away") if stats.get("wonCorners_Away") is not None else stats.get("corners_Away")),
            "foulsHome": num_or_none(stats.get("foulsCommitted_Home") if stats.get("foulsCommitted_Home") is not None else stats.get("fouls_Home")),
            "foulsAway": num_or_none(stats.get("foulsCommitted_Away") if stats.get("foulsCommitted_Away") is not None else stats.get("fouls_Away")),
            "yellowHome": num_or_none(stats.get("yellowCards_Home")),
            "yellowAway": num_or_none(stats.get("yellowCards_Away")),
            "redHome": num_or_none(stats.get("redCards_Home")),
            "redAway": num_or_none(stats.get("redCards_Away")),
            "savesHome": num_or_none(stats.get("saves_Home")),
            "savesAway": num_or_none(stats.get("saves_Away")),
            "offsidesHome": num_or_none(stats.get("offsides_Home")),
            "offsidesAway": num_or_none(stats.get("offsides_Away")),
            "accuratePassesHome": num_or_none(stats.get("accuratePasses_Home")),
            "accuratePassesAway": num_or_none(stats.get("accuratePasses_Away")),
            "totalPassesHome": num_or_none(stats.get("totalPasses_Home")),
            "totalPassesAway": num_or_none(stats.get("totalPasses_Away")),
            "passPctHome": num_or_none(stats.get("passPct_Home")),
            "passPctAway": num_or_none(stats.get("passPct_Away")),
            "effectiveTacklesHome": num_or_none(stats.get("effectiveTackles_Home")),
            "effectiveTacklesAway": num_or_none(stats.get("effectiveTackles_Away")),
            "totalTacklesHome": num_or_none(stats.get("totalTackles_Home")),
            "totalTacklesAway": num_or_none(stats.get("totalTackles_Away")),
            "tacklePctHome": num_or_none(stats.get("tacklePct_Home")),
            "tacklePctAway": num_or_none(stats.get("tacklePct_Away")),
            "interceptionsHome": num_or_none(stats.get("interceptions_Home")),
            "interceptionsAway": num_or_none(stats.get("interceptions_Away")),
            "effectiveClearanceHome": num_or_none(stats.get("effectiveClearance_Home")),
            "effectiveClearanceAway": num_or_none(stats.get("effectiveClearance_Away")),
            "totalClearanceHome": num_or_none(stats.get("totalClearance_Home")),
            "totalClearanceAway": num_or_none(stats.get("totalClearance_Away")),
            "blockedShotsHome": num_or_none(stats.get("blockedShots_Home")),
            "blockedShotsAway": num_or_none(stats.get("blockedShots_Away")),
        },
        "lineups": lineups,
        "odds": parsed_odds,
        "source": "espn",
    }

def main():
    print("Collecting Liga MX completed events across 2022, 2023, 2024, 2025, 2026...")
    years = [2022, 2023, 2024, 2025, 2026]
    all_events = {}
    for yr in years:
        evs = fetch_scoreboard(yr)
        completed_in_yr = 0
        for ev in evs:
            eid = ev.get("id")
            status = (ev.get("status") or {}).get("type", {}).get("name")
            if status in ("STATUS_FULL_TIME", "STATUS_FINAL", "STATUS_AFTER_EXTRA_TIME", "STATUS_FINAL_PEN"):
                all_events[eid] = ev
                completed_in_yr += 1
        print(f"  Year {yr}: {len(evs)} events retrieved, {completed_in_yr} completed")

    print(f"Total completed events to extract across all years: {len(all_events)}")
    
    # Sort events by date
    event_list = sorted(all_events.values(), key=lambda e: e.get("date", ""))
    target_events = event_list
    print(f"Targeting extraction of all {len(target_events)} events without artificial limits...")

    # Load existing records if available for resilient fallback
    existing_matches = {}
    if OUT_PATH.exists():
        try:
            with open(OUT_PATH, "r", encoding="utf-8") as f:
                for line in f:
                    if line.strip():
                        rec = json.loads(line)
                        if rec.get("espn_id"):
                            existing_matches[str(rec["espn_id"])] = rec
        except Exception:
            pass

    results = []
    t0 = time.time()
    
    def process_event(ev):
        eid = str(ev.get("id"))
        summary = fetch_summary(eid)
        if summary:
            parsed = parse_summary(summary, default_date=ev.get("date"), default_season=(ev.get("season") or {}).get("year"))
            if parsed:
                return parsed
        # Fallback to existing match if summary fetch failed
        if eid in existing_matches:
            return existing_matches[eid]
        return None

    completed_count = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
        futures = {executor.submit(process_event, ev): ev for ev in target_events}
        for fut in concurrent.futures.as_completed(futures):
            res = fut.result()
            if res:
                results.append(res)
            completed_count += 1
            if completed_count % 100 == 0 or completed_count == len(target_events):
                print(f"  Progress: {completed_count}/{len(target_events)} ({round(time.time() - t0, 1)}s)")

    # Sort results by date and id
    results.sort(key=lambda r: (r.get("date") or "", r.get("id") or ""))

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        for r in results:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    print(f"\nSuccessfully wrote {len(results)} enriched Liga MX games to {OUT_PATH}")
    print(f"Elapsed time: {round(time.time() - t0, 1)} seconds.")

if __name__ == "__main__":
    main()
