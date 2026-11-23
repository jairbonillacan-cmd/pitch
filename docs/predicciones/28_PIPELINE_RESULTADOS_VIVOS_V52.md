# 28 · Pipeline de Retroalimentación con Resultados Reales `PitchLab v5.2 Candidate` (`EXP_V57`)

> **Estado:** `status = "candidate"` · `production_activated = false` · **Fecha:** 2026-11-22 · **Rama:** `prediction-lab`  
> **Gobernanza y Anti-Fuga (`OBSERVADO`):** `0` bytes modificados en los **`11` artefactos congelados `v3.0`/`v3.1`/`v3.2`** ni en los **`11` artefactos `v5.1`**, `0` accesos a `holdout_sealed` para selección de hiperparámetros (`holdout_sealed_untouched: true`), **cluster-bootstrap determinista** (`mulberry32`, `1,000` réplicas agrupadas por `date`, `seed = 20261111`), paridad IEEE-754 `< 10⁻¹²` Python ↔ TypeScript y `0` campos prohibidos (`stake`, `kelly`, `ev`, `tier`).

---

## 1. Propósito y Fuentes de Resultados Conectadas (`bridge_live_results.py`)

El puente [`bridge_live_results.py`](../../research/prediction-lab/experiments/EXP_V57_v5_2_live_feedback/bridge_live_results.py) extrae y audita sin fugas temporales los resultados reales acumulados en los snapshots de la plataforma (`57` ligas):

- **`8,040` partidos liquidados (`season-results.json`, `47` ligas):** `5,120` partidos de fútbol en `43` ligas/copas + **`2,202` MLB + `346` NHL + `222` NBA + `150` NFL**.
- **`59` partidos capturados estrictamente pre-kickoff (`57` fútbol + `2` NFL):** congelados en snapshots fechados (`2026-11-09`..`2026-11-19`) mientras `status == "scheduled"`, más `978` partidos `FT` en `shell-index.json`.
- **`22,579` jugadores (`50` ligas en `squads.json`):** `7,129` `candidatePicks` (`2,750` `player_shots`, `2,176` `player_sot`, `1,056` `player_goal_or_assist`, `835` `player_goal`, `312` `player_saves`), **`325` porteros activos** (`appearances >= 3`, `saves > 0`) y `2,497` bitácoras US (`recentGames`).
- **Hallazgos estructurales detectados por la auditoría del puente:**
  1. `17,457` futbolistas en `squads.json` carecen de `minutes` y `recentGames` partido a partido.
  2. `24` análisis `FT` en `latest.json` tenían `inputsAsOf > startTime` y `NBA` (`5 FT`) / `NHL` (`14 FT`) quedan con `hasForecast = 0` al cerrar.
  3. Las bitácoras `recentGames` de `squads.json` en deportes US estaban truncadas a las primeras `5` columnas de ESPN (omitiendo `PTS/AST/3PM` en NBA, `SO/HR/TB` en MLB y `SOG` en NHL).

---

## 2. Evidencia Empírica Walk-Forward (`EXP_V57`, `OBSERVADO`)

| Módulo `v5.2` | Muestra OOS / Clusters | Métrica Antes (`Benchmark`) | Métrica `v5.2` (`Candidato`) | `Δ` `[IC 95% Cluster-Bootstrap]` | Veredicto |
|---|---:|---:|---:|---|---|
| **Fútbol `43` Ligas `1X2` Walk-Forward** (`date' < date`) | `n = 4,492` (`141` fechas) | `LL = 1.06944` | **`LL = 1.04310`** | **`-0.02633`** `[-0.03362, -0.01942]` | **`significativa` (`p = 0.000`)** |
| **Fútbol `43` Ligas `Over 2.5` Walk-Forward** | `n = 4,492` (`141` fechas) | `LL = 0.69346` (`ECE = 5.19%`) | **`LL = 0.68540` (`ECE = 3.25%`)** | `-0.00806` `[-0.01711, +0.00105]` | `ECE -37.4%` (`p = 0.046`, `"no significativa"` 2 colas) |
| **Cohorte Pre-Kickoff Estricta `Over 2.5`** | `n = 57` (`6` fechas) | `LL = 0.72459` (sesgo `-13.13 pp`) | **`LL = 0.68912`** (sesgo `-9.34 pp`) | **`-0.03547`** `[-0.06289, -0.01863]` | **`significativa` (`p = 0.004`)** |
| **Picks Jugables Pre-Kickoff (`1.55–2.60`)** | `n = 138` (`53` partidos) | `LL = 0.71186` | **`LL = 0.68855`** | **`-0.02331`** `[-0.04329, -0.00335]` | **`significativa` (`p = 0.015`)** |
| **Porteros `player_saves` (`SaveRate_EB`)** | `n = 295` (`13` ligas) | `Brier = 0.04493` (tasa cruda) | **`Brier = 0.02892`** (`-35.6%` MSE) | `-0.01601` `[-0.03323, +0.00674]` | `p = 0.075` (`"no significativa"` por `13` clusters) |
| **MLB Walk-Forward Juego-a-Juego OOS** | `n = 2,142` (`202` fechas, `1,757` B2B) | `LL = 0.69315` | **`LL = 0.68586`** (`ECE = 3.38%`, bias `-0.07` C) | **`-0.00729`** `[-0.01153, -0.00292]` | **`significativa` (`p = 0.000`)** |
| **NBA Walk-Forward Juego-a-Juego OOS** | `n = 159` (`22` fechas, `68` B2B) | `LL = 0.69315` | **`LL = 0.64800`** (bias `-0.29` pts) | **`-0.04515`** `[-0.07898, -0.01199]` | **`significativa` (`p = 0.001`)** |
| **NHL Walk-Forward Juego-a-Juego OOS** | `n = 277` (`43` fechas, `101` B2B) | `LL = 0.69315` | **`LL = 0.68361`** (**`ECE = 1.93%`**, bias `-0.14` G) | `-0.00954` `[-0.01973, +0.00057]` | `p = 0.032` (`"no significativa"` 2 colas) |
| **NFL Walk-Forward Juego-a-Juego OOS** | `n = 117` (`32` fechas) | `LL = 0.69315` | **`LL = 0.66612`** (bias `-0.49` pts) | `-0.02703` `[-0.06268, +0.01665]` | `"no significativa"` (`n = 117`) |

---

## 3. Artefactos y Módulos Entregados

- **Motor TypeScript:** [`src/domain/prediction/v5_2_live_feedback.ts`](../../src/domain/prediction/v5_2_live_feedback.ts) (re-exportado en [`src/domain/prediction/v5_index.ts`](../../src/domain/prediction/v5_index.ts)).
- **Artefactos JSON:**
  - [`src/data/prediction/model_v5_2_live_feedback_candidate.json`](../../src/data/prediction/model_v5_2_live_feedback_candidate.json) (`43` entornos dinámicos de liga + configuración GK Saves, Coupled Shots y Multi-Sport Walk-Forward).
  - [`src/data/prediction/v5_2_live_feedback_snapshot.json`](../../src/data/prediction/v5_2_live_feedback_snapshot.json) (`85` vectores de paridad IEEE-754 `< 10⁻¹²`).
  - [`src/data/prediction/candidate_registry_v5_2.json`](../../src/data/prediction/candidate_registry_v5_2.json) (manifiesto criptográfico `SHA-256`).
- **Reproducción exacta:**
  ```powershell
  python research/prediction-lab/experiments/EXP_V57_v5_2_live_feedback/run_exp_v57_live_feedback.py
  python research/prediction-lab/experiments/EXP_V57_v5_2_live_feedback/test_exp_v57_v5_2.py
  npx.cmd vitest run tests/prediction/
  ```
