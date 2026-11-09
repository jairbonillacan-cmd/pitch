# PitchLab — Web Scraping Data (`web-scraping`)

Rama huérfana dedicada exclusivamente a herramientas y almacenamiento de datos de web scraping mediante **Scrapling (`v0.5.1`)**.

## Estructura

- [`Scrapling/`](Scrapling/README.md) — Copia de [D4Vinci/Scrapling](https://github.com/D4Vinci/Scrapling) instalada en modo editable (incluye su skill oficial en [`Scrapling/agent-skill/Scrapling-Skill/SKILL.md`](Scrapling/agent-skill/Scrapling-Skill/SKILL.md)).
- [`docs/FUENTES_WEB_SCRAPING.md`](docs/FUENTES_WEB_SCRAPING.md) — Catálogo documentado de sitios web (Casinos/Cuotas, Estadísticas/xG con **Opta Player Stats** y **Statiskicks**, Lesiones/Alineaciones, Noticias/Prensa y Clima/Árbitros), modos de Scrapling y reglas anti-leakage.
- [`config/sources_catalog.json`](config/sources_catalog.json) — Configuración estructurada de las 24 fuentes, sus ligas, modos de Scrapling y features desbloqueadas.
- [`scrapers/base_scraper.py`](scrapers/base_scraper.py) — Clase base `PitchLabScraplingBase` que envuelve `FetcherSession`, `StealthySession`, `AsyncStealthySession` (`record_requests=True`) y CLI `--ai-targeted`, sellando cada captura con `captured_at_utc` y `sha256`.
- `data/` — Directorio para almacenar los datasets y capturas obtenidos mediante web scraping (`data/raw/{category}/{source_id}/{YYYY-MM-DD}/`).
- `.venv/` — Entorno virtual de Python 3.12 con `scrapling[all]` y navegadores stealth instalados.

## Uso rápido

Verificar el catálogo y listar las fuentes configuradas con Scrapling:

```powershell
.\.venv\Scripts\python.exe -m scrapers.base_scraper --list-sources --verify-catalog
```

Ejecutar el CLI de Scrapling directamente (siempre con `--ai-targeted`):

```powershell
.\.venv\Scripts\scrapling.exe extract get "https://example.com" data/example.md --ai-targeted
```
