# PitchLab — Web Scraping Data (`web-scraping`)

Rama huérfana dedicada exclusivamente a herramientas y almacenamiento de datos de web scraping mediante **Scrapling (`v0.5.1`)**.

## Estructura

- [`Scrapling/`](Scrapling/README.md) — Copia de [D4Vinci/Scrapling](https://github.com/D4Vinci/Scrapling) instalada en modo editable (incluye su skill oficial en [`Scrapling/agent-skill/Scrapling-Skill/SKILL.md`](Scrapling/agent-skill/Scrapling-Skill/SKILL.md)).
- [`docs/FUENTES_WEB_SCRAPING.md`](docs/FUENTES_WEB_SCRAPING.md) — Catálogo documentado de las 24 fuentes web en 5 categorías (Casinos/Cuotas, Estadísticas/xG con **Opta Player Stats** y **Statiskicks**, Lesiones/Alineaciones, Noticias/Prensa y Clima/Árbitros), modos de Scrapling y reglas anti-leakage.
- [`config/sources_catalog.json`](config/sources_catalog.json) — Configuración estructurada de las 24 fuentes, sus ligas, modos de Scrapling y features desbloqueadas.
- **Scrapers (`scrapers/`):**
  - [`scrapers/base_scraper.py`](scrapers/base_scraper.py) — Clase base `PitchLabScraplingBase` con sellado automático `captured_at_utc` y `sha256`.
  - [`scrapers/odds_scraper.py`](scrapers/odds_scraper.py) — Ola 1 de Casinos y Cuotas (Pinnacle, Caliente.mx y Action Network Splits).
  - [`scrapers/stats_scraper.py`](scrapers/stats_scraper.py) — Ola 1 de Estadísticas Avanzadas (Statiskicks, Opta Player Stats, ClubElo, Transfermarkt Liga MX y Understat EPL).
  - [`scrapers/context_scraper.py`](scrapers/context_scraper.py) — Ola 1 de Lesiones, Noticias y Clima (Transfermarkt, RotoWire, Mediotiempo `--ai-targeted` y Open-Meteo).
  - [`scrapers/wave2_stats_odds_scraper.py`](scrapers/wave2_stats_odds_scraper.py) — Ola 2 de Estadísticas y Cuotas (FotMob, FBref, Sofascore, SumerSports/PFR, Codere, OddsPortal/Oddschecker y Smarkets Exchange).
  - [`scrapers/wave2_context_scraper.py`](scrapers/wave2_context_scraper.py) — Ola 2 de Lesiones, Prensa y Árbitros (PremierInjuries/SportsGambler, NFL Official Injuries & Ourlads Depth Charts, Fantasy Football Scout/BBC, Marca, ProFootballTalk y WorldFootball/NFLPenalties).
  - [`scrapers/wave3_deep_xg_opta_statiskicks.py`](scrapers/wave3_deep_xg_opta_statiskicks.py) — Ola 3 profunda de **Understat**, **Opta Player Stats** y **Statiskicks**.
  - [`scrapers/wave3_deep_six_leagues.py`](scrapers/wave3_deep_six_leagues.py) — Ola 3 profunda de las **6 ligas principales** en **Transfermarkt**, **FotMob** y **FBref**.
  - [`scrapers/wave3_deep_odds_env_referees.py`](scrapers/wave3_deep_odds_env_referees.py) — Ola 3 profunda de **48 estadios (Liga MX + NFL)**, **árbitros de las 6 ligas + castigos NFL** y **Action Network / Smarkets Exchange**.
  - [`scrapers/wave4_full_opta_statiskicks_understat.py`](scrapers/wave4_full_opta_statiskicks_understat.py) — Ola 4 exhaustiva: **los 18 clubes de Liga MX en Statiskicks** (`1,657` filas de jugadores `SKore`/`Total`/`p90`, `960` puntos rodantes `xG`/`xGA`, `589` percentiles tácticos), **los 18 clubes de Liga MX en Opta `seasonstats?detailed=yes`** (`557` jugadores de Liga MX + `7` ligas completas) y **Understat sin tope (`2,774` jugadores) + histórico `2023` y `2024` (`3,504` partidos)**.
  - [`scrapers/wave4_full_rosters_and_history.py`](scrapers/wave4_full_rosters_and_history.py) — Ola 4 exhaustiva: **plantillas individuales completas de los 18 clubes de Liga MX + 8 clubes europeos en Transfermarkt** (`692` jugadores con valor en €), **Sofascore en 7 ligas** (`3,484` registros) y **FBref histórico de Liga MX `2023-2024` y `2024-2025`** (`1,872` filas).
  - [`scrapers/wave4_european_stadiums_and_deep_odds.py`](scrapers/wave4_european_stadiums_and_deep_odds.py) — Ola 4 exhaustiva: **60 estadios de las 5 ligas europeas en Open-Meteo** (`10,080` puntos horarios; `108` estadios en total), **Pinnacle multi-liga/multi-deporte** (`8,604` registros) y **RotoWire multi-liga** (`1,804` registros).
  - [`scrapers/normalize_datasets.py`](scrapers/normalize_datasets.py) — Verificador criptográfico (`sha256`) y normalizador hacia `data/normalized/`.
- **Datos (`data/`):**
  - `data/raw/{category}/{source_id}/{YYYY-MM-DD}/` — **45 snapshots crudos** (con sus sobres `captured_at_utc` + `sha256`) y **4 volcados Markdown `--ai-targeted`** cubriendo las **24/24 fuentes**.
  - `data/normalized/` — **61,033 registros normalizados** listos para modelado:
    - [`data/normalized/xg_and_team_ratings.json`](data/normalized/xg_and_team_ratings.json) (`42,438` registros)
    - [`data/normalized/market_microstructure.json`](data/normalized/market_microstructure.json) (`13,318` registros)
    - [`data/normalized/roster_availability.json`](data/normalized/roster_availability.json) (`4,388` registros)
    - [`data/normalized/news_and_environment.json`](data/normalized/news_and_environment.json) (`889` registros)
    - [`data/normalized/manifest_summary.json`](data/normalized/manifest_summary.json) (manifiesto de auditoría con `all_sha256_verified: true`)

## Uso rápido

Verificar el catálogo y re-ejecutar el normalizador sobre todos los snapshots:

```powershell
.\.venv\Scripts\python.exe -m scrapers.base_scraper --list-sources --verify-catalog
.\.venv\Scripts\python.exe scrapers/normalize_datasets.py
```
