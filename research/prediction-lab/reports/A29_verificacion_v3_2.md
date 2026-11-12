# A29 · Auditoría Independiente Red Team — Ciclo `PREDLAB-V3.2`

- **Agente auditor:** `V` (`v-verifier`, Red Team de **solo lectura** de código)
- **Fecha de auditoría (Puerta 1):** `2026-11-12T15:42:00Z` (`OBSERVADO`)
- **Fecha de auditoría (Puerta 2):** `2026-11-12T16:32:00Z` (`OBSERVADO`)
- **Worktrees auditados:**
  1. `C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\prediction-lab` — rama `prediction-lab`, base `f3564a4266c33441db9c2f36714073b7516d37e6`, Puerta 1 `e20e8236e7cb153e271753413e857a6594168f48`, `HEAD` auditado Puerta 2 `adb03138c5da94f6cb2e672ae57440721a52152d` (`OBSERVADO`)
  2. `C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\web-scraping` — rama `web-scraping`, base `3a8b3c0`, `HEAD` auditado `4993a9b6b598aa3fa63be1cb5735975cbd56e35f` (sin cambios en Ola 2, `OBSERVADO`)
- **Veredicto Puerta 1 (Cierre de Ola 1 — `O`, `B1`, `B2`, `B3`, `B4`):** **`PASS`** (`0` defectos abiertos; `9/9` reglas rectoras y `18/18` controles en verde)
- **Veredicto Puerta 2 (Cierre de Ola 2 — `B5`, `B6`, `B8`):** **`PASS`** (`0` defectos abiertos; `9/9` reglas rectoras y `16/16` controles en verde)

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

## 3. Puerta 3 — Auditoría de Ola 3 (`B9`, Cierre Integral `v3.2`)

> Pendiente de ejecución al cierre de Ola 3.
