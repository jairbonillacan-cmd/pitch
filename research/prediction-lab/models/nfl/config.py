"""Configuración única del motor NFL (A12).

Todo el pipeline (descarga, ETL, features, modelos, evaluación) lee de aquí.
Nada de números mágicos repartidos por los scripts: semilla, particiones,
rejilla de sensibilidad y rutas viven en este módulo.

Convenciones de etiqueta
------------------------
El laboratorio de fútbol (`eval.metrics`) usa tres clases ``H/D/A`` con orden
``H < D < A`` para el RPS. En la NFL el empate (``T``) es la clase central de
ese orden porque el margen local es la variable latente natural:

    H (home win)  -> índice 0  (margen > 0)
    T (tie)       -> índice 1  (margen = 0)   <-- se mapea a "D" del lab
    A (away win)  -> índice 2  (margen < 0)

Es decir, reutilizamos `eval.metrics` sin tocar su contrato: ``T`` se escribe
como ``D`` en la columna ``result`` del parquet y en las etiquetas ``y``.
"""

from __future__ import annotations

import os
from pathlib import Path

# ---------------------------------------------------------------------------
# Rutas
# ---------------------------------------------------------------------------
LAB_ROOT = Path(__file__).resolve().parents[2]  # research/prediction-lab
NFL_DIR = LAB_ROOT / "models" / "nfl"
DATA_DIR = LAB_ROOT / "data" / "nfl"
RAW_DIR = DATA_DIR / "raw"
PROCESSED_DIR = DATA_DIR / "processed"
ARTIFACTS_DIR = NFL_DIR / "artifacts"

RAW_CSV = RAW_DIR / "games.csv"
MANIFEST = RAW_DIR / "manifest.json"
DATASET = PROCESSED_DIR / "nfl_games.parquet"
FEATURES = PROCESSED_DIR / "nfl_features.parquet"

# ---------------------------------------------------------------------------
# Fuente
# ---------------------------------------------------------------------------
SOURCE_URL = "https://github.com/nflverse/nfldata/raw/master/data/games.csv"
SOURCE_NAME = "nflverse/nfldata — games.csv"
SOURCE_LICENSE = "CC BY 4.0"
SOURCE_ATTRIBUTION = (
    "Datos: nflverse (https://github.com/nflverse/nfldata), licencia CC BY 4.0. "
    "Atribución requerida a nflverse en cualquier uso o redistribución."
)

# ---------------------------------------------------------------------------
# Reproducibilidad
# ---------------------------------------------------------------------------
SEED = 20261109  # misma semilla que eval.compare (documentada en A08)
N_BOOTSTRAP = 2000

# ---------------------------------------------------------------------------
# Universo y particiones temporales
# ---------------------------------------------------------------------------
# Solo temporada regular. Los playoffs (WC/DIV/CON/SB, 309 partidos) se
# excluyen: sedes neutrales, descansos atípicos y mercado con liquidez distinta.
GAME_TYPE = "REG"

FIRST_SEASON = 1999          # inicio de la serie nflverse
ELO_BURN_IN_SEASONS = 3      # 1999-2001: solo para calentar Elo/forma
FIRST_TRAIN_SEASON = 2002    # primer fold con >= 3 temporadas de historia

# Evaluación walk-forward: se predice cada temporada con todas las anteriores.
EVAL_SEASONS = tuple(range(2010, 2026))   # 2010..2025
VAL_SEASONS = tuple(range(2010, 2020))    # 2010..2019 -> selección de hiperparámetros
TEST_SEASONS = tuple(range(2020, 2026))   # 2020..2025 -> informe final, no se toca

# ---------------------------------------------------------------------------
# Elo
# ---------------------------------------------------------------------------
ELO_START = 1500.0
ELO_K = 20.0                 # valor base (sensibilidad 15/20/25)
ELO_HFA = 55.0               # puntos Elo; ~2.5 pts de spread (sensibilidad 40/55/70)
ELO_SEASON_REGRESSION = 0.75  # elo = 1500 + 0.75*(elo-1500) al empezar temporada
ELO_MOV_SCALE = 2.2          # multiplicador por margen de victoria (estilo 538)

# Rejilla de sensibilidad (se evalúa SOLO en VAL_SEASONS).
ELO_K_GRID = (15.0, 20.0, 25.0, 30.0)
ELO_HFA_GRID = (40.0, 55.0, 70.0)

# Continuidad de franquicia (mismo club, código distinto por ciudad):
#   STL (1999-2015) -> LA ; SD (1999-2016) -> LAC ; OAK (1999-2019) -> LV
# Sin este mapeo, Elo y forma reiniciarían al mudarse la franquicia.
FRANCHISE_MAP = {"STL": "LA", "SD": "LAC", "OAK": "LV"}

# ---------------------------------------------------------------------------
# Features
# ---------------------------------------------------------------------------
FORM_WINDOW = 5              # últimos 5 partidos
MIN_PRIOR_GAMES = FORM_WINDOW  # filas con menos historia se descartan (solo 1999)

# ---------------------------------------------------------------------------
# Modelos
# ---------------------------------------------------------------------------
LOGIT_C_GRID = (0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1.0, 3.0)  # seleccionado en VAL
HGB_PARAMS = dict(
    max_iter=300,
    learning_rate=0.05,
    max_leaf_nodes=15,
    min_samples_leaf=40,
    l2_regularization=1.0,
    early_stopping=False,
    random_state=SEED,
)

# Tasa de empate usada para repartir la masa del mercado 2-vías en 3 clases.
# Se estima por fold con las temporadas de entrenamiento (nunca con el futuro);
# este valor solo actúa como suelo si el fold no tuviera empates.
TIE_RATE_FLOOR = 0.002

# ---------------------------------------------------------------------------
# Entorno
# ---------------------------------------------------------------------------
os.environ.setdefault("PYTHONHASHSEED", str(SEED))
