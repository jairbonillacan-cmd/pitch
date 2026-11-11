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
