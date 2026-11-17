# 23 · Reporte de Cierre de Jornada — Motores `prediction-lab` (Olas 1, 2 y Arranque `v3.5`)

- **Fecha de corte:** `2026-11-17`
- **Rama Git:** `mejorar_predicciones_futbol`
- **Corte temporal anti-fuga respetado al 100%:** `match_date < 2025-02-02` (`HOLDOUT_CUT_ISO = "2025-02-02T17:30:00Z"`, `holdout_sealed` intacto)
- **Inmutabilidad `v3.1` / `v3.2`:** `0` modificaciones sobre `engine.ts`, `outlook.ts`, `service.ts`, `gbm.ts`, `markets_2way.ts`, `model_motor_a.json`, `model_nfl.json`, `production_segments_v3_1.json` y `services/models/*`

---

## 1. Qué se hizo y completó hoy

### 1.1 Auditoría legal e ingesta de 11 fuentes abiertas gratuitas (`0` evasión anti-bot)
- **Integradas con verificación `SHA-256` y licencias permisivas:**
  1. `martj42/international_results` (`CC0 1.0`): `results.csv`, `shootouts.csv`, `former_names.csv` y `goalscorers.csv` (`47,914` goles con minuto, penales y autogoles).
  2. `dcaribou/transfermarkt-datasets` (`CC0 1.0 Universal`): `players` (`50k`), `player_valuations` (`656k`), `clubs` (`796`), `games` (`88.9k` incl. `CL/EL/ECL` y copas domésticas), `appearances` (`1.89M` apariciones jugador-partido) y `transfers` (`154k` traspasos filtrados `< 2025-02-02`).
  3. `statsbomb/open-data` (`season_id = 27`, Big-5 `2015/2016 < 2020`): calibración empírica `P1-1` de `shot-xG` desde tiros/tiros a puerta/córners ($R^2 = 0.5289$ local / $0.4848$ visitante).
  4. Banco Mundial / OKFN: `wb_population.csv` (`ODC-PDDL-1.0`) y `wb_gdp.csv` (`CC-BY-4.0`) con rezago estricto `Year <= match_year - 1`.
  5. `xgabora/Club-Football-Match-Data` (`MIT`) y `nflverse` PBP (`CC-BY-4.0` / `MIT`, `< 2025-02-02`).
- **Bloqueadas preventivamente tras auditoría legal:** `Dato-Futbol/fifa-ranking` (sin archivo `LICENSE`) y `Oscar343/soccer-dataset` (redistribución de `API-Football` sin sublicencia verificable).

### 1.2 Motor de Selecciones Nacionales (`PitchLab Meridian v1.0 → v2.0 / v3.0`)
- Implementado en [`src/domain/prediction/intl_soccer.ts`](../../src/domain/prediction/intl_soccer.ts) con cobertura viva `100%` (`49/49` features en `v2.0`, `219` federaciones FIFA/no-FIFA, `flag = "ok"`), física barométrica ISA de altitud, Haversine de viaje, puente condicional Club→Selección (`CONTRACT_XI_PUBLISHED`) y paridad IEEE-754 `< 10⁻¹²` frente a Python:
  - **`PitchLab Meridian v2.0` (`49` base cols, activo por defecto):**
    - `2010–2024` (`n = 12,904`): **`LL = 0.89535`**, `ECE = 0.00850` (`ΔLL vs v1.0 = -0.00245 [-0.00378, -0.00122]` **`significativa`**; `ΔLL vs Elo = -0.02412 [-0.02944, -0.01891]` **`significativa`**).
    - `2020–2024` (`n = 4,214`): **`LL = 0.88701`** (`ΔLL vs v1.0 = -0.00289 [-0.00531, -0.00051]` **`significativa`**).
  - **`PitchLab Meridian v3.0` (`53` base cols, disponible vía `getMeridianV3Artifacts()`):** **`LL = 0.89488`** (`ΔLL vs v1.0 = -0.00292` **`significativa`**; mantenido como opcional porque su ventaja sobre `v2.0` es `"no significativa"` y `appearances` de Transfermarkt cubre hasta abril 2025).

### 1.3 Motores de Fútbol de Clubes (`PitchLab Tachyon v3.3 → v3.4` y `Tachyon v3.4 Live-Complete`)
- Implementados en [`src/domain/prediction/club_v3_3.ts`](../../src/domain/prediction/club_v3_3.ts) junto con el estado causal vivo [`src/data/prediction/club_free_open_state_v3_4.json`](../../src/data/prediction/club_free_open_state_v3_4.json) (`608` clubes activos en `23` divisiones):
  - **`PitchLab Tachyon v3.4 Candidate` (`127` base cols):** **`LL = 1.00845`** en `n = 68,638` partidos (`ΔLL vs v3.0 Full = -0.00150 [-0.00202, -0.00100]` **`significativa`**; `ΔLL vs v3.3 = -0.00059 [-0.00095, -0.00024]` **`significativa`**).
  - **`PitchLab Tachyon v3.4 Live-Complete` (`52` base cols = `LIVE_38 + 14 Open`, `100%` cobertura viva):** **`LL = 1.00794`** y **`ECE = 0.00470`**, superando en **`ΔLL = -0.00756 [-0.00853, -0.00658]` (`significativa`)** al modo vivo actual `v3.0` (`38/113`, `LL = 1.01550`) y en **`ΔLL = -0.00200 [-0.00272, -0.00131]` (`significativa`)** incluso al histórico completo `v3.0` (`113/113`, `LL = 1.00995`).

### 1.4 Arranque de Ola 3 (`v3.5` — Mejora Arquitectónica Multi-Mercado y No-Lineal)
1. **Solver Coherente Dixon-Coles de 3 Parámetros (`PitchLab Horizon-Goals v3.5`):**
   - Completado y verificado con paridad `< 10⁻¹²` entre [`horizon_dc_solver.py`](../../research/prediction-lab/experiments/EXP_V37_club_v3_5_engines/horizon_dc_solver.py) y [`src/domain/prediction/horizon_goals.ts`](../../src/domain/prediction/horizon_goals.ts) (cubierto por [`tests/prediction/horizon_goals.test.ts`](../../tests/prediction/horizon_goals.test.ts)).
   - Explota la invariancia exacta de `P_DC(H > A) - P_DC(H < A)` y `P_DC(Over 2.5)` respecto a `rho` para preservar las probabilidades `1X2` exactas del ensamble mientras alinea `lamHome + lamAway` con un regresor `Poisson` dedicado de goles totales, sin tocar `outlook.ts`.
2. **NFL `PitchLab Minkowski v3.5` (`EXP_V39` — Primera corrida completada y exportada):**
   - Exportados [`gbm_nfl_v3_5_candidate.json`](../../src/data/prediction/gbm_nfl_v3_5_candidate.json), [`model_nfl_v3_5_candidate.json`](../../src/data/prediction/model_nfl_v3_5_candidate.json), [`model_nfl_totals_v3_5_candidate.json`](../../src/data/prediction/model_nfl_totals_v3_5_candidate.json), [`nfl_causal_state_v3_5.json`](../../src/data/prediction/nfl_causal_state_v3_5.json) y [`nfl_v3_5_snapshot.json`](../../src/data/prediction/nfl_v3_5_snapshot.json) (`100%` validados contra `gbm.ts` a `< 10⁻¹²`).
   - **`Minkowski Totals v3.5`** redujo el RMSE de puntos totales NFL de `13.896` (prior constante `44.5` de `v3.0`) a **`13.505`** y mejoró `Over/Under` frente a la línea real en **`ΔLL = -0.01256 [-0.01941, -0.00518]` (`significativa`, `n = 3,862`)**.

---

## 2. Dónde nos quedamos exactamente

Al cierre de la jornada se detuvieron limpiamente los procesos largos en segundo plano (`0` tareas colgadas, `100%` de tests Pytest y Vitest en verde):

| Componente `v3.5` | Archivo principal | Estado exacto al corte |
|---|---|---|
| Solver 3-Param DC + `Poisson` TS | [`src/domain/prediction/horizon_goals.ts`](../../src/domain/prediction/horizon_goals.ts) | **Completado y probado** (`< 10⁻¹²` TS↔Python) |
| Pipeline Clubes `v3.5` (`1X2 Ensemble` + `Horizon-Goals`) | [`run_club_v3_5_engines.py`](../../research/prediction-lab/experiments/EXP_V37_club_v3_5_engines/run_club_v3_5_engines.py) | **Código 100% listo**; ejecución detenida a mitad del walk-forward `HGB` (`68,638` partidos) por cierre de jornada |
| Pipeline Selecciones `Meridian v3.5` (`1X2 Ensemble` + `Horizon-Goals`) | [`run_meridian_v3_5_engines.py`](../../research/prediction-lab/experiments/EXP_V33_intl_soccer/run_meridian_v3_5_engines.py) | **Código 100% listo y depurado**; ejecución detenida al cierre de jornada |
| Pipeline NFL `Minkowski v3.5` (Elevación Hiperbólica Binaria HGB `[+0.5*T, 0, -0.5*T]` + calibración `sigma_total`) | [`run_nfl_v3_5_engines.py`](../../research/prediction-lab/experiments/EXP_V39_nfl_v3_5_engines/run_nfl_v3_5_engines.py) | **Artefactos v3.5 base ya exportados y probados**; código actualizado con elevación hiperbólica binaria HGB listo para re-ejecutar (~15 s) |

---

## 3. Qué faltó (Checklist de reanudación inmediata para la próxima sesión)

1. **Terminar de correr los 3 entrenamientos `walk_forward_dev` `v3.5` (`< 2025-02-02`):**
   ```powershell
   $env:PYTHONDONTWRITEBYTECODE='1'; $env:PYTHONUNBUFFERED='1'
   .\research\prediction-lab\.venv\Scripts\python.exe -B research\prediction-lab\experiments\EXP_V39_nfl_v3_5_engines\run_nfl_v3_5_engines.py
   .\research\prediction-lab\.venv\Scripts\python.exe -B research\prediction-lab\experiments\EXP_V33_intl_soccer\run_meridian_v3_5_engines.py
   .\research\prediction-lab\.venv\Scripts\python.exe -B research\prediction-lab\experiments\EXP_V37_club_v3_5_engines\run_club_v3_5_engines.py
   ```
   Esto generará los 5 JSON candidatos restantes:
   - `src/data/prediction/gbm_club_v3_5_live_candidate.json`
   - `src/data/prediction/model_club_v3_5_live_candidate.json`
   - `src/data/prediction/model_club_goals_v3_5_candidate.json`
   - `src/data/prediction/club_free_open_state_v3_5.json` y `club_v3_5_live_snapshot.json`
   - `src/data/prediction/gbm_intl_soccer_v3_5_candidate.json`, `model_intl_goals_v3_5_candidate.json` e `intl_soccer_v3_5_snapshot.json`
2. **Conectar los motores `v3.5` en la capa TypeScript candidata (sin tocar `service.ts` ni `outlook.ts`):**
   - Exponer `buildClubV35CompleteOutlook` (ensamble `1X2` + `Horizon-Goals` 3-parámetros) en `club_v3_3.ts`.
   - Integrar `Meridian Horizon-Goals v3.5` opcional/por defecto en `intl_soccer.ts`.
   - Crear `src/domain/prediction/nfl_v3_5.ts` (síntesis viva desde `nfl_causal_state_v3_5.json` + ensamble `gbm.ts` + `expectedTotal` de `Minkowski Totals v3.5`) y la fachada unificada `src/domain/prediction/lab_engines_v3_5.ts`.
3. **Pruebas finales de paridad `< 10⁻¹²` sobre los snapshots `v3.5` de Clubes y Selecciones** en `tests/prediction/horizon_goals.test.ts`.
4. **Pendiente estructural fuera de código (recolección prospectiva):**
   - Acumular `>= 64` cierres `sharp` liquidados en `nfl_sharp_closing.parquet` antes de evaluar cualquier promoción de candidatos a producción o apertura única de `sealed_holdout_2025`.
