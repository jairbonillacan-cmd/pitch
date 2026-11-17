"""Ingesta legal CC0 1.0 y normalización determinista de partidos internacionales de selecciones (EXP_V33_intl_soccer).

Fuente primaria verificada:
  - `martj42/international_results` (GitHub, licencia CC0 1.0 Public Domain Dedication, apta para uso comercial):
      * `results.csv`
      * `shootouts.csv`
      * `former_names.csv`

Reglas rectoras instrumentadas (`MASTER.md` §0):
  1. Cero evasión anti-bot: descarga HTTP directa con `User-Agent` académico/identificable y caché local SHA-256.
  2. Blindaje estricto del corte temporal `< 2025-02-02` (`HoldoutSealedAccessError`) en `load_intl_matches_dev`:
     ningún partido `>= 2025-02-02` puede entrar en selección de hiperparámetros, escaladores ni entrenamiento.
  3. Liquidación reglamentaria 1X2: los partidos definidos en tanda de penales (`shootouts.csv`) conservan
     marcador empatado (`y = 1`, Draw) para reflejar fielmente mercados de 90 minutos.
"""

from __future__ import annotations

import hashlib
import json
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from intl_geography import (
    FEDERATION_CATALOG,
    TEAM_NAME_TO_CODE,
    resolve_team_code,
    slugify_name,
)

EXP_DIR = Path(__file__).resolve().parent
REPO_ROOT = EXP_DIR.parents[3]
RAW_CACHE_DIR = EXP_DIR / "raw_cache"
ARTIFACTS_DIR = EXP_DIR / "artifacts"
HISTORY_JSONL_PATH = REPO_ROOT / "data" / "history" / "international-soccer.jsonl"

HOLDOUT_CUT_ISO = "2025-02-02T17:30:00Z"
HOLDOUT_CUT_DATE = "2025-02-02"
HOLDOUT_CUT_TS = pd.Timestamp(HOLDOUT_CUT_DATE)

WARMUP_MIN_YEAR = 1960
MODERN_TRAIN_MIN_YEAR = 1998
FIRST_EVAL_YEAR = 2010
VAL_MAX_YEAR = 2019

BASE_GITHUB_RAW = "https://raw.githubusercontent.com/martj42/international_results/master"
SOURCE_FILES: dict[str, str] = {
    "results.csv": f"{BASE_GITHUB_RAW}/results.csv",
    "shootouts.csv": f"{BASE_GITHUB_RAW}/shootouts.csv",
    "former_names.csv": f"{BASE_GITHUB_RAW}/former_names.csv",
}

USER_AGENT = "PitchLab-PredictionLab/3.3 (CC0 Open Data Research)"

# Niveles one-hot en orden alfabético estricto (invariante para `engine.ts::assertValidModel`)
INTL_DIV_LEVELS: tuple[str, ...] = (
    "INTL_CONT",
    "INTL_FRIENDLY",
    "INTL_NAT",
    "INTL_QUAL",
    "INTL_REG",
    "INTL_WC",
)


class HoldoutSealedAccessError(RuntimeError):
    """Lanzado ante cualquier intento de filtrar partidos `>= 2025-02-02` hacia entrenamiento o validación."""


def assert_dates_strictly_before_holdout(df: pd.DataFrame, col: str = "match_date", context: str = "intl_dev") -> None:
    if df.empty:
        return
    dt = pd.to_datetime(df[col], errors="raise")
    bad_mask = dt >= HOLDOUT_CUT_TS
    if bool(bad_mask.any()):
        sample = df.loc[bad_mask].iloc[0]
        raise HoldoutSealedAccessError(
            f"Fuga hacia ventana post-corte detectada en {context}: "
            f"match_id={sample.get('match_id')} {col}={sample.get(col)} >= {HOLDOUT_CUT_DATE}"
        )


def classify_intl_tournament(raw_tournament: str) -> str:
    """Clasifica cualquier nombre de torneo internacional en uno de los 6 regímenes canónicos."""
    s = slugify_name(raw_tournament)
    if not s:
        return "INTL_FRIENDLY"

    # 1. Eliminatorias / Clasificatorios (siempre antes que el nombre del torneo final)
    if "qualification" in s or "qualifiers" in s or "qualifier" in s or "eliminatoria" in s or "preliminary" in s:
        return "INTL_QUAL"

    # 2. Nations League (UEFA / CONCACAF)
    if "nations league" in s:
        return "INTL_NAT"

    # 3. Copa Mundial de la FIFA (fase final)
    if s in ("fifa world cup", "world cup", "mundial"):
        return "INTL_WC"

    # 4. Grandes torneos continentales de selecciones absolutas + Copa Confederaciones
    continental_tokens = (
        "copa america",
        "uefa euro",
        "european championship",
        "african cup of nations",
        "africa cup of nations",
        "afcon",
        "afc asian cup",
        "asian cup",
        "gold cup",
        "concacaf championship",
        "concacaf campeonato",
        "oceania nations cup",
        "ofc nations cup",
        "confederations cup",
        "finalissima",
        "conmebol uefa cup of champions",
    )
    for tok in continental_tokens:
        if tok in s:
            return "INTL_CONT"

    # 5. Amistosos y torneos por invitación de preparación
    friendly_tokens = (
        "friendly",
        "amistoso",
        "kirin",
        "tournoi de france",
        "china cup",
        "fifa series",
        "king s cup",
        "kings cup",
        "cyprus tournament",
        "algarve",
        "four nations",
        "lunar new year",
        "merdeka",
    )
    for tok in friendly_tokens:
        if tok in s:
            return "INTL_FRIENDLY"

    # 6. Copas regionales oficiales (Copa Árabe, UNCAF, EAFF, COSAFA, CECAFA, SAFF, AFF, Gulf Cup, etc.)
    return "INTL_REG"


def _download_with_cache(filename: str, url: str, force: bool = False) -> tuple[Path, str]:
    RAW_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    dest = RAW_CACHE_DIR / filename
    if dest.exists() and not force and dest.stat().st_size > 100:
        sha = hashlib.sha256(dest.read_bytes()).hexdigest()
        return dest, sha

    last_err: Exception | None = None
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=45) as resp:
                payload = resp.read()
            if len(payload) < 100:
                raise RuntimeError(f"Respuesta truncada desde {url} ({len(payload)} bytes)")
            dest.write_bytes(payload)
            sha = hashlib.sha256(payload).hexdigest()
            return dest, sha
        except Exception as exc:  # pragma: no cover - red transitoria
            last_err = exc
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"No se pudo descargar {url}: {last_err}")


def fetch_and_normalize_all_intl_matches(
    *,
    min_year: int = WARMUP_MIN_YEAR,
    force_download: bool = False,
    export_history_jsonl: bool = True,
) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Descarga (o lee de caché), registra `former_names`, une `shootouts` y devuelve el DataFrame
    canónico ordenado cronológicamente desde `min_year` junto con el manifiesto SHA-256."""
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    files_manifest: dict[str, Any] = {}
    local_paths: dict[str, Path] = {}

    for fname, url in SOURCE_FILES.items():
        path, sha = _download_with_cache(fname, url, force=force_download)
        local_paths[fname] = path
        files_manifest[fname] = {
            "url": url,
            "sha256": sha,
            "bytes": int(path.stat().st_size),
        }

    # Registrar mapeos históricos `former -> current` en `TEAM_NAME_TO_CODE` si `current` es federación conocida
    former_df = pd.read_csv(local_paths["former_names.csv"])
    for _, frow in former_df.iterrows():
        cur_name = str(frow.get("current", "")).strip()
        old_name = str(frow.get("former", "")).strip()
        if cur_name and old_name:
            cur_code = resolve_team_code(cur_name)
            if cur_code in FEDERATION_CATALOG:
                TEAM_NAME_TO_CODE[slugify_name(old_name)] = cur_code

    shootouts_df = pd.read_csv(local_paths["shootouts.csv"])
    shootout_keys: set[tuple[str, str, str]] = set()
    for _, srow in shootouts_df.iterrows():
        d_str = str(srow.get("date", "")).strip()[:10]
        ht = str(srow.get("home_team", "")).strip()
        at = str(srow.get("away_team", "")).strip()
        if d_str and ht and at:
            shootout_keys.add((d_str, ht, at))

    raw_df = pd.read_csv(local_paths["results.csv"])
    raw_df = raw_df[raw_df["home_score"].notna() & raw_df["away_score"].notna()].copy()
    raw_df["date_str"] = raw_df["date"].astype(str).str.slice(0, 10)
    raw_df["match_date"] = pd.to_datetime(raw_df["date_str"], format="%Y-%m-%d", errors="coerce")
    raw_df = raw_df[raw_df["match_date"].notna()].copy()
    raw_df["year"] = raw_df["match_date"].dt.year.astype(int)
    raw_df = raw_df[raw_df["year"] >= int(min_year)].copy()

    raw_df["home_goals"] = pd.to_numeric(raw_df["home_score"], errors="coerce").astype(int)
    raw_df["away_goals"] = pd.to_numeric(raw_df["away_score"], errors="coerce").astype(int)
    raw_df = raw_df[(raw_df["home_goals"] >= 0) & (raw_df["away_goals"] >= 0)].copy()

    raw_df["home_team_raw"] = raw_df["home_team"].astype(str).str.strip()
    raw_df["away_team_raw"] = raw_df["away_team"].astype(str).str.strip()
    raw_df["home_code"] = raw_df["home_team_raw"].map(resolve_team_code)
    raw_df["away_code"] = raw_df["away_team_raw"].map(resolve_team_code)
    # Descartar filas degeneradas donde ambos resuelven al mismo código (ej. selecciones regionales internas)
    raw_df = raw_df[raw_df["home_code"] != raw_df["away_code"]].copy()

    # Filtrar únicamente enfrentamientos donde al menos una selección pertenece al catálogo FIFA reconocido
    # o ambos códigos son selecciones nacionales estándar (evita torneos insulares amateur como Island Games)
    known_codes = set(FEDERATION_CATALOG.keys())
    raw_df = raw_df[raw_df["home_code"].isin(known_codes) & raw_df["away_code"].isin(known_codes)].copy()

    raw_df["tournament_raw"] = raw_df["tournament"].fillna("Friendly").astype(str).str.strip()
    raw_df["div"] = raw_df["tournament_raw"].map(classify_intl_tournament)
    raw_df["city"] = raw_df["city"].fillna("").astype(str).str.strip()
    raw_df["country"] = raw_df["country"].fillna("").astype(str).str.strip()
    raw_df["neutral"] = raw_df["neutral"].astype(str).str.lower().isin(("true", "1", "yes"))

    raw_df["went_to_shootout"] = [
        (d, h, a) in shootout_keys
        for d, h, a in zip(raw_df["date_str"], raw_df["home_team_raw"], raw_df["away_team_raw"])
    ]

    # En liquidación 1X2 reglamentaria: 0 = Home, 1 = Draw, 2 = Away.
    # Si `went_to_shootout` es True y por error de registro los goles difieren, se fuerza empate.
    hg = raw_df["home_goals"].to_numpy()
    ag = raw_df["away_goals"].to_numpy()
    so = raw_df["went_to_shootout"].to_numpy()
    y = np.where(so | (hg == ag), 1, np.where(hg > ag, 0, 2)).astype(int)
    raw_df["y"] = y
    raw_df["season"] = raw_df["year"].astype(str)

    # Orden determinista y `match_id` estable
    raw_df = raw_df.sort_values(
        ["match_date", "home_code", "away_code", "tournament_raw"],
        kind="mergesort",
    ).reset_index(drop=True)

    raw_df["match_id"] = [
        f"INTL_{d.replace('-', '')}_{hc}_{ac}_{idx:05d}"
        for idx, (d, hc, ac) in enumerate(zip(raw_df["date_str"], raw_df["home_code"], raw_df["away_code"]))
    ]

    cols_order = [
        "match_id",
        "date_str",
        "match_date",
        "year",
        "season",
        "div",
        "tournament_raw",
        "home_code",
        "away_code",
        "home_team_raw",
        "away_team_raw",
        "home_goals",
        "away_goals",
        "y",
        "city",
        "country",
        "neutral",
        "went_to_shootout",
    ]
    clean_df = raw_df[cols_order].copy()

    if export_history_jsonl:
        HISTORY_JSONL_PATH.parent.mkdir(parents=True, exist_ok=True)
        with HISTORY_JSONL_PATH.open("w", encoding="utf-8") as fh:
            for row in clean_df.itertuples(index=False):
                rec = {
                    "id": row.match_id,
                    "league": "international-soccer",
                    "regime": row.div,
                    "season": row.season,
                    "date": row.date_str,
                    "tournament": row.tournament_raw,
                    "homeTeam": row.home_code,
                    "awayTeam": row.away_code,
                    "homeScore": int(row.home_goals),
                    "awayScore": int(row.away_goals),
                    "neutral": bool(row.neutral),
                    "city": row.city,
                    "country": row.country,
                    "shootout": bool(row.went_to_shootout),
                }
                fh.write(json.dumps(rec, ensure_ascii=False) + "\n")

    manifest = {
        "schema_version": "1.0.0",
        "license": "CC0-1.0",
        "source_repo": "https://github.com/martj42/international_results",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "holdout_cut_date": HOLDOUT_CUT_DATE,
        "min_year": int(min_year),
        "total_clean_fifa_matches": int(len(clean_df)),
        "dev_matches_before_cut": int((clean_df["match_date"] < HOLDOUT_CUT_TS).sum()),
        "post_cut_matches_excluded_from_dev": int((clean_df["match_date"] >= HOLDOUT_CUT_TS).sum()),
        "unique_federations": int(len(set(clean_df["home_code"]).union(set(clean_df["away_code"])))),
        "files": files_manifest,
    }
    (ARTIFACTS_DIR / "manifest_intl.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    return clean_df, manifest


def load_intl_matches_dev(*, force_download: bool = False) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Devuelve exclusivamente los partidos estrictamente anteriores a `2025-02-02` (`walk_forward_dev`)."""
    all_df, manifest = fetch_and_normalize_all_intl_matches(
        min_year=WARMUP_MIN_YEAR,
        force_download=force_download,
        export_history_jsonl=True,
    )
    dev_df = all_df[all_df["match_date"] < HOLDOUT_CUT_TS].copy().reset_index(drop=True)
    assert_dates_strictly_before_holdout(dev_df, col="match_date", context="load_intl_matches_dev")
    return dev_df, manifest
