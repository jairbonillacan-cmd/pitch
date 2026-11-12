# A29 · Auditoría Independiente Red Team — Ciclo `PREDLAB-V3.2`

- **Agente auditor:** `V` (`v-verifier`, Red Team de **solo lectura** de código)
- **Fecha de auditoría (Puerta 1):** `2026-11-12T15:42:00Z` (`OBSERVADO`)
- **Worktrees auditados:**
  1. `C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\prediction-lab` — rama `prediction-lab`, base `f3564a4266c33441db9c2f36714073b7516d37e6`, `HEAD` auditado `1e22b6a902f28a47af83287edb827751839e252f` (`OBSERVADO`)
  2. `C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\web-scraping` — rama `web-scraping`, base `3a8b3c0`, `HEAD` auditado `4993a9b6b598aa3fa63be1cb5735975cbd56e35f` (`OBSERVADO`)
- **Veredicto Puerta 1 (Cierre de Ola 1 — `O`, `B1`, `B2`, `B3`, `B4`):** **`PASS`** (`0` defectos abiertos; `9/9` reglas rectoras y `18/18` controles en verde)

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

## 2. Puerta 2 — Auditoría de Ola 2 (`B5`, `B6`, `B7`, `B8`)

> Pendiente de ejecución al cierre de Ola 2.

---

## 3. Puerta 3 — Auditoría de Ola 3 (`B9`, Cierre Integral `v3.2`)

> Pendiente de ejecución al cierre de Ola 3.
