# CONTRACT_ODDS_TIMESERIES — Contrato de serie temporal multi-tick de cuotas (`v3.2`)

> **Propietarios:** Orquestador `O` (borrador inicial en Ola 0) y `B3` (`b3-capture`, actualización final tras auditoría legal y ejecución).
> **Productor:** `B3` en `.worktrees/web-scraping` (`C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\web-scraping`).
> **Consumidores en `.worktrees/prediction-lab`:** `B5` (`services/models/paper_trading.py`), `B6` (`services/ingest/nfl_sharp_closing.py`), `B8` (`services/models/regenerate_live_snapshot.py`), Verificador `V`.

---

## 1. Rutas canónicas entre worktrees

- **Serie temporal append-only (escrita por `B3`):**
  `C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\web-scraping\data\odds_timeseries\<sport>\<YYYY-MM-DD>.jsonl`
  - `<sport>` $\in$ `{"football", "nfl"}` (minúsculas, alineado 1:1 con `services/ingest/odds_snapshots.py` y `src/domain/prediction/odds.ts`).
  - `<YYYY-MM-DD>` corresponde a la fecha UTC de `ts_event_start` (o fecha UTC de captura documentada consistentemente por `B3`; los consumidores `B5`, `B6`, `B8` escanean todos los `.jsonl` bajo `data/odds_timeseries/<sport>/*.jsonl` o un directorio configurable `--timeseries-dir`).
- **Salud de captura (escrita por `B3`):**
  `C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\web-scraping\data\odds_timeseries\health.json`
- **Auditoría legal por fuente (escrita por `B3`):**
  `C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\web-scraping\docs\LEGAL_FUENTES_CUOTAS.md`
- **Configuración de cadencia (leída en solo lectura por `B3`):**
  `C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\prediction-lab\src\data\prediction\stale_lines_config.json` (`cadence_recommendation.regimes_evaluated`).

---

## 2. Esquema exacto por línea JSONL (`11 + 1` columnas)

Cada línea de `<YYYY-MM-DD>.jsonl` es un objeto JSON válido compatible directamente con `validateAndDeduplicateSnapshots` (`src/domain/prediction/odds.ts`) y `validate_and_deduplicate_snapshots` (`services/ingest/odds_snapshots.py`):

| Campo | Tipo | Regla / Restricción |
|---|---|---|
| `event_id` | `string` | Identificador canónico determinista del partido mediante la resolución de equipos existente (coherente entre casas sharp y recreativas para el mismo partido). |
| `sport` | `"football" \| "nfl"` | Deporte canónico. |
| `league` | `string` | Código canónico (`"E0"`, `"SP1"`, `"D1"`, `"I1"`, `"F1"`, `"MEX"`, `"NFL"`, etc.). |
| `market` | `string` | `"1x2"`, `"ah"`, `"totals"`, `"btts"`, `"dnb"`, `"moneyline"`, `"spread"`. |
| `line` | `number \| null` | `null` en `"1x2"`, `"btts"`, `"dnb"`, `"moneyline"`; `float` en `"ah"`, `"spread"`, `"totals"`. |
| `selection` | `string` | `"home" \| "draw" \| "away"` (`1x2`), `"home" \| "away"` (`ah`, `dnb`, `moneyline`, `spread`), `"over" \| "under"` (`totals`), `"yes" \| "no"` (`btts`). |
| `book` | `string` | Identificador canónico en minúsculas (`"pinnacle"`, `"smarkets"`, `"betfair_exchange"`, `"caliente"`, `"codere"`, `"bet365"`, etc.). **Solo fuentes con estado `ok` o `api_only` en `LEGAL_FUENTES_CUOTAS.md`.** |
| `price_decimal` | `number` | Cuota decimal real en `[1.01, 1000.0]`. **Jamás inventada ni derivada del modelo.** |
| `ts_captured` | `string` | Timestamp UTC ISO-8601 (`YYYY-MM-DDTHH:MM:SSZ`) estricto pre-kickoff (`ts_captured <= ts_event_start`). |
| `ts_event_start` | `string` | Timestamp UTC ISO-8601 (`YYYY-MM-DDTHH:MM:SSZ`) de inicio oficial del evento. |
| `source` | `"scraped_ws"` | Constante `"scraped_ws"` para compatibilidad directa con `odds.ts` y `odds_snapshots.py`. |
| `raw_sha256` | `string` | SHA-256 hex (64 caracteres minúscula) del payload crudo de origen de esa captura. |

> **Nota para validadores:** `odds.ts` y `odds_snapshots.py` conservan las 11 columnas requeridas al validar y deduplicar por `(event_id, market, line, selection, book, ts_captured, source)`. `raw_sha256` viaja en el JSONL crudo como columna de auditoría inmutable.

---

## 3. Regímenes de cadencia (`stale_lines_config.json`, solo lectura)

| Régimen (`regime_id`) | Ventana antes de `ts_event_start` | Intervalo máximo |
|---|---|---|
| `closing_decision_window_t_minus_60m` | `[T-60 min, T-0]` | `<= 3.69 min` (`221.15 s`) |
| `matchday_near_kickoff_q00_ws` | `[T-4.4 h, T-60 min)` (`262.4 min`) | `<= 8.57 min` (`514.05 s`) |
| `matchday_window_q10_ws` | `[T-8.5 h, T-4.4 h)` (`509.9 min`) | `<= 11.69 min` (`701.32 s`) |
| `early_week_median_q50_ws` | `> T-8.5 h` | `<= 30.40 min` (`1824.28 s`) |

---

## 4. Reglas legales y `health.json`

1. **Cero evasión anti-bot (Regla #7):** Prohibido usar o activar `solve_cloudflare`, `StealthyFetcher`, rotación de fingerprints o proxies evasivos. Cualquier fuente cuyos ToS prohíban captura automatizada o requiera evasión se clasifica `blocked_pending_owner_decision` en `docs/LEGAL_FUENTES_CUOTAS.md` y queda **excluida** de `cadence_scheduler.py`.
2. **Esquema mínimo de `data/odds_timeseries/health.json`:**
   - `generated_at_utc`: ISO-8601 UTC
   - `capture_status`: `"ok" | "prospective_capture_pending" | "blocked_no_approved_sharp"`
   - `approved_sources`: lista de fuentes `ok` / `api_only`
   - `blocked_sources`: lista de objetos `{ source, status: "blocked_pending_owner_decision", reason }`
   - `events_tracked`: entero
   - `ticks_per_event`: mapa o resumen `{ min, median, max, by_event }`
   - `median_gap_minutes_by_regime`: `{ "T-60m": number | null, "T-4.4h": number | null, "T-8.5h": number | null, "early_week": number | null }`
   - `sharp_coverage`: `{ events_with_sharp: number, total_events: number, ratio: number, books: string[] }`
   - `notes`: explicación honesta (p. ej. ausencia de jornada en vivo durante la ventana del swarm o bloqueo de fuentes).
