# A29 · Auditoría Independiente Red Team — Ciclo `PREDLAB-V3.2`

- **Agente auditor:** `V` (`v-verifier`, Red Team de **solo lectura** de código)
- **Fecha de auditoría (Puerta 1):** `2026-11-12T15:42:00Z` (`OBSERVADO`)
- **Fecha de auditoría (Puerta 2):** `2026-11-12T16:32:00Z` (`OBSERVADO`)
- **Fecha de auditoría (Puerta 3 — Cierre de Ciclo):** `2026-11-12T18:45:00Z` (`OBSERVADO`)
- **Worktrees auditados:**
  1. `C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\prediction-lab` — rama `prediction-lab`, base `f3564a4266c33441db9c2f36714073b7516d37e6`, Puerta 1 `e20e8236e7cb153e271753413e857a6594168f48`, Puerta 2 `19453fb257541cf737baaaf651bc3a2c0c3b0fd5`, `HEAD` auditado Puerta 3 `bbfdbc5d1d284e8b623b5b8837db8c3a9723ac9a` (`OBSERVADO`)
  2. `C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\web-scraping` — rama `web-scraping`, base `3a8b3c0`, `HEAD` auditado `4993a9b6b598aa3fa63be1cb5735975cbd56e35f` (sin cambios en Olas 2 y 3, `OBSERVADO`)
- **Veredicto Puerta 1 (Cierre de Ola 1 — `O`, `B1`, `B2`, `B3`, `B4`):** **`PASS`** (`0` defectos abiertos; `9/9` reglas rectoras y `18/18` controles en verde)
- **Veredicto Puerta 2 (Cierre de Ola 2 — `B5`, `B6`, `B8`):** **`PASS`** (`0` defectos abiertos; `9/9` reglas rectoras y `16/16` controles en verde)
- **Veredicto Puerta 3 (Cierre de Ola 3 — `B7`, `B9`):** **`PASS`** (`0` defectos abiertos; `9/9` reglas rectoras y `16/16` controles en verde)
- **Veredicto Global Ciclo `PREDLAB-V3.2` (Puertas 1, 2 y 3):** **`PASS`** (`10/10` bloques `O, B1..B9` auditados, `50/50` controles acumulados en verde, `0` defectos abiertos)

---

## 1. Puerta 1 — Auditoría de Ola 1 (`O`, `B1`, `B2`, `B3`, `B4`)

### 1.1 Tabla Maestra de Controles (`PASS` / `FAIL`)

| ID Control | Regla / Bloque | Verificación Independiente Ejecutada | Estado Epistémico | Veredicto |
| :--- | :--- | :--- | :--- | :--- |
| **G1-R1** | §0 Regla #1 (`O`, `B1`, `B2`, `B4`) | `SHA-256` bit a bit intacto frente a `status/O.json` y `f3564a4` en los 4 artefactos `v3.1` congelados + `engine.ts` + `sealed_holdout_v3_1_eval.json` (`git diff f3564a4..1e22b6a` vacío en todos). | `OBSERVADO` | **`PASS`** |
| **G1-R2** | §0 Regla #2 (`B4`) | Cero lecturas de evaluación sobre `holdout_sealed` (`>= 2025-02-02T17:30:00Z`, `14,163` eventos intactos, `del _sealed_holdout_unused` + `assert_no_holdout_events`). Líneas `1..29` de `holdout_trial_registry.jsonl` idénticas byte a byte a `f3564a4`; línea `#30` con `eval_split == "walk_forward_dev"` y `unlock_holdout == false`. | `OBSERVADO` | **`PASS`** |
| **G1-R3** | §0 Regla #3 (`B2`) | `production_segments_v3_1.json` conserva los `60` segmentos en `production_enabled: false` (`0/60` encendidos). | `OBSERVADO` | **`PASS`** |
| **G1-R4** | §0 Regla #4 (`B1`, `B2`, `B3`) | Eliminada `reconstructExecutionOdds` en `service.ts`; `validateRealMarketQuote` y `validateCausalFreshQuotes` exigen `book` real + `ts_captured` ISO-8601 válido (`market: null`, `valueStatus: "no_market"` si faltan). En `web-scraping`, `0` filas simuladas/falsas en `data/odds_timeseries/` (`total_rows_written: 0`). | `OBSERVADO` | **`PASS`** |
| **G1-R5** | §0 Regla #5 (`B1`, `B2`) | `MatchOutlook` (`outlook.ts`) y `outlook_calibration_v3_2.json` libres de `stake`, `kelly`, `ev`, `value`, `valueStatus`, `tier` y `"pick seguro"`. Sobre los `242` enfrentamientos de `live_matchday_v3_snapshot.json`, `service.ts` emite `0` stakes, `0` fracciones Kelly y `0` edges activos (tanto sin cuotas como inyectando cuotas reales con `ts_captured` ante los `60` segmentos apagados). | `OBSERVADO` | **`PASS`** |
| **G1-R6** | §0 Regla #6 (`B3`, `B4`) | Reportes y artefactos incluyen comandos reproducibles, commits, IC 95% bootstrap determinista (`mulberry32`, `1,000` réplicas, semilla `20261111`), etiquetas `OBSERVADO`/`INFERIDO`/`DESCONOCIDO`, `"no significativa"` cuando el IC 95% cruza `0` (`0` omisiones en `98` segmentos) y `"sin cierre sharp"` explícito en `NFL::moneyline` y `GLOBAL::nfl::moneyline`. | `OBSERVADO` | **`PASS`** |
| **G1-R7** | §0 Regla #7 (`B3`) | `docs/LEGAL_FUENTES_CUOTAS.md` audita las 7 fuentes; `CleanScraplingHttpTransport` usa `FetcherSession(impersonate=None, stealthy_headers=False)`, respeta `robots.txt`, aplica rate-limit + backoff y aborta sin reintentar ante retos Cloudflare (`AntiBotChallengeError`). Cero evasión anti-bot (`solve_cloudflare`, rotación de huellas/proxies); las 5 fuentes `blocked_pending_owner_decision` excluidas del programador activo. | `OBSERVADO` | **`PASS`** |
| **G1-R8** | §0 Regla #8 (`B1`, `B2`, `B3`, `B4`) | Paridad TS↔Python verificada: `mulberry32`/`logit`/`sigmoid`/`DC 13x13` con `max |Δ| = 0.000e+00 < 1e-12`, espejo `outlook_calibration_v3_2.json` idéntico (`SHA-256 = 090cfaa2...`), única implementación de Dixon-Coles en `markets_2way.ts`, paridad `PickLedger`/CLV `< 1e-12`, y las 3 suites completas en verde (`1,145` Vitest + `92` Pytest `prediction-lab` + `7` Pytest `web-scraping`, `0` fallos). | `OBSERVADO` | **`PASS`** |
| **G1-R9** | §0 Regla #9 (`O`, `B1..B4`) | `5` commits en `prediction-lab` (`f3564a4..1e22b6a`) y `1` en `web-scraping` (`3a8b3c0..4993a9b`), todos con formato `feat(v3.2-<ID>): …` en español, propiedad exclusiva respetada (incluidas las autorizaciones explícitas del coordinador en `#7` y `#10`), y `0` archivos tocados en `packages/ui`, `apps/web`, `packages/spacetime` ni repo raíz. | `OBSERVADO` | **`PASS`** |
| **G1-B1a** | `B1` (`math.ts` + imports) | `clamp`, `logit`, `sigmoid`, `normalCdf` y `createMulberry32` centralizados en `src/domain/prediction/math.ts` y consumidos sin duplicados en `outlook.ts`, `clv.ts`, `devig.ts`, `montecarlo.ts`, `multisport.ts`, `nfl_live.ts` y `stale_lines.ts`. | `OBSERVADO` | **`PASS`** |
| **G1-B1b** | `B1` (`outlook.ts`) | `buildMatchOutlook` emite los `11` mercados de fútbol + `topScorelines` (top 3) desde una única llamada a `buildDixonColesScoreMatrix`/`deriveAll2WayMarkets` (`|∑p - 1| < 1e-15`, `|∑p_DC - 2| < 1e-15`), `3` mercados NFL (`moneyline`, `spread`, `totals`), y `probabilityToFairOdds` idéntica punto a punto con `packages/contracts/src/view-models.ts:100-105`. | `OBSERVADO` | **`PASS`** |
| **G1-B2a** | `B2` (Ancla Smarkets + DC) | Corregido el auto-bucle en `service.ts`: `buildSmarkets3WayAnchorProbs` ancla el prior de mercado sobre Smarkets cuando falta cuota `1X2` y cae a `"sports_only"` si Smarkets está ausente; eliminada `dixonColesProbs8` delegando en `markets_2way.ts::buildDixonColesScoreMatrix`. | `OBSERVADO` | **`PASS`** |
| **G1-B2b** | `B2` (`featureCoverage` + constantes) | `featureCoverage: { present, total, ratio }` y `dataQualityFlag: "low_coverage"` cuando `ratio < 0.50` (`4/29` en NFL vivo, `38/113` en fútbol vivo); números mágicos externalizados en `src/data/prediction/service_constants_v3_2.json` con `value`, `origin` y `validation_status` (`"heurística no validada"` donde aplica). | `OBSERVADO` | **`PASS`** |
| **G1-B2c** | `B2` (Tiers `ledger.ts` ↔ `clv_report.py`) | `VALID_PICK_TIERS = ("solido", "valor")` para picks nuevos en TS y Python; `"baseline_v3_0"` y `"especulativo"` restringidos a `LEGACY_PICK_TIERS` para lectura histórica (`fromJsonl` / `from_jsonl`), con paridad de `head_hash` y bootstrap `< 1e-12`. | `OBSERVADO` | **`PASS`** |
| **G1-B3a** | `B3` (Cadencias + esquema `11 + 1`) | `cadence_scheduler.py` lee solo lectura los 4 regímenes de `stale_lines_config.json` (`T-60m <= 221.15s`, `T-4.4h <= 514.05s`, `T-8.5h <= 701.32s`, `early_week <= 1824.28s`), escribe JSONL append-only idempotente en esquema `11 + 1` (`raw_sha256`), y valida `100%` contra `odds_snapshots.py` y `odds.ts`. | `OBSERVADO` | **`PASS`** |
| **G1-B3b** | `B3` (Parsers Smarkets/Codere/APIs) | `parse_smarkets_v3_bundle` une `/v3/events/ + /v3/markets/ + /v3/contracts/ + /v3/quotes/`; `parse_codere_events_payload` exige equipos y `ts_event_start` descartando tokens huérfanos `+240`; `build_canonical_event_id` unifica slugs entre libros (`ws:<sport>:<league>:<YYYYMMDD>:<home_slug>:<away_slug>`). | `OBSERVADO` | **`PASS`** |
| **G1-B4a** | `B4` (Selección causal `pSource`) | `outlook_calibration.py` evalúa las `4` fuentes sobre los `56,649` eventos de `walk_forward_dev` con `dc_rho` y `base_rate` estrictamente pre-pliegue (`ts_event_starts < fold_cut_ts`), eligiendo `blend_v3_1` solo cuando `w_effective > 0.05` y mejora/empata log-loss pre-partido (`5` segmentos: `B1::ah`, `D2::ah`, `EC::ah`, `F1::ah`, `T1::1x2`) y `market_sharp_novig` en los `93` restantes. | `OBSERVADO` | **`PASS`** |
| **G1-B4b** | `B4` (Artefacto `98` segmentos) | `outlook_calibration_v3_2.json` contiene `98` segmentos (`23` ligas fútbol × `4` mercados + `NFL::moneyline` + `5` rollups `GLOBAL`), `10` bins de confiabilidad por segmento (`∑n_bin == n_seg × K`), ECE, log-loss, Brier y RPS con IC 95% bootstrap (`mulberry32`, `1,000` réplicas). | `OBSERVADO` | **`PASS`** |

---

### 1.2 Evidencia Reproducible — Artefactos `v3.1` Congelados y Espejo `v3.2` (`OBSERVADO`)

Comando ejecutado en `C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\prediction-lab` (`HEAD = 1e22b6a`):

```powershell
Set-Location 'C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\prediction-lab'
@(
  'src/data/prediction/production_segments_v3_1.json',
  'src/data/prediction/blend_weights_v3_1.json',
  'src/data/prediction/pick_policy_v3_1.json',
  'src/data/prediction/stale_lines_config.json',
  'src/domain/prediction/engine.ts',
  'services/models/artifacts/sealed_holdout_v3_1_eval.json',
  'services/models/artifacts/outlook_calibration_v3_2.json',
  'src/data/prediction/outlook_calibration_v3_2.json'
) | ForEach-Object { "$( (Get-FileHash -Algorithm SHA256 $_).Hash.ToLower() )  $_" }
git diff f3564a4..1e22b6a -- src/data/prediction/production_segments_v3_1.json src/data/prediction/blend_weights_v3_1.json src/data/prediction/pick_policy_v3_1.json src/data/prediction/stale_lines_config.json src/domain/prediction/engine.ts services/models/artifacts/sealed_holdout_v3_1_eval.json
```

| Archivo | SHA-256 observado | Coincide con `status/O.json` / espejo | Estado |
| :--- | :--- | :--- | :--- |
| `src/data/prediction/production_segments_v3_1.json` | `0bc03bbff96a5d82a1a7858e1e8623bf7bfdb250c546d2773a71d56ed9ada9bc` | Sí (`60/60` en `production_enabled: false`) | `OBSERVADO` · **`PASS`** |
| `src/data/prediction/blend_weights_v3_1.json` | `b29d7a451f6011126997c122778b42ad3239c78337d17c5fa78d550f5c92739b` | Sí (intacto vs `f3564a4`) | `OBSERVADO` · **`PASS`** |
| `src/data/prediction/pick_policy_v3_1.json` | `2359c8f8822ea394a380202c04e0bcd010d1a3fae7c5c25b8c11ebe810bfb7d1` | Sí (intacto vs `f3564a4`) | `OBSERVADO` · **`PASS`** |
| `src/data/prediction/stale_lines_config.json` | `8bcb9c7be93270cde0cac2d58bc19f0381184dd2e769f358dd28334db2a05eac` | Sí (intacto en `prediction-lab` y leído solo lectura en `web-scraping`) | `OBSERVADO` · **`PASS`** |
| `src/domain/prediction/engine.ts` | `9270125c49e81adf57e90c76db07eb95f53ab35a5051e49265b35b80ed0553bc` | Sí (intacto vs `f3564a4`) | `OBSERVADO` · **`PASS`** |
| `services/models/artifacts/sealed_holdout_v3_1_eval.json` | `5c9e550bfd7889e44f674c91cf64cea4c07b4281fc72231b8cadff850309f2dd` | Sí (intacto vs `f3564a4`) | `OBSERVADO` · **`PASS`** |
| `services/models/artifacts/outlook_calibration_v3_2.json` | `090cfaa23d35bdd569ea3a17d0084b6af7b2e99eeb8cdb00b15a8b588654194e` | Espejo Python | `OBSERVADO` · **`PASS`** |
| `src/data/prediction/outlook_calibration_v3_2.json` | `090cfaa23d35bdd569ea3a17d0084b6af7b2e99eeb8cdb00b15a8b588654194e` | Espejo TypeScript idéntico bit a bit | `OBSERVADO` · **`PASS`** |

---

### 1.3 Evidencia Reproducible — Blindaje del Holdout (`Regla #2`, `OBSERVADO`)

- **Verificación de `services/models/artifacts/holdout_trial_registry.jsonl`:**
  - Líneas `1..29` comparadas contra `git show f3564a4:services/models/artifacts/holdout_trial_registry.jsonl`: **idénticas byte a byte** (`OBSERVADO`).
  - Línea `30` (única adición de `B4`, commit `1e22b6a`):
    - `trial_seq`: `30`
    - `phase`: `"ola1_b4_outlook_calibration_v3_2"`
    - `eval_split`: `"walk_forward_dev"`
    - `unlock_holdout`: `false`
    - `config_hash`: `"1373322357b03b6eb6e998ca392eeba6fe17fe0c041323ab494d0dd93ed8226f"`
- **Verificación de código en `services/models/outlook_calibration.py`:**
  - `enforce_walk_forward_dev_only(eval_split, unlock_holdout)` lanza `HoldoutSealedError` ante cualquier intento de pasar `eval_split != "walk_forward_dev"` o `unlock_holdout=True`.
  - Tras particionar en `2025-02-02T17:30:00Z` (`70,812` total → `56,649` en `walk_forward_dev` y `14,163` en `holdout_sealed`), ejecuta `del _sealed_holdout_unused` y valida `assert_no_holdout_events(dev_df, cut_ts)` antes de calcular métricas.

---

### 1.4 Auditoría Detallada por Bloque (`B1`, `B2`, `B3`, `B4`)

#### Bloque `B1` (`b1-outlook`, commit `a33cdc4`)
- **Primitivas compartidas (`src/domain/prediction/math.ts`):** `clamp`, `logit`, `sigmoid`, `normalCdf` y `createMulberry32` centralizadas en un solo módulo; búsqueda estática `Select-String -Path src\domain\prediction\*.ts -Pattern 'function (clamp|logit|sigmoid|normalCdf|createMulberry32)\b'` confirma `0` redefiniciones en `clv.ts`, `devig.ts`, `montecarlo.ts`, `multisport.ts`, `nfl_live.ts`, `stale_lines.ts` y `outlook.ts` (`OBSERVADO`).
- **Panorama multi-mercado sin stake (`src/domain/prediction/outlook.ts`):**
  - `buildMatchOutlook` produce los `11` mercados de fútbol (`1x2`, `double_chance`, `totals_1_5`, `totals_2_5`, `totals_3_5`, `btts`, `dnb`, `ah_-1_0`, `ah_-0_5`, `ah_0_5`, `ah_1_0`) + `topScorelines` (top 3) de una única matriz Dixon-Coles (`markets_2way.ts::buildDixonColesScoreMatrix`, error de suma `< 1e-15`), y los `3` mercados NFL (`moneyline`, `spread`, `totals`).
  - `0` campos prohibidos (`stake`, `kelly`, `ev`, `value`, `valueStatus`, `tier`, `"pick seguro"`).
  - `resolveCalibrationBucket` resuelve contra `src/data/prediction/outlook_calibration_v3_2.json` con paridad exacta `|Δ| = 0.000e+00 < 1e-15` frente a Python (`E0::1x2` bin 4: `empiricalFreq = 0.42265193370165743`, `n = 724`; `NFL::moneyline` bin 6: `benchmarkNote = "nflverse_consensus_novig (sin cierre sharp)"`; fallback determinista a `GLOBAL::<sport>::<market>` y `THEORETICAL_FALLBACK`).

#### Bloque `B2` (`b2-gate`, commit `5f403ae`)
- **Compuerta de producción y prohibición de cuotas sintéticas (`src/domain/prediction/service.ts`):**
  - `0` ocurrencias de `reconstructExecutionOdds` y `0` ocurrencias de `dixonColesProbs8` en todo `src/domain/prediction/*.ts` (`OBSERVADO`).
  - Batería de `242` enfrentamientos sobre `src/data/prediction/live_matchday_v3_snapshot.json`:
    1. Sin cuotas reales: `executableBetsCount = 0`, `activeEdgesCount = 0`, `activeKellyCount = 0`, `activeStakesCount = 0`, `market = null`, `geodesicV2 = null`, `valueStatus = "no_market"` en `242/242` partidos (`OBSERVADO`).
    2. Con cuotas reales + `book = "pinnacle"` + `ts_captured = "2026-11-12T15:00:00Z"`: `executableBetsCount = 0`, `geodesicV2 = null`, `valueStatus = "disabled_segment"` en `242/242` partidos porque los `60` segmentos de `production_segments_v3_1.json` están apagados (`OBSERVADO`).
  - Ancla Smarkets corregida (`buildSmarkets3WayAnchorProbs`): nunca recicla `sportsProbs` como `marketProbs` y cae limpiamente a `activeEngine = "sports_only"` si Smarkets no está presente.
  - Cobertura de imputación explícita: `featureCoverage = { present: 4, total: 29, ratio: 0.1379 }` en NFL vivo y `{ present: 38, total: 113, ratio: 0.3363 }` en fútbol vivo, ambos marcados `dataQualityFlag = "low_coverage"` (`< 0.50`).
  - Constantes externalizadas en `src/data/prediction/service_constants_v3_2.json` (`11` bloques con `value`, `origin`, `validation_status`).
  - Paridad `ledger.ts` ↔ `services/models/clv_report.py`: `VALID_PICK_TIERS = ("solido", "valor")` para picks nuevos, rechazo de `"baseline_v3_0"` y `"especulativo"` fuera de lectura histórica, `head_hash` SHA-256 idéntico y diferencia bootstrap CLV/ROI `< 1e-12` (`OBSERVADO`).

#### Bloque `B3` (`b3-capture`, commits `4993a9b` en `web-scraping` y `48854e8` en `prediction-lab`)
- **Compuerta legal y cero evasión anti-bot (`docs/LEGAL_FUENTES_CUOTAS.md`, `scrapers/sources/*`, `scrapers/cadence_scheduler.py`):**
  - Las `5` fuentes web (`pinnacle`, `smarkets`, `caliente`, `codere`, `action_network`) tienen estado `blocked_pending_owner_decision` con evidencia HTTP/cabeceras observadas y lanzan `SourceBlockedError` sin tocar la red ni entrar al programador activo.
  - Las `2` fuentes `api_only` (`the_odds_api`, `betfair_exchange`) están implementadas sobre REST oficial sin evasión y permanecen inactivas en ausencia de `THE_ODDS_API_KEY` o `BETFAIR_APP_KEY` + `BETFAIR_SESSION_TOKEN` (`MissingCredentialsError`).
  - Inspección `Select-String` sobre `cadence_scheduler.py` y `scrapers/sources/*.py`: **cero** usos activos de `solve_cloudflare`, `StealthyFetcher`, `camoufox`, `undetected` o rotación de huellas (`CleanScraplingHttpTransport` fija explícitamente `impersonate=None, stealthy_headers=False`).
  - `data/odds_timeseries/` contiene únicamente `health.json` (`capture_status: "prospective_capture_pending"`, `total_rows_written: 0`, `stale_lines_config_sha256: "8bcb9c7be93270cde0cac2d58bc19f0381184dd2e769f358dd28334db2a05eac"`): **cero** ticks inventados o simulados (`OBSERVADO`).
  - Integración multi-tick en `tmp_path` validada contra `services/ingest/odds_snapshots.py` y `src/domain/prediction/odds.ts` (`39/39` filas válidas, `0` descartadas, `0` duplicadas).

#### Bloque `B4` (`b4-calibration`, commit `1e22b6a`)
- **Resumen global por familia en `walk_forward_dev` (`< 2025-02-02T17:30:00Z`, `56,649` eventos, IC 95% bootstrap `mulberry32`, `1,000` réplicas, semilla `20261111`, `OBSERVADO`):**

| Segmento Global | `n` | Fuente evaluada en `dev` | Benchmark | ECE `[IC 95%]` | Log-Loss `[IC 95%]` | `ΔLL` vs Benchmark `[IC 95%]` | Significancia / Nota |
| :--- | ---: | :--- | :--- | :--- | :--- | :--- | :--- |
| `GLOBAL::football::1x2` | `51,215` | `market_sharp_novig` (`50,747`) + `blend_v3_1` (`468`) | `pinnacle_sharp_open_novig` | `0.0046` `[0.0042, 0.0080]` | `1.0029` `[0.9985, 1.0073]` | `-0.00001` `[-0.00002, +0.00000]` | `"no significativa"` (IC cruza `0`) |
| `GLOBAL::football::totals` | `50,829` | `market_sharp_novig` | `pinnacle_sharp_open_novig` | `0.0033` `[0.0025, 0.0063]` | `0.6805` `[0.6791, 0.6818]` | `0.00000` `[0.00000, 0.00000]` | `"no significativa"` (IC cruza `0`) |
| `GLOBAL::football::ah` | `50,860` | `market_sharp_novig` (`44,067`) + `blend_v3_1` (`6,793`) | `pinnacle_sharp_open_novig` | `0.0052` `[0.0034, 0.0081]` | `0.6531` `[0.6509, 0.6552]` | `-0.00004` `[-0.00011, +0.00003]` | `"no significativa"` (IC cruza `0`) |
| `GLOBAL::football::btts` | `52,616` | `model` (cuota sharp `DESCONOCIDO`) | `causal_base_rate` | `0.0138` `[0.0091, 0.0189]` | `0.6860` `[0.6848, 0.6872]` | `-0.00537` `[-0.00656, -0.00422]` | `"significativa"` (vs tasa base; sin cierre sharp en BTTS) |
| `GLOBAL::nfl::moneyline` (`NFL::moneyline`) | `3,809` (`3,808` c/consenso) | `model` (`n=3,809`) | `nflverse_consensus_novig (sin cierre sharp)` | `0.0167` `[0.0127, 0.0329]` | `0.6352` `[0.6254, 0.6445]` | `+0.00949` `[+0.00496, +0.01440]` | `"significativa"` a favor del consenso (`"sin cierre sharp"`) |

- **Verificación programática sobre los `98` segmentos de `outlook_calibration_v3_2.json`:** `bad_sig_count = 0` (todo segmento cuyo `delta_ll_ci95` cruza `0` lleva `"no significativa"`), `0` claves prohibidas de apuesta, y `NFL::moneyline` / `GLOBAL::nfl::moneyline` etiquetados explícitamente `"sin cierre sharp"` (`OBSERVADO`).

---

### 1.5 Suites de Pruebas Ejecutadas Independientemente y Propiedad de Archivos (`OBSERVADO`)

#### Suites completas ejecutadas por `V`:
1. **`prediction-lab` — Vitest completo:**
   - Comando: `Set-Location 'C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\prediction-lab'; npx vitest run; git checkout -- evidence/statistical-tests/aztecavet-experiments.json`
   - Resultado: **`59 passed | 1 skipped (60)` archivos, `1,145 passed | 1 skipped (1,146)` tests, `0` fallos** (`24.93s`, `OBSERVADO`).
2. **`prediction-lab` — Pytest completo (`services/models`):**
   - Comando: `Set-Location 'C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\prediction-lab'; .\research\prediction-lab\.venv\Scripts\python.exe -m pytest services/models -v`
   - Resultado: **`92 passed in 22.25s`, `0` fallos** (`OBSERVADO`).
3. **`web-scraping` — Pytest completo (`tests`):**
   - Comando: `Set-Location 'C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\web-scraping'; .\.venv\Scripts\python.exe -m pytest tests -v`
   - Resultado: **`7 passed in 6.78s`, `0` fallos** (`OBSERVADO`).

#### Historial de commits y fronteras de propiedad auditadas:
- **`prediction-lab` (`f3564a4..1e22b6a`):**
  1. `b04e342` — `feat(v3.2-O): congelar contratos y estado base del swarm v3.2` (`O`: `docs/predicciones/20_SWARM_V3_2_GEMINI.md`, `research/prediction-lab/coordination/v3_2/{MASTER.md,CONTRACT_OUTLOOK.md,CONTRACT_ODDS_TIMESERIES.md,status/O.json}`).
  2. `48854e8` — `feat(v3.2-B3): registrar estado y contrato de captura prospectiva legal` (`B3`: `CONTRACT_ODDS_TIMESERIES.md`, `status/B3.json`).
  3. `5f403ae` — `feat(v3.2-B2): blindar compuerta de producción y eliminar cuotas sintéticas` (`B2`: `src/data/prediction/service_constants_v3_2.json`, `src/domain/prediction/{ledger,service,types}.ts`, `services/models/{clv_report,test_clv_report,test_backtest}.py`, `tests/prediction/{service_gate,devig,ledger_clv,multisport_and_v3}.test.ts`, `status/B2.json`; tests preexistentes autorizados explícitamente por `@coordinator` en `#10`).
  4. `a33cdc4` — `feat(v3.2-B1): construir panorama multi-mercado MatchOutlook y primitivas math` (`B1`: `src/domain/prediction/{math,outlook,clv,devig,montecarlo,multisport,nfl_live,stale_lines}.ts`, `tests/prediction/outlook.test.ts`, `CONTRACT_OUTLOOK.md`, `status/B1.json`).
  5. `1e22b6a` — `feat(v3.2-B4): evaluar calibracion walk-forward y publicar artefacto v3.2` (`B4`: `services/models/{outlook_calibration,test_outlook_calibration,test_sealed_holdout_v3_1}.py`, `services/models/artifacts/{outlook_calibration_v3_2.json,holdout_trial_registry.jsonl}`, `src/data/prediction/outlook_calibration_v3_2.json`, `research/prediction-lab/reports/A29_calibracion_publicada.md`, `status/B4.json`; `test_sealed_holdout_v3_1.py` autorizado explícitamente por `@coordinator` en `#7`).
- **`web-scraping` (`3a8b3c0..4993a9b`):**
  1. `4993a9b` — `feat(v3.2-B3): implementar programador de cadencias legal y adaptadores auditados` (`B3`: `data/odds_timeseries/health.json`, `docs/LEGAL_FUENTES_CUOTAS.md`, `scrapers/cadence_scheduler.py`, `scrapers/sources/{__init__,base,betfair,codere,registry,smarkets,team_resolution,the_odds_api}.py`, `tests/test_cadence_scheduler_and_sources.py`).
- **Fronteras intocables verificadas (`git diff f3564a4..1e22b6a -- packages/ui apps/web packages/spacetime`):** `0` archivos modificados; repo raíz (`gemini-reestructura @ 8429a21`) sin tocar (`OBSERVADO`).

### 1.6 Decisión de Puerta 1

- **Veredicto:** **`PASS`**
- **Autorización de avance:** Se aprueba el cierre íntegro de la **Ola 1** (`O`, `B1`, `B2`, `B3`, `B4`). Queda habilitado el arranque de la **Ola 2** (`B5`, `B6`, `B7`, `B8`) conforme a `MASTER.md` §5.3.

---

## 2. Puerta 2 — Auditoría de Ola 2 (`B5`, `B6`, `B8`)

> Nota de alcance: La Ola 2 despachada por `@coordinator` (`#19`–`#25`) comprende los bloques `B5` (`b5-paper`, commit `adb0313`), `B6` (`b6-nfl-sharp`, commit `70e08db`) y `B8` (`b8-snapshot`, commit `96a8f4b`) sobre `prediction-lab` (`e20e823..adb0313`). El worktree `web-scraping` permanece en `4993a9b` (`0` commits nuevos en Ola 2).

### 2.1 Tabla Maestra de Controles — Puerta 2 (`PASS` / `FAIL`)

| ID Control | Regla / Bloque | Verificación Independiente Ejecutada | Estado Epistémico | Veredicto |
| :--- | :--- | :--- | :--- | :--- |
| **G2-R1** | §0 Regla #1 (`B5`, `B6`, `B8`) | `SHA-256` bit a bit intacto en los 4 artefactos `v3.1` congelados (`production_segments_v3_1.json = 0bc03bbff96a5d82a1a7858e1e8623bf7bfdb250c546d2773a71d56ed9ada9bc`, `blend_weights_v3_1.json = b29d7a45...`, `pick_policy_v3_1.json = 2359c8f8...`, `stale_lines_config.json = 8bcb9c7b...`) + `engine.ts` + `sealed_holdout_v3_1_eval.json` + espejo `outlook_calibration_v3_2.json` (`090cfaa2...`). | `OBSERVADO` | **`PASS`** |
| **G2-R2** | §0 Regla #2 (`Holdout`) | `services/models/artifacts/holdout_trial_registry.jsonl` conserva exactamente `30` líneas (`1..29` intactas de `f3564a4`; `#30` de `B4` con `eval_split == "walk_forward_dev"` y `unlock_holdout == false`). **Cero** entradas nuevas `eval_split == "holdout_sealed"` en Ola 2. | `OBSERVADO` | **`PASS`** |
| **G2-R3** | §0 Regla #3 (`Segmentos`) | `production_segments_v3_1.json` mantiene `0/60` segmentos con `production_enabled: true`; `evaluate_nfl_corpus_gate` mantiene `production_enabled = false` en NFL; `picks_v3_2_prospective.jsonl` registra `0/150` picks reales. | `OBSERVADO` | **`PASS`** |
| **G2-R4** | §0 Regla #4 (`Precios reales`) | `B8` filtra estrictamente `0 <= age < 72 h` y `ts_captured <= kickoff_utc` y publica `market: null` en los `130/130` `MatchOutlook` ante `0` ticks reales frescos en `B3`. `B6` rechaza `100%` de consenso `nflverse`/`historical_fd` (`31,196` filas) y `100%` de casas recreativas (`986` filas). `B5` deja vacío el ledger real (`0` bytes) sin inventar ticks. | `OBSERVADO` | **`PASS`** |
| **G2-R5** | §0 Regla #5 (`Sin stake público`) | Escaneo recursivo sobre `src/data/prediction/live_matchday_v3_snapshot.json.outlooks` (`130` partidos): `0` campos de `stake`, `kelly`, `expectedEdge`, `edge`, `ev`, `tier` y `0` apariciones de `"pick seguro"`; `executable_bets_count == 0` en los `242` enfrentamientos heredados. | `OBSERVADO` | **`PASS`** |
| **G2-R6** | §0 Regla #6 (`Evidencia / IC`) | `A29_prospectivo_semana_1.md` y `A29_nfl_sharp_corpus.md` documentan comandos reproducibles, commits, IC 95% bootstrap determinista (`mulberry32`, `1,000` réplicas, semilla `20261111`), etiquetas `"no significativa"` cuando el IC cruza `0` (p. ej. ROI sintético `[-66.67%, +107.02%]` y corpus NFL `n=0 < 64`), `"sin cierre sharp"` donde aplica, y `OBSERVADO`/`INFERIDO`/`DESCONOCIDO`. | `OBSERVADO` | **`PASS`** |
| **G2-R7** | §0 Regla #7 (`Scraping legal`) | `web-scraping` intacto en `4993a9b` (`0` cambios en Ola 2); `B5` y `B8` consumen `..\web-scraping\data\odds_timeseries` en **solo lectura** respetando `capture_status: "prospective_capture_pending"`. | `OBSERVADO` | **`PASS`** |
| **G2-R8** | §0 Regla #8 (`Paridad + Suites`) | Paridad bit a bit SHA-256 (`12/12` `entry_hash` + `head_hash = eaea0bae...`) y `max |Δ| = 0.000e+00 < 1e-12` entre Python (`clv_report.py`) y TypeScript (`ledger.ts` + `clv.ts`); paridad `< 1e-12` de `outlooks` vs `buildMatchOutlook` TS (`max_simplex_error = 4.441e-16`). Suites completas en verde: **`61` archivos / `1,153` tests Vitest** y **`111` tests Pytest**, `0` fallos. | `OBSERVADO` | **`PASS`** |
| **G2-R9** | §0 Regla #9 (`Fronteras / Git`) | `3` commits limpios en `prediction-lab` (`70e08db` `B6`, `96a8f4b` `B8`, `adb0313` `B5`), formato `feat(v3.2-<ID>): …`, propiedad exclusiva por archivo respetada al `100%` y `0` diffs en `packages/ui`, `apps/web`, `packages/spacetime` ni repo raíz. | `OBSERVADO` | **`PASS`** |
| **G2-B5a** | `B5` (`Idempotencia 2x`) | Ejecución doble consecutiva de `run_paper_trading` en directorio temporal tanto en `provenance="real"` (`0` bytes en ambas corridas) como en `provenance="synthetic"` con `settle=True` (`4` picks + `4` cierres + `4` liquidaciones en corrida 1; `0` nuevos / `0` duplicados en corrida 2; `SHA-256 = 70b537b3...` idéntico). | `OBSERVADO` | **`PASS`** |
| **G2-B5b** | `B5` (`Causalidad + 2.0 min`) | `PROSPECTIVE_CUTOFF_UTC = "2026-11-08T20:30:00Z"` filtra eventos/ticks previos; `execution_delay_minutes < 2.0` lanza `PaperTradingCausalityError`; `causal_rows` restringe `ts_captured <= ts_dec`; `resolve_delayed_fill_tick` ignora ticks en `(ts_dec, ts_dec + 2.0 min)` (prueba adversarial `+30s @ 5.00` ignorado, `+120s @ 2.10` llenado). | `OBSERVADO` | **`PASS`** |
| **G2-B5c** | `B5` (`Separación synthetic/real`) | `picks_v3_2_prospective.jsonl` vacío (`0` bytes, `0/150` reales); `picks_v3_2_synthetic_fixture.jsonl` bajo `data/ledger/fixtures/` con `12/12` líneas `"provenance": "synthetic"`; `PaperTradingProvenanceError` bloquea cruzar entradas sintéticas a modo `real` o escribir `synthetic` sobre el ledger prospectivo real. | `OBSERVADO` | **`PASS`** |
| **G2-B6a** | `B6` (`nflverse` + prioridad sharp) | `nfl_sharp_closing.parquet` (`SHA-256 = 178ad932...`, `39` filas × `26` columnas) une `13/13` juegos NFL de `scraped_ws` (`2026-11-09`) con `game_id` oficial de `nflverse` (`2026_10_*` y `2026_11_*`), aplica prioridad estricta `pinnacle` (`0`) > `smarkets` (`1`) con `ts_closing <= ts_event_start` (`100%`) y rechaza toda casa recreativa/consenso. | `OBSERVADO` | **`PASS`** |
| **G2-B6b** | `B6` (`Compuerta < 64`) | `evaluate_nfl_corpus_gate` verifica `n_settled_games_with_sharp_closing = 0 < 64` (y en borde `63 < 64`): `corpus_sufficient_for_eval = false`, `production_enabled = false`, `shortfall_to_eval_gate = 64`; calibración sharp NFL declarada `DESCONOCIDO` y NFL permanece apagado. | `OBSERVADO` | **`PASS`** |
| **G2-B8a** | `B8` (`Snapshot + < 72 h`) | `regenerate_live_snapshot.py --check` pasa (`exit 0`); `live_matchday_v3_snapshot.json` (`SHA-256 = 1dace760...`) conserva los `242` enfrentamientos y `376` equipos heredados y publica `130` `MatchOutlook` (`84` fútbol × `11` mercados + top `3` marcadores; `46` NFL) conformes a `outlook.ts`, rechazando cuotas `>= 72 h`, futuras, post-kickoff o de libros bloqueados. | `OBSERVADO` | **`PASS`** |
| **G2-B8b** | `B8` (`SYNC_NOTES.md`) | `research/prediction-lab/coordination/v3_2/SYNC_NOTES.md` documenta regeneración CLI, verificación `--check`, esquema de `MatchOutlook` y reglas para futuro cableado UI sin modificar `packages/ui`, `apps/web` ni `packages/spacetime`. | `OBSERVADO` | **`PASS`** |

---

### 2.2 Evidencia Reproducible — Artefactos `v3.1` Congelados y Artefactos Nuevos de Ola 2 (`OBSERVADO`)

Comando ejecutado en `C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\prediction-lab` (`HEAD = adb0313`):

```powershell
Set-Location 'C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\prediction-lab'
@(
  'src/data/prediction/production_segments_v3_1.json',
  'src/data/prediction/blend_weights_v3_1.json',
  'src/data/prediction/pick_policy_v3_1.json',
  'src/data/prediction/stale_lines_config.json',
  'src/domain/prediction/engine.ts',
  'services/models/artifacts/sealed_holdout_v3_1_eval.json',
  'services/models/artifacts/outlook_calibration_v3_2.json',
  'src/data/prediction/outlook_calibration_v3_2.json',
  'data/ledger/picks_v3_2_prospective.jsonl',
  'data/ledger/fixtures/picks_v3_2_synthetic_fixture.jsonl',
  'research/prediction-lab/data/processed/nfl_sharp_closing.parquet',
  'src/data/prediction/live_matchday_v3_snapshot.json'
) | ForEach-Object { "$( (Get-FileHash -Algorithm SHA256 $_).Hash.ToLower() )  $_" }
git diff f3564a4..adb0313 -- src/data/prediction/production_segments_v3_1.json src/data/prediction/blend_weights_v3_1.json src/data/prediction/pick_policy_v3_1.json src/data/prediction/stale_lines_config.json src/domain/prediction/engine.ts services/models/artifacts/sealed_holdout_v3_1_eval.json
```

| Archivo | SHA-256 observado | Verificación | Estado |
| :--- | :--- | :--- | :--- |
| `src/data/prediction/production_segments_v3_1.json` | `0bc03bbff96a5d82a1a7858e1e8623bf7bfdb250c546d2773a71d56ed9ada9bc` | Intacto vs `status/O.json` (`0/60` activos) | `OBSERVADO` · **`PASS`** |
| `src/data/prediction/blend_weights_v3_1.json` | `b29d7a451f6011126997c122778b42ad3239c78337d17c5fa78d550f5c92739b` | Intacto vs `f3564a4` | `OBSERVADO` · **`PASS`** |
| `src/data/prediction/pick_policy_v3_1.json` | `2359c8f8822ea394a380202c04e0bcd010d1a3fae7c5c25b8c11ebe810bfb7d1` | Intacto vs `f3564a4` | `OBSERVADO` · **`PASS`** |
| `src/data/prediction/stale_lines_config.json` | `8bcb9c7be93270cde0cac2d58bc19f0381184dd2e769f358dd28334db2a05eac` | Intacto vs `f3564a4` | `OBSERVADO` · **`PASS`** |
| `src/domain/prediction/engine.ts` | `9270125c49e81adf57e90c76db07eb95f53ab35a5051e49265b35b80ed0553bc` | Intacto vs `f3564a4` | `OBSERVADO` · **`PASS`** |
| `services/models/artifacts/sealed_holdout_v3_1_eval.json` | `5c9e550bfd7889e44f674c91cf64cea4c07b4281fc72231b8cadff850309f2dd` | Intacto vs `f3564a4` | `OBSERVADO` · **`PASS`** |
| `services/models/artifacts/outlook_calibration_v3_2.json` | `090cfaa23d35bdd569ea3a17d0084b6af7b2e99eeb8cdb00b15a8b588654194e` | Intacto vs Puerta 1 (`e20e823`) | `OBSERVADO` · **`PASS`** |
| `src/data/prediction/outlook_calibration_v3_2.json` | `090cfaa23d35bdd569ea3a17d0084b6af7b2e99eeb8cdb00b15a8b588654194e` | Espejo TS idéntico bit a bit | `OBSERVADO` · **`PASS`** |
| `data/ledger/picks_v3_2_prospective.jsonl` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | Vacío (`0` bytes, `0/150` picks reales) | `OBSERVADO` · **`PASS`** |
| `data/ledger/fixtures/picks_v3_2_synthetic_fixture.jsonl` | `70b537b3b9beed80d7b6a18e689042271d496c6f15314def049a793a18aa5978` | `12` eslabones sintéticos (`head_hash = eaea0bae...`) | `OBSERVADO` · **`PASS`** |
| `research/prediction-lab/data/processed/nfl_sharp_closing.parquet` | `178ad93241bd2bf004f77cf576a180afbb547ab65b4b28bbc63ad76f06680cae` | `39` filas (`13` juegos NFL × `3` mercados, `pinnacle`) | `OBSERVADO` · **`PASS`** |
| `src/data/prediction/live_matchday_v3_snapshot.json` | `1dace760d68442e73c4b365f85cd16509093716b1bcac72aa1da67b61ec29699` | `242` matchups + `130` `outlooks` (`0` apuestas ejecutables) | `OBSERVADO` · **`PASS`** |

---

### 2.3 Auditoría Detallada por Bloque (`B5`, `B6`, `B8`)

#### Bloque `B5` (`b5-paper`, commit `adb0313`)
- **Runner causal e idempotente (`services/models/paper_trading.py`):**
  - **Corte prospectivo y causalidad estricta (`OBSERVADO`):** Fija `PROSPECTIVE_CUTOFF_UTC = "2026-11-08T20:30:00Z"`, omitiendo todo evento o tick `<= cutoff`. En cada `ts_decision`, `causal_rows = [r for r in ev_rows if r["ts_captured"] <= ts_dec]` garantiza que ningún tick futuro entra en la decisión; `_extract_model_probs_for_market` exige `ts_disponible <= ts_decision`.
  - **Retardo mínimo de ejecución (`execution_delay = 2.0 min`, `OBSERVADO`):** Pasar `execution_delay_minutes = 1.99` lanza `PaperTradingCausalityError`. Sonda adversarial sobre `resolve_delayed_fill_tick` confirma que ante un tick intermedio en `ts_decision + 30s` (`price = 5.00`) y un tick elegible en `ts_decision + 120s` (`price = 2.10`), el runner ignora el tick de `+30s` y ejecuta exactamente en `+120s` (`2.10`).
  - **Idempotencia verificada en doble ejecución (`OBSERVADO`):** Ejecutado `run_paper_trading` 2 veces consecutivas sobre un directorio temporal:
    1. `provenance="real"` contra `..\web-scraping\data\odds_timeseries`: `0` bytes y `n_picks_appended = 0` en ambas corridas (`0` duplicados).
    2. `provenance="synthetic"` con `settle=True` contra `data/ledger/fixtures/synthetic_odds_timeseries_v3_2.jsonl`: corrida 1 emite `4` picks (`tiers` `"solido"` y `"valor"`), `4` cierres sharp (`pinnacle` y fallback `smarkets`) y `4` liquidaciones (`12` registros, `SHA-256 = 70b537b3...`); corrida 2 emite `0` registros nuevos (`0` duplicados) conservando exactamente el mismo `SHA-256`.
  - **Separación estricta de procedencia (`OBSERVADO`):** `verify_ledger_file_provenance` y `load_prospective_timeseries` lanzan `PaperTradingProvenanceError` tanto al pasar insumos bajo `fixtures/` o con `"provenance": "synthetic"` en modo `real` como al intentar escribir modo `synthetic` sobre `data/ledger/picks_v3_2_prospective.jsonl`.
  - **Paridad criptográfica y numérica TS ↔ Python (`OBSERVADO`):** Verificado independientemente ejecutando `clv_report.py` frente a `PickLedger.fromJsonl` + `verifyLedgerIntegrity` + `summarizePicksBootstrap` (`mulberry32`, `1,000` réplicas, semilla `20261111`) sobre el fixture sintético de `12` registros (`4` picks):

| Métrica (`n = 4` picks sintéticos de prueba funcional, **NO evidencia real**) | Python (`clv_report.py`) | TypeScript (`ledger.ts` / `clv.ts`) | `|Δ|` TS↔Py | Etiqueta |
| :--- | ---: | ---: | ---: | :--- |
| `head_hash` (cadena `12` eslabones) | `eaea0bae...6243d6` | `eaea0bae...6243d6` | `0` bits (`12/12` hashes iguales) | `OBSERVADO` |
| `total_stake_u` / `total_pnl_u` | `6.190050 u` / `+1.413851 u` | `6.190050 u` / `+1.413851 u` | `0.000e+00` | `OBSERVADO` |
| `CLV %` medio `[IC 95%]` | `+8.1513%` `[+4.8482%, +10.5119%]` | `+8.1513%` `[+4.8482%, +10.5119%]` | `0.000e+00` | `"significativa_positiva"` (fixture sintético) |
| `CLV prob` medio `[IC 95%]` | `+3.8342 pp` `[+2.2938 pp, +4.8311 pp]` | `+3.8342 pp` `[+2.2938 pp, +4.8311 pp]` | `0.000e+00` | `"significativa_positiva"` (fixture sintético) |
| `ROI` `[IC 95%]` | `+22.8407%` `[-66.6667%, +107.0156%]` | `+22.8407%` `[-66.6667%, +107.0156%]` | `0.000e+00` | `"no significativa"` (IC cruza `0`) |
| `Max Drawdown` `[IC 95%]` | `1.0000 u` `[0.0000 u, 4.0000 u]` | `1.0000 u` `[0.0000 u, 4.0000 u]` | `0.000e+00` | `OBSERVADO` |

#### Bloque `B6` (`b6-nfl-sharp`, commit `70e08db`)
- **Corpus de cierre sharp NFL y compuerta `>= 64` (`services/ingest/nfl_sharp_closing.py`, `research/prediction-lab/data/processed/nfl_sharp_closing.parquet`):**
  - **Rechazo total de consenso y recreativas (`OBSERVADO`):** Excluye el `100%` de filas con `origin != "scraped_ws"` (`31,196` filas de `historical_fd` y consenso `nflverse`) y el `100%` de libros fuera de `ALLOWED_SHARP_BOOKS = ("pinnacle", "smarkets")` (`986` filas de 19 casas recreativas/mercados de predicción como `draftkings`, `fanduel`, `betmgm`, `caliente`, `codere`, `bet365`, `polymarket`, `kalshi`, `action_network`).
  - **Unión exacta con `nflverse` y prioridad `pinnacle` > `smarkets` (`OBSERVADO`):** Resuelve las `32` franquicias NFL (incluyendo reubicaciones históricas y cruce de medianoche UTC en juegos primetime) y une los `13/13` juegos capturados de `pinnacle` (`scraped_ws`, `2026-11-09`) con `game_id` canónico en `data/raw/nflverse/games.csv` (`2026_10_*` y `2026_11_*`), emitiendo `39` filas (`13` × `moneyline`, `spread`, `totals`) × `26` columnas, todas con `closing_book == "pinnacle"` y `ts_closing <= ts_event_start`.
  - **Compuerta de suficiencia honesta (`OBSERVADO` / `DESCONOCIDO`):** `evaluate_nfl_corpus_gate(df)` reporta `n_settled_games_with_sharp_closing = 0 < 64` (`shortfall_to_eval_gate = 64`), fijando `corpus_sufficient_for_eval = false` y `production_enabled = false`. La calibración NFL contra cierre sharp real queda explícitamente declarada `DESCONOCIDO` (`"muestra insuficiente (n=0 < 64; no significativa)"`), manteniendo NFL apagado para picks de valor.

#### Bloque `B8` (`b8-snapshot`, commit `96a8f4b`)
- **Snapshot vivo con `MatchOutlook[]` y guía `SYNC_NOTES.md` (`services/models/regenerate_live_snapshot.py`, `src/data/prediction/live_matchday_v3_snapshot.json`):**
  - **Verificación CLI `--check` y compatibilidad heredada (`OBSERVADO`):** `.\research\prediction-lab\.venv\Scripts\python.exe services/models/regenerate_live_snapshot.py --timeseries-dir ..\web-scraping\data\odds_timeseries --max-quote-age-hours 72 --out src/data/prediction/live_matchday_v3_snapshot.json --check` finaliza con `exit 0` (`status: "ok"`, `max_simplex_error = 4.441e-16 < 1e-12`). Se preservan intactos los `242` `edge_matrix_records`, los `376` `team_master_records` y `executable_bets_count = 0`.
  - **Conformidad con `outlook.ts`, frescura `< 72 h` y cero stakes (`OBSERVADO`):** El bloque `outlooks` publica `130` `MatchOutlook` (`84` fútbol × `11` mercados + top `3` marcadores exactos y `46` NFL) generados directamente mediante `buildMatchOutlook` (`src/domain/prediction/outlook.ts`). El cargador descarta toda cuota con `age >= 72.0 h` (incluida la frontera exacta de `72.0 h`), futura, post-kickoff o de casas prohibidas; como `B3` está en `prospective_capture_pending` (`0` `.jsonl`), los `130/130` partidos llevan `market: null` y `pSource: "model"` sin inventar precios. El escaneo recursivo confirma `0` campos prohibidos (`stake`, `kelly`, `expectedEdge`, `edge`, `ev`, `tier`) y `0` apariciones de `"pick seguro"`.
  - **Nota menor no bloqueante (`OBSERVADO`):** En `research/prediction-lab/coordination/v3_2/SYNC_NOTES.md:18`, una glosa parentética resume `outlook_calibration_v3_2.json` diciendo `"12 segmentos"`, cuando el artefacto real intacto contiene `98` segmentos (`23×4 + 1 + 5`). No afecta código, tests ni artefactos JSON; puede afinarse documentalmente en `B9` si se referencia `SYNC_NOTES.md`.

---

### 2.4 Suites de Pruebas Ejecutadas Independientemente y Propiedad de Archivos — Puerta 2 (`OBSERVADO`)

#### Suites completas ejecutadas por `V`:
1. **`prediction-lab` — Vitest completo:**
   - Comando: `Set-Location 'C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\prediction-lab'; npx vitest run; git checkout -- evidence/statistical-tests/aztecavet-experiments.json`
   - Resultado: **`61 passed | 1 skipped (62)` archivos, `1,153 passed | 1 skipped (1,154)` tests, `0` fallos** (`77.04s`, incluye las nuevas suites `tests/prediction/ledger_prospective.test.ts` y `tests/prediction/live_snapshot_outlooks.test.ts`; `OBSERVADO`).
2. **`prediction-lab` — Pytest completo (`services/models`):**
   - Comando: `Set-Location 'C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\prediction-lab'; .\research\prediction-lab\.venv\Scripts\python.exe -m pytest services/models -v`
   - Resultado: **`111 passed in 82.79s`, `0` fallos** (incluye `test_nfl_sharp_closing.py`, `test_paper_trading.py` y `test_regenerate_live_snapshot.py`; `OBSERVADO`).

#### Historial de commits y fronteras de propiedad auditadas (`e20e823..adb0313`):
- **`prediction-lab` (`e20e823..adb0313`):**
  1. `70e08db` — `feat(v3.2-B6): construir corpus de cierre sharp NFL y compuerta de suficiencia` (`B6`: `services/ingest/nfl_sharp_closing.py`, `services/models/test_nfl_sharp_closing.py`, `research/prediction-lab/data/processed/nfl_sharp_closing.parquet`, `research/prediction-lab/reports/A29_nfl_sharp_corpus.md`, `status/B6.json`).
  2. `96a8f4b` — `feat(v3.2-B8): regenerar snapshot en vivo con MatchOutlook y guia de sincronizacion` (`B8`: `services/models/regenerate_live_snapshot.py`, `services/models/test_regenerate_live_snapshot.py`, `src/data/prediction/live_matchday_v3_snapshot.json`, `tests/prediction/live_snapshot_outlooks.test.ts`, `research/prediction-lab/coordination/v3_2/SYNC_NOTES.md`, `status/B8.json`).
  3. `adb0313` — `feat(v3.2-B5): implementar ledger prospectivo y runner idempotente de paper-trading` (`B5`: `services/models/{paper_trading,test_paper_trading}.py`, `tests/prediction/ledger_prospective.test.ts`, `data/ledger/picks_v3_2_prospective.jsonl`, `data/ledger/fixtures/{picks_v3_2_synthetic_fixture.jsonl,synthetic_model_probs_v3_2.json,synthetic_odds_timeseries_v3_2.jsonl,synthetic_results_v3_2.json}`, `research/prediction-lab/reports/A29_prospectivo_semana_1.md`, `status/B5.json`).
- **`web-scraping` (`4993a9b..HEAD`):** `0` commits nuevos; árbol limpio (`OBSERVADO`).
- **Fronteras intocables verificadas (`git diff f3564a4..adb0313 -- packages/ui apps/web packages/spacetime`):** `0` archivos modificados; repo raíz sin tocar por el swarm (`OBSERVADO`).

### 2.5 Decisión de Puerta 2

- **Veredicto:** **`PASS`**
- **Autorización de avance:** Se aprueba el cierre íntegro de la **Ola 2** (`B5`, `B6`, `B8`). Queda habilitado el avance hacia la **Ola 3** (`B9` y cierre integral del ciclo `v3.2`) conforme a `MASTER.md` §5.3.

---

## 3. Puerta 3 — Auditoría de Ola 3 (`B7`, `B9`)

> Alcance auditado: cierre de la Ola 3 y del ciclo `PREDLAB-V3.2` sobre `prediction-lab` (`19453fb..bbfdbc5`), que comprende `B7` (`b7-xi`, commit `53ff835`, post `#32`) y `B9` (`b9-nfl-epa`, commit `bbfdbc5`, post `#36`). El worktree `web-scraping` permanece intacto en `4993a9b` (`0` cambios en Ola 3).

### 3.1 Tabla Maestra de Controles — Puerta 3 (`PASS` / `FAIL`)

| ID Control | Regla / Bloque | Verificación Independiente Ejecutada | Estado Epistémico | Veredicto |
| :--- | :--- | :--- | :--- | :--- |
| **G3-R1** | §0 Regla #1 (`Congelamiento v3.1`) | `SHA-256` bit a bit intacto en `production_segments_v3_1.json` (`0bc03bbff96a5d82a1a7858e1e8623bf7bfdb250c546d2773a71d56ed9ada9bc`), `blend_weights_v3_1.json` (`b29d7a45...`), `pick_policy_v3_1.json` (`2359c8f8...`), `stale_lines_config.json` (`8bcb9c7b...`), `engine.ts` (`9270125c...`), `model_nfl.json` (`e74ae241...`, blob git `7d8fd0bf...` idéntico a `f3564a4`), `sealed_holdout_v3_1_eval.json` (`5c9e550b...`) y espejo `outlook_calibration_v3_2.json` (`090cfaa2...`). | `OBSERVADO` | **`PASS`** |
| **G3-R2** | §0 Regla #2 (`Holdout sellado`) | Cero lecturas de `holdout_sealed` (`>= 2025-02-02T17:30:00Z`) en `B7` y `B9` (`max_game_date = 2025-01-26` en PBP agregados y `max_gameday = 2025-01-05` en OOF/features NFL). `holdout_trial_registry.jsonl` conserva intactas las líneas `1..29` de `f3564a4`; línea `#30` (`B4`) y línea `#31` (`B9`) llevan `eval_split == "walk_forward_dev"` y `unlock_holdout == false`. `trial_registry_xi.jsonl` (`B7`, `4` líneas) lleva `100%` `walk_forward_dev` y `unlock_holdout == false`. | `OBSERVADO` | **`PASS`** |
| **G3-R3** | §0 Regla #3 (`0/60 activos`) | `production_segments_v3_1.json` mantiene `0/60` segmentos en `production_enabled: true`; `B7` exporta `production_activated: false` en `exp_v32_xi_results.json` y `xi_health.json`; `B9` exporta `"status": "candidate"`, `"production_activated": false` y `"production_enabled": false` en `model_nfl_v3_2_candidate.json`. | `OBSERVADO` | **`PASS`** |
| **G3-R4** | §0 Regla #4 (`Cero datos falsos`) | En `B7`, `0/52,746` partidos en `walk_forward_dev` tienen `ts_xi_published` real → `xi_snapshots.jsonl` no se crea (`fabricated_records: 0`), `xi_collector.py --dry-run` retorna `disk_mutated: false`, y `observed_evaluation` usa `delta = 0.0` separado de `synthetic_sensitivity` (`INFERIDO`). En `B9`, las features semanales ausentes en el snapshot vivo quedan honestamente en `null` (`0` inventos). | `OBSERVADO` | **`PASS`** |
| **G3-R5** | §0 Regla #5 (`Sin stake público`) | Escaneo recursivo sobre `exp_v32_xi_results.json`, `xi_health.json`, `exp_v32_nfl_epa_results.json` y `model_nfl_v3_2_candidate.json`: `0` claves de `stake`, `kelly`, `wager`, `bankroll` y `0` ocurrencias de `"pick seguro"`; `service.ts::predictLiveEdgeMatrix` con el candidato `v3.2` emite `executableBetsCount == 0`. | `OBSERVADO` | **`PASS`** |
| **G3-R6** | §0 Regla #6 (`Evidencia / IC / Sharp`) | `A29_xi_confirmado.md` y `A29_nfl_epa.md` incluyen comandos reproducibles, commits, IC 95% bootstrap determinista (`mulberry32`, `1,000` réplicas, semilla `20261111`), etiqueta obligatoria `"no significativa"` cuando el IC 95% cruza `0` (`0` omisiones en `B7` ni `B9`, p. ej. `DEV_OOS 2020..2024` `[-0.006492, +0.000129]`), etiqueta explícita `"sin cierre sharp"` en toda comparación contra consenso `nflverse`, y etiquetas `OBSERVADO` / `INFERIDO` / `DESCONOCIDO`. | `OBSERVADO` | **`PASS`** |
| **G3-R7** | §0 Regla #7 (`Scraping legal`) | Escaneo estático sobre `EXP_V32_xi/**` y `EXP_V32_nfl_epa/**`: `0` tokens anti-bot (`solve_cloudflare`, `StealthyFetcher`, `camoufox`, `undetected_chromedriver`, `cloudscraper`, `puppeteer-extra`, `impersonate=`). En `B7`, las `5` fuentes web sin licencia comercial están bloqueadas (`XISourceBlockedError`) y las `2` `api_only` permanecen inactivas sin credenciales. En `B9`, ingesta estática `nflverse-data` bajo licencia `CC BY 4.0` / `MIT`. | `OBSERVADO` | **`PASS`** |
| **G3-R8** | §0 Regla #8 (`Paridad + Suites`) | Paridad TS↔Python verificada `< 1e-12`: en `B7`, `max |Δ| = 2.220e-16 < 1e-12` (`ts_parity_bridge.mts` vs `engine.ts`); en `B9`, `max |Δ| = 2.220e-16 < 1e-12` sobre `200` partidos OOF (`ts_parity_probe.ts` vs `engine.ts` + `service.ts`). Suites completas en verde: **`61` archivos / `1,153` tests Vitest** (`0` fallos) y **`120` tests Pytest** (`111` `services/models` + `4` `EXP_V32_xi` + `5` `EXP_V32_nfl_epa`, `0` fallos). | `OBSERVADO` | **`PASS`** |
| **G3-R9** | §0 Regla #9 (`Fronteras / Git < 50 MB`) | `2` commits limpios en `prediction-lab` (`53ff835` `B7`, `bbfdbc5` `B9`), formato `feat(v3.2-<ID>): …`, propiedad exclusiva al `100%`, `0` archivos tocados en `packages/ui`, `apps/web`, `packages/spacetime`, `model_nfl.json` ni `engine.ts`, y tamaño máximo de archivo en git `= 7.96 MB < 50 MB` (`3.60 MB` máx. en `B9`, cachés crudas en `.gitignore`). | `OBSERVADO` | **`PASS`** |
| **G3-B7a** | `B7` (`Guardia causal XI + 2.0 min`) | `CONTRACT_XI_PUBLISHED.md` y `validate_xi_anti_leakage` imponen `ts_xi_published <= ts_captured <= ts_decision - 2.0 min < kickoff_utc` y `ts_fill >= ts_decision + 2.0 min <= kickoff_utc` acoplado al régimen `T-60m` (`[T-75m, T-4m]`, cadencia `<= 3.686 min` de `stale_lines_config.json`), rechazando sondeos en frío sin `published_at` o sin sondeo vacío previo `<= 4.19 min` (`XILeakageError`). | `OBSERVADO` | **`PASS`** |
| **G3-B7b** | `B7` (`Separación observed / synthetic`) | `audit_local_xi_coverage_in_dev` audita `matches.parquet`, `features.parquet` y `web-scraping/data/normalized/roster_availability.json` (`5,908` filas de `2026-11-09..10` → `0` antes de `2025-02-02T17:30:00Z`), evaluando `observed` con `delta = 0.0` (`ΔLL = 0.000000`, `"no significativa"`, efecto real `DESCONOCIDO`) y aislando los `3` estudios paramétricos bajo `provenance = "synthetic_sensitivity"` (`INFERIDO`). | `OBSERVADO` | **`PASS`** |
| **G3-B9a** | `B9` (`Causalidad estricta w' < w`) | `build_causal_epa_dataset` opera en `2` fases estrictas por `gameday` (Fase 1 emite priors `w' < w` verificando `CausalLeakageError`; Fase 2 actualiza acumuladores tras cerrar la fecha); `test_strict_causality_truncation_invariance_w_lt_w` demuestra invarianza `< 1e-12` en semanas `<= 8` de `2024` al truncar semanas `9..18`. | `OBSERVADO` | **`PASS`** |
| **G3-B9b** | `B9` (`Cobertura viva 4/29 -> 34.37/41`) | Sobre los `46` partidos NFL de `live_matchday_v3_snapshot.json` evaluados con `service.ts::predictLiveEdgeMatrix`, `featureCoverage` sube de `4/29` (`13.79%`, `46/46` `"low_coverage"`) en `model_nfl.json` a `34.37/41` (`83.83%`, mín. `34/41 = 82.93%`, `0/46` `"low_coverage"`) en `model_nfl_v3_2_candidate.json`, fijando `live_v3.priors = {w_net_epa: 0, w_net_success_pct: 0}` para evitar doble conteo. | `OBSERVADO` | **`PASS`** |
| **G3-B9c** | `B9` (`Evaluación vs v3.0, consenso y B6`) | En `walk_forward_dev` (`n = 3,891`), `v3_2_epa_logit_41` mejora a `v3.0` vivo `4/29` (`ΔLL = -0.065911`, `"significativa"`) y a `v3.0` histórico `29/29` (`ΔLL = -0.002516`, `"significativa"`), resulta `"no significativa"` en `DEV_OOS 2020..2024` (`ΔLL = -0.003153 [-0.006492, +0.000129]`), pierde ante el consenso `nflverse` (`"sin cierre sharp"`, `ΔLL = +0.013040`), y bloquea evaluación contra cierre sharp de `B6` (`DESCONOCIDO`, `0 < 64` juegos liquidados). | `OBSERVADO` | **`PASS`** |
| **G3-B9d** | `B9` (`Candidato inactivo aislado`) | `src/data/prediction/model_nfl_v3_2_candidate.json` (`SHA-256 = ebf6c3c3...`) se entrega separado con `"status": "candidate"` y `"production_activated": false`, dejando `src/data/prediction/model_nfl.json` intacto bit a bit (`SHA-256 = e74ae241...`). | `OBSERVADO` | **`PASS`** |
| **G3-C1** | Cierre Integral `MASTER.md` §5 | Los `8/8` criterios globales de aceptación de `MASTER.md` §5 se cumplen en los `2` worktrees (`prediction-lab` y `web-scraping`) con trazabilidad reproducible completa en Puertas 1, 2 y 3. | `OBSERVADO` | **`PASS`** |

---

### 3.2 Evidencia Reproducible — Artefactos `v3.1` Congelados y Artefactos Nuevos de Ola 3 (`OBSERVADO`)

Comando ejecutado en `C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\prediction-lab` (`HEAD = bbfdbc5`):

```powershell
Set-Location 'C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\prediction-lab'
@(
  'src/data/prediction/production_segments_v3_1.json',
  'src/data/prediction/blend_weights_v3_1.json',
  'src/data/prediction/pick_policy_v3_1.json',
  'src/data/prediction/stale_lines_config.json',
  'src/domain/prediction/engine.ts',
  'src/data/prediction/model_nfl.json',
  'src/data/prediction/model_nfl_v3_2_candidate.json',
  'services/models/artifacts/sealed_holdout_v3_1_eval.json',
  'services/models/artifacts/holdout_trial_registry.jsonl',
  'services/models/artifacts/outlook_calibration_v3_2.json',
  'src/data/prediction/outlook_calibration_v3_2.json',
  'research/prediction-lab/experiments/EXP_V32_xi/exp_v32_xi_results.json',
  'research/prediction-lab/experiments/EXP_V32_xi/trial_registry_xi.jsonl',
  'research/prediction-lab/experiments/EXP_V32_xi/data/xi_health.json',
  'research/prediction-lab/experiments/EXP_V32_nfl_epa/artifacts/exp_v32_nfl_epa_results.json',
  'research/prediction-lab/experiments/EXP_V32_nfl_epa/artifacts/nfl_pbp_team_game_1999_2024_dev.parquet',
  'research/prediction-lab/experiments/EXP_V32_nfl_epa/artifacts/nfl_pbp_qb_game_1999_2024_dev.parquet',
  'research/prediction-lab/experiments/EXP_V32_nfl_epa/artifacts/nfl_dev_causal_41_features.parquet'
) | ForEach-Object { "$( (Get-FileHash -Algorithm SHA256 $_).Hash.ToLower() )  $_" }
git diff f3564a4..bbfdbc5 -- src/data/prediction/production_segments_v3_1.json src/data/prediction/blend_weights_v3_1.json src/data/prediction/pick_policy_v3_1.json src/data/prediction/stale_lines_config.json src/domain/prediction/engine.ts src/data/prediction/model_nfl.json services/models/artifacts/sealed_holdout_v3_1_eval.json
```

| Archivo | SHA-256 observado | Verificación | Estado |
| :--- | :--- | :--- | :--- |
| `src/data/prediction/production_segments_v3_1.json` | `0bc03bbff96a5d82a1a7858e1e8623bf7bfdb250c546d2773a71d56ed9ada9bc` | Intacto vs `status/O.json` (`0/60` activos) | `OBSERVADO` · **`PASS`** |
| `src/data/prediction/blend_weights_v3_1.json` | `b29d7a451f6011126997c122778b42ad3239c78337d17c5fa78d550f5c92739b` | Intacto vs `f3564a4` | `OBSERVADO` · **`PASS`** |
| `src/data/prediction/pick_policy_v3_1.json` | `2359c8f8822ea394a380202c04e0bcd010d1a3fae7c5c25b8c11ebe810bfb7d1` | Intacto vs `f3564a4` | `OBSERVADO` · **`PASS`** |
| `src/data/prediction/stale_lines_config.json` | `8bcb9c7be93270cde0cac2d58bc19f0381184dd2e769f358dd28334db2a05eac` | Intacto vs `f3564a4` | `OBSERVADO` · **`PASS`** |
| `src/domain/prediction/engine.ts` | `9270125c49e81adf57e90c76db07eb95f53ab35a5051e49265b35b80ed0553bc` | Intacto vs `f3564a4` | `OBSERVADO` · **`PASS`** |
| `src/data/prediction/model_nfl.json` | `e74ae241875739d2dc18564f85133d4e20c1d0cef41d64b6f705852601597225` | Intacto vs `f3564a4` (blob git `7d8fd0bf...`) | `OBSERVADO` · **`PASS`** |
| `src/data/prediction/model_nfl_v3_2_candidate.json` | `ebf6c3c3cfe417d57a685f0b574fed212da3f1e58da8568434f82197f5a46158` | Candidato `B9` (`status="candidate"`, `production_activated=false`) | `OBSERVADO` · **`PASS`** |
| `services/models/artifacts/sealed_holdout_v3_1_eval.json` | `5c9e550bfd7889e44f674c91cf64cea4c07b4281fc72231b8cadff850309f2dd` | Intacto vs `f3564a4` | `OBSERVADO` · **`PASS`** |
| `services/models/artifacts/holdout_trial_registry.jsonl` | `058d5d0d9bcaeb97f0415f871b50a7a3279b34ad59dcdcaacf33ac4b4fe8923e` | `31` líneas (`1..29` intactas; `#30` `B4` y `#31` `B9` en `walk_forward_dev`) | `OBSERVADO` · **`PASS`** |
| `services/models/artifacts/outlook_calibration_v3_2.json` | `090cfaa23d35bdd569ea3a17d0084b6af7b2e99eeb8cdb00b15a8b588654194e` | Espejo Python intacto vs Puerta 1 | `OBSERVADO` · **`PASS`** |
| `src/data/prediction/outlook_calibration_v3_2.json` | `090cfaa23d35bdd569ea3a17d0084b6af7b2e99eeb8cdb00b15a8b588654194e` | Espejo TS idéntico bit a bit | `OBSERVADO` · **`PASS`** |
| `research/prediction-lab/experiments/EXP_V32_xi/exp_v32_xi_results.json` | `c92d51eb5bae01b2e6e8032a521cd34dce87e2ed144145c93d0765a6d0b8a19b` | `B7` (`production_activated=false`, `holdout_sealed_untouched=true`) | `OBSERVADO` · **`PASS`** |
| `research/prediction-lab/experiments/EXP_V32_xi/trial_registry_xi.jsonl` | `6b3ee829a21d407cc1e6579d159f5706518e242f48d01f1889d2ecefd16f7617` | `4` entradas aisladas (`1` `observed`, `3` `synthetic_sensitivity`, `walk_forward_dev`) | `OBSERVADO` · **`PASS`** |
| `research/prediction-lab/experiments/EXP_V32_xi/data/xi_health.json` | `270007d1f5fda9d1dd23f54a37ae0681e4a628f690d2ae623987837172f90dc8` | `idle_no_active_legal_credentials`, `fabricated_records: 0` | `OBSERVADO` · **`PASS`** |
| `research/prediction-lab/experiments/EXP_V32_nfl_epa/artifacts/exp_v32_nfl_epa_results.json` | `c342e22d4a551985d464c5b1bb512bdfdbbc7c58bf1e82be27b36646f760bda0` | Evaluación completa `B9` en `walk_forward_dev` (`n=3,891`) | `OBSERVADO` · **`PASS`** |
| `research/prediction-lab/experiments/EXP_V32_nfl_epa/artifacts/nfl_pbp_team_game_1999_2024_dev.parquet` | `279e52b830881c6a4942a07dcb219900eb9384f74b7871b92e049b88a9dc6038` | `13,974` filas (`3.60 MB < 50 MB`, `max_game_date = 2025-01-26`) | `OBSERVADO` · **`PASS`** |
| `research/prediction-lab/experiments/EXP_V32_nfl_epa/artifacts/nfl_pbp_qb_game_1999_2024_dev.parquet` | `9e5b85f9838f215bc18ad92fbc208db6d2fa5f2cc8440a719497da851ec3e665` | `17,205` filas (`1.12 MB < 50 MB`, `max_game_date = 2025-01-26`) | `OBSERVADO` · **`PASS`** |
| `research/prediction-lab/experiments/EXP_V32_nfl_epa/artifacts/nfl_dev_causal_41_features.parquet` | `7301b3fbc8fb97723a4c297eb8c843492c6e034cbd28b95aa30a17250415f40f` | `6,608` juegos elegibles (`2.70 MB < 50 MB`, `max_gameday = 2025-01-05`) | `OBSERVADO` · **`PASS`** |

---

### 3.3 Auditoría Detallada por Bloque (`B7`, `B9`)

#### Bloque `B7` (`b7-xi`, commit `53ff835`)
- **Contrato y guardia causal anti-fuga (`CONTRACT_XI_PUBLISHED.md`, `xi_collector.py`, `OBSERVADO`):**
  - Implementa literalmente la especificación autoritativa de `#27` (`@coordinator`):
    $$\texttt{ts\_xi\_published} \le \texttt{ts\_captured} \le \texttt{ts\_decision} - 2.0\text{ min} < \texttt{kickoff\_utc}, \qquad \texttt{ts\_fill} \ge \texttt{ts\_decision} + 2.0\text{ min} \le \texttt{kickoff\_utc}$$
    acoplada al régimen `closing_decision_window_t_minus_60m` de `stale_lines_config.json` (`recommended_interval_minutes = 3.685835`, ventana de sondeo `[T-75m, T-4m]`).
  - *Nota de trazabilidad respecto a la glosa resumida en `#37` (`kickoff - 30 min`):* la guardia implementada en `validate_xi_anti_leakage` es paramétrica respecto a `ts_decision` y estrictamente más fuerte en cualquier decisión pre-partido en `T-60m` (`ts_xi_published <= kickoff - 62 min`) o en `T-30m` (`ts_xi_published <= kickoff - 32 min`), exigiendo además que todo sondeo sin `published_at` explícito tenga un sondeo vacío previo a `<= 4.19 min` para no fabricar jamás `ts_xi_published` en arranque en frío (`XILeakageError`).
- **Compuerta legal, cero evasión anti-bot y cero datos falsos (`OBSERVADO`):**
  - Registro legal de `7` fuentes: `2` `api_only` (`api_football`, `football_data_org`, inactivas sin `API_FOOTBALL_KEY` / `FOOTBALL_DATA_API_KEY`) y `5` `blocked_pending_owner_decision` (`espn_site_api`, `sofascore`, `fotmob`, `flashscore`, `rotowire_web`, que lanzan `XISourceBlockedError` incluso en `--dry-run`).
  - Transporte limpio `urllib.request` con `User-Agent: PitchLab-XI-Collector/1.0 (+legal-api-only)` y aborto inmediato ante `401/403/429/503` o cabecera `cf-mitigated`. Sonda CLI independiente `xi_collector.py --dry-run` verificada: `status = "dry_run_no_active_legal_credentials"`, `disk_mutated = false`, `fabricated_records = 0`, y `data/xi_snapshots.jsonl` inexistente.
- **Paridad TS↔Python `< 1e-12` y evaluación honesta en `walk_forward_dev` (`OBSERVADO` / `INFERIDO` / `DESCONOCIDO`):**
  - `test_ts_python_parity_under_1e12` verifica contra `src/domain/prediction/engine.ts` (`ts_parity_bridge.mts`) `max |Δ| = 2.220e-16 < 1e-12` en `computeLineupAvailabilityDelta`, `applyAvailabilityDeltaToProbs`, `predictMotorA` y `predictMotorAWithAvailability` (sin modificar `engine.ts`).
  - En `walk_forward_dev` (`52,746` partidos fútbol `< 2025-02-02T17:30:00Z`, `52,659` pareados con cierre sharp Pinnacle sin vig):
    1. **Corrida empírica honesta (`provenance = "observed"`, `OBSERVADO`):** `0/52,746` partidos con `ts_xi_published` real pre-corte (`roster_availability.json` en `web-scraping` contiene `5,908` registros todos de `2026-11-09..10`) → `delta = 0.0`, `ΔLL(XI vs Base) = 0.000000 [0.000000, 0.000000]` (`"no significativa"`), `ΔLL(XI vs Pinnacle_close) = +0.015208 [+0.013595, +0.016700]` (`"significativa"` a favor de Pinnacle). El efecto causal real en `T-60m` se declara `DESCONOCIDO` y `production_activated: false`.
    2. **Sensibilidad sintética aislada (`provenance = "synthetic_sensitivity"`, `INFERIDO`):** ruido no informativo `σ = 0.12` degrada `ΔLL = +0.001100 [+0.000705, +0.001494]` (`"significativa"`), cota adversarial `|δ| = 0.35` acota el daño máximo a `ΔLL = +0.032993` (`max |Δp| = 0.073133 <= tanh(0.35/4) = 0.087277`), e incluso el oráculo teórico `open -> close` Pinnacle (`ΔLL vs Base = -0.007978`) sigue perdiendo frente al cierre sharp de Pinnacle (`ΔLL vs Pinnacle_close = +0.007230 [+0.005729, +0.008694]`).

#### Bloque `B9` (`b9-nfl-epa`, commit `bbfdbc5`)
- **Ingesta `nflverse` bajo licencia abierta y causalidad estricta `w' < w` (`pbp_ingest.py`, `causal_epa_features.py`, `OBSERVADO`):**
  - Agrega jugadas scrimmage `1999..2024` estrictamente `< 2025-02-02` (`13,974` filas `team_game` y `17,205` filas `qb_game`, `max_game_date = 2025-01-26`, `0` lecturas de `2025+`) desde releases estáticos `CC BY 4.0` / `MIT` de `nflverse-data` sin scraping ni evasión anti-bot, documentando cobertura epistémica por era (`1999..2005` `DESCONOCIDO` en `qb_hit`/`CPOE`; `2006..2024` `100% OBSERVADO`; `ngs_was_pressure` `OBSERVADO` en `2016..2024` con `r = 0.4499` vs proxy `(sack | qb_hit)/dropbacks`).
  - `build_causal_epa_dataset` garantiza causalidad estricta `w' < w` (`gameday' < gameday`) mediante barrido en 2 fases por fecha (Fase 1 emite las `12` features causales pre-kickoff verificando `CausalLeakageError`; Fase 2 actualiza acumuladores EWMA/shrinkage bayesiano solo al terminar todos los partidos del `gameday`). `test_strict_causality_truncation_invariance_w_lt_w` demuestra que truncar las semanas `9..18` de `2024` deja idénticas (`max |Δ| < 1e-12`) las `12` features de las semanas `1..8`.
- **Cobertura en vivo `featureCoverage` y paridad TS↔Python `< 1e-12` (`model_nfl_v3_2_candidate.json`, `ts_parity_probe.ts`, `OBSERVADO`):**
  - `src/data/prediction/model_nfl_v3_2_candidate.json` (`SHA-256 = ebf6c3c3...`) se entrega como candidato inactivo (`"status": "candidate"`, `"production_activated": false`), manteniendo `src/data/prediction/model_nfl.json` intacto bit a bit (`SHA-256 = e74ae241...`) y anulando `live_v3.priors = {"w_net_epa": 0.0, "w_net_success_pct": 0.0}` para evitar doble conteo en `nfl_live.ts`.
  - Ejecución real contra `src/domain/prediction/engine.ts` y `src/domain/prediction/service.ts::predictLiveEdgeMatrix`:
    - Paridad sobre `200` partidos OOF de `walk_forward_dev`: **`max |Δ| = 2.2204e-16 < 1e-12`** (`OBSERVADO`).
    - Cobertura sobre los `46` partidos NFL de `live_matchday_v3_snapshot.json`: sube de **`4/29` (`13.79%`, `46/46` `"low_coverage"`)** en `v3.0` a **`34.37/41` (`83.83%`, mín. `34/41 = 82.93%`, `0/46` `"low_coverage"`, `executableBetsCount = 0`)**, dejando honestamente en `null` las `6..7` variables de calendario semanal no presentes en el snapshot vivo.
- **Evaluación honesta en `walk_forward_dev` (`n = 3,891` no empates, IC 95% bootstrap `mulberry32`, `1,000` réplicas, `OBSERVADO`):**

| Modelo / Comparación (`walk_forward_dev < 2025-02-02T17:30:00Z`) | `n` | Log-Loss / `ΔLL` | IC 95% (`mulberry32`) | ECE / Sub-splits | Significancia / Estado |
| :--- | ---: | ---: | :--- | :--- | :--- |
| `v3_0_live_4_of_29` (línea base viva actual `13.8%` cob.) | `3,891` | `0.687931` | `[0.682976, 0.692830]` | `ECE = 0.0229` | Línea base viva `v3.0` (`OBSERVADO`) |
| `v3_0_logit_29` (línea base histórica `29/29`) | `3,891` | `0.624537` | `[0.614308, 0.634131]` | `ECE = 0.0189` · `OOS = 0.6295` | Línea base histórica `v3.0` (`OBSERVADO`) |
| `v3_2_live_35_of_41` (candidato en cobertura viva `83.8%`) | `3,891` | `0.623014` | `[0.612142, 0.632917]` | `ECE = 0.0175` · `OOS = 0.6263` | Mejora `-0.064918` vs `v3.0` vivo (`OBSERVADO`) |
| `v3_2_epa_logit_41` (candidato pre-kickoff `41/41`) | `3,891` | `0.622020` | `[0.611300, 0.631897]` | `ECE = 0.0170` · `OOS = 0.6264` | Candidato `B9` (`status="candidate"`, `OBSERVADO`) |
| Consenso `nflverse` (**`"sin cierre sharp"`**) | `3,890` | `0.609080` | `[0.597081, 0.620236]` | `ECE = 0.0094` | Benchmark consenso (`"sin cierre sharp"`, `OBSERVADO`) |
| `ΔLL` (`v3_2_epa_logit_41` − `v3_0_live_4_of_29`, `dev`) | `3,891` | `-0.065911` | `[-0.075109, -0.056734]` | `100.0%` réplicas `< 0` | `"significativa"` a favor de `v3.2` (`OBSERVADO`) |
| `ΔLL` (`v3_2_epa_logit_41` − `v3_0_logit_29`, `dev`) | `3,891` | `-0.002516` | `[-0.004585, -0.000523]` | `99.4%` réplicas `< 0` | `"significativa"` en `dev` agregado (`OBSERVADO`) |
| `ΔLL` (`v3_2_epa_logit_41` − `v3_0_logit_29`, `DEV_OOS 2020..2024`) | `1,339` | `-0.003153` | `[-0.006492, +0.000129]` | IC cruza `0` (`97.0%` `< 0`) | **`"no significativa"`** (`OBSERVADO`) |
| `ΔLL` (`v3_2_epa_logit_41` − consenso `nflverse`, **`"sin cierre sharp"`**) | `3,890` | `+0.013040` | `[+0.007707, +0.017938]` | `0.0%` réplicas `< 0` | `"significativa"` a favor del consenso (`"sin cierre sharp"`) |
| Calibración vs corpus sharp real `B6` (`nfl_sharp_closing.parquet`) | `0` liq. | `null` | `null` | `13` prospectivos, `0 < 64` liquidados | **`DESCONOCIDO`** (bloqueado hasta `>= 64` liquidados) |

---

### 3.4 Suites de Pruebas Ejecutadas Independientemente y Propiedad de Archivos — Puerta 3 (`OBSERVADO`)

#### Suites completas ejecutadas por `V`:
1. **`prediction-lab` — Vitest completo:**
   - Comando: `Set-Location 'C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\prediction-lab'; npx.cmd vitest run; git checkout -- evidence/statistical-tests/aztecavet-experiments.json`
   - Resultado: **`61 passed | 1 skipped (62)` archivos, `1,153 passed | 1 skipped (1,154)` tests, `0` fallos** (`70.72s`, `OBSERVADO`).
2. **`prediction-lab` — Pytest completo (`services/models` + `EXP_V32_xi` + `EXP_V32_nfl_epa`):**
   - Comando: `$env:PYTHONDONTWRITEBYTECODE='1'; Set-Location 'C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\prediction-lab'; .\research\prediction-lab\.venv\Scripts\python.exe -B -m pytest services/models research/prediction-lab/experiments/EXP_V32_xi research/prediction-lab/experiments/EXP_V32_nfl_epa -v`
   - Resultado: **`120 passed in 106.43s`, `0` fallos** (`111` en `services/models`, `4` en `EXP_V32_xi`, `5` en `EXP_V32_nfl_epa`; `OBSERVADO`).
3. **`web-scraping` — Estado y suite verificada (`4993a9b`):**
   - `git rev-parse HEAD` = `4993a9b6b598aa3fa63be1cb5735975cbd56e35f`, `git status --porcelain` vacío (`7 passed`, `0` cambios desde Puerta 1; `OBSERVADO`).

#### Historial de commits y fronteras de propiedad auditadas (`19453fb..bbfdbc5`):
- **`prediction-lab` (`19453fb..bbfdbc5`):**
  1. `53ff835` — `feat(v3.2-B7): instrumentar contrato legal de XI confirmado y experimento walk-forward` (`B7`: `research/prediction-lab/experiments/EXP_V32_xi/{CONTRACT_XI_PUBLISHED.md,__init__.py,data/xi_health.json,exp_v32_xi_results.json,run_exp_v32_xi.py,test_exp_v32_xi.py,trial_registry_xi.jsonl,ts_parity_bridge.mts,xi_collector.py}`, `research/prediction-lab/reports/A29_xi_confirmado.md`, `research/prediction-lab/coordination/v3_2/status/B7.json` — `11` archivos exclusivos de `B7`).
  2. `bbfdbc5` — `feat(v3.2-B9): construir candidato NFL Minkowski v3.2 con agregados EPA causales` (`B9`: `research/prediction-lab/experiments/EXP_V32_nfl_epa/{.gitignore,__init__.py,pbp_ingest.py,causal_epa_features.py,run_experiment.py,ts_parity_probe.ts,test_exp_v32_nfl_epa.py,artifacts/*}`, `src/data/prediction/model_nfl_v3_2_candidate.json`, `services/models/artifacts/holdout_trial_registry.jsonl`, `research/prediction-lab/reports/A29_nfl_epa.md`, `research/prediction-lab/coordination/v3_2/status/B9.json` — `19` archivos exclusivos de `B9`).
- **Fronteras intocables verificadas (`git diff --name-only f3564a4..bbfdbc5 -- packages/ui apps/web packages/spacetime src/data/prediction/model_nfl.json src/domain/prediction/engine.ts`):** `0` archivos modificados (`OBSERVADO`).

### 3.5 Decisión de Puerta 3

- **Veredicto:** **`PASS`**
- **Autorización de cierre:** Se aprueba el cierre íntegro de la **Ola 3** (`B7`, `B9`) y se habilita el cierre formal del ciclo **`PREDLAB-V3.2`**.

---

## 4. Resumen Global Consolidado — Ciclo `PREDLAB-V3.2` (Puertas 1, 2 y 3)

### 4.1 Matriz de Aceptación Integral (`MASTER.md` §5.1 — `8/8` Criterios)

| # | Criterio Global `MASTER.md` §5.1 | Evidencia Consolidada (`prediction-lab` + `web-scraping`) | Puerta(s) | Veredicto |
| :---: | :--- | :--- | :---: | :---: |
| **1** | **Panorama completo sin stake** (`MatchOutlook` en fútbol `11` mercados + top `3` marcadores y NFL `3` mercados; `market: null` sin cuota real fresca `< 72 h`; `0` campos de stake/kelly) | `src/domain/prediction/outlook.ts` (`B1`) + `live_matchday_v3_snapshot.json.outlooks` (`130` partidos en `B8`, `84` fútbol + `46` NFL, `0` stakes/kelly, `executable_bets_count = 0`). | Puertas 1 y 2 | **`PASS`** |
| **2** | **Calibración pública honesta** (`outlook_calibration_v3_2.json` con `98` segmentos, ECE/Brier/LL/RPS e IC 95% `mulberry32`; NFL etiquetado `"sin cierre sharp"`) | Espejos Python y TS idénticos bit a bit (`SHA-256 = 090cfaa2...`); `0` omisiones de `"no significativa"` cuando el IC cruza `0`; `NFL::moneyline` y `GLOBAL::nfl::moneyline` marcados `"sin cierre sharp"`. | Puerta 1 | **`PASS`** |
| **3** | **Compuerta de picks infranqueable** (`0/60` segmentos encendidos → `0` picks y `0` stakes; eliminadas cuotas sintéticas y auto-bucle de mercado; `featureCoverage` expuesto) | `production_segments_v3_1.json` intacto (`SHA-256 = 0bc03bbff96a5d82a1a7858e1e8623bf7bfdb250c546d2773a71d56ed9ada9bc`, `0/60`); eliminadas `reconstructExecutionOdds` y `dixonColesProbs8` en `service.ts`. | Puertas 1, 2 y 3 | **`PASS`** |
| **4** | **Captura prospectiva legal** (`cadence_scheduler.py` + fuentes legales auditadas, `0` evasión anti-bot, esquema `11 + 1`) | `web-scraping@4993a9b` (`B3`) y `xi_collector.py` (`B7`): `5` fuentes web bloqueadas hasta decisión legal/comercial, adaptadores `api_only` limpios, `0` filas falsas en `data/odds_timeseries/` y `EXP_V32_xi/data/`. | Puertas 1 y 3 | **`PASS`** |
| **5** | **Paper-trading encadenado SHA-256** (`paper_trading.py` idempotente, `execution_delay >= 2.0 min`, separación `synthetic`/`real`) | `picks_v3_2_prospective.jsonl` vacío (`0/150` reales); fixture sintético de `12` eslabones con paridad `0` bits (`head_hash = eaea0bae...`) y `max |Δ| = 0.0` entre TS y Python. | Puerta 2 | **`PASS`** |
| **6** | **Deuda técnica limpia** (`math.ts` único, Dixon-Coles único en `markets_2way.ts`, tiers `solido`/`valor`, constantes en `service_constants_v3_2.json`) | Verificado estática y dinámicamente en `src/domain/prediction/*.ts` y `services/models/*.py`. | Puerta 1 | **`PASS`** |
| **7** | **Frentes científicos `B6`, `B7`, `B9` honestos** (`walk_forward_dev`, sin reabrir `holdout_sealed` y sin encender nada no probado) | `B6`: `39` filas sharp reales (`13` juegos, `0 < 64` liquidados → `DESCONOCIDO`). `B7`: `0/52,746` XI reales en `dev` → `production_activated = false`. `B9`: cobertura viva NFL `13.8% → 83.8%`, `ΔLL = -0.0659` vs `v3.0` vivo, `"no significativa"` en `OOS 2020..2024`, pierde vs consenso (`"sin cierre sharp"`), exportado como `"candidate"` (`production_activated = false`). | Puertas 2 y 3 | **`PASS`** |
| **8** | **Suites completas en verde y fronteras intactas** | `61` archivos / `1,153` tests Vitest (`0` fallos) + `120` tests Pytest `prediction-lab` (`0` fallos) + `7` tests Pytest `web-scraping` (`0` fallos); `0` cambios en `packages/ui`, `apps/web`, `packages/spacetime` ni artefactos congelados `v3.1`. | Puertas 1, 2 y 3 | **`PASS`** |

### 4.2 Registro Consolidado de Commits Auditados (`PREDLAB-V3.2`)

| Ola / Puerta | Worktree | Commit | Agente | Resumen verificado |
| :--- | :--- | :--- | :---: | :--- |
| Ola 1 | `prediction-lab` | `b04e342` | `O` | Contratos maestros (`MASTER.md`, `CONTRACT_OUTLOOK.md`, `CONTRACT_ODDS_TIMESERIES.md`, `20_SWARM_V3_2_GEMINI.md`) y hashes base (`status/O.json`). |
| Ola 1 | `web-scraping` | `4993a9b` | `B3` | Auditoría legal de `7` fuentes, `cadence_scheduler.py` acoplado a `stale_lines_config.json` y adaptadores limpios sin evasión anti-bot. |
| Ola 1 | `prediction-lab` | `48854e8` | `B3` | Registro de contrato y estado de captura prospectiva (`prospective_capture_pending`, `0` filas falsas). |
| Ola 1 | `prediction-lab` | `5f403ae` | `B2` | Compuerta dura `production_segments_v3_1.json` (`0/60`), eliminación de cuotas sintéticas, ancla Smarkets, `featureCoverage`, `service_constants_v3_2.json` y tiers `solido`/`valor`. |
| Ola 1 | `prediction-lab` | `a33cdc4` | `B1` | Primitivas centralizadas `math.ts` y constructor puro `MatchOutlook` (`11` mercados fútbol + top `3` marcadores y `3` mercados NFL sin stake). |
| Ola 1 | `prediction-lab` | `1e22b6a` | `B4` | Evaluación walk-forward causal (`56,649` eventos `< 2025-02-02T17:30:00Z`, trial `#30`) y publicación de `outlook_calibration_v3_2.json` (`98` segmentos). |
| **Puerta 1** | `prediction-lab` | `e20e823` | **`V`** | **Auditoría Red Team de Ola 1 — `PASS` (`18/18` controles).** |
| Ola 2 | `prediction-lab` | `70e08db` | `B6` | Corpus `nfl_sharp_closing.parquet` (`39` filas `pinnacle`, `13` juegos unidos a `nflverse`) y compuerta `n_settled = 0 < 64` (`DESCONOCIDO`). |
| Ola 2 | `prediction-lab` | `96a8f4b` | `B8` | Regeneración de `live_matchday_v3_snapshot.json` con `130` `MatchOutlook` (`< 72 h`, `market: null`, `0` stakes) y `SYNC_NOTES.md`. |
| Ola 2 | `prediction-lab` | `adb0313` | `B5` | Runner idempotente `paper_trading.py` (`delay >= 2.0 min`), ledger prospectivo real vacío (`0/150`) y fixture sintético con paridad SHA-256 TS↔Py. |
| **Puerta 2** | `prediction-lab` | `19453fb` | **`V`** | **Auditoría Red Team de Ola 2 — `PASS` (`16/16` controles).** |
| Ola 3 | `prediction-lab` | `53ff835` | `B7` | Contrato `CONTRACT_XI_PUBLISHED.md`, colector legal `xi_collector.py` y experimento `EXP_V32_xi` (`0/52,746` reales en `dev`, `production_activated = false`). |
| Ola 3 | `prediction-lab` | `bbfdbc5` | `B9` | Pipeline PBP `nflverse` causal `w' < w` (`41` features, trial `#31`), salto de cobertura viva NFL `13.8% → 83.8%` y `model_nfl_v3_2_candidate.json` inactivo. |

### 4.3 Compuertas Prospectivas Pendientes Fuera de Este Ciclo (Estado Honesto al Cierre de `v3.2`)

1. **Activación de captura multi-tick en vivo (`B3` / `B7`):** requiere aprovisionar credenciales oficiales (`THE_ODDS_API_KEY` o `BETFAIR_APP_KEY` + `BETFAIR_SESSION_TOKEN` para cuotas en `web-scraping`; `API_FOOTBALL_KEY` o `FOOTBALL_DATA_API_KEY` para alineaciones confirmadas XI) o autorización legal expresa del propietario sobre fuentes hoy `blocked_pending_owner_decision`.
2. **Validación prospectiva de valor en fútbol (`B5`):** `production_segments_v3_1.json` permanece en `0/60` activos hasta acumular `>= 150` picks prospectivos reales con `CLV` medio `> 0` cuyo IC 95% bootstrap (`mulberry32`) no cruce `0` (`MASTER.md` §1.1 / Hoja de Ruta V4 §10).
3. **Evaluación NFL contra cierre sharp real (`B6` / `B9`):** `model_nfl_v3_2_candidate.json` permanece en `"status": "candidate"` (`production_activated: false`) y NFL sigue apagado para picks de valor hasta acumular `>= 64` juegos NFL liquidados con cierre sharp real (`pinnacle` / `smarkets`) en `nfl_sharp_closing.parquet`.
