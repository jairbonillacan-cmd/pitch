"""Resolución canónica determinista de deportes, ligas, equipos y `event_id` (`v3.2` · `B3`).

Garantiza que distintas fuentes legales (p. ej. `the_odds_api`, `betfair_exchange`, `smarkets`,
feeds autorizados de `codere`) produzcan exactamente el mismo `event_id` canónico:
  `ws:<sport>:<league>:<YYYYMMDD>:<home_slug>:<away_slug>`
alineado 1:1 con `services/ingest/odds_snapshots.py` y `scrapers/build_feature_store.py`.
"""

from __future__ import annotations

from datetime import datetime, timezone
import re
import unicodedata
from typing import Any

from scrapers.build_feature_store import (
    EXPLICIT_TEAM_ALIASES,
    LEAGUE_SCOPED_ALIASES,
    _slug_token,
    _strip_accents,
)

SUPPORTED_TIMESERIES_SPORTS: frozenset[str] = frozenset({"football", "nfl"})

PSEUDO_TEAM_LABELS: frozenset[str] = frozenset(
    {"over", "under", "yes", "no", "odd", "even", "home", "away", "draw", "tie"}
)

# Mapeo canónico `(sport, league)` alineado con `odds_snapshots.py` y claves v4 de The Odds API / Betfair / Smarkets
CANONICAL_LEAGUE_MAP: dict[str, tuple[str, str]] = {
    # NFL
    "nfl": ("nfl", "NFL"),
    "americanfootball_nfl": ("nfl", "NFL"),
    "american_football_nfl": ("nfl", "NFL"),
    "national football league": ("nfl", "NFL"),
    # Premier League (E0)
    "e0": ("football", "E0"),
    "epl": ("football", "E0"),
    "soccer_epl": ("football", "E0"),
    "england-premier-league": ("football", "E0"),
    "english premier league": ("football", "E0"),
    "premier league": ("football", "E0"),
    # LaLiga (SP1)
    "sp1": ("football", "SP1"),
    "laliga": ("football", "SP1"),
    "la liga": ("football", "SP1"),
    "spain-la-liga": ("football", "SP1"),
    "soccer_spain_la_liga": ("football", "SP1"),
    "primera division": ("football", "SP1"),
    # Bundesliga (D1)
    "d1": ("football", "D1"),
    "bundesliga": ("football", "D1"),
    "germany-bundesliga": ("football", "D1"),
    "soccer_germany_bundesliga": ("football", "D1"),
    # Serie A (I1)
    "i1": ("football", "I1"),
    "serie-a": ("football", "I1"),
    "serie a": ("football", "I1"),
    "italy-serie-a": ("football", "I1"),
    "soccer_italy_serie_a": ("football", "I1"),
    # Ligue 1 (F1)
    "f1": ("football", "F1"),
    "ligue-1": ("football", "F1"),
    "ligue 1": ("football", "F1"),
    "france-ligue-1": ("football", "F1"),
    "soccer_france_ligue_one": ("football", "F1"),
    # Liga MX (MEX)
    "mex": ("football", "MEX"),
    "liga-mx": ("football", "MEX"),
    "liga mx": ("football", "MEX"),
    "mexico-liga-mx": ("football", "MEX"),
    "soccer_mexico_ligamx": ("football", "MEX"),
    "primera division mexico": ("football", "MEX"),
    # UEFA Champions League (UCL)
    "ucl": ("football", "UCL"),
    "uefa-champions-league": ("football", "UCL"),
    "champions league": ("football", "UCL"),
    "uefa champions league": ("football", "UCL"),
    "soccer_uefa_champs_league": ("football", "UCL"),
    # MLS (USA)
    "usa": ("football", "USA"),
    "mls": ("football", "USA"),
    "soccer_usa_mls": ("football", "USA"),
}

# Alias suplementarios frecuentes en casas sharp/recreativas para fútbol europeo, Liga MX y NFL
SUPPLEMENTAL_FOOTBALL_ALIASES: dict[str, str] = {
    "west ham": "West Ham United",
    "west ham united": "West Ham United",
    "west ham utd": "West Ham United",
    "west ham united fc": "West Ham United",
    "wolves": "Wolverhampton Wanderers",
    "wolverhampton": "Wolverhampton Wanderers",
    "wolverhampton wanderers": "Wolverhampton Wanderers",
    "wolverhampton wanderers fc": "Wolverhampton Wanderers",
    "leicester": "Leicester City",
    "leicester city": "Leicester City",
    "leicester city fc": "Leicester City",
    "southampton": "Southampton FC",
    "southampton fc": "Southampton FC",
    "girona": "Girona FC",
    "girona fc": "Girona FC",
    "mallorca": "RCD Mallorca",
    "rcd mallorca": "RCD Mallorca",
    "las palmas": "UD Las Palmas",
    "ud las palmas": "UD Las Palmas",
    "leganes": "CD Leganés",
    "cd leganes": "CD Leganés",
    "real valladolid": "Real Valladolid CF",
    "valladolid": "Real Valladolid CF",
    "real valladolid cf": "Real Valladolid CF",
    "aguilas del america": "CF América",
    "america mexico": "CF América",
    "gallos blancos": "Querétaro FC",
    "gallos blancos de queretaro": "Querétaro FC",
    "unam pumas": "Pumas UNAM",
    "u.n.a.m.": "Pumas UNAM",
    "tigres de la uanl": "Tigres UANL",
    "uanl tigres": "Tigres UANL",
    "rayados de monterrey": "CF Monterrey",
    "santos laguna torreón": "Santos Laguna",
    "atletico san luis": "Atlético de San Luis",
}


def _build_fuzzy_token_index() -> tuple[dict[str, str], dict[str, str]]:
    football_token_map: dict[str, str] = {}
    for alias, canon in {**EXPLICIT_TEAM_ALIASES, **SUPPLEMENTAL_FOOTBALL_ALIASES}.items():
        tok = _slug_token(alias)
        if tok and tok not in football_token_map:
            football_token_map[tok] = canon
        canon_tok = _slug_token(canon)
        if canon_tok and canon_tok not in football_token_map:
            football_token_map[canon_tok] = canon

    nfl_map: dict[str, str] = {}
    for alias, canon in LEAGUE_SCOPED_ALIASES.get("nfl", {}).items():
        clean_a = _strip_accents(alias).lower().strip()
        nfl_map[clean_a] = canon
        clean_c = _strip_accents(canon).lower().strip()
        nfl_map[clean_c] = canon
    return football_token_map, nfl_map


_FOOTBALL_TOKEN_INDEX, _NFL_ALIAS_INDEX = _build_fuzzy_token_index()


def parse_utc_datetime(iso_value: Any) -> datetime | None:
    """Convierte un timestamp ISO-8601 (`Z`, `.000Z`, `+00:00`, epoch) a `datetime` UTC."""
    if iso_value is None or isinstance(iso_value, bool):
        return None
    if isinstance(iso_value, (int, float)):
        try:
            return datetime.fromtimestamp(float(iso_value), tz=timezone.utc)
        except (OSError, OverflowError, ValueError):
            return None
    raw = str(iso_value).strip()
    if not raw:
        return None
    if raw.endswith("Z") or raw.endswith("z"):
        raw = raw[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(raw)
    except ValueError:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def format_utc_iso(dt_or_iso: datetime | str) -> str:
    """Normaliza un `datetime` o cadena ISO a formato canónico UTC `YYYY-MM-DDTHH:MM:SSZ`."""
    dt = dt_or_iso if isinstance(dt_or_iso, datetime) else parse_utc_datetime(dt_or_iso)
    if dt is None:
        raise ValueError(f"Timestamp UTC inválido: {dt_or_iso!r}")
    dt_utc = dt.astimezone(timezone.utc) if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)
    return dt_utc.strftime("%Y-%m-%dT%H:%M:%SZ")


def slugify_team(value: Any) -> str:
    """Idéntico a `_slugify_team` en `services/ingest/odds_snapshots.py`."""
    if value is None:
        return ""
    norm = unicodedata.normalize("NFKD", str(value))
    ascii_txt = "".join(ch for ch in norm if not unicodedata.combining(ch)).lower()
    return re.sub(r"[^a-z0-9]+", "_", ascii_txt).strip("_")


def resolve_sport_and_league(sport_raw: Any, league_raw: Any) -> tuple[str, str] | None:
    """Resuelve `(sport, league)` hacia `sport in {'football', 'nfl'}` o `None` si está fuera de alcance."""
    lg_clean = _strip_accents(str(league_raw or "")).strip().lower()
    sp_clean = _strip_accents(str(sport_raw or "")).strip().lower()

    if lg_clean in CANONICAL_LEAGUE_MAP:
        return CANONICAL_LEAGUE_MAP[lg_clean]
    if sp_clean in CANONICAL_LEAGUE_MAP:
        return CANONICAL_LEAGUE_MAP[sp_clean]

    # Subcadenas informativas en slugs (p. ej. Smarkets `/sport/football/england-premier-league/...`)
    for key, pair in CANONICAL_LEAGUE_MAP.items():
        if len(key) >= 5 and key in lg_clean:
            return pair

    if sp_clean in ("nfl", "american_football", "american_football_match", "americanfootball"):
        if not lg_clean or "ncaaf" not in lg_clean and "college" not in lg_clean:
            return ("nfl", "NFL")
        return None

    if sp_clean in ("football", "soccer", "football_match"):
        if lg_clean:
            code = re.sub(r"[^A-Z0-9]+", "_", lg_clean.upper()).strip("_")
            return ("football", code or "SOCCER")
        return ("football", "SOCCER")

    return None


def resolve_canonical_team(raw_name: Any, sport: str, league: str | None = None) -> str:
    """Resuelve un nombre de equipo al nombre canónico unificado entre casas de apuestas."""
    cleaned = str(raw_name or "").replace("\u200b", "").replace("\xa0", " ").strip()
    if not cleaned:
        return ""

    norm_plain = re.sub(r"\s+", " ", _strip_accents(cleaned).lower()).strip()
    if norm_plain in PSEUDO_TEAM_LABELS:
        return ""

    sp_norm = sport.strip().lower()
    if sp_norm == "nfl" or (league and league.strip().upper() == "NFL"):
        if norm_plain in _NFL_ALIAS_INDEX:
            return _NFL_ALIAS_INDEX[norm_plain]
        # Búsqueda por franquicia si viene con sufijo extra
        tokens = norm_plain.replace(".", "").strip()
        if tokens in _NFL_ALIAS_INDEX:
            return _NFL_ALIAS_INDEX[tokens]
        return cleaned

    # Fútbol (`sport == "football"`)
    if norm_plain in EXPLICIT_TEAM_ALIASES:
        return EXPLICIT_TEAM_ALIASES[norm_plain]
    if norm_plain in SUPPLEMENTAL_FOOTBALL_ALIASES:
        return SUPPLEMENTAL_FOOTBALL_ALIASES[norm_plain]

    tok_key = _slug_token(cleaned)
    if tok_key in _FOOTBALL_TOKEN_INDEX:
        return _FOOTBALL_TOKEN_INDEX[tok_key]

    return cleaned


def build_canonical_event_id(
    sport: str,
    league: str,
    ts_event_start_iso: str,
    home_team: str,
    away_team: str,
) -> str:
    """Construye el `event_id` canónico determinista coherente con `odds_snapshots.py`.

    Formato: `ws:<sport>:<league>:<YYYYMMDD>:<home_slug>:<away_slug>`
    usando nombres de equipo previamente resueltos en el catálogo maestro.
    """
    sp_res = resolve_sport_and_league(sport, league)
    if sp_res is None or sp_res[0] not in SUPPORTED_TIMESERIES_SPORTS:
        raise ValueError(f"Deporte/liga fuera de alcance del contrato v3.2: sport={sport!r}, league={league!r}")
    canon_sport, canon_league = sp_res

    dt_start = parse_utc_datetime(ts_event_start_iso)
    if dt_start is None:
        raise ValueError(f"ts_event_start inválido: {ts_event_start_iso!r}")

    canon_home = resolve_canonical_team(home_team, canon_sport, canon_league)
    canon_away = resolve_canonical_team(away_team, canon_sport, canon_league)
    home_slug = slugify_team(canon_home)
    away_slug = slugify_team(canon_away)
    if not home_slug or not away_slug or home_slug == away_slug:
        raise ValueError(f"Equipos inválidos o idénticos tras resolución: home={home_team!r}, away={away_team!r}")

    ymd = dt_start.strftime("%Y%m%d")
    return f"ws:{canon_sport}:{canon_league}:{ymd}:{home_slug}:{away_slug}"
