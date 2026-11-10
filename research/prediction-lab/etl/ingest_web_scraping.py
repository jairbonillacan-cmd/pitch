#!/usr/bin/env python3
"""Fase 1 (A26 / Spacetime v3.0) — ETL Puente y Resolución Universal de Entidades desde `web-scraping`.

Lee en modo estrictamente de solo lectura (`read-only`) los artefactos sellados de
`.worktrees/web-scraping/data/feature_store/` y `.worktrees/web-scraping/data/normalized/`,
verifica criptográficamente el manifiesto `sha256` de los 55 snapshots crudos en `data/raw/`,
cruza la Piedra Rosetta (`etl/rosetta_statiskicks.py`) con los 1,858 alias de `web-scraping`
y con la taxonomía canónica de `matches.parquet` (`E0`, `SP1`, `D1`, `I1`, `F1`, `MEX`) y
`nfl_features.parquet`, y materializa de forma determinista e idempotente en
`research/prediction-lab/data/processed/web_scraping/`:

  1. `ws_soccer_match_xg_2018_2026.parquet`
     Emparejado contra `matches.parquet` (`match_id`), cubriendo EPL, LaLiga, Bundesliga,
     Serie A, Ligue 1 y Liga MX. Separa estrictamente `real_home_xg` / `real_away_xg`
     (`is_exact_xg = True` únicamente cuando proviene de tiro/partido real en Understat,
     FBref/Opta o Statiskicks; cero imputación desde promedios 2026).
  2. `ws_understat_team_match_tactical.parquet`
     `npxG`, `npxGA`, `npxGD`, `PPDA`, `deep_completions`, `xPTS` partido a partido `2018–2025`
     enlazados a `(div, pl_team, match_id)`.
  3. `ws_stadium_physics.parquet`
     `175` estadios físicos + mapeo completo de sedes históricas y actuales (`elevation_m`,
     `structural_pressure_hpa`, `surface_pressure_hpa`, `roof_type`, `high_altitude_flag`),
     desambiguando explícitamente franquicias reubicadas (ej. `Mazatlan FC` 12 m en `2020–2025`
     vs `Atlante` 2,245 m en `2026`).
  4. `ws_multisport_team_seasons.parquet`
     `716` equipos-temporada de `NHL` (`128`), `MLB` (`90`), `NBA` (`90`), `NCAAF` (`408`) +
     `32` franquicias `NFL` con `SumerSports EPA/play` y `PFR SRS`, con `franchise_key`
     canónico inter-temporada (`Arizona Coyotes -> Utah Mammoth`, `Oakland Athletics -> Athletics`).
  5. `ws_live_inference_context.parquet` y `ws_live_inference_context.json`
     Snapshot prospectivo (`captured_at_utc = 2026-11-09/10`) para los `376` equipos canónicos y
     los `242` enfrentamientos activos en las `11` ligas (`6` deportes), enriquecido con bajas
     Transfermarkt/RotoWire/NFL/Multi-Sport, titulares/porteros probables, clima 7d Open-Meteo,
     rigor arbitral (`WorldFootball` / `NFLPenalties`) y microestructura de mercado
     (`Pinnacle` vs `Caliente.mx` vs `Smarkets` vs `Action Network` splits & RLM).

Regla Anti-Leakage Innegociable:
  - NO modifica ningún archivo de `.worktrees/web-scraping`.
  - Marca explícitamente los artefactos `point-in-time` (`t' < t`) frente a los snapshots
    prospectivos `2026-11-09/10` (`prospective_only = True`).

Uso:
    ./.venv/Scripts/python.exe etl/ingest_web_scraping.py
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import os
import re
import sys
import unicodedata
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

THIS_DIR = Path(__file__).resolve().parent
PRED_LAB_ROOT = THIS_DIR.parent
WORKTREE_ROOT = PRED_LAB_ROOT.parent.parent  # .worktrees/prediction-lab
REPO_ROOT = WORKTREE_ROOT.parent.parent if WORKTREE_ROOT.parent.name == ".worktrees" else WORKTREE_ROOT

sys.path.insert(0, str(THIS_DIR))
from rosetta_statiskicks import RosettaStatiskicks  # noqa: E402

DEFAULT_WS_ROOT = REPO_ROOT / ".worktrees" / "web-scraping"
DEFAULT_PROC_DIR = PRED_LAB_ROOT / "data" / "processed"
DEFAULT_OUT_DIR = DEFAULT_PROC_DIR / "web_scraping"

# Mapeo de ligas de fútbol entre `web-scraping` y `matches.parquet` (`div`)
WS_LEAGUE_TO_DIV: dict[str, str] = {
    "epl": "E0",
    "premier league": "E0",
    "laliga": "SP1",
    "la_liga": "SP1",
    "la liga": "SP1",
    "bundesliga": "D1",
    "serie-a": "I1",
    "serie_a": "I1",
    "serie a": "I1",
    "ligue-1": "F1",
    "ligue_1": "F1",
    "ligue 1": "F1",
    "liga-mx": "MEX",
    "liga_mx": "MEX",
    "liga mx": "MEX",
}

DIV_TO_WS_LEAGUE: dict[str, str] = {
    "E0": "epl",
    "SP1": "laliga",
    "D1": "bundesliga",
    "I1": "serie-a",
    "F1": "ligue-1",
    "MEX": "liga-mx",
}

# Mapeo explícito hacia los nombres exactos de `matches.parquet` por división
WS_TO_PL_TEAM_BY_DIV: dict[tuple[str, str], str] = {
    # E0 (Premier League)
    ("E0", "afc bournemouth"): "Bournemouth",
    ("E0", "bournemouth"): "Bournemouth",
    ("E0", "arsenal fc"): "Arsenal",
    ("E0", "arsenal"): "Arsenal",
    ("E0", "aston villa"): "Aston Villa",
    ("E0", "brentford fc"): "Brentford",
    ("E0", "brentford"): "Brentford",
    ("E0", "brighton & hove albion"): "Brighton",
    ("E0", "brighton and hove albion"): "Brighton",
    ("E0", "brighton"): "Brighton",
    ("E0", "burnley"): "Burnley",
    ("E0", "cardiff"): "Cardiff",
    ("E0", "chelsea fc"): "Chelsea",
    ("E0", "chelsea"): "Chelsea",
    ("E0", "coventry city"): "Coventry",
    ("E0", "coventry"): "Coventry",
    ("E0", "crystal palace"): "Crystal Palace",
    ("E0", "everton fc"): "Everton",
    ("E0", "everton"): "Everton",
    ("E0", "fulham fc"): "Fulham",
    ("E0", "fulham"): "Fulham",
    ("E0", "huddersfield"): "Huddersfield",
    ("E0", "hull city"): "Hull",
    ("E0", "hull"): "Hull",
    ("E0", "ipswich town"): "Ipswich",
    ("E0", "ipswich"): "Ipswich",
    ("E0", "leeds united"): "Leeds",
    ("E0", "leeds"): "Leeds",
    ("E0", "leicester"): "Leicester",
    ("E0", "leicester city"): "Leicester",
    ("E0", "liverpool fc"): "Liverpool",
    ("E0", "liverpool"): "Liverpool",
    ("E0", "luton"): "Luton",
    ("E0", "luton town"): "Luton",
    ("E0", "manchester city"): "Man City",
    ("E0", "man city"): "Man City",
    ("E0", "manchester united"): "Man United",
    ("E0", "man united"): "Man United",
    ("E0", "newcastle united"): "Newcastle",
    ("E0", "newcastle"): "Newcastle",
    ("E0", "norwich"): "Norwich",
    ("E0", "norwich city"): "Norwich",
    ("E0", "nottingham forest"): "Nott'm Forest",
    ("E0", "nott'm forest"): "Nott'm Forest",
    ("E0", "sheffield united"): "Sheffield United",
    ("E0", "southampton"): "Southampton",
    ("E0", "sunderland afc"): "Sunderland",
    ("E0", "sunderland"): "Sunderland",
    ("E0", "tottenham hotspur"): "Tottenham",
    ("E0", "tottenham"): "Tottenham",
    ("E0", "watford"): "Watford",
    ("E0", "west bromwich albion"): "West Brom",
    ("E0", "west brom"): "West Brom",
    ("E0", "west ham"): "West Ham",
    ("E0", "west ham united"): "West Ham",
    ("E0", "wolverhampton wanderers"): "Wolves",
    ("E0", "wolves"): "Wolves",
    # SP1 (LaLiga)
    ("SP1", "almeria"): "Almeria",
    ("SP1", "ud almeria"): "Almeria",
    ("SP1", "athletic club"): "Ath Bilbao",
    ("SP1", "athletic bilbao"): "Ath Bilbao",
    ("SP1", "ath bilbao"): "Ath Bilbao",
    ("SP1", "atletico de madrid"): "Ath Madrid",
    ("SP1", "atletico madrid"): "Ath Madrid",
    ("SP1", "ath madrid"): "Ath Madrid",
    ("SP1", "ca osasuna"): "Osasuna",
    ("SP1", "osasuna"): "Osasuna",
    ("SP1", "cadiz"): "Cadiz",
    ("SP1", "cadiz cf"): "Cadiz",
    ("SP1", "deportivo alaves"): "Alaves",
    ("SP1", "alaves"): "Alaves",
    ("SP1", "eibar"): "Eibar",
    ("SP1", "sd eibar"): "Eibar",
    ("SP1", "elche cf"): "Elche",
    ("SP1", "elche"): "Elche",
    ("SP1", "fc barcelona"): "Barcelona",
    ("SP1", "barcelona"): "Barcelona",
    ("SP1", "getafe cf"): "Getafe",
    ("SP1", "getafe"): "Getafe",
    ("SP1", "girona"): "Girona",
    ("SP1", "girona fc"): "Girona",
    ("SP1", "granada"): "Granada",
    ("SP1", "granada cf"): "Granada",
    ("SP1", "las palmas"): "Las Palmas",
    ("SP1", "ud las palmas"): "Las Palmas",
    ("SP1", "leganes"): "Leganes",
    ("SP1", "cd leganes"): "Leganes",
    ("SP1", "levante ud"): "Levante",
    ("SP1", "levante"): "Levante",
    ("SP1", "malaga cf"): "Malaga",
    ("SP1", "malaga"): "Malaga",
    ("SP1", "mallorca"): "Mallorca",
    ("SP1", "rcd mallorca"): "Mallorca",
    ("SP1", "rc celta de vigo"): "Celta",
    ("SP1", "celta vigo"): "Celta",
    ("SP1", "celta"): "Celta",
    ("SP1", "rc deportivo a coruna"): "La Coruna",
    ("SP1", "la coruna"): "La Coruna",
    ("SP1", "rcd espanyol"): "Espanol",
    ("SP1", "espanyol"): "Espanol",
    ("SP1", "espanol"): "Espanol",
    ("SP1", "rayo vallecano"): "Vallecano",
    ("SP1", "vallecano"): "Vallecano",
    ("SP1", "real betis balompie"): "Betis",
    ("SP1", "real betis"): "Betis",
    ("SP1", "betis"): "Betis",
    ("SP1", "real madrid cf"): "Real Madrid",
    ("SP1", "real madrid"): "Real Madrid",
    ("SP1", "real oviedo"): "Oviedo",
    ("SP1", "oviedo"): "Oviedo",
    ("SP1", "real racing club"): "Santander",
    ("SP1", "racing santander"): "Santander",
    ("SP1", "santander"): "Santander",
    ("SP1", "real sociedad"): "Sociedad",
    ("SP1", "sociedad"): "Sociedad",
    ("SP1", "real valladolid"): "Valladolid",
    ("SP1", "valladolid"): "Valladolid",
    ("SP1", "sd huesca"): "Huesca",
    ("SP1", "huesca"): "Huesca",
    ("SP1", "sevilla fc"): "Sevilla",
    ("SP1", "sevilla"): "Sevilla",
    ("SP1", "valencia cf"): "Valencia",
    ("SP1", "valencia"): "Valencia",
    ("SP1", "villarreal cf"): "Villarreal",
    ("SP1", "villarreal"): "Villarreal",
    # D1 (Bundesliga)
    ("D1", "1.fc union berlin"): "Union Berlin",
    ("D1", "1. fc union berlin"): "Union Berlin",
    ("D1", "union berlin"): "Union Berlin",
    ("D1", "1.fsv mainz 05"): "Mainz",
    ("D1", "1. fsv mainz 05"): "Mainz",
    ("D1", "mainz 05"): "Mainz",
    ("D1", "mainz"): "Mainz",
    ("D1", "arminia bielefeld"): "Bielefeld",
    ("D1", "bielefeld"): "Bielefeld",
    ("D1", "bayer 04 leverkusen"): "Leverkusen",
    ("D1", "bayer leverkusen"): "Leverkusen",
    ("D1", "leverkusen"): "Leverkusen",
    ("D1", "bayern munich"): "Bayern Munich",
    ("D1", "bayern munchen"): "Bayern Munich",
    ("D1", "bochum"): "Bochum",
    ("D1", "vfl bochum"): "Bochum",
    ("D1", "borussia dortmund"): "Dortmund",
    ("D1", "dortmund"): "Dortmund",
    ("D1", "borussia monchengladbach"): "M'gladbach",
    ("D1", "borussia m.gladbach"): "M'gladbach",
    ("D1", "m'gladbach"): "M'gladbach",
    ("D1", "darmstadt"): "Darmstadt",
    ("D1", "sv darmstadt 98"): "Darmstadt",
    ("D1", "eintracht francfort"): "Ein Frankfurt",
    ("D1", "eintracht frankfurt"): "Ein Frankfurt",
    ("D1", "ein frankfurt"): "Ein Frankfurt",
    ("D1", "sv elversberg"): "Elversberg",
    ("D1", "elversberg"): "Elversberg",
    ("D1", "fc augsburgo"): "Augsburg",
    ("D1", "fc augsburg"): "Augsburg",
    ("D1", "augsburg"): "Augsburg",
    ("D1", "fc cologne"): "FC Koln",
    ("D1", "1.fc koln"): "FC Koln",
    ("D1", "1. fc koln"): "FC Koln",
    ("D1", "fc koln"): "FC Koln",
    ("D1", "fc heidenheim"): "Heidenheim",
    ("D1", "1.fc heidenheim 1846"): "Heidenheim",
    ("D1", "heidenheim"): "Heidenheim",
    ("D1", "fc schalke 04"): "Schalke 04",
    ("D1", "schalke 04"): "Schalke 04",
    ("D1", "fortuna duesseldorf"): "Fortuna Dusseldorf",
    ("D1", "fortuna dusseldorf"): "Fortuna Dusseldorf",
    ("D1", "greuther fuerth"): "Greuther Furth",
    ("D1", "greuther furth"): "Greuther Furth",
    ("D1", "hamburger sv"): "Hamburg",
    ("D1", "hamburg"): "Hamburg",
    ("D1", "hannover 96"): "Hannover",
    ("D1", "hannover"): "Hannover",
    ("D1", "hertha berlin"): "Hertha",
    ("D1", "hertha bsc"): "Hertha",
    ("D1", "hertha"): "Hertha",
    ("D1", "holstein kiel"): "Holstein Kiel",
    ("D1", "nuernberg"): "Nurnberg",
    ("D1", "nurnberg"): "Nurnberg",
    ("D1", "rb leipzig"): "RB Leipzig",
    ("D1", "rasenballsport leipzig"): "RB Leipzig",
    ("D1", "sc friburgo"): "Freiburg",
    ("D1", "sc freiburg"): "Freiburg",
    ("D1", "freiburg"): "Freiburg",
    ("D1", "sc paderborn 07"): "Paderborn",
    ("D1", "paderborn"): "Paderborn",
    ("D1", "sv werder bremen"): "Werder Bremen",
    ("D1", "werder bremen"): "Werder Bremen",
    ("D1", "st. pauli"): "St Pauli",
    ("D1", "fc st. pauli"): "St Pauli",
    ("D1", "st pauli"): "St Pauli",
    ("D1", "tsg 1899 hoffenheim"): "Hoffenheim",
    ("D1", "hoffenheim"): "Hoffenheim",
    ("D1", "vfb stuttgart"): "Stuttgart",
    ("D1", "stuttgart"): "Stuttgart",
    ("D1", "vfl wolfsburgo"): "Wolfsburg",
    ("D1", "vfl wolfsburg"): "Wolfsburg",
    ("D1", "wolfsburg"): "Wolfsburg",
    # I1 (Serie A)
    ("I1", "ac milan"): "Milan",
    ("I1", "milan"): "Milan",
    ("I1", "ac monza"): "Monza",
    ("I1", "monza"): "Monza",
    ("I1", "as roma"): "Roma",
    ("I1", "roma"): "Roma",
    ("I1", "atalanta de bergamo"): "Atalanta",
    ("I1", "atalanta bc"): "Atalanta",
    ("I1", "atalanta"): "Atalanta",
    ("I1", "benevento"): "Benevento",
    ("I1", "bolonia"): "Bologna",
    ("I1", "bologna fc 1909"): "Bologna",
    ("I1", "bologna"): "Bologna",
    ("I1", "brescia"): "Brescia",
    ("I1", "cagliari"): "Cagliari",
    ("I1", "cagliari calcio"): "Cagliari",
    ("I1", "chievo"): "Chievo",
    ("I1", "como 1907"): "Como",
    ("I1", "como"): "Como",
    ("I1", "cremonese"): "Cremonese",
    ("I1", "us cremonese"): "Cremonese",
    ("I1", "crotone"): "Crotone",
    ("I1", "empoli"): "Empoli",
    ("I1", "empoli fc"): "Empoli",
    ("I1", "fiorentina"): "Fiorentina",
    ("I1", "acf fiorentina"): "Fiorentina",
    ("I1", "frosinone calcio"): "Frosinone",
    ("I1", "frosinone"): "Frosinone",
    ("I1", "genoa cfc"): "Genoa",
    ("I1", "genoa"): "Genoa",
    ("I1", "inter de milan"): "Inter",
    ("I1", "inter milan"): "Inter",
    ("I1", "inter"): "Inter",
    ("I1", "juventus de turin"): "Juventus",
    ("I1", "juventus"): "Juventus",
    ("I1", "parma calcio 1913"): "Parma",
    ("I1", "parma"): "Parma",
    ("I1", "pisa sporting club"): "Pisa",
    ("I1", "pisa"): "Pisa",
    ("I1", "spal 2013"): "Spal",
    ("I1", "spal"): "Spal",
    ("I1", "ss lazio"): "Lazio",
    ("I1", "lazio"): "Lazio",
    ("I1", "ssc napoles"): "Napoli",
    ("I1", "ssc napoli"): "Napoli",
    ("I1", "napoli"): "Napoli",
    ("I1", "salernitana"): "Salernitana",
    ("I1", "sampdoria"): "Sampdoria",
    ("I1", "spezia"): "Spezia",
    ("I1", "torino fc"): "Torino",
    ("I1", "torino"): "Torino",
    ("I1", "us lecce"): "Lecce",
    ("I1", "lecce"): "Lecce",
    ("I1", "us sassuolo"): "Sassuolo",
    ("I1", "sassuolo"): "Sassuolo",
    ("I1", "udinese"): "Udinese",
    ("I1", "udinese calcio"): "Udinese",
    ("I1", "venezia fc"): "Venezia",
    ("I1", "venezia"): "Venezia",
    ("I1", "verona"): "Verona",
    ("I1", "hellas verona"): "Verona",
    # F1 (Ligue 1)
    ("F1", "aj auxerre"): "Auxerre",
    ("F1", "auxerre"): "Auxerre",
    ("F1", "ajaccio"): "Ajaccio",
    ("F1", "amiens"): "Amiens",
    ("F1", "angers sco"): "Angers",
    ("F1", "angers"): "Angers",
    ("F1", "as monaco"): "Monaco",
    ("F1", "monaco"): "Monaco",
    ("F1", "bordeaux"): "Bordeaux",
    ("F1", "caen"): "Caen",
    ("F1", "clermont foot"): "Clermont",
    ("F1", "clermont"): "Clermont",
    ("F1", "dijon"): "Dijon",
    ("F1", "estac troyes"): "Troyes",
    ("F1", "troyes"): "Troyes",
    ("F1", "fc lorient"): "Lorient",
    ("F1", "lorient"): "Lorient",
    ("F1", "fc metz"): "Metz",
    ("F1", "metz"): "Metz",
    ("F1", "fc nantes"): "Nantes",
    ("F1", "nantes"): "Nantes",
    ("F1", "guingamp"): "Guingamp",
    ("F1", "le havre ac"): "Le Havre",
    ("F1", "le havre"): "Le Havre",
    ("F1", "le mans"): "Le Mans",
    ("F1", "losc lille"): "Lille",
    ("F1", "lille"): "Lille",
    ("F1", "montpellier"): "Montpellier",
    ("F1", "montpellier hsc"): "Montpellier",
    ("F1", "nimes"): "Nimes",
    ("F1", "ogc niza"): "Nice",
    ("F1", "ogc nice"): "Nice",
    ("F1", "nice"): "Nice",
    ("F1", "olympique de lyon"): "Lyon",
    ("F1", "lyon"): "Lyon",
    ("F1", "olympique de marsella"): "Marseille",
    ("F1", "marseille"): "Marseille",
    ("F1", "paris fc"): "Paris FC",
    ("F1", "paris saint-germain"): "Paris SG",
    ("F1", "paris saint germain"): "Paris SG",
    ("F1", "paris sg"): "Paris SG",
    ("F1", "rc lens"): "Lens",
    ("F1", "lens"): "Lens",
    ("F1", "racing club de estrasburgo"): "Strasbourg",
    ("F1", "rc strasbourg alsace"): "Strasbourg",
    ("F1", "strasbourg"): "Strasbourg",
    ("F1", "reims"): "Reims",
    ("F1", "stade de reims"): "Reims",
    ("F1", "saint-etienne"): "St Etienne",
    ("F1", "as saint-etienne"): "St Etienne",
    ("F1", "st etienne"): "St Etienne",
    ("F1", "stade brestois 29"): "Brest",
    ("F1", "brest"): "Brest",
    ("F1", "stade rennais fc"): "Rennes",
    ("F1", "rennes"): "Rennes",
    ("F1", "toulouse fc"): "Toulouse",
    ("F1", "toulouse"): "Toulouse",
    # MEX (Liga MX)
    ("MEX", "atlas guadalajara"): "Atlas",
    ("MEX", "atlas fc"): "Atlas",
    ("MEX", "atlas"): "Atlas",
    ("MEX", "atletico de san luis"): "Atl. San Luis",
    ("MEX", "atletico san luis"): "Atl. San Luis",
    ("MEX", "san luis"): "Atl. San Luis",
    ("MEX", "atl. san luis"): "Atl. San Luis",
    ("MEX", "cd cruz azul"): "Cruz Azul",
    ("MEX", "cruz azul"): "Cruz Azul",
    ("MEX", "team_cruz_azul"): "Cruz Azul",
    ("MEX", "cd guadalajara"): "Guadalajara Chivas",
    ("MEX", "guadalajara"): "Guadalajara Chivas",
    ("MEX", "chivas"): "Guadalajara Chivas",
    ("MEX", "guadalajara chivas"): "Guadalajara Chivas",
    ("MEX", "team_guadalajara"): "Guadalajara Chivas",
    ("MEX", "cf america"): "Club America",
    ("MEX", "america"): "Club America",
    ("MEX", "club america"): "Club America",
    ("MEX", "team_club_america"): "Club America",
    ("MEX", "cf atlante"): "Atlante",
    ("MEX", "atlante"): "Atlante",
    ("MEX", "mazatlan"): "Mazatlan FC",
    ("MEX", "mazatlan fc"): "Mazatlan FC",
    ("MEX", "cf monterrey"): "Monterrey",
    ("MEX", "monterrey"): "Monterrey",
    ("MEX", "team_monterrey"): "Monterrey",
    ("MEX", "cf pachuca"): "Pachuca",
    ("MEX", "pachuca"): "Pachuca",
    ("MEX", "team_pachuca"): "Pachuca",
    ("MEX", "club leon fc"): "Club Leon",
    ("MEX", "club leon"): "Club Leon",
    ("MEX", "leon"): "Club Leon",
    ("MEX", "team_leon"): "Club Leon",
    ("MEX", "club necaxa"): "Necaxa",
    ("MEX", "necaxa"): "Necaxa",
    ("MEX", "team_necaxa"): "Necaxa",
    ("MEX", "club puebla"): "Puebla",
    ("MEX", "puebla"): "Puebla",
    ("MEX", "team_puebla"): "Puebla",
    ("MEX", "club tijuana"): "Club Tijuana",
    ("MEX", "tijuana"): "Club Tijuana",
    ("MEX", "team_tijuana"): "Club Tijuana",
    ("MEX", "deportivo toluca fc"): "Toluca",
    ("MEX", "deportivo toluca"): "Toluca",
    ("MEX", "toluca"): "Toluca",
    ("MEX", "team_toluca"): "Toluca",
    ("MEX", "fc juarez"): "Juarez",
    ("MEX", "juarez"): "Juarez",
    ("MEX", "team_juarez"): "Juarez",
    ("MEX", "lobos buap"): "Lobos BUAP",
    ("MEX", "morelia"): "Monarcas",
    ("MEX", "monarcas"): "Monarcas",
    ("MEX", "pumas unam"): "UNAM Pumas",
    ("MEX", "unam"): "UNAM Pumas",
    ("MEX", "pumas"): "UNAM Pumas",
    ("MEX", "unam pumas"): "UNAM Pumas",
    ("MEX", "team_pumas"): "UNAM Pumas",
    ("MEX", "queretaro fc"): "Queretaro",
    ("MEX", "queretaro"): "Queretaro",
    ("MEX", "team_queretaro"): "Queretaro",
    ("MEX", "santos laguna"): "Santos Laguna",
    ("MEX", "santos"): "Santos Laguna",
    ("MEX", "team_santos_laguna"): "Santos Laguna",
    ("MEX", "tigres uanl"): "Tigres UANL",
    ("MEX", "uanl"): "Tigres UANL",
    ("MEX", "tigres"): "Tigres UANL",
    ("MEX", "team_tigres_uanl"): "Tigres UANL",
    ("MEX", "veracruz"): "Veracruz",
}

NFL_NAME_TO_ABBR: dict[str, str] = {
    "arizona cardinals": "ARI",
    "atlanta falcons": "ATL",
    "baltimore ravens": "BAL",
    "buffalo bills": "BUF",
    "carolina panthers": "CAR",
    "chicago bears": "CHI",
    "cincinnati bengals": "CIN",
    "cleveland browns": "CLE",
    "dallas cowboys": "DAL",
    "denver broncos": "DEN",
    "detroit lions": "DET",
    "green bay packers": "GB",
    "houston texans": "HOU",
    "indianapolis colts": "IND",
    "jacksonville jaguars": "JAX",
    "kansas city chiefs": "KC",
    "las vegas raiders": "LV",
    "oakland raiders": "OAK",
    "los angeles chargers": "LAC",
    "san diego chargers": "SD",
    "los angeles rams": "LA",
    "st. louis rams": "STL",
    "miami dolphins": "MIA",
    "minnesota vikings": "MIN",
    "new england patriots": "NE",
    "new orleans saints": "NO",
    "new york giants": "NYG",
    "new york jets": "NYJ",
    "philadelphia eagles": "PHI",
    "pittsburgh steelers": "PIT",
    "san francisco 49ers": "SF",
    "seattle seahawks": "SEA",
    "tampa bay buccaneers": "TB",
    "tennessee titans": "TEN",
    "washington commanders": "WAS",
    "washington football team": "WAS",
    "washington redskins": "WAS",
}

# Elevación física invariante (m) para clubes históricos/reubicados de Liga MX y Europa
HISTORICAL_STADIUM_PHYSICS_OVERRIDES: list[dict[str, Any]] = [
    # Mazatlán FC jugó en Estadio El Encanto (12 m sobre el nivel del mar) en 2020–2025;
    # Atlante juega en Estadio Ciudad de los Deportes CDMX (2,245 m) desde 2026.
    {"div": "MEX", "pl_team": "Mazatlan FC", "stadium_name": "Estadio El Encanto", "city": "Mazatlán", "stadium_elevation_m": 12.0, "roof_type": "open"},
    {"div": "MEX", "pl_team": "Atlante", "stadium_name": "Estadio Ciudad de los Deportes (CDMX)", "city": "Ciudad de México", "stadium_elevation_m": 2245.0, "roof_type": "open"},
    {"div": "MEX", "pl_team": "Monarcas", "stadium_name": "Estadio Morelos", "city": "Morelia", "stadium_elevation_m": 1920.0, "roof_type": "open"},
    {"div": "MEX", "pl_team": "Lobos BUAP", "stadium_name": "Estadio Universitario BUAP", "city": "Puebla", "stadium_elevation_m": 2175.0, "roof_type": "open"},
    {"div": "MEX", "pl_team": "Veracruz", "stadium_name": "Estadio Luis Pirata Fuente", "city": "Veracruz", "stadium_elevation_m": 10.0, "roof_type": "open"},
    # Sedes adicionales de clubes históricos recientes en Europa (altitud física invariante)
    {"div": "SP1", "pl_team": "Granada", "stadium_name": "Nuevo Los Cármenes", "city": "Granada", "stadium_elevation_m": 738.0, "roof_type": "open"},
    {"div": "SP1", "pl_team": "Valladolid", "stadium_name": "José Zorrilla", "city": "Valladolid", "stadium_elevation_m": 698.0, "roof_type": "open"},
    {"div": "SP1", "pl_team": "Getafe", "stadium_name": "Coliseum", "city": "Getafe", "stadium_elevation_m": 623.0, "roof_type": "open"},
    {"div": "SP1", "pl_team": "Leganes", "stadium_name": "Butarque", "city": "Leganés", "stadium_elevation_m": 665.0, "roof_type": "open"},
    {"div": "SP1", "pl_team": "Vallecano", "stadium_name": "Vallecas", "city": "Madrid", "stadium_elevation_m": 640.0, "roof_type": "open"},
    {"div": "SP1", "pl_team": "Alaves", "stadium_name": "Mendizorrotza", "city": "Vitoria-Gasteiz", "stadium_elevation_m": 535.0, "roof_type": "open"},
    {"div": "SP1", "pl_team": "Huesca", "stadium_name": "El Alcoraz", "city": "Huesca", "stadium_elevation_m": 488.0, "roof_type": "open"},
    {"div": "D1", "pl_team": "Bayern Munich", "stadium_name": "Allianz Arena", "city": "Munich", "stadium_elevation_m": 515.0, "roof_type": "open"},
    {"div": "D1", "pl_team": "Augsburg", "stadium_name": "WWK Arena", "city": "Augsburg", "stadium_elevation_m": 490.0, "roof_type": "open"},
    {"div": "D1", "pl_team": "Heidenheim", "stadium_name": "Voith-Arena", "city": "Heidenheim", "stadium_elevation_m": 555.0, "roof_type": "open"},
]


def strip_accents_lower(text: Any) -> str:
    if text is None:
        return ""
    cleaned = str(text).replace("\u200b", "").replace("\xa0", " ").strip()
    norm = unicodedata.normalize("NFKD", cleaned)
    s = "".join(c for c in norm if not unicodedata.combining(c)).lower()
    return re.sub(r"\s+", " ", s).strip()


def structural_pressure_from_elevation(elevation_m: float | None) -> float | None:
    """Fórmula barométrica internacional (ISA) estrictamente invariante en el tiempo."""
    if elevation_m is None or not math.isfinite(float(elevation_m)):
        return None
    h = max(-100.0, min(5000.0, float(elevation_m)))
    return round(1013.25 * ((1.0 - 2.25577e-5 * h) ** 5.25588), 2)


def sha256_text(content: str | bytes) -> str:
    raw = content.encode("utf-8") if isinstance(content, str) else content
    return hashlib.sha256(raw).hexdigest()


def verify_envelope_sha256(envelope: dict[str, Any], expected_sha: str) -> tuple[bool, str]:
    """Verifica criptográficamente que el `payload` del envoltorio coincida con `sha256`."""
    stored_sha = str(envelope.get("sha256") or "")
    if not stored_sha or stored_sha != expected_sha:
        return False, stored_sha
    payload = envelope.get("payload")
    canonical = (
        payload
        if isinstance(payload, str)
        else json.dumps(payload, ensure_ascii=False, sort_keys=True)
    )
    computed = sha256_text(canonical)
    if computed == expected_sha:
        return True, computed
    for candidate_str in (
        json.dumps(payload, sort_keys=True),
        json.dumps(payload, ensure_ascii=False),
        json.dumps(payload),
    ):
        alt_hash = sha256_text(candidate_str)
        if alt_hash == expected_sha:
            return True, alt_hash
    return False, computed


def verify_web_scraping_manifest(ws_root: Path) -> dict[str, Any]:
    """Verifica criptográficamente los 55 snapshots crudos en `.worktrees/web-scraping`."""
    manifest_path = ws_root / "data" / "normalized" / "manifest_summary.json"
    if not manifest_path.exists():
        raise FileNotFoundError(f"No existe manifest_summary.json en {manifest_path}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    snapshots = manifest.get("raw_snapshots", [])
    verified = 0
    mismatches: list[str] = []
    for snap in snapshots:
        rel_path = snap["raw_snapshot_path"]
        expected_sha = snap["sha256"]
        full_path = ws_root / rel_path
        if not full_path.exists():
            mismatches.append(f"MISSING:{rel_path}")
            continue
        envelope = json.loads(full_path.read_text(encoding="utf-8"))
        ok, actual_sha = verify_envelope_sha256(envelope, expected_sha)
        if not ok:
            mismatches.append(f"SHA_MISMATCH:{rel_path}:{actual_sha}!={expected_sha}")
            continue
        verified += 1
    if mismatches:
        raise RuntimeError(f"Fallo de verificación SHA-256 en web-scraping: {mismatches[:5]}")
    return {
        "manifest_version": manifest.get("manifest_version"),
        "generated_at_utc": manifest.get("generated_at_utc"),
        "snapshots_total": len(snapshots),
        "snapshots_verified": verified,
        "all_sha256_verified": verified == len(snapshots) and len(snapshots) > 0,
        "normalized_tables_summary": manifest.get("normalized_tables_summary", {}),
    }


def load_ws_entity_resolver(ws_root: Path, rosetta: RosettaStatiskicks):
    """Carga de forma aislada (read-only) las tablas de alias de `build_feature_store.py` y las une con Rosetta."""
    bfs_path = ws_root / "scrapers" / "build_feature_store.py"
    spec = importlib.util.spec_from_file_location("_ws_build_feature_store", bfs_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"No se pudo cargar {bfs_path}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    tmf_path = ws_root / "data" / "feature_store" / "team_master_features.json"
    tmf_records = json.loads(tmf_path.read_text(encoding="utf-8"))["records"]

    # Construir índice universal: (league_or_div, alias_norm) -> ws_canonical_name
    league_alias_map: dict[tuple[str, str], str] = {}
    global_alias_map: dict[str, str] = {}

    for rec in tmf_records:
        cname = rec["team_name"]
        lg = rec["league"]
        norm_c = strip_accents_lower(cname)
        league_alias_map[(lg, norm_c)] = cname
        global_alias_map[norm_c] = cname
        slug_tok = mod._slug_token(cname)
        if slug_tok:
            league_alias_map[(lg, slug_tok)] = cname
            global_alias_map.setdefault(slug_tok, cname)

    for alias_k, target_name in getattr(mod, "EXPLICIT_TEAM_ALIASES", {}).items():
        norm_k = strip_accents_lower(alias_k)
        global_alias_map[norm_k] = target_name

    # Integrar los alias Opta/API-Football de RosettaStatiskicks
    for r_team in rosetta.list_teams():
        r_name = r_team.get("name", "")
        ws_target = global_alias_map.get(strip_accents_lower(r_name))
        if ws_target:
            for al in r_team.get("aliases", []):
                global_alias_map.setdefault(strip_accents_lower(al), ws_target)
            if r_team.get("opta_team_uuid"):
                global_alias_map.setdefault(r_team["opta_team_uuid"].lower(), ws_target)

    return {
        "tmf_records": tmf_records,
        "tmf_by_name": {r["team_name"]: r for r in tmf_records},
        "tmf_by_id": {r["team_id"]: r for r in tmf_records},
        "global_alias_map": global_alias_map,
        "league_alias_map": league_alias_map,
        "slug_fn": mod._slug_token,
    }


def resolve_pl_soccer_team(
    raw_name: str | None,
    div: str,
    match_date_iso: str | None,
    resolver_ctx: dict[str, Any],
    rosetta: RosettaStatiskicks,
) -> str | None:
    """Resuelve un nombre de equipo de `web-scraping` al nombre exacto en `matches.parquet` (`div`)."""
    if not raw_name:
        return None
    norm = strip_accents_lower(raw_name)

    # Desambiguación histórica clave en Liga MX:
    # En `build_feature_store.py`, "Mazatlán" se consolidó bajo "CF Atlante" (franquicia 2026),
    # mientras que en `matches.parquet` los partidos 2020-07 a 2026-05 figuran como "Mazatlan FC"
    # y los de 2026-07+ figuran como "Atlante".
    if div == "MEX":
        if "mazatlan" in norm:
            return "Mazatlan FC"
        if norm in ("cf atlante", "atlante", "atlante fc"):
            if match_date_iso and "2020-06-01" <= match_date_iso < "2026-06-01":
                return "Mazatlan FC"
            return "Atlante"

    direct = WS_TO_PL_TEAM_BY_DIV.get((div, norm))
    if direct:
        return direct

    # Intentar vía RosettaStatiskicks -> alias canónico -> WS_TO_PL_TEAM_BY_DIV
    r_team = rosetta.resolve_team(raw_name)
    if r_team:
        r_norm = strip_accents_lower(r_team.get("name", ""))
        via_rosetta = WS_TO_PL_TEAM_BY_DIV.get((div, r_norm))
        if via_rosetta:
            return via_rosetta

    # Intentar vía `web-scraping` canonical name
    ws_lg = DIV_TO_WS_LEAGUE.get(div, "")
    ws_canon = resolver_ctx["league_alias_map"].get((ws_lg, norm)) or resolver_ctx["global_alias_map"].get(norm)
    if ws_canon:
        norm_ws = strip_accents_lower(ws_canon)
        if div == "MEX" and norm_ws == "cf atlante":
            if match_date_iso and "2020-06-01" <= match_date_iso < "2026-06-01":
                return "Mazatlan FC"
            return "Atlante"
        mapped = WS_TO_PL_TEAM_BY_DIV.get((div, norm_ws))
        if mapped:
            return mapped

    return None


def _parse_score_pair(score_raw: Any) -> tuple[int | None, int | None]:
    if score_raw is None:
        return None, None
    s = str(score_raw).strip().replace("–", "-").replace("—", "-")
    m = re.search(r"(\d+)\s*-\s*(\d+)", s)
    if not m:
        return None, None
    return int(m.group(1)), int(m.group(2))


def build_ws_soccer_match_xg(
    ws_root: Path,
    matches_df: pd.DataFrame,
    resolver_ctx: dict[str, Any],
    rosetta: RosettaStatiskicks,
) -> pd.DataFrame:
    """Materializa `ws_soccer_match_xg_2018_2026.parquet` emparejado con `matches.parquet`."""
    xg_norm = json.loads((ws_root / "data" / "normalized" / "xg_and_team_ratings.json").read_text(encoding="utf-8"))["records"]
    hist_fs = json.loads((ws_root / "data" / "feature_store" / "historical_matches_xg.json").read_text(encoding="utf-8"))["records"]

    # 1. Construir diccionario de partidos con xG REAL EXACTO desde Nivel B (`xg_and_team_ratings.json`)
    #    para NO contaminar backtests con promedios 2026 de `team_master_features`.
    exact_xg_by_key: dict[tuple[str, str, str, str], dict[str, Any]] = {}

    # 1A. Understat (histórico 2018-2025 + temporada 2024/25)
    for r in xg_norm:
        rt = r.get("record_type")
        if rt not in ("understat_historical_match_fixture_xg", "understat_match_fixture_xg"):
            continue
        if not r.get("is_result", True):
            continue
        if r.get("home_xG") is None or r.get("away_xG") is None:
            continue
        dt_str = str(r.get("datetime") or "")[:10]
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", dt_str):
            continue
        div = WS_LEAGUE_TO_DIV.get(strip_accents_lower(r.get("league")), "")
        if not div:
            continue
        h_pl = resolve_pl_soccer_team(r.get("home_team"), div, dt_str, resolver_ctx, rosetta)
        a_pl = resolve_pl_soccer_team(r.get("away_team"), div, dt_str, resolver_ctx, rosetta)
        if not h_pl or not a_pl:
            continue
        exact_xg_by_key[(div, dt_str, h_pl, a_pl)] = {
            "real_home_xg": round(float(r["home_xG"]), 4),
            "real_away_xg": round(float(r["away_xG"]), 4),
            "post_shot_forecast_p_home": round(float(r["forecast_win"]), 4) if r.get("forecast_win") is not None else np.nan,
            "post_shot_forecast_p_draw": round(float(r["forecast_draw"]), 4) if r.get("forecast_draw") is not None else np.nan,
            "post_shot_forecast_p_away": round(float(r["forecast_loss"]), 4) if r.get("forecast_loss") is not None else np.nan,
            "exact_source_id": "understat",
        }

    # 1B. FBref Liga MX Historical Match xG (`2018-2023`, solo donde `r["home_xg"]` y `r["away_xg"]` no son nulos)
    for r in xg_norm:
        if r.get("record_type") != "fbref_ligamx_historical_match_xg":
            continue
        if r.get("home_xg") is None or r.get("away_xg") is None:
            continue
        dt_str = str(r.get("date") or "")[:10]
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", dt_str):
            continue
        h_pl = resolve_pl_soccer_team(r.get("home_team"), "MEX", dt_str, resolver_ctx, rosetta)
        a_pl = resolve_pl_soccer_team(r.get("away_team"), "MEX", dt_str, resolver_ctx, rosetta)
        if not h_pl or not a_pl:
            continue
        exact_xg_by_key[("MEX", dt_str, h_pl, a_pl)] = {
            "real_home_xg": round(float(r["home_xg"]), 4),
            "real_away_xg": round(float(r["away_xg"]), 4),
            "post_shot_forecast_p_home": np.nan,
            "post_shot_forecast_p_draw": np.nan,
            "post_shot_forecast_p_away": np.nan,
            "exact_source_id": "fbref_opta",
        }

    # 1C. Statiskicks Liga MX Rolling Point (`2025-2026`, exact match xG/xGA por encuentro)
    for r in xg_norm:
        if r.get("record_type") != "statiskicks_team_xg_rolling_point":
            continue
        if r.get("xG") is None or r.get("xGA") is None:
            continue
        raw_dt = str(r.get("date") or "").strip()
        if "/" in raw_dt:
            parts = raw_dt.split("/")
            dt_str = f"{parts[2]}-{parts[1].zfill(2)}-{parts[0].zfill(2)}" if len(parts) == 3 else raw_dt
        else:
            dt_str = raw_dt[:10]
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", dt_str):
            continue
        is_home = bool(r.get("is_home", True))
        t_self = resolve_pl_soccer_team(r.get("club_name") or r.get("team_key"), "MEX", dt_str, resolver_ctx, rosetta)
        t_opp = resolve_pl_soccer_team(r.get("opponent"), "MEX", dt_str, resolver_ctx, rosetta)
        if not t_self or not t_opp:
            continue
        h_pl = t_self if is_home else t_opp
        a_pl = t_opp if is_home else t_self
        h_xg = round(float(r["xG"]), 4) if is_home else round(float(r["xGA"]), 4)
        a_xg = round(float(r["xGA"]), 4) if is_home else round(float(r["xG"]), 4)
        key = ("MEX", dt_str, h_pl, a_pl)
        if key not in exact_xg_by_key or is_home:
            exact_xg_by_key[key] = {
                "real_home_xg": h_xg,
                "real_away_xg": a_xg,
                "post_shot_forecast_p_home": np.nan,
                "post_shot_forecast_p_draw": np.nan,
                "post_shot_forecast_p_away": np.nan,
                "exact_source_id": "statiskicks_opta",
            }

    # 2. Construir índice rápido de `matches.parquet` por `(div, home_team, away_team)`
    sub_m = matches_df[matches_df["div"].isin(["E0", "SP1", "D1", "I1", "F1", "MEX"])].copy()
    sub_m["date_str"] = pd.to_datetime(sub_m["match_date"]).dt.strftime("%Y-%m-%d")
    pl_index: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in sub_m[["match_id", "div", "season", "date_str", "home_team", "away_team", "home_goals", "away_goals"]].itertuples(index=False):
        pl_index[(row.div, row.home_team, row.away_team)].append(
            {
                "match_id": row.match_id,
                "season": str(row.season),
                "date_str": row.date_str,
                "home_goals": int(row.home_goals) if pd.notna(row.home_goals) else None,
                "away_goals": int(row.away_goals) if pd.notna(row.away_goals) else None,
            }
        )

    def _find_pl_match(div: str, ws_date: str, h_pl: str, a_pl: str, hg: int | None, ag: int | None) -> dict[str, Any] | None:
        candidates = pl_index.get((div, h_pl, a_pl), [])
        if not candidates:
            return None
        try:
            target_dt = datetime.strptime(ws_date, "%Y-%m-%d").date()
        except ValueError:
            return None
        best = None
        best_rank = (999, 999)
        for cand in candidates:
            c_dt = datetime.strptime(cand["date_str"], "%Y-%m-%d").date()
            day_diff = abs((c_dt - target_dt).days)
            if day_diff > 3:
                continue
            goals_match = (
                0
                if (hg is not None and ag is not None and cand["home_goals"] == hg and cand["away_goals"] == ag)
                else 1
            )
            # Rechazar ±2..3 días si el marcador no coincide
            if day_diff >= 2 and goals_match != 0:
                continue
            rank = (day_diff, goals_match)
            if rank < best_rank:
                best_rank = rank
                best = cand
        return best

    out_rows: list[dict[str, Any]] = []
    seen_match_ids: set[str] = set()

    for r in hist_fs:
        lg = str(r.get("league") or "").lower()
        div = WS_LEAGUE_TO_DIV.get(lg, "")
        ws_date = str(r.get("match_date") or "")[:10]
        if not div or not re.match(r"^\d{4}-\d{2}-\d{2}$", ws_date):
            continue
        h_pl = resolve_pl_soccer_team(r.get("home_team"), div, ws_date, resolver_ctx, rosetta)
        a_pl = resolve_pl_soccer_team(r.get("away_team"), div, ws_date, resolver_ctx, rosetta)
        hg = int(r["home_goals"]) if r.get("home_goals") is not None else None
        ag = int(r["away_goals"]) if r.get("away_goals") is not None else None

        pl_hit = _find_pl_match(div, ws_date, h_pl, a_pl, hg, ag) if (h_pl and a_pl) else None
        # Fallback en Liga MX por si CF Atlante en transición correspondía al otro nombre
        if pl_hit is None and div == "MEX" and h_pl in ("Mazatlan FC", "Atlante"):
            alt_h = "Atlante" if h_pl == "Mazatlan FC" else "Mazatlan FC"
            pl_hit = _find_pl_match(div, ws_date, alt_h, a_pl, hg, ag) if a_pl else None
            if pl_hit is not None:
                h_pl = alt_h
        if pl_hit is None and div == "MEX" and a_pl in ("Mazatlan FC", "Atlante"):
            alt_a = "Atlante" if a_pl == "Mazatlan FC" else "Mazatlan FC"
            pl_hit = _find_pl_match(div, ws_date, h_pl, alt_a, hg, ag) if h_pl else None
            if pl_hit is not None:
                a_pl = alt_a

        exact_info = exact_xg_by_key.get((div, ws_date, h_pl or "", a_pl or ""))
        if exact_info is None and pl_hit is not None:
            exact_info = exact_xg_by_key.get((div, pl_hit["date_str"], h_pl or "", a_pl or ""))

        match_id = pl_hit["match_id"] if pl_hit else None
        if match_id and match_id in seen_match_ids:
            # Si hay duplicado en fuente, priorizar el que tenga `exact_info`
            if exact_info is None:
                continue
            out_rows = [x for x in out_rows if x.get("match_id") != match_id]
        if match_id:
            seen_match_ids.add(match_id)

        is_exact = exact_info is not None
        out_rows.append(
            {
                "match_id": match_id,
                "div": div,
                "league": lg,
                "season": pl_hit["season"] if pl_hit else str(r.get("season") or ""),
                "match_date": pl_hit["date_str"] if pl_hit else ws_date,
                "ws_match_date": ws_date,
                "home_team": h_pl or str(r.get("home_team") or ""),
                "away_team": a_pl or str(r.get("away_team") or ""),
                "ws_home_team": str(r.get("home_team") or ""),
                "ws_away_team": str(r.get("away_team") or ""),
                "home_goals": hg,
                "away_goals": ag,
                "real_home_xg": exact_info["real_home_xg"] if is_exact else np.nan,
                "real_away_xg": exact_info["real_away_xg"] if is_exact else np.nan,
                "is_exact_xg": bool(is_exact),
                "post_shot_forecast_p_home": exact_info["post_shot_forecast_p_home"] if is_exact else np.nan,
                "post_shot_forecast_p_draw": exact_info["post_shot_forecast_p_draw"] if is_exact else np.nan,
                "post_shot_forecast_p_away": exact_info["post_shot_forecast_p_away"] if is_exact else np.nan,
                "source_id": exact_info["exact_source_id"] if is_exact else str(r.get("source_id") or ""),
                "captured_at_utc": str(r.get("captured_at_utc") or ""),
            }
        )

    df_out = pd.DataFrame(out_rows).sort_values(["div", "match_date", "home_team", "away_team"], kind="mergesort").reset_index(drop=True)
    return df_out


def build_ws_understat_tactical(
    ws_root: Path,
    matches_df: pd.DataFrame,
    resolver_ctx: dict[str, Any],
    rosetta: RosettaStatiskicks,
) -> pd.DataFrame:
    """Materializa `ws_understat_team_match_tactical.parquet` (`21,560` filas `2018–2025` deduplicadas por equipo-partido)."""
    xg_norm = json.loads((ws_root / "data" / "normalized" / "xg_and_team_ratings.json").read_text(encoding="utf-8"))["records"]
    ut_rows = [r for r in xg_norm if r.get("record_type") == "understat_team_match_history"]

    sub_m = matches_df[matches_df["div"].isin(["E0", "SP1", "D1", "I1", "F1"])].copy()
    sub_m["date_str"] = pd.to_datetime(sub_m["match_date"]).dt.strftime("%Y-%m-%d")

    team_date_index: dict[tuple[str, str, int], list[tuple[str, str]]] = defaultdict(list)
    for row in sub_m[["match_id", "div", "date_str", "home_team", "away_team"]].itertuples(index=False):
        team_date_index[(row.div, row.home_team, 1)].append((row.date_str, row.match_id))
        team_date_index[(row.div, row.away_team, 0)].append((row.date_str, row.match_id))

    def _lookup_match_id(div: str, pl_team: str, is_home: int, ws_date: str) -> tuple[str | None, str]:
        cands = team_date_index.get((div, pl_team, is_home), [])
        if not cands:
            return None, ws_date
        target = datetime.strptime(ws_date, "%Y-%m-%d").date()
        best_id, best_dt, best_diff = None, ws_date, 999
        for d_str, m_id in cands:
            diff = abs((datetime.strptime(d_str, "%Y-%m-%d").date() - target).days)
            if diff <= 2 and diff < best_diff:
                best_diff = diff
                best_id = m_id
                best_dt = d_str
        return best_id, best_dt

    parsed: list[dict[str, Any]] = []
    for r in ut_rows:
        div = WS_LEAGUE_TO_DIV.get(strip_accents_lower(r.get("league")), "")
        ws_date = str(r.get("date") or "")[:10]
        if not div or not re.match(r"^\d{4}-\d{2}-\d{2}$", ws_date):
            continue
        pl_team = resolve_pl_soccer_team(r.get("team_name"), div, ws_date, resolver_ctx, rosetta)
        if not pl_team:
            continue
        is_home = 1 if str(r.get("h_a") or "").lower() == "h" else 0
        m_id, canon_date = _lookup_match_id(div, pl_team, is_home, ws_date)
        pts = float(r["pts"]) if r.get("pts") is not None else np.nan
        xpts = float(r["xPTS"]) if r.get("xPTS") is not None else np.nan
        parsed.append(
            {
                "match_id": m_id,
                "div": div,
                "league": DIV_TO_WS_LEAGUE[div],
                "pl_team": pl_team,
                "ws_team_name": str(r.get("team_name") or ""),
                "match_date": canon_date,
                "ws_match_date": ws_date,
                "is_home": is_home,
                "goals_for": int(r["G"]) if r.get("G") is not None else 0,
                "goals_against": int(r["GA"]) if r.get("GA") is not None else 0,
                "pts": pts,
                "xg": float(r["xG"]) if r.get("xG") is not None else np.nan,
                "xga": float(r["xGA"]) if r.get("xGA") is not None else np.nan,
                "npxg": float(r["npxG"]) if r.get("npxG") is not None else np.nan,
                "npxga": float(r["npxGA"]) if r.get("npxGA") is not None else np.nan,
                "npxgd": float(r["npxGD"]) if r.get("npxGD") is not None else np.nan,
                "xpts": xpts,
                "pts_overperformance": (pts - xpts) if (math.isfinite(pts) and math.isfinite(xpts)) else np.nan,
                "xg_overperformance": float(r["xg_overperformance"]) if r.get("xg_overperformance") is not None else np.nan,
                "ppda_avg": float(r["ppda_avg"]) if r.get("ppda_avg") is not None else np.nan,
                "ppda_allowed_avg": float(r["ppda_allowed_avg"]) if r.get("ppda_allowed_avg") is not None else np.nan,
                "deep_completions": float(r["deep_completions"]) if r.get("deep_completions") is not None else np.nan,
                "deep_allowed": float(r["deep_allowed"]) if r.get("deep_allowed") is not None else np.nan,
                "captured_at_utc": str(r.get("captured_at_utc") or ""),
            }
        )

    df = pd.DataFrame(parsed)
    # Deduplicar snapshots solapados de Waves 3/4/5 conservando una fila por (div, pl_team, match_date)
    df = df.sort_values(["div", "pl_team", "match_date", "captured_at_utc"], kind="mergesort")
    df = df.drop_duplicates(subset=["div", "pl_team", "match_date"], keep="last").reset_index(drop=True)
    return df


def build_ws_stadium_physics(
    ws_root: Path,
    resolver_ctx: dict[str, Any],
    rosetta: RosettaStatiskicks,
) -> pd.DataFrame:
    """Materializa `ws_stadium_physics.parquet` con los 175 estadios de Open-Meteo + mapeo por equipo."""
    env_norm = json.loads((ws_root / "data" / "normalized" / "news_and_environment.json").read_text(encoding="utf-8"))["records"]
    stads = [r for r in env_norm if r.get("record_type") == "stadium_weather_forecast"]

    rows: list[dict[str, Any]] = []
    seen_team_keys: set[tuple[str, str]] = set()

    # 1. Los 175 estadios medidos directamente en Open-Meteo
    for s in stads:
        lg = str(s.get("league") or "").lower()
        div = WS_LEAGUE_TO_DIV.get(lg, lg.upper())
        elev = float(s["stadium_elevation_m"]) if s.get("stadium_elevation_m") is not None else 50.0
        struct_p = structural_pressure_from_elevation(elev)
        surf_p = float(s["mean_surface_pressure_hpa"]) if s.get("mean_surface_pressure_hpa") is not None else struct_p
        teams_list = s.get("teams") or []
        resolved_teams: list[str] = []
        for t_raw in teams_list:
            if div in ("E0", "SP1", "D1", "I1", "F1", "MEX"):
                pl_t = resolve_pl_soccer_team(t_raw, div, "2026-09-01", resolver_ctx, rosetta)
                if pl_t:
                    resolved_teams.append(pl_t)
                    seen_team_keys.add((div, pl_t))
            elif lg == "nfl":
                ab = NFL_NAME_TO_ABBR.get(strip_accents_lower(t_raw))
                if ab:
                    resolved_teams.append(ab)
                    seen_team_keys.add(("NFL", ab))
            else:
                resolved_teams.append(str(t_raw))
                seen_team_keys.add((lg.upper(), str(t_raw)))

        rows.append(
            {
                "record_scope": "stadium_primary",
                "stadium_id": str(s.get("stadium_id") or ""),
                "stadium_name": str(s.get("stadium_name") or ""),
                "league": lg,
                "div": div,
                "city": str(s.get("city") or ""),
                "primary_pl_team": resolved_teams[0] if resolved_teams else None,
                "mapped_teams_json": json.dumps(resolved_teams, ensure_ascii=False),
                "latitude": float(s["latitude"]) if s.get("latitude") is not None else np.nan,
                "longitude": float(s["longitude"]) if s.get("longitude") is not None else np.nan,
                "roof_type": str(s.get("roof_type") or "open"),
                "is_dome": bool(s.get("is_dome", False)),
                "stadium_elevation_m": elev,
                "high_altitude_flag": bool(elev >= 1500.0 or s.get("high_altitude_flag", False)),
                "altitude_shock_venue_flag": bool(elev >= 2100.0),
                "structural_pressure_hpa": struct_p,
                "surface_pressure_hpa": surf_p,
                # Campos prospectivos 7d marcados explícitamente para uso exclusivo live
                "live_7d_max_wind_speed_mph": float(s["max_wind_speed_mph"]) if s.get("max_wind_speed_mph") is not None else np.nan,
                "live_7d_max_wind_gusts_mph": float(s["max_wind_gusts_mph"]) if s.get("max_wind_gusts_mph") is not None else np.nan,
                "live_7d_total_precipitation_mm": float(s["total_precipitation_mm"]) if s.get("total_precipitation_mm") is not None else np.nan,
                "live_7d_min_temperature_c": float(s["min_temperature_c"]) if s.get("min_temperature_c") is not None else np.nan,
                "live_7d_max_temperature_c": float(s["max_temperature_c"]) if s.get("max_temperature_c") is not None else np.nan,
            }
        )

    # 2. Suplementar con los 376 equipos canónicos de `team_master_features` que no estaban en `teams` explícito
    for rec in resolver_ctx["tmf_records"]:
        lg = rec["league"]
        div = WS_LEAGUE_TO_DIV.get(lg, lg.upper())
        if div in ("E0", "SP1", "D1", "I1", "F1", "MEX"):
            pl_t = resolve_pl_soccer_team(rec["team_name"], div, "2026-09-01", resolver_ctx, rosetta) or rec["team_name"]
        elif lg == "nfl":
            pl_t = NFL_NAME_TO_ABBR.get(strip_accents_lower(rec["team_name"]), rec["team_name"])
            div = "NFL"
        else:
            pl_t = rec["team_name"]
        if (div, pl_t) in seen_team_keys:
            continue
        seen_team_keys.add((div, pl_t))
        elev = float(rec["stadium_elevation_m"]) if rec.get("stadium_elevation_m") is not None else 60.0
        struct_p = structural_pressure_from_elevation(elev)
        surf_p = float(rec["surface_pressure_hpa"]) if rec.get("surface_pressure_hpa") is not None else struct_p
        roof = str(rec.get("roof_type") or "open")
        rows.append(
            {
                "record_scope": "team_master_supplement",
                "stadium_id": f"tmf_{rec['team_id']}",
                "stadium_name": str(rec.get("stadium_name") or f"{rec['team_name']} Stadium"),
                "league": lg,
                "div": div,
                "city": "",
                "primary_pl_team": pl_t,
                "mapped_teams_json": json.dumps([pl_t], ensure_ascii=False),
                "latitude": np.nan,
                "longitude": np.nan,
                "roof_type": roof,
                "is_dome": roof.lower() in ("dome", "indoor", "closed", "retractable"),
                "stadium_elevation_m": elev,
                "high_altitude_flag": bool(elev >= 1500.0 or rec.get("high_altitude_flag", False)),
                "altitude_shock_venue_flag": bool(elev >= 2100.0),
                "structural_pressure_hpa": struct_p,
                "surface_pressure_hpa": surf_p,
                "live_7d_max_wind_speed_mph": float(rec["max_wind_speed_mph_7d"]) if rec.get("max_wind_speed_mph_7d") is not None else np.nan,
                "live_7d_max_wind_gusts_mph": float(rec["max_wind_gusts_mph_7d"]) if rec.get("max_wind_gusts_mph_7d") is not None else np.nan,
                "live_7d_total_precipitation_mm": float(rec["total_precipitation_mm_7d"]) if rec.get("total_precipitation_mm_7d") is not None else np.nan,
                "live_7d_min_temperature_c": np.nan,
                "live_7d_max_temperature_c": np.nan,
            }
        )

    # 3. Añadir overrides históricos invariantes (ej. Mazatlán FC 12m vs Atlante 2245m, Monarcas 1920m, Lobos BUAP 2175m)
    for ov in HISTORICAL_STADIUM_PHYSICS_OVERRIDES:
        key = (ov["div"], ov["pl_team"])
        if key in seen_team_keys and ov["pl_team"] != "Mazatlan FC":
            continue
        seen_team_keys.add(key)
        elev = float(ov["stadium_elevation_m"])
        struct_p = structural_pressure_from_elevation(elev)
        rows.append(
            {
                "record_scope": "historical_club_invariant",
                "stadium_id": f"hist_{ov['div'].lower()}_{strip_accents_lower(ov['pl_team']).replace(' ', '_')}",
                "stadium_name": ov["stadium_name"],
                "league": DIV_TO_WS_LEAGUE.get(ov["div"], ov["div"].lower()),
                "div": ov["div"],
                "city": ov["city"],
                "primary_pl_team": ov["pl_team"],
                "mapped_teams_json": json.dumps([ov["pl_team"]], ensure_ascii=False),
                "latitude": np.nan,
                "longitude": np.nan,
                "roof_type": ov["roof_type"],
                "is_dome": False,
                "stadium_elevation_m": elev,
                "high_altitude_flag": bool(elev >= 1500.0),
                "altitude_shock_venue_flag": bool(elev >= 2100.0),
                "structural_pressure_hpa": struct_p,
                "surface_pressure_hpa": struct_p,
                "live_7d_max_wind_speed_mph": np.nan,
                "live_7d_max_wind_gusts_mph": np.nan,
                "live_7d_total_precipitation_mm": np.nan,
                "live_7d_min_temperature_c": np.nan,
                "live_7d_max_temperature_c": np.nan,
            }
        )

    return pd.DataFrame(rows)


def _canonical_franchise_key(sport: str, team_name: str, team_abbr: str | None = None) -> str:
    norm = strip_accents_lower(team_name)
    ab = (team_abbr or "").upper().strip()
    if sport == "hockey":
        if ab in ("ARI", "UTA") or "coyotes" in norm or "utah" in norm:
            return "nhl_ari_uta_franchise"
        return f"nhl_{ab.lower() or norm.replace(' ', '_')}"
    if sport == "baseball":
        if ab in ("OAK", "ATH") or "athletics" in norm:
            return "mlb_oak_ath_franchise"
        return f"mlb_{ab.lower() or norm.replace(' ', '_')}"
    if sport == "basketball":
        return f"nba_{ab.lower() or norm.replace(' ', '_')}"
    if sport == "college-football":
        return f"ncaaf_{norm.replace(' ', '_')}"
    if sport == "football":
        nfl_ab = NFL_NAME_TO_ABBR.get(norm, ab or norm.upper()[:3])
        return f"nfl_{nfl_ab.lower()}"
    return f"{sport}_{norm.replace(' ', '_')}"


def build_ws_multisport_team_seasons(ws_root: Path, resolver_ctx: dict[str, Any]) -> pd.DataFrame:
    """Materializa `ws_multisport_team_seasons.parquet` (`716` equipos-temporada NHL/MLB/NBA/NCAAF + `32` NFL SumerSports)."""
    xg_norm = json.loads((ws_root / "data" / "normalized" / "xg_and_team_ratings.json").read_text(encoding="utf-8"))["records"]

    rows: list[dict[str, Any]] = []

    def _f(r: dict[str, Any], key: str) -> float:
        val = r.get(key)
        if val is None:
            return np.nan
        try:
            return float(str(val).replace(",", "").strip())
        except ValueError:
            return np.nan

    # 1. NHL (128), MLB (90), NBA (90), NCAAF (408) -> exactamente 716 filas históricas/actuales
    for r in xg_norm:
        rt = r.get("record_type")
        if rt == "nhl_team_season_advanced":
            gp = _f(r, "games_played")
            wins = _f(r, "wins")
            otl = _f(r, "ot_losses")
            t_name = str(r.get("team_name") or "")
            ws_canon = resolver_ctx["league_alias_map"].get(("nhl", strip_accents_lower(t_name))) or t_name
            rows.append(
                {
                    "sport": "hockey",
                    "league": "nhl",
                    "record_type": rt,
                    "season": str(r.get("season") or ""),
                    "season_sort": int(str(r.get("season") or "0")[:4]),
                    "team_name": ws_canon,
                    "raw_team_name": t_name,
                    "team_abbr": str(r.get("team_abbr") or ""),
                    "franchise_key": _canonical_franchise_key("hockey", t_name, r.get("team_abbr")),
                    "conference": str(r.get("conference") or ""),
                    "games_played": gp,
                    "wins": wins,
                    "losses": _f(r, "losses"),
                    "ot_losses": otl,
                    "win_pct": wins / gp if (math.isfinite(gp) and gp > 0) else np.nan,
                    "points_pct": (2.0 * wins + (otl if math.isfinite(otl) else 0.0)) / (2.0 * gp) if (math.isfinite(gp) and gp > 0) else np.nan,
                    "pythag_win_pct": _f(r, "pythag_win_pct_215"),
                    "srs": _f(r, "srs"),
                    "sos": _f(r, "sos"),
                    "nhl_xg_pct_5on5": _f(r, "xg_pct_5on5"),
                    "nhl_xg_pct_all": _f(r, "xg_pct"),
                    "nhl_corsi_pct_5on5": _f(r, "corsi_for_pct_5on5"),
                    "nhl_fenwick_pct_5on5": _f(r, "fenwick_for_pct_5on5"),
                    "nhl_hd_xg_for_5on5": _f(r, "high_danger_xg_for_5on5"),
                    "nhl_hd_xg_against_5on5": _f(r, "high_danger_xg_against_5on5"),
                    "nhl_save_pct_unblocked": _f(r, "save_pct_on_unblocked"),
                    "is_current_in_progress_season": bool(r.get("is_current_in_progress_season", False)),
                }
            )
        elif rt == "mlb_team_season_advanced":
            gp = _f(r, "games_played")
            wins = _f(r, "wins")
            t_name = str(r.get("team_name") or "")
            ws_canon = resolver_ctx["league_alias_map"].get(("mlb", strip_accents_lower(t_name))) or t_name
            rows.append(
                {
                    "sport": "baseball",
                    "league": "mlb",
                    "record_type": rt,
                    "season": str(r.get("season") or ""),
                    "season_sort": int(str(r.get("season") or "0")[:4]),
                    "team_name": ws_canon,
                    "raw_team_name": t_name,
                    "team_abbr": str(r.get("team_abbr") or ""),
                    "franchise_key": _canonical_franchise_key("baseball", t_name, r.get("team_abbr")),
                    "conference": str(r.get("al_nl_league") or r.get("division") or ""),
                    "games_played": gp,
                    "wins": wins,
                    "losses": _f(r, "losses"),
                    "win_pct": wins / gp if (math.isfinite(gp) and gp > 0) else np.nan,
                    "pythag_win_pct": _f(r, "pythag_win_pct_183"),
                    "mlb_runs_per_game": _f(r, "runs_per_game"),
                    "mlb_runs_allowed_per_game": _f(r, "runs_allowed_per_game"),
                    "mlb_ops_plus": _f(r, "ops_plus"),
                    "mlb_woba": _f(r, "woba_est"),
                    "mlb_fip": _f(r, "fip"),
                    "mlb_era": _f(r, "era"),
                    "mlb_whip": _f(r, "whip"),
                    "mlb_so_per_9": _f(r, "so_per_9"),
                    "mlb_bb_per_9": _f(r, "bb_per_9"),
                    "is_current_in_progress_season": bool(r.get("is_current_in_progress_season", False)),
                }
            )
        elif rt == "nba_team_season_advanced":
            gp = _f(r, "games_played")
            wins = _f(r, "wins")
            t_name = str(r.get("team_name") or "")
            ws_canon = resolver_ctx["league_alias_map"].get(("nba", strip_accents_lower(t_name))) or t_name
            rows.append(
                {
                    "sport": "basketball",
                    "league": "nba",
                    "record_type": rt,
                    "season": str(r.get("season") or ""),
                    "season_sort": int(str(r.get("season") or "0")[:4]),
                    "team_name": ws_canon,
                    "raw_team_name": t_name,
                    "team_abbr": str(r.get("team_abbr") or ""),
                    "franchise_key": _canonical_franchise_key("basketball", t_name, r.get("team_abbr")),
                    "conference": str(r.get("conference") or ""),
                    "games_played": gp,
                    "wins": wins,
                    "losses": _f(r, "losses"),
                    "win_pct": wins / gp if (math.isfinite(gp) and gp > 0) else np.nan,
                    "pythag_win_pct": _f(r, "pythag_win_pct_1391"),
                    "srs": _f(r, "srs"),
                    "sos": _f(r, "sos"),
                    "nba_ortg": _f(r, "ortg"),
                    "nba_drtg": _f(r, "drtg"),
                    "nba_net_rtg": _f(r, "net_rtg"),
                    "nba_pace": _f(r, "pace"),
                    "nba_efg_pct": _f(r, "efg_pct"),
                    "nba_tov_pct": _f(r, "tov_pct"),
                    "nba_orb_pct": _f(r, "orb_pct"),
                    "nba_ft_per_fga": _f(r, "ft_per_fga"),
                    "nba_opp_efg_pct": _f(r, "opp_efg_pct"),
                    "nba_opp_tov_pct": _f(r, "opp_tov_pct"),
                    "nba_drb_pct": _f(r, "drb_pct"),
                    "nba_opp_ft_per_fga": _f(r, "opp_ft_per_fga"),
                    "is_current_in_progress_season": bool(r.get("is_current_in_progress_season", False)),
                }
            )
        elif rt == "ncaaf_team_season_advanced":
            gp = _f(r, "games_played")
            wins = _f(r, "wins")
            t_name = str(r.get("team_name") or r.get("school_name") or "")
            ws_canon = resolver_ctx["league_alias_map"].get(("ncaaf", strip_accents_lower(t_name))) or t_name
            rows.append(
                {
                    "sport": "college-football",
                    "league": "ncaaf",
                    "record_type": rt,
                    "season": str(r.get("season") or ""),
                    "season_sort": int(str(r.get("season") or "0")[:4]),
                    "team_name": ws_canon,
                    "raw_team_name": t_name,
                    "team_abbr": str(r.get("team_abbr") or ""),
                    "franchise_key": _canonical_franchise_key("college-football", ws_canon, r.get("team_abbr")),
                    "conference": str(r.get("conference") or ""),
                    "games_played": gp,
                    "wins": wins,
                    "losses": _f(r, "losses"),
                    "win_pct": wins / gp if (math.isfinite(gp) and gp > 0) else np.nan,
                    "pythag_win_pct": _f(r, "pythag_win_pct_237"),
                    "srs": _f(r, "srs"),
                    "sos": _f(r, "sos"),
                    "ncaaf_espn_fpi": _f(r, "espn_fpi"),
                    "ncaaf_tr_rating": _f(r, "tr_predictive_rating"),
                    "ncaaf_off_ypp": _f(r, "off_yards_per_play"),
                    "ncaaf_def_ypp": _f(r, "def_yards_per_play"),
                    "ncaaf_net_ypp": _f(r, "net_yards_per_play"),
                    "ncaaf_pts_pg": _f(r, "points_per_game"),
                    "ncaaf_opp_pts_pg": _f(r, "opp_points_per_game"),
                    "is_current_in_progress_season": bool(r.get("is_current_in_progress_season", False)),
                }
            )

    # 2. NFL SumerSports Offense (32) + Defense (32) + PFR SRS (snapshot prospectivo 2026)
    nfl_off = {strip_accents_lower(r["team_name"]): r for r in xg_norm if r.get("record_type") == "nfl_sumersports_team_offense"}
    nfl_def = {strip_accents_lower(r["team_name"]): r for r in xg_norm if r.get("record_type") == "nfl_sumersports_team_defense"}
    nfl_pfr = {strip_accents_lower(r["team"]): r for r in xg_norm if r.get("record_type") == "nfl_pfr_team_row"}

    for t_norm, off_r in sorted(nfl_off.items()):
        def_r = nfl_def.get(t_norm, {})
        pfr_r = nfl_pfr.get(t_norm, {})
        t_name = str(off_r.get("team_name") or "")
        abbr = NFL_NAME_TO_ABBR.get(t_norm, "")
        w = _f(pfr_r, "wins")
        l_val = _f(pfr_r, "losses")
        ties = _f(pfr_r, "ties")
        gp = (w + l_val + (ties if math.isfinite(ties) else 0.0)) if (math.isfinite(w) and math.isfinite(l_val)) else np.nan
        rows.append(
            {
                "sport": "football",
                "league": "nfl",
                "record_type": "nfl_sumersports_combined",
                "season": str(off_r.get("season") or "2026"),
                "season_sort": int(str(off_r.get("season") or "2026")[:4]),
                "team_name": t_name,
                "raw_team_name": t_name,
                "team_abbr": abbr,
                "franchise_key": _canonical_franchise_key("football", t_name, abbr),
                "conference": "",
                "games_played": gp,
                "wins": w,
                "losses": l_val,
                "win_pct": _f(pfr_r, "win_loss_perc"),
                "srs": _f(pfr_r, "srs_total"),
                "sos": _f(pfr_r, "sos_total"),
                "nfl_off_epa_per_play": _f(off_r, "epa_per_play"),
                "nfl_def_epa_per_play": _f(def_r, "epa_per_play"),
                "nfl_off_success_pct": _f(off_r, "success_rate_pct"),
                "nfl_def_success_pct": _f(def_r, "success_rate_pct"),
                "nfl_off_epa_per_pass": _f(off_r, "epa_per_pass"),
                "nfl_off_epa_per_rush": _f(off_r, "epa_per_rush"),
                "nfl_def_epa_per_pass": _f(def_r, "epa_per_pass"),
                "nfl_def_epa_per_rush": _f(def_r, "epa_per_rush"),
                "is_current_in_progress_season": True,
            }
        )

    return pd.DataFrame(rows).sort_values(["sport", "league", "season_sort", "team_name"], kind="mergesort").reset_index(drop=True)


def build_ws_live_inference_context(
    ws_root: Path,
    resolver_ctx: dict[str, Any],
    rosetta: RosettaStatiskicks,
) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Materializa `ws_live_inference_context.parquet` y `.json` para inferencia prospectiva en vivo."""
    tmf_records = resolver_ctx["tmf_records"]
    edge_records = json.loads((ws_root / "data" / "feature_store" / "live_matchups_edge_matrix.json").read_text(encoding="utf-8"))["records"]
    mkt_records = json.loads((ws_root / "data" / "normalized" / "market_microstructure.json").read_text(encoding="utf-8"))["records"]
    roster_records = json.loads((ws_root / "data" / "normalized" / "roster_availability.json").read_text(encoding="utf-8"))["records"]
    env_records = json.loads((ws_root / "data" / "normalized" / "news_and_environment.json").read_text(encoding="utf-8"))["records"]

    # 1. Indexar señales granulares por equipo canónico
    # 1A. NFLPenalties por equipo y media de cuadrillas arbitrales
    nfl_pen_by_abbr: dict[str, dict[str, float]] = {}
    for r in env_records:
        if r.get("record_type") == "worldfootball_nflpenalties_referees_nfl_team_penalties":
            ab = NFL_NAME_TO_ABBR.get(strip_accents_lower(r.get("team")))
            if ab:
                nfl_pen_by_abbr[ab] = {
                    "penalties_per_game": float(r.get("penalties_per_game") or 0.0),
                    "penalty_yards_per_game": float(r.get("penalty_yards_per_game") or 0.0),
                }

    nfl_crews = [r for r in env_records if r.get("record_type") == "worldfootball_nflpenalties_referees_nfl_referee_crews"]
    nfl_league_ref_baseline = {
        "mean_flags_per_game": round(float(np.mean([float(r.get("total_flags_per_game") or 14.0) for r in nfl_crews])), 3) if nfl_crews else 14.0,
        "mean_home_penalties_pg": round(float(np.mean([float(r.get("home_penalties_per_game") or 6.0) for r in nfl_crews])), 3) if nfl_crews else 6.0,
        "mean_away_penalties_pg": round(float(np.mean([float(r.get("away_penalties_per_game") or 6.5) for r in nfl_crews])), 3) if nfl_crews else 6.5,
    }

    # 1B. Rigor arbitral medio por liga de fútbol (`worldfootball`)
    soccer_ref_by_league: dict[str, dict[str, float]] = {}
    by_lg_refs: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in env_records:
        if r.get("record_type") == "worldfootball_nflpenalties_referees_soccer_referees":
            by_lg_refs[str(r.get("league") or "").lower()].append(r)
    for lg_k, rlist in by_lg_refs.items():
        soccer_ref_by_league[lg_k] = {
            "referees_count": len(rlist),
            "mean_yellow_cards_pg": round(float(np.mean([float(x.get("yellow_cards_per_game") or 4.0) for x in rlist])), 3),
            "mean_red_cards_pg": round(float(np.mean([float(x.get("red_cards_per_game") or 0.2) for x in rlist])), 3),
            "mean_penalties_pg": round(float(np.mean([float(x.get("penalties_per_game") or 0.28) for x in rlist])), 3),
        }

    # 1C. NFL Official Injuries & Ourlads Starters + MultiSport Injuries & Probable Starters (NHL Goalies / MLB Pitchers)
    nfl_inj_counts: dict[str, dict[str, int]] = defaultdict(lambda: {"out_ir": 0, "questionable": 0, "qb_injured": 0})
    for r in roster_records:
        if r.get("record_type") == "nfl_official_injuries_depth_nfl_official_injuries":
            ab = NFL_NAME_TO_ABBR.get(strip_accents_lower(r.get("team")))
            if not ab:
                continue
            status = strip_accents_lower(r.get("game_status_designation") or r.get("practice_status"))
            pos = str(r.get("position") or "").upper()
            if any(k in status for k in ("out", "ir", "doubtful", "did not")):
                nfl_inj_counts[ab]["out_ir"] += 1
                if pos == "QB":
                    nfl_inj_counts[ab]["qb_injured"] += 1
            elif "questionable" in status or "limited" in status:
                nfl_inj_counts[ab]["questionable"] += 1

    ms_inj_by_team: dict[tuple[str, str], dict[str, int]] = defaultdict(lambda: {"out": 0, "questionable": 0})
    for r in roster_records:
        if r.get("record_type") == "multisport_player_injury":
            lg = str(r.get("league") or "").lower()
            t_raw = str(r.get("team") or "")
            t_can = resolver_ctx["league_alias_map"].get((lg, strip_accents_lower(t_raw))) or resolver_ctx["global_alias_map"].get(strip_accents_lower(t_raw)) or t_raw
            st = strip_accents_lower(r.get("game_status_designation") or r.get("status"))
            if any(k in st for k in ("out", "ir", "il", "injured reserve")):
                ms_inj_by_team[(lg, t_can)]["out"] += 1
            else:
                ms_inj_by_team[(lg, t_can)]["questionable"] += 1

    ms_starters_by_team: dict[tuple[str, str], list[dict[str, str]]] = defaultdict(list)
    for r in roster_records:
        if r.get("record_type") == "multisport_probable_starter":
            lg = str(r.get("league") or "").lower()
            t_raw = str(r.get("team") or "")
            t_can = resolver_ctx["league_alias_map"].get((lg, strip_accents_lower(t_raw))) or resolver_ctx["global_alias_map"].get(strip_accents_lower(t_raw)) or t_raw
            ms_starters_by_team[(lg, t_can)].append(
                {
                    "player_name": str(r.get("player_name") or ""),
                    "position": str(r.get("position") or ""),
                    "status": str(r.get("status") or ""),
                }
            )

    # 1D. Microestructura detallada por par canónico (`Pinnacle`, `Caliente.mx`, `Action Network` RLM/tickets/money)
    pin_by_pair: dict[tuple[str, str], dict[str, Any]] = {}
    cal_by_pair: dict[tuple[str, str], dict[str, Any]] = {}
    an_by_pair: dict[tuple[str, str], dict[str, Any]] = {}

    def _res_any(name: Any, lg_hint: str | None = None) -> str | None:
        if not name:
            return None
        n = strip_accents_lower(name)
        if lg_hint:
            hit = resolver_ctx["league_alias_map"].get((lg_hint.lower(), n))
            if hit:
                return hit
        return resolver_ctx["global_alias_map"].get(n) or resolver_ctx["global_alias_map"].get(resolver_ctx["slug_fn"](str(name)))

    for r in mkt_records:
        rt = r.get("record_type")
        if rt in ("pinnacle_matchup", "pinnacle_market"):
            if r.get("decimal_odds_home") is None or r.get("decimal_odds_away") is None:
                continue
            if rt == "pinnacle_market" and str(r.get("market_type") or "") not in ("moneyline", "1x2", "s;0;m"):
                continue
            hc = _res_any(r.get("home_team"))
            ac = _res_any(r.get("away_team"))
            if hc and ac:
                pin_by_pair[(hc, ac)] = {
                    "odds_home": float(r["decimal_odds_home"]),
                    "odds_draw": float(r["decimal_odds_draw"]) if r.get("decimal_odds_draw") is not None else None,
                    "odds_away": float(r["decimal_odds_away"]),
                    "overround": float(r["overround"]) if r.get("overround") is not None else None,
                }
        elif rt == "caliente_mx_event_odds":
            if r.get("decimal_odds_home") is None or r.get("decimal_odds_away") is None:
                continue
            hc = _res_any(r.get("home_team"))
            ac = _res_any(r.get("away_team"))
            if hc and ac:
                cal_by_pair[(hc, ac)] = {
                    "odds_home": float(r["decimal_odds_home"]),
                    "odds_draw": float(r["decimal_odds_draw"]) if r.get("decimal_odds_draw") is not None else None,
                    "odds_away": float(r["decimal_odds_away"]),
                    "overround": float(r["overround"]) if r.get("overround") is not None else None,
                }
        elif rt == "action_network_game_summary":
            lg_an = str(r.get("league") or "").lower()
            hc = _res_any(r.get("home_team"), lg_an)
            ac = _res_any(r.get("away_team"), lg_an)
            if hc and ac:
                an_by_pair[(hc, ac)] = {
                    "rlm_flag": bool(r.get("rlm_flag", False)),
                    "rlm_signals_count": len(r.get("rlm_signals") or []),
                    "rlm_signals": r.get("rlm_signals") or [],
                    "sharp_money_divergence": float(r["sharp_money_divergence"]) if r.get("sharp_money_divergence") is not None else 0.0,
                    "max_sharp_money_divergence": float(r["max_sharp_money_divergence"]) if r.get("max_sharp_money_divergence") is not None else 0.0,
                    "num_bets": int(r["num_bets"]) if r.get("num_bets") is not None else 0,
                    "odds_home": float(r["decimal_odds_home"]) if r.get("decimal_odds_home") is not None else None,
                    "odds_draw": float(r["decimal_odds_draw"]) if r.get("decimal_odds_draw") is not None else None,
                    "odds_away": float(r["decimal_odds_away"]) if r.get("decimal_odds_away") is not None else None,
                    "overround": float(r["overround"]) if r.get("overround") is not None else None,
                }

    # También capturar el lado exacto (`home` vs `away`) de `action_network_split_outcome`
    an_side_div: dict[tuple[str, str], dict[str, float]] = defaultdict(lambda: {"home_money_minus_tickets": 0.0, "away_money_minus_tickets": 0.0, "home_rlm": 0.0, "away_rlm": 0.0})
    for r in mkt_records:
        if r.get("record_type") != "action_network_split_outcome":
            continue
        if str(r.get("market_type") or "").lower() not in ("moneyline", "spread"):
            continue
        lg_an = str(r.get("league") or "").lower()
        hc = _res_any(r.get("home_team"), lg_an)
        ac = _res_any(r.get("away_team"), lg_an)
        if not hc or not ac:
            continue
        side = str(r.get("side") or "").lower()
        t_pct = r.get("tickets_pct")
        m_pct = r.get("money_pct")
        div_val = (float(m_pct) - float(t_pct)) if (t_pct is not None and m_pct is not None) else 0.0
        rlm_v = 1.0 if r.get("rlm_flag") else 0.0
        if side == "home":
            if abs(div_val) > abs(an_side_div[(hc, ac)]["home_money_minus_tickets"]):
                an_side_div[(hc, ac)]["home_money_minus_tickets"] = round(div_val, 2)
            an_side_div[(hc, ac)]["home_rlm"] = max(an_side_div[(hc, ac)]["home_rlm"], rlm_v)
        elif side == "away":
            if abs(div_val) > abs(an_side_div[(hc, ac)]["away_money_minus_tickets"]):
                an_side_div[(hc, ac)]["away_money_minus_tickets"] = round(div_val, 2)
            an_side_div[(hc, ac)]["away_rlm"] = max(an_side_div[(hc, ac)]["away_rlm"], rlm_v)

    # 2. Enriquecer los 376 equipos canónicos
    POPULAR_LIGAMX_CLUBS = {"CF América", "CD Guadalajara", "CD Cruz Azul", "Pumas UNAM", "Tigres UANL", "CF Monterrey"}
    enriched_teams: dict[str, dict[str, Any]] = {}
    for rec in tmf_records:
        cname = rec["team_name"]
        lg = rec["league"]
        div = WS_LEAGUE_TO_DIV.get(lg, lg.upper())
        pl_team = (
            resolve_pl_soccer_team(cname, div, "2026-11-10", resolver_ctx, rosetta)
            if div in ("E0", "SP1", "D1", "I1", "F1", "MEX")
            else (NFL_NAME_TO_ABBR.get(strip_accents_lower(cname), cname) if lg == "nfl" else cname)
        )
        t_copy = dict(rec)
        t_copy["pl_team"] = pl_team
        t_copy["div"] = div
        t_copy["structural_pressure_hpa"] = structural_pressure_from_elevation(rec.get("stadium_elevation_m"))
        t_copy["is_popular_mx_club"] = cname in POPULAR_LIGAMX_CLUBS
        if lg == "nfl" and pl_team in nfl_pen_by_abbr:
            t_copy["nfl_penalties_per_game"] = nfl_pen_by_abbr[pl_team]["penalties_per_game"]
            t_copy["nfl_penalty_yards_per_game"] = nfl_pen_by_abbr[pl_team]["penalty_yards_per_game"]
            t_copy["nfl_official_out_ir_count"] = nfl_inj_counts[pl_team]["out_ir"]
            t_copy["nfl_official_questionable_count"] = nfl_inj_counts[pl_team]["questionable"]
            t_copy["nfl_qb_injured_flag"] = nfl_inj_counts[pl_team]["qb_injured"] > 0
        elif lg in ("nba", "nhl", "mlb", "ncaaf"):
            inj = ms_inj_by_team.get((lg, cname), {"out": 0, "questionable": 0})
            t_copy["ms_confirmed_out_count"] = inj["out"]
            t_copy["ms_questionable_count"] = inj["questionable"]
            t_copy["probable_starters"] = ms_starters_by_team.get((lg, cname), [])
        enriched_teams[cname] = t_copy

    # 3. Enriquecer los 242 enfrentamientos activos
    enriched_matchups: list[dict[str, Any]] = []
    parquet_rows: list[dict[str, Any]] = []

    for m in edge_records:
        hc = m["home_team"]
        ac = m["away_team"]
        lg = m["league"]
        div = WS_LEAGUE_TO_DIV.get(lg, lg.upper())
        ht = enriched_teams.get(hc, {})
        at = enriched_teams.get(ac, {})
        pin = pin_by_pair.get((hc, ac))
        cal = cal_by_pair.get((hc, ac))
        an = an_by_pair.get((hc, ac))
        an_sides = an_side_div.get((hc, ac), {"home_money_minus_tickets": 0.0, "away_money_minus_tickets": 0.0, "home_rlm": 0.0, "away_rlm": 0.0})

        h_elev = float(ht.get("stadium_elevation_m") or 0.0)
        a_elev = float(at.get("stadium_elevation_m") or 0.0)
        alt_diff = round(h_elev - a_elev, 1)
        alt_shock = bool(h_elev >= 2100.0 and alt_diff >= 1000.0)

        h_press = ht.get("surface_pressure_hpa") or ht.get("structural_pressure_hpa") or 1013.25
        a_press = at.get("surface_pressure_hpa") or at.get("structural_pressure_hpa") or 1013.25
        press_diff = round(float(h_press) - float(a_press), 2)

        full_item = {
            **m,
            "div": div,
            "pl_home_team": ht.get("pl_team", hc),
            "pl_away_team": at.get("pl_team", ac),
            "altitude_shock_flag": alt_shock,
            "surface_pressure_diff_hpa": press_diff,
            "home_roof_type": ht.get("roof_type", "open"),
            "home_total_precipitation_mm_7d": ht.get("total_precipitation_mm_7d"),
            "popular_mx_bias_side": (
                "home"
                if (hc in POPULAR_LIGAMX_CLUBS and ac not in POPULAR_LIGAMX_CLUBS)
                else ("away" if (ac in POPULAR_LIGAMX_CLUBS and hc not in POPULAR_LIGAMX_CLUBS) else "none")
            ),
            "pinnacle_quote": pin,
            "caliente_mx_quote": cal,
            "action_network_summary": an,
            "sharp_home_money_minus_tickets_pct": an_sides["home_money_minus_tickets"],
            "sharp_away_money_minus_tickets_pct": an_sides["away_money_minus_tickets"],
            "rlm_home_flag": bool(an_sides["home_rlm"] > 0),
            "rlm_away_flag": bool(an_sides["away_rlm"] > 0),
            "referee_context": soccer_ref_by_league.get(lg) if m["sport"] == "soccer" else (nfl_league_ref_baseline if lg == "nfl" else None),
            "prospective_only": True,
        }
        enriched_matchups.append(full_item)

        parquet_rows.append(
            {
                "matchup_id": m["matchup_id"],
                "sport": m["sport"],
                "league": lg,
                "div": div,
                "kickoff_utc": str(m.get("kickoff_utc") or ""),
                "home_team": hc,
                "away_team": ac,
                "pl_home_team": str(ht.get("pl_team") or hc),
                "pl_away_team": str(at.get("pl_team") or ac),
                "market_sources_json": json.dumps(m.get("market_sources") or []),
                "p_home_novig": float(m["p_home_novig"]) if m.get("p_home_novig") is not None else np.nan,
                "p_draw_novig": float(m["p_draw_novig"]) if m.get("p_draw_novig") is not None else np.nan,
                "p_away_novig": float(m["p_away_novig"]) if m.get("p_away_novig") is not None else np.nan,
                "market_overround": float(m["market_overround"]) if m.get("market_overround") is not None else np.nan,
                "pinnacle_odds_home": float(pin["odds_home"]) if pin and pin.get("odds_home") else np.nan,
                "pinnacle_odds_draw": float(pin["odds_draw"]) if pin and pin.get("odds_draw") else np.nan,
                "pinnacle_odds_away": float(pin["odds_away"]) if pin and pin.get("odds_away") else np.nan,
                "pinnacle_overround": float(pin["overround"]) if pin and pin.get("overround") is not None else np.nan,
                "caliente_odds_home": float(cal["odds_home"]) if cal and cal.get("odds_home") else np.nan,
                "caliente_odds_draw": float(cal["odds_draw"]) if cal and cal.get("odds_draw") else np.nan,
                "caliente_odds_away": float(cal["odds_away"]) if cal and cal.get("odds_away") else np.nan,
                "caliente_overround": float(cal["overround"]) if cal and cal.get("overround") is not None else np.nan,
                "sharp_money_divergence": float(m["sharp_money_divergence"]) if m.get("sharp_money_divergence") is not None else np.nan,
                "sharp_home_money_minus_tickets_pct": float(an_sides["home_money_minus_tickets"]),
                "sharp_away_money_minus_tickets_pct": float(an_sides["away_money_minus_tickets"]),
                "rlm_home_flag": bool(an_sides["home_rlm"] > 0),
                "rlm_away_flag": bool(an_sides["away_rlm"] > 0),
                "popular_mx_bias_side": full_item["popular_mx_bias_side"],
                "value_ratio_diff": float(m["value_ratio_diff"]) if m.get("value_ratio_diff") is not None else np.nan,
                "missing_value_ratio_diff": float(m["missing_value_ratio_diff"]) if m.get("missing_value_ratio_diff") is not None else 0.0,
                "xg_diff": float(m["xg_diff"]) if m.get("xg_diff") is not None else np.nan,
                "epa_diff": float(m["epa_diff"]) if m.get("epa_diff") is not None else np.nan,
                "net_rtg_diff": float(m["net_rtg_diff"]) if m.get("net_rtg_diff") is not None else np.nan,
                "fip_ops_diff": float(m["fip_ops_diff"]) if m.get("fip_ops_diff") is not None else np.nan,
                "fpi_srs_diff": float(m["fpi_srs_diff"]) if m.get("fpi_srs_diff") is not None else np.nan,
                "altitude_diff_m": alt_diff,
                "altitude_shock_flag": alt_shock,
                "surface_pressure_diff_hpa": press_diff,
                "home_max_wind_speed_mph_7d": float(m["home_max_wind_speed_mph_7d"]) if m.get("home_max_wind_speed_mph_7d") is not None else np.nan,
                "as_of_utc": str(m.get("as_of_utc") or ""),
                "prospective_only": True,
            }
        )

    payload = {
        "schema_version": "3.0.0",
        "generated_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "anti_leakage_contract": {
            "prospective_only": True,
            "rule": "PROHIBITED in historical backtests 2018-2025; allowed strictly for prospective inference where captured_at_utc <= kickoff_utc",
        },
        "summary": {
            "canonical_teams_count": len(enriched_teams),
            "active_matchups_count": len(enriched_matchups),
            "leagues_count": len({r["league"] for r in tmf_records}),
            "sports_count": len({r["sport"] for r in tmf_records}),
        },
        "teams": list(enriched_teams.values()),
        "matchups": enriched_matchups,
    }
    return pd.DataFrame(parquet_rows), payload


def run_ingestion(
    ws_root: Path = DEFAULT_WS_ROOT,
    proc_dir: Path = DEFAULT_PROC_DIR,
    out_dir: Path = DEFAULT_OUT_DIR,
) -> dict[str, Any]:
    if not ws_root.exists():
        raise FileNotFoundError(
            f"No está montado {ws_root}. Ejecuta: git worktree add .worktrees/web-scraping origin/web-scraping -B web-scraping"
        )
    out_dir.mkdir(parents=True, exist_ok=True)

    # 1. Verificación criptográfica SHA-256
    sha_summary = verify_web_scraping_manifest(ws_root)

    # 2. Inicializar RosettaStatiskicks + Resolvedor de 1,858 alias de `web-scraping`
    rosetta = RosettaStatiskicks()
    resolver_ctx = load_ws_entity_resolver(ws_root, rosetta)

    # 3. Cargar `matches.parquet`
    matches_df = pd.read_parquet(proc_dir / "matches.parquet")

    # 4. Materializar los 5 artefactos canónicos en `data/processed/web_scraping/`
    df_xg = build_ws_soccer_match_xg(ws_root, matches_df, resolver_ctx, rosetta)
    p1 = out_dir / "ws_soccer_match_xg_2018_2026.parquet"
    df_xg.to_parquet(p1, index=False)

    df_tact = build_ws_understat_tactical(ws_root, matches_df, resolver_ctx, rosetta)
    p2 = out_dir / "ws_understat_team_match_tactical.parquet"
    df_tact.to_parquet(p2, index=False)

    df_stad = build_ws_stadium_physics(ws_root, resolver_ctx, rosetta)
    p3 = out_dir / "ws_stadium_physics.parquet"
    df_stad.to_parquet(p3, index=False)

    df_ms = build_ws_multisport_team_seasons(ws_root, resolver_ctx)
    p4 = out_dir / "ws_multisport_team_seasons.parquet"
    df_ms.to_parquet(p4, index=False)

    df_live, live_json = build_ws_live_inference_context(ws_root, resolver_ctx, rosetta)
    p5_pq = out_dir / "ws_live_inference_context.parquet"
    p5_js = out_dir / "ws_live_inference_context.json"
    df_live.to_parquet(p5_pq, index=False)
    p5_js.write_text(json.dumps(live_json, indent=2, ensure_ascii=False), encoding="utf-8")

    # Resumen auditable de emparejamiento y cobertura
    matched_mask = df_xg["match_id"].notna()
    by_div_stats = {}
    for div, g in df_xg.groupby("div"):
        by_div_stats[div] = {
            "ws_rows": int(len(g)),
            "matched_to_matches_parquet": int(g["match_id"].notna().sum()),
            "match_rate_pct": round(100.0 * float(g["match_id"].notna().mean()), 2),
            "exact_real_xg_rows": int(g["is_exact_xg"].sum()),
        }

    ingestion_report = {
        "schema_version": "3.0.0",
        "generated_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "web_scraping_manifest_verification": sha_summary,
        "outputs": {
            "ws_soccer_match_xg_2018_2026": {
                "path": str(p1.relative_to(PRED_LAB_ROOT)),
                "rows": int(len(df_xg)),
                "matched_to_matches_parquet": int(matched_mask.sum()),
                "match_rate_pct": round(100.0 * float(matched_mask.mean()), 2),
                "exact_real_xg_rows": int(df_xg["is_exact_xg"].sum()),
                "by_div": by_div_stats,
            },
            "ws_understat_team_match_tactical": {
                "path": str(p2.relative_to(PRED_LAB_ROOT)),
                "rows": int(len(df_tact)),
                "matched_to_matches_parquet": int(df_tact["match_id"].notna().sum()),
                "match_rate_pct": round(100.0 * float(df_tact["match_id"].notna().mean()), 2),
            },
            "ws_stadium_physics": {
                "path": str(p3.relative_to(PRED_LAB_ROOT)),
                "rows": int(len(df_stad)),
                "open_meteo_primary_stadiums": int((df_stad["record_scope"] == "stadium_primary").sum()),
            },
            "ws_multisport_team_seasons": {
                "path": str(p4.relative_to(PRED_LAB_ROOT)),
                "rows": int(len(df_ms)),
                "nhl_mlb_nba_ncaaf_rows": int(df_ms["league"].isin(["nhl", "mlb", "nba", "ncaaf"]).sum()),
                "nfl_sumersports_rows": int((df_ms["league"] == "nfl").sum()),
            },
            "ws_live_inference_context": {
                "parquet_path": str(p5_pq.relative_to(PRED_LAB_ROOT)),
                "json_path": str(p5_js.relative_to(PRED_LAB_ROOT)),
                "canonical_teams": int(len(live_json["teams"])),
                "active_matchups": int(len(df_live)),
            },
        },
    }
    (out_dir / "ws_ingestion_manifest.json").write_text(
        json.dumps(ingestion_report, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    return ingestion_report


def main() -> None:
    ap = argparse.ArgumentParser(description="Ingiere y resuelve los artefactos de .worktrees/web-scraping hacia prediction-lab.")
    ap.add_argument("--ws-root", default=str(DEFAULT_WS_ROOT))
    ap.add_argument("--proc-dir", default=str(DEFAULT_PROC_DIR))
    ap.add_argument("--out-dir", default=str(DEFAULT_OUT_DIR))
    args = ap.parse_args()

    report = run_ingestion(Path(args.ws_root), Path(args.proc_dir), Path(args.out_dir))
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
