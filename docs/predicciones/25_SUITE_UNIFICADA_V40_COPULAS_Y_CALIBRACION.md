# 25 · Suite Unificada `PitchLab Spacetime & Copula v4.0 Candidate` (`EXP_V43`–`EXP_V49`)

> **Estado:** `status = "candidate"` · `production_activated = false` · **Fecha:** 2026-11-18 · **Rama:** `prediction-lab`
> **Gobernanza y Anti-Fuga (`OBSERVADO`):** `0` bytes alterados en los `10` artefactos congelados `v3.0`/`v3.1`/`v3.2` (`SHA-256` intacto), `0` accesos a `holdout_sealed` (`match_date < 2025-02-02T17:30:00Z`), `1,000` remuestreos deterministas `mulberry32` (`seed = 20261111`), paridad IEEE-754 `< 1e-12` Python ↔ TypeScript (`24/24` suites Vitest, `218/218` tests) y `0` campos de `stake`, `kelly`, `ev` o `tier` en salidas públicas.

---

## 1. Diagnóstico Autocrítico de `v3.5` / `v3.6` y Causas Raíz Resueltas en `v4.0`

Tras auditar con rigor adversarial nuestros propios motores `v3.5` / `v3.6`, cruzar los cinco dossieres forenses de `origin/scrap` (*Scout Picks*, *Astra AI*, *LineMate*, *TouchIQ* y *AztecaVet*) e integrar los activos locales en disco aún no explotados, `v4.0 Candidate` resuelve siete cuellos de botella matemáticos y de datos verificables:

| Experimento | Cuello de botella en `v3.5` / `v3.6` (`OBSERVADO`) | Solución implementada en `v4.0 Candidate` | Evidencia empírica fuera de muestra (`< 2025-02-02`) |
|---|---|---|---|
| **`EXP_V43`** · Fútbol Core `Tachyon v4.0` + Matriz 4-Param | El cono local `{0,1}×{0,1}` de Dixon-Coles dejaba `3.22e-3`–`1.23e-2` de discrepancia `1X2` en goleadas/extremos; faltaban `ws_soccer_match_xg` (`2,796` juegos Liga MX), `ws_understat_tactical` y altitud. | Solver ortogonal **Diagonal-Inflado de 4 Parámetros** (`bisecciones 1D` + proyección exacta sobre el 3-símplex) + poda causal en `VAL <= 2021` (`real_xg_overperf_luck_diff`, `club_tempo_sum_ewm12`). | Error máx. coherencia `1X2`: **`3.22e-3 → 1.55e-15`** (`ε` de máquina en `13,991` juegos). `Totals 2.5 ΔLL = -0.00142` (`significativa`, `ECE = 0.798%`); `BTTS ΔLL = -0.00122` (`significativa`). |
| **`EXP_V44`** · Micro-Mercados Bivariados Sarmanov `v4.0` | `EXP_V40` mezclaba local/visita en una sola EWMA (`team_for_ewm`), omitía física cruzada y asumía $\text{Cov}(H, A) = 0$, empatando contra la climatología dinámica en córners (`-0.00009`) y amarillas (`-0.00069`). | Ratios multiplicativos normalizados por sede y ajustados por defensa rival + física cruzada (`tiros bloqueados → córners`, `faltas × tarjetas/falta global → amarillas`) + **Cópula Binomial Negativa Bivariada de Sarmanov**. | **Los `5/5` mercados superan significativamente (`significativa`) tanto a `v3.6` como a la climatología dinámica en `n = 26,649` OOS:** `corners -0.00173 / -0.00191` ($\omega = -0.24$), `yellows -0.00530 / -0.00654`, `fouls -0.00463 / -0.02798` ($\omega = +0.06$), `SoT -0.00471`, `shots -0.00687` ($\omega = -0.36$), más `Side 1X2` (`-0.00400` a `-0.00689`). |
| **`EXP_V45`** · NFL `Minkowski v4.0` Números Clave y Props PBP | `EXP_V39` inflaba `sigma_total = 26.0` (`ECE = 4.04%`), usaba Gaussiana continua ignorando `±3` (`15.03%`) y `±7` (`9.55%`), y carecía de backtest real de NFL Player Props. | Desacoplamiento `sigma_game_physical = 14.8` vs posterior de mercado (`w_model = 0.14`, `sigma_post = 13.4`) + **PMF Discreta Inclinada de Números Clave (`|M| ∈ 1..45`)** + **Backtest Walk-Forward sobre `pbp_pruned_2012..2024`** con Reasignación por Baja. | `Key-Number PMF vs Gaussiana v3.5`: **`ΔLL = -0.00186` (`significativa`, `n = 10,744`)**. `Totals Market Posterior`: `ECE 4.04% → 2.50%`, **`ΔLL = -0.00791` (`significativa`)**. `NFL PBP Props` (`8,275` actuaciones OOS): `pass_att -0.05888`, `comp -0.03977`, `rush_att -0.10859` (todas `significativa`). |
| **`EXP_V46`** · Player Props Jerárquicos `v4.0` | Faltaban `shots`, `shots_on_target` y `assists`; `sub_cover` asumía `0.82x` fijo; y Platt lineal dejaba `ECE` alto en colas derechas (`>= 50%`). | Incorporación de `assists`, `shots` y `shots_on_target` (`Understat 2018..2022`), medición empírica del multiplicador de piernas frescas `sub_cover` sobre `1,031,017` apariciones y **Calibración Isotónica Monótona `PAVA` (`17` nodos)**. | Piernas frescas reales en `VAL <= 2019`: **`FW_CF goals = 1.276x`**, **`FW_W = 1.244x`**, **`MF_CM yellows = 1.650x`**. En `45,043` parejas reales OOS titular+suplente, el acierto sube de `16.69%` a **`22.10%` (`+5.41 pp`)**. `G+A ΔLL = -0.00015` (`ECE >=50%: 4.20% → 2.01%`), `yellows ΔLL = -0.00014` (`ECE >=50% = 0.00%`), `shots MAE -21.8%`, `SoT MAE -28.6%`. |
| **`EXP_V47`** · `Multi-Sport v4.0` Unificado (`MLB/NHL/NBA/NCAAF`) | `EXP_V42` solo probaba `30` casos sintéticos y dejaba fuera `ws_multisport_team_seasons.parquet`, `ws_stadium_physics.parquet` y `NCAAF`. | Puente unificado de **`226` franquicias reales** (`30 MLB + 32 NHL + 30 NBA + 134 NCAAF`) con altitud física verificada y nuevo motor **`NCAAF Horizon v4.0`** (números clave colegiales `3, 7, 10, 14, 17, 21`, altitud `WYO/AFA/BYU/COL` y amortiguamiento *garbage-time*). | Validación pre-holdout `< 2025-02-02`: `MLB 2024 WinPct RMSE 0.0759 → 0.0399` (**`-47.4%`**), `NHL 2023-24 PtsPct RMSE 0.1059 → 0.0794` (**`-25.0%`**, `OT residual = 3.89e-14`), `NCAAF 2024 WinPct RMSE 0.2055 → 0.1031` (**`-49.8%`**). |
| **`EXP_V48`** · Motor Institucional de Cópulas `SGP` | *LineMate*, *Astra AI* y *Scout Picks* multiplican probabilidades independientes $P(A)P(B)$, ignorando correlaciones de `-0.36` a `+0.68` y el impuesto SGP del `20–35%`. | Matrices latentes Gaussianas PSD estimadas en `VAL <= 2019` (`Soccer 8×8`, `NFL 6×6`) + integrador determinista **Quasi-Monte Carlo Halton (`2,048` puntos, `< 0.5 ms`, `0` varianza aleatoria)** + **Detector de Impuesto SGP**. | **Las `5/5` familias de boletos SGP en `OOS 2020..2024` baten significativamente a $P(A)P(B)$:** `Soccer 2-Leg -0.04885`, `Soccer 3-Leg -0.07105`, `Trampa Córners Negativa -0.01169`, `NFL Win+Rush -0.01686`, `Trampa NFL Win+Pass -0.02214` (todas `significativa`). |
| **`EXP_V49`** · Hub `UnifiedMatchIntelligenceV4` + Guardrail | Fragmentación de módulos, apagón `"low_coverage"` en `live_matchday_v3_snapshot.json` y riesgo de inversión narrativa (`20.7%` en Astra AI). | Fachada unificada `unified_outlook_v4.ts`, snapshot candidato `live_matchday_v4_candidate_snapshot.json` sobre los **`242` duelos vivos en `11` ligas** y validador determinista `narrative_guardrail.ts`. | **`242 / 242` (`100.0%`) enfrentamientos en `dataQuality.flag = "ok"` (`0` `"low_coverage"`)**, `0` campos prohibidos y bloqueo determinista `100%` de inversiones de favorito, certezas falsas, términos de `stake/kelly` y porcentajes alucinados. |

---

## 2. Detalle Cuantitativo por Experimento (`OBSERVADO`)

### 2.1 `EXP_V43` — Solver Diagonal-Inflado de 4 Parámetros y Selección Causal Táctica
- **Código:** `src/domain/prediction/diagonal_score_matrix.ts` y `research/prediction-lab/experiments/EXP_V43_soccer_v4_0_core/{diagonal_score_solver,run_soccer_v4_0_core}.py`.
- **Artefactos:** `src/data/prediction/gbm_club_v4_0_candidate.json`, `model_club_goals_v4_0_candidate.json`, `club_state_v4_0.json` (`163` clubes con estado `xG` real/Understat/altitud) y `soccer_v4_0_core_snapshot.json` (`120` partidos).
- **Resultados (`n = 13,991` en `E0, SP1, I1, D1, F1, MEX`, `2018..2025 < 2025-02-02`):**
  - El selector causal estricto en `VAL <= 2021` (`C = 0.006`) retuvo únicamente las `2 / 10` variables que aportan ganancia genuina (`real_xg_overperf_luck_diff` y `club_tempo_sum_ewm12`) y podó las `8` restantes que introducían sobreajuste en muestra finita (`1X2 LL: 0.98584 → 0.98550`, `ECE = 0.00556`, `ΔLL = -0.00034` `"no significativa"`).
  - En mercados de goles (`Horizon-Goals v4.0` de `19` features + Matriz 4-Param):
    - `Totals 2.5`: **`ΔLL vs v3.5 = -0.00142` (`significativa`)**, `ECE = 0.00798`.
    - `BTTS`: **`ΔLL vs v3.5 = -0.00122` (`significativa`)**.
    - Error máximo de reconstrucción `1X2` sobre toda la muestra: **`1.554 × 10⁻¹⁵`** (frente a `3.221 × 10⁻³` en `v3.5`).

### 2.2 `EXP_V44` — Micro-Mercados Bivariados de Fútbol con Cópula de Sarmanov
- **Código:** `src/domain/prediction/soccer_micro_markets.ts` (`buildBivariateSarmanovNbSummaryV4`, `buildSoccerMicroMatchOutlookV4`) y `research/prediction-lab/experiments/EXP_V44_micro_markets_v4_0/run_micro_markets_v4_0.py`.
- **Artefactos:** `src/data/prediction/model_soccer_micro_v4_0_candidate.json`, `official_priors_v4_0.json` (`451` árbitros globales con multiplicador `cards_per_foul`) y `soccer_micro_v4_0_snapshot.json` (`80` partidos × `5` métricas).
- **Tabla `OOS 2020..2024` (`n = 26,649` partidos `< 2025-02-02`):**

| Métrica | Cópula $\omega_q$ (`VAL`) | `MAE v4.0` vs `v3.6` vs `Climatología` | `ΔLL Total` vs `v3.6` (`IC 95%`) | `ΔLL Total` vs `Climatología Dinámica` | `ΔLL Side 1X2` vs Indep. |
|---|---:|---|---:|---:|---:|
| **`corners`** (`9.5`) | `-0.24` | **`2.6702`** vs `2.6771` vs `2.6706` | **`-0.00173`** (`significativa`) | **`-0.00191`** (`significativa`) | **`-0.00400`** (`significativa`) |
| **`yellow_cards`** (`3.5`) | `0.00` | **`1.6483`** vs `1.6603` vs `1.6637` | **`-0.00530`** (`significativa`) | **`-0.00654`** (`significativa`) | **`-0.00401`** (`significativa`) |
| **`fouls`** (`23.5`) | `+0.06` | **`4.2479`** vs `4.2829` vs `4.4711` | **`-0.00463`** (`significativa`) | **`-0.02798`** (`significativa`) | **`-0.00571`** (`significativa`) |
| **`shots_on_target`** (`8.5`) | `0.00` | **`2.4401`** vs `2.4574` vs `2.4782` | **`-0.00471`** (`significativa`) | **`-0.01087`** (`significativa`) | **`-0.00677`** (`significativa`) |
| **`shots`** (`24.5`) | `-0.36` | **`4.3698`** vs `4.4266` vs `4.5030` | **`-0.00687`** (`significativa`) | **`-0.01747`** (`significativa`) | **`-0.00689`** (`significativa`) |

### 2.3 `EXP_V45` — NFL `Minkowski v4.0`: PMF de Números Clave, Totales Calibrados y Props PBP Reales
- **Código:** `src/domain/prediction/nfl_v4_0.ts` y `research/prediction-lab/experiments/EXP_V45_nfl_v4_0_complete/run_nfl_v4_0_complete.py`.
- **Artefactos:** `src/data/prediction/model_nfl_key_numbers_v4_0_candidate.json`, `model_nfl_props_v4_0_candidate.json` y `nfl_v4_0_snapshot.json`.
- **Resultados verificados (`OOS 2020..2024 < 2025-02-02`):**
  - **Masa empírica pre-2020 en números clave NFL:** `|M|=3: 15.03%`, `|M|=7: 9.55%`, `|M|=10: 5.81%`, `|M|=6: 5.76%`, `|M|=14: 4.84%` (`40.99%` concentrado en 5 enteros).
  - **Cobertura de `Spreads` en `8` líneas clave (`n = 10,744`):** `LL Gaussiana v3.5 = 0.57825 → PMF Números Clave v4.0 = 0.57639` (**`ΔLL = -0.00186` `significativa`**), otorgando además `push` exacto en `-3.0` y `-7.0`.
  - **Totales NFL:** sobre líneas objetivas fijas, **`ΔLL vs v3.5 = -0.00578` (`significativa`)** y **`-0.01162` vs constante `44.5`**; con posterior Bayesiano de mercado (`w_model = 0.14`, `sigma_post = 13.4`), `ECE` cae de `4.04%` a **`2.50%`** (**`ΔLL = -0.00791` `significativa`**).
  - **Backtest Walk-Forward Real sobre `pbp_pruned_2012..2024` (`8,275` actuaciones individuales OOS):**
    - `QB pass_attempts` (`Over 32.5`, `n = 2,785`): `MAE 6.721 → 6.459`, **`ΔLL = -0.05888` (`significativa`)**, `ECE = 1.77%`.
    - `QB completions` (`Over 20.5`, `n = 2,785`): `MAE 4.797 → 4.611`, **`ΔLL = -0.03977` (`significativa`)**, `ECE = 2.56%`.
    - `RB rush_attempts` + Reasignación de Vacancia por Baja (`Over 13.5`, `n = 2,705`): `MAE 4.678 → 4.583`, **`ΔLL = -0.10859` (`significativa`)**.

### 2.4 `EXP_V46` — Player Props `v4.0`: `Shots`/`SoT`/`Assists`, `sub_cover` Empírico e Isotónica `PAVA`
- **Código:** `src/domain/prediction/hierarchical_props.ts` (`projectSoccerPlayerPropOutlookV4`, `evaluateIsotonicPiecewiseCalibration`) y `research/prediction-lab/experiments/EXP_V46_props_v4_0/run_props_v4_0.py`.
- **Artefactos:** `src/data/prediction/model_hierarchical_props_v4_0_candidate.json` y `hierarchical_props_v4_0_snapshot.json` (`72` casos).
- **Hallazgo empírico clave sobre `sub_cover` (*Sustituto Cuenta*):** lejos del factor `0.82x` supuesto en `v3.6`, en `1,031,017` apariciones reales los suplentes ofensivos frescos que ingresan contra defensas fatigadas superan la tasa por `90'` del titular (`FW_CF = 1.276x`, `FW_W = 1.244x`), y en `45,043` sustituciones reales `OOS 2020..2024` elevan la frecuencia de acierto en gol de `16.69%` a **`22.10%` (`+5.41 pp`)**.

### 2.5 `EXP_V48` — Motor Institucional de Cópulas `SGP` y Auditoría de Impuesto Oculto
- **Código:** `src/domain/prediction/sgp_copula.ts` y `research/prediction-lab/experiments/EXP_V48_sgp_copula_engine/run_sgp_copula_experiment.py`.
- **Artefactos:** `src/data/prediction/sgp_copula_priors_v4_0_candidate.json` y `sgp_copula_v4_0_snapshot.json` (`50` boletos).
- **Correlaciones latentes medidas en `VAL <= 2019`:**
  - **Fútbol (`n = 29,805`):** $\rho(\text{Total Goals}, \text{1H Goals}) = +0.675$, $\rho(\text{Total Goals}, \text{SoT}) = +0.510$, $\rho(\text{Home Corners}, \text{Away Corners}) = -0.222$.
  - **NFL (`n = 1,788`):** $\rho(\text{Home Margin}, \text{Home Rush}) = +0.652$, $\rho(\text{Home Margin}, \text{Home Pass}) = -0.361$, $\rho(\text{Home Margin}, \text{Away Pass}) = +0.312$.
- En `OOS 2020..2024`, la cópula QMC Halton supera con significancia estadística a la independencia ingenua $P(A)P(B)$ tanto en combinaciones sinérgicas (`Soccer 3-Leg ΔLL = -0.07105`, `NFL Win+Rush ΔLL = -0.01686`) como en trampas anti-correlacionadas (`NFL Win+Pass ΔLL = -0.02214`, `Ambos Córners Altos ΔLL = -0.01169`).

---

## 3. Reproducibilidad Exacta

```powershell
$env:PYTHONDONTWRITEBYTECODE='1'
$py = ".\research\prediction-lab\.venv\Scripts\python.exe"

# 1. Regeneración completa de artefactos candidatos v4.0 (< 2025-02-02)
& $py -u -B research\prediction-lab\experiments\EXP_V43_soccer_v4_0_core\run_soccer_v4_0_core.py
& $py -u -B research\prediction-lab\experiments\EXP_V44_micro_markets_v4_0\run_micro_markets_v4_0.py
& $py -u -B research\prediction-lab\experiments\EXP_V45_nfl_v4_0_complete\run_nfl_v4_0_complete.py
& $py -u -B research\prediction-lab\experiments\EXP_V46_props_v4_0\run_props_v4_0.py
& $py -u -B research\prediction-lab\experiments\EXP_V47_multisport_v4_0\run_multisport_v4_0.py
& $py -u -B research\prediction-lab\experiments\EXP_V48_sgp_copula_engine\run_sgp_copula_experiment.py
& $py -u -B services\models\regenerate_candidate_matchday_v4.py

# 2. Suite completa Pytest (integridad holdout_sealed + EXP_V33..EXP_V48)
& $py -B -m pytest services/models/test_sealed_holdout_v3_1.py `
  research/prediction-lab/experiments/EXP_V33_intl_soccer `
  research/prediction-lab/experiments/EXP_V34_club_free_data `
  research/prediction-lab/experiments/EXP_V37_club_v3_5_engines `
  research/prediction-lab/experiments/EXP_V40_soccer_micro_markets `
  research/prediction-lab/experiments/EXP_V41_hierarchical_props `
  research/prediction-lab/experiments/EXP_V42_multisport_v3_6 `
  research/prediction-lab/experiments/EXP_V43_soccer_v4_0_core `
  research/prediction-lab/experiments/EXP_V44_micro_markets_v4_0 `
  research/prediction-lab/experiments/EXP_V45_nfl_v4_0_complete `
  research/prediction-lab/experiments/EXP_V46_props_v4_0 `
  research/prediction-lab/experiments/EXP_V47_multisport_v4_0 `
  research/prediction-lab/experiments/EXP_V48_sgp_copula_engine -v

# 3. Suite completa Vitest en TypeScript (24 suites / 218 tests, paridad < 1e-12)
npx.cmd vitest run tests/prediction/
```
