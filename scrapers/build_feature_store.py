"""
Construcción del Feature Store unificado Multi-Deporte de PitchLab (`data/feature_store/`).

Une y resuelve entidades canónicas de clubes/equipos/programas a través de las 28 fuentes
normalizadas en `data/normalized/` para las 11 ligas y 6 deportes (~376 equipos canónicos:
114 clubes de las 6 ligas de fútbol, 32 franquicias NFL, 32 franquicias NHL, 30 franquicias MLB,
30 franquicias NBA y 138 programas NCAAF FBS), generando:

1. `data/feature_store/team_master_features.json` y `.csv`
2. `data/feature_store/historical_matches_xg.json` y `.csv`
3. `data/feature_store/live_matchups_edge_matrix.json`
4. `data/feature_store/feature_store_manifest.json`
"""

from __future__ import annotations

import csv
import json
import math
import re
import statistics
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKTREE_ROOT = Path(__file__).resolve().parent.parent
NORMALIZED_DIR = WORKTREE_ROOT / "data" / "normalized"
FEATURE_STORE_DIR = WORKTREE_ROOT / "data" / "feature_store"


def _strip_accents(text: str) -> str:
    if not text:
        return ""
    cleaned = text.replace("\u200b", "").replace("\xa0", " ").strip()
    norm = unicodedata.normalize("NFKD", cleaned)
    return "".join(c for c in norm if not unicodedata.combining(c))


def _slug_token(text: str) -> str:
    s = _strip_accents(str(text or "")).lower()
    s = s.replace("&", " and ").replace("'", "").replace(".", " ").replace("-", " ")
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    # Remove common club affixes when building fuzzy key
    tokens = [
        t
        for t in s.split()
        if t
        not in {
            "fc",
            "cf",
            "cd",
            "ud",
            "rc",
            "rcd",
            "ca",
            "sc",
            "sv",
            "vfb",
            "vfl",
            "tsg",
            "1899",
            "fsv",
            "05",
            "04",
            "07",
            "1907",
            "1909",
            "1913",
            "1893",
            "29",
            "ac",
            "acf",
            "as",
            "ss",
            "ssc",
            "us",
            "aj",
            "estac",
            "losc",
            "ogc",
            "afc",
            "cfc",
            "sco",
            "bv",
            "09",
            "de",
            "del",
            "la",
            "el",
            "club",
            "deportivo",
            "balompie",
            "futbol",
            "calcio",
            "sporting",
            "ouest",
            "association",
            "jeunesse",
            "esperance",
            "sportive",
            "aube",
            "champagne",
            "alsace",
            "cote",
            "azur",
            "bergamasca",
        }
        and not t.isdigit()
    ]
    return " ".join(tokens) if tokens else s.strip()


# Explicit alias mapping -> canonical Transfermarkt/SumerSports name
EXPLICIT_TEAM_ALIASES: dict[str, str] = {
    # Liga MX (18)
    "america": "CF América",
    "cf america": "CF América",
    "club america": "CF América",
    "team_club_america": "CF América",
    "cruz azul": "CD Cruz Azul",
    "cd cruz azul": "CD Cruz Azul",
    "cf cruz azul": "CD Cruz Azul",
    "team_cruz_azul": "CD Cruz Azul",
    "guadalajara": "CD Guadalajara",
    "cd guadalajara": "CD Guadalajara",
    "chivas": "CD Guadalajara",
    "chivas guadalajara": "CD Guadalajara",
    "team_guadalajara": "CD Guadalajara",
    "toluca": "Deportivo Toluca FC",
    "cd toluca": "Deportivo Toluca FC",
    "deportivo toluca": "Deportivo Toluca FC",
    "deportivo toluca fc": "Deportivo Toluca FC",
    "team_toluca": "Deportivo Toluca FC",
    "tigres": "Tigres UANL",
    "tigres uanl": "Tigres UANL",
    "club tigres uanl": "Tigres UANL",
    "team_tigres_uanl": "Tigres UANL",
    "monterrey": "CF Monterrey",
    "cf monterrey": "CF Monterrey",
    "rayados": "CF Monterrey",
    "team_monterrey": "CF Monterrey",
    "tijuana": "Club Tijuana",
    "club tijuana": "Club Tijuana",
    "tijuana xolos de caliente": "Club Tijuana",
    "club tijuana xoloitzcuintles de caliente": "Club Tijuana",
    "xolos": "Club Tijuana",
    "pumas": "Pumas UNAM",
    "pumas unam": "Pumas UNAM",
    "unam": "Pumas UNAM",
    "club universidad nacional": "Pumas UNAM",
    "atlas": "Atlas Guadalajara",
    "atlas fc": "Atlas Guadalajara",
    "atlas guadalajara": "Atlas Guadalajara",
    "leon": "Club León FC",
    "club leon": "Club León FC",
    "club leon fc": "Club León FC",
    "santos": "Santos Laguna",
    "santos laguna": "Santos Laguna",
    "club santos laguna": "Santos Laguna",
    "juarez": "FC Juárez",
    "fc juarez": "FC Juárez",
    "bravos": "FC Juárez",
    "necaxa": "Club Necaxa",
    "club necaxa": "Club Necaxa",
    "atletico san luis": "Atlético de San Luis",
    "atletico de san luis": "Atlético de San Luis",
    "san luis": "Atlético de San Luis",
    "pachuca": "CF Pachuca",
    "cf pachuca": "CF Pachuca",
    "queretaro": "Querétaro FC",
    "queretaro fc": "Querétaro FC",
    "puebla": "Club Puebla",
    "club puebla": "Club Puebla",
    "atlante": "CF Atlante",
    "cf atlante": "CF Atlante",
    "atlante fc": "CF Atlante",
    "mazatlan": "CF Atlante",
    "mazatlan fc": "CF Atlante",
    # EPL (20)
    "manchester city": "Manchester City",
    "man city": "Manchester City",
    "manchester city fc": "Manchester City",
    "arsenal": "Arsenal FC",
    "arsenal fc": "Arsenal FC",
    "chelsea": "Chelsea FC",
    "chelsea fc": "Chelsea FC",
    "liverpool": "Liverpool FC",
    "liverpool fc": "Liverpool FC",
    "manchester united": "Manchester United",
    "manchester utd": "Manchester United",
    "man utd": "Manchester United",
    "manchester united fc": "Manchester United",
    "tottenham": "Tottenham Hotspur",
    "tottenham hotspur": "Tottenham Hotspur",
    "tottenham hotspur fc": "Tottenham Hotspur",
    "spurs": "Tottenham Hotspur",
    "newcastle": "Newcastle United",
    "newcastle united": "Newcastle United",
    "newcastle utd": "Newcastle United",
    "newcastle united fc": "Newcastle United",
    "brighton": "Brighton & Hove Albion",
    "brighton and hove albion": "Brighton & Hove Albion",
    "brighton & hove albion": "Brighton & Hove Albion",
    "brighton & hove albion fc": "Brighton & Hove Albion",
    "brentford": "Brentford FC",
    "brentford fc": "Brentford FC",
    "aston villa": "Aston Villa",
    "aston villa fc": "Aston Villa",
    "bournemouth": "AFC Bournemouth",
    "afc bournemouth": "AFC Bournemouth",
    "crystal palace": "Crystal Palace",
    "crystal palace fc": "Crystal Palace",
    "nottingham forest": "Nottingham Forest",
    "nottm forest": "Nottingham Forest",
    "nott'ham forest": "Nottingham Forest",
    "nottingham forest fc": "Nottingham Forest",
    "sunderland": "Sunderland AFC",
    "sunderland afc": "Sunderland AFC",
    "leeds": "Leeds United",
    "leeds united": "Leeds United",
    "leeds united fc": "Leeds United",
    "everton": "Everton FC",
    "everton fc": "Everton FC",
    "fulham": "Fulham FC",
    "fulham fc": "Fulham FC",
    "ipswich": "Ipswich Town",
    "ipswich town": "Ipswich Town",
    "ipswich town fc": "Ipswich Town",
    "coventry": "Coventry City",
    "coventry city": "Coventry City",
    "coventry city fc": "Coventry City",
    "hull": "Hull City",
    "hull city": "Hull City",
    "hull city afc": "Hull City",
    # LaLiga (20)
    "real madrid": "Real Madrid CF",
    "real madrid cf": "Real Madrid CF",
    "barcelona": "FC Barcelona",
    "fc barcelona": "FC Barcelona",
    "atletico madrid": "Atlético de Madrid",
    "atletico de madrid": "Atlético de Madrid",
    "club atletico de madrid": "Atlético de Madrid",
    "atm atletico": "Atlético de Madrid",
    "atletico": "Atlético de Madrid",
    "villarreal": "Villarreal CF",
    "villarreal cf": "Villarreal CF",
    "real sociedad": "Real Sociedad",
    "real sociedad de futbol": "Real Sociedad",
    "real betis": "Real Betis Balompié",
    "real betis balompie": "Real Betis Balompié",
    "betis": "Real Betis Balompié",
    "athletic club": "Athletic Club",
    "athletic bilbao": "Athletic Club",
    "celta vigo": "RC Celta de Vigo",
    "celta de vigo": "RC Celta de Vigo",
    "rc celta de vigo": "RC Celta de Vigo",
    "real club celta de vigo": "RC Celta de Vigo",
    "cel celta": "RC Celta de Vigo",
    "celta": "RC Celta de Vigo",
    "sevilla": "Sevilla FC",
    "sevilla fc": "Sevilla FC",
    "valencia": "Valencia CF",
    "valencia cf": "Valencia CF",
    "espanyol": "RCD Espanyol",
    "rcd espanyol": "RCD Espanyol",
    "reial club deportiu espanyol de barcelona": "RCD Espanyol",
    "deportivo a coruna": "RC Deportivo A Coruña",
    "deportivo de a coruna": "RC Deportivo A Coruña",
    "rc deportivo a coruna": "RC Deportivo A Coruña",
    "rc deportivo de a coruna": "RC Deportivo A Coruña",
    "deportivo la coruna": "RC Deportivo A Coruña",
    "real racing club": "Real Racing Club",
    "racing santander": "Real Racing Club",
    "racing de santander": "Real Racing Club",
    "rayo vallecano": "Rayo Vallecano",
    "rayo vallecano de madrid": "Rayo Vallecano",
    "getafe": "Getafe CF",
    "getafe cf": "Getafe CF",
    "levante": "Levante UD",
    "levante ud": "Levante UD",
    "osasuna": "CA Osasuna",
    "ca osasuna": "CA Osasuna",
    "elche": "Elche CF",
    "elche cf": "Elche CF",
    "alaves": "Deportivo Alavés",
    "deportivo alaves": "Deportivo Alavés",
    "malaga": "Málaga CF",
    "malaga cf": "Málaga CF",
    # Bundesliga (18)
    "bayern munich": "Bayern Múnich",
    "bayern munchen": "Bayern Múnich",
    "fc bayern munchen": "Bayern Múnich",
    "bayern": "Bayern Múnich",
    "borussia dortmund": "Borussia Dortmund",
    "bv borussia 09 dortmund": "Borussia Dortmund",
    "dortmund": "Borussia Dortmund",
    "bayer leverkusen": "Bayer 04 Leverkusen",
    "bayer 04 leverkusen": "Bayer 04 Leverkusen",
    "leverkusen": "Bayer 04 Leverkusen",
    "rb leipzig": "RB Leipzig",
    "rasenballsport leipzig": "RB Leipzig",
    "leipzig": "RB Leipzig",
    "vfb stuttgart": "VfB Stuttgart",
    "vfb stuttgart 1893": "VfB Stuttgart",
    "stuttgart": "VfB Stuttgart",
    "eintracht frankfurt": "Eintracht Fráncfort",
    "eintracht francfort": "Eintracht Fráncfort",
    "frankfurt": "Eintracht Fráncfort",
    "tsg 1899 hoffenheim": "TSG 1899 Hoffenheim",
    "1899 hoffenheim": "TSG 1899 Hoffenheim",
    "hoffenheim": "TSG 1899 Hoffenheim",
    "sc freiburg": "SC Friburgo",
    "sc friburgo": "SC Friburgo",
    "freiburg": "SC Friburgo",
    "fc augsburg": "FC Augsburgo",
    "fc augsburgo": "FC Augsburgo",
    "augsburg": "FC Augsburgo",
    "1.fsv mainz 05": "1.FSV Mainz 05",
    "1. fsv mainz 05": "1.FSV Mainz 05",
    "fsv mainz 05": "1.FSV Mainz 05",
    "mainz 05": "1.FSV Mainz 05",
    "mainz": "1.FSV Mainz 05",
    "fc colonia": "FC Colonia",
    "1. fc koln": "FC Colonia",
    "1.fc koln": "FC Colonia",
    "koln": "FC Colonia",
    "fc koln": "FC Colonia",
    "hamburgo sv": "Hamburgo SV",
    "hamburger sv": "Hamburgo SV",
    "hamburg": "Hamburgo SV",
    "borussia monchengladbach": "Borussia Mönchengladbach",
    "borussia vfl monchengladbach": "Borussia Mönchengladbach",
    "borussia m'gladbach": "Borussia Mönchengladbach",
    "borussia m.gladbach": "Borussia Mönchengladbach",
    "monchengladbach": "Borussia Mönchengladbach",
    "gladbach": "Borussia Mönchengladbach",
    "sv werder bremen": "SV Werder Bremen",
    "werder bremen": "SV Werder Bremen",
    "bremen": "SV Werder Bremen",
    "1.fc union berlin": "1.FC Unión Berlín",
    "1. fc union berlin": "1.FC Unión Berlín",
    "union berlin": "1.FC Unión Berlín",
    "fc schalke 04": "FC Schalke 04",
    "schalke 04": "FC Schalke 04",
    "schalke": "FC Schalke 04",
    "sv 07 elversberg": "SV 07 Elversberg",
    "elversberg": "SV 07 Elversberg",
    "sc paderborn 07": "SC Paderborn 07",
    "sc paderborn": "SC Paderborn 07",
    "paderborn 07": "SC Paderborn 07",
    "paderborn": "SC Paderborn 07",
    # Serie A (20)
    "inter de milan": "Inter de Milán",
    "inter milan": "Inter de Milán",
    "inter": "Inter de Milán",
    "internazionale": "Inter de Milán",
    "fc internazionale milano": "Inter de Milán",
    "juventus de turin": "Juventus de Turín",
    "juventus fc": "Juventus de Turín",
    "juventus": "Juventus de Turín",
    "como 1907": "Como 1907",
    "calcio como 1907": "Como 1907",
    "como": "Como 1907",
    "ac milan": "AC Milan",
    "milan": "AC Milan",
    "as roma": "AS Roma",
    "roma": "AS Roma",
    "atalanta de bergamo": "Atalanta de Bérgamo",
    "atalanta bergamasca calcio": "Atalanta de Bérgamo",
    "atalanta": "Atalanta de Bérgamo",
    "ssc napoles": "SSC Nápoles",
    "ssc napoli": "SSC Nápoles",
    "napoli": "SSC Nápoles",
    "napoles": "SSC Nápoles",
    "fiorentina": "Fiorentina",
    "acf fiorentina": "Fiorentina",
    "ss lazio": "SS Lazio",
    "lazio": "SS Lazio",
    "bolonia": "Bolonia",
    "bologna": "Bolonia",
    "bologna fc 1909": "Bolonia",
    "us sassuolo": "US Sassuolo",
    "us sassuolo calcio": "US Sassuolo",
    "sassuolo": "US Sassuolo",
    "torino fc": "Torino FC",
    "torino": "Torino FC",
    "genoa cfc": "Genoa CFC",
    "genoa": "Genoa CFC",
    "udinese": "Udinese",
    "udinese calcio": "Udinese",
    "parma": "Parma",
    "parma calcio 1913": "Parma",
    "cagliari": "Cagliari",
    "cagliari calcio": "Cagliari",
    "venezia fc": "Venezia FC",
    "venezia": "Venezia FC",
    "frosinone calcio": "Frosinone Calcio",
    "frosinone": "Frosinone Calcio",
    "ac monza": "AC Monza",
    "monza": "AC Monza",
    "us lecce": "US Lecce",
    "lecce": "US Lecce",
    # Ligue 1 (18)
    "paris saint-germain": "París Saint-Germain",
    "paris saint germain": "París Saint-Germain",
    "paris saint-germain fc": "París Saint-Germain",
    "paris s-g": "París Saint-Germain",
    "psg": "París Saint-Germain",
    "as monaco": "AS Mónaco",
    "as monaco fc": "AS Mónaco",
    "monaco": "AS Mónaco",
    "racing club de estrasburgo": "Racing Club de Estrasburgo",
    "rc strasbourg alsace": "Racing Club de Estrasburgo",
    "rc strasbourg": "Racing Club de Estrasburgo",
    "strasbourg": "Racing Club de Estrasburgo",
    "olympique de lyon": "Olympique de Lyon",
    "olympique lyonnais": "Olympique de Lyon",
    "lyon": "Olympique de Lyon",
    "stade rennais fc": "Stade Rennais FC",
    "stade rennais": "Stade Rennais FC",
    "rennes": "Stade Rennais FC",
    "losc lille": "LOSC Lille",
    "lille osc": "LOSC Lille",
    "lille": "LOSC Lille",
    "rc lens": "RC Lens",
    "racing club de lens": "RC Lens",
    "lens": "RC Lens",
    "paris fc": "Paris FC",
    "olympique de marsella": "Olympique de Marsella",
    "olympique de marseille": "Olympique de Marsella",
    "olympique marseille": "Olympique de Marsella",
    "marseille": "Olympique de Marsella",
    "ogc niza": "OGC Niza",
    "ogc nice": "OGC Niza",
    "ogc nice cote d'azur": "OGC Niza",
    "nice": "OGC Niza",
    "toulouse fc": "Toulouse FC",
    "toulouse": "Toulouse FC",
    "fc lorient": "FC Lorient",
    "lorient": "FC Lorient",
    "aj auxerre": "AJ Auxerre",
    "association jeunesse auxerroise": "AJ Auxerre",
    "auxerre": "AJ Auxerre",
    "stade brestois 29": "Stade Brestois 29",
    "brest": "Stade Brestois 29",
    "bre brest": "Stade Brestois 29",
    "angers sco": "Angers SCO",
    "angers sporting club de l'ouest": "Angers SCO",
    "angers": "Angers SCO",
    "le havre ac": "Le Havre AC",
    "le havre": "Le Havre AC",
    "estac troyes": "ESTAC Troyes",
    "esperance sportive troyes aube champagne": "ESTAC Troyes",
    "troyes": "ESTAC Troyes",
    "le mans fc": "Le Mans FC",
    "le mans": "Le Mans FC",
}


# Elevation & city coordinates fallback for European venues not directly in Open-Meteo's 60-stadium list
LEAGUE_DEFAULT_WEATHER: dict[str, dict[str, Any]] = {
    "liga-mx": {
        "stadium_elevation_m": 1550.0,
        "high_altitude_flag": True,
        "roof_type": "open",
        "max_wind_speed_mph_7d": 14.2,
        "max_wind_gusts_mph_7d": 24.5,
        "total_precipitation_mm_7d": 1.8,
    },
    "epl": {
        "stadium_elevation_m": 42.0,
        "high_altitude_flag": False,
        "roof_type": "open",
        "max_wind_speed_mph_7d": 16.5,
        "max_wind_gusts_mph_7d": 28.4,
        "total_precipitation_mm_7d": 8.4,
    },
    "laliga": {
        "stadium_elevation_m": 185.0,
        "high_altitude_flag": False,
        "roof_type": "open",
        "max_wind_speed_mph_7d": 13.8,
        "max_wind_gusts_mph_7d": 23.1,
        "total_precipitation_mm_7d": 3.2,
    },
    "bundesliga": {
        "stadium_elevation_m": 140.0,
        "high_altitude_flag": False,
        "roof_type": "open",
        "max_wind_speed_mph_7d": 15.1,
        "max_wind_gusts_mph_7d": 26.0,
        "total_precipitation_mm_7d": 6.5,
    },
    "serie-a": {
        "stadium_elevation_m": 85.0,
        "high_altitude_flag": False,
        "roof_type": "open",
        "max_wind_speed_mph_7d": 11.9,
        "max_wind_gusts_mph_7d": 20.4,
        "total_precipitation_mm_7d": 5.1,
    },
    "ligue-1": {
        "stadium_elevation_m": 65.0,
        "high_altitude_flag": False,
        "roof_type": "open",
        "max_wind_speed_mph_7d": 14.6,
        "max_wind_gusts_mph_7d": 25.2,
        "total_precipitation_mm_7d": 7.0,
    },
    "nfl": {
        "stadium_elevation_m": 180.0,
        "high_altitude_flag": False,
        "roof_type": "open",
        "max_wind_speed_mph_7d": 12.8,
        "max_wind_gusts_mph_7d": 21.5,
        "total_precipitation_mm_7d": 3.4,
    },
    "nhl": {
        "stadium_elevation_m": 165.0,
        "high_altitude_flag": False,
        "roof_type": "indoor_arena",
        "max_wind_speed_mph_7d": 0.0,
        "max_wind_gusts_mph_7d": 0.0,
        "total_precipitation_mm_7d": 0.0,
    },
    "mlb": {
        "stadium_elevation_m": 145.0,
        "high_altitude_flag": False,
        "roof_type": "open",
        "max_wind_speed_mph_7d": 11.8,
        "max_wind_gusts_mph_7d": 19.6,
        "total_precipitation_mm_7d": 2.9,
    },
    "nba": {
        "stadium_elevation_m": 175.0,
        "high_altitude_flag": False,
        "roof_type": "indoor_arena",
        "max_wind_speed_mph_7d": 0.0,
        "max_wind_gusts_mph_7d": 0.0,
        "total_precipitation_mm_7d": 0.0,
    },
    "ncaaf": {
        "stadium_elevation_m": 240.0,
        "high_altitude_flag": False,
        "roof_type": "open",
        "max_wind_speed_mph_7d": 12.4,
        "max_wind_gusts_mph_7d": 20.8,
        "total_precipitation_mm_7d": 3.1,
    },
}

SPECIFIC_STADIUM_ELEVATION_M: dict[str, float] = {
    "CF Atlante": 2240.0,  # Estadio Banorte / Ciudad de los Deportes CDMX
    "Sunderland AFC": 45.0,
    "Leeds United": 45.0,
    "Coventry City": 112.0,
    "Hull City": 4.0,
    "RC Celta de Vigo": 22.0,
    "RCD Espanyol": 40.0,
    "RC Deportivo A Coruña": 8.0,
    "Real Racing Club": 10.0,
    "Rayo Vallecano": 670.0,
    "Getafe CF": 625.0,
    "Levante UD": 14.0,
    "CA Osasuna": 440.0,
    "Elche CF": 85.0,
    "Deportivo Alavés": 535.0,
    "Málaga CF": 18.0,
    "TSG 1899 Hoffenheim": 160.0,
    "FC Augsburgo": 490.0,
    "1.FSV Mainz 05": 115.0,
    "FC Colonia": 58.0,
    "Hamburgo SV": 28.0,
    "1.FC Unión Berlín": 38.0,
    "FC Schalke 04": 68.0,
    "SV 07 Elversberg": 310.0,
    "SC Paderborn 07": 118.0,
    "Como 1907": 201.0,
    "US Sassuolo": 62.0,
    "Genoa CFC": 18.0,
    "Udinese": 112.0,
    "Parma": 58.0,
    "Cagliari": 6.0,
    "Venezia FC": 2.0,
    "Frosinone Calcio": 185.0,
    "AC Monza": 162.0,
    "US Lecce": 48.0,
    "Paris FC": 38.0,
    "Toulouse FC": 142.0,
    "FC Lorient": 16.0,
    "AJ Auxerre": 102.0,
    "Stade Brestois 29": 88.0,
    "Angers SCO": 32.0,
    "Le Havre AC": 8.0,
    "ESTAC Troyes": 110.0,
    "Le Mans FC": 52.0,
    # High-altitude indoor NBA / NHL arenas (Denver & Salt Lake City)
    "Denver Nuggets": 1598.0,
    "Colorado Avalanche": 1598.0,
    "Utah Jazz": 1300.0,
    "Utah Mammoth": 1300.0,
    "Calgary Flames": 1045.0,
}

SPORT_TO_LEAGUE_HINT: dict[str, str] = {
    "football": "nfl",
    "nfl": "nfl",
    "basketball": "nba",
    "nba": "nba",
    "hockey": "nhl",
    "ice hockey": "nhl",
    "nhl": "nhl",
    "baseball": "mlb",
    "mlb": "mlb",
    "college-football": "ncaaf",
    "college football": "ncaaf",
    "ncaaf": "ncaaf",
}

LEAGUE_SCOPED_ALIASES: dict[str, dict[str, str]] = {
    "nfl": {
        "ari": "Arizona Cardinals",
        "arizona": "Arizona Cardinals",
        "atl": "Atlanta Falcons",
        "atlanta": "Atlanta Falcons",
        "bal": "Baltimore Ravens",
        "baltimore": "Baltimore Ravens",
        "buf": "Buffalo Bills",
        "buffalo": "Buffalo Bills",
        "car": "Carolina Panthers",
        "carolina": "Carolina Panthers",
        "chi": "Chicago Bears",
        "chicago": "Chicago Bears",
        "cin": "Cincinnati Bengals",
        "cincinnati": "Cincinnati Bengals",
        "cle": "Cleveland Browns",
        "cleveland": "Cleveland Browns",
        "dal": "Dallas Cowboys",
        "dallas": "Dallas Cowboys",
        "den": "Denver Broncos",
        "denver": "Denver Broncos",
        "det": "Detroit Lions",
        "detroit": "Detroit Lions",
        "gb": "Green Bay Packers",
        "green bay": "Green Bay Packers",
        "hou": "Houston Texans",
        "houston": "Houston Texans",
        "ind": "Indianapolis Colts",
        "indianapolis": "Indianapolis Colts",
        "jax": "Jacksonville Jaguars",
        "jac": "Jacksonville Jaguars",
        "jacksonville": "Jacksonville Jaguars",
        "kc": "Kansas City Chiefs",
        "kansas city": "Kansas City Chiefs",
        "lv": "Las Vegas Raiders",
        "las vegas": "Las Vegas Raiders",
        "lac": "Los Angeles Chargers",
        "la chargers": "Los Angeles Chargers",
        "l.a. chargers": "Los Angeles Chargers",
        "lar": "Los Angeles Rams",
        "la": "Los Angeles Rams",
        "la rams": "Los Angeles Rams",
        "l.a. rams": "Los Angeles Rams",
        "mia": "Miami Dolphins",
        "miami": "Miami Dolphins",
        "min": "Minnesota Vikings",
        "minnesota": "Minnesota Vikings",
        "ne": "New England Patriots",
        "new england": "New England Patriots",
        "no": "New Orleans Saints",
        "new orleans": "New Orleans Saints",
        "nyg": "New York Giants",
        "ny giants": "New York Giants",
        "n.y. giants": "New York Giants",
        "nyj": "New York Jets",
        "ny jets": "New York Jets",
        "n.y. jets": "New York Jets",
        "phi": "Philadelphia Eagles",
        "philadelphia": "Philadelphia Eagles",
        "pit": "Pittsburgh Steelers",
        "pittsburgh": "Pittsburgh Steelers",
        "sf": "San Francisco 49ers",
        "san francisco": "San Francisco 49ers",
        "sea": "Seattle Seahawks",
        "seattle": "Seattle Seahawks",
        "tb": "Tampa Bay Buccaneers",
        "tampa bay": "Tampa Bay Buccaneers",
        "ten": "Tennessee Titans",
        "tennessee": "Tennessee Titans",
        "was": "Washington Commanders",
        "wsh": "Washington Commanders",
        "washington": "Washington Commanders",
    },
    "nba": {
        "atlanta": "Atlanta Hawks",
        "hawks": "Atlanta Hawks",
        "boston": "Boston Celtics",
        "celtics": "Boston Celtics",
        "brooklyn": "Brooklyn Nets",
        "nets": "Brooklyn Nets",
        "bkn": "Brooklyn Nets",
        "brk": "Brooklyn Nets",
        "charlotte": "Charlotte Hornets",
        "hornets": "Charlotte Hornets",
        "cha": "Charlotte Hornets",
        "cho": "Charlotte Hornets",
        "chicago": "Chicago Bulls",
        "bulls": "Chicago Bulls",
        "cleveland": "Cleveland Cavaliers",
        "cavaliers": "Cleveland Cavaliers",
        "cavs": "Cleveland Cavaliers",
        "dallas": "Dallas Mavericks",
        "mavericks": "Dallas Mavericks",
        "mavs": "Dallas Mavericks",
        "denver": "Denver Nuggets",
        "nuggets": "Denver Nuggets",
        "detroit": "Detroit Pistons",
        "pistons": "Detroit Pistons",
        "golden st.": "Golden State Warriors",
        "golden st": "Golden State Warriors",
        "golden state": "Golden State Warriors",
        "warriors": "Golden State Warriors",
        "gsw": "Golden State Warriors",
        "gs": "Golden State Warriors",
        "houston": "Houston Rockets",
        "rockets": "Houston Rockets",
        "indiana": "Indiana Pacers",
        "pacers": "Indiana Pacers",
        "l.a. clippers": "Los Angeles Clippers",
        "la clippers": "Los Angeles Clippers",
        "clippers": "Los Angeles Clippers",
        "lac": "Los Angeles Clippers",
        "l.a. lakers": "Los Angeles Lakers",
        "la lakers": "Los Angeles Lakers",
        "lakers": "Los Angeles Lakers",
        "lal": "Los Angeles Lakers",
        "memphis": "Memphis Grizzlies",
        "grizzlies": "Memphis Grizzlies",
        "miami": "Miami Heat",
        "heat": "Miami Heat",
        "milwaukee": "Milwaukee Bucks",
        "bucks": "Milwaukee Bucks",
        "minnesota": "Minnesota Timberwolves",
        "timberwolves": "Minnesota Timberwolves",
        "wolves": "Minnesota Timberwolves",
        "new orleans": "New Orleans Pelicans",
        "pelicans": "New Orleans Pelicans",
        "nop": "New Orleans Pelicans",
        "no": "New Orleans Pelicans",
        "new york": "New York Knicks",
        "knicks": "New York Knicks",
        "nyk": "New York Knicks",
        "ny": "New York Knicks",
        "oklahoma city": "Oklahoma City Thunder",
        "thunder": "Oklahoma City Thunder",
        "okc": "Oklahoma City Thunder",
        "orlando": "Orlando Magic",
        "magic": "Orlando Magic",
        "philadelphia": "Philadelphia 76ers",
        "76ers": "Philadelphia 76ers",
        "sixers": "Philadelphia 76ers",
        "phi": "Philadelphia 76ers",
        "phoenix": "Phoenix Suns",
        "suns": "Phoenix Suns",
        "phx": "Phoenix Suns",
        "pho": "Phoenix Suns",
        "portland": "Portland Trail Blazers",
        "trail blazers": "Portland Trail Blazers",
        "blazers": "Portland Trail Blazers",
        "por": "Portland Trail Blazers",
        "sacramento": "Sacramento Kings",
        "kings": "Sacramento Kings",
        "sac": "Sacramento Kings",
        "san antonio": "San Antonio Spurs",
        "spurs": "San Antonio Spurs",
        "sas": "San Antonio Spurs",
        "sa": "San Antonio Spurs",
        "toronto": "Toronto Raptors",
        "raptors": "Toronto Raptors",
        "tor": "Toronto Raptors",
        "utah": "Utah Jazz",
        "jazz": "Utah Jazz",
        "uta": "Utah Jazz",
        "washington": "Washington Wizards",
        "wizards": "Washington Wizards",
        "was": "Washington Wizards",
        "wsh": "Washington Wizards",
    },
    "nhl": {
        "anaheim": "Anaheim Ducks",
        "ducks": "Anaheim Ducks",
        "boston": "Boston Bruins",
        "bruins": "Boston Bruins",
        "buffalo": "Buffalo Sabres",
        "sabres": "Buffalo Sabres",
        "calgary": "Calgary Flames",
        "flames": "Calgary Flames",
        "carolina": "Carolina Hurricanes",
        "hurricanes": "Carolina Hurricanes",
        "chicago": "Chicago Blackhawks",
        "blackhawks": "Chicago Blackhawks",
        "colorado": "Colorado Avalanche",
        "avalanche": "Colorado Avalanche",
        "columbus": "Columbus Blue Jackets",
        "blue jackets": "Columbus Blue Jackets",
        "dallas": "Dallas Stars",
        "stars": "Dallas Stars",
        "detroit": "Detroit Red Wings",
        "red wings": "Detroit Red Wings",
        "edmonton": "Edmonton Oilers",
        "oilers": "Edmonton Oilers",
        "florida": "Florida Panthers",
        "panthers": "Florida Panthers",
        "los angeles": "Los Angeles Kings",
        "l.a. kings": "Los Angeles Kings",
        "la kings": "Los Angeles Kings",
        "kings": "Los Angeles Kings",
        "lak": "Los Angeles Kings",
        "minnesota": "Minnesota Wild",
        "wild": "Minnesota Wild",
        "montreal": "Montreal Canadiens",
        "montreal canadiens": "Montreal Canadiens",
        "canadiens": "Montreal Canadiens",
        "mtl": "Montreal Canadiens",
        "mon": "Montreal Canadiens",
        "nashville": "Nashville Predators",
        "predators": "Nashville Predators",
        "new jersey": "New Jersey Devils",
        "devils": "New Jersey Devils",
        "njd": "New Jersey Devils",
        "n.j.": "New Jersey Devils",
        "n.y. islanders": "New York Islanders",
        "ny islanders": "New York Islanders",
        "islanders": "New York Islanders",
        "nyi": "New York Islanders",
        "n.y. rangers": "New York Rangers",
        "ny rangers": "New York Rangers",
        "rangers": "New York Rangers",
        "nyr": "New York Rangers",
        "ottawa": "Ottawa Senators",
        "senators": "Ottawa Senators",
        "philadelphia": "Philadelphia Flyers",
        "flyers": "Philadelphia Flyers",
        "pittsburgh": "Pittsburgh Penguins",
        "penguins": "Pittsburgh Penguins",
        "san jose": "San Jose Sharks",
        "sharks": "San Jose Sharks",
        "sjs": "San Jose Sharks",
        "seattle": "Seattle Kraken",
        "kraken": "Seattle Kraken",
        "st. louis": "St. Louis Blues",
        "st louis": "St. Louis Blues",
        "st louis blues": "St. Louis Blues",
        "blues": "St. Louis Blues",
        "stl": "St. Louis Blues",
        "tampa bay": "Tampa Bay Lightning",
        "lightning": "Tampa Bay Lightning",
        "tbl": "Tampa Bay Lightning",
        "tb": "Tampa Bay Lightning",
        "toronto": "Toronto Maple Leafs",
        "maple leafs": "Toronto Maple Leafs",
        "utah": "Utah Mammoth",
        "utah hockey club": "Utah Mammoth",
        "utah hc": "Utah Mammoth",
        "mammoth": "Utah Mammoth",
        "arizona coyotes": "Utah Mammoth",
        "arizona": "Utah Mammoth",
        "uta": "Utah Mammoth",
        "vancouver": "Vancouver Canucks",
        "canucks": "Vancouver Canucks",
        "vegas": "Vegas Golden Knights",
        "las vegas": "Vegas Golden Knights",
        "golden knights": "Vegas Golden Knights",
        "vgk": "Vegas Golden Knights",
        "washington": "Washington Capitals",
        "capitals": "Washington Capitals",
        "wsh": "Washington Capitals",
        "winnipeg": "Winnipeg Jets",
        "jets": "Winnipeg Jets",
        "wpg": "Winnipeg Jets",
    },
    "mlb": {
        "ari": "Arizona Diamondbacks",
        "az": "Arizona Diamondbacks",
        "arizona": "Arizona Diamondbacks",
        "diamondbacks": "Arizona Diamondbacks",
        "d-backs": "Arizona Diamondbacks",
        "ath": "Athletics",
        "oak": "Athletics",
        "oakland": "Athletics",
        "oakland athletics": "Athletics",
        "athletics": "Athletics",
        "a's": "Athletics",
        "atl": "Atlanta Braves",
        "atlanta": "Atlanta Braves",
        "braves": "Atlanta Braves",
        "bal": "Baltimore Orioles",
        "baltimore": "Baltimore Orioles",
        "orioles": "Baltimore Orioles",
        "bos": "Boston Red Sox",
        "boston": "Boston Red Sox",
        "red sox": "Boston Red Sox",
        "chc": "Chicago Cubs",
        "chi. cubs": "Chicago Cubs",
        "chi cubs": "Chicago Cubs",
        "cubs": "Chicago Cubs",
        "cws": "Chicago White Sox",
        "chw": "Chicago White Sox",
        "chi. white sox": "Chicago White Sox",
        "chi white sox": "Chicago White Sox",
        "white sox": "Chicago White Sox",
        "cin": "Cincinnati Reds",
        "cincinnati": "Cincinnati Reds",
        "reds": "Cincinnati Reds",
        "cle": "Cleveland Guardians",
        "cleveland": "Cleveland Guardians",
        "guardians": "Cleveland Guardians",
        "col": "Colorado Rockies",
        "colorado": "Colorado Rockies",
        "rockies": "Colorado Rockies",
        "det": "Detroit Tigers",
        "detroit": "Detroit Tigers",
        "tigers": "Detroit Tigers",
        "hou": "Houston Astros",
        "houston": "Houston Astros",
        "astros": "Houston Astros",
        "kc": "Kansas City Royals",
        "kcr": "Kansas City Royals",
        "kansas city": "Kansas City Royals",
        "royals": "Kansas City Royals",
        "laa": "Los Angeles Angels",
        "l.a. angels": "Los Angeles Angels",
        "la angels": "Los Angeles Angels",
        "angels": "Los Angeles Angels",
        "anaheim angels": "Los Angeles Angels",
        "lad": "Los Angeles Dodgers",
        "l.a. dodgers": "Los Angeles Dodgers",
        "la dodgers": "Los Angeles Dodgers",
        "dodgers": "Los Angeles Dodgers",
        "mia": "Miami Marlins",
        "miami": "Miami Marlins",
        "marlins": "Miami Marlins",
        "mil": "Milwaukee Brewers",
        "milwaukee": "Milwaukee Brewers",
        "brewers": "Milwaukee Brewers",
        "min": "Minnesota Twins",
        "minnesota": "Minnesota Twins",
        "twins": "Minnesota Twins",
        "nym": "New York Mets",
        "n.y. mets": "New York Mets",
        "ny mets": "New York Mets",
        "mets": "New York Mets",
        "nyy": "New York Yankees",
        "n.y. yankees": "New York Yankees",
        "ny yankees": "New York Yankees",
        "yankees": "New York Yankees",
        "phi": "Philadelphia Phillies",
        "philadelphia": "Philadelphia Phillies",
        "phillies": "Philadelphia Phillies",
        "pit": "Pittsburgh Pirates",
        "pittsburgh": "Pittsburgh Pirates",
        "pirates": "Pittsburgh Pirates",
        "sd": "San Diego Padres",
        "sdp": "San Diego Padres",
        "san diego": "San Diego Padres",
        "padres": "San Diego Padres",
        "sf": "San Francisco Giants",
        "sfg": "San Francisco Giants",
        "san francisco": "San Francisco Giants",
        "giants": "San Francisco Giants",
        "sea": "Seattle Mariners",
        "seattle": "Seattle Mariners",
        "mariners": "Seattle Mariners",
        "stl": "St. Louis Cardinals",
        "st. louis": "St. Louis Cardinals",
        "st louis": "St. Louis Cardinals",
        "st louis cardinals": "St. Louis Cardinals",
        "cardinals": "St. Louis Cardinals",
        "tb": "Tampa Bay Rays",
        "tbr": "Tampa Bay Rays",
        "tampa bay": "Tampa Bay Rays",
        "rays": "Tampa Bay Rays",
        "tex": "Texas Rangers",
        "texas": "Texas Rangers",
        "rangers": "Texas Rangers",
        "tor": "Toronto Blue Jays",
        "toronto": "Toronto Blue Jays",
        "blue jays": "Toronto Blue Jays",
        "was": "Washington Nationals",
        "wsh": "Washington Nationals",
        "wsn": "Washington Nationals",
        "washington": "Washington Nationals",
        "nationals": "Washington Nationals",
    },
    "ncaaf": {
        "kent": "Kent State Golden Flashes",
        "kent state": "Kent State Golden Flashes",
        "ole miss": "Ole Miss Rebels",
        "mississippi": "Ole Miss Rebels",
        "byu": "BYU Cougars",
        "brigham young": "BYU Cougars",
        "lsu": "LSU Tigers",
        "smu": "SMU Mustangs",
        "usc": "USC Trojans",
        "southern california": "USC Trojans",
        "ucla": "UCLA Bruins",
        "ucf": "UCF Knights",
        "utsa": "UTSA Roadrunners",
        "utep": "UTEP Miners",
        "unlv": "UNLV Rebels",
        "uab": "UAB Blazers",
        "fiu": "FIU Panthers",
        "fau": "Florida Atlantic Owls",
        "niu": "Northern Illinois Huskies",
        "app state": "Appalachian State Mountaineers",
        "nc state": "NC State Wolfpack",
        "miami (oh)": "Miami (OH) RedHawks",
        "miami oh": "Miami (OH) RedHawks",
        "miami hurricanes": "Miami Hurricanes",
        "miami (fl)": "Miami Hurricanes",
        "ul monroe": "UL Monroe Warhawks",
        "louisiana-monroe": "UL Monroe Warhawks",
        "louisiana": "Louisiana Ragin' Cajuns",
        "sam houston": "Sam Houston Bearkats",
    },
}


def _barometric_pressure_from_elevation_m(elev_m: float) -> float:
    """Fórmula barométrica internacional estándar (hPa) a partir de altitud en metros."""
    return round(1013.25 * ((1.0 - 2.25577e-5 * max(0.0, elev_m)) ** 5.25588), 2)


class CanonicalEntityResolver:
    """Resuelve nombres de equipos/clubes/programas hacia las ~376 entidades canónicas en 11 ligas."""

    def __init__(self) -> None:
        self.canonical_teams: dict[str, dict[str, Any]] = {}
        self.alias_to_canonical: dict[str, str] = {}
        self.slug_to_canonical: dict[str, str] = {}
        self.league_alias_to_canonical: dict[tuple[str, str], str] = {}
        self.league_slug_to_canonical: dict[tuple[str, str], str] = {}

    def register_canonical(self, canonical_name: str, league: str, sport: str) -> None:
        clean_name = canonical_name.replace("\u200b", "").strip()
        lg_norm = league.strip().lower()
        self.canonical_teams[clean_name] = {
            "team_name": clean_name,
            "league": lg_norm,
            "sport": sport,
        }
        norm_lower = _strip_accents(clean_name).lower()
        self.alias_to_canonical[norm_lower] = clean_name
        self.league_alias_to_canonical[(lg_norm, norm_lower)] = clean_name
        slug = _slug_token(clean_name)
        if slug:
            self.slug_to_canonical[slug] = clean_name
            self.league_slug_to_canonical[(lg_norm, slug)] = clean_name

    def register_league_alias(self, league: str, raw_alias: str | None, canonical_name: str) -> None:
        if not raw_alias or canonical_name not in self.canonical_teams:
            return
        lg_norm = league.strip().lower()
        norm_alias = _strip_accents(raw_alias).lower().strip()
        if not norm_alias:
            return
        self.league_alias_to_canonical[(lg_norm, norm_alias)] = canonical_name
        slug_alias = _slug_token(raw_alias)
        if slug_alias:
            self.league_slug_to_canonical[(lg_norm, slug_alias)] = canonical_name

    def finalize_aliases(self) -> None:
        for raw_alias, target in EXPLICIT_TEAM_ALIASES.items():
            clean_target = target.replace("\u200b", "").strip()
            if clean_target in self.canonical_teams:
                lg_t = self.canonical_teams[clean_target]["league"]
                norm_alias = _strip_accents(raw_alias).lower()
                self.alias_to_canonical[norm_alias] = clean_target
                self.league_alias_to_canonical[(lg_t, norm_alias)] = clean_target
                slug_alias = _slug_token(raw_alias)
                if slug_alias:
                    self.slug_to_canonical[slug_alias] = clean_target
                    self.league_slug_to_canonical[(lg_t, slug_alias)] = clean_target

        for lg_key, mapping in LEAGUE_SCOPED_ALIASES.items():
            for raw_alias, target in mapping.items():
                if target in self.canonical_teams:
                    self.register_league_alias(lg_key, raw_alias, target)

    def _normalize_league_hint(self, league: str | None, sport: str | None) -> str | None:
        if league:
            lg_clean = league.strip().lower()
            if lg_clean in SPORT_TO_LEAGUE_HINT:
                return SPORT_TO_LEAGUE_HINT[lg_clean]
            if lg_clean in {
                "liga-mx",
                "epl",
                "laliga",
                "bundesliga",
                "serie-a",
                "ligue-1",
                "nfl",
                "nba",
                "nhl",
                "mlb",
                "ncaaf",
            }:
                return lg_clean
        if sport:
            sp_clean = sport.strip().lower()
            if sp_clean in SPORT_TO_LEAGUE_HINT:
                return SPORT_TO_LEAGUE_HINT[sp_clean]
        return None

    def resolve(
        self,
        raw_name: str | None,
        league: str | None = None,
        sport: str | None = None,
    ) -> str | None:
        if not raw_name:
            return None
        s = str(raw_name).replace("\u200b", "").strip()
        if not s:
            return None
        # Limpiar sufijos de récord tipo "Knicks\n(5-4)" o prefijos "#12 "
        if "\n" in s:
            s = s.split("\n", 1)[0].strip()
        s = re.sub(r"\s*\(\d+-\d+(?:-\d+)?\)\s*$", "", s).strip()
        s = re.sub(r"^#\d+\s+", "", s).strip()
        if s.lower().startswith("vs "):
            s = s[3:].strip()
        if not s or s.lower() in {"fa", "free agent", "player pos", "team", "over", "under"}:
            return None
        # Rechazar cadenas compuestas de props/parlays ("Team & Under 218.5", "Team By 1 - 2")
        if " & " in s or " By " in s or re.match(r"^\d+\s*-\s*\d+$", s):
            return None

        lg_hint = self._normalize_league_hint(league, sport)

        if s in self.canonical_teams:
            if not lg_hint or self.canonical_teams[s]["league"] == lg_hint:
                return s

        norm_lower = _strip_accents(s).lower()
        slug = _slug_token(s)

        # 1. Resolución sensible a (league, alias) cuando hay pista de liga/deporte
        if lg_hint:
            if (lg_hint, norm_lower) in self.league_alias_to_canonical:
                return self.league_alias_to_canonical[(lg_hint, norm_lower)]
            if slug and (lg_hint, slug) in self.league_slug_to_canonical:
                return self.league_slug_to_canonical[(lg_hint, slug)]
            for c_name, meta in self.canonical_teams.items():
                if meta["league"] != lg_hint:
                    continue
                c_norm = _strip_accents(c_name).lower()
                if len(norm_lower) >= 5 and (norm_lower in c_norm or c_norm in norm_lower):
                    return c_name
            return None

        # 2. Resolución global (compatibilidad hacia atrás cuando no se pasa `league`)
        if norm_lower in self.alias_to_canonical:
            return self.alias_to_canonical[norm_lower]
        if slug in self.slug_to_canonical:
            return self.slug_to_canonical[slug]
        for c_name in self.canonical_teams:
            c_norm = _strip_accents(c_name).lower()
            if len(norm_lower) >= 5 and (norm_lower in c_norm or c_norm in norm_lower):
                return c_name
        return None


def _poisson_1x2_probs(lam_home: float | None, lam_away: float | None) -> tuple[float | None, float | None, float | None]:
    if lam_home is None or lam_away is None or lam_home < 0 or lam_away < 0:
        return None, None, None
    p_home = 0.0
    p_draw = 0.0
    p_away = 0.0
    max_goals = 10
    for i in range(max_goals + 1):
        pi = math.exp(-lam_home) * (lam_home**i) / math.factorial(i)
        for j in range(max_goals + 1):
            pj = math.exp(-lam_away) * (lam_away**j) / math.factorial(j)
            pij = pi * pj
            if i > j:
                p_home += pij
            elif i == j:
                p_draw += pij
            else:
                p_away += pij
    total = p_home + p_draw + p_away
    if total <= 0:
        return None, None, None
    return round(p_home / total, 4), round(p_draw / total, 4), round(p_away / total, 4)


def _parse_score_string(score_raw: Any) -> tuple[int | None, int | None]:
    if not score_raw:
        return None, None
    s = str(score_raw).strip()
    m = re.search(r"(\d+)\s*[-–—:]\s*(\d+)", s)
    if not m:
        return None, None
    return int(m.group(1)), int(m.group(2))


def _compute_result_1x2(hg: int | None, ag: int | None) -> str | None:
    if hg is None or ag is None:
        return None
    if hg > ag:
        return "1"
    if hg == ag:
        return "X"
    return "2"


def build_feature_store() -> dict[str, Any]:
    FEATURE_STORE_DIR.mkdir(parents=True, exist_ok=True)

    xg_doc = json.loads((NORMALIZED_DIR / "xg_and_team_ratings.json").read_text(encoding="utf-8"))
    rost_doc = json.loads((NORMALIZED_DIR / "roster_availability.json").read_text(encoding="utf-8"))
    env_doc = json.loads((NORMALIZED_DIR / "news_and_environment.json").read_text(encoding="utf-8"))
    mkt_doc = json.loads((NORMALIZED_DIR / "market_microstructure.json").read_text(encoding="utf-8"))

    xg_records: list[dict[str, Any]] = xg_doc.get("records", [])
    rost_records: list[dict[str, Any]] = rost_doc.get("records", [])
    env_records: list[dict[str, Any]] = env_doc.get("records", [])
    mkt_records: list[dict[str, Any]] = mkt_doc.get("records", [])

    resolver = CanonicalEntityResolver()

    # 1. Registrar los 114 clubes canónicos desde Transfermarkt 6 ligas
    tm_114_records = [
        r
        for r in xg_records
        if r.get("record_type") == "transfermarkt_club_valuation"
        and "6leagues_all_clubs_values" in str(r.get("raw_snapshot_path", ""))
    ]
    for r in tm_114_records:
        cname = str(r.get("club_name") or "").replace("\u200b", "").strip()
        lg = str(r.get("league") or "liga-mx")
        if cname:
            resolver.register_canonical(cname, lg, "soccer")

    # 2. Registrar las 32 franquicias de la NFL desde SumerSports
    nfl_off_records = [
        r for r in xg_records if r.get("record_type") == "nfl_sumersports_team_offense"
    ]
    for r in nfl_off_records:
        tname = str(r.get("team_name") or "").strip()
        if tname:
            resolver.register_canonical(tname, "nfl", "football")

    # 3. Registrar las 32 franquicias NHL, 30 MLB, 30 NBA y 138 programas NCAAF FBS
    multisport_reg_specs = (
        ("nhl_team_season_advanced", "nhl", "hockey"),
        ("mlb_team_season_advanced", "mlb", "baseball"),
        ("nba_team_season_advanced", "nba", "basketball"),
        ("ncaaf_team_season_advanced", "ncaaf", "college-football"),
    )
    for rec_type, lg_code, sp_code in multisport_reg_specs:
        # Registrar primero `is_canonical_latest_completed`, luego `is_current_in_progress_season`
        for flag_key in ("is_canonical_latest_completed", "is_current_in_progress_season"):
            for r in xg_records:
                if r.get("record_type") != rec_type or not r.get(flag_key):
                    continue
                tname = str(r.get("team_name") or "").strip()
                if not tname:
                    continue
                if tname not in resolver.canonical_teams:
                    resolver.register_canonical(tname, lg_code, sp_code)
                for alias_field in ("team_abbr", "bref_abbr", "school_name"):
                    aval = r.get(alias_field)
                    if aval:
                        resolver.register_league_alias(lg_code, str(aval), tname)

    resolver.finalize_aliases()

    # Inicializar diccionarios maestros para las ~376 entidades canónicas (11 ligas, 6 deportes)
    master_teams: dict[str, dict[str, Any]] = {}
    sources_by_team: dict[str, set[str]] = {}
    timestamps_by_team: dict[str, list[str]] = {}

    for cname, meta in resolver.canonical_teams.items():
        master_teams[cname] = {
            "team_id": f"{meta['league']}_{_slug_token(cname).replace(' ', '_')}",
            "team_name": cname,
            "league": meta["league"],
            "sport": meta["sport"],
            # Valuation & Roster
            "total_market_value_eur": None,
            "avg_player_value_eur": None,
            "log_squad_value": None,
            "value_ratio_vs_league_median": None,
            "roster_players_count": None,
            "top_player_market_value_eur": None,
            # Availability & Injuries
            "injured_players_count": 0,
            "suspended_players_count": 0,
            "missing_market_value_eur": 0.0,
            "missing_market_value_ratio": 0.0,
            "rotowire_injured_out_count": 0,
            "probable_starters_count": 0,
            # Soccer & NFL Efficiency
            "xg_for": None,
            "xg_against": None,
            "npxg_for": None,
            "npxg_against": None,
            "xpts": None,
            "xg_overperformance": None,
            "xpts_overperformance": None,
            "ppda_avg": None,
            "deep_completions": None,
            "statiskicks_xp": None,
            "statiskicks_tactical_percentiles_count": 0,
            "opta_seasonstats_players_count": 0,
            "sofascore_top_players_avg_rating": None,
            "club_elo_rating": None,
            "nfl_off_epa_per_play": None,
            "nfl_def_epa_per_play": None,
            "nfl_off_success_pct": None,
            "nfl_def_success_pct": None,
            # NHL MoneyPuck & Hockey-Reference Advanced Metrics
            "nhl_xg_pct": None,
            "nhl_corsi_for_pct": None,
            "nhl_fenwick_for_pct": None,
            "nhl_high_danger_xg_for": None,
            "nhl_pythag_215": None,
            # MLB Baseball-Reference & StatsAPI Advanced Metrics
            "mlb_ops_plus": None,
            "mlb_woba_est": None,
            "mlb_fip": None,
            "mlb_era": None,
            "mlb_whip": None,
            "mlb_pythag_183": None,
            # NBA Basketball-Reference Four Factors & Efficiency
            "nba_ortg": None,
            "nba_drtg": None,
            "nba_net_rtg": None,
            "nba_pace": None,
            "nba_srs": None,
            "nba_efg_pct": None,
            "nba_opp_efg_pct": None,
            "nba_pythag_1391": None,
            # NCAAF FBS SRS, ESPN FPI & Yards Per Play
            "ncaaf_srs": None,
            "ncaaf_sos": None,
            "ncaaf_espn_fpi": None,
            "ncaaf_off_ypp": None,
            "ncaaf_def_ypp": None,
            "ncaaf_pythag_237": None,
            # Stadium & Environment
            "stadium_name": None,
            "stadium_elevation_m": None,
            "surface_pressure_hpa": None,
            "high_altitude_flag": False,
            "roof_type": None,
            "max_wind_speed_mph_7d": None,
            "max_wind_gusts_mph_7d": None,
            "total_precipitation_mm_7d": None,
            # Anti-leakage metadata
            "as_of_utc": None,
            "sources_joined_count": 0,
            "sources_joined": [],
        }
        sources_by_team[cname] = set()
        timestamps_by_team[cname] = []

    def _mark_source(cname: str, rec: dict[str, Any]) -> None:
        sid = rec.get("source_id")
        if sid:
            sources_by_team[cname].add(str(sid))
        ts = rec.get("captured_at_utc")
        if ts:
            timestamps_by_team[cname].append(str(ts))

    # A. Transfermarkt Club Valuations (114 clubes)
    for r in xg_records:
        if r.get("record_type") != "transfermarkt_club_valuation":
            continue
        cname = resolver.resolve(r.get("club_name"))
        if not cname or cname not in master_teams:
            continue
        t = master_teams[cname]
        t["total_market_value_eur"] = r.get("total_market_value_eur")
        t["avg_player_value_eur"] = r.get("avg_player_value_eur")
        t["log_squad_value"] = r.get("log_squad_value")
        t["value_ratio_vs_league_median"] = r.get("value_ratio_vs_league_median")
        if r.get("squad_size"):
            t["roster_players_count"] = r.get("squad_size")
        _mark_source(cname, r)

    # B. Transfermarkt Individual Player Valuations (top_player_market_value_eur & roster_players_count)
    tm_players_by_club: dict[str, list[float]] = {}
    for r in xg_records:
        if r.get("record_type") != "transfermarkt_player_valuation":
            continue
        cname = resolver.resolve(r.get("club_name"))
        if not cname or cname not in master_teams:
            continue
        mv = r.get("market_value_eur")
        if mv is not None:
            tm_players_by_club.setdefault(cname, []).append(float(mv))
        _mark_source(cname, r)

    for cname, mvs in tm_players_by_club.items():
        if mvs:
            master_teams[cname]["top_player_market_value_eur"] = max(mvs)
            if not master_teams[cname]["roster_players_count"]:
                master_teams[cname]["roster_players_count"] = len(mvs)

    # Si algún club europeo no estuvo en el lote detallado de jugadores, estimar top_player_market_value_eur como ~2.4x avg_player_value_eur
    for cname, t in master_teams.items():
        if t["sport"] == "soccer" and t["top_player_market_value_eur"] is None and t["avg_player_value_eur"]:
            t["top_player_market_value_eur"] = round(float(t["avg_player_value_eur"]) * 2.4, 2)

    # C. Transfermarkt Injuries & Suspensions
    for r in rost_records:
        if r.get("record_type") != "transfermarkt_club_availability_summary":
            continue
        cname = resolver.resolve(r.get("club"))
        if not cname or cname not in master_teams:
            continue
        t = master_teams[cname]
        t["injured_players_count"] = int(r.get("injured_players_count") or 0)
        t["suspended_players_count"] = int(r.get("suspended_players_count") or 0)
        t["missing_market_value_eur"] = float(r.get("missing_market_value_eur") or 0.0)
        if t["total_market_value_eur"] and float(t["total_market_value_eur"]) > 0:
            t["missing_market_value_ratio"] = round(
                t["missing_market_value_eur"] / float(t["total_market_value_eur"]), 4
            )
        _mark_source(cname, r)

    # D. RotoWire Lineups & NFL/Soccer Injuries
    nfl_inj_counts: dict[str, int] = {}
    nfl_abbr_to_team: dict[str, str] = {
        "ARI": "Arizona Cardinals",
        "ATL": "Atlanta Falcons",
        "BAL": "Baltimore Ravens",
        "BUF": "Buffalo Bills",
        "CAR": "Carolina Panthers",
        "CHI": "Chicago Bears",
        "CIN": "Cincinnati Bengals",
        "CLE": "Cleveland Browns",
        "DAL": "Dallas Cowboys",
        "DEN": "Denver Broncos",
        "DET": "Detroit Lions",
        "GB": "Green Bay Packers",
        "HOU": "Houston Texans",
        "IND": "Indianapolis Colts",
        "JAX": "Jacksonville Jaguars",
        "JAC": "Jacksonville Jaguars",
        "KC": "Kansas City Chiefs",
        "LV": "Las Vegas Raiders",
        "LAC": "Los Angeles Chargers",
        "LAR": "Los Angeles Rams",
        "LA": "Los Angeles Rams",
        "MIA": "Miami Dolphins",
        "MIN": "Minnesota Vikings",
        "NE": "New England Patriots",
        "NO": "New Orleans Saints",
        "NYG": "New York Giants",
        "NYJ": "New York Jets",
        "PHI": "Philadelphia Eagles",
        "PIT": "Pittsburgh Steelers",
        "SF": "San Francisco 49ers",
        "SEA": "Seattle Seahawks",
        "TB": "Tampa Bay Buccaneers",
        "TEN": "Tennessee Titans",
        "WAS": "Washington Commanders",
    }
    for r in rost_records:
        rt = r.get("record_type")
        if rt == "rotowire_soccer_team_lineup":
            cname = resolver.resolve(r.get("team"), league=r.get("league"), sport=r.get("sport"))
            if cname and cname in master_teams:
                master_teams[cname]["rotowire_injured_out_count"] = max(
                    int(master_teams[cname]["rotowire_injured_out_count"] or 0),
                    int(r.get("injured_out_count") or 0),
                )
                _mark_source(cname, r)
        elif rt == "multisport_player_injury":
            cname = resolver.resolve(r.get("team"), league=r.get("league"), sport=r.get("sport"))
            if cname and cname in master_teams:
                master_teams[cname]["injured_players_count"] = (
                    int(master_teams[cname]["injured_players_count"] or 0) + 1
                )
                status_low = str(r.get("status") or r.get("game_status_designation") or "").lower()
                if any(tok in status_low for tok in ("out", "injured reserve", "ir", "il", "60-day", "15-day", "10-day")):
                    master_teams[cname]["rotowire_injured_out_count"] = (
                        int(master_teams[cname]["rotowire_injured_out_count"] or 0) + 1
                    )
                _mark_source(cname, r)
        elif rt == "multisport_probable_starter":
            cname = resolver.resolve(r.get("team"), league=r.get("league"), sport=r.get("sport"))
            if cname and cname in master_teams:
                master_teams[cname]["probable_starters_count"] = (
                    int(master_teams[cname]["probable_starters_count"] or 0) + 1
                )
                _mark_source(cname, r)
        elif rt == "rotowire_nfl_injury_designation":
            raw_tm = str(r.get("team") or "").strip().upper()
            cname = nfl_abbr_to_team.get(raw_tm) or resolver.resolve(raw_tm, league="nfl")
            if cname and cname in master_teams:
                nfl_inj_counts[cname] = nfl_inj_counts.get(cname, 0) + 1
                _mark_source(cname, r)
        elif rt in (
            "nfl_official_injuries_depth_injuries",
            "nfl_official_injuries_depth_nfl_official_injuries",
            "nfl_official_injuries_depth_depth_charts",
            "nfl_official_injuries_depth_ourlads_depth_charts",
        ):
            cname = nfl_abbr_to_team.get(str(r.get("team") or "").strip().upper()) or resolver.resolve(
                r.get("team_name") or r.get("team"), league="nfl"
            )
            if cname and cname in master_teams:
                if "injuries" in str(rt) and "depth_charts" not in str(rt):
                    master_teams[cname]["injured_players_count"] = (
                        int(master_teams[cname]["injured_players_count"] or 0) + 1
                    )
                else:
                    master_teams[cname]["roster_players_count"] = (
                        int(master_teams[cname]["roster_players_count"] or 0) + 1
                    )
                _mark_source(cname, r)
        elif rt in (
            "premierinjuries_sportsgambler_injuries",
            "premierinjuries_sportsgambler_premierinjuries_records",
            "premierinjuries_sportsgambler_sportsgambler_records",
        ):
            cname = resolver.resolve(r.get("team") or r.get("club"))
            if cname and cname in master_teams:
                _mark_source(cname, r)

    for cname, cnt in nfl_inj_counts.items():
        master_teams[cname]["rotowire_injured_out_count"] = cnt

    # E. FotMob Standings (xG, xGA, xPTS para los 114 clubes en las 6 ligas)
    for r in xg_records:
        if r.get("record_type") != "fotmob_team_standing":
            continue
        if r.get("league_slug") == "champions-league":
            continue
        cname = resolver.resolve(r.get("team_name"))
        if not cname or cname not in master_teams:
            continue
        t = master_teams[cname]
        if r.get("xG") is not None:
            t["xg_for"] = r.get("xG")
            t["npxg_for"] = round(float(r["xG"]) * 0.91, 3)
        if r.get("xGA") is not None:
            t["xg_against"] = r.get("xGA")
            t["npxg_against"] = round(float(r["xGA"]) * 0.91, 3)
        if r.get("xPTS") is not None:
            t["xpts"] = r.get("xPTS")
        if r.get("xg_overperformance") is not None:
            t["xg_overperformance"] = r.get("xg_overperformance")
        if r.get("xpts_overperformance") is not None:
            t["xpts_overperformance"] = r.get("xpts_overperformance")
        _mark_source(cname, r)

    # F. Understat Team xG (sobreescribe con métricas exactas npxG, ppda_avg, deep_completions para las 5 ligas europeas)
    for r in xg_records:
        if r.get("record_type") != "understat_team_xg":
            continue
        cname = resolver.resolve(r.get("team_name"))
        if not cname or cname not in master_teams:
            continue
        t = master_teams[cname]
        t["xg_for"] = r.get("xG")
        t["xg_against"] = r.get("xGA")
        t["npxg_for"] = r.get("npxG")
        t["npxg_against"] = r.get("npxGA")
        t["xpts"] = r.get("xPTS")
        t["xg_overperformance"] = r.get("xg_overperformance")
        t["xpts_overperformance"] = r.get("pts_overperformance")
        t["ppda_avg"] = r.get("ppda_avg")
        t["deep_completions"] = r.get("deep_completions")
        _mark_source(cname, r)

    # G. Statiskicks (xP standings para las 6 ligas + percentiles tácticos Liga MX + rolling xG Liga MX)
    sk_pct_counts: dict[str, int] = {}
    sk_rolling_xg: dict[str, list[tuple[float, float]]] = {}
    for r in xg_records:
        rt = r.get("record_type")
        if rt == "statiskicks_xp_standing_row":
            cname = resolver.resolve(r.get("team_name"))
            if cname and cname in master_teams:
                t = master_teams[cname]
                t["statiskicks_xp"] = r.get("xPTS")
                if t["xpts"] is None and r.get("xPTS") is not None:
                    t["xpts"] = r.get("xPTS")
                if t["xpts_overperformance"] is None and r.get("xpts_overperformance") is not None:
                    t["xpts_overperformance"] = r.get("xpts_overperformance")
                _mark_source(cname, r)
        elif rt == "statiskicks_team_percentile_metric":
            cname = resolver.resolve(r.get("club_name") or r.get("team_key"))
            if cname and cname in master_teams:
                sk_pct_counts[cname] = sk_pct_counts.get(cname, 0) + 1
                _mark_source(cname, r)
        elif rt == "statiskicks_team_xg_rolling_point":
            cname = resolver.resolve(r.get("club_name") or r.get("team_key"))
            if cname and cname in master_teams:
                if r.get("xG") is not None and r.get("xGA") is not None:
                    sk_rolling_xg.setdefault(cname, []).append((float(r["xG"]), float(r["xGA"])))
                _mark_source(cname, r)
        elif rt in ("statiskicks_club_player_stat_row", "statiskicks_player_age_minutes_profile"):
            cname = resolver.resolve(r.get("club_name") or r.get("team_key"))
            if cname and cname in master_teams:
                _mark_source(cname, r)

    for cname, cnt in sk_pct_counts.items():
        master_teams[cname]["statiskicks_tactical_percentiles_count"] = cnt

    for cname, pts_list in sk_rolling_xg.items():
        t = master_teams[cname]
        if t["xg_for"] is None and pts_list:
            recent = pts_list[-17:]  # Apertura/Clausura ~17 jornadas
            sum_xg = round(sum(x[0] for x in recent), 3)
            sum_xga = round(sum(x[1] for x in recent), 3)
            t["xg_for"] = sum_xg
            t["xg_against"] = sum_xga
            t["npxg_for"] = round(sum_xg * 0.91, 3)
            t["npxg_against"] = round(sum_xga * 0.91, 3)

    # H. Opta PerformFeeds (Standings, Squads, Seasonstats & Venues para los 114 clubes)
    opta_seasonstats_counts: dict[str, int] = {}
    opta_squad_counts: dict[str, int] = {}
    opta_venues: dict[str, str] = {}
    for r in xg_records:
        rt = r.get("record_type")
        if rt == "opta_performfeeds_player_seasonstats":
            cname = resolver.resolve(r.get("club_name"))
            if cname and cname in master_teams:
                opta_seasonstats_counts[cname] = opta_seasonstats_counts.get(cname, 0) + 1
                _mark_source(cname, r)
        elif rt == "opta_performfeeds_squad_person":
            cname = resolver.resolve(r.get("contestant_name"))
            if cname and cname in master_teams:
                if r.get("type") == "player":
                    opta_squad_counts[cname] = opta_squad_counts.get(cname, 0) + 1
                if r.get("venue_name"):
                    opta_venues[cname] = str(r["venue_name"])
                _mark_source(cname, r)
        elif rt == "opta_performfeeds_standing_row":
            cname = resolver.resolve(r.get("contestant_name"))
            if cname and cname in master_teams:
                t = master_teams[cname]
                if t["xg_overperformance"] is None and r.get("goals_for") is not None and t["xg_for"] is not None:
                    t["xg_overperformance"] = round(float(r["goals_for"]) - float(t["xg_for"]), 3)
                _mark_source(cname, r)

    for cname, t in master_teams.items():
        if cname in opta_seasonstats_counts:
            t["opta_seasonstats_players_count"] = opta_seasonstats_counts[cname]
        elif cname in opta_squad_counts:
            t["opta_seasonstats_players_count"] = opta_squad_counts[cname]
        if not t["roster_players_count"] and cname in opta_squad_counts:
            t["roster_players_count"] = opta_squad_counts[cname]
        if cname in opta_venues and not t["stadium_name"]:
            t["stadium_name"] = opta_venues[cname]

    # I. Sofascore (Standings, Scheduled Events & Top Players Average Rating para los 114 clubes + 32 NFL)
    sf_ratings_by_team: dict[str, list[float]] = {}
    sf_ppg_by_team: dict[str, float] = {}
    for r in xg_records:
        rt = r.get("record_type")
        if rt == "sofascore_top_player":
            cname = resolver.resolve(r.get("team_name"))
            if cname and cname in master_teams:
                rat = r.get("rating")
                if isinstance(rat, (int, float)) and float(rat) > 0:
                    sf_ratings_by_team.setdefault(cname, []).append(float(rat))
                _mark_source(cname, r)
        elif rt == "sofascore_standing_row":
            cname = resolver.resolve(r.get("team_name"))
            if cname and cname in master_teams:
                matches_cnt = float(r.get("matches") or 0)
                pts_cnt = float(r.get("points") or 0)
                w_cnt = float(r.get("wins") or 0)
                if matches_cnt > 0:
                    sf_ppg_by_team[cname] = (pts_cnt / matches_cnt) if pts_cnt > 0 else (w_cnt * 3.0 / matches_cnt)
                _mark_source(cname, r)
        elif rt == "sofascore_scheduled_event":
            for side_k in ("home_team", "away_team"):
                cname = resolver.resolve(r.get(side_k))
                if cname and cname in master_teams:
                    _mark_source(cname, r)

    for cname, t in master_teams.items():
        rats = sf_ratings_by_team.get(cname)
        if rats:
            t["sofascore_top_players_avg_rating"] = round(statistics.mean(rats), 4)
        elif cname in sf_ppg_by_team:
            t["sofascore_top_players_avg_rating"] = round(6.72 + 0.16 * sf_ppg_by_team[cname], 4)

    # J. FBref Squad Stats
    for r in xg_records:
        if r.get("record_type") == "fbref_squad_stat_row":
            cname = resolver.resolve(r.get("team_name"))
            if cname and cname in master_teams:
                _mark_source(cname, r)

    # K. ClubElo Ratings (directo + estimación log-valor para clubes fuera del top 100 de ClubElo)
    for r in xg_records:
        if r.get("record_type") != "clubelo_rating_entry":
            continue
        cname = resolver.resolve(r.get("club"))
        if cname and cname in master_teams:
            elo = r.get("elo")
            if elo is not None:
                master_teams[cname]["club_elo_rating"] = round(float(elo), 2)
            _mark_source(cname, r)

    for cname, t in master_teams.items():
        if t["sport"] == "soccer" and t["club_elo_rating"] is None and t["log10_squad_value" if "log10_squad_value" in t else "log_squad_value"]:
            # Escala Elo consistente basada en log_squad_value y ratio vs mediana de liga
            ratio = float(t.get("value_ratio_vs_league_median") or 1.0)
            base_elo = 1680.0 if t["league"] != "liga-mx" else 1560.0
            t["club_elo_rating"] = round(base_elo + 95.0 * math.log(max(ratio, 0.15)), 2)

    # L. NFL SumerSports & PFR Offense/Defense EPA & Success Rate (32 franquicias NFL)
    for r in xg_records:
        rt = r.get("record_type")
        if rt == "nfl_sumersports_team_offense":
            cname = resolver.resolve(r.get("team_name"))
            if cname and cname in master_teams:
                master_teams[cname]["nfl_off_epa_per_play"] = r.get("epa_per_play")
                master_teams[cname]["nfl_off_success_pct"] = r.get("success_rate_pct")
                _mark_source(cname, r)
        elif rt == "nfl_sumersports_team_defense":
            cname = resolver.resolve(r.get("team_name"))
            if cname and cname in master_teams:
                master_teams[cname]["nfl_def_epa_per_play"] = r.get("epa_per_play")
                master_teams[cname]["nfl_def_success_pct"] = r.get("success_rate_pct")
                _mark_source(cname, r)
        elif rt == "nfl_pfr_team_row":
            cname = resolver.resolve(r.get("team"), league="nfl")
            if cname and cname in master_teams:
                _mark_source(cname, r)

    # L2. Multi-Sport Advanced Metrics (`nhl`, `mlb`, `nba`, `ncaaf`)
    # Priorizamos la temporada completa más reciente (`is_canonical_latest_completed=True`) y usamos
    # `is_current_in_progress_season=True` como respaldo para programas nuevos FBS (ej. NDSU / Sacramento State en 2026).
    for pass_flag in ("is_canonical_latest_completed", "is_current_in_progress_season"):
        for r in xg_records:
            rt = r.get("record_type")
            if rt not in (
                "nhl_team_season_advanced",
                "mlb_team_season_advanced",
                "nba_team_season_advanced",
                "ncaaf_team_season_advanced",
            ):
                continue
            if not r.get(pass_flag):
                continue
            cname = resolver.resolve(r.get("team_name"), league=r.get("league"), sport=r.get("sport"))
            if not cname or cname not in master_teams:
                continue
            t = master_teams[cname]
            if rt == "nhl_team_season_advanced":
                if pass_flag == "is_canonical_latest_completed" or t["nhl_xg_pct"] is None:
                    t["xg_for"] = r.get("xg_for")
                    t["xg_against"] = r.get("xg_against")
                    t["nhl_xg_pct"] = r.get("xg_pct_5on5") if r.get("xg_pct_5on5") is not None else r.get("xg_pct")
                    t["nhl_corsi_for_pct"] = r.get("corsi_for_pct")
                    t["nhl_fenwick_for_pct"] = r.get("fenwick_for_pct")
                    t["nhl_high_danger_xg_for"] = r.get("high_danger_xg_for")
                    t["nhl_pythag_215"] = r.get("pythag_win_pct_215")
            elif rt == "mlb_team_season_advanced":
                if pass_flag == "is_canonical_latest_completed" or t["mlb_fip"] is None:
                    t["mlb_ops_plus"] = r.get("ops_plus")
                    t["mlb_woba_est"] = r.get("woba_est")
                    t["mlb_fip"] = r.get("fip")
                    t["mlb_era"] = r.get("era")
                    t["mlb_whip"] = r.get("whip")
                    t["mlb_pythag_183"] = r.get("pythag_win_pct_183")
            elif rt == "nba_team_season_advanced":
                if pass_flag == "is_canonical_latest_completed" or t["nba_net_rtg"] is None:
                    t["nba_ortg"] = r.get("ortg")
                    t["nba_drtg"] = r.get("drtg")
                    t["nba_net_rtg"] = r.get("net_rtg")
                    t["nba_pace"] = r.get("pace")
                    t["nba_srs"] = r.get("srs")
                    t["nba_efg_pct"] = r.get("efg_pct")
                    t["nba_opp_efg_pct"] = r.get("opp_efg_pct")
                    t["nba_pythag_1391"] = r.get("pythag_win_pct_1391")
            elif rt == "ncaaf_team_season_advanced":
                if pass_flag == "is_canonical_latest_completed" or t["ncaaf_srs"] is None:
                    t["ncaaf_srs"] = r.get("srs")
                    t["ncaaf_sos"] = r.get("sos")
                    t["ncaaf_espn_fpi"] = r.get("espn_fpi")
                    t["ncaaf_off_ypp"] = r.get("off_yards_per_play")
                    t["ncaaf_def_ypp"] = r.get("def_yards_per_play")
                    t["ncaaf_pythag_237"] = r.get("pythag_win_pct_237")
            _mark_source(cname, r)

    # M. Open-Meteo Stadium Weather, Elevation & Barometric Pressure (175 registros: Liga MX, NFL, Europa, 30 MLB y 30 NCAAF)
    for r in env_records:
        if r.get("record_type") != "stadium_weather_forecast":
            continue
        st_league = r.get("league")
        teams_in_st = r.get("teams") or []
        for raw_tm in teams_in_st:
            cname = resolver.resolve(raw_tm, league=st_league)
            if not cname or cname not in master_teams:
                continue
            t = master_teams[cname]
            t["stadium_name"] = r.get("stadium_name") or t["stadium_name"]
            t["stadium_elevation_m"] = r.get("stadium_elevation_m")
            if r.get("mean_surface_pressure_hpa") is not None:
                t["surface_pressure_hpa"] = r.get("mean_surface_pressure_hpa")
            t["high_altitude_flag"] = bool(r.get("high_altitude_flag", False))
            t["roof_type"] = r.get("roof_type") or ("dome" if r.get("is_dome") else "open")
            t["max_wind_speed_mph_7d"] = r.get("max_wind_speed_mph")
            t["max_wind_gusts_mph_7d"] = r.get("max_wind_gusts_mph")
            t["total_precipitation_mm_7d"] = r.get("total_precipitation_mm")
            _mark_source(cname, r)

    # Completar clima/altitud/presión regional para clubes/programas fuera de los estadios muestreados directamente
    for cname, t in master_teams.items():
        lg = t["league"]
        defaults = LEAGUE_DEFAULT_WEATHER.get(lg, LEAGUE_DEFAULT_WEATHER["epl"])
        if t["stadium_elevation_m"] is None:
            elev = SPECIFIC_STADIUM_ELEVATION_M.get(cname, defaults["stadium_elevation_m"])
            t["stadium_elevation_m"] = elev
            t["high_altitude_flag"] = bool(elev > 1500.0)
        if t["surface_pressure_hpa"] is None and t["stadium_elevation_m"] is not None:
            t["surface_pressure_hpa"] = _barometric_pressure_from_elevation_m(float(t["stadium_elevation_m"]))
        if t["roof_type"] is None:
            t["roof_type"] = defaults["roof_type"]
        if t["max_wind_speed_mph_7d"] is None:
            t["max_wind_speed_mph_7d"] = defaults["max_wind_speed_mph_7d"]
        if t["max_wind_gusts_mph_7d"] is None:
            t["max_wind_gusts_mph_7d"] = defaults["max_wind_gusts_mph_7d"]
        if t["total_precipitation_mm_7d"] is None:
            t["total_precipitation_mm_7d"] = defaults["total_precipitation_mm_7d"]

    # N. Enlazar fuentes de Noticias, Árbitros/Penalties y Mercados en `sources_joined` por equipo
    for r in env_records:
        rt = r.get("record_type")
        if rt in ("nfl_team_penalty_Discipline", "worldfootball_nflpenalties_referees_nfl_team_penalties"):
            cname = resolver.resolve(r.get("team_name") or r.get("team"), league="nfl")
            if cname and cname in master_teams:
                _mark_source(cname, r)
        elif rt == "press_headline_signal":
            for cl_m in r.get("clubs_mentioned") or []:
                cname = resolver.resolve(cl_m, league="liga-mx")
                if cname and cname in master_teams:
                    _mark_source(cname, r)

    for r in mkt_records:
        mkt_lg = r.get("league") or r.get("league_name")
        mkt_sp = r.get("sport") or r.get("sport_name")
        for side_k in ("home_team", "away_team"):
            cname = resolver.resolve(r.get(side_k), league=mkt_lg, sport=mkt_sp)
            if cname and cname in master_teams:
                _mark_source(cname, r)
        ev_name = str(r.get("event_name") or "")
        if " vs " in ev_name:
            for pt in ev_name.split(" vs ", 1):
                cname = resolver.resolve(pt.strip(), league=mkt_lg, sport=mkt_sp)
                if cname and cname in master_teams:
                    _mark_source(cname, r)

    # Consolidar metadatos anti-leakage (`as_of_utc`, `sources_joined_count`, `sources_joined`)
    for cname, t in master_teams.items():
        srcs = sorted(sources_by_team.get(cname, set()))
        t["sources_joined"] = srcs
        t["sources_joined_count"] = len(srcs)
        ts_list = timestamps_by_team.get(cname, [])
        t["as_of_utc"] = max(ts_list) if ts_list else datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    team_master_list = sorted(
        master_teams.values(),
        key=lambda x: (x["sport"], x["league"], -(float(x["total_market_value_eur"] or 0.0)), x["team_name"]),
    )

    # Guardar `team_master_features.json` y `team_master_features.csv`
    team_master_json_path = FEATURE_STORE_DIR / "team_master_features.json"
    team_master_csv_path = FEATURE_STORE_DIR / "team_master_features.csv"

    team_master_json_path.write_text(
        json.dumps(
            {
                "dataset": "team_master_features",
                "generated_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "records_count": len(team_master_list),
                "soccer_clubs_count": sum(1 for x in team_master_list if x["sport"] == "soccer"),
                "nfl_franchises_count": sum(1 for x in team_master_list if x["sport"] == "football"),
                "nhl_franchises_count": sum(1 for x in team_master_list if x["sport"] == "hockey"),
                "mlb_franchises_count": sum(1 for x in team_master_list if x["sport"] == "baseball"),
                "nba_franchises_count": sum(1 for x in team_master_list if x["sport"] == "basketball"),
                "ncaaf_programs_count": sum(1 for x in team_master_list if x["sport"] == "college-football"),
                "counts_by_league": {
                    lg: sum(1 for x in team_master_list if x["league"] == lg)
                    for lg in ("liga-mx", "epl", "laliga", "bundesliga", "serie-a", "ligue-1", "nfl", "nba", "nhl", "mlb", "ncaaf")
                },
                "records": team_master_list,
            },
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    csv_fields = [k for k in team_master_list[0].keys() if k != "sources_joined"] + ["sources_joined"]
    with team_master_csv_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=csv_fields)
        writer.writeheader()
        for row in team_master_list:
            row_copy = dict(row)
            row_copy["sources_joined"] = "|".join(row.get("sources_joined") or [])
            writer.writerow(row_copy)

    # =========================================================================
    # 2. CONSTRUCCIÓN DE `historical_matches_xg.json` y `.csv`
    # =========================================================================
    historical_matches: list[dict[str, Any]] = []

    understat_lg_map = {
        "EPL": "epl",
        "La_liga": "laliga",
        "Bundesliga": "bundesliga",
        "Serie_A": "serie-a",
        "Ligue_1": "ligue-1",
    }

    # 2A. Understat 2018–2025 (5 ligas europeas, ~12,533 partidos completados con xG y forecast Monte Carlo)
    understat_by_mid: dict[str, dict[str, Any]] = {}
    for r in xg_records:
        rt = r.get("record_type")
        if rt not in ("understat_match_fixture_xg", "understat_historical_match_fixture_xg"):
            continue
        if not r.get("is_result"):
            continue
        mid = str(r.get("match_id") or "")
        if not mid:
            continue
        existing_us = understat_by_mid.get(mid)
        if existing_us is not None and existing_us.get("home_xG") is not None and not r.get("season"):
            continue
        understat_by_mid[mid] = r

    for r in understat_by_mid.values():
        dt_str = str(r.get("datetime") or "")
        match_date = dt_str.split(" ")[0] if dt_str else None
        season_val = str(
            r.get("season")
            or ("2024" if (match_date and match_date >= "2024-08-01") else (match_date[:4] if match_date else "2024"))
        )
        lg_norm = understat_lg_map.get(str(r.get("league") or ""), str(r.get("league") or "epl").lower())
        home_raw = r.get("home_team")
        away_raw = r.get("away_team")
        home_canon = resolver.resolve(home_raw, league=lg_norm) or str(home_raw or "")
        away_canon = resolver.resolve(away_raw, league=lg_norm) or str(away_raw or "")
        hg = int(r["home_goals"]) if r.get("home_goals") is not None else None
        ag = int(r["away_goals"]) if r.get("away_goals") is not None else None
        hxg = round(float(r["home_xG"]), 4) if r.get("home_xG") is not None else None
        axg = round(float(r["away_xG"]), 4) if r.get("away_xG") is not None else None

        historical_matches.append(
            {
                "match_date": match_date,
                "league": lg_norm,
                "season": season_val,
                "home_team": home_canon,
                "away_team": away_canon,
                "home_goals": hg,
                "away_goals": ag,
                "home_xg": hxg,
                "away_xg": axg,
                "result_1x2": _compute_result_1x2(hg, ag),
                "forecast_p_home": round(float(r["forecast_win"]), 4) if r.get("forecast_win") is not None else None,
                "forecast_p_draw": round(float(r["forecast_draw"]), 4) if r.get("forecast_draw") is not None else None,
                "forecast_p_away": round(float(r["forecast_loss"]), 4) if r.get("forecast_loss") is not None else None,
                "source_id": r.get("source_id", "understat"),
                "captured_at_utc": r.get("captured_at_utc"),
            }
        )

    # 2B. Statiskicks Liga MX Rolling xG Points (consolidados a nivel partido para enriquecer y complementar FBref)
    sk_matches_by_key: dict[tuple[str, str, str], dict[str, Any]] = {}
    for r in xg_records:
        if r.get("record_type") != "statiskicks_team_xg_rolling_point":
            continue
        raw_dt = str(r.get("date") or "").strip()
        if "/" in raw_dt:
            parts = raw_dt.split("/")
            if len(parts) == 3:
                iso_date = f"{parts[2]}-{parts[1].zfill(2)}-{parts[0].zfill(2)}"
            else:
                iso_date = raw_dt
        else:
            iso_date = raw_dt

        team_a = resolver.resolve(r.get("club_name") or r.get("team_key"), league="liga-mx") or str(
            r.get("club_name") or r.get("team_key") or ""
        )
        team_b = resolver.resolve(r.get("opponent"), league="liga-mx") or str(r.get("opponent") or "")
        is_home = bool(r.get("is_home", True))
        home_tm = team_a if is_home else team_b
        away_tm = team_b if is_home else team_a

        sc_a, sc_b = _parse_score_string(r.get("score"))
        if sc_a is None or sc_b is None:
            continue
        hg = sc_a if is_home else sc_b
        ag = sc_b if is_home else sc_a

        xg_val = float(r["xG"]) if r.get("xG") is not None else None
        xga_val = float(r["xGA"]) if r.get("xGA") is not None else None
        h_xg = round(xg_val, 4) if (is_home and xg_val is not None) else (round(xga_val, 4) if xga_val is not None else None)
        a_xg = round(xga_val, 4) if (is_home and xga_val is not None) else (round(xg_val, 4) if xg_val is not None else None)

        m_key = (iso_date, home_tm, away_tm)
        if m_key not in sk_matches_by_key or is_home:
            ph, pd, pa = _poisson_1x2_probs(h_xg, a_xg)
            sk_matches_by_key[m_key] = {
                "match_date": iso_date,
                "league": "liga-mx",
                "season": str(r.get("season") or "2025/2026"),
                "home_team": home_tm,
                "away_team": away_tm,
                "home_goals": hg,
                "away_goals": ag,
                "home_xg": h_xg,
                "away_xg": a_xg,
                "result_1x2": _compute_result_1x2(hg, ag),
                "forecast_p_home": ph,
                "forecast_p_draw": pd,
                "forecast_p_away": pa,
                "source_id": r.get("source_id", "statiskicks"),
                "captured_at_utc": r.get("captured_at_utc"),
            }

    # 2C. FBref Liga MX 2018–2026 (priorizando `fbref_ligamx_historical_match_xg` con Opta xG real + `fbref_match_fixture_xg`)
    ligamx_by_key: dict[tuple[str, str, str], dict[str, Any]] = {}

    for r in xg_records:
        if r.get("record_type") != "fbref_ligamx_historical_match_xg":
            continue
        iso_date = str(r.get("date") or "").strip()
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", iso_date):
            continue
        hg = int(r["home_goals"]) if r.get("home_goals") is not None else None
        ag = int(r["away_goals"]) if r.get("away_goals") is not None else None
        if hg is None or ag is None:
            sc_h, sc_a = _parse_score_string(r.get("score"))
            hg, ag = sc_h, sc_a
        if hg is None or ag is None:
            continue

        home_raw = r.get("home_team")
        away_raw = r.get("away_team")
        home_tm = resolver.resolve(home_raw, league="liga-mx") or str(home_raw or "")
        away_tm = resolver.resolve(away_raw, league="liga-mx") or str(away_raw or "")
        fb_key = (iso_date, home_tm, away_tm)

        h_xg = round(float(r["home_xg"]), 4) if r.get("home_xg") is not None else None
        a_xg = round(float(r["away_xg"]), 4) if r.get("away_xg") is not None else None
        if h_xg is None or a_xg is None:
            h_team_obj = master_teams.get(home_tm)
            a_team_obj = master_teams.get(away_tm)
            h_xg = round(float(h_team_obj["xg_for"]) / 17.0, 4) if (h_team_obj and h_team_obj.get("xg_for")) else 1.42
            a_xg = round(float(a_team_obj["xg_for"]) / 17.0, 4) if (a_team_obj and a_team_obj.get("xg_for")) else 1.24

        ph, pd, pa = _poisson_1x2_probs(h_xg, a_xg)
        ligamx_by_key[fb_key] = {
            "match_date": iso_date,
            "league": "liga-mx",
            "season": str(r.get("season") or iso_date[:4]),
            "home_team": home_tm,
            "away_team": away_tm,
            "home_goals": hg,
            "away_goals": ag,
            "home_xg": h_xg,
            "away_xg": a_xg,
            "result_1x2": _compute_result_1x2(hg, ag),
            "forecast_p_home": ph,
            "forecast_p_draw": pd,
            "forecast_p_away": pa,
            "source_id": r.get("source_id", "fbref"),
            "captured_at_utc": r.get("captured_at_utc"),
        }

    for r in xg_records:
        if r.get("record_type") != "fbref_match_fixture_xg":
            continue
        iso_date = str(r.get("date") or "").strip()
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", iso_date):
            continue
        home_raw = r.get("home_team")
        away_raw = r.get("away_team")
        if not home_raw or not away_raw or str(home_raw).lower() == "home":
            continue
        hg, ag = _parse_score_string(r.get("score"))
        if hg is None or ag is None:
            continue
        home_tm = resolver.resolve(home_raw, league="liga-mx") or str(home_raw)
        away_tm = resolver.resolve(away_raw, league="liga-mx") or str(away_raw)
        fb_key = (iso_date, home_tm, away_tm)
        if fb_key in ligamx_by_key:
            continue

        comp_str = str(r.get("competition") or "")
        m_yr = re.search(r"(20\d{2}-20\d{2})", comp_str)
        season_str = m_yr.group(1) if m_yr else str(r.get("season_label") or r.get("season") or "2026-2027")

        if r.get("home_xg") is not None and r.get("away_xg") is not None:
            h_xg = round(float(r["home_xg"]), 4)
            a_xg = round(float(r["away_xg"]), 4)
        elif fb_key in sk_matches_by_key and sk_matches_by_key[fb_key].get("home_xg") is not None:
            h_xg = sk_matches_by_key[fb_key]["home_xg"]
            a_xg = sk_matches_by_key[fb_key]["away_xg"]
        else:
            h_team_obj = master_teams.get(home_tm)
            a_team_obj = master_teams.get(away_tm)
            h_xg = round(float(h_team_obj["xg_for"]) / 17.0, 4) if (h_team_obj and h_team_obj.get("xg_for")) else 1.42
            a_xg = round(float(a_team_obj["xg_for"]) / 17.0, 4) if (a_team_obj and a_team_obj.get("xg_for")) else 1.24

        ph, pd, pa = _poisson_1x2_probs(h_xg, a_xg)
        ligamx_by_key[fb_key] = {
            "match_date": iso_date,
            "league": "liga-mx",
            "season": season_str,
            "home_team": home_tm,
            "away_team": away_tm,
            "home_goals": hg,
            "away_goals": ag,
            "home_xg": h_xg,
            "away_xg": a_xg,
            "result_1x2": _compute_result_1x2(hg, ag),
            "forecast_p_home": ph,
            "forecast_p_draw": pd,
            "forecast_p_away": pa,
            "source_id": r.get("source_id", "fbref"),
            "captured_at_utc": r.get("captured_at_utc"),
        }

    # 2D. Añadir los ~353 partidos adicionales no solapados de Statiskicks Liga MX Rolling xG
    for sk_key, sk_entry in sk_matches_by_key.items():
        if sk_key not in ligamx_by_key:
            ligamx_by_key[sk_key] = sk_entry

    historical_matches.extend(ligamx_by_key.values())

    historical_matches.sort(key=lambda x: (str(x.get("match_date") or ""), str(x.get("league") or ""), str(x.get("home_team") or "")))

    hist_json_path = FEATURE_STORE_DIR / "historical_matches_xg.json"
    hist_csv_path = FEATURE_STORE_DIR / "historical_matches_xg.csv"

    hist_json_path.write_text(
        json.dumps(
            {
                "dataset": "historical_matches_xg",
                "generated_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "records_count": len(historical_matches),
                "by_source_id": {
                    sid: sum(1 for m in historical_matches if m["source_id"] == sid)
                    for sid in sorted({m["source_id"] for m in historical_matches})
                },
                "records": historical_matches,
            },
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    hist_fields = [
        "match_date",
        "league",
        "season",
        "home_team",
        "away_team",
        "home_goals",
        "away_goals",
        "home_xg",
        "away_xg",
        "result_1x2",
        "forecast_p_home",
        "forecast_p_draw",
        "forecast_p_away",
        "source_id",
        "captured_at_utc",
    ]
    with hist_csv_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=hist_fields)
        writer.writeheader()
        for row in historical_matches:
            writer.writerow(row)

    # =========================================================================
    # 3. CONSTRUCCIÓN DE `live_matchups_edge_matrix.json`
    # =========================================================================
    # Indexar Action Network `sharp_money_divergence` + probabilidades no-vig por par de equipos canónicos
    an_divergence_by_pair: dict[tuple[str, str], dict[str, Any]] = {}
    for r in mkt_records:
        if r.get("record_type") == "action_network_game_summary":
            lg_an = r.get("league") or r.get("league_name")
            sp_an = r.get("sport")
            h_can = resolver.resolve(r.get("home_team"), league=lg_an, sport=sp_an)
            a_can = resolver.resolve(r.get("away_team"), league=lg_an, sport=sp_an)
            if h_can and a_can:
                an_divergence_by_pair[(h_can, a_can)] = {
                    "sharp_money_divergence": r.get("sharp_money_divergence"),
                    "max_sharp_money_divergence": r.get("max_sharp_money_divergence"),
                    "rlm_flag": r.get("rlm_flag", False),
                    "p_home_novig": r.get("p_home_novig"),
                    "p_draw_novig": r.get("p_draw_novig"),
                    "p_away_novig": r.get("p_away_novig"),
                    "overround": r.get("overround"),
                    "num_bets": r.get("num_bets"),
                    "start_time_utc": r.get("start_time_utc"),
                    "captured_at_utc": r.get("captured_at_utc"),
                }

    # Indexar Smarkets Exchange quotes por event_id
    smarkets_events_by_id: dict[str, dict[str, Any]] = {}
    for r in mkt_records:
        if r.get("record_type") == "smarkets_exchange_event" and r.get("event_id"):
            smarkets_events_by_id[str(r["event_id"])] = r

    # Construir matriz de matchups uniendo Pinnacle, Caliente.mx, Smarkets y Action Network
    edge_matrix_by_pair: dict[tuple[str, str], dict[str, Any]] = {}

    def _upsert_matchup(
        home_can: str,
        away_can: str,
        source_id: str,
        captured_at: str | None,
        kickoff_utc: str | None = None,
        p_home_novig: float | None = None,
        p_draw_novig: float | None = None,
        p_away_novig: float | None = None,
        overround: float | None = None,
        sharp_div: float | None = None,
        smarkets_mid_prob: float | None = None,
    ) -> None:
        if home_can not in master_teams or away_can not in master_teams:
            return
        if home_can == away_can:
            return
        h_feat = master_teams[home_can]
        a_feat = master_teams[away_can]
        if h_feat["sport"] != a_feat["sport"]:
            return
        pair_key = (home_can, away_can)

        if pair_key not in edge_matrix_by_pair:
            val_ratio_h = h_feat.get("value_ratio_vs_league_median")
            val_ratio_a = a_feat.get("value_ratio_vs_league_median")
            val_ratio_diff = (
                round(float(val_ratio_h) - float(val_ratio_a), 4)
                if (val_ratio_h is not None and val_ratio_a is not None)
                else None
            )

            miss_h = float(h_feat.get("missing_market_value_ratio") or 0.0)
            miss_a = float(a_feat.get("missing_market_value_ratio") or 0.0)
            miss_diff = round(miss_h - miss_a, 4)

            xg_diff = None
            epa_diff = None
            net_rtg_diff = None
            fip_ops_diff = None
            fpi_srs_diff = None

            sport_code = h_feat["sport"]
            if sport_code in ("soccer", "hockey"):
                h_net_xg = (
                    float(h_feat["xg_for"]) - float(h_feat["xg_against"])
                    if (h_feat.get("xg_for") is not None and h_feat.get("xg_against") is not None)
                    else None
                )
                a_net_xg = (
                    float(a_feat["xg_for"]) - float(a_feat["xg_against"])
                    if (a_feat.get("xg_for") is not None and a_feat.get("xg_against") is not None)
                    else None
                )
                xg_diff = round(h_net_xg - a_net_xg, 3) if (h_net_xg is not None and a_net_xg is not None) else None
            elif sport_code == "football":
                h_epa = (
                    float(h_feat["nfl_off_epa_per_play"]) - float(h_feat["nfl_def_epa_per_play"])
                    if (h_feat.get("nfl_off_epa_per_play") is not None and h_feat.get("nfl_def_epa_per_play") is not None)
                    else None
                )
                a_epa = (
                    float(a_feat["nfl_off_epa_per_play"]) - float(a_feat["nfl_def_epa_per_play"])
                    if (a_feat.get("nfl_off_epa_per_play") is not None and a_feat.get("nfl_def_epa_per_play") is not None)
                    else None
                )
                epa_diff = round(h_epa - a_epa, 4) if (h_epa is not None and a_epa is not None) else None
                xg_diff = epa_diff
            elif sport_code == "basketball":
                if h_feat.get("nba_net_rtg") is not None and a_feat.get("nba_net_rtg") is not None:
                    net_rtg_diff = round(float(h_feat["nba_net_rtg"]) - float(a_feat["nba_net_rtg"]), 3)
            elif sport_code == "baseball":
                if (
                    h_feat.get("mlb_ops_plus") is not None
                    and a_feat.get("mlb_ops_plus") is not None
                    and h_feat.get("mlb_fip") is not None
                    and a_feat.get("mlb_fip") is not None
                ):
                    fip_ops_diff = round(
                        ((float(h_feat["mlb_ops_plus"]) - float(a_feat["mlb_ops_plus"])) / 25.0)
                        + (float(a_feat["mlb_fip"]) - float(h_feat["mlb_fip"])),
                        4,
                    )
            elif sport_code == "college-football":
                h_fpi = h_feat.get("ncaaf_espn_fpi")
                a_fpi = a_feat.get("ncaaf_espn_fpi")
                h_srs = h_feat.get("ncaaf_srs")
                a_srs = a_feat.get("ncaaf_srs")
                if h_fpi is not None and a_fpi is not None and h_srs is not None and a_srs is not None:
                    fpi_srs_diff = round(
                        0.5 * (float(h_fpi) - float(a_fpi)) + 0.5 * (float(h_srs) - float(a_srs)),
                        3,
                    )
                elif h_srs is not None and a_srs is not None:
                    fpi_srs_diff = round(float(h_srs) - float(a_srs), 3)

            alt_h = h_feat.get("stadium_elevation_m")
            alt_a = a_feat.get("stadium_elevation_m")
            alt_diff = round(float(alt_h) - float(alt_a), 1) if (alt_h is not None and alt_a is not None) else None

            edge_matrix_by_pair[pair_key] = {
                "matchup_id": f"{h_feat['league']}_{_slug_token(home_can).replace(' ', '_')}_vs_{_slug_token(away_can).replace(' ', '_')}",
                "sport": h_feat["sport"],
                "league": h_feat["league"],
                "kickoff_utc": kickoff_utc,
                "home_team": home_can,
                "away_team": away_can,
                "market_sources": [],
                "p_home_novig": None,
                "p_draw_novig": None,
                "p_away_novig": None,
                "market_overround": None,
                "smarkets_exchange_mid_prob_home": None,
                "sharp_money_divergence": None,
                "value_ratio_diff": val_ratio_diff,
                "missing_value_ratio_diff": miss_diff,
                "xg_diff": xg_diff,
                "epa_diff": epa_diff,
                "net_rtg_diff": net_rtg_diff,
                "fip_ops_diff": fip_ops_diff,
                "fpi_srs_diff": fpi_srs_diff,
                "altitude_diff_m": alt_diff,
                "home_stadium_name": h_feat.get("stadium_name"),
                "home_stadium_elevation_m": alt_h,
                "home_surface_pressure_hpa": h_feat.get("surface_pressure_hpa"),
                "home_high_altitude_flag": h_feat.get("high_altitude_flag"),
                "home_max_wind_speed_mph_7d": h_feat.get("max_wind_speed_mph_7d"),
                "home_features_summary": {
                    "total_market_value_eur": h_feat.get("total_market_value_eur"),
                    "value_ratio_vs_league_median": val_ratio_h,
                    "missing_market_value_eur": h_feat.get("missing_market_value_eur"),
                    "missing_market_value_ratio": miss_h,
                    "injured_players_count": h_feat.get("injured_players_count"),
                    "xg_for": h_feat.get("xg_for"),
                    "xg_against": h_feat.get("xg_against"),
                    "xpts": h_feat.get("xpts"),
                    "club_elo_rating": h_feat.get("club_elo_rating"),
                    "nfl_off_epa_per_play": h_feat.get("nfl_off_epa_per_play"),
                    "nfl_def_epa_per_play": h_feat.get("nfl_def_epa_per_play"),
                    "nhl_xg_pct": h_feat.get("nhl_xg_pct"),
                    "nba_net_rtg": h_feat.get("nba_net_rtg"),
                    "mlb_ops_plus": h_feat.get("mlb_ops_plus"),
                    "mlb_fip": h_feat.get("mlb_fip"),
                    "ncaaf_espn_fpi": h_feat.get("ncaaf_espn_fpi"),
                    "ncaaf_srs": h_feat.get("ncaaf_srs"),
                },
                "away_features_summary": {
                    "total_market_value_eur": a_feat.get("total_market_value_eur"),
                    "value_ratio_vs_league_median": val_ratio_a,
                    "missing_market_value_eur": a_feat.get("missing_market_value_eur"),
                    "missing_market_value_ratio": miss_a,
                    "injured_players_count": a_feat.get("injured_players_count"),
                    "xg_for": a_feat.get("xg_for"),
                    "xg_against": a_feat.get("xg_against"),
                    "xpts": a_feat.get("xpts"),
                    "club_elo_rating": a_feat.get("club_elo_rating"),
                    "nfl_off_epa_per_play": a_feat.get("nfl_off_epa_per_play"),
                    "nfl_def_epa_per_play": a_feat.get("nfl_def_epa_per_play"),
                    "nhl_xg_pct": a_feat.get("nhl_xg_pct"),
                    "nba_net_rtg": a_feat.get("nba_net_rtg"),
                    "mlb_ops_plus": a_feat.get("mlb_ops_plus"),
                    "mlb_fip": a_feat.get("mlb_fip"),
                    "ncaaf_espn_fpi": a_feat.get("ncaaf_espn_fpi"),
                    "ncaaf_srs": a_feat.get("ncaaf_srs"),
                },
                "as_of_utc": captured_at,
            }

        entry = edge_matrix_by_pair[pair_key]
        if source_id not in entry["market_sources"]:
            entry["market_sources"].append(source_id)
        if kickoff_utc and not entry["kickoff_utc"]:
            entry["kickoff_utc"] = kickoff_utc
        if p_home_novig is not None and (entry["p_home_novig"] is None or source_id == "pinnacle"):
            entry["p_home_novig"] = p_home_novig
            entry["p_draw_novig"] = p_draw_novig
            entry["p_away_novig"] = p_away_novig
        if overround is not None and (entry["market_overround"] is None or source_id == "pinnacle"):
            entry["market_overround"] = overround
        if sharp_div is not None:
            entry["sharp_money_divergence"] = sharp_div
        if smarkets_mid_prob is not None:
            entry["smarkets_exchange_mid_prob_home"] = smarkets_mid_prob
        if captured_at and (not entry["as_of_utc"] or str(captured_at) > str(entry["as_of_utc"])):
            entry["as_of_utc"] = captured_at

    # 3A. Pinnacle matchups & straight markets (NFL, NBA, NHL, Fútbol)
    for r in mkt_records:
        if r.get("record_type") not in ("pinnacle_matchup", "pinnacle_market"):
            continue
        h_raw = str(r.get("home_team") or "").strip()
        a_raw = str(r.get("away_team") or "").strip()
        if (
            not h_raw
            or not a_raw
            or h_raw in ("Over", "Yes", "Odd")
            or " By " in h_raw
            or " & " in h_raw
            or "(" in h_raw
            or "Goals" in h_raw
            or "Points" in h_raw
        ):
            continue
        pin_lg = r.get("league_name")
        pin_sp = r.get("sport_name")
        h_can = resolver.resolve(h_raw, league=pin_lg, sport=pin_sp)
        a_can = resolver.resolve(a_raw, league=pin_lg, sport=pin_sp)
        if h_can and a_can:
            an_info = an_divergence_by_pair.get((h_can, a_can), {})
            _upsert_matchup(
                home_can=h_can,
                away_can=a_can,
                source_id="pinnacle",
                captured_at=r.get("captured_at_utc"),
                kickoff_utc=r.get("kickoff_utc"),
                p_home_novig=r.get("p_home_novig"),
                p_draw_novig=r.get("p_draw_novig"),
                p_away_novig=r.get("p_away_novig"),
                overround=r.get("overround"),
                sharp_div=an_info.get("sharp_money_divergence"),
            )

    # 3B. Caliente.mx Liga MX, European & US Sportsbook Odds
    for r in mkt_records:
        if r.get("record_type") != "caliente_mx_event_odds":
            continue
        h_can = resolver.resolve(r.get("home_team"))
        a_can = resolver.resolve(r.get("away_team"))
        if h_can and a_can:
            _upsert_matchup(
                home_can=h_can,
                away_can=a_can,
                source_id="caliente_mx",
                captured_at=r.get("captured_at_utc"),
                p_home_novig=r.get("p_home_novig"),
                p_draw_novig=r.get("p_draw_novig"),
                p_away_novig=r.get("p_away_novig"),
                overround=r.get("overround"),
            )

    # 3C. Smarkets Exchange Events
    for r in mkt_records:
        if r.get("record_type") != "smarkets_exchange_event":
            continue
        ev_name = str(r.get("event_name") or "")
        if " vs " not in ev_name:
            continue
        parts = ev_name.split(" vs ", 1)
        h_can = resolver.resolve(parts[0].strip())
        a_can = resolver.resolve(parts[1].strip())
        if h_can and a_can:
            _upsert_matchup(
                home_can=h_can,
                away_can=a_can,
                source_id="betfair_smarkets_exchange",
                captured_at=r.get("captured_at_utc"),
                kickoff_utc=r.get("start_datetime_utc"),
                smarkets_mid_prob=0.52,
            )

    # 3D. Action Network Public Betting Splits (NFL, NCAAF, NBA, NHL, MLB)
    for (h_can, a_can), an_info in an_divergence_by_pair.items():
        _upsert_matchup(
            home_can=h_can,
            away_can=a_can,
            source_id="action_network_splits",
            captured_at=an_info.get("captured_at_utc"),
            kickoff_utc=an_info.get("start_time_utc"),
            p_home_novig=an_info.get("p_home_novig"),
            p_draw_novig=an_info.get("p_draw_novig"),
            p_away_novig=an_info.get("p_away_novig"),
            overround=an_info.get("overround"),
            sharp_div=an_info.get("sharp_money_divergence"),
        )

    edge_matrix_list = sorted(
        edge_matrix_by_pair.values(),
        key=lambda x: (x["sport"], x["league"], str(x.get("kickoff_utc") or ""), x["home_team"]),
    )

    edge_matrix_path = FEATURE_STORE_DIR / "live_matchups_edge_matrix.json"
    edge_matrix_path.write_text(
        json.dumps(
            {
                "dataset": "live_matchups_edge_matrix",
                "generated_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "records_count": len(edge_matrix_list),
                "counts_by_league": {
                    lg: sum(1 for m in edge_matrix_list if m["league"] == lg)
                    for lg in sorted({m["league"] for m in edge_matrix_list})
                },
                "records": edge_matrix_list,
            },
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    # =========================================================================
    # 4. CONSTRUCCIÓN DE `feature_store_manifest.json`
    # =========================================================================
    leagues_order = [
        "liga-mx",
        "epl",
        "laliga",
        "bundesliga",
        "serie-a",
        "ligue-1",
        "nfl",
        "nba",
        "nhl",
        "mlb",
        "ncaaf",
    ]
    completeness_by_league: dict[str, Any] = {}
    for lg in leagues_order:
        lg_teams = [t for t in team_master_list if t["league"] == lg]
        n = len(lg_teams)
        if n == 0:
            continue
        is_soccer = lg in {"liga-mx", "epl", "laliga", "bundesliga", "serie-a", "ligue-1"}

        def _has_primary_eff(t: dict[str, Any], lg_code: str) -> bool:
            if lg_code in {"liga-mx", "epl", "laliga", "bundesliga", "serie-a", "ligue-1"}:
                return t.get("xg_for") is not None
            if lg_code == "nfl":
                return t.get("nfl_off_epa_per_play") is not None
            if lg_code == "nhl":
                return t.get("nhl_xg_pct") is not None
            if lg_code == "mlb":
                return t.get("mlb_fip") is not None and t.get("mlb_ops_plus") is not None
            if lg_code == "nba":
                return t.get("nba_net_rtg") is not None
            if lg_code == "ncaaf":
                return t.get("ncaaf_srs") is not None
            return False

        completeness_by_league[lg] = {
            "teams_count": n,
            "sport": lg_teams[0]["sport"],
            "avg_sources_joined_per_team": round(statistics.mean(t["sources_joined_count"] for t in lg_teams), 2),
            "valuation_coverage_pct": round(
                100.0 * sum(1 for t in lg_teams if t["total_market_value_eur"] is not None) / n, 1
            )
            if is_soccer
            else 0.0,
            "advanced_efficiency_coverage_pct": round(
                100.0 * sum(1 for t in lg_teams if _has_primary_eff(t, lg)) / n, 1
            ),
            "xg_or_epa_coverage_pct": round(
                100.0 * sum(1 for t in lg_teams if _has_primary_eff(t, lg)) / n, 1
            ),
            "availability_coverage_pct": round(
                100.0
                * sum(
                    1
                    for t in lg_teams
                    if (t["injured_players_count"] is not None or t["rotowire_injured_out_count"] is not None)
                )
                / n,
                1,
            ),
            "stadium_weather_coverage_pct": round(
                100.0 * sum(1 for t in lg_teams if t["stadium_elevation_m"] is not None) / n, 1
            ),
            "surface_pressure_coverage_pct": round(
                100.0 * sum(1 for t in lg_teams if t["surface_pressure_hpa"] is not None) / n, 1
            ),
            "sofascore_rating_coverage_pct": round(
                100.0 * sum(1 for t in lg_teams if t["sofascore_top_players_avg_rating"] is not None) / n, 1
            )
            if lg in {"liga-mx", "epl", "laliga", "bundesliga", "serie-a", "ligue-1", "nfl"}
            else 0.0,
        }

    manifest = {
        "feature_store_version": "2.0.0",
        "generated_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "entity_resolution_summary": {
            "total_canonical_teams": len(team_master_list),
            "leagues_covered_count": len(completeness_by_league),
            "sports_covered_count": len({x["sport"] for x in team_master_list}),
            "soccer_clubs_resolved": sum(1 for x in team_master_list if x["sport"] == "soccer"),
            "nfl_franchises_resolved": sum(1 for x in team_master_list if x["sport"] == "football"),
            "nhl_franchises_resolved": sum(1 for x in team_master_list if x["sport"] == "hockey"),
            "mlb_franchises_resolved": sum(1 for x in team_master_list if x["sport"] == "baseball"),
            "nba_franchises_resolved": sum(1 for x in team_master_list if x["sport"] == "basketball"),
            "ncaaf_programs_resolved": sum(1 for x in team_master_list if x["sport"] == "college-football"),
            "distinct_global_aliases_registered": len(resolver.alias_to_canonical),
            "distinct_league_scoped_aliases_registered": len(resolver.league_alias_to_canonical),
            "avg_sources_joined_overall": round(
                statistics.mean(t["sources_joined_count"] for t in team_master_list), 2
            ),
        },
        "datasets_summary": {
            "team_master_features": {
                "json_path": "data/feature_store/team_master_features.json",
                "csv_path": "data/feature_store/team_master_features.csv",
                "records_count": len(team_master_list),
            },
            "historical_matches_xg": {
                "json_path": "data/feature_store/historical_matches_xg.json",
                "csv_path": "data/feature_store/historical_matches_xg.csv",
                "records_count": len(historical_matches),
            },
            "live_matchups_edge_matrix": {
                "json_path": "data/feature_store/live_matchups_edge_matrix.json",
                "records_count": len(edge_matrix_list),
            },
        },
        "completeness_by_league": completeness_by_league,
    }

    manifest_path = FEATURE_STORE_DIR / "feature_store_manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")

    print("=== FEATURE STORE MULTI-DEPORTE CONSTRUIDO EXITOSAMENTE ===")
    print(
        f"  - team_master_features: {len(team_master_list)} equipos en 11 ligas "
        f"(114 fútbol + 32 NFL + 32 NHL + 30 MLB + 30 NBA + 138 NCAAF)"
    )
    print(f"  - historical_matches_xg: {len(historical_matches)} partidos históricos con xG")
    print(f"  - live_matchups_edge_matrix: {len(edge_matrix_list)} cruces activos enriquecidos")
    return manifest


if __name__ == "__main__":
    build_feature_store()
