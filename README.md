# PitchLab — Multi-Sport Web Scraping Data & Feature Store (`web-scraping`)

Rama huérfana dedicada exclusivamente a herramientas de extracción web, almacenamiento auditable (`sha256` + `captured_at_utc`), Feature Store canónico multi-deporte (11 ligas / 6 deportes) y evaluación causal walk-forward de impacto en modelos predictivos mediante **Scrapling (`v0.5.1`)**.

## Estructura

- [`Scrapling/`](Scrapling/README.md) — Copia de [D4Vinci/Scrapling](https://github.com/D4Vinci/Scrapling) instalada en modo editable (incluye su skill oficial en [`Scrapling/agent-skill/Scrapling-Skill/SKILL.md`](Scrapling/agent-skill/Scrapling-Skill/SKILL.md)).
- **Documentación (`docs/`):**
  - [`docs/FUENTES_WEB_SCRAPING.md`](docs/FUENTES_WEB_SCRAPING.md) — Catálogo documentado de las **28 fuentes web** en 5 categorías (Casinos/Cuotas, Estadísticas Avanzadas/`xG` multi-deporte con **Opta Player Stats**, **Statiskicks**, **Understat**, **FBref**, **MoneyPuck/Hockey-Ref**, **FanGraphs/Baseball-Ref**, **Basketball-Ref Four Factors** y **CFB SP+/SRS/FPI**, Lesiones/Alineaciones, Noticias/Prensa y Clima/Árbitros), modos de Scrapling y reglas anti-leakage.
  - [`docs/IMPACTO_MODELO_PREDICCION.md`](docs/IMPACTO_MODELO_PREDICCION.md) — Estudio de ablación walk-forward (`t' < t`) en **4 experimentos**:
    1. **5 Grandes Ligas Europeas (`2018–2025`, 7 temporadas, $N = 12,533$, $n_{\text{eval}} = 8,982$):** mejora pre-partido de **`-0.01545` en Log-Loss** (`M3` vs `M1`, IC 95 % $[-0.01978, -0.01102]$, $p = 0.0000$) y **`-0.13332`** en el ensamble Monte Carlo tiro a tiro (`M4`, Log-Loss `0.86785`, Acc `60.25 %`).
    2. **Liga MX (`2018–2026`, 8 temporadas, $N = 2,795$, `1,798` con `xG` exacto Opta/Statiskicks, $n_{\text{eval}} = 2,186$):** mejora de **`-0.02102` en Log-Loss** (`MX3` vs `MX1`, IC 95 % $[-0.03199, -0.01063]$, $p = 0.0000$) y cuantificación del **Shock de Altitud** de **`+13.94 pp`** en victoria local.
    3. **Microestructura de Mercado y Disponibilidad Multi-Deporte:** overround de **Pinnacle (`3.22 %`)** vs **Caliente.mx (`6.62 %`, `2.06x`)**, `7,046` splits activos de **Action Network** (`NFL`, `NCAAF`, `NBA`, `NHL`, `MLB`) con `37.30 %` de señales sharp y `1,004` lesionados multi-deporte en EE. UU.
    4. **Validación Out-of-Sample Multi-Deporte (`NHL`, `MLB`, `NBA`, `NCAAF`, `716` equipos-temporada, `486` pares $S-1 \to S$):** mejora simultánea en `RMSE`, `MAE` y correlación de Pearson $r$ en los 4 deportes (`NHL` `-8.0 %`, `MLB` `-15.5 %`, `NBA` `-3.8 %`, `NCAAF` `-16.0 %` en `RMSE`).
- [`config/sources_catalog.json`](config/sources_catalog.json) — Configuración estructurada de las **28 fuentes**, sus 11 ligas (`liga-mx`, `epl`, `laliga`, `bundesliga`, `serie-a`, `ligue-1`, `nfl`, `nba`, `nhl`, `mlb`, `ncaaf`), modos de Scrapling, SLAs de frescura y features desbloqueadas.
- **Scrapers, Orquestación y Pipelines (`scrapers/`):**
  - [`scrapers/base_scraper.py`](scrapers/base_scraper.py) — Clase base `PitchLabScraplingBase` con sellado automático `captured_at_utc` y `sha256`.
  - [`scrapers/odds_scraper.py`](scrapers/odds_scraper.py), [`scrapers/stats_scraper.py`](scrapers/stats_scraper.py), [`scrapers/context_scraper.py`](scrapers/context_scraper.py) — Ola 1.
  - [`scrapers/wave2_stats_odds_scraper.py`](scrapers/wave2_stats_odds_scraper.py), [`scrapers/wave2_context_scraper.py`](scrapers/wave2_context_scraper.py) — Ola 2.
  - [`scrapers/wave3_deep_xg_opta_statiskicks.py`](scrapers/wave3_deep_xg_opta_statiskicks.py), [`scrapers/wave3_deep_six_leagues.py`](scrapers/wave3_deep_six_leagues.py), [`scrapers/wave3_deep_odds_env_referees.py`](scrapers/wave3_deep_odds_env_referees.py) — Ola 3 profunda.
  - [`scrapers/wave4_full_opta_statiskicks_understat.py`](scrapers/wave4_full_opta_statiskicks_understat.py), [`scrapers/wave4_full_rosters_and_history.py`](scrapers/wave4_full_rosters_and_history.py), [`scrapers/wave4_european_stadiums_and_deep_odds.py`](scrapers/wave4_european_stadiums_and_deep_odds.py) — Ola 4 exhaustiva.
  - [`scrapers/wave5_historical_2018_2022_xg.py`](scrapers/wave5_historical_2018_2022_xg.py), [`scrapers/wave5_multisport_advanced_stats.py`](scrapers/wave5_multisport_advanced_stats.py), [`scrapers/wave5_multisport_odds_injuries_weather.py`](scrapers/wave5_multisport_odds_injuries_weather.py) — **Ola 5** (`xG` histórico `2018–2023` en Europa y Liga MX + expansión multi-deporte a `NHL`, `MLB`, `NBA` y `NCAAF`).
  - [`scrapers/run_matchday_refresh.py`](scrapers/run_matchday_refresh.py) — Orquestador CLI pre-jornada por ventanas (`T-72h`, `T-24h`, `T-6h`, `T-2h`, `T-90m`, `T-1h`, `weekly`, `post-match`, `all`) con auditoría criptográfica `--verify-only` y `--dry-run`.
  - [`scrapers/normalize_datasets.py`](scrapers/normalize_datasets.py) — Verificador criptográfico (`sha256` en los `55` snapshots) y normalizador hacia `data/normalized/` (`108,167` registros).
  - [`scrapers/build_feature_store.py`](scrapers/build_feature_store.py) — Resolvedor canónico de entidades sensible a liga/deporte (`376` equipos en 11 ligas, `598` alias globales + `1,260` alias por liga) y generador de `data/feature_store/`.
  - [`scrapers/evaluate_scraping_lift.py`](scrapers/evaluate_scraping_lift.py) — Evaluación walk-forward causal de ablación y validación out-of-sample multi-deporte (4 experimentos).
- **Datos (`data/`):**
  - `data/raw/` — **55 snapshots crudos JSON** (`all_sha256_verified: true`) + **4 volcados Markdown `--ai-targeted`**.
  - `data/normalized/` — **108,167 registros normalizados** en 4 tablas de dominio (`market_microstructure`: `22,412`; `xg_and_team_ratings`: `78,898`; `roster_availability`: `5,908`; `news_and_environment`: `949`) + [`manifest_summary.json`](data/normalized/manifest_summary.json).
  - `data/feature_store/` — **Feature Store v2.0 listo para producción e inferencia (11 ligas, 6 deportes):**
    - [`data/feature_store/team_master_features.json`](data/feature_store/team_master_features.json) y [`.csv`](data/feature_store/team_master_features.csv) (**`376` equipos canónicos** con `100 %` de completitud: `114` clubes de fútbol + `32` NFL + `32` NHL + `30` MLB + `30` NBA + `138` programas NCAAF FBS).
    - [`data/feature_store/historical_matches_xg.json`](data/feature_store/historical_matches_xg.json) y [`.csv`](data/feature_store/historical_matches_xg.csv) (**`15,344` partidos históricos cronológicos** `2018–2026` en las 5 ligas europeas y Liga MX).
    - [`data/feature_store/live_matchups_edge_matrix.json`](data/feature_store/live_matchups_edge_matrix.json) (**`242` enfrentamientos activos** en las 11 ligas cruzando cuotas sin vig con diferenciales de eficiencia por deporte, sharp money y altitud).
    - [`data/feature_store/ablation_report.json`](data/feature_store/ablation_report.json), [`data/feature_store/feature_store_manifest.json`](data/feature_store/feature_store_manifest.json) y [`data/feature_store/refresh_run_report.json`](data/feature_store/refresh_run_report.json).

## Uso rápido y verificación end-to-end

Desde la raíz del repositorio (o dentro de `.worktrees/web-scraping` ajustando rutas):

```powershell
# 1. Normalizar y verificar SHA-256 de los 55 snapshots crudos
.\.worktrees\web-scraping\.venv\Scripts\python.exe .worktrees/web-scraping/scrapers/normalize_datasets.py

# 2. Construir Feature Store canónico v2.0 (376 equipos, 15,344 partidos xG, 242 matchups activos)
.\.worktrees\web-scraping\.venv\Scripts\python.exe .worktrees/web-scraping/scrapers/build_feature_store.py

# 3. Ejecutar los 4 experimentos walk-forward / out-of-sample y regenerar docs/IMPACTO_MODELO_PREDICCION.md
.\.worktrees\web-scraping\.venv\Scripts\python.exe .worktrees/web-scraping/scrapers/evaluate_scraping_lift.py

# 4. Auditar integridad SHA-256, anti-leakage y SLA de las 28 fuentes sin tráfico de red
.\.worktrees\web-scraping\.venv\Scripts\python.exe .worktrees/web-scraping/scrapers/run_matchday_refresh.py --verify-only --window all --skip-build

# Plan pre-jornada en seco o actualización por ventana (ej. T-24h, T-6h, T-1h)
.\.worktrees\web-scraping\.venv\Scripts\python.exe .worktrees/web-scraping/scrapers/run_matchday_refresh.py --dry-run --window T-6h
```
