# A28 · Auditoría Red Team Transversal del Swarm (`a9-verifier`)

> **Rol:** Agente `A9` (`a9-verifier`) — Verificador Red Team estrictamente *read-only* sobre el código de `A1`–`A8`.
> **Rama / Worktree:** `prediction-lab` (`.worktrees/prediction-lab`, base `263857ad985edf8f76e8eff940a7a8753def05b2`).

---

## Ola 1 — Puerta 1 (Infraestructura de Verdad: Datos de Cuotas, Ledger/CLV y Arnés Walk-Forward)

- **Fecha de auditoría:** `2026-11-11`
- **Veredicto de Puerta 1:** **APROBADA (`PASS` — 0 defectos bloqueantes, 0 fugas temporales, holdout 20% 100% sellado)**
- **Commits auditados:**
  - `e41f463` (`a2-ledger`): `feat(prediction): implementar ledger inmutable de picks y tracker de CLV con bootstrap`
  - `c96c7b3` (`a1-odds`): `feat(cuotas): construir snapshots unificados y resolucion estricta de cierre sharp`
  - `a852528` (`a3-backtest`): `feat(backtest): implementar arnes walk-forward anti-fuga y linea base v3.0`

---

### 1. Auditoría Red Team de `a1-odds` (`c96c7b3`)

**Archivos auditados (100% inspeccionados en lectura):**
`services/ingest/__init__.py`, `services/ingest/odds_snapshots.py`, `services/models/test_odds_snapshots.py`, `src/domain/prediction/odds.ts`, `tests/prediction/odds.test.ts`, `services/models/artifacts/odds_coverage_report.json`, `research/prediction-lab/reports/A28_a1_odds_coverage.md` y verificación empírica independiente sobre `research/prediction-lab/data/processed/odds_snapshots.parquet`.

| Control Red Team | Estado | Evidencia Verificada por `a9-verifier` |
|---|---|---|
| Esquema exacto de 11 columnas requeridas | **PASS** | `REQUIRED_SNAPSHOT_COLUMNS` idéntico en Python y TS (`event_id`, `sport`, `league`, `market`, `line`, `selection`, `book`, `price_decimal`, `ts_captured`, `ts_event_start`, `source`) + metadato `snapshot_stage` (`open` \| `intraday` \| `close`). |
| Rango estricto `[1.01, 1000.0]` | **PASS** | `MIN_DECIMAL_PRICE = 1.01`, `MAX_DECIMAL_PRICE = 1000.0` validados en Python y TS. Escaneo independiente sobre las `5,442,989` filas del Parquet: `min = 1.01`, `max = 251.0` (`0` fuera de rango, `0` nulos). |
| Deduplicación por llave natural y filtro pre-kickoff | **PASS** | Llave natural `(event_id, market, line, selection, book, ts_captured, source)` con `keep='last'`. Escaneo independiente sobre las `5,442,989` filas: `0` duplicados globales y `100%` con `ts_captured <= ts_event_start` (`1,077` ticks post-kickoff y `1,434` duplicados descartados en `scraped_ws`). |
| Detección de huecos estrictamente `> 60 min` | **PASS** | `detect_capture_gaps` (Python) y `detectOddsCaptureGaps` (TS) exigen `gap_seconds > 3600.0` (exactamente `3600s` no dispara falso positivo; `3601s` sí se reporta). Detectados `175` huecos intradía en `scraped_ws` y `557,065` pares `open->close` (`24h`) en `historical_fd`. |
| Política estricta de cuota de cierre (`historical_fd`) | **PASS** | Usa **exclusivamente** `pinnacle` en `snapshot_stage == "close"` (`ts_captured == ts_event_start - 1s`). **Nunca** usa `open` de Pinnacle (`-86400s`) como cierre, **nunca** usa `bfe` (Betfair Exchange sin ajuste de comisión) y **nunca** usa casas recreativas (`bet365`, `williamhill`, `bwin`, `interwetten`, `gamebookers`, `vcbet`, `stanjames`, `ladbrokes`, `sportingbet`). En NFL (`nflverse_consensus`), donde el CSV público no identifica casa sharp, marca honestamente `closing_missing=True` en el `100%` (`6,986` eventos). Cobertura global `historical_fd`: `179,252 / 470,673` (`38.08%`) mercados-evento con cierre sharp válido; `291,421` (`61.92%`) con `closing_missing=True`. |
| Política estricta de cuota de cierre (`scraped_ws`) | **PASS** | Toma el último tick pre-partido (`ts_captured <= ts_event_start`) de `pinnacle` y, únicamente si Pinnacle carece de cobertura completa del mercado, cae en fallback a `smarkets`. Cualquier otra casa (`caliente`, `bet365`, `codere`, `draftkings`, `fanduel`, `betmgm`, `caesars`, etc.) queda bloqueada (`closing_missing=True`). Re-ejecución independiente de `resolve_closing_odds` sobre `scraped_ws`: `351 / 1,151` (`30.50%`) resueltos vía `pinnacle`, `800` (`69.50%`) con `closing_missing=True`, `0` casas recreativas infiltradas. |
| De-vigging canónico | **PASS** | Reutiliza `src/domain/prediction/devig.ts` (`shin` por defecto, más `power`, `additive`, `multiplicative`) con paridad numérica verificada entre Python y TS. |

---

### 2. Auditoría Red Team de `a2-ledger` (`e41f463`)

**Archivos auditados (100% inspeccionados en lectura):**
`src/domain/prediction/ledger.ts`, `src/domain/prediction/clv.ts`, `services/models/clv_report.py`, `tests/prediction/ledger_clv.test.ts`, `services/models/test_clv_report.py`.

| Control Red Team | Estado | Evidencia Verificada por `a9-verifier` |
|---|---|---|
| Inmutabilidad real (append-only) y detección de manipulación | **PASS** | En TS, `PickLedger` usa campos privados `#` y `Object.freeze` profundo en cada registro; en Python, `@dataclass(frozen=True)`, vistas inmutables `tuple` y `verify_integrity()` sobre JSONL. Rechaza `pick_id` duplicados (`DuplicatePickError`), nunca muta `PickLedgerEntry` al enlazar `closing` o `settlement`, y encadena hashes SHA-256 (`GENESIS_HASH` de 64 ceros $\rightarrow$ `prev_hash` $\rightarrow$ `entry_hash`) con serialización canónica IEEE-756 hex big-endian idéntica bit a bit entre TS y Python (`LedgerIntegrityError` ante cualquier edición retroactiva). |
| 18 campos obligatorios por pick | **PASS** | Validados al insertar: `pick_id`, `event_id`, `sport`, `league`, `market`, `line`, `selection`, `book`, `price_tomado`, `ts_pick`, `p_modelo`, `p_mercado_sin_margen`, `edge_esperado`, `kelly_fraccion`, `stake_unidades`, `model_version`, `tier`, `data_quality_tier`. |
| Fórmulas exactas de CLV% y CLV en probabilidad | **PASS** | `clv_pct = price_tomado / price_cierre_sin_margen - 1` y `clv_prob = p_cierre_sin_margen - 1 / price_tomado` (con `p_cierre_sin_margen = 1 / price_cierre_sin_margen`). Cuando `closing_missing=True` o el libro de cierre no pertenece a `{pinnacle}` (`historical_fd`) / `{pinnacle, smarkets}` (`scraped_ws`), fuerza `closing_missing=True` y devuelve `null`/`None` en `clv_pct` y `clv_prob` sin inflar ni imputar cierres. |
| Liquidación completa (incluyendo líneas asiáticas de cuarto) | **PASS** | Soporta `win`, `loss`, `push`, `void`, `half_win` (`+0.5 * stake * (price - 1)`) y `half_loss` (`-0.5 * stake`) para hándicaps y totales asiáticos `.25` / `.75`. |
| Bootstrap `>= 1000` remuestreos y paridad TS $\leftrightarrow$ Python | **PASS** | `MIN_BOOTSTRAP_SAMPLES = 1000` obligatorio (lanza error si `< 1000`). PRNG determinista `mulberry32` + cuantiles lineales Tipo 7 implementado de forma idéntica en `clv.ts` y `clv_report.py`. Test dorado cruzado de 9 eslabones verifica hashes SHA-256 idénticos carácter por carácter y métricas bootstrap (`clv_pct`, `clv_prob`, `roi_pct`, `max_drawdown_u` e IC 95%) con `|\Delta| < 10^{-12}`. |

---

### 3. Auditoría Red Team de `a3-backtest` (`a852528`)

**Archivos auditados (100% inspeccionados en lectura):**
`services/models/backtest.py`, `services/models/test_backtest.py`, `services/models/artifacts/baseline_v3_0_backtest.json`, `services/models/artifacts/holdout_trial_registry.jsonl`.

| Control Red Team | Estado | Evidencia Verificada por `a9-verifier` |
|---|---|---|
| Guardia anti-fuga temporal (`DataLeakageError`) + tests explícitos | **PASS** | `_assert_no_feature_or_quote_leakage` y `_assert_pick_causality` verifican explícitamente `ts_disponible <= ts_decision <= ts_event_start` en cada evento/feature y `ts_captured <= ts_decision` en toda cuota de decisión y pick candidato; además `historical_delay_alpha >= 1.0` lanza `DataLeakageError` (prohibido ejecutar a cuota `close`). Tests explícitos `test_leakage_ts_disponible_after_ts_decision_raises`, `test_leakage_decision_quote_ts_captured_after_ts_decision_raises` y `test_leakage_post_kickoff_decision_and_rogue_selector_raise` existen y pasan en `pytest`. |
| Retraso realista de ejecución (`2 min` en multi-tick y `alpha` en 2-puntos) | **PASS** | En `scraped_ws`, llena únicamente en el primer tick disponible con `ts_captured >= ts_decision + 2 min` y `ts_captured <= ts_event_start` (si no existe tick válido post-delay, el pick queda `unfilled` sin inventar fill). En `historical_fd` (2 puntos), interpola en probabilidad implícita `p_exec = (1 - alpha) * (1 / open) + alpha * (1 / close)`, `price_tomado = 1 / p_exec`, con `alpha = 0.05` por defecto y sensibilidad reportada en `alpha = 0.00` y `alpha = 0.10`. |
| Holdout sellado del último 20% temporal + registro de pruebas múltiples | **PASS** | `split_walk_forward_and_holdout` ordena cronológicamente los `70,812` eventos evaluables (`2010-09-09T00:30:00Z` a `2026-11-08T18:00:00Z`) en `56,649` eventos `walk_forward_dev` (`79.9992%`, hasta `2025-02-02T17:00:00Z`) y `14,163` eventos `holdout_sealed` (`20.0008%`, desde `2025-02-02T17:30:00Z`). Evaluar `holdout_sealed` sin `unlock_holdout=True` y justificación explícita lanza `HoldoutSealedError`. `holdout_trial_registry.jsonl` registra las `3` corridas de sensibilidad (`alpha = 0.05`, `0.00`, `0.10`), todas con `eval_split="walk_forward_dev"` y `unlock_holdout=false` (`0` evaluaciones sobre holdout consumidas). |
| Causalidad del reentrenamiento walk-forward | **PASS** | Fútbol reentrena Poisson-Ridge + calibración Platt temporada por temporada usando únicamente partidos previos con `ts_event_start < season_start`; NFL actualiza ratings Elo + escala logística partido a partido estrictamente después de predecir cada encuentro. |
| Reproducibilidad de `baseline_v3_0_backtest.json` | **PASS** | Generado sin cifras manuales por `research/prediction-lab/.venv/Scripts/python.exe services/models/backtest.py --preset baseline_v3_0 --out services/models/artifacts/baseline_v3_0_backtest.json` sobre el commit actual (`seed=20261111`, `bootstrap_samples=1000`). |

#### Resumen auditado de la Línea Base `v3.0` (`walk_forward_dev`, `56,649` eventos; holdout `14,163` intacto)

- **Calibración pareada contra cierre sharp Pinnacle sin margen (Shin):**
  - Fútbol `1x2` pareado (`n = 52,659` eventos; `87` fútbol + `3,891` NFL marcados `closing_missing=True`):
    - `log_loss_model = 1.01137` `[1.00795, 1.01480]` vs `log_loss_closing_novig = 0.99680` `[0.99326, 1.00028]` $\rightarrow$ `Δ log_loss = +0.01457` `[+0.01315, +0.01601]` (**significativa**: el modelo base `v3.0` aún pierde ante el cierre sharp de Pinnacle).
    - `brier_model = 0.60549` `[0.60313, 0.60785]` vs `brier_closing_novig = 0.59564` `[0.59326, 0.59806]` $\rightarrow$ `Δ brier = +0.00985` `[+0.00890, +0.01086]` (**significativa**).
  - NFL `moneyline` sin cierre sharp en `nflverse` (`n = 3,891`, `closing_missing = 3,891`): `log_loss_model = 0.62429` `[0.61398, 0.63454]`, `brier_model = 0.43520` `[0.42601, 0.44466]`.
- **Desempeño económico de la política actual `Geodesic v2.0` (`n_picks = 1,730`, `558` candidatos no llenados):**
  - `alpha = 0.05` (primario): `ROI = +3.24%` (IC 95% `[-5.59%, +12.42%]`, **no significativa**), `CLV% medio = +1.03%` (`[+0.47%, +1.57%]`, **significativa positiva**), `CLV prob = +0.30 pp` (`[+0.17, +0.43 pp]`, **significativa positiva**), `% picks CLV > 0 = 54.74%`, `MaxDD = 0.320u` (`[0.244u, 0.703u]`).
  - `alpha = 0.00` (sensibilidad sin deterioro open$\rightarrow$close): `ROI = +3.57%` (`[-5.26%, +12.78%]`, no significativa), `CLV% medio = +1.41%` (`[+0.82%, +1.98%]`).
  - `alpha = 0.10` (sensibilidad deterioro doble): `ROI = +2.92%` (`[-5.90%, +12.07%]`, no significativa), `CLV% medio = +0.67%` (`[+0.15%, +1.17%]`).

---

### 4. Ejecución Independiente de Suites de Tests y Aislamiento Git

1. **Suite Python (`pytest`):**
   - Comando ejecutado por `a9-verifier`:
     `research\prediction-lab\.venv\Scripts\python.exe -m pytest services/models -v`
   - Resultado: **`31 passed in 34.68s`** (`10` en `test_backtest.py`, `11` en `test_clv_report.py`, `10` en `test_odds_snapshots.py`; `0` fallos).
2. **Suite TypeScript (`vitest`):**
   - Comandos ejecutados por `a9-verifier`:
     - `npx vitest run` (suite completa del repositorio en `.worktrees/prediction-lab`): `51/52` archivos activos en verde en la primera corrida (únicamente el microbenchmark preexistente `montecarlo.test.ts` `< 25ms` marcó `26.20ms` por contención simultánea de lectura Parquet de 5.44M filas).
     - `npx vitest run tests/prediction/` (re-ejecución sin contención de E/S): **`9 passed (9)` archivos, `115 passed (115)` tests** (`odds.test.ts` `10/10`, `ledger_clv.test.ts` `8/8`, `montecarlo.test.ts` `11/11`, `devig.test.ts` `15/15`, `engine.test.ts` `23/23`, `nfl.test.ts` `11/11`, `tactical_skore.test.ts` `26/26`, `multisport_and_v3.test.ts` `7/7`, `fixture_requests.test.ts` `4/4`). Total consolidado: **`52/52` archivos activos (`1,081/1,081` tests activos) en verde**.
3. **Verificación de `git status` y fronteras de worktrees:**
   - `.worktrees/prediction-lab`: `git diff --name-only 263857ad..a852528` contiene exclusivamente los `16` archivos de dominio/modelos/ingesta de `A1`, `A2` y `A3`. **Cero** modificaciones en `packages/ui` ni `apps/web`.
   - `.worktrees/web-scraping`: intacto en `3a8b3c091671ea707e3cf9856757e19047b0e346` (`git status` completamente limpio).
   - Worktree raíz (`PitchLab` / `gemini-reestructura`): intacto por el swarm (`HEAD` permanece en `c63806fafd29f04213a11396147cecce632af7ff`).

**Conclusión de Puerta 1:** La infraestructura de datos de cuotas, ledger inmutable/CLV y backtest walk-forward cumple al 100% las reglas anti-fuga, cierre sharp estricto y aislamiento de holdout. **Puerta 1 queda formalmente APROBADA para abrir Ola 2.**

---

## Ola 2 — Puerta 2 (Mezcla Logit Modelo-Mercado, Calibración De-Vig y Motor de Decisión de Picks v3.1)

- **Fecha de auditoría:** `2026-11-11`
- **Veredicto de Puerta 2:** **APROBADA (`PASS` — 0 defectos bloqueantes, 0 fugas temporales, paridad TS $\leftrightarrow$ Python $< 10^{-12}$, holdout 20% 100% sellado con `9/9` ensayos en `walk_forward_dev`)**
- **Commits auditados:**
  - `5b3df2c` (`a4-blend`): `feat(prediccion): calibrar mezcla logit modelo-mercado y devig walk-forward v3.1`
  - `ce348e0` (`a5-picks`): `feat(picks): implementar motor de decision v3.1 y calibracion walk-forward ola 2`

---

### 1. Auditoría Red Team de `a4-blend` (`5b3df2c`)

**Archivos auditados (100% inspeccionados en lectura):**
`services/models/blend_calibration.py`, `services/models/test_blend_calibration.py`, `src/domain/prediction/blend.ts`, `tests/prediction/blend.test.ts`, `services/models/artifacts/blend_weights_v3_1.json` y `src/data/prediction/blend_weights_v3_1.json` (más verificación causal de `research/prediction-lab/features/ratings_advanced.py`).

| Control Red Team | Estado | Evidencia Verificada por `a9-verifier` |
|---|---|---|
| Comparación walk-forward de 3 métodos de-vig (`proportional`, `power`, `shin`) | **PASS** | En TS (`blend.ts`) reutiliza directamente `devigProportional`, `devigPower`, `devigShin` y `devig2Way` de `src/domain/prediction/devig.ts`; en Python (`blend_calibration.py`) replica la bisección exacta con paridad `\|\Delta\| < 10^{-13}` (contrato `< 10^{-9}`) en mercados de 3 vías (`1x2`) y 2 vías (`moneyline`, `ah`, `ou`/`totals`, `btts`, `dnb`, `spread`). En los `60` segmentos de `walk_forward_dev` (`56,649` eventos primarios, `125,946` evaluaciones segmento-evento `< 2025-02-02T17:30:00Z`), ganadores OOS: `power = 38`, `proportional = 16`, `shin = 6`, con IC 95% bootstrap pareado (`1,000` remuestreos `mulberry32`) y etiqueta `"no significativa"` siempre que la mejora frente a `proportional` cruza `0`. |
| Mezcla unificada en espacio logit (`p_final`) y contracción `n0 = 300` | **PASS** | Fórmula unificada sin discontinuidad entre 2 y 3 vías: `u_k = \sigma(w \cdot \operatorname{logit}(p_{m,k}) + (1 - w) \cdot \operatorname{logit}(p_{\text{mkt},k}))` clipeando entradas a `[10^{-6}, 1 - 10^{-6}]` y renormalizando `p_{\text{final},k} = u_k / \sum_j u_j` (para `K = 2`, `\sigma(a)/(\sigma(a)+\sigma(-a)) \equiv \sigma(a)` verificado analítica y numéricamente con `\|\Delta\| < 10^{-13}` TS $\leftrightarrow$ Python). Aprende `w` en rejilla `0.00..1.00` (paso `0.05`) estrictamente en `< fold_cut_ts` y contrae hacia `0.0` con `w_{\text{shrunk}} = w_{\text{raw}} \cdot (n_{\text{oos}} / (n_{\text{oos}} + 300))`. |
| Regla Rectora #4 (Apagado automático de mercados sin ventaja) | **PASS** | Habilita **únicamente 12 segmentos** (`D2::1x2`, `D2::ah`, `G1::1x2`, `G1::ah`, `G1::totals`, `I1::ah`, `I2::ah`, `N1::ah`, `P1::ah`, `SC0::ah`, `SC1::ah`, `SP2::ah`), todos con `open_quotes_available: true`, `w_effective \in [0.10, 0.35]` y mejora causal OOS real sobre `w = 0` (`open_market_novig`). Apaga **48 segmentos**: `35` por `model_weight_near_zero_w_le_0_05` (incluyendo las 6 ligas Extra sin cuotas `open`), `10` por `walk_forward_causal_blend_does_not_beat_open_market_novig` y `3` en NFL (`moneyline`, `spread`, `totals`) por `insufficient_sharp_closing_benchmark` (`closing_benchmark_available: false`). Segmentos no vistos (p. ej. `NBA::moneyline`) caen en fallback seguro `w_effective = 0, model_picks_enabled = false`. |
| Espejo de artefactos y sello de holdout | **PASS** | `SHA-256 = B29D7A451F6011126997C122778B42AD3239C78337D17C5FA78D550F5C92739B` idéntico byte a byte entre `services/models/artifacts/blend_weights_v3_1.json` y `src/data/prediction/blend_weights_v3_1.json`. `holdout_sealed_untouched: true` (`unlock_holdout=True` lanza `HoldoutSealedError`), y lambdas `dc_lam_home`/`dc_lam_away` verificadas pre-partido antes de actualizar `ad_state`. |

---

### 2. Auditoría Red Team de `a5-picks` (`ce348e0`)

**Archivos auditados (100% inspeccionados en lectura):**
`src/domain/prediction/picks.ts`, `tests/prediction/picks.test.ts`, `services/models/picks_engine.py`, `services/models/test_picks_parity.py`, `services/models/artifacts/pick_policy_v3_1.json`, `src/data/prediction/pick_policy_v3_1.json`, `services/models/artifacts/ola2_picks_backtest_dev.json` y `services/models/artifacts/holdout_trial_registry.jsonl`.

| Control Red Team | Estado | Evidencia Verificada por `a9-verifier` |
|---|---|---|
| Paridad exacta TS $\leftrightarrow$ Python (`evaluatePickCandidates`) y espejo de política | **PASS** | Paridad numérica `\|\Delta\| < 10^{-12}` verificada en vectores dorados entre `src/domain/prediction/picks.ts` y `services/models/picks_engine.py`. `pick_policy_v3_1.json` coincide byte a byte con su espejo TS (`SHA-256 = 2359C8F8822EA394A380202C04E0BCD010D1A3FAE7C5C25B8C11EBE810BFB7D1`) y está sincronizado en los `60` segmentos de `blend_weights_v3_1.json`. |
| Corrección #0 / Puerta de segmento (`A4`) | **PASS** | Rechaza con `"segment_model_picks_disabled"` (`196,627` candidatos rechazados en `walk_forward_dev`) cuando `model_picks_enabled === false`, salvo arbitraje puro autorizado sobre línea recreativa rezagada que supere la probabilidad sin margen contemporánea de `pinnacle`/`smarkets` por `\ge 0.028` (`allow_pure_market_arb: true`, evaluado con `w = 0`). |
| Corrección #1 — Punto de equilibrio estricto y umbrales EV por bucket | **PASS** | Cero uso de `% de acierto` (`raw_hit_rate_used_for_approval: false`). Rechazo inmediato de todo candidato con `p_final <= 1 / price_decimal` (`"below_breakeven"`, `32,464` candidatos). Umbrales empíricos-Bayes calibrados en walk-forward por `league \times market \times odds_bucket` (`short [1.01, 1.65)`, `even [1.65, 2.20)`, `plus [2.20, 2.90)`, `long [2.90, 1000.0]`; `32` niveles distintos de `ev_threshold_solido`, siempre `0 < ev_threshold_solido < ev_threshold_valor`, nunca un `+4%` fijo). |
| Corrección #2 — Eliminación total de `"Tiro de Cuota Alta"` y regla `"solido"` | **PASS** | `PICK_TIERS = ["solido", "valor"]` únicamente (`legacy_tiro_cuota_alta_eliminated: true`). El nivel `"solido"` exige `ev >= ev_threshold_solido` **y** que el segmento tenga `segment_clv_mean > 0` con IC 95% bootstrap `segment_clv_ci95_low > 0` en `walk_forward_dev` (solo `2` segmentos cumplen: `B1::1x2` y `SP2::1x2`; `780` candidatos rechazados por `"solido_clv_ci95_not_positive"`). Cuotas `\ge 2.90` pasan por el filtro calibrado del bucket `"long"` y se dimensionan 100% con Kelly ¼ encogido (`n = 38`, `CLV% = +17.02%`, `ROI = +1.94%`). |
| Corrección #3 — Filtros de dispersión entre submodelos y steam sharp adverso | **PASS** | Calcula `sigma_p = std_pop([p_logit, p_gbm, p_dixon_coles])` y rechaza con `"high_submodel_dispersion"` cuando `sigma_p > 0.06` (`62` candidatos rechazados). Evalúa ticks de probabilidad implícita sharp (`1 tick = 0.005` = `50 bps` en `pinnacle` $\rightarrow$ fallback `smarkets`) en `[ts_decision - 60 min, ts_decision]` y rechaza con `"adverse_sharp_steam"` si `> 3.0` ticks en contra; cualquier cuota con `ts_captured > ts_decision` dispara `PickCausalityError`. |
| Corrección #4 — Kelly ¼ encogido, correlación intra-evento y 4 topes duros | **PASS** | `p_shrunk = max(0, p_final - 0.50 \cdot sigma_p)` (`<= 1 / price_decimal` $\rightarrow$ `"uncertainty_erased_edge"`), `f_quarter = 0.25 \cdot ((p_shrunk \cdot b - (1 - p_shrunk)) / b)`, `stake_raw_u = 100 \cdot f_quarter`. Ordena candidatos del mismo `event_id` por crecimiento logarítmico `g` (máx. 1 pick por `(event_id, market)` y descuento `(1 - \|\rho\|)^k` con `\rho = 0.35` en mercados adicionales del mismo partido, aplicado simultáneamente a `1x2`+`ah`+`totals` en `StatefulBacktestPolicySelector`). Auditoría de los 4 topes duros (`2.0u` pick / `2.0u` `event_id` / `3.0u` `(league, utc_date)` / `5.0u` `utc_date` global): `observed_max_u = [2.0, 2.0, 3.0, 5.0]`, **`n_violations = 0`, `all_caps_respected = true`**. |
| Sello de holdout y registro acumulado de configuraciones | **PASS** | `holdout_trial_registry.jsonl` registra `9` corridas acumuladas (`trial_seq = 1..3` Ola 1; `trial_seq = 4..6` búsqueda walk-forward `wf_cfg1..3`; `trial_seq = 7..9` política congelada `alpha = 0.05 / 0.00 / 0.10`), **el 100% con `eval_split = "walk_forward_dev"` y `unlock_holdout = false`** (`0` accesos al holdout de `14,163` eventos). *(Nota menor no bloqueante: en `ola2_picks_backtest_dev.json`, el sub-bloque auxiliar `comparison_vs_baseline_v3_0` dejó `baseline_*` en `null` por leer la raíz de `baseline_v3_0_backtest.json` en vez de `primary_alpha_0_05`; ambos artefactos primarios contienen las métricas íntegras comparadas abajo).* |

#### Resumen auditado del Motor de Picks `v3.1` en `walk_forward_dev` (`56,649` eventos; holdout `14,163` intacto)

- **Embudo de decisión (`alpha = 0.05`, retraso `2 min`, `trial_seq = 7`):** `240,976` candidatos evaluados $\rightarrow$ `280` aprobados en `ts_decision` $\rightarrow$ **`185` picks ejecutados** (`95` no llenados tras retraso; `30` `"solido"`, `155` `"valor"`).
- **Comparativa contra Línea Base `v3.0` (`primary_alpha_0_05`, `n = 1,730`):**
  - **CLV% medio:** **`+4.97%`** (IC 95% `[+2.82%, +7.35%]`, **significativa positiva**) vs `+1.03%` (`[+0.47%, +1.57%]`) en `v3.0` (**`+3.94 pp`** de mejora en captura de cierre sharp).
  - **CLV prob medio:** **`+1.42 pp`** (`[+0.67, +2.19 pp]`, **significativa positiva**) vs `+0.30 pp` en `v3.0` (**`+1.12 pp`**), `% picks CLV > 0 = 53.26%` (`[46.20%, 60.33%]`).
  - **ROI%:** **`+3.53%`** (`[-12.91%, +20.76%]`, **no significativa**) vs `+3.24%` (`[-5.59%, +12.42%]`) en `v3.0`; `MaxDD = 26.25u` (`[17.61u, 53.63u]`, dimensionado en unidades reales `1u = 1%` de banca).
  - **Desglose por nivel:** `"solido"` (`n = 30`, `0` sin cierre) logra `CLV% = +11.62%` (`[+7.71%, +15.35%]`, **significativa positiva**), `93.33%` picks `CLV > 0`, `ROI = +32.37%` (`[-8.80%, +75.20%]`), `MaxDD = 5.20u`; `"valor"` (`n = 155`, `154` con cierre) logra `CLV% = +3.68%` (`[+1.36%, +6.34%]`, **significativa positiva**), `ROI = -1.62%` (`[-20.04%, +17.42%]`), `MaxDD = 22.94u`.
- **Verificación OOF estrictamente causal (`< fold_cut_ts`, `trial_seq = 6`, umbrales EV y `segment_clv_ci95_low` aprendidos solo en pliegues pasados):** `n = 224` picks, `CLV% = +4.62%` (`[+2.63%, +6.67%]`), `CLV prob = +1.47 pp` (`[+0.87, +2.12 pp]`), `ROI = +17.85%` (`[+4.09%, +33.14%]`), `MaxDD = 16.61u`.
- **Sensibilidad a fricción de ejecución (`historical_delay_alpha`):**
  - `alpha = 0.00` (`trial_seq = 8`): `n = 185`, `CLV% = +5.21%` (`[+2.96%, +7.72%]`, **significativa positiva**), `ROI = +3.67%` (`[-12.87%, +20.86%]`).
  - `alpha = 0.10` (`trial_seq = 9`): `n = 185`, `CLV% = +4.74%` (`[+2.67%, +7.01%]`, **significativa positiva**), `ROI = +3.40%` (`[-12.96%, +20.56%]`).

---

### 3. Ejecución Independiente de Suites de Tests y Aislamiento Git (Puerta 2)

1. **Suite Python (`pytest`):**
   - Comando ejecutado por `a9-verifier`:
     `research\prediction-lab\.venv\Scripts\python.exe -m pytest services/models -v`
   - Resultado: **`52 passed in 5.56s`** (`10` `test_backtest.py`, `10` `test_blend_calibration.py`, `11` `test_clv_report.py`, `10` `test_odds_snapshots.py`, `11` `test_picks_parity.py`; `0` fallos).
2. **Suite TypeScript (`vitest` + `tsc`):**
   - `npx vitest run tests/prediction/`: **`11 passed (11)` archivos, `137 passed (137)` tests** (`blend.test.ts` `13/13`, `picks.test.ts` `9/9`, `odds.test.ts` `10/10`, `ledger_clv.test.ts` `8/8`, `engine.test.ts` `23/23`, `montecarlo.test.ts` `11/11`, `devig.test.ts` `15/15`, `tactical_skore.test.ts` `26/26`, `nfl.test.ts` `11/11`, `multisport_and_v3.test.ts` `7/7`, `fixture_requests.test.ts` `4/4`).
   - `npx vitest run` (suite completa del repositorio): **`54 passed | 1 skipped (55)` archivos, `1,103 passed | 1 skipped (1,104)` tests** (`0` fallos) y **`0` errores `tsc --noEmit` en `prediction/`**.
3. **Verificación de `git status` y fronteras de worktrees:**
   - `.worktrees/prediction-lab`: `git diff --name-only 263857ad..ce348e0` contiene únicamente los `30` archivos autorizados de `A1`–`A5` y `A9` (`0` cambios en `packages/ui` o `apps/web`).
   - `.worktrees/web-scraping`: intacto y limpio en `3a8b3c091671ea707e3cf9856757e19047b0e346`.
   - Worktree raíz (`PitchLab` / `gemini-reestructura`): intacto por el swarm (`HEAD` en `c63806fafd29f04213a11396147cecce632af7ff`).

**Conclusión de Puerta 2:** La calibración de mezcla logit modelo-mercado (`A4`) y el motor de decisión de picks `v3.1` (`A5`) cumplen al 100% sus contratos matemáticos, paridad cruzada `< 10^{-12}`, topes duros de portafolio (`0` violaciones), apagado de segmentos sin ventaja (Regla Rectora #4) y aislamiento estricto del holdout sellado (`9/9` corridas en `walk_forward_dev`). **Puerta 2 queda formalmente APROBADA para abrir Ola 3.**

---

## Ola 3 — Puerta 3 (Mercados 2-Vías Dixon-Coles, Exportación GBM a TS y Detector de Líneas Rezagadas)

- **Fecha de auditoría:** `2026-11-11`
- **Veredicto de Puerta 3:** **APROBADA (`PASS` — 0 defectos vigentes tras remediación `dfbf2e4`, 0 fugas temporales, `24/24` corridas acumuladas en los 4 registros con `unlock_holdout=false`, holdout `14,163` eventos 100% sellado y listo para su única apertura)**
- **Commits auditados:**
  - `732a403` (`a6-markets2w`): `feat(prediction): implementar mercados 2-vias Dixon-Coles y liquidacion asiatica`
  - `6583954` + `dfbf2e4` (`a7-gbm-ts`): `feat(prediction): exportar HistGradientBoosting a TypeScript con paridad <1e-6 y evaluar ensamble v3.1` + `fix(prediction): eliminar tuplas efímeras en gbm.ts y corregir tipo/benchmark en gbm.test.ts`
  - `700dd24` (`a8-stalelines`): `feat(prediction): implementar detector de lineas rezagadas con doble confirmacion y cadencia optima`

---

### 1. Auditoría Red Team de `a6-markets2w` (`732a403`)

**Archivos auditados (100% inspeccionados en lectura):**
`src/domain/prediction/markets_2way.ts`, `tests/prediction/markets_2way.test.ts`, `services/models/markets_2way.py`, `services/models/test_markets_2way.py`, `services/models/artifacts/markets_2way_eval.json`, `src/data/prediction/markets_2way_config.json`, `services/models/artifacts/holdout_registry_a6.jsonl`.

| Control Red Team | Estado | Evidencia Verificada por `a9-verifier` |
|---|---|---|
| Matriz exacta Dixon-Coles y derivación de los 4 mercados de 2 vías | **PASS** | Matriz bivariada `0..max_goals` (`max_goals >= 10` obligatorio, `12` por defecto; rechaza `< 10`) con corrección exacta `PoissonDC._tau_matrix` en `(0,0),(0,1),(1,0),(1,1)` renormalizada a `1.0` (`\|\sum P - 1\| < 10^{-14}`). Deriva `ah` (`-1.0..+1.0`), `dnb` (`=== ah(0.0)` con `p_push` explícito), `totals`/`ou` (`1.5..3.5`) y `btts` (`yes`/`no`). Puente en vivo `markets_2way.test.ts` $\leftrightarrow$ `markets_2way.py` confirma paridad numérica `< 10^{-12}`. |
| Liquidación asiática de 5 estados, EV exacto `.25`/`.75` y Kelly ¼ | **PASS** | Descompone líneas de cuarto (`.25`, `.75`) exactamente 50/50 entre sus dos medias líneas adyacentes (`{p_full_win, p_half_win, p_push, p_half_loss, p_full_loss, p_effective_win}`), calcula `EV = p_fw \cdot (O - 1) + 0.5 \cdot p_hw \cdot (O - 1) - 0.5 \cdot p_hl - p_fl`, resuelve Kelly ¼ exacto de 5 estados por Newton-bisección salvaguardado (`\|G'(f^*)\| < 10^{-14}`) y liquida con `settleAsianLine` 100% compatible con `clv.ts`/`clv_report.py` y `PickLedger`. |
| Causalidad estricta en `dc_rho`, higiene de datos y veredicto honesto (`0/92`) | **PASS** | `dc_rho` se estima por MLE estrictamente con `all_ts_start < cut_ts` en cada `(league, fold_key)` y `_sealed_unused` se elimina inmediatamente sin leerse. Filtra y documenta `256` filas corruptas fuera de rejilla de cuarto en `historical_fd`. Veredicto honesto bajo Regla Rectora #4: **`0 / 92` segmentos habilitados** (`enabled: false` en los `92` segmentos de `markets_2way_config.json`): `23 dnb` + `23 btts` carecen de histórico liquidado (`scraped_ws` solo tiene `112` filas prospectivas en `3` eventos), `12` segmentos Extra en `ah`/`totals` tienen `0` filas, `31` están apagados en `A4` (`w_effective <= 0.05`), `2` (`D2::ah`, `G1::ah`) pierden en log-loss OOS causal frente a `open_novig`, y el único segmento que pasa `A4` (`G1::totals`, `w_eff = 0.10`, `\Delta\text{LL} = -0.000516`) emite **`0` picks OOS ejecutables** (`< 5`) bajo `A3+A5` (`delay = 2 min`, `alpha = 0.05 / 0.00 / 0.10`). |
| Registro aislado de pruebas y sello de holdout | **PASS** | `holdout_registry_a6.jsonl` registra sus `4` corridas (`eval_split = "walk_forward_dev"`, `unlock_holdout = false`) sin contaminar `holdout_trial_registry.jsonl` ni leer el holdout sellado. |

---

### 2. Auditoría Red Team de `a7-gbm-ts` (`6583954` + `dfbf2e4`)

**Archivos auditados (100% inspeccionados en lectura):**
`src/domain/prediction/gbm.ts`, `tests/prediction/gbm.test.ts`, `services/models/export_gbm_ts.py`, `services/models/test_gbm_export.py`, `services/models/train_gbm.py`, `src/data/prediction/gbm_trees_v3_1.json`, `src/data/prediction/gbm_validation_parity.json`, `services/models/artifacts/gbm_eval_v3_1.json`, `services/models/artifacts/holdout_registry_a7.jsonl`. (`src/domain/prediction/engine.ts` verificado **intacto**).

| Control Red Team | Estado | Evidencia Verificada por `a9-verifier` |
|---|---|---|
| Partición temporal causal y bloqueo duro del holdout | **PASS** | `load_dev_soccer_features_strict(unlock_holdout=True)` lanza `HoldoutLeakageGuardError`. Todos los cortes son estrictamente `< 2025-02-02T17:30:00Z`: entrenamiento `< 2023-07-01T00:00:00Z` (`n = 78,575` GBM con `120 \times 3 = 360` árboles, `max_leaf_nodes = 31`, `min_samples_leaf = 80`, `lr = 0.05`; `n = 92,446` Logit compañero), calibración de temperatura (`T = 1.042517`) y peso convexo (`w_logit = 0.707673`, `w_gbm = 0.292327`) en `[2023-07-01, 2024-07-01)` (`n = 8,194`), y validación OOS en `[2024-07-01, 2025-02-02T17:30:00Z)` (`n = 4,785`, cobertura `100%`). |
| Paridad numérica `< 10^{-6}` sobre el 100% de validación (`4,785` partidos) | **PASS** | Verificado sobre el `100%` de los `4,785` partidos de `gbm_validation_parity.json`: `max\|\Delta\| = 9.791 \times 10^{-13}` en GBM crudo, `9.796 \times 10^{-13}` en GBM calibrado, `5.774 \times 10^{-8}` en Logit compañero y **`4.086 \times 10^{-8}` en ensamble `Logit+GBM`** (`\ll 10^{-6}`), soportando `missing_go_to_left` (`NaN`/`null`), `x <= num_threshold` exacto y particiones categóricas `bitset_idx` / `known_cat_bitsets` de 256 bits. |
| Latencia `< 0.1 ms` por partido y ronda Red Team (`#49` $\rightarrow$ `dfbf2e4`) | **PASS** | En la primera revisión sobre `6583954` (`#49`), `a9-verifier` bloqueó Puerta 3 por dos defectos reproducibles: `TS2353` (`y` en literal `SnapshotRow` en `gbm.test.ts:228`) y un pico de `0.1131 ms > 0.1 ms` bajo contención de `58` archivos paralelos en `npx vitest run`. En `dfbf2e4`, `a7-gbm-ts` eliminó toda asignación efímera en el camino caliente de `gbm.ts` (recorrido y mezcla en registros sobre `Float64Array` reutilizable) y midió el mejor de `K = 5` pases completos de los `4,785` partidos tras `2,000` iteraciones de warmup. Re-verificación independiente: **`0` errores `tsc --noEmit`**, **`0.0446 ms` ensamble (`p99 = 0.0636 ms`)** en suite `prediction/` y **`0.0650 ms` ensamble (`p99 = 0.0618 ms`) / `0.0594 ms` GBM (`p99 = 0.0585 ms`)** bajo carga paralela completa del repositorio (`< 0.1 ms`). |
| Honestidad empírica (`production_activated: false`, `engine.ts` intacto) | **PASS** | Aunque en walk-forward global (`n = 52,746`) `Logit+GBM` reduce levemente log-loss (`\Delta\text{LL} = -0.000764`, IC 95% `[-0.001119, -0.000398]`), en OOS 2024–2025 (`n = 4,785`) `\Delta\text{LL} = -0.000221` cruza cero (`[-0.001031, +0.000527]`) y, al aislar picks guiados por modelo (`allow_pure_market_arb = False`), se demuestra una paradoja de composición en el portafolio mixto: **`Logit+GBM` degrada `CLV%` de `+0.61%` (`n = 271`, 4 segmentos) a `-0.85%` (`n = 180`, 1 segmento), `\Delta\text{CLV\%} = -1.46\text{ pp}` (`[-2.70\%, -0.29\%]`)**. Se mantiene apagado en producción (`production_activated: false`) y `engine.ts` no se modifica. |
| Registro aislado de pruebas y sello de holdout | **PASS** | `holdout_registry_a7.jsonl` registra sus `4` corridas (`eval_split = "walk_forward_dev"`, `unlock_holdout = false`) con `0` lecturas del holdout sellado. |

---

### 3. Auditoría Red Team de `a8-stalelines` (`700dd24`)

**Archivos auditados (100% inspeccionados en lectura):**
`src/domain/prediction/stale_lines.ts`, `tests/prediction/stale_lines.test.ts`, `services/models/stale_lines.py`, `services/models/test_stale_lines.py`, `src/data/prediction/stale_lines_config.json`, `services/models/artifacts/stale_lines_report.json`, `services/models/artifacts/holdout_registry_a8.jsonl`.

| Control Red Team | Estado | Evidencia Verificada por `a9-verifier` |
|---|---|---|
| Medición empírica directa sobre `odds_snapshots.parquet` (cero constantes mágicas) | **PASS** | Cero uso de reglas inventadas de `15–20 min`. Audita directamente `scraped_ws` (`11,028` filas válidas pre-kickoff, `109` eventos: `pinnacle` tiene `1,028` filas en `13` eventos NFL con `2` olas `2026-11-09T18:46:13Z` y `20:05:00Z`, brecha mediana intra-serie exacta `78.7833 min = 4727/60` y `68 / 326 = 20.86%` de pares con movimiento; `draftkings`/`fanduel` tienen olas intradía de `49.32 min` y rezago causal de `1,195.10 min` frente a Pinnacle en `244` mercados pareados; `caliente` tiene `3` filas / `0` pares con Pinnacle; `codere` y `smarkets` tienen `0` filas válidas; bajo `delay = 2 min`, `scraped_ws` produce `0` fills ejecutables). En `historical_fd` (`walk_forward_dev < 2025-02-02T17:30:00Z`, `2,502,668` filas), mide convergencia recreativa hacia apertura de Pinnacle **`\beta_{\text{conv}} = 0.5656`** (`n = 114,037` selecciones con brecha significativa; `b365 1x2`: `0.5227 [0.5040, 0.5417]`, confirmación de cierre Pinnacle `0.8888 [0.8773, 0.9006]`). |
| Causalidad UTC al microsegundo, paridad `< 10^{-12}` y topes de portafolio | **PASS** | Verifica `ts_sharp_captured <= ts_decision`, `ts_recreational_captured <= ts_decision`, `ts_decision <= ts_event_start` y `sharp_quotes_1h <= ts_decision` (`StaleLineCausalityError`), frescura máxima del ancla sharp (`<= 180 min`), separación estricta libros sharp (`pinnacle`, `smarkets`) vs recreativos, niveles válidos `["solido", "valor"]`, Kelly ¼ encogido por `sigma_p` y los 4 topes duros (`2.0u / 2.0u / 3.0u / 5.0u`). Puente JSON en vivo `stale_lines.test.ts` $\leftrightarrow$ `stale_lines.py` verifica paridad `< 10^{-12}`. |
| Backtest walk-forward: Doble Confirmación vs señal simple solo-sharp | **PASS** | Evaluado en `run_backtest` (`walk_forward_dev`, `unlock_holdout = False`): **Doble Confirmación** (`stale_prob_margin = 0.02`, `stale_ev_threshold = 0.035`, `tol = 0.06`, `delay = 2 min`, `alpha = 0.05`) ejecuta **`n = 129` picks** (`146` en decisión, `17` no llenados; `13` `"solido"`, `133` `"valor"`), logrando **`CLV% = +10.93%` (`[+8.25%, +13.70%]`, `"significativa_positiva"`)**, **`CLV prob = +3.53 pp` (`[+2.67, +4.37 pp]`, `"significativa_positiva"`)**, `%CLV > 0 = 83.72%`, **`ROI% = +5.30%` (`[-17.89%, +29.51%]`, etiquetado honestamente `"no significativa"`)** y `MaxDD = 19.06u`. Frente al comparador **solo-sharp** (`n = 256`, `CLV% = +7.88% [+6.06%, +9.80%]`, `%CLV > 0 = 75.39%`), la doble confirmación filtra `127` aperturas ruidosas y eleva **`CLV%` en `+3.05 pp`** y **`%CLV > 0` en `+8.33 pp`**. Sensibilidad a fricción: `alpha = 0.00` $\rightarrow$ `CLV% = +11.26% [8.60%, 14.32%]`, `ROI% = +5.62%`; `alpha = 0.10` $\rightarrow$ `CLV% = +10.61% [8.11%, 13.48%]`, `ROI% = +4.98%`. |
| Derivación matemática cerrada de cadencia óptima de scraping | **PASS** | Modelo explícito `exponential_stale_window_nyquist_v1` calibrado con parámetros empíricos del Parquet (`\lambda_{\text{eff}}(H) = [-\ln(1 - p_{\text{move}})/G_{\text{sharp}}](H_{\text{ref}}/H)^\gamma + [-\ln(1 - \beta_{\text{conv}})/H]`, `(1 - e^{-x^*})/x^* = 1 - \alpha_{\text{poll}}` con `\alpha_{\text{poll}} = 0.05 \Rightarrow x^* = 0.103479`, `\Delta t^*(H) = \min(x^*/\lambda_{\text{eff}}(H), 0.5/\lambda_{\text{eff}}(H), 0.25 H)`): en **`T - 60\text{ min}`** recomienda **`\Delta t^* = 3.69\text{ min}` (`221.2\text{ s}`)** elevando la supervivencia esperada del edge de `38.06%` (brecha actual `78.78 min`) a **`89.81%` (`+51.75 pp`)**; `H = 262.4\text{ min}` (`q00_ws`) $\rightarrow$ `8.57 min` (`92.73%`); `H = 509.9\text{ min}` (`q10_ws`) $\rightarrow$ `11.69 min` (`93.33%`); `H = 6269.9\text{ min}` (`q50_ws`) $\rightarrow$ `30.40 min` (`94.36%`). |
| Registro aislado de pruebas y sello de holdout | **PASS** | `holdout_registry_a8.jsonl` registra sus `7` corridas (`eval_split = "walk_forward_dev"`, `unlock_holdout = false`) con `0` accesos al holdout sellado. |

---

### 4. Verificación Consolidada del Sello de Holdout, Suites de Tests y Aislamiento Git (Puerta 3)

1. **Auditoría de los 4 registros de pruebas múltiples (`24 / 24` corridas con holdout intacto):**
   - `services/models/artifacts/holdout_trial_registry.jsonl`: `9` corridas (`Ola 1` `1..3`, `Ola 2` `4..9`) — `100%` `eval_split = "walk_forward_dev"`, `unlock_holdout = false`.
   - `services/models/artifacts/holdout_registry_a6.jsonl`: `4` corridas (`Ola 3 · A6`) — `100%` `eval_split = "walk_forward_dev"`, `unlock_holdout = false`.
   - `services/models/artifacts/holdout_registry_a7.jsonl`: `4` corridas (`Ola 3 · A7`) — `100%` `eval_split = "walk_forward_dev"`, `unlock_holdout = false`.
   - `services/models/artifacts/holdout_registry_a8.jsonl`: `7` corridas (`Ola 3 · A8`) — `100%` `eval_split = "walk_forward_dev"`, `unlock_holdout = false`.
   - **Estado del Holdout Sellado (`14,163` eventos `\ge 2025-02-02T17:30:00Z`):** **`0` evaluaciones consumidas en Olas 1–3 (`100%` virgen y habilitado para su única apertura final).**
2. **Suite Python (`pytest`):**
   - Comando ejecutado por `a9-verifier`:
     `research\prediction-lab\.venv\Scripts\python.exe -m pytest services/models -v`
   - Resultado: **`80 passed in 51.44s`** (`10` `test_backtest.py`, `10` `test_blend_calibration.py`, `11` `test_clv_report.py`, `5` `test_gbm_export.py`, `18` `test_markets_2way.py`, `10` `test_odds_snapshots.py`, `11` `test_picks_parity.py`, `5` `test_stale_lines.py`; `0` fallos).
3. **Suite TypeScript (`vitest` + `tsc`):**
   - `npx vitest run tests/prediction/`: **`14 passed (14)` archivos, `160 passed (160)` tests** (`markets_2way.test.ts` `7/7`, `gbm.test.ts` `9/9`, `stale_lines.test.ts` `7/7`, `blend.test.ts` `13/13`, `picks.test.ts` `9/9`, `odds.test.ts` `10/10`, `ledger_clv.test.ts` `8/8`, `engine.test.ts` `23/23`, `montecarlo.test.ts` `11/11`, `devig.test.ts` `15/15`, `tactical_skore.test.ts` `26/26`, `nfl.test.ts` `11/11`, `multisport_and_v3.test.ts` `7/7`, `fixture_requests.test.ts` `4/4`).
   - `npx vitest run` (suite paralela completa del repositorio): **`57 passed | 1 skipped (58)` archivos, `1,126 passed | 1 skipped (1,127)` tests** (`0` fallos) y **`0` errores `tsc --noEmit` en `prediction/`**.
4. **Verificación de `git status` y fronteras de worktrees:**
   - `.worktrees/prediction-lab`: `git diff --name-only 263857ad..dfbf2e4` contiene exclusivamente los `53` archivos de dominio/modelos/reportes autorizados de `A1`–`A9` (`0` cambios en `packages/ui`, `apps/web` ni `engine.ts`).
   - `.worktrees/web-scraping`: intacto y limpio en `3a8b3c091671ea707e3cf9856757e19047b0e346`.
   - Worktree raíz (`PitchLab`): intacto por el swarm (`1ca61bc`).

**Conclusión de Puerta 3:** Los tres entregables paralelos de Ola 3 (`A6` mercados 2-vías Dixon-Coles, `A7` exportación GBM a TypeScript y `A8` detector de líneas rezagadas con cadencia matemática) cumplen al 100% sus contratos matemáticos, paridad numérica cruzada (`< 10^{-12}` en `A6`/`A8` y `< 10^{-6}` en el `100%` de los `4,785` partidos OOS de `A7` con latencia `< 0.1 ms`), honestidad empírica de veredictos (`0/92` en `A6`, `production_activated: false` en `A7`, etiquetado honesto de significancia y límites de resolución en `A8`) y preservación absoluta del holdout sellado (`24/24` corridas con `unlock_holdout = false`). **Puerta 3 queda formalmente APROBADA para proceder a la única apertura final del Holdout Sellado.**
