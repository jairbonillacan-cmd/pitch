# PitchLab — Web Scraping Data (`web-scraping`)

Rama huérfana dedicada exclusivamente a herramientas y almacenamiento de datos de web scraping mediante **Scrapling (`v0.5.1`)**.

## Estructura

- [`Scrapling/`](Scrapling/README.md) — Copia de [D4Vinci/Scrapling](https://github.com/D4Vinci/Scrapling) instalada en modo editable (incluye su skill oficial en [`Scrapling/agent-skill/Scrapling-Skill/SKILL.md`](Scrapling/agent-skill/Scrapling-Skill/SKILL.md)).
- [`docs/FUENTES_WEB_SCRAPING.md`](docs/FUENTES_WEB_SCRAPING.md) — Catálogo documentado de las 24 fuentes web en 5 categorías (Casinos/Cuotas, Estadísticas/xG con **Opta Player Stats** y **Statiskicks**, Lesiones/Alineaciones, Noticias/Prensa y Clima/Árbitros), modos de Scrapling y reglas anti-leakage.
- [`config/sources_catalog.json`](config/sources_catalog.json) — Configuración estructurada de las 24 fuentes, sus ligas, modos de Scrapling y features desbloqueadas.
- **Scrapers (`scrapers/`):**
  - [`scrapers/base_scraper.py`](scrapers/base_scraper.py) — Clase base `PitchLabScraplingBase` con sellado automático `captured_at_utc` y `sha256`.
  - [`scrapers/odds_scraper.py`](scrapers/odds_scraper.py) — Extracción de Pinnacle, Caliente.mx y Action Network Splits.
  - [`scrapers/stats_scraper.py`](scrapers/stats_scraper.py) — Extracción de Statiskicks, Opta Player Stats, ClubElo, Transfermarkt Liga MX y Understat EPL.
  - [`scrapers/context_scraper.py`](scrapers/context_scraper.py) — Extracción de lesiones Transfermarkt, RotoWire, Mediotiempo (`--ai-targeted`) y Open-Meteo.
  - [`scrapers/wave2_stats_odds_scraper.py`](scrapers/wave2_stats_odds_scraper.py) — Extracción de FotMob, FBref, Sofascore, SumerSports/PFR, Codere, OddsPortal/Oddschecker y Smarkets Exchange.
  - [`scrapers/wave2_context_scraper.py`](scrapers/wave2_context_scraper.py) — Extracción de PremierInjuries/SportsGambler, NFL Official Injuries & Ourlads Depth Charts, Fantasy Football Scout/BBC, Marca, ProFootballTalk y WorldFootball/NFLPenalties.
  - [`scrapers/normalize_datasets.py`](scrapers/normalize_datasets.py) — Verificador criptográfico (`sha256`) y normalizador hacia `data/normalized/`.
- **Datos (`data/`):**
  - `data/raw/{category}/{source_id}/{YYYY-MM-DD}/` — **25 snapshots crudos** (con sus sobres `captured_at_utc` + `sha256`) y **4 volcados Markdown `--ai-targeted`** cubriendo las **24/24 fuentes**.
  - `data/normalized/` — **5,214 registros normalizados** listos para modelado:
    - [`data/normalized/market_microstructure.json`](data/normalized/market_microstructure.json) (`1,749` registros)
    - [`data/normalized/xg_and_team_ratings.json`](data/normalized/xg_and_team_ratings.json) (`1,004` registros)
    - [`data/normalized/roster_availability.json`](data/normalized/roster_availability.json) (`2,105` registros)
    - [`data/normalized/news_and_environment.json`](data/normalized/news_and_environment.json) (`356` registros)
    - [`data/normalized/manifest_summary.json`](data/normalized/manifest_summary.json) (manifiesto de auditoría con `all_sha256_verified: true`)

## Uso rápido

Verificar el catálogo y re-ejecutar el normalizador sobre todos los snapshots:

```powershell
.\.venv\Scripts\python.exe -m scrapers.base_scraper --list-sources --verify-catalog
.\.venv\Scripts\python.exe scrapers/normalize_datasets.py
```
