# Estado del proyecto PitchLab · Prediction Lab

> **Propósito:** que cualquier sesión cuantitativa o de producto retome el trabajo en `prediction-lab` sin reconstruir el contexto ni reabrir un holdout consumido. Se actualiza al cerrar cada fase.
> **Última actualización:** 2026-11-11 · **Rama / Worktree:** `prediction-lab` (`.worktrees/prediction-lab`)

## Estado actual

- **Spacetime Suite `v3.0` (`666c5c7` → `263857a`):** ✅ motores base multi-deporte y feature store integrados.
- **Ola 1 — Infraestructura de Verdad (`A1` + `A2` + `A3` + Puerta 1 `A9`):** ✅ completa (`c96c7b3`, `e41f463`, `a852528`, `622949c`):
  - `5,442,989` snapshots pre-partido normalizados en `odds_snapshots.parquet` con resolución estricta de cierre sharp (`pinnacle` en `historical_fd`; `pinnacle` → `smarkets` en `scraped_ws`; `closing_missing=True` en el `100%` de NFL `nflverse`).
  - `PickLedger` inmutable encadenado por SHA-256 y tracker `CLV%` / `CLV_prob` / `ROI%` con bootstrap determinista (`>= 1,000` remuestreos `mulberry32`, paridad `< 10^{-12}` TS ↔ Python).
  - Arnés *walk-forward* anti-fuga (`DataLeakageError`), retraso realista `execution_delay_minutes = 2.0` (`alpha = 0.05` en pares `open→close`) y partición temporal fija de `70,812` eventos en `walk_forward_dev` (`56,649` eventos `< 2025-02-02T17:30:00Z`) y `holdout_sealed` (`14,163` eventos `>= 2025-02-02T17:30:00Z`).
- **Ola 2 — Calibración Modelo-Mercado y Motor de Decisión `v3.1` (`A4` + `A5` + Puerta 2 `A9`):** ✅ completa (`5b3df2c`, `ce348e0`, `c4439df`):
  - Mezcla logit modelo-mercado con selección *walk-forward* de método de-vig (`power = 38`, `proportional = 16`, `shin = 6`) y contracción $n_0 = 300$: `48 / 60` segmentos apagados automáticamente y `12 / 60` habilitados en `dev`.
  - Motor de picks con niveles exclusivos `["solido", "valor"]` (eliminados `"Pick Ancla >= 54%"` y `"Tiro de Cuota Alta"`), umbrales EV por Bayes empírico ($m_0 = 60$), filtros de dispersión ($\sigma_p \le 0.06$) y *steam* adverso, Kelly ¼ encogido y 4 topes duros (`2.0u / 2.0u / 3.0u / 5.0u`, `0` violaciones).
- **Ola 3 — Mercados 2-Vías, Exportación GBM a TS y Líneas Rezagadas (`A6` + `A7` + `A8` + Puerta 3 `A9`):** ✅ completa (`732a403`, `6583954`, `dfbf2e4`, `700dd24`, `e0f7910`):
  - `A6`: liquidación asiática exacta de 5 estados (`.25`/`.75`) y matrices Dixon-Coles; **`0 / 92` segmentos activados** con DC puro bajo Regla Rectora #4.
  - `A7`: *tree-walker* `HistGradientBoosting` nativo en TS (`< 0.065 ms`, paridad `< 4.09×10^{-8}` en `4,785` partidos OOS), mantenido en **`production_activated: false`** (`engine.ts` intacto) tras comprobar degradación de `-1.46 pp [-2.70%, -0.29%]` en `CLV%` OOF de picks de modelo.
  - `A8`: detector de líneas rezagadas de **Doble Confirmación** (`CLV% = +10.93% [+8.37%, +13.86%]` en `dev`, `+3.05 pp` sobre señal solo-sharp) y derivación matemática de cadencia óptima de scraping (`3.69 min` en `T-60m`, `8.57 min` matchday cercano, `11.69 min` matchday, `30.40 min` semanal).
- **Ola 4 — Apertura Única del Holdout Sellado y Síntesis Final `v3.1` (`A10`):** ✅ completa (2026-11-11, **cero re-tuning post-holdout**):
  - Consolidación auditable de las `24` corridas `run_backtest` de Olas 1–3 + `1` integrada pre-holdout (`25` corridas con `unlock_holdout=false`) + `4` corridas de una sola pasada sobre `holdout_sealed` (`trial_seq = 26..29` en `services/models/artifacts/holdout_trial_registry.jsonl`).
  - En `holdout_sealed` (`14,163` eventos `>= 2025-02-02T17:30:00Z`), el **Sistema Integrado `v3.1` (`A4+A5+A8`)** ejecutó `50` picks (`39` con cierre Pinnacle): **`CLV% = -2.27% [-5.80%, +0.68%]` (`"no significativa"`)**, **`ROI% = -4.23% [-32.85%, +24.27%]` (`"no significativa"`)**, `MaxDD = 9.88u` (frente a `172` picks y `ROI% = -17.97%` en `v3.0`), `0` violaciones de topes.
  - **Segmentos activos en producción (`src/data/prediction/production_segments_v3_1.json`):** **`0 / 60` (`production_enabled: true = 0`, `production_enabled: false = 60`)**. Ningún segmento alcanzó `CLV% > 0` con IC 95% bootstrap válido (`n >= 15`, ni siquiera con `n >= 6`) que excluya `0` en el holdout sellado.
- **Siguiente:** operar captura continua multi-tick en `.worktrees/web-scraping` (`<= 3.69 min` en `T-60m` sobre `Pinnacle` + `Smarkets` + `Caliente` + `Codere` + `Bet365`) y validar `>= 150` picks prospectivos en `PickLedger` antes de encender cualquier segmento.

---

## Documentos y artefactos creados en `v3.1`

| Ruta | Ola / Owner | Estado y Rol |
|---|---|---|
| `services/ingest/odds_snapshots.py` · `src/domain/prediction/odds.ts` | Ola 1 (`A1`) | Normalización de cuotas pre-kickoff y resolución estricta de cierre sharp (`c96c7b3`) |
| `src/domain/prediction/{ledger,clv}.ts` · `services/models/clv_report.py` | Ola 1 (`A2`) | Ledger inmutable SHA-256 y bootstrap `CLV`/`ROI` determinista (`e41f463`) |
| `services/models/backtest.py` · `services/models/artifacts/baseline_v3_0_backtest.json` | Ola 1 (`A3`) | Arnés *walk-forward* anti-fuga, retraso `2 min` y línea base `v3.0` (`a852528`) |
| `src/domain/prediction/blend.ts` · `src/data/prediction/blend_weights_v3_1.json` | Ola 2 (`A4`) | Mezcla logit modelo-mercado y métodos de-vig por `liga × mercado` (`5b3df2c`) |
| `src/domain/prediction/picks.ts` · `src/data/prediction/pick_policy_v3_1.json` | Ola 2 (`A5`) | Motor de decisión `solido`/`valor`, Kelly ¼ con $\sigma_p$ y topes `2u/2u/3u/5u` (`ce348e0`) |
| `src/domain/prediction/markets_2way.ts` · `src/data/prediction/markets_2way_config.json` | Ola 3 (`A6`) | Derivación Dixon-Coles 2-vías y liquidación asiática de 5 estados; `0/92` activos (`732a403`) |
| `src/domain/prediction/gbm.ts` · `src/data/prediction/gbm_trees_v3_1.json` | Ola 3 (`A7`) | *Tree-walker* GBM en TS `< 0.065 ms`; `production_activated: false` (`6583954`, `dfbf2e4`) |
| `src/domain/prediction/stale_lines.ts` · `src/data/prediction/stale_lines_config.json` | Ola 3 (`A8`) | Detector de líneas rezagadas Doble Confirmación y cadencia matemática (`700dd24`) |
| `research/prediction-lab/reports/A28_verificacion_swarm.md` | Puertas 1–3 (`A9`) | Auditoría Red Team independiente de Olas 1, 2 y 3 (`622949c`, `c4439df`, `e0f7910`) |
| `services/models/evaluate_sealed_holdout_v3_1.py` · `services/models/test_sealed_holdout_v3_1.py` | Ola 4 (`A10`) | Evaluación única reproducible del holdout sellado y suite de integridad |
| `services/models/artifacts/sealed_holdout_v3_1_eval.json` · `holdout_trial_registry.jsonl` | Ola 4 (`A10`) | Artefacto completo de evaluación y registro consolidado de las `29` corridas |
| `src/data/prediction/production_segments_v3_1.json` | Ola 4 (`A10`) | Tabla auditable de producción (`0/60` segmentos habilitados con `disabled_reason` explícito) |
| `research/prediction-lab/reports/A28_picks_medibles_v3_1.md` | Ola 4 (`A10`) | Reporte maestro con trazabilidad por script/commit y tablas de los `60` segmentos |
| `docs/predicciones/19_HOJA_DE_RUTA_MOTORES_Y_PICKS_V4.md` | Ola 4 (`A10`) | Hoja de ruta corregida (5 reglas obligatorias + resultados reales `v3.1` + `TODO` sin código) |

---

## Hallazgos cuantitativos que cambian supuestos

1. **El modelo pre-partido tabular pierde frente al cierre sin margen de Pinnacle tanto en `dev` (`+0.01457` nats) como en `holdout_sealed` (`+0.01287` nats, IC 95% `[+0.00910, +0.01667]`):** ningún segmento guiado solo por modelo estático genera `+CLV` sostenible fuera de muestra (`a5_model_driven` obtuvo `CLV% = -3.37% [-5.39%, -1.43%]` en el holdout).
2. **Más complejidad de árboles sobre las mismas features degrada el `CLV%` de apuestas (`A7`):** aunque `HistGradientBoosting` araña `-0.00076` nats en histórico largo, en `2024–2025` su mejora en `log-loss` no es significativa (`-0.00022 [-0.00103, +0.00053]`) y reduce `CLV%` en `-1.46 pp` en picks guiados por modelo.
3. **El único alfa positivo medido (`a5_sharp_arb` `+16.25%` y `A8` Doble Confirmación `+10.93%` en `dev`) depende de capturar líneas recreativas rezagadas en tiempo real:** en `scraped_ws`, la brecha actual de `78.78 min` en Pinnacle y la captura única en Caliente/skins US impidieron llenar un solo pick vivo (`0 / 50` picks `scraped_ws` en el holdout). Pasar a `<= 3.69 min` en `T-60m` sube la supervivencia esperada del edge de `38.06%` a `89.81%`.
4. **El `holdout_sealed` de `2025-02-02` a `2026-11-08` ya fue abierto una vez y queda consumido como conjunto de prueba virgen:** cualquier iteración futura (`v3.2+` / `v4.0`) debe validarse sobre datos prospectivos posteriores al `2026-11-08T20:30:00Z` registrados en `PickLedger`.

---

## Decisiones tomadas

- **`0 / 60` segmentos habilitados en `production_segments_v3_1.json`:** se respeta sin excepciones la puerta `CLV% > 0` con IC 95% bootstrap que no cruce `0` en `holdout_sealed`. No se reajustan pesos, umbrales EV ni márgenes tras observar el holdout.
- **`src/domain/prediction/engine.ts`, `packages/ui` y `apps/web` permanecen intactos:** la capa cuantitativa `v3.1` vive desacoplada y tipada en `src/domain/prediction/{odds,ledger,clv,blend,picks,markets_2way,gbm,stale_lines}.ts` y `src/data/prediction/*_v3_1.json`.
- **Niveles únicos `solido` y `valor`:** eliminados definitivamente `"Pick Ancla >= 54%"` y `"Tiro de Cuota Alta"`.

---

## Pendiente (en orden)

1. **Cadencia continua de scraping multi-casa (`v3.2`, bloqueante de picks en vivo):** programar en `.worktrees/web-scraping` la recolección concurrente de `Pinnacle` + `Smarkets` + `Caliente` + `Codere` + `Bet365` a intervalos `<= 3.69 min` en `[T-60m, T-0]`, `<= 8.57 min` en `[T-4.4h, T-60m)`, `<= 11.69 min` en `[T-8.5h, T-4.4h)` y `<= 30.40 min` en apertura semanal.
2. **Validación prospectiva en *paper-trading* (`PickLedger` `A2`):** acumular `>= 150` picks ejecutables con `execution_delay = 2.0 min` y cierre sharp verificado (`A1`) posteriores al `2026-11-08`; habilitar únicamente los segmentos cuyo `CLV%` prospectivo logre IC 95% bootstrap `> 0`.
3. **Cierres sharp propios para NFL y Multi-Sport:** recolectar cierres de `Pinnacle`/`Smarkets` en NFL, MLB, NHL, NBA y NCAAF antes de evaluar los diseños de `docs/predicciones/19_HOJA_DE_RUTA_MOTORES_Y_PICKS_V4.md` §4 (`TODO` sin código).

---

## Bloqueos

- **Resolución de `scraped_ws`:** `0` filas válidas de `codere` y `smarkets`, `3` filas sin par sharp en `caliente`, y `78.78 min` entre olas de `pinnacle` en el lote actual.
- **Ausencia de cierre sharp en `nflverse`:** `6,986 / 6,986` partidos históricos de NFL tienen `closing_missing = True` porque `nflverse` no identifica casa sharp.
- **Ausencia de cuotas sharp históricas por jugador:** bloquea cualquier validación seria de *player props* (§4.4 de la hoja de ruta).

---

## Handoffs

### PREDLAB-V3.1 · Infraestructura CLV, política EV/Kelly, mercados 2-vías, GBM TS, líneas rezagadas y evaluación única del Holdout Sellado — 2026-11-11 — Rama `prediction-lab`
- **Hecho:**
  - **Ola 1 (`c96c7b3`, `e41f463`, `a852528`, Puerta 1 `622949c`):** construcción de `odds_snapshots.parquet` (`5.44M` filas), `PickLedger` inmutable SHA-256 + `clv.ts`/`clv_report.py` y `backtest.py` anti-fuga con `holdout_sealed` del `20%` (`14,163` eventos).
  - **Ola 2 (`5b3df2c`, `ce348e0`, Puerta 2 `c4439df`):** calibración `blend.ts` (`12/60` segmentos activos en `dev`, `48/60` apagados) y motor `picks.ts`/`picks_engine.py` (`solido`/`valor`, Kelly ¼ con $\sigma_p$, topes `2u/2u/3u/5u`).
  - **Ola 3 (`732a403`, `6583954`, `dfbf2e4`, `700dd24`, Puerta 3 `e0f7910`):** liquidación asiática de 5 estados (`markets_2way.ts`, `0/92` activos con DC puro), exportación `gbm.ts` (`< 0.065 ms`, `production_activated: false`) y detector `stale_lines.ts` con Doble Confirmación y cadencia óptima `3.69 min` en `T-60m`.
  - **Ola 4 (`a10-holdout`):** consolidación de las `24` corridas `run_backtest` de Olas 1–3 + `1` integrada `dev` + `4` corridas únicas sobre `holdout_sealed` (`29` entradas en `holdout_trial_registry.jsonl`), materialización de `sealed_holdout_v3_1_eval.json` y `production_segments_v3_1.json` (`0/60` segmentos activos), reporte maestro `A28_picks_medibles_v3_1.md` y reescritura íntegra de `docs/predicciones/19_HOJA_DE_RUTA_MOTORES_Y_PICKS_V4.md`.
- **Cómo probarlo:**
  - Reproducir evaluación del holdout sellado: `.\research\prediction-lab\.venv\Scripts\python.exe services/models/evaluate_sealed_holdout_v3_1.py`
  - Suite Python completa (`85` tests en verde): `.\research\prediction-lab\.venv\Scripts\python.exe -m pytest services/models -v`
  - Suite TypeScript completa (`57` archivos / `1,126` tests activos en verde): `npx vitest run`
