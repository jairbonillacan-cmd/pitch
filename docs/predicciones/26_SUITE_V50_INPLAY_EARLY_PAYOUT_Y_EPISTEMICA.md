# 26 · Suite Unificada `PitchLab Spacetime, In-Play & Epistemic v5.0 Candidate` (`EXP_V50`–`EXP_V56`)

> **Estado:** `status = "candidate"` · `production_activated = false` · **Fecha:** 2026-11-18 · **Rama:** `prediction-lab`
> **Nota de Rectificación (`v5.1`, 2026-11-19):** Este documento conserva el registro histórico de `v5.0`. Todas las correcciones de la auditoría adversarial de `22` hallazgos (`A1`–`A6`, `B1`–`B4`, `C1`–`C5`, `D1`–`D7`) —incluyendo la eliminación del bypass `v3` y las `12/84` violaciones de Early Payout en el snapshot vivo (`A1`), la deconvolución NFL ATS (`A2`), el benchmark `Power De-Vig` de Modo B (`A4`, donde el `ΔLL` frente a Pinnacle Open Power resulta `-0.00002` `"no significativa"`), la poda `HGB` (`540 KB → 14.1 KB`) + `γ_R = 0.1680` + cobertura arbitral `94.3%` (`C1`–`C3`), el filtro causal de titulares (`B2`), el cluster-bootstrap (`B1`), la validación `nflverse` OOS (`C5`) y `Inductive Venn-Abers` (`D6`)— están consolidadas en [`27_AUDITORIA_REMEDIACION_V51.md`](27_AUDITORIA_REMEDIACION_V51.md).
> **Gobernanza y Anti-Fuga (`OBSERVADO`):** `0` bytes alterados en los artefactos congelados `v3.0`/`v3.1`/`v3.2` (`SHA-256` intacto), `0` accesos a `holdout_sealed` (`match_date < 2025-02-02T17:30:00Z`), selección de hiperparámetros estricta en `VAL <= 2019` (`OOS 2020..2024`), `1,000` remuestreos deterministas `mulberry32` (`seed = 20261111`), paridad IEEE-754 `< 1e-12` Python ↔ TypeScript (`43/43` tests Pytest y `25/25` suites Vitest, `226/226` tests en `PASS`) y `0` campos de `stake`, `kelly`, `ev` o `tier` en salidas públicas.

---

## 1. Diagnóstico Autocrítico de `v4.0` y Causas Raíz Resueltas en `v5.0`

Tras auditar con rigor adversarial nuestros propios artefactos `v4.0 Candidate` (`EXP_V43`–`EXP_V49`), `v5.0 Candidate` cierra siete cuellos de botella matemáticos y de escala verificables en datos reales pre-holdout (`< 2025-02-02`):

| Experimento | Cuello de botella en `v4.0` / `v3.5` (`OBSERVADO`) | Solución implementada en `v5.0 Candidate` | Evidencia empírica fuera de muestra (`< 2025-02-02`) |
|---|---|---|---|
| **`EXP_V50`** · Escala Global `22` Ligas + `Meridian v5.0` Selecciones + Modo B Microestructura | `EXP_V43` cubría solo `6` ligas de clubes (`13,991` juegos); `Meridian v3.5` seguía en `3` parámetros con error de cono `1.60e-2` en goleadas internacionales; y faltaba medir si la dispersión multi-casa + `Tachyon` bate a Pinnacle en apertura. | Escalado de `Tachyon v5.0` + `Horizon-Goals v5.0` a **`22` divisiones (`111,113` juegos totales, `76,522` OOF)** + **Matriz 4-Param Diagonal-NB (`r = 45.0`) en `Meridian v5.0` (`12,904` selecciones)** + **Modo B Microestructura Multi-Casa de Apertura**. | **`Meridian v5.0` (`n = 12,904`):** error máx. `1X2` **`1.603e-2 → 1.554e-15`**, `Totals 3.5 ΔLL = -0.00259` (`significativa`), `BTTS ΔLL = -0.00161` (`significativa`). **`Modo B Apertura` (`n = 26,587` OOS):** bate a Pinnacle Open (**`ΔLL = -0.00044` `significativa`**). |
| **`EXP_V51`** · Micro-Mercados No Lineales `HGB-Poisson`, `Red Cards` y `Booking Points` | `EXP_V44` era puramente log-lineal y carecía de mercados institucionales de `Tarjetas Rojas` (`Over 0.5`) y `Puntos por Tarjeta` (`Booking Points = 10·Y + 25·R`). | Ensamble `HGB-Poisson` (`max_depth = 3`) + `GLM` evaluado por `evaluateMicroPoissonGbmExact` en TS + motor causal de **`Red Cards` (`HR + AR` + `tm_events` rojas/dobles amarillas)** + distribución compuesta exacta **`10·Y + 25·R` (`35.5 / 45.5 / 55.5`)**. | **`n = 26,650` OOS (`2020..2024`):** **`Red Cards Over 0.5`** `LL = 0.46653, ECE = 0.56%, ΔLL vs Climatología = -0.00219` (`significativa`). **`Booking Points`**: `35.5 ΔLL = -0.00765`, `45.5 ΔLL = -0.00752` (`ECE = 1.06%`), `55.5 ΔLL = -0.00634` (las `3/3` `significativa`). |
| **`EXP_V52`** · NFL `Minkowski v5.0`: Totales Clave Discretos sin Deriva, `ATS` Real, `Overtime` y Nuevos Props PBP | `EXP_V45` presentaba `ECE = 4.99%` en líneas objetivas de Totales por deriva temporal post-2020 y continuo Gaussiano sin `push` en `41/44/47`; no evaluaba contra `spread_line` real de mercado ni modelaba `OT`, `qb_sacks_taken` ni `qb_rush_attempts`. | **Kernel Discreto de Totales Clave (`37, 40, 41, 43, 44, 47, 51`) con Inclinación de Esscher pura** + entorno causal `LeagueScoringEnvEWM(t)` + auditoría en `spread_line` real (`n = 1,311`) + motor **`Overtime`** + backtest PBP de **`qb_sacks_taken` y `qb_rush_attempts`**. | **Totales Objetivos OOS (`n = 8,058`):** **`ECE 4.99% → 2.10%`** (`ΔLL = -0.00230`). **Push entero `±3.0 / ±7.0` (`n = 274`):** predicho `6.90%` vs observado `7.66%`. **`Overtime` (`n = 1,343`):** `ECE = 0.20%`. **Props PBP (`n = 2,785`):** `qb_sacks_taken ΔLL = -0.04541` (`ECE = 1.66%`), `qb_rush_attempts ΔLL = -0.01854` (ambos `significativa`). |
| **`EXP_V53`** · Props `v5.0`: Splines Monótonos Baricéntricos en Logit y Multi-Línea `1.5+` (*Brace*) | En `EXP_V46`, buscar el nodo más cercano (`argmin` sobre `[0, 0.02, ...]`) introducía escalones de cuantización que degradaron el `Log-Loss` global en `goals` (`+0.00036`) y `assists` (`+0.00015`) frente a Platt `v3.6`, y solo existía la línea `0.5+`. | **Interpolación Baricéntrica Continua `PAVA` en Espacio Logit** (`38` cuantiles adaptativos densos en `[0.005, 0.20]` + regularización Bayesiana $\tau_{\text{prior}}$) + soporte **Multi-Línea `1.5+` (*Doblete / 2+ G+A*)**. | **En `n = 389,107` titulares OOS, las `7 / 7` evaluaciones son estadísticamente significativas (`significativa`):** `goals (0.5)` `-0.00092` vs `v4.0` y `-0.00056` vs `v3.6`; `assists (0.5)` `-0.00034` / `-0.00019` (`ECE >=50% = 0.00%`); `G+A (0.5)` `-0.00014` / `-0.00029` (`ECE >=50% = 1.69%`); `yellows (0.5)` `-0.00002` / `-0.00016` (`ECE >=50% = 0.00%`); **`1.5+` Brace:** `-0.00769` a `-0.00889`. |
| **`EXP_V54`** · Motor *In-Play* Markov-Hawkes y *Early Payout* Exacto (`+2 Goles / +17 NFL / +20 NBA / +5 MLB`) | Ningún motor previo ni competidor (*Scout Picks*, *Astra AI*, *LineMate*) resolvía probabilidades exactas de **Pago Anticipado (*2 Goals Ahead*)** ni actualización *In-Play* minuto a minuto con tarjetas rojas y asimetría de segunda mitad. | **Programación Dinámica Exacta de Primer Paso (*First-Passage Time*, `90` pasos × `484` estados absorbentes)** con perfil empírico de gol cada `15'` (`22.87%` en `76–90'`) y multiplicadores de expulsión + **Principio de Reflexión Browniano con Deriva** para deportes de puntos. | **`In-Play HT 45' → FT 90'` (`n = 26,650` clubes OOS):** `Poisson Homogéneo = 0.83805 → Spacetime v5.0 = 0.83275` (**`ΔLL = -0.00530` `significativa`, `ECE = 0.56%`**; el `7.12%` de ventajas `>= +2` al `45'` se pierden en `2H`). **`Early-Payout Clubes` (`53,300` boletos OOS):** **`ECE = 0.41%`, `ΔLL = -0.00010` (`significativa`)**. |
| **`EXP_V55`** · Cópula `Student-t` de Colas Pesadas y *Bet Builder* Jugador-Partido (Raikov) | `EXP_V48` tenía dependencia asintótica nula en colas ($\lambda_U = 0$ en cópula Gaussiana) y no vinculaba props individuales (`Goleador`) con resultados de equipo (`Gana Equipo + Over 2.5`), donde $P(A)P(B)$ viola la conservación física del marcador. | **Cópula `Student-t` QMC Halton** ($\nu$ calibrado en `VAL <= 2019`) + **Superposición Condicional Exacta de Poisson de Raikov** ($G_{\text{team}} = G_{\text{player}} + G_{\text{rest}}$). | **`Player-Linked 2-Leg (Goleador + Victoria)` (`n = 104,632` OOS):** **`ΔLL = -0.00979` (`significativa`, `ECE = 1.07%`)**. **`Player-Linked 3-Leg (Goleador + Victoria + Over 2.5)` (`n = 104,632` OOS):** **`ΔLL = -0.02371` (`significativa`, `ECE = 0.58%`)**. **`Soccer Heavy-Tail 3-Leg` (`n = 26,649`):** **`ΔLL = -0.05878` (`significativa`, `ECE = 0.17%`)**. |
| **`EXP_V56`** · Incertidumbre Epistémica Conformal (`90%`) + Hub `UnifiedMatchIntelligenceV5` (`242/242`) | Toda la suite `v4.0` emitía probabilidades puntuales sin distinguir entre clubes con `50+` partidos y datos completos frente a duelos con menor muestra o incertidumbre táctica. | **Bandas Epistémicas Conformales Exactas al `90%` en Espacio Logit** (`[pLower90, pUpper90]`, `epistemicWidth90`, `confidenceGrade: "A" | "B" | "C"`) + Hub `unified_outlook_v5.ts` sobre los **`242` enfrentamientos vivos**. | **`242 / 242` (`100.0%`) enfrentamientos en `dataQuality.flag = "ok"`** en `live_matchday_v5_candidate_snapshot.json`, `0` inversiones de favorito, `0` claves prohibidas y latencia determinista sub-milisegundo en TypeScript. |

---

## 2. Detalle Cuantitativo por Experimento (`OBSERVADO`)

### 2.1 `EXP_V50` — Escala Global `22` Ligas (`111,113` Juegos), `Meridian v5.0` y Microestructura Modo B
- **Código:** `research/prediction-lab/experiments/EXP_V50_soccer_v5_0_global/run_soccer_v5_0_global.py` y `src/domain/prediction/diagonal_score_matrix.ts`.
- **Artefactos:** `src/data/prediction/gbm_club_v5_0_candidate.json`, `model_club_goals_v5_0_candidate.json`, `model_intl_goals_v5_0_candidate.json` y `soccer_v5_0_global_snapshot.json`.
- **Resultados verificados (`< 2025-02-02T17:30:00Z`):**
  - **`Meridian v5.0` Selecciones Nacionales (`n = 12,904` partidos OOF):** al reemplazar el solver de 3 parámetros por la Matriz Diagonal-Inflada Binomial Negativa de 4 parámetros (`r = 45.0` seleccionado en `VAL <= 2019`), el error máximo de reconstrucción `1X2` cae de **`1.603 × 10⁻²` a `1.554 × 10⁻¹⁵`**, mejorando con significancia estadística **`Totals 3.5` (`ΔLL = -0.00259 [-0.00410, -0.00128]`, `ECE = 0.776%`)** y **`BTTS` (`ΔLL = -0.00161 [-0.00278, -0.00059]`)**.
  - **Hallazgo causal de dilución global (`OBSERVADO`):** sobre las `22` divisiones completas (`111,113` partidos `2010..2024`, `76,522` OOF), `tm_games.csv.gz` posee cobertura de formaciones/asistencia en `7` ligas top europeas (`15/22` imputadas a mediana). La compuerta greedy en `VAL <= 2019` podó automáticamente `0 / 7` columnas extra a escala global para impedir sobreajuste, manteniendo intacta la calibración `Modo A` (`LL = 1.00811`, `ECE = 0.267%`, `ΔLL = +0.00001` `"no significativa"`) y llevando la coherencia `1X2` global a **`1.554 × 10⁻¹⁵`** (`ECE Totals 2.5 = 0.437%`).
  - **Modo B — Microestructura Multi-Casa de Apertura (`n = 26,587` OOS `2020..2024`):** combinar en espacio logit la apertura sin margen de Pinnacle, el diferencial de consenso multi-casa (`avg - ps`), la dispersión `1/avg - 1/max` y `Tachyon v5.0` **supera con significancia estadística a la apertura sharp de Pinnacle (`LL: 0.99202 → 0.99157`, `ΔLL = -0.00044 [-0.00090, -0.00001]`, `ECE = 0.390%`)**.

### 2.2 `EXP_V51` — Micro-Mercados No Lineales `HGB-Poisson v5.0`, `Red Cards` y `Booking Points`
- **Código:** `src/domain/prediction/soccer_micro_markets.ts` (`evaluateMicroPoissonGbmExact`, `buildBookingPointsOutlookV5`, `buildSoccerMicroMatchOutlookV5`) y `research/prediction-lab/experiments/EXP_V51_micro_markets_v5_0/run_micro_markets_v5_0.py`.
- **Artefactos:** `src/data/prediction/model_soccer_micro_v5_0_candidate.json` y `soccer_micro_v5_0_snapshot.json` (`80` partidos).
- **Tabla `OOS 2020..2024` (`n = 26,649–26,650` partidos `< 2025-02-02`):**

| Mercado | Pesos `HGB` `(H, A)` (`VAL`) | `Log-Loss v5.0` | `ECE v5.0` | `ΔLL` vs `v4.0` | `ΔLL` vs `Climatología Dinámica` (`IC 95%`) |
|---|---|---:|---:|---:|---|
| **`corners`** (`9.5`) | `(0.00, 0.00)` | `0.68468` | `1.05%` | `0.00000` (`no sig.`) | **`-0.00189`** `[-0.00344, -0.00025]` (`significativa`) |
| **`yellow_cards`** (`3.5`) | `(0.65, 0.65)` | `0.63687` | `1.93%` | `-0.00006` (`MAE 1.6484`) | **`-0.00625`** `[-0.00808, -0.00441]` (`significativa`) |
| **`fouls`** (`23.5`) | `(0.30, 0.45)` | `0.58276` | `1.30%` | `-0.00018` (`no sig.`) | **`-0.02816`** `[-0.03091, -0.02564]` (`significativa`) |
| **`shots_on_target`** (`8.5`) | `(0.00, 0.00)` | `0.66497` | `1.15%` | `0.00000` (`no sig.`) | **`-0.01080`** `[-0.01313, -0.00855]` (`significativa`) |
| **`shots`** (`24.5`) | `(0.00, 0.00)` | `0.63275` | `0.98%` | `0.00000` (`no sig.`) | **`-0.01747`** `[-0.01993, -0.01483]` (`significativa`) |
| **Nuevo: `Red Cards Over 0.5`** | GLM + Prior TM/Ref | **`0.46653`** | **`0.56%`** | *(nuevo en `v5.0`)* | **`-0.00219`** `[-0.00322, -0.00128]` (`significativa`) |
| **Nuevo: `Booking Points > 35.5`** | Exacto `10Y + 25R` | **`0.62321`** | `1.54%` | *(nuevo en `v5.0`)* | **`-0.00765`** `[-0.00952, -0.00594]` (`significativa`) |
| **Nuevo: `Booking Points > 45.5`** | Exacto `10Y + 25R` | **`0.65293`** | **`1.06%`** | *(nuevo en `v5.0`)* | **`-0.00752`** `[-0.00967, -0.00566]` (`significativa`) |
| **Nuevo: `Booking Points > 55.5`** | Exacto `10Y + 25R` | **`0.58884`** | **`1.09%`** | *(nuevo en `v5.0`)* | **`-0.00634`** `[-0.00844, -0.00433]` (`significativa`) |

### 2.3 `EXP_V52` — NFL `Minkowski v5.0`: Totales Clave sin Deriva, `ATS` Real, `Overtime` y Props PBP
- **Código:** `src/domain/prediction/nfl_v4_0.ts` (`solveNflDiscreteKeyTotalPmfExactV5`, `projectNflDiscreteKeyTotalPmfV5`, `projectNflOvertimeProbabilityV5`, `projectNflPlayerPropV5`) y `research/prediction-lab/experiments/EXP_V52_nfl_v5_0_complete/run_nfl_v5_0_complete.py`.
- **Artefactos:** `src/data/prediction/model_nfl_v5_0_candidate.json` y `nfl_v5_0_snapshot.json`.
- **Evidencia verificada (`OOS 2020..2024 < 2025-02-02`):**
  - **Corrección de deriva en Totales Objetivos (`n = 8,058` evaluaciones OOS):** al acoplar el entorno dinámico causal `LeagueScoringEnvEWM(t)` con el Kernel Discreto de Totales Clave (`37, 40, 41, 43, 44, 47, 51`) bajo inclinación exponencial de Esscher pura, el **`ECE` cae de `4.99%` (`v4.0`) a `2.10%` (`-58.0%` de error de calibración, `ΔLL = -0.00230`)**, habilitando además masa exacta de `push` en líneas enteras (`41.0`, `44.0`, `47.0`).
  - **Auditoría en `spread_line` real de mercado (`n = 1,311` juegos OOS sin push):** `LL = 0.70447` vs Gaussiana `0.70451` (`ΔLL = -0.00004`); en los **`274` juegos OOS con spread entero `±3.0` o `±7.0`**, la masa predicha de `push` es **`6.90%`** frente al **`7.66%` observado** (mientras que toda distribución continua asigna `0.00%`).
  - **Probabilidad de Tiempo Extra (`Overtime`, `n = 1,343` juegos OOS):** **`ECE = 0.195%`** (`LL = 0.22454`, `"no significativa"` frente a tasa base).
  - **Nuevos NFL Player Props sobre `pbp_pruned_2012..2024` (`n = 2,785` inicios de QB OOS):**
    - `qb_sacks_taken` (`Over 2.5`, $r = 9.69$): `MAE 1.3606 → 1.3018`, **`ECE = 1.66%`**, **`ΔLL = -0.04541 [-0.06027, -0.03111]` (`significativa`)**.
    - `qb_rush_attempts` (`Over 4.5`, $r = 8.05$): `MAE 1.8191 → 1.8016`, **`ΔLL = -0.01854 [-0.03259, -0.00569]` (`significativa`)**.

### 2.4 `EXP_V53` — Player Props `v5.0`: Interpolación Baricéntrica Logit-PAVA y Multi-Línea `1.5+`
- **Código:** `src/domain/prediction/hierarchical_props.ts` (`evaluateLogitSpaceMonotoneSplineV5`, `projectSoccerPlayerPropOutlookV5`) y `research/prediction-lab/experiments/EXP_V53_props_v5_0/run_props_v5_0.py`.
- **Artefactos:** `src/data/prediction/model_hierarchical_props_v5_0_candidate.json` y `hierarchical_props_v5_0_snapshot.json` (`72` casos).
- **Tabla `OOS 2020..2024` (`n = 389,107` titulares reales `< 2025-02-02`):**

| Mercado y Línea | `Log-Loss v5.0` | `ECE Global` | `ECE Promovido (>= 50%)` | `ΔLL` vs `v4.0` (Nearest-Knot) | `ΔLL` vs `v3.6` (Platt) |
|---|---:|---:|---:|---|---|
| **`goals` (`0.5+`)** | **`0.27674`** | **`0.339%`** | `3.79%` (`n = 1,030`) | **`-0.00092`** (`significativa`) | **`-0.00056`** (`significativa`) |
| **`assists` (`0.5+`)** | **`0.25635`** | **`0.509%`** | **`0.00%`** | **`-0.00034`** (`significativa`) | **`-0.00019`** (`significativa`) |
| **`goals_assists` (`0.5+`)** | **`0.39375`** | **`0.668%`** | **`1.69%`** (`n = 3,963`) | **`-0.00014`** (`significativa`) | **`-0.00029`** (`significativa`) |
| **`yellow_cards` (`0.5+`)** | **`0.42305`** | **`0.931%`** | **`0.00%`** | **`-0.00002`** (`significativa`) | **`-0.00016`** (`significativa`) |
| **Nuevo: `goals 1.5+` (*Brace*)** | **`0.04867`** | **`0.141%`** | `0.00%` | *(nuevo)* vs NB crudo: **`-0.00769`** (`significativa`) | — |
| **Nuevo: `assists 1.5+`** | **`0.03396`** | **`0.071%`** | `0.00%` | *(nuevo)* vs NB crudo: **`-0.00837`** (`significativa`) | — |
| **Nuevo: `goals_assists 1.5+`** | **`0.10523`** | **`0.320%`** | `0.00%` | *(nuevo)* vs NB crudo: **`-0.00889`** (`significativa`) | — |

### 2.5 `EXP_V54` — Motor *In-Play* Markov-Hawkes y *Early Payout* Exacto (`+2 Goles / +17 NFL / +20 NBA / +5 MLB`)
- **Código:** `src/domain/prediction/inplay_and_early_payout.ts` y `research/prediction-lab/experiments/EXP_V54_inplay_early_payout_v5_0/run_inplay_early_payout_v5_0.py`.
- **Artefactos:** `src/data/prediction/model_inplay_early_payout_v5_0_candidate.json` y `inplay_early_payout_v5_0_snapshot.json`.
- **Evidencia empírica verificada (`< 2025-02-02`):**
  - **Perfil temporal empírico de gol (`27,169` goles en `VAL <= 2019`):** `[0–15': 12.68%, 16–30': 14.31%, 31–45': 16.73%, 46–60': 16.41%, 61–75': 17.00%, 76–90+': 22.87%]` (`56.28%` de los goles caen en la segunda mitad).
  - **Actualización *In-Play* del Descanso al Final (`HT 45' → FT 90'`, `n = 26,650` partidos de clubes OOS):** incorporar marcador vivo `(gH, gA)`, tarjetas rojas y la aceleración no homogénea de segunda mitad reduce el `Log-Loss` de `0.83805` (Poisson homogéneo) a **`0.83275`** (**`ΔLL = -0.00530 [-0.00642, -0.00416]` `significativa`, `ECE = 0.56%`**). En los `2,557` partidos OOS donde un club llega al descanso con `>= +2` goles de ventaja, el **`7.12%` pierde la ventaja en el segundo tiempo** (capturado como `cashoutProtectionValue` por el motor de Pago Anticipado).
  - **Boletos *Early Payout* (`2 Goals Ahead`) en Clubes (`n = 53,300` boletos OOS):** **`ECE = 0.41%`**, **`ΔLL = -0.00010 [-0.00020, -2.1e-8]` (`significativa`)**. En trayectoria minuto a minuto de selecciones (`n = 4,600` OOS), el lift extra observado de victorias anticipadas que terminan en empate/derrota es **`+0.96 pp`** frente al **`+1.18 pp` predicho por DP** (`ΔLL = +0.00044` `"no significativa"` por mayor frecuencia de empates entre pares en UEFA Nations League post-2019).

### 2.6 `EXP_V55` — Cópula `Student-t` de Colas Pesadas y *Bet Builder* Estructural Jugador-Partido (Raikov)
- **Código:** `src/domain/prediction/sgp_copula.ts` (`evaluateStudentTSameGameParlayV5`, `evaluatePlayerLinkedSgpV5`) y `research/prediction-lab/experiments/EXP_V55_sgp_student_t_player_v5_0/run_sgp_v5_0_student_t_player.py`.
- **Artefactos:** `src/data/prediction/sgp_copula_v5_0_candidate.json` y `sgp_copula_v5_0_snapshot.json` (`50` boletos).
- **Resultados `OOS 2020..2024` (`< 2025-02-02`):**
  - **Teorema de Superposición Condicional de Raikov (`n = 104,632` duelos reales delantero titular × partido OOS):** condicionar en $G_{\text{player}} = k \ge 1$ desplaza mecánicamente el marcador local en $+k$ goles antes de evaluar `Team Win` y `Over 2.5`:
    - `2-Leg (Goleador + Victoria de su Equipo)`: `Independencia = 0.40465 → Raikov v5.0 = 0.39486` (**`ΔLL = -0.00979 [-0.01089, -0.00877]` `significativa`, `ECE = 1.07%`**).
    - `3-Leg (Goleador + Victoria + Over 2.5)`: `Independencia = 0.35684 → Raikov v5.0 = 0.33313` (**`ΔLL = -0.02371 [-0.02526, -0.02222]` `significativa`, `ECE = 0.58%`, `BSS = +3.26%`**).
  - **Cópula `Student-t` QMC Halton (`2,048` puntos):** `VAL <= 2019` seleccionó $\nu = 10.0$ para NFL (colas pesadas en tiroteos/palizas) y $\nu = 500.0$ para goles+remates en fútbol (`ΔLL vs Independencia = -0.05878` `significativa`, `ECE = 0.17%`).

### 2.7 `EXP_V56` — Bandas Epistémicas Conformales (`90%`) y Hub `UnifiedMatchIntelligenceV5`
- **Código:** `src/domain/prediction/epistemic_conformal.ts`, `src/domain/prediction/unified_outlook_v5.ts` y `services/models/regenerate_candidate_matchday_v5.py`.
- **Artefactos:** `src/data/prediction/live_matchday_v5_candidate_snapshot.json` (`SHA-256: 24d210cae25bf6ded6125752cf3fcf13649270bc92e529d5128d20f8cdbbd58d`) y `research/prediction-lab/experiments/EXP_V56_epistemic_unified_v5_0/artifacts/exp_v56_unified_v5_0_results.json`.
- **Verificación sobre los `242` enfrentamientos vivos (`11` ligas, `6` deportes):**
  - **`242 / 242` (`100.0%`) con `dataQuality.flag = "ok"`** (`0` `"low_coverage"`).
  - Cada partido incorpora bandas conformales `[pLower90, pUpper90]` exactas en espacio logit (`0 < pLower90 <= p <= pUpper90 < 1`), grado `A / B / C`, probabilidades de *Early Payout* específicas por deporte (`+2 Goles`, `+17 NFL`, `+20 NBA`, `+5 MLB`), nuevos mercados (`Red Cards`, `Booking Points`, `NFL Key-Total PMF + Push + OT`) y auditoría SGP (`Student-t` + `Raikov Player-Linked`).

---

## 3. Comparativa Institucional Consolidada: `PitchLab v5.0` vs Competidores Auditados

| Capacidad Cuantitativa | *Scout Picks* | *Astra AI* | *LineMate* / *TouchIQ* | *AztecaVet* | **`PitchLab v5.0 Candidate`** |
|---|---|---|---|---|---|
| **Coherencia Matriz de Goles ↔ `1X2`** | Nula (heurísticas `L10` aisladas) | Poisson 2-param incoherente con `1X2` | No modela matriz bivariada | DC clásico con frontera de cono | **4-Param Diagonal-NB exacta (`1.55e-15` en Clubes y Selecciones)** |
| **Micro-Mercados Disciplinarios** | Promedios crudos sin árbitro | NB univariada sin cópula | Conteos históricos simples | No cubre `Booking Points` | **`HGB-Poisson` + Sarmanov + `Red Cards` + `Booking Points` (`10Y+25R`)** |
| **NFL Totales, Spreads y Props** | Sin números clave ni `push` | Gaussiana continua (`0% push`) | Estadísticas descriptivas | Gaussiana sin Totales Clave | **PMF Discreta `3/7/10/14` + Totales Clave `37..51` (`ECE 2.10%`) + `OT` + `5` Props PBP** |
| **Calibración Player Props y `sub_cover`** | `11,878` colapsos `LL = +∞` | Sin calibración isotónica ni `sub_cover` | Tendencias `Hit Rate L5/L10` | Sin multi-línea `1.5+` | **Spline Baricéntrico Logit-PAVA (`7/7` sig.) + `sub_cover` empírico (`+5.41 pp`) + `1.5+`** |
| **Pago Anticipado (*Early Payout*) e *In-Play*** | No soporta | No soporta | No soporta | No soporta | **DP Exacta Primer Paso `90×484` (`+2 Goles`) + Reflexión Browniana (`+17/+20/+5`) + `HT→FT`** |
| **Same-Game Parlay (`SGP` / *Bet Builder*)** | Multiplica $P(A)P(B)$ | Multiplica $P(A)P(B)$ | Multiplica tasas marginales | Sin vínculo jugador-partido | **Cópula `Student-t` QMC Halton + Superposición Raikov Jugador-Equipo (`ΔLL = -0.02371`)** |
| **Incertidumbre Epistémica y Guardrail** | Sin bandas de confianza | `20.7%` inversión de favorito LLM | Sin intervalos conformales | Puntual | **Bandas Conformales Logit `90%` (`[pLower90, pUpper90]`) + Guardrail `0%` alucinación** |

---

## 4. Reproducibilidad Exacta

```powershell
$env:PYTHONDONTWRITEBYTECODE='1'
$py = ".\research\prediction-lab\.venv\Scripts\python.exe"

# 1. Regeneración completa de los 7 experimentos candidatos v5.0 (< 2025-02-02)
& $py -u -B research\prediction-lab\experiments\EXP_V50_soccer_v5_0_global\run_soccer_v5_0_global.py
& $py -u -B research\prediction-lab\experiments\EXP_V51_micro_markets_v5_0\run_micro_markets_v5_0.py
& $py -u -B research\prediction-lab\experiments\EXP_V52_nfl_v5_0_complete\run_nfl_v5_0_complete.py
& $py -u -B research\prediction-lab\experiments\EXP_V53_props_v5_0\run_props_v5_0.py
& $py -u -B research\prediction-lab\experiments\EXP_V54_inplay_early_payout_v5_0\run_inplay_early_payout_v5_0.py
& $py -u -B research\prediction-lab\experiments\EXP_V55_sgp_student_t_player_v5_0\run_sgp_v5_0_student_t_player.py
& $py -u -B services\models\regenerate_candidate_matchday_v5.py

# 2. Suite completa Pytest (Holdout sellado v3.1 + EXP_V33..EXP_V55)
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
  research/prediction-lab/experiments/EXP_V48_sgp_copula_engine `
  research/prediction-lab/experiments/EXP_V50_soccer_v5_0_global `
  research/prediction-lab/experiments/EXP_V51_micro_markets_v5_0 `
  research/prediction-lab/experiments/EXP_V52_nfl_v5_0_complete `
  research/prediction-lab/experiments/EXP_V53_props_v5_0 `
  research/prediction-lab/experiments/EXP_V54_inplay_early_payout_v5_0 `
  research/prediction-lab/experiments/EXP_V55_sgp_student_t_player_v5_0 -v

# 3. Suite completa Vitest (paridad IEEE-754 < 1e-12 Python <-> TypeScript y auditoría Red Team v5.0)
npx.cmd vitest run tests/prediction/
```
