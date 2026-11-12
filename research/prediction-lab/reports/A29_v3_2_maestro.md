# A29 · Reporte Maestro Consolidado de Cierre — Ciclo `PREDLAB-V3.2`

- **Agente autor:** `B10` (`b10-docs`, Ola 4 — Cierre Documental)
- **Fecha de cierre:** `2026-11-12`
- **Worktrees consolidados:**
  1. `C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\prediction-lab` — rama `prediction-lab` (base pre-ciclo `f3564a4266c33441db9c2f36714073b7516d37e6`, `HEAD` pre-`B10` `14e3e1eb40870b1d3ca3bfca7108250ab60688be`, `OBSERVADO`)
  2. `C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\web-scraping` — rama `web-scraping` (base pre-ciclo `3a8b3c091671ea707e3cf9856757e19047b0e346`, `HEAD` `4993a9b6b598aa3fa63be1cb5735975cbd56e35f`, `OBSERVADO`)
- **Reportes primarios consolidados:** [`A29_calibracion_publicada.md`](./A29_calibracion_publicada.md) (`B4`), [`A29_prospectivo_semana_1.md`](./A29_prospectivo_semana_1.md) (`B5`), [`A29_nfl_sharp_corpus.md`](./A29_nfl_sharp_corpus.md) (`B6`), [`A29_xi_confirmado.md`](./A29_xi_confirmado.md) (`B7`), [`A29_nfl_epa.md`](./A29_nfl_epa.md) (`B9`), [`A29_verificacion_v3_2.md`](./A29_verificacion_v3_2.md) (`V`) y referencia histórica [`A28_picks_medibles_v3_1.md`](./A28_picks_medibles_v3_1.md) (`"holdout consumido"`).

---

## 1. Resumen Ejecutivo y Tabla Consolidada de Commits (`O`, `B1`–`B9`, `V`)

### 1.1 Síntesis Ejecutiva (`OBSERVADO`)

El ciclo **`PREDLAB-V3.2`** transformó la salida pública y la infraestructura prospectiva de PitchLab bajo las **9 reglas rectoras inquebrantables (`§0`)**, sin re-tunear ni un solo parámetro de `v3.1`, sin volver a evaluar el `holdout_sealed` (`2025-02-02T17:30:00Z`–`2026-11-08`, congelado como **`"holdout consumido"`**), sin inventar cuotas sintéticas y sin emplear evasión anti-bot:

1. **Producto público honesto sin stake (`B1` + `B2` + `B4` + `B8`):**
   - `MatchOutlook` (`src/domain/prediction/outlook.ts`) publica **"lo más probable + cuota justa sin margen (`fairOdds = 1/p`)"** en `11` mercados de fútbol + `topScorelines[3]` (desde la única matriz Dixon-Coles de `markets_2way.ts`) y `3` mercados de NFL, con **cero** campos de `stake`, `kelly`, `ev`, `tier` o `"pick seguro"`.
   - `service.ts` elimina definitivamente las cuotas sintéticas (`reconstructExecutionOdds`), respeta la compuerta `production_segments_v3_1.json` (**`0 / 60` segmentos habilitados**, `executableBetsCount = 0` en los `242` partidos vivos), corrige el auto-bucle de mercado con ancla explícita Smarkets y expone `featureCoverage` (`38/113` en fútbol vivo, `4/29` en NFL `v3.0` vivo, ambos `"low_coverage"`).
   - `outlook_calibration_v3_2.json` (`98` segmentos: `93` `liga × mercado` + `5` `GLOBAL`, `SHA-256 = 090cfaa2...`) publica curvas empíricas de `10` bins y métricas `ECE`/`Log-Loss`/`Brier`/`RPS` con IC 95% bootstrap `mulberry32` sobre `walk_forward_dev` (`56,649` eventos `< 2025-02-02T17:30:00Z`), seleccionando `blend_v3_1` en `3 / 93` segmentos (`D2::1x2`, `G1::1x2`, `G1::totals`, todos con `ΔLL` **`"no significativa"`**) y `market_sharp_novig` en `90 / 93`.
   - `live_matchday_v3_snapshot.json` (`SHA-256 = 1dace760...`, `schema_version = "3.2.0"`) incorpora `130` `MatchOutlook` (`84` fútbol + `46` NFL) con `market: null` y `pSource: "model"` ante `0` cuotas reales `< 72 h`.
2. **Infraestructura prospectiva legal y auditable (`B3` + `B5` + `B6`):**
   - `B3` auditó legalmente `7` fuentes de cuotas (`2` `api_only` + `5` `blocked_pending_owner_decision`), implementó `scrapers/cadence_scheduler.py` acoplado a `stale_lines_config.json` (`T-60m <= 3.6858 min`) sin evasión anti-bot y registró `capture_status = "prospective_capture_pending"` (`0` filas falsas).
   - `B5` construyó el runner causal e idempotente `services/models/paper_trading.py` (`corte > 2026-11-08T20:30:00Z`, `execution_delay >= 2.0 min`, separación estricta `provenance = "real"` vs `"synthetic"`), dejando `picks_v3_2_prospective.jsonl` en **`0 / 150` picks reales** y verificando paridad criptográfica `0` bits TS↔Python sobre un fixture sintético aislado de `12` eslabones.
   - `B6` construyó `nfl_sharp_closing.parquet` (`39` filas `pinnacle` en `13` juegos futuros, rechazando `31,196` filas de consenso `nflverse` y `986` recreativas) e impuso la compuerta `n_settled = 0 < 64` (`production_enabled = false`, calibración sharp **`DESCONOCIDO`**).
3. **Experimentos causales en Ola 3 mantenidos como candidatos inactivos (`B7` + `B9`, `production_activated: false`):**
   - `B7` (`EXP_V32_xi`): auditó `7` fuentes de alineaciones (`2` `api_only` + `5` `blocked_pending_owner_decision`), implementó `CONTRACT_XI_PUBLISHED.md` (`ts_xi_published <= ts_captured <= ts_decision - 2.0 min < kickoff_utc`) y verificó que en `walk_forward_dev` existen **`0 / 52,746`** timestamps reales `ts_xi_published` (`ΔLL = 0.000000`, **`"no significativa"`**, efecto real **`DESCONOCIDO`**).
   - `B9` (`EXP_V32_nfl_epa`): construyó el candidato separado `src/data/prediction/model_nfl_v3_2_candidate.json` (`41` features con `12` agregados PBP `nflverse` estrictamente causales $w' < w$ `< 2025-02-02`), elevando la cobertura viva NFL de **`4/29` (`13.79%`)** a **`34.37/41` (`83.83%`, `0/46` `"low_coverage"`)** y reduciendo `log-loss` en `-0.065911 [-0.075109, -0.056734]` frente a la inferencia viva `v3.0`, pero con mejora **`"no significativa"`** en `DEV_OOS 2020..2024` (`-0.003153 [-0.006492, +0.000129]`) frente a `v3.0` histórico `29/29` y perdiendo `+0.013040` frente al consenso `nflverse` (**`"sin cierre sharp"`**). Permanece inactivo hasta reunir `>= 64` juegos NFL liquidados con cierre sharp real.

### 1.2 Tabla Consolidada de Commits del Ciclo `PREDLAB-V3.2` (`OBSERVADO`)

| Ola / Puerta | Worktree (Rama) | Commit (corto / completo) | Agente | Mensaje Exacto de Commit y Alcance |
|---|---|---|---|---|
| Pre-ciclo (`v3.1`) | `prediction-lab` | `f3564a4` (`f3564a4266c33441db9c2f36714073b7516d37e6`) | `A10` | `feat(holdout): evaluar holdout sellado v3.1 y publicar reporte maestro A28` (base congelada, `"holdout consumido"`). |
| Pre-ciclo | `web-scraping` | `3a8b3c0` (`3a8b3c091671ea707e3cf9856757e19047b0e346`) | — | Base previa del worktree `web-scraping`. |
| **Ola 0** | `prediction-lab` | `b04e342` (`b04e342f35d86570a47628f1e3c20e3fc06291f8`) | **`O`** (`coordinator`) | `feat(v3.2-O): preparar contratos de coordinación y línea base de Ola 0` (`MASTER.md`, `CONTRACT_OUTLOOK.md`, `CONTRACT_ODDS_TIMESERIES.md`, `20_SWARM_V3_2_GEMINI.md`, `status/O.json`). |
| **Ola 1** | `web-scraping` | `4993a9b` (`4993a9b6b598aa3fa63be1cb5735975cbd56e35f`) | **`B3`** (`b3-capture`) | `feat(v3.2-B3): implementar auditoria legal de fuentes y programador multi-tick de cuotas` (`LEGAL_FUENTES_CUOTAS.md`, `cadence_scheduler.py`, `scrapers/sources/*`, `health.json`, `7` tests Pytest). |
| **Ola 1** | `prediction-lab` | `48854e8` (`48854e8d71ebf844b7cc533b479007f92a6ce5bd`) | **`B3`** (`b3-capture`) | `feat(v3.2-B3): actualizar contrato de serie temporal y estado de captura` (`CONTRACT_ODDS_TIMESERIES.md`, `status/B3.json`). |
| **Ola 1** | `prediction-lab` | `5f403ae` (`5f403ae9d6f9ac49118f4cd1f44c15a0bc3f964c`) | **`B2`** (`b2-gate`) | `feat(v3.2-B2): activar compuerta de segmentos, eliminar cuotas sinteticas y unificar tiers` (`service.ts`, `ledger.ts`, `types.ts`, `service_constants_v3_2.json`, `clv_report.py`, tests). |
| **Ola 1** | `prediction-lab` | `a33cdc4` (`a33cdc4217f1f89be42ea273914ee4133caec54b`) | **`B1`** (`b1-outlook`) | `feat(v3.2-B1): implementar motor publico MatchOutlook y centralizar utilidades math.ts` (`math.ts`, `outlook.ts`, dedup de imports en `6` módulos, `outlook.test.ts`). |
| **Ola 1** | `prediction-lab` | `1e22b6a` (`1e22b6a902f28a47af83287edb827751839e252f`) | **`B4`** (`b4-calibration`) | `feat(v3.2-B4): publicar calibracion causal por liga y mercado en walk_forward_dev` (`outlook_calibration.py`, espejos `outlook_calibration_v3_2.json`, trial `#30`, `A29_calibracion_publicada.md`). |
| **Puerta 1** | `prediction-lab` | `e20e823` (`e20e8236e7cb153e271753413e857a6594168f48`) | **`V`** (`v-verifier`) | `feat(v3.2-V): auditar Ola 1 y aprobar Puerta 1` (`18/18` controles `PASS`). |
| **Ola 2** | `prediction-lab` | `70e08db` (`70e08dbe8bc36568c7b2f661923038c0a8d566cf`) | **`B6`** (`b6-nfl-sharp`) | `feat(v3.2-B6): construir corpus de cierre sharp NFL y compuerta de suficiencia` (`nfl_sharp_closing.py`, `nfl_sharp_closing.parquet`, `A29_nfl_sharp_corpus.md`). |
| **Ola 2** | `prediction-lab` | `96a8f4b` (`96a8f4b8229a2430ed45b047baaba3fa5f95c1a9`) | **`B8`** (`b8-snapshot`) | `feat(v3.2-B8): regenerar snapshot en vivo con MatchOutlook y guia de sincronizacion` (`regenerate_live_snapshot.py`, `live_matchday_v3_snapshot.json`, `SYNC_NOTES.md`). |
| **Ola 2** | `prediction-lab` | `adb0313` (`adb03138c5da94f6cb2e672ae57440721a52152d`) | **`B5`** (`b5-paper`) | `feat(v3.2-B5): implementar ledger prospectivo y runner idempotente de paper-trading` (`paper_trading.py`, `picks_v3_2_prospective.jsonl`, fixtures sintéticos, `A29_prospectivo_semana_1.md`). |
| **Puerta 2** | `prediction-lab` | `19453fb` (`19453fb257541cf737baaaf651bc3a2c0c3b0fd5`) | **`V`** (`v-verifier`) | `feat(v3.2-V): auditar Ola 2 y aprobar Puerta 2` (`16/16` controles `PASS`). |
| **Ola 3** | `prediction-lab` | `53ff835` (`53ff8355d954d24681394065453db21762d8cb3d`) | **`B7`** (`b7-xi`) | `feat(v3.2-B7): instrumentar contrato legal de XI confirmado y experimento walk-forward` (`EXP_V32_xi/*`, `CONTRACT_XI_PUBLISHED.md`, `A29_xi_confirmado.md`). |
| **Ola 3** | `prediction-lab` | `bbfdbc5` (`bbfdbc5d1d284e8b623b5b8837db8c3a9723ac9a`) | **`B9`** (`b9-nfl-epa`) | `feat(v3.2-B9): construir candidato NFL Minkowski v3.2 con agregados EPA causales` (`EXP_V32_nfl_epa/*`, `model_nfl_v3_2_candidate.json`, trial `#31`, `A29_nfl_epa.md`). |
| **Puerta 3** | `prediction-lab` | `14e3e1e` (`14e3e1eb40870b1d3ca3bfca7108250ab60688be`) | **`V`** (`v-verifier`) | `feat(v3.2-V): auditar Ola 3 y aprobar Puerta 3` (`16/16` controles `PASS`, `50/50` acumulados y `8/8` criterios globales `MASTER.md` §5). |

---

## 2. Resumen de las 3 Puertas Red Team (`A29_verificacion_v3_2.md`, Agente `V`)

El verificador independiente de solo lectura `V` (`v-verifier`) auditó cada ola antes de habilitar la siguiente, ejecutando suites completas y verificando hashes `SHA-256` y fronteras de git (`OBSERVADO`):

| Puerta | Commit `V` | Bloques Auditados | Controles Auditados | Suites Ejecutadas Independientemente por `V` | Veredicto |
|---|---|---|---|---|---|
| **Puerta 1** | `e20e823` | `O`, `B1`, `B2`, `B3`, `B4` | **`18 / 18`** (`G1-R1..R9`, `G1-B1a..B4b`): hashes `v3.1` intactos, `holdout_sealed` sin lecturas (`trial #30` `walk_forward_dev`), `0/60` segmentos activos, `0` cuotas sintéticas, `0` stakes en `MatchOutlook`, `0` evasión anti-bot en `B3`, paridad `< 1e-12` y espejo `outlook_calibration_v3_2.json` idéntico (`090cfaa2...`). | `59` archivos / `1,145` tests Vitest + `92` tests Pytest (`prediction-lab`) + `7` tests Pytest (`web-scraping`), `0` fallos. | **`PASS`** |
| **Puerta 2** | `19453fb` | `B5`, `B6`, `B8` | **`16 / 16`** (`G2-R1..R9`, `G2-B5a..B8b`): idempotencia 2x en `paper_trading.py`, causalidad `> 2026-11-08T20:30:00Z` + `delay >= 2.0 min` (sonda adversarial `+30s` ignorado, `+120s` ejecutado), separación estricta `real` (`0` bytes) vs `synthetic` (`12` eslabones), rechazo `100%` de consenso/recreativas en `B6` (`0 < 64` liquidados), y `130` `MatchOutlook` válidos `< 72 h` sin stakes en `B8`. | `61` archivos / `1,153` tests Vitest + `111` tests Pytest (`prediction-lab`), `0` fallos. | **`PASS`** |
| **Puerta 3** | `14e3e1e` | `B7`, `B9` + Cierre Global `MASTER.md` §5 | **`16 / 16`** (`G3-R1..R9`, `G3-B7a..B7b`, `G3-B9a..B9d`, `G3-C1`): guardia causal `ts_xi_published <= ts_captured <= ts_decision - 2.0m`, `0` registros fabricados en `B7`, invarianza causal por truncamiento `w' < w` `< 1e-12` en `B9`, salto de cobertura viva NFL `4/29 -> 34.37/41`, `model_nfl.json` intacto, ambos candidatos en `production_activated: false`, archivos git `< 50 MB` (`3.60 MB` máx.) y `8/8` criterios globales `MASTER.md` §5 cumplidos. | `61` archivos / `1,153` tests Vitest + `120` tests Pytest (`111` `services/models` + `4` `EXP_V32_xi` + `5` `EXP_V32_nfl_epa`) + `7` tests Pytest (`web-scraping`), `0` fallos. | **`PASS`** |
| **Total Ciclo** | `14e3e1e` | `O`, `B1`–`B9` (`2` worktrees) | **`50 / 50` controles en verde · `0` defectos abiertos** | `1,153` Vitest + `127` Pytest totales en verde | **`PASS`** |

> **Nota documental de trazabilidad verificada en disco (`OBSERVADO`):** El artefacto inmutable `src/data/prediction/outlook_calibration_v3_2.json` (`SHA-256 = 090cfaa23d35bdd569ea3a17d0084b6af7b2e99eeb8cdb00b15a8b588654194e`) contiene exactamente `selection_summary = {"n_league_market_segments": 93, "n_global_rollups": 5, "n_selected_blend_v3_1": 3, "n_selected_market_sharp_novig": 90, "blend_v3_1_segments": ["D2::1x2", "G1::1x2", "G1::totals"]}` (`98` segmentos totales). Dos glosas textuales secundarias (`SYNC_NOTES.md:18` que resume `"12 segmentos"` y `A29_verificacion_v3_2.md` §1.1/§1.4 que citó `5` segmentos de una sonda preliminar) no alteran ningún hash, código ni prueba; la fuente canónica es el JSON `090cfaa2...` y `A29_calibracion_publicada.md`.

---

## 3. Registro de Integridad `SHA-256` (Artefactos Congelados `v3.1` y Nuevos `v3.2`, `OBSERVADO`)

| Ruta del Artefacto | Rol / Estado | `SHA-256` Verificado |
|---|---|---|
| `src/data/prediction/production_segments_v3_1.json` | Congelado `v3.1` (`0/60` encendidos) | `0bc03bbff96a5d82a1a7858e1e8623bf7bfdb250c546d2773a71d56ed9ada9bc` |
| `src/data/prediction/blend_weights_v3_1.json` | Congelado `v3.1` (`A4`) | `b29d7a451f6011126997c122778b42ad3239c78337d17c5fa78d550f5c92739b` |
| `src/data/prediction/pick_policy_v3_1.json` | Congelado `v3.1` (`A5`) | `2359c8f8822ea394a380202c04e0bcd010d1a3fae7c5c25b8c11ebe810bfb7d1` |
| `src/data/prediction/stale_lines_config.json` | Congelado `v3.1` (`A8`) | `8bcb9c7be93270cde0cac2d58bc19f0381184dd2e769f358dd28334db2a05eac` |
| `src/data/prediction/markets_2way_config.json` | Congelado `v3.1` (`A6`) | `04361e12f59895f89f4f81b718085c7dc49b1d1e0c2d7ee71c747daef3262ee4` |
| `src/data/prediction/gbm_trees_v3_1.json` | Candidato inactivo `v3.1` (`production_activated: false`) | `acf98f07585116f7f26912f943d83c6190e7e6d9e520c6e8733c3eb9bd9bed4c` |
| `src/data/prediction/model_motor_a.json` | Motor activo fútbol (`Tachyon v3.0`) | `3c72967eddc79bb71ca7fcae40bf21aae760269dc62b43cf2b2db7eeacfceec9` |
| `src/data/prediction/model_nfl.json` | Motor activo NFL (`Minkowski v3.0`) | `e74ae241875739d2dc18564f85133d4e20c1d0cef41d64b6f705852601597225` |
| `src/domain/prediction/engine.ts` | Motor de inferencia puro TS intacto | `9270125c49e81adf57e90c76db07eb95f53ab35a5051e49265b35b80ed0553bc` |
| `services/models/artifacts/sealed_holdout_v3_1_eval.json` | Evaluación única `"holdout consumido"` intacta | `5c9e550bfd7889e44f674c91cf64cea4c07b4281fc72231b8cadff850309f2dd` |
| `src/data/prediction/outlook_calibration_v3_2.json` (`== services/models/artifacts/...`) | Nuevo `v3.2` (`B4`, `98` segmentos) | `090cfaa23d35bdd569ea3a17d0084b6af7b2e99eeb8cdb00b15a8b588654194e` |
| `src/data/prediction/service_constants_v3_2.json` | Nuevo `v3.2` (`B2`, `13` constantes) | `fcbc8e7dee3b302f57cb9b68f0c5403cc10cdfb308bc6aff9e71e30957fa15b7` |
| `src/data/prediction/live_matchday_v3_snapshot.json` | Actualizado `v3.2` (`B8`, `130` `MatchOutlook`) | `1dace760d68442e73c4b365f85cd16509093716b1bcac72aa1da67b61ec29699` |
| `data/ledger/picks_v3_2_prospective.jsonl` | Nuevo `v3.2` (`B5`, `0` bytes, `0/150` reales) | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `data/ledger/fixtures/picks_v3_2_synthetic_fixture.jsonl` | Fixture sintético aislado (`B5`, `12` eslabones) | `70b537b3b9beed80d7b6a18e689042271d496c6f15314def049a793a18aa5978` |
| `research/prediction-lab/data/processed/nfl_sharp_closing.parquet` | Nuevo `v3.2` (`B6`, `39` filas `pinnacle`) | `178ad93241bd2bf004f77cf576a180afbb547ab65b4b28bbc63ad76f06680cae` |
| `research/prediction-lab/experiments/EXP_V32_xi/exp_v32_xi_results.json` | Candidato inactivo `v3.2` (`B7`, `production_activated: false`) | `c92d51eb5bae01b2e6e8032a521cd34dce87e2ed144145c93d0765a6d0b8a19b` |
| `src/data/prediction/model_nfl_v3_2_candidate.json` | Candidato inactivo `v3.2` (`B9`, `production_activated: false`) | `ebf6c3c3cfe417d57a685f0b574fed212da3f1e58da8568434f82197f5a46158` |
| `services/models/artifacts/holdout_trial_registry.jsonl` | Registro de corridas (`31` líneas; `#30` y `#31` `walk_forward_dev`) | `058d5d0d9bcaeb97f0415f871b50a7a3279b34ad59dcdcaacf33ac4b4fe8923e` |

---

## 4. Tabla Maestra de Métricas Clave (`v3.1` Descriptivo + `B1`–`B9`)

> **Convención estricta (`§0 Regla #6`):** Todos los intervalos de confianza al 95% provienen de bootstrap determinista `mulberry32` (`1,000` réplicas, semilla `20261111` en `v3.2` / `20261109` en `v3.1`). Todo intervalo que cruza `0` (o muestra nula) lleva **`"no significativa"`**. Toda cita a la pasada única de `v3.1` lleva **`"holdout consumido"`**. Toda comparación NFL contra `nflverse` lleva **`"sin cierre sharp"`**.

| Bloque | Métrica / Comparación | Valor e IC 95% (`mulberry32`) | Significancia y Etiquetas Obligatorias | Clasificación Epistémica | Commit | Comando Exacto Reproducible (desde `.worktrees\prediction-lab`, salvo `B3`) |
|---|---|---|---|---|---|---|
| **Ref. `v3.1`** (`A10`) | Sistema Integrado `v3.1` (`A4+A5+A8`, `n=50` picks, `39` c/cierre en `14,163` eventos) | `CLV% = -2.27% [-5.80%, +0.68%]`; `ROI% = -4.23% [-32.85%, +24.27%]`; `MaxDD = 9.88u [5.96u, 23.82u]`; `0/60` activos | **`"no significativa"`** · **`"holdout consumido"`** | `OBSERVADO` | `f3564a4` | `.\research\prediction-lab\.venv\Scripts\python.exe services/models/evaluate_sealed_holdout_v3_1.py` |
| **Ref. `v3.1`** (`A10`) | Línea Base `v3.0` (`n=172` picks en `14,163` eventos) | `ΔLL vs Pinnacle_close = +0.01287 [+0.00910, +0.01667]`; `CLV% = -0.71% [-2.82%, +1.47%]`; `ROI% = -17.97% [-42.96%, +9.24%]` | `ΔLL` `significativa` (pierde vs cierre); `CLV%` y `ROI%` **`"no significativa"`** · **`"holdout consumido"`** | `OBSERVADO` | `f3564a4` | `.\research\prediction-lab\.venv\Scripts\python.exe services/models/evaluate_sealed_holdout_v3_1.py` |
| **`B1`** (`outlook`) | Coherencia probabilística `MatchOutlook` (`11` mercados fútbol + `topScorelines[3]`, `3` NFL) y paridad `math.ts` TS↔Py | Error símplex `|∑p - 1| <= 4.441e-16 < 1e-15`; paridad TS↔Py `max|Δ| = 4.991e-13 < 1e-12`; `0` campos de stake/Kelly | Determinista exacta (`0` violaciones) | `OBSERVADO` | `a33cdc4` | `npx vitest run tests/prediction/outlook.test.ts` |
| **`B2`** (`gate`) | Compuerta `production_segments_v3_1.json` y `featureCoverage` sobre `242` partidos vivos | `executableBetsCount = 0` (`63 -> 0`), `activeStakes = 0`, `activeKelly = 0`; cobertura viva fútbol `38/113` (`33.63%`) y NFL `v3.0` `4/29` (`13.79%`), ambos `"low_coverage"`; paridad `1.110e-16` | Determinista exacta (`0/60` segmentos habilitados) | `OBSERVADO` | `5f403ae` | `npx vitest run tests/prediction/service_gate.test.ts` |
| **`B3`** (`capture`) | Salud de captura multi-tick legal y cadencia `T-60m` (`66` eventos en calendario) | `active_sources = 0`, `total_rows_written = 0` (`0` precios falsos), cadencia `T-60m = 203.46s <= 221.15s` (`3.6858m`) | `prospective_capture_pending` (`0` muestras de cuotas reales -> **`"no significativa"`**) | `OBSERVADO` | `4993a9b` / `48854e8` | `Set-Location "C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\web-scraping"; .\.venv\Scripts\python.exe scrapers/cadence_scheduler.py --once` |
| **`B4`** (`calibration`) | `GLOBAL::football::1x2` (`walk_forward_dev`): `market_sharp_novig` (`n=37,490`) y `model` (`n=52,746`) | Sharp: `LL = 0.9929 [0.9882, 0.9978]`, `ECE = 0.0025 [0.0017, 0.0056]`, `Brier = 0.5928 [0.5896, 0.5962]`, `RPS = 0.2007 [0.1993, 0.2020]`; `model`: `LL = 1.0109 [1.0073, 1.0145]`, `ECE = 0.0062 [0.0039, 0.0088]`, `ΔLL vs base_rate = -0.0639 [-0.0666, -0.0611]` | `model vs base_rate`: `significativa`; `blend_v3_1` en `D2::1x2` (`-0.001610 [-0.003713, +0.000486]`) y `G1::1x2` (`-0.000654 [-0.001862, +0.000588]`): **`"no significativa"`** | `OBSERVADO` | `1e22b6a` | `.\research\prediction-lab\.venv\Scripts\python.exe services/models/outlook_calibration.py --record-trial` |
| **`B4`** (`calibration`) | `GLOBAL::football::totals` (`2.5`, `n=31,845` sharp / `52,746` model) y `GLOBAL::football::ah` (`n=29,658` sharp `active_w=0.5`) | `totals` sharp: `LL = 0.6737 [0.6718, 0.6757]`, `ECE = 0.0033 [0.0012, 0.0089]`; `totals` model: `LL = 0.6811 [0.6793, 0.6830]`, `ΔLL vs base_rate = -0.0063 [-0.0080, -0.0047]`; `ah` sharp: `LL = 0.6916 [0.6910, 0.6922]`, `ECE = 0.0020 [0.0001, 0.0080]` | `totals model vs base_rate`: `significativa`; `G1::totals` `blend_v3_1` (`-0.000133 [-0.000830, +0.000514]`): **`"no significativa"`**; `0` segmentos `ah` con `blend_v3_1` | `OBSERVADO` | `1e22b6a` | `.\research\prediction-lab\.venv\Scripts\python.exe services/models/outlook_calibration.py --record-trial` |
| **`B4`** (`calibration`) | `GLOBAL::football::btts` (`n=52,746`, `0` cuotas históricas BTTS) | `model`: `LL = 0.6891 [0.6879, 0.6904]`, `ECE = 0.0223 [0.0180, 0.0266]`, `ΔLL vs base_rate = -0.0016 [-0.0028, -0.0004]` | `significativa` en agregado global vs `base_rate` (mayoría de ligas individuales **`"no significativa"`**) | `OBSERVADO` (`model`) / `DESCONOCIDO` (sharp BTTS) | `1e22b6a` | `.\research\prediction-lab\.venv\Scripts\python.exe services/models/outlook_calibration.py --record-trial` |
| **`B4`** (`calibration`) | `NFL::moneyline` (`n=3,890` sin empates en `walk_forward_dev`) | Consenso `nflverse`: `LL = 0.6091 [0.5975, 0.6209]`, `ECE = 0.0094 [0.0060, 0.0265]`; `model` (`Minkowski v3.0`): `LL = 0.6244 [0.6141, 0.6346]`, `ECE = 0.0167 [0.0084, 0.0327]`, `ΔLL = +0.0153 [+0.0098, +0.0210]` | `ΔLL` `significativa` a favor del consenso · **`"sin cierre sharp"`** (`blend w=0.05`: `-0.00004 [-0.00028, +0.00020]`, **`"no significativa"`**, **`"sin cierre sharp"`**) | `OBSERVADO` | `1e22b6a` | `.\research\prediction-lab\.venv\Scripts\python.exe services/models/outlook_calibration.py --record-trial` |
| **`B5`** (`paper`) | Cartera prospectiva `provenance="real"` (`> 2026-11-08T20:30:00Z`, `delay >= 2.0 min`) | `n_picks = 0 / 150`, `CLV% = N/A`, `ROI% = N/A` (`0` bytes en `picks_v3_2_prospective.jsonl`) | **`"no significativa"`** (`0 / 150` picks reales; `0/60` segmentos activos) | `OBSERVADO` | `adb0313` | `.\research\prediction-lab\.venv\Scripts\python.exe services/models/paper_trading.py --provenance real --timeseries-dir ..\web-scraping\data\odds_timeseries --ledger-path data/ledger/picks_v3_2_prospective.jsonl` |
| **`B5`** (`paper`) | Fixture sintético funcional E2E (`provenance="synthetic"`, `n=4` picks / `12` eslabones, **0 aporte a meta real**) | `CLV% = +8.15% [+4.85%, +10.51%]`, `CLV_prob = +3.83 pp [+2.29, +4.83]`, `ROI% = +22.84% [-66.67%, +107.02%]`, `MaxDD = 1.00u [0.00u, 4.00u]`, paridad TS↔Py `max|Δ| = 0.0` | `CLV%` `significativa_positiva` (solo fixture sintético); `ROI%` **`"no significativa"`** | `OBSERVADO` (arnés sintético) | `adb0313` | `.\research\prediction-lab\.venv\Scripts\python.exe services/models/paper_trading.py --provenance synthetic --timeseries-dir data/ledger/fixtures/synthetic_odds_timeseries_v3_2.jsonl --model-probs data/ledger/fixtures/synthetic_model_probs_v3_2.json --results data/ledger/fixtures/synthetic_results_v3_2.json --ledger-path data/ledger/fixtures/picks_v3_2_synthetic_fixture.jsonl --settle` |
| **`B6`** (`nfl-sharp`) | Corpus de cierres sharp NFL (`nfl_sharp_closing.parquet`) y compuerta `>= 64` | `39` filas (`13` juegos `pinnacle` × `3` mercados), overround `3.27% [3.14%, 3.41%]`, lead time `7,791.2m [6,989.6m, 8,485.1m]`; **`n_settled = 0 < 64`** | Calibración sharp NFL **`"no significativa"`** (`n=0 < 64`, `production_enabled = false`) | `OBSERVADO` (corpus) / `DESCONOCIDO` (calibración sharp) | `70e08db` | `.\research\prediction-lab\.venv\Scripts\python.exe services/ingest/nfl_sharp_closing.py` |
| **`B7`** (`xi`) | Evaluación empírica XI confirmado en `walk_forward_dev` (`52,746` partidos, `52,659` c/cierre Pinnacle) | `ts_xi_published` reales `= 0 / 52,746` (`delta = 0.0`); `LL_xi = 1.012012`, `ΔLL(xi - base) = 0.000000 [0.000000, 0.000000]`, `ΔLL(xi - Pinnacle_close) = +0.015208 [+0.013595, +0.016700]` | `ΔLL(xi - base)` **`"no significativa"`**; `ΔLL vs Pinnacle_close` `significativa` (pierde vs cierre); `production_activated = false` | `OBSERVADO` (`0` datos) / `DESCONOCIDO` (efecto real `T-60m`) | `53ff835` | `.\research\prediction-lab\.venv\Scripts\python.exe research/prediction-lab/experiments/EXP_V32_xi/run_exp_v32_xi.py` |
| **`B7`** (`xi`) | Sensibilidad sintética `EXP_V32_xi` (`provenance="synthetic_sensitivity"`) | Ruido estático `σ_δ=0.12`: `ΔLL = +0.001100 [+0.000705, +0.001494]`; techo oráculo no causal `|δ|<=0.35`: `ΔLL vs base = -0.001302 [-0.001783, -0.000784]`, `ΔLL vs Pinnacle_close = +0.013906 [+0.012432, +0.015323]`; paridad TS↔Py `2.220e-16` | `significativa` en simulación sintética (aun el oráculo pierde ante cierre Pinnacle) | `INFERIDO` | `53ff835` | `.\research\prediction-lab\.venv\Scripts\python.exe research/prediction-lab/experiments/EXP_V32_xi/run_exp_v32_xi.py` |
| **`B8`** (`snapshot`) | Snapshot en vivo `live_matchday_v3_snapshot.json` (`< 72 h`) | `130` `MatchOutlook` (`84` fútbol + `46` NFL), `0` con cuota `< 72 h` (`130/130` `market: null`, `pSource: "model"`), `executable_bets_count = 0`, `max_simplex_error = 4.441e-16 < 1e-12` | Determinista exacta (`0` stakes, `0` precios sintéticos) | `OBSERVADO` | `96a8f4b` | `.\research\prediction-lab\.venv\Scripts\python.exe services/models/regenerate_live_snapshot.py --timeseries-dir ..\web-scraping\data\odds_timeseries --max-quote-age-hours 72 --out src/data/prediction/live_matchday_v3_snapshot.json --check` |
| **`B9`** (`nfl-epa`) | Candidato inactivo `model_nfl_v3_2_candidate.json` (`41` features): cobertura viva (`46` juegos) y `walk_forward_dev` (`n=3,891`) | Cobertura viva: **`4/29` (`13.79%`) $\to$ `34.37/41` (`83.83%`, `0/46` `"low_coverage"`)**; `LL = 0.622020 [0.611977, 0.632434]`; `ΔLL vs v3.0 vivo (4/29) = -0.065911 [-0.075109, -0.056734]`; `ΔLL vs v3.0 (29/29) = -0.002516 [-0.004585, -0.000523]` | `ΔLL vs v3.0 vivo` y `vs v3.0 (29/29)` en `dev` total: `significativa`; `production_activated = false` | `OBSERVADO` | `bbfdbc5` | `.\research\prediction-lab\.venv\Scripts\python.exe research/prediction-lab/experiments/EXP_V32_nfl_epa/run_experiment.py --record-trial` |
| **`B9`** (`nfl-epa`) | Candidato `v3.2` en `DEV_OOS 2020..2024` (`n=1,339`), vs consenso `nflverse` (`n=3,890`) y vs corpus sharp `B6` | `ΔLL DEV_OOS vs v3.0 (29/29) = -0.003153 [-0.006492, +0.000129]`; `ΔLL vs consenso nflverse = +0.013040 [+0.007707, +0.017938]`; vs cierre sharp `B6`: `n = 0 < 64` | `DEV_OOS`: **`"no significativa"`**; vs consenso: `significativa` a favor del consenso · **`"sin cierre sharp"`**; vs `B6`: **`"no significativa"`** (`n=0 < 64`) | `OBSERVADO` (`dev` / consenso) / `DESCONOCIDO` (vs sharp `B6`) | `bbfdbc5` | `.\research\prediction-lab\.venv\Scripts\python.exe research/prediction-lab/experiments/EXP_V32_nfl_epa/run_experiment.py --record-trial` |

---

## 5. Inventario Completo de Lo Que Quedó Pendiente y Por Qué

1. **`capture_status = "prospective_capture_pending"` en `web-scraping` (`B3`):**
   - **Estado actual:** `0` fuentes activas y `0` filas reales en `data/odds_timeseries/`.
   - **Causa exacta:** las `2` fuentes `api_only` requieren credenciales oficiales en variables de entorno (`THE_ODDS_API_KEY` y/o `BETFAIR_APP_KEY` + `BETFAIR_SESSION_TOKEN`), mientras que las `5` fuentes web directas están bloqueadas por protecciones Cloudflare/anti-bot o prohibiciones explícitas de scraping en sus ToS (`§0 Regla #7`).
2. **`0 / 150` picks reales en el ledger prospectivo (`B5`):**
   - **Estado actual:** `data/ledger/picks_v3_2_prospective.jsonl` tiene `0` bytes (`head_hash = 0000...0000`) y `production_segments_v3_1.json` mantiene **`0 / 60` segmentos habilitados**.
   - **Causa exacta:** sin flujo vivo de cuotas multi-tick desde `B3`, `paper_trading.py` en modo `provenance = "real"` no recibe pares sharp + recreativos con `execution_delay >= 2.0 min`. Ningún registro del fixture sintético cuenta ni puede mezclarse con la cartera real (`PaperTradingProvenanceError`).
3. **`0 < 64` partidos NFL liquidados con cierre sharp real (`B6` y activación de `B9`):**
   - **Estado actual:** `nfl_sharp_closing.parquet` reúne `39` filas válidas (`13` juegos futuros de `pinnacle` capturados el `2026-11-09`), pero `n_settled_games_with_sharp_closing = 0` (`shortfall = 64`).
   - **Causa exacta:** los `13` partidos aún no tenían marcador final liquidado al corte del corpus y una temporada NFL requiere varias semanas de captura sharp continua (`>= 4` semanas completas $\approx 64$ juegos) para evaluar `ΔLL` y `CLV%` contra un cierre sharp real. Por ello `model_nfl_v3_2_candidate.json` permanece en `status = "candidate"` (`production_activated = false`).
4. **`0 / 52,746` timestamps históricos reales `ts_xi_published` en fútbol (`B7`):**
   - **Estado actual:** `EXP_V32_xi` mantiene `production_activated = false` y declara el efecto real en `T-60m` como `DESCONOCIDO`.
   - **Causa exacta:** ni `football-data.co.uk` ni `roster_availability.json` (`5,908` filas todas de `2026-11-09..10` sin hora de publicación histórica pre-`2025-02-02`) contienen timestamps auditables al segundo de publicación oficial del XI, y las `2` APIs oficiales (`api_football`, `football_data_org`) carecen hoy de `API_FOOTBALL_KEY` / `FOOTBALL_DATA_API_KEY`.
5. **Integración visual en `apps/web`, `packages/ui` y `packages/spacetime` (`B8`):**
   - **Estado actual:** `0` archivos modificados fuera de `prediction-lab` y `web-scraping`.
   - **Causa exacta:** restricción explícita de fronteras (`§0 Regla #9`). El contrato JSON `MatchOutlook[]` ya está materializado en `src/data/prediction/live_matchday_v3_snapshot.json` y las instrucciones exactas de consumo están documentadas en [`research/prediction-lab/coordination/v3_2/SYNC_NOTES.md`](../coordination/v3_2/SYNC_NOTES.md).

---

## 6. Tabla Consolidada de Fuentes que Requieren Decisión del Propietario (`B3` Cuotas + `B7` Alineaciones XI)

En cumplimiento de `§0 Regla #7` (cero evasión anti-bot, cero suplantación TLS/huellas, respeto estricto a `robots.txt` y ToS), las **14 fuentes auditadas** (`7` de cuotas en `B3` + `7` de alineaciones XI en `B7`) quedan clasificadas así (`OBSERVADO`):

| Dominio | Fuente (`source_id`) | Clasificación Vigente | Credencial Oficial o Motivo Exacto Legal / Anti-Bot | Acción Requerida del Propietario |
|---|---|---|---|---|
| **Cuotas (`B3`)** | `the_odds_api` | `api_only` | API REST v4 comercial con licencia expresa de ingesta automatizada (desbloquea legalmente Pinnacle, Smarkets, Betfair Ex, Bet365, DraftKings, FanDuel, BetMGM y Codere). | Aprovisionar `THE_ODDS_API_KEY` en entorno de `web-scraping`. |
| **Cuotas (`B3`)** | `betfair_exchange` | `api_only` | API-NG JSON-RPC oficial (`listMarketCatalogue` / `listMarketBook`); acceso documentado para titulares con App Key. | Aprovisionar `BETFAIR_APP_KEY` + `BETFAIR_SESSION_TOKEN` (y ajustar comisión de mercado al evaluar). |
| **Cuotas (`B3`)** | `pinnacle` | `blocked_pending_owner_decision` | ToS de `pinnacle.com` prohíben bots/scrapers sobre web y guest API `guest.api.arcadia.pinnacle.com`; el scraper heredado requería `solve_cloudflare=True`. | Contratar feed oficial B2B (`PINNACLE_B2B_API_KEY`) o consumir Pinnacle vía `the_odds_api`. |
| **Cuotas (`B3`)** | `smarkets` | `blocked_pending_owner_decision` | Sonda limpia sin suplantación devuelve `HTTP 403` con cabecera `CF-Mitigated: challenge` en `api.smarkets.com/v3/events/`. | Solicitar acceso oficial de trading API a Smarkets (£150 fee + `SMARKETS_SESSION_TOKEN`) o consumir vía `the_odds_api`. |
| **Cuotas (`B3`)** | `caliente` | `blocked_pending_owner_decision` | Sonda limpia devuelve `HTTP 403` con `CF-Mitigated: challenge`; ToS de Caliplay prohíben captura automatizada y no existe API pública. | Decisión legal/comercial escrita o convenio de afiliado/datos; mantener fuera del colector automático mientras tanto. |
| **Cuotas (`B3`)** | `codere` | `blocked_pending_owner_decision` | `https://apuestas.codere.mx/robots.txt` declara `User-agent: *` / `Disallow: /`; `m.codere.mx` responde `HTTP 404`; ToS de Libros Foráneos restringen uso a personal no automatizado (parser estructurado listo en `scrapers/sources/codere.py`). | Consumir cuotas Codere vía `the_odds_api` o gestionar autorización escrita del operador. |
| **Cuotas (`B3`)** | `action_network` | `blocked_pending_owner_decision` | `actionnetwork.com/terms` prohíbe expresamente cualquier `"deep-link, page-scrape, robot, spider or other automatic device"`; el código previo usaba `impersonate="chrome"`. | Mantener bloqueada salvo licencia comercial escrita B2B con Action Network. |
| **XI (`B7`)** | `api_football` | `api_only` | Endpoint comercial oficial `https://v3.football.api-sports.io/fixtures/lineups` (cubre Liga MX + Top-5 europeas + UCL, documentando `timestamp_kind="first_seen_poll"` con cadencia `<= 3.69 min`). | Aprovisionar `API_FOOTBALL_KEY` en entorno. |
| **XI (`B7`)** | `football_data_org` | `api_only` | Endpoint oficial `https://api.football-data.org/v4/matches/{id}` con términos explícitos de API para ligas europeas cubiertas por el plan. | Aprovisionar `FOOTBALL_DATA_API_KEY` en entorno. |
| **XI (`B7`)** | `espn_site_api` | `blocked_pending_owner_decision` | Sonda limpia devuelve `HTTP 403 Forbidden` (`Server: AkamaiGHost`) y Disney Terms of Use §2.B.x prohíben dispositivos automatizados/scraping sin permiso escrito. | Mantener bloqueada salvo licencia B2B escrita. |
| **XI (`B7`)** | `sofascore` | `blocked_pending_owner_decision` | `api.sofascore.com` responde `HTTP 403 Forbidden` (`X-Cache: Varnish`) a clientes HTTP estándar y sus ToS prohíben scraping sin licencia comercial B2B. | Contratar feed B2B oficial o usar `api_football`. |
| **XI (`B7`)** | `fotmob` | `blocked_pending_owner_decision` | `fotmob.com/robots.txt` declara `Disallow: /api/*` y exige token anti-bot firmado (`x-mas`). | Mantener bloqueada (prohibido evadir `robots.txt` o firmar tokens anti-bot). |
| **XI (`B7`)** | `flashscore` | `blocked_pending_owner_decision` | `flashscore.com/robots.txt` declara `Disallow: /live/`, `/scheduled/`, `/finished/` y sus ToS prohíben extracción automatizada. | Mantener bloqueada. |
| **XI (`B7`)** | `rotowire_web` | `blocked_pending_owner_decision` | `rotowire.com/termsandconditions.php` (Art. VI) prohíbe scraping sin acuerdo comercial `/partner/` y las páginas HTML carecen de `ts_xi_published` al segundo. | Contratar API comercial `/partner/` de RotoWire o usar `api_football`. |

---

## 7. Comandos Exactos para Reproducir Todo de Punta a Punta (PowerShell)

```powershell
# ==============================================================================
# 1. WORKTREE: prediction-lab — Integridad SHA-256 de artefactos v3.1 y v3.2
# ==============================================================================
Set-Location "C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\prediction-lab"

@(
  "src/data/prediction/production_segments_v3_1.json",
  "src/data/prediction/blend_weights_v3_1.json",
  "src/data/prediction/pick_policy_v3_1.json",
  "src/data/prediction/stale_lines_config.json",
  "src/data/prediction/model_motor_a.json",
  "src/data/prediction/model_nfl.json",
  "src/domain/prediction/engine.ts",
  "services/models/artifacts/sealed_holdout_v3_1_eval.json",
  "src/data/prediction/outlook_calibration_v3_2.json",
  "services/models/artifacts/outlook_calibration_v3_2.json",
  "src/data/prediction/service_constants_v3_2.json",
  "src/data/prediction/live_matchday_v3_snapshot.json",
  "data/ledger/picks_v3_2_prospective.jsonl",
  "data/ledger/fixtures/picks_v3_2_synthetic_fixture.jsonl",
  "research/prediction-lab/data/processed/nfl_sharp_closing.parquet",
  "research/prediction-lab/experiments/EXP_V32_xi/exp_v32_xi_results.json",
  "src/data/prediction/model_nfl_v3_2_candidate.json",
  "services/models/artifacts/holdout_trial_registry.jsonl"
) | ForEach-Object { "$( (Get-FileHash -Algorithm SHA256 $_).Hash.ToLower() )  $_" }

# ==============================================================================
# 2. Reproducción de pipelines y verificaciones por bloque (B4, B5, B6, B7, B8, B9)
# ==============================================================================
# B4 — Calibración causal en walk_forward_dev (< 2025-02-02T17:30:00Z, 98 segmentos)
.\research\prediction-lab\.venv\Scripts\python.exe services/models/outlook_calibration.py

# B6 — Corpus de cierre sharp NFL y compuerta >= 64 juegos liquidados
.\research\prediction-lab\.venv\Scripts\python.exe services/ingest/nfl_sharp_closing.py

# B8 — Verificación determinista del snapshot en vivo (130 MatchOutlook, < 72h, 0 stakes)
.\research\prediction-lab\.venv\Scripts\python.exe services/models/regenerate_live_snapshot.py `
  --timeseries-dir ..\web-scraping\data\odds_timeseries `
  --max-quote-age-hours 72 `
  --out src/data/prediction/live_matchday_v3_snapshot.json `
  --check

# B5 — Runner idempotente de paper-trading (modo real y fixture sintético aislado)
.\research\prediction-lab\.venv\Scripts\python.exe services/models/paper_trading.py `
  --provenance real `
  --timeseries-dir ..\web-scraping\data\odds_timeseries `
  --ledger-path data/ledger/picks_v3_2_prospective.jsonl

.\research\prediction-lab\.venv\Scripts\python.exe services/models/paper_trading.py `
  --provenance synthetic `
  --timeseries-dir data/ledger/fixtures/synthetic_odds_timeseries_v3_2.jsonl `
  --model-probs data/ledger/fixtures/synthetic_model_probs_v3_2.json `
  --results data/ledger/fixtures/synthetic_results_v3_2.json `
  --ledger-path data/ledger/fixtures/picks_v3_2_synthetic_fixture.jsonl `
  --settle

# B7 — Colector legal XI en seco (sin mutar disco) y experimento walk-forward EXP_V32_xi
.\research\prediction-lab\.venv\Scripts\python.exe research/prediction-lab/experiments/EXP_V32_xi/xi_collector.py --dry-run
.\research\prediction-lab\.venv\Scripts\python.exe research/prediction-lab/experiments/EXP_V32_xi/run_exp_v32_xi.py

# B9 — Evaluación walk-forward del candidato inactivo NFL Minkowski EPA (41 features)
.\research\prediction-lab\.venv\Scripts\python.exe research/prediction-lab/experiments/EXP_V32_nfl_epa/run_experiment.py

# ==============================================================================
# 3. Suites automatizadas completas en prediction-lab (120 Pytest + 1,153 Vitest)
# ==============================================================================
$env:PYTHONDONTWRITEBYTECODE = "1"
.\research\prediction-lab\.venv\Scripts\python.exe -B -m pytest `
  services/models `
  research/prediction-lab/experiments/EXP_V32_xi `
  research/prediction-lab/experiments/EXP_V32_nfl_epa -v

npx.cmd vitest run
git checkout -- evidence/statistical-tests/aztecavet-experiments.json

# ==============================================================================
# 4. WORKTREE: web-scraping — Programador multi-tick legal y suite Pytest (7 tests)
# ==============================================================================
Set-Location "C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\web-scraping"
.\.venv\Scripts\python.exe scrapers/cadence_scheduler.py --once
.\.venv\Scripts\python.exe -m pytest tests -v
```
