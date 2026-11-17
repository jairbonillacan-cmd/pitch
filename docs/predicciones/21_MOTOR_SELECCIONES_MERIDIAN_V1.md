# 21 — Motor de Selecciones Nacionales `PitchLab Meridian v1.0 → v2.0` (`EXP_V33_intl_soccer`)

**Experimento:** `EXP_V33_intl_soccer` · **Motor por defecto:** `PitchLab Meridian v2.0` (`49` base + `6` regímenes = `55` columnas; retrocompatible con `Meridian v1.0` de `38` base) · **Fecha:** `2026-11-17` · **Estado:** `"candidate"`, `production_activated = false` (activo para panorama probabilístico `MatchOutlook` sin stake; apagado para apuestas de valor bajo Regla Rectora #3 de [`MASTER.md`](../../research/prediction-lab/coordination/v3_2/MASTER.md)).

---

## 1. Problema Resuelto y Evolución `v1.0 → v2.0`

El motor de clubes `PitchLab Tachyon v3.0` (`model_motor_a.json`) está diseñado sobre `23` divisiones domésticas de `34–38` jornadas anuales. En **selecciones nacionales** (Mundial, Copa América, Eurocopa, Copa Oro, Eliminatorias, Nations League y Amistosos FIFA), una federación disputa apenas `8–14` partidos al año, existen sedes neutrales puras y con diáspora asimétrica, choques severos de altitud barométrica (ej. El Alto `4,150 m`, Quito `2,850 m`, CDMX `2,240 m`), viajes transcontinentales en dobles Fechas FIFA y dependencia directa del talento real de su generación activa en clubes.

`PitchLab Meridian v2.0` resuelve estos puntos **sin modificar ni un byte** de los archivos congelados de `v3.1`/`v3.2` (`engine.ts`, `outlook.ts`, `service.ts`, `model_motor_a.json`, `model_nfl.json`, `production_segments_v3_1.json`):

1. **Pila Primaria `100%` Abierta y Comercialmente Limpia (`CC0 1.0 Universal`):**
   - `martj42/international_results` (`results.csv`, `shootouts.csv`, `former_names.csv`, `goalscorers.csv` con `47,914` goles minuto a minuto): liquidación reglamentaria de `90` minutos, descomposición de goles sin penales (`npG`), supremacía ponderada por tiempo en ventaja minuto a minuto (`time_in_lead_ratio` en `[-1, +1]`) y diversidad de goleadores (`unique_scorers_r10_diff`).
   - `dcaribou/transfermarkt-datasets` (`CC0 1.0`, `50,149` jugadores y `656,301` valuaciones `2000–2026`): snapshots bimensuales estrictamente causales (`valuation.date < snapshot_date < match_date`) del pool Top-23 elegible por ciudadanía FIFA (`tm_log_top23_val_diff`, `tm_top5_share_diff` en `GB1/ES1/L1/IT1/FR1`, profundidad de banquillo `12..23 / 1..11` y brecha `tm_val_vs_elo_gap_diff` que anticipa auges/declives generacionales antes de que el Elo nacional reaccione).
   - **Fórmula Oficial FIFA SUM (`scale = 600`) + Física Climática Estacional (`thermal_climate_adv`) + Altitud ISA / Diáspora:** presión barométrica estándar ISA $P_{\text{ISA}}(h) = 1013.25\,(1 - 2.25577\times 10^{-5}\,h)^{5.25588}$, choque térmico tropical/invernal determinista, localía efectiva $h_{\text{eff}} \in [-1, +1]$ (incluyendo hubs con diáspora en EE.UU./Europa) y detección del 2º partido de ventana FIFA (`2 <= days_rest <= 6`).
2. **Vector Denso `100%` Libre de Sesgo Entrenamiento-Inferencia (`49 / 49` en `v2.0` y `38 / 38` en `v1.0`):** `dataQuality.coverageRatio = 1.0`, `dataQuality.flag = "ok"` en inferencia síncrona `< 1 ms`.
3. **Puente Táctico `T-60m` (`computeSquadClubAdjustment`):** ajuste acotado (`tanh`) sobre $(\log \lambda_H, \log \lambda_A)$ ponderando `ClubElo`, minutos recientes (`30d`) y química de compañeros de club de los titulares confirmados, sujeto estrictamente a `tsPublishedUtc <= tsDecisionUtc - 2.0 min < kickoffUtc` (multiplicador neutro exacto `1.0` en ausencia de timestamp auditable).

---

## 2. Evidencia Cuantitativa en `walk_forward_dev` (`OBSERVADO`, `"sin cierre sharp"`)

Partición estricta con guardia `HoldoutSealedAccessError` sobre `< 2025-02-02` (`1,000` réplicas bootstrap `mulberry32`, semilla `20261111`):

| Modelo / Variante | `n` (`2010–24`) | `Log-Loss` `[IC 95%]` | `Brier` `[IC 95%]` | `RPS` `[IC 95%]` | `ECE` `[IC 95%]` | `ΔLL vs Benchmark` `[IC 95%]` | Significancia |
|---|---:|---|---|---|---|---|---|
| `base_rate_regime` (prior por régimen + neutralidad) | `12,904` | `1.05232` `[1.04682, 1.05808]` | `0.63433` `[0.63053, 0.63826]` | `0.22518` `[0.22361, 0.22679]` | `0.00332` `[0.00196, 0.00908]` | `+0.00000` `[+0.00000, +0.00000]` | `"no significativa"` (ref.) |
| `intl_elo_baseline` (Elo dinámico internacional) | `12,904` | `0.91947` `[0.91015, 0.92969]` | `0.54254` `[0.53604, 0.54966]` | `0.18098` `[0.17850, 0.18362]` | `0.01241` `[0.00777, 0.01814]` | `-0.13285` `[-0.14131, -0.12377]` vs `base_rate` | `significativa` |
| `intl_dc_online` (Dixon-Coles estructural online) | `12,904` | `0.90730` `[0.89891, 0.91611]` | `0.53613` `[0.53028, 0.54240]` | `0.17877` `[0.17649, 0.18111]` | `0.01699` `[0.01242, 0.02182]` | `-0.14502` `[-0.15253, -0.13742]` vs `base_rate` | `significativa` |
| **`PitchLab Meridian v1.0` (`38` base)** | **`12,904`** | **`0.89780` `[0.88772, 0.90864]`** | **`0.52959` `[0.52297, 0.53691]`** | **`0.17566` `[0.17291, 0.17840]`** | **`0.00769` `[0.00544, 0.01275]`** | **`-0.02167` `[-0.02586, -0.01757]` vs `Elo`** | **`significativa`** |
| `v1.0 + Bloque B (Transfermarkt Pool CC0)` | `12,904` | `0.89549` `[0.88550, 0.90612]` | `0.52805` `[0.52141, 0.53537]` | `0.17490` `[0.17222, 0.17764]` | `0.00737` `[0.00530, 0.01263]` | `-0.00232` `[-0.00358, -0.00116]` vs `v1.0` | `significativa` |
| **`PitchLab Meridian v2.0` (`49` base = `v1 + A + B + C`)** | **`12,904`** | **`0.89535` `[0.88531, 0.90606]`** | **`0.52801` `[0.52124, 0.53541]`** | **`0.17484` `[0.17213, 0.17756]`** | **`0.00850` `[0.00550, 0.01350]`** | **`-0.00245` `[-0.00378, -0.00122]` vs `v1.0` (`-0.02412` vs `Elo`)** | **`significativa` (motor por defecto)** |
| `PitchLab Meridian v3.0` (`53` base = `v2 + copas élite CC0 + Banco Mundial`) | `12,904` | `0.89488` `[0.88461, 0.90545]` | `0.52757` `[0.52085, 0.53472]` | `0.17465` `[0.17187, 0.17748]` | `0.00887` `[0.00641, 0.01434]` | `-0.00048` `[-0.00140, +0.00054]` vs `v2.0` (`-0.00292` `significativa` vs `v1.0`) | `"no significativa"` vs `v2.0` (`getMeridianV3Artifacts()`) |

### Ventana Reciente `DEV_OOS 2020..2024` (`n = 4,302` partidos)
- **`PitchLab Meridian v1.0`:** `LL = 0.88990 [0.87197, 0.90989]`, `Brier = 0.52419`, `RPS = 0.17314`.
- **`PitchLab Meridian v2.0`:** **`LL = 0.88701 [0.86906, 0.90666]`**, `Brier = 0.52209`, `RPS = 0.17204`, **`ΔLL vs v1.0 = -0.00289 [-0.00544, -0.00037]` (`significativa`)**.
- **Descarte honesto en `VAL 2010..2019`:** la variante de `51` features (`+ tm_gk_def_log_val_diff`, `+ tm_prime_age_share_diff`) registró `VAL LL = 0.899605` frente a `0.899523` de la variante de `49` features, por lo que fue descartada sin tocar `2020–2024`.

---

## 3. Inventario de Artefactos y Hashes `SHA-256`

| Ruta | Rol | `SHA-256` |
|---|---|---|
| [`src/data/prediction/model_intl_soccer_v2.json`](../../src/data/prediction/model_intl_soccer_v2.json) | **Motor por defecto `Meridian v2.0`** (`49` base + `6` `div_levels` = `55`), `status: "candidate"`, `production_activated: false` | `02edb3746beee793d14cc352921eb1a8ad458a418f5b22d1139651194ed9faa8` |
| [`src/data/prediction/intl_soccer_causal_state_v2.json`](../../src/data/prediction/intl_soccer_causal_state_v2.json) | Estado causal vivo `v2.0` (`189` federaciones FIFA, `49/49 = 100%` cobertura `< 1 ms`) | `63ef560f031563100cc238aad1925fbdaf673390a6f62230938e3e1c5804d1ec` |
| [`src/data/prediction/intl_outlook_calibration_v2.json`](../../src/data/prediction/intl_outlook_calibration_v2.json) | Curvas de confiabilidad `v2.0` de `10` bins (`1x2`, `totals`, `btts`) por régimen internacional | `9f8b1c8d4f5156b345e8927558384a141987aaa391da9c12c65c98b3f12c4d74` |
| [`src/data/prediction/intl_soccer_snapshot_v2.json`](../../src/data/prediction/intl_soccer_snapshot_v2.json) | `200` partidos `< 2025-02-02` para verificación de paridad `< 1e-12` en `v2.0` | `683d64f43e5f2c660203ab84465885063691d4a0413465677a9e1082f4bc821a` |
| [`src/data/prediction/model_intl_soccer_v3.json`](../../src/data/prediction/model_intl_soccer_v3.json) | Variante macro-continental `Meridian v3.0` (`53` base + `6` `div_levels` = `59`, `LL = 0.89488` en `2010–24`), vía `getMeridianV3Artifacts()` | `9eb7643b2046d816ae730c38d3d910686dd8912aa1cd002239e5df2900f147b6` |
| [`src/data/prediction/intl_soccer_causal_state_v3.json`](../../src/data/prediction/intl_soccer_causal_state_v3.json) | Estado causal vivo `v3.0` (`53/53 = 100%` cobertura: incluye copas continentales `CC0` y Banco Mundial rezagado) | `97f6ccb989b5d5184f79b91c413a03604035e1fca0cd715f8d5c9028b342349b` |
| [`src/data/prediction/intl_outlook_calibration_v3.json`](../../src/data/prediction/intl_outlook_calibration_v3.json) | Curvas de confiabilidad `v3.0` de `10` bins | `67ff4986b71a4ad8accbfddb375f86dc0e1bda1e7d343059fc0911b96b500fb3` |
| [`src/data/prediction/intl_soccer_snapshot_v3.json`](../../src/data/prediction/intl_soccer_snapshot_v3.json) | `200` partidos `< 2025-02-02` para verificación de paridad `< 1e-12` en `v3.0` | `1fe54784f7bb7cb26dfb1e4c962b1276d75bd4db89088bba4079df2d702b94c3` |
| [`src/data/prediction/model_intl_soccer_v1.json`](../../src/data/prediction/model_intl_soccer_v1.json) | Pesos `Meridian v1.0` (`38` base + `6` `div_levels` = `44`), retrocompatible vía `getMeridianV1Artifacts()` | `df9c34b2d181897e60f869f5bd8251ac64573f1dea8293be27bc914eb16b989f` |
| [`src/data/prediction/intl_soccer_causal_state.json`](../../src/data/prediction/intl_soccer_causal_state.json) | Estado causal `v1.0` (`38/38` cobertura) | `3227bbb74aefb6529ccb55abccc96fe2c536cdfc029d2f0486439908c58e0e1e` |
| [`src/data/prediction/intl_outlook_calibration_v1.json`](../../src/data/prediction/intl_outlook_calibration_v1.json) | Curvas de confiabilidad `v1.0` | `458a9963cbbba216250e2e065bf6d750b4d2af69caf1a8f3f638a881f7f3233b` |
| [`src/data/prediction/intl_soccer_snapshot.json`](../../src/data/prediction/intl_soccer_snapshot.json) | `200` partidos `v1.0` para test de paridad `< 1e-12` | `b3270ed80a4fae70f240fcb025f263d80b6f170baf9ec9f086915886812a3d14` |
| [`src/domain/prediction/intl_soccer.ts`](../../src/domain/prediction/intl_soccer.ts) | Motor puro TypeScript (`synthesizeIntlMatchSnapshotRow`, `computeThermalClimateMismatch`, `computeSquadClubAdjustment`, `buildIntlMatchOutlook`) | *(verificado por Vitest)* |

---

## 4. Comandos Reproducibles

```powershell
# 1. Reproducir ablación v2 y promoción de Meridian v2.0 (< 2025-02-02)
$env:PYTHONDONTWRITEBYTECODE='1'
.\research\prediction-lab\.venv\Scripts\python.exe -B research/prediction-lab/experiments/EXP_V33_intl_soccer/run_ablation_v2.py
.\research\prediction-lab\.venv\Scripts\python.exe -B research/prediction-lab/experiments/EXP_V33_intl_soccer/promote_meridian_v2.py

# 2. Ejecutar suite Pytest de causalidad (0.0 bits fuga), Time-in-Lead, física y artefactos v1/v2
.\research\prediction-lab\.venv\Scripts\python.exe -B -m pytest research/prediction-lab/experiments/EXP_V33_intl_soccer -v

# 3. Ejecutar suite Vitest de paridad TS <-> Python (< 1e-12) sobre Meridian v1.0 y v2.0
npx.cmd vitest run tests/prediction/intl_soccer.test.ts
```
