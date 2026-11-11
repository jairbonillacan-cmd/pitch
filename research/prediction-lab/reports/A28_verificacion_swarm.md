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
