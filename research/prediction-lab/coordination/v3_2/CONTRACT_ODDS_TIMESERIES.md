# CONTRACT_ODDS_TIMESERIES — Contrato de serie temporal multi-tick de cuotas (`v3.2`)

> **Propietarios:** Orquestador `O` (borrador inicial en Ola 0) y `B3` (`b3-capture`, actualización final tras auditoría legal e implementación).
> **Productor:** `B3` en `.worktrees/web-scraping` (`C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\web-scraping`).
> **Consumidores en `.worktrees/prediction-lab`:** `B5` (`services/models/paper_trading.py`), `B6` (`services/ingest/nfl_sharp_closing.py`), `B8` (`services/models/regenerate_live_snapshot.py`), Verificador `V`.

---

## 1. Rutas canónicas entre worktrees

- **Programador multi-tick (implementado por `B3`):**
  `C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\web-scraping\scrapers\cadence_scheduler.py`
  - Paquete modular de fuentes y resolución de equipos:
    `C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\web-scraping\scrapers\sources\{__init__,base,team_resolution,the_odds_api,betfair,smarkets,codere,registry}.py`
  - Invocación CLI:
    - `.\.venv\Scripts\python.exe scrapers/cadence_scheduler.py --dry-run`
    - `.\.venv\Scripts\python.exe scrapers/cadence_scheduler.py --once`
    - `.\.venv\Scripts\python.exe scrapers/cadence_scheduler.py --loop --max-duration-seconds 10800`
- **Serie temporal append-only (escrita por `B3`):**
  `C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\web-scraping\data\odds_timeseries\<sport>\<YYYY-MM-DD>.jsonl`
  - `<sport>` $\in$ `{"football", "nfl"}` (minúsculas, alineado 1:1 con `services/ingest/odds_snapshots.py` y `src/domain/prediction/odds.ts`).
  - `<YYYY-MM-DD>` corresponde **siempre a la fecha UTC de `ts_event_start`** (`dt_start.strftime("%Y-%m-%d")`). Los consumidores `B5`, `B6`, `B8` escanean todos los `.jsonl` bajo `data/odds_timeseries/<sport>/*.jsonl` (o `--timeseries-dir`). Si no se han capturado filas reales validadas (p. ej. por ausencia de credenciales en fuentes `api_only`), **no** se crean archivos `.jsonl` vacíos ni sintéticos.
- **Salud de captura (escrita por `B3`):**
  `C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\web-scraping\data\odds_timeseries\health.json`
- **Auditoría legal por fuente (escrita por `B3`):**
  `C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\web-scraping\docs\LEGAL_FUENTES_CUOTAS.md`
- **Configuración de cadencia (leída en estricto modo lectura por `B3`):**
  `C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\prediction-lab\src\data\prediction\stale_lines_config.json` (ruta JSON real: `recommended_scraping_cadence.regimes`; `cadence_scheduler.py` registra `stale_lines_config_sha256` en `health.json` como prueba de no modificación).

---

## 2. Esquema exacto por línea JSONL (`11 + 1` columnas)

Cada línea de `<YYYY-MM-DD>.jsonl` es un objeto JSON válido con las 12 llaves en orden determinista, compatible directamente con `validateAndDeduplicateSnapshots` (`src/domain/prediction/odds.ts`) y `validate_and_deduplicate_snapshots` (`services/ingest/odds_snapshots.py`):

| Campo | Tipo | Regla / Restricción implementada |
|---|---|---|
| `event_id` | `string` | Identificador canónico determinista `ws:<sport>:<league>:<YYYYMMDD>:<home_slug>:<away_slug>` construido por `build_canonical_event_id` (`scrapers/sources/team_resolution.py`), reutilizando `EXPLICIT_TEAM_ALIASES` y `LEAGUE_SCOPED_ALIASES` de `scrapers/build_feature_store.py` (idéntico para casas sharp y recreativas del mismo partido). |
| `sport` | `"football" \| "nfl"` | Deporte canónico. |
| `league` | `string` | Código canónico (`"E0"`, `"SP1"`, `"D1"`, `"I1"`, `"F1"`, `"MEX"`, `"UCL"`, `"USA"`, `"NFL"`). |
| `market` | `string` | `"1x2"`, `"ah"`, `"totals"`, `"btts"`, `"dnb"`, `"moneyline"`, `"spread"`. |
| `line` | `number \| null` | `null` en `"1x2"`, `"btts"`, `"dnb"`, `"moneyline"`; `float` en `"ah"`, `"spread"` (siempre desde la perspectiva del hándicap del equipo local para emparejar `home` y `away` en `resolve_closing_odds`) y `"totals"` (`-0.0` normalizado a `0.0`). |
| `selection` | `string` | `"home" \| "draw" \| "away"` (`1x2`), `"home" \| "away"` (`ah`, `dnb`, `moneyline`, `spread`), `"over" \| "under"` (`totals`), `"yes" \| "no"` (`btts`). |
| `book` | `string` | Identificador canónico en minúsculas (`"pinnacle"`, `"smarkets"`, `"betfair_exchange"`, `"bet365"`, `"draftkings"`, `"fanduel"`, `"betmgm"`, `"codere"`, etc.). **Solo emisores provenientes de fuentes con estado `ok` o `api_only` en `LEGAL_FUENTES_CUOTAS.md`.** |
| `price_decimal` | `number` | Cuota decimal real en `[1.01, 1000.0]`. **Jamás inventada ni derivada del modelo.** |
| `ts_captured` | `string` | Timestamp UTC ISO-8601 (`YYYY-MM-DDTHH:MM:SSZ`) estricto pre-kickoff (`ts_captured <= ts_event_start`; cualquier fila con `ts_captured > ts_event_start` se descarta antes de persistir). |
| `ts_event_start` | `string` | Timestamp UTC ISO-8601 (`YYYY-MM-DDTHH:MM:SSZ`) de inicio oficial del evento. |
| `source` | `"scraped_ws"` | Constante `"scraped_ws"` para compatibilidad directa con `odds.ts` y `odds_snapshots.py`. |
| `raw_sha256` | `string` | SHA-256 hex (64 caracteres minúscula) del payload crudo de origen de esa captura. |

> **Nota para validadores y consumidores (`B5`, `B6`, `B8`):** `odds.ts` y `odds_snapshots.py` conservan las 11 columnas requeridas al validar y deduplicar por `(event_id, market, line, selection, book, ts_captured, source)`. `append_validated_ticks_jsonl` deduplica además contra el archivo existente en disco para garantizar idempotencia estricta. `raw_sha256` viaja en el JSONL crudo como columna de auditoría inmutable.

---

## 3. Regímenes de cadencia (`stale_lines_config.json`, solo lectura)

| Régimen (`regime_id`) | Etiqueta corta | Ventana antes de `ts_event_start` | Intervalo máximo (`stale_lines_config.json`) | Intervalo programado (`0.92x` margen de seguridad) |
|---|---|---|---|---|
| `closing_decision_window_t_minus_60m` | `T-60m` | `[T-60 min, T-0]` (`<= 60.0 min`) | `<= 3.6858 min` (`221.1501 s`) | `203.458 s` (`3.39 min`) |
| `matchday_near_kickoff_q00_ws` | `T-4.4h` | `(T-262.42 min, T-60 min)` | `<= 8.5676 min` (`514.0530 s`) | `472.929 s` (`7.88 min`) |
| `matchday_window_q10_ws` | `T-8.5h` | `(T-509.90 min, T-262.42 min]` | `<= 11.6886 min` (`701.3157 s`) | `645.210 s` (`10.75 min`) |
| `early_week_median_q50_ws` | `early_week` | `> T-509.90 min` | `<= 30.4046 min` (`1824.2781 s`) | `1678.336 s` (`27.97 min`) |

---

## 4. Resultado de la Auditoría Legal (`LEGAL_FUENTES_CUOTAS.md`) y Esquema de `health.json`

### 4.1 Estado legal observado (`2026-11-12T14:55Z`, cero evasión anti-bot)

| Fuente | Estado en `LEGAL_FUENTES_CUOTAS.md` | Credenciales requeridas | Activa hoy en entorno sin `.env` | Resumen de evidencia (`OBSERVADO`) |
|---|---|---|---|---|
| `the_odds_api` | `api_only` | `THE_ODDS_API_KEY` | `false` (ausente) | API REST v4 oficial (`cf-mitigated: ""`, `HTTP 401 MISSING_KEY`); provee `pinnacle`, `smarkets`, `betfair_exchange`, `bet365`, `draftkings`, `fanduel`, `codere`. |
| `betfair_exchange` | `api_only` | `BETFAIR_APP_KEY`, `BETFAIR_SESSION_TOKEN` | `false` (ausentes) | Betfair Exchange API-NG oficial permitida por ToS; scraping de `www.betfair.com` prohibido (`HTTP 403`). |
| `pinnacle` | `blocked_pending_owner_decision` | `PINNACLE_B2B_API_KEY` (B2B) | `false` (bloqueada) | ToS prohíben bots/scrapers sobre web y `guest.api.arcadia.pinnacle.com`; scraper previo usaba `solve_cloudflare=True`. |
| `smarkets` | `blocked_pending_owner_decision` | `SMARKETS_SESSION_TOKEN` + aprobación API | `false` (bloqueada) | `GET api.smarkets.com/v3/events/...` sin evasión devuelve `HTTP 403` (`CF-Mitigated: challenge` / `"Smarkets - Security Check"`). |
| `caliente` | `blocked_pending_owner_decision` | — (sin API oficial) | `false` (bloqueada) | `GET sports.caliente.mx/es_MX/Futbol` sin evasión devuelve `HTTP 403` (`CF-Mitigated: challenge`); ToS Caliplay prohíben scraping. |
| `codere` | `blocked_pending_owner_decision` | — (sin API oficial) | `false` (bloqueada) | `https://apuestas.codere.mx/robots.txt` declara `Disallow: /` (`Allow: /es_MX$`) y `m.codere.mx` devuelve `HTTP 404`. Parser con equipos/evento listo en `scrapers/sources/codere.py`. |
| `action_network` | `blocked_pending_owner_decision` | — (sin API oficial) | `false` (bloqueada) | Cláusula literal en `https://www.actionnetwork.com/terms` prohíbe `"deep-link"`, `"page-scrape"`, `"robot"` y `"spider"`. |

### 4.2 Esquema real de `data/odds_timeseries/health.json`

- `generated_at_utc`: ISO-8601 UTC (`"YYYY-MM-DDTHH:MM:SSZ"`)
- `mode`: `"dry-run" | "once" | "loop"`
- `capture_status`: `"ok" | "prospective_capture_pending" | "blocked_no_approved_sharp"` (actualmente `"prospective_capture_pending"` por ausencia de credenciales en las 2 fuentes `api_only`, bloqueo legal/anti-bot de las 5 fuentes web y 0 partidos en `[T-60m, T-0]` durante la ejecución).
- `stale_lines_config_sha256`: SHA-256 hex de `stale_lines_config.json`
- `regimes_configured`: arreglo con los 4 regímenes (`regime_id`, `short_label`, `horizon_minutes`, `max_interval_minutes`, `max_interval_seconds`, `scheduled_interval_seconds`)
- `approved_sources`: lista de objetos para `the_odds_api` y `betfair_exchange` (`source`, `status`, `required_env_vars`, `credentials_present`, `active_in_scheduler`)
- `active_sources`: `string[]`
- `credential_pending_sources`: lista de fuentes `api_only` pendientes de variables de entorno
- `blocked_sources`: lista de 5 objetos `{ source, status: "blocked_pending_owner_decision", reason }`
- `calendar_upcoming_events_count`: entero (`66` eventos futuros detectados en el calendario pre-partido)
- `calendar_events_by_regime`: `{ "T-60m": number, "T-4.4h": number, "T-8.5h": number, "early_week": number }`
- `events_tracked`: entero (`0` mientras no existan credenciales activas)
- `total_rows_written`: entero
- `ticks_per_event`: `{ min: number, median: number, max: number, by_event: Record<string, number> }`
- `median_gap_minutes_by_regime`: `{ "T-60m": number | null, "T-4.4h": number | null, "T-8.5h": number | null, "early_week": number | null }`
- `sharp_coverage`: `{ events_with_sharp: number, total_events: number, ratio: number, books: string[] }`
- `notes`: explicación honesta con trazabilidad de bloqueo legal y ventana horaria.
