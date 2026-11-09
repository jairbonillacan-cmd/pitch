# PitchLab — Web Scraping Data & Feature Store (`web-scraping`)

Rama huérfana dedicada exclusivamente a herramientas, almacenamiento de datos de web scraping, Feature Store canónico y evaluación de impacto en modelos predictivos mediante **Scrapling (`v0.5.1`)**.

## Estructura

- [`Scrapling/`](Scrapling/README.md) — Copia de [D4Vinci/Scrapling](https://github.com/D4Vinci/Scrapling) instalada en modo editable (incluye su skill oficial en [`Scrapling/agent-skill/Scrapling-Skill/SKILL.md`](Scrapling/agent-skill/Scrapling-Skill/SKILL.md)).
- **Documentación (`docs/`):**
  - [`docs/FUENTES_WEB_SCRAPING.md`](docs/FUENTES_WEB_SCRAPING.md) — Catálogo documentado de las 24 fuentes web en 5 categorías (Casinos/Cuotas, Estadísticas/xG con **Opta Player Stats** y **Statiskicks**, Lesiones/Alineaciones, Noticias/Prensa y Clima/Árbitros), modos de Scrapling y reglas anti-leakage.
  - [`docs/IMPACTO_MODELO_PREDICCION.md`](docs/IMPACTO_MODELO_PREDICCION.md) — Estudio de ablación walk-forward (`t' < t`) demostrando la mejora de **`-0.02168` en Log-Loss** ($p = 0.0000$, IC 95 % $[-0.02957, -0.01088]$) en las 5 ligas europeas y **`-0.01344` en Log-Loss** en Liga MX.
- [`config/sources_catalog.json`](config/sources_catalog.json) — Configuración estructurada de las 24 fuentes, sus ligas, modos de Scrapling y features desbloqueadas.
- **Scrapers y Pipelines (`scrapers/`):**
  - [`scrapers/base_scraper.py`](scrapers/base_scraper.py) — Clase base `PitchLabScraplingBase` con sellado automático `captured_at_utc` y `sha256`.
  - [`scrapers/odds_scraper.py`](scrapers/odds_scraper.py), [`scrapers/stats_scraper.py`](scrapers/stats_scraper.py), [`scrapers/context_scraper.py`](scrapers/context_scraper.py) — Ola 1.
  - [`scrapers/wave2_stats_odds_scraper.py`](scrapers/wave2_stats_odds_scraper.py), [`scrapers/wave2_context_scraper.py`](scrapers/wave2_context_scraper.py) — Ola 2.
  - [`scrapers/wave3_deep_xg_opta_statiskicks.py`](scrapers/wave3_deep_xg_opta_statiskicks.py), [`scrapers/wave3_deep_six_leagues.py`](scrapers/wave3_deep_six_leagues.py), [`scrapers/wave3_deep_odds_env_referees.py`](scrapers/wave3_deep_odds_env_referees.py) — Ola 3 profunda.
  - [`scrapers/wave4_full_opta_statiskicks_understat.py`](scrapers/wave4_full_opta_statiskicks_understat.py), [`scrapers/wave4_full_rosters_and_history.py`](scrapers/wave4_full_rosters_and_history.py), [`scrapers/wave4_european_stadiums_and_deep_odds.py`](scrapers/wave4_european_stadiums_and_deep_odds.py) — Ola 4 exhaustiva.
  - [`scrapers/normalize_datasets.py`](scrapers/normalize_datasets.py) — Verificador criptográfico (`sha256`) y normalizador hacia `data/normalized/` (`61,033` registros).
  - [`scrapers/build_feature_store.py`](scrapers/build_feature_store.py) — Resolvedor canónico de entidades (`146` equipos y `368` alias) y generador de `data/feature_store/`.
  - [`scrapers/evaluate_scraping_lift.py`](scrapers/evaluate_scraping_lift.py) — Evaluación walk-forward de ablación y microestructura de mercado.
- **Datos (`data/`):**
  - `data/raw/` — **45 snapshots crudos** (`all_sha256_verified: true`) + **4 volcados Markdown `--ai-targeted`**.
  - `data/normalized/` — **61,033 registros normalizados** en 4 tablas de dominio + [`manifest_summary.json`](data/normalized/manifest_summary.json).
  - `data/feature_store/` — **Feature Store listo para producción e inferencia:**
    - [`data/feature_store/team_master_features.json`](data/feature_store/team_master_features.json) y [`.csv`](data/feature_store/team_master_features.csv) (`146` equipos: `114` clubes de fútbol + `32` franquicias NFL con 100 % de completitud).
    - [`data/feature_store/historical_matches_xg.json`](data/feature_store/historical_matches_xg.json) y [`.csv`](data/feature_store/historical_matches_xg.csv) (`4,817` partidos históricos cronológicos con `xG` en Europa y Liga MX).
    - [`data/feature_store/live_matchups_edge_matrix.json`](data/feature_store/live_matchups_edge_matrix.json) (`129` partidos activos cruzando cuotas sin vig con diferenciales del Feature Store).
    - [`data/feature_store/ablation_report.json`](data/feature_store/ablation_report.json) y [`data/feature_store/feature_store_manifest.json`](data/feature_store/feature_store_manifest.json).

## Uso rápido

```powershell
.\.venv\Scripts\python.exe scrapers/normalize_datasets.py
.\.venv\Scripts\python.exe scrapers/build_feature_store.py
.\.venv\Scripts\python.exe scrapers/evaluate_scraping_lift.py
```
