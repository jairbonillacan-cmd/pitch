# 27 · Auditoría Adversarial y Remediación Integral `PitchLab v5.1 Candidate` (`REM_00`–`REM_08`)

> **Estado:** `status = "candidate"` · `production_activated = false` · **Fecha:** 2026-11-19 · **Rama:** `prediction-lab`  
> **Gobernanza y Anti-Fuga (`OBSERVADO`):** `0` bytes modificados en los **`11` artefactos congelados `v3.0`/`v3.1`/`v3.2`** (`SHA-256` verificado bit a bit), `0` accesos a `holdout_sealed` (`match_date < 2025-02-02T17:30:00Z`, `holdout_sealed_untouched: true`), **cluster-bootstrap determinista** (`mulberry32`, `1,000` remuestreos por `match_date` / `game_id` / `match_id`), paridad IEEE-754 `< 10⁻¹²` Python ↔ TypeScript, **`0` errores** en `tsc --noEmit --strict --noUncheckedIndexedAccess`, **`26/26` suites Vitest (`238/238` tests)** incl. los **`12` axiomas Red-Team permanentes** en `tests/prediction/v5_1_remediation.test.ts`, **`31/31` tests Pytest** (`sealed_holdout` + `EXP_V40`–`EXP_V56`) y `0` claves prohibidas (`stake`, `kelly`, `ev`, `tier`).

---

## 1. Resumen Ejecutivo de la Auditoría de 3 Pasadas (`22` Hallazgos Remediados)

Tras auditar en tres pasadas consecutivas la suite `PitchLab v5.0 Candidate` (`EXP_V47`, `EXP_V50`–`EXP_V56`), se detectaron **22 defectos estructurales, estadísticos, de calibración y de ingeniería** clasificados por severidad (`A1`–`A6` críticos, `B1`–`B4` metodológicos, `C1`–`C5` degradación/bloat y `D1`–`D7` calibración/precisión). La fase de remediación **`PitchLab v5.1` (`REM_00`–`REM_08`)** corrigió los 22 hallazgos de raíz y blindó su no-regresión mediante una batería permanente de **12 axiomas Red-Team**.

### Tabla Comparativa Maestra: `Antes (v5.0)` → `Después (v5.1 Remediado)` (`OBSERVADO`)

| ID | Severidad | Módulo / Experimento | Diagnóstico en `v5.0` (`OBSERVADO`) | Remediación Ejecutada en `v5.1` (`OBSERVADO`) |
|---|---|---|---|---|
| **`A1`** | Crítico | `REM_01` / `EXP_V54` / `EXP_V56` | `live_matchday_v5_candidate_snapshot.json` copiaba `pHome/pDraw/pAway` directamente desde `live_matchday_v3_snapshot.json` (bypass `130/130`) y violaba `P(A ∪ B) >= P(A)` en `12/84` partidos de fútbol (`pEarlyPayout < corePHome`). | Regenerado vía `regenerate_candidate_matchday_v5.py`: **`0 / 130` copias directas de `v3`**, **`82 / 84`** clubes resueltos con `Tachyon v5.1 + Horizon-Goals 4-Param` y **`46 / 46` NFL** con `Minkowski EPA` real; anclaje algebraico exacto de `pRegularWin = corePHome` → **`0 / 84` violaciones de Early Payout** (`237 ok`, `5 partial_coverage`, `0 fallback_prior`). |
| **`A2`** | Crítico | `REM_04` / `EXP_V52` | En NFL `Minkowski v5.0`, la PMF discreta de márgenes tenía `Std(50/50) = 14.93` (sobre-dispersa, `P(M >= 35 | p=0.92) = 36.3%`) y el ATS real perdía frente a moneda (`LL = 0.70442 > ln 2`). | Deconvolución cuadrática `-c_m·m²` (`c_m = 0.000525`) + posterior de spread de mercado (`w_sp = 0.16`): **`Std(50/50): 14.93 → 13.31`** (exacto al empírico VAL), `P(M >= 35 | p=0.92) = 13.82%`, **Real ATS OOS (`n = 1,311`): `LL 0.70442 → 0.69286`** (bate a `ln 2 = 0.69315`, `ECE = 1.98%`, `ΔLL vs Raw = -0.01156` `significativa`) y push `±3/±7`: `7.85%` vs `7.66%` observado. |
| **`A3`** | Crítico | `REM_02` / `EXP_V50` | La Matriz 4-Param aplicaba doble inflación diagonal (`w_rho_blend > 0`) causando sesgo `O2.5 = -1.72 pp` y un bug de índice `u_hi` en lugar de `u2_hi` en `diagonal_score_solver.py:405`. | Bug `u_hi → u2_hi` corregido y selección en `VAL <= 2019` de **`w_rho_blend = 0.0`** (`rho_prior = -0.105`, `r = 500.0` clubes / `r = 24.0` Meridian): error de cono `1X2 = 1.554 × 10⁻¹⁵`, **`O2.5 OOS bias: -1.72 pp → -0.59 pp` (`ECE = 0.70%`)**, **`BTTS OOS ΔLL = -0.000264` (`significativa`)** con `0.007 pp` de diferencia frente al baseline `v3.5` (cero inflación extra). |
| **`A4`** | Crítico | `REM_02` / `EXP_V50` | En `Modo B` Apertura (`EXP_V50`), se comparaba contra Pinnacle Open de-vig **proporcional** (que carga *favorite-longshot bias*), produciendo una ganancia inflada (`ΔLL = -0.00044`). | Benchmark actualizado a **Power De-Vig** (estándar institucional) + reporte explícito de cierre Pinnacle Power: `Modo B OOS (n = 26,587)`: **`0.99158 → 0.99157` (`ΔLL = -0.00002`, `"no significativa"`)** frente a Pinnacle Open Power (`0.98762` en cierre, `ΔLL = +0.00399`). Transparencia total sin afirmaciones de *edge* artificial. |
| **`A5`** | Crítico | `REM_07` / `EXP_V47` | La física MLB `v4.0` (`woba_zero_floor = 0.0`) comprimía la sensibilidad ofensiva (`0.345` vs `0.285 wOBA` daba `< 1.25×` carreras en vez de `~1.5–1.7×`). | Añadido `woba_zero_floor = 0.195` (retrocompatible por defecto `0.0` en `v3.6`): ratio ofensivo **`elite(.345)/weak(.285) = 1.667×`** (`>= 1.38×`), `MLB 2024 WinPct RMSE: 0.0759 → 0.0310` (ajuste estructural intra-temporada). |
| **`A6`** | Crítico | `REM_05` / `EXP_V55` | Las matrices de correlación `SGP` (`8×8` fútbol y `6×6` NFL) mezclaban residuales con totales brutos (confundiendo calidad pre-partido con correlación intra-partido) y `SoT` usaba aproximación de tiros. | **100% residualización** de factores sobre expectativas causales pre-partido (`t' < t`), `SoT` causal real y selección honesta de `df_nu` en `VAL <= 2019`: Fútbol **`student_t (ν = 5.0)`** (`3-Leg ΔLL vs Indep = -0.06927`, `vs Gaussian = -0.00044`, ambas `significativa`); NFL **`gaussian (ν = 500.0)`** (`Neg-Trap ΔLL = -0.01713` `significativa`). |
| **`B1`** | Metodológico | `REM_00` / Toda la suite | El bootstrap i.i.d. por fila subestimaba errores estándar cuando múltiples apuestas/jugadores compartían el mismo partido o jornada. | Creado `services/models/cluster_bootstrap.py` (`cluster_bootstrap_diff`, `cluster_bootstrap_binary`, `cluster_bootstrap_multiclass`, `safe_ece_binary`, `safe_promoted_ece`) y adoptado en **`EXP_V50`–`EXP_V55`** agrupando por `match_date` / `match_id` / `game_id`. |
| **`B2`** | Metodológico | `REM_05` / `EXP_V53` / `EXP_V55` | `EXP_V53` y `EXP_V55` filtraban titulares con `minutes >= 45` (ex-post), introduciendo sesgo de supervivencia al excluir lesionados y expulsados tempranos (`11.7%`). | Reemplazado por filtro **100% causal pre-partido `prematch_ewm_minutes >= 58`**: `EXP_V53` (`n = 342,260` OOS) incluye honestamente **`40,050` (`11.70%`) salidas `< 45'`** y sigue venciendo significativamente a `v3.6` en `4/4` familias (`goals -0.00064`, `assists -0.00013`, `G+A -0.00031`, `yellows -0.00014`). `EXP_V55` Player-Linked causal (`n = 91,818`, `17,750` juegos): `2-Leg ΔLL = -0.00744 (ECE 1.36%)`, `3-Leg ΔLL = -0.02050 (ECE 0.91%)`. |
| **`B3`** | Metodológico | `REM_07` / `EXP_V47` | `EXP_V47` etiquetaba como validación OOS un ajuste de tablas agregadas intra-temporada (`MLB/NHL/NCAAF`). | Reetiquetado explícitamente en JSON, código y documentación como **`"in_season_structural_fit_not_oos"`** y **`"validation_status": "structural_prior_no_game_oos"`**, más priors explícitos FCS→FBS (`Sacramento State Hornets`, `Missouri State Bears`, `n = 228` franquicias). |
| **`B4`** | Metodológico | `REM_03` / `EXP_V51` | En `EXP_V51`, el modelo `Red Cards` ajustaba `alpha`/`omega` sobre predicciones in-VAL en la misma ventana `<= 2019`. | División estricta cronológica `<= 2017` (entrenamiento) → `2018..2019` (calibración `alpha`, `r`, `omega`) → `2020..2024` (OOS walk-forward): `Red Cards Over 0.5` **`LL = 0.46656`, `ECE = 0.69%`, `ΔLL vs Climatología = -0.00520` (`significativa`)**. |
| **`C1`** | Ingeniería | `REM_03` / `EXP_V51` | Cobertura de árbitros en Big-7 (`s >= 2012`) de solo **`15.8%`** por ausencia de enlace con `tm_games.csv.gz`. | Puente causal `tm_games.csv.gz` por `(fecha, liga, equipos normalizados)`: cobertura arbitral Big-7 sube de **`15.8% → 94.3%`** (`+31,488` partidos, `839` árbitros exportados). |
| **`C2`** | Bloat / Overfit | `REM_03` / `EXP_V51` | `model_soccer_micro_v5_0_candidate.json` pesaba **`540 KB`** por serializar árboles `HGB` ruidosos que empeoraban `MAE` y `LL` en `yellow_cards`/`fouls`. | Compuerta estricta en `VAL (2018..2019)` (`ΔDeviance < -0.0025` y `ΔMAE < -0.0020`) + serialización `null` cuando `w_hgb == 0.0`: **los `5/5` árboles ruidosos podados**, archivo reducido **`540 KB → 14.1 KB` (`-97.4%`)**, `yellow_cards` mejora significativamente vs `v4.0` (`ΔLL = -0.00023`, `ECE 1.93% → 1.42%`) y `fouls MAE` queda óptimo (`4.2056`, `ECE = 0.53%`). |
| **`C3`** | Física / Copula | `REM_03` / `EXP_V51` | `Booking Points (10·Y + 25·R)` asumía independencia `Y ⊥ R` (`omega = 0`) ignorando que `E[Y|R=1] ≈ 5.01` vs `E[Y|R=0] ≈ 3.96`. | Factorización condicional exacta `P(Y=y, R=r) = P(R=r)·P_NB(Y | μ_Y(r), r_cond)` con conservación exacta de `E[Y]` y `Var[Y]`, estimando **`γ_R = 0.1680`** vía **MLE condicional Poisson** en `VAL <= 2019`. Las `3/3` líneas (`35.5`, `45.5`, `55.5`) baten significativamente a la climatología (`-0.01007`, `-0.00976`, `-0.00857`, `ECE 1.13%–1.26%`). |
| **`C4`** | Calibración | `REM_04` / `EXP_V52` & `REM_06` / `EXP_V54` | En `EXP_V52`, los QB titulares se filtraban por `attempts >= 15` (ex-post), inflando el `ECE` de `qb_rush_attempts` al **`7.64%`**; en `EXP_V54`, los multiplicadores de tarjeta roja (`0.62× / 1.42×`) eran heurísticos. | En `EXP_V52`, selección causal de QB titular por **1.er dropback** (`n = 7,086`, incluye `194` salidas tempranas `< 15`): **`qb_rush_attempts ECE: 7.64% → 2.62%`** (`ΔLL = -0.01612` `significativa`) y **`qb_sacks_taken ECE = 2.04%`** (`ΔLL = -0.05088` `significativa`). En `EXP_V54`, MLE Poisson empírico sobre `59,612` juegos `VAL <= 2019`: **`inst_own = 0.4778×`, `inst_opp = 1.7351×`**. |
| **`C5`** | Honestidad | `REM_07` / `EXP_V47` & `REM_06` / `EXP_V54` | NHL asumía `goalie_confirmed = True` sin feed de porteros; deportes de puntos (`NFL/NBA/MLB`) carecían de validación OOS en `EXP_V54`. | NHL pasa a **`goalie_confirmed = False`** con penalización epistémica honesta. En `EXP_V54`, descarga liviana `CC-BY-4.0` de columnas `nflverse` valida **`NFL +17 EP` (`n = 2,814` tickets, `ECE = 2.03%`)** y **`NFL In-Play Q3` (`n = 1,407` juegos, `LL = 0.39607`, `ΔLL = -0.21272` `significativa`, `ECE = 3.62%`)**; `NBA` y `MLB` quedan etiquetados honestamente como `"theoretical_reflection_unvalidated"`. |
| **`D1`** | Física | `REM_07` / `EXP_V47` | El total promedio MLB quedaba subestimado por omitir carreras no limpias (`~8.48` vs `~8.80`). | Calibrado `unearned_runs_mult = 1.032`: **`MLB Avg Total Runs = 8.746`** (exacto dentro de `[8.65, 8.95]`). |
| **`D2`** | Calibración | `REM_04` / `EXP_V52` | Totales objetivos NFL tenían `ECE = 4.99%` en `v4.0` y `Overtime` carecía de compuerta de poda estricta. | `LeagueScoringEnvEWM(t)` + Kernel Discreto de Totales Clave reduce el **`ECE` objetivo OOS de `4.99% → 2.23%`** (`n = 8,058`, `1,343` juegos) con auditoría explícita de poda para `Overtime` (`LL = 0.22392`). |
| **`D3`** | Datos sucios | `REM_05` / `EXP_V53` | El calibrador Knockout `v5.0` incluía tandas de penales (`max_goals_val = 15.0`) que invertían `first_leg_multiplier = 1.07 > 1.0`. | Purga de **`1,025` tandas de penales** y normalización de **`205` prórrogas (ET)** a `90'`: **`max_goals_val = 8.0`**, **`first_leg = 0.9687 < 1.0`**, `second_leg = 1.0580`, `final = 1.0245` (`significativa`). |
| **`D4`** | Física In-Play | `REM_06` / `EXP_V54` | Los parámetros de segunda mitad (`2H`) en `EXP_V54` eran constantes heurísticas y el DP tardaba `> 200 ms/partido`. | Calibración en `VAL <= 2019` (`tied_damp = -0.030`, `lead_open = 0.000`, `trail_push = +0.080`, `tempo_prior_w = 24.0`) + DP vectorizado NumPy (`63.4 ms/partido` en batch Python, `< 1 ms` TS): **`HT→FT 1X2 ΔLL = -0.00516` (`significativa`)**, **`HT→FT O2.5 ΔLL = -0.00592` (`significativa`)** en `n = 26,650` OOS. |
| **`D5`** | Precisión | `REM_05` / `EXP_V55` | El cuantil Student-t usaba expansión Cornish-Fisher aproximada y QMC suavizado (`bw = 0.08`) dejaba un sesgo sistemático de `0.24 pp` frente a `MVN` exacto; Raikov omitía `rho` de Dixon-Coles. | Implementados **cuantil Student-t exacto** (bisección 60 pasos sobre Beta incompleta regularizada: **error máx. vs `scipy.stats.t.ppf = 3.642 × 10⁻¹⁴`**), **integración analítica Rao-Blackwell (Genz 1992)** en la última pata (**sesgo máx. QMC vs MVN = `0.0270 pp`** `< 0.10 pp`) y `dixonColesRho = -0.08` en `Raikov+DC`. |
| **`D6`** | Reporte / Epistémica | `REM_05`/`REM_06`/`REM_08` | `promoted_ece_ge_50pct` reportaba `0.0%` engañoso cuando `n = 0`; las bandas epistémicas `v5.0` no tenían calibración conformal empírica OOS; el guardrail no detectaba comas decimales (`62,5%`) ni porcentajes de no-favoritos. | `safe_promoted_ece` devuelve **`null`** cuando `n == 0` (`assists` y `yellow_cards` en `EXP_V53`); calibración **Split-Conformal + Inductive Venn-Abers** en `EXP_V56` logra cobertura OOS **`92.5%` en Fútbol (`345` estratos, `10/10` deciles)** y **`100.0%` en NFL (`15` estratos, `10/10` deciles)** con paridad `< 10⁻¹²`; guardrail ampliado en `narrative_guardrail.ts` (`validateNarrativeAgainstFactSheet` + `validateMatchMathematicalInvariants`) detecta comas, no-favoritos, `0%/100%` y toda inversión matemática. |
| **`D7`** | Transparencia | `REM_05` / `EXP_V53` | Las líneas `1.5+` solo se comparaban contra Poisson crudo y `shots`/`SoT` no advertían la ausencia de spline player-match log. | `EXP_V53` reporta `1.5+` frente a **Raw NB** (todas significativas `-0.00154` a `-0.00296`) **y frente a Platt `1.5+`** (honesto: `assists -0.00001` sig., `goals/G+A` empates no significativos); `shots`/`SoT` etiquetados `"empirical_bayes_nb_no_player_match_log_spline"`. |

---

## 2. Arquitectura Consolidada `v5.1` y Manifiesto Canónico

Para erradicar la dispersión de artefactos manteniendo **100% retrocompatibilidad** con `v3.3`–`v4.0`, `REM_08` introduce dos puntos de entrada canónicos:

- **Barrel TypeScript único:** [`src/domain/prediction/v5_index.ts`](../../src/domain/prediction/v5_index.ts) — re-exporta de forma tipada (`tsc --strict --noUncheckedIndexedAccess` con `0` errores) todos los motores `v5.1`, calibradores conformales y guardrails.
- **Registro Canónico con `SHA-256`:** [`src/data/prediction/candidate_registry_v5_1.json`](../../src/data/prediction/candidate_registry_v5_1.json) — generado por [`services/models/build_candidate_registry_v5_1.py`](../../services/models/build_candidate_registry_v5_1.py), indexa los **`11` artefactos activos `v5.1`** (`status = "candidate"`, `production_activated = false`, `holdout_sealed_untouched = true`) y verifica criptográficamente los **`11 / 11` artefactos congelados `v3.0`/`v3.1`/`v3.2`**.

### Verificación Criptográfica `SHA-256` de los `11` Artefactos Congelados (`OBSERVADO`)

| Artefacto Congelado (`v3.0` / `v3.1` / `v3.2`) | Prefijo `SHA-256` Verificado | Bytes Modificados |
|---|---|---:|
| `src/domain/prediction/engine.ts` | `77dc721430ff17b1` | `0` |
| `src/domain/prediction/outlook.ts` | `26933d21438d5298` | `0` |
| `src/domain/prediction/service.ts` | `53fbf32117ab6a64` | `0` |
| `src/data/prediction/live_matchday_v3_snapshot.json` | `1dace760d68442e7` | `0` |
| `src/data/prediction/production_segments_v3_1.json` | `0bc03bbff96a5d82` | `0` |
| `src/data/prediction/blend_weights_v3_1.json` | `b29d7a451f601112` | `0` |
| `src/data/prediction/pick_policy_v3_1.json` | `2359c8f8822ea394` | `0` |
| `src/data/prediction/stale_lines_config.json` | `8bcb9c7be93270cd` | `0` |
| `src/data/prediction/model_motor_a.json` | `3c72967eddc79bb7` | `0` |
| `src/data/prediction/model_nfl.json` | `e74ae241875739d2` | `0` |
| `services/models/artifacts/sealed_holdout_v3_1_eval.json` | `5c9e550bfd7889e4` | `0` |

---

## 3. Batería Permanente de `12` Axiomas Red-Team (`tests/prediction/v5_1_remediation.test.ts`)

1. **`Axioma 1` (Dominancia Early Payout):** `0 / 84` violaciones de `pHomeEarlyPayoutWin >= corePHome` y `pAwayEarlyPayoutWin >= corePAway` en el snapshot vivo + verificación algebraica en `evaluateSoccerEarlyPayoutAndInPlay`.
2. **`Axioma 2` (Cero Bypass `v3`):** `0 / 130` copias directas de `v3` en Fútbol y NFL; `46 / 46` NFL con `Minkowski EPA` real y `>= 75 / 84` (`82 / 84` observados) clubes de fútbol resueltos con `Tachyon v5.1`.
3. **`Axioma 3` (Poda HGB y Bloat):** `0` árboles HGB serializados cuando `w_hgb == 0.0` y tamaño de `model_soccer_micro_v5_0_candidate.json < 150 KB` (`14.1 KB` observados).
4. **`Axioma 4` (Honestidad de Slices Vacíos):** `promoted_ece_ge_50pct === null` (nunca `0.0`) siempre que `promoted_n_ge_50pct === 0`.
5. **`Axioma 5` (NFL Deconvolución y ATS Real):** `Std(M | 50/50) ∈ [13.0, 13.8]` (`13.31`), Real ATS posterior `LL <= ln(2) + 0.002` (`0.69286`) y `ECE < 2.5%` (`1.98%`).
6. **`Axioma 6` (Matriz 4-Param sin Doble Inflación):** `rho_draw_blend_weight === 0.0`, `|bias O2.5| < 0.7 pp` (`-0.59 pp`), `0` inflación extra en `BTTS` con mejora significativa (`ΔLL = -0.000264`) y error de cono `< 10⁻¹²` (`1.554 × 10⁻¹⁵`).
7. **`Axioma 7` (Knockout 90' Limpio):** `first_leg_multiplier < 1.0` (`0.9687`), `max_goals_val <= 10` (`8.0`) y `shootouts_purged > 0` (`1,025`).
8. **`Axioma 8` (Física MLB Remediada):** Ratio ofensivo `elite(.345)/weak(.285) >= 1.38×` (`1.667×`) y total promedio en `[8.65, 8.95]` (`8.746`).
9. **`Axioma 9` (Precisión Numérica SGP):** Error `studentTQuantileExact < 10⁻⁶` (`3.642 × 10⁻¹⁴`), sesgo QMC bivariado vs MVN `< 0.10 pp` (`0.0270 pp`) y coherencia Fréchet en `Raikov + Dixon-Coles`.
10. **`Axioma 10` (Disciplina Condicional y Árbitros):** `booking_points_gamma_red > 0` (`0.1680`) y cobertura arbitral Big-7 `> 90%` (`94.31%`).
11. **`Axioma 11` (Venn-Abers Conformal y Guardrail Ampliado):** Cobertura OOS `>= 88%` en Fútbol (`92.5%`) y NFL (`100.0%`), paridad `< 10⁻¹²` TS↔Python, y detección determinista de comas decimales (`62,5%`), no-favoritos alucinados y certezas `0%/100%`.
12. **`Axioma 12` (Inmutabilidad Criptográfica):** `11 / 11` prefijos `SHA-256` intactos y consistencia íntegra de `candidate_registry_v5_1.json`.

---

## 4. Comandos de Reproducción Exactos

```powershell
# 1. Verificación TypeScript estricta (0 errores)
npx.cmd tsc --noEmit --strict --noUncheckedIndexedAccess --target ES2022 --module ESNext --moduleResolution bundler --resolveJsonModule --esModuleInterop --skipLibCheck src/domain/prediction/v5_index.ts tests/prediction/v5_0_suite.test.ts tests/prediction/v5_1_remediation.test.ts

# 2. Suite completa Vitest (26/26 archivos, 238/238 tests incl. los 12 axiomas Red-Team v5.1)
npx.cmd vitest run tests/prediction/

# 3. Suite completa Pytest (31/31 tests: holdout sellado + EXP_V40..EXP_V56)
$env:PYTHONDONTWRITEBYTECODE='1'
.\research\prediction-lab\.venv\Scripts\python.exe -B -m pytest services\models\test_sealed_holdout_v3_1.py research\prediction-lab\experiments\EXP_V4*\test_*.py research\prediction-lab\experiments\EXP_V5*\test_*.py -q

# 4. Regeneración del snapshot vivo v5.1 y del manifiesto canónico
.\research\prediction-lab\.venv\Scripts\python.exe -u -B services\models\regenerate_candidate_matchday_v5.py
.\research\prediction-lab\.venv\Scripts\python.exe -u -B services\models\build_candidate_registry_v5_1.py
```
