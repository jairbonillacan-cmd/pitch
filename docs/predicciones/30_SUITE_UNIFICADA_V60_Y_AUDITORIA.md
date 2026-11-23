# 30 · Suite Unificada `PitchLab Spacetime v6.0 Candidate` y Auditoría Red-Team de 16 Axiomas (`EXP_V57`–`EXP_V62`)

> **Estado:** `status = "candidate"` · `production_activated = false` · **Fecha:** 2026-11-22 · **Rama:** `prediction-lab`  
> **Gobernanza y Anti-Fuga (`OBSERVADO`):** `0` bytes modificados en los **`25 / 25` artefactos inmutables previos** (`11` congelados `v3.0/v3.1/v3.2` + `11` de `v5.1` + `3` de `v5.2`, `SHA-256` verificado bit a bit), `0` accesos a `holdout_sealed` para selección de hiperparámetros (`holdout_sealed_untouched: true`), causalidad estricta por fecha (`date' < date`) sobre los resultados `2026`, **cluster-bootstrap determinista** (`mulberry32`, `1,000` réplicas agrupadas por `date`, `seed = 20261111`), paridad IEEE-754 `< 10⁻¹²` y `SHA-256` idénticos Python ↔ TypeScript, **`0` errores** en `tsc --noEmit --strict --noUncheckedIndexedAccess`, **`32 / 32` suites Vitest (`376 / 376` tests)** incl. los **`16` Axiomas Red-Team**, **`34 / 34` tests Pytest** (`sealed_holdout` + `EXP_V57`–`EXP_V62`) y `0` claves prohibidas (`stake`, `kelly`, `kellyFraction`, `expectedEdge`, `ev`, `tier`, `valueStatus`).

---

## 1. Resumen Ejecutivo (`EXP_V57` → `EXP_V62`)

A partir de la auditoría empírica de resultados reales de partidos (`8,040` juegos en `season-results.json`, `1,021` `FT` en `shell-index.json`, `59` pre-kickoff estrictos), picks (`9,754` selecciones) y jugadores (`22,579` perfiles, `7,129` `candidatePicks`, `325` porteros activos y `2,497` bitácoras US), se construyó y validó la cadena completa **`v5.2` (`EXP_V57`) → `v6.0 Candidate` (`EXP_V58`–`EXP_V62`)**:

| Experimento / Módulo | Alcance Técnico | Evidencia Fuera de Muestra (`cluster_mulberry32`, `1,000` réplicas, `seed = 20261111`) |
|---|---|---|
| **`EXP_V57`** · Puente Vivo y Base `v5.2` (`v5_2_live_feedback.ts`) | Extracción determinista de las `57` ligas (`bridge_live_results.py`), recalibración `LeagueScoringEnv`, motor NB base de `player_saves`, des-sesgado titular/suplente y walk-forward inicial US. | `43` ligas fútbol `1X2`: **`ΔLL = -0.02633 [-0.03362, -0.01942]` (`significativa`)**; Pre-kickoff `O2.5`: **`ΔLL = -0.03547` (`significativa`)**; Picks jugables `[1.55, 2.60]`: **`ΔLL = -0.02331` (`significativa`)**; Porteros `-35.6%` MSE; `MLB` (`-0.00729`) y `NBA` (`-0.04515`) **`significativa`**. |
| **`EXP_V58`** · Escala Fútbol `53` Competiciones (`soccer_57_v6_0.ts`) | Jerarquía Empirical-Bayes en las **`53` competiciones de fútbol** (`43` activas en walk-forward `2026` + `10` con prior de confederación y métricas `2026 = null`), Matriz **4-Param Diagonal-NB** (`error máx. cono 1X2 = 1.221 × 10⁻¹⁵`) e *Inductive Venn-Abers* entrenado `< 2025-02-02`. | Post-burnin `43` ligas (`n = 4,492`, `141` fechas): **`1X2 LL = 1.04001` (`ΔLL = -0.03139 [-0.03805, -0.02536]`, `significativa`)** y **`O2.5 LL = 0.68242` (`ΔLL = -0.01173 [-0.02034, -0.00281]`, `ECE = 2.44%`, `significativa`)**. Pre-kickoff zona jugable `[1.55, 2.60]` (`n = 138`): **`ΔLL = -0.02585 [-0.04228, -0.01227]` (`ECE: 6.40% → 3.58%`, `significativa`)**. |
| **`EXP_V59`** · Props Acoplados, Porteros SGP y Extractor US (`props_v6_0.ts`) | Cierra `D7` con splines baricéntricos Logit-PAVA acoplados al partido en `shots`/`shots_on_target` (`0.5+..3.5+`), motor `player_saves` (`1.5+..4.5+`) + `evaluateGoalkeeperSavesLinkedSgpV6` (cotas exactas de Fréchet) y normalizador multi-columna US sin corte de 5 columnas + bloqueo duro `"out"/"Baja"` (`881` bajas). | **`8 / 8` líneas `shots`/`SoT` `significativa`** en `n = 24,000` OOS (`shots 0.5+ ΔLL = -0.02001`, `SoT 0.5+ ΔLL = -0.00829`; split-season vivo `ΔMSE = -0.7737` `significativa`). **`4 / 4` líneas `player_saves` `significativa`** en `n = 56,726` OOS (`2.5+ ΔLL = -0.03156`, `ECE = 0.49%`) y SGP `Saves 2.5+ & CS` **`ΔLL = -0.00064` (`significativa`)**. Walk-forward US: **`NBA REB ΔLL = -0.23808`**, **`MLB H ΔLL = -0.15889`**, **`NHL PTS ΔLL = -0.20014`** (`significativa`; `NFL YDS` `"no significativa"` por `n = 70`). |
| **`EXP_V60`** · Walk-Forward Físico US + *Early Payout* (`multisport_v6_0.ts`) | Conecta `2,920` juegos reales (`2,202 MLB + 346 NHL + 222 NBA + 150 NFL`, `date' < date`) a `Kepler MLB` (`F5`, Manfred Extra Innings), `Curvature NHL` (`Empty-Net`, residual `4.61 × 10⁻¹⁵`, `goalie_confirmed = false`), `Tensor NBA` (`B2B`/`3-in-4` + bajas causales `reported_date < game_date`) y `Minkowski NFL` + *Early Payout* (`+5/+20/+17/+3`). | Consolidado 4 ligas ML (`n = 2,919`, `236` fechas): **`LL = 0.67972` (`ΔLL = -0.01343 [-0.02037, -0.00638]`, `ECE = 1.28%`, `significativa`)**. **`MLB ML PB` `ΔLL = -0.00920`** y **`Totals 9.5` `ΔLL = -0.01698`** (`significativa`); **`NHL Puck Line -1.5` `ΔLL = -0.02538`** (`significativa`); **`NBA ML` `ΔLL = -0.03824`** y **`Spread -2.5` `ΔLL = -0.04568`** (`significativa`); **`NFL Spread -3.0` `ΔLL = -0.06014`** (`significativa`). `0 / 2,920` violaciones de Early Payout. |
| **`EXP_V61`** · Árbitros Globales, Sello Pre-Kickoff y Cuotas (`prekickoff_freeze_v6_0.ts`) | Unifica **`1,110` árbitros de fútbol** (`100%` cobertura en `586` asignaciones vivas, `gamma_red = 0.1680`), implementa `sealPreKickoffOutlookV6` / `auditPreKickoffCausalityV6` sobre `166` snapshots (`4,830` observaciones) y audita `quotes_latest.json` (`128` ticks, Power De-Vig). | Bloquea las **`24` contaminaciones `FT` MLB (`inputsAsOf > startTime`)** y `158` regeneraciones tardías (`0` aceptadas en ledger), rescata `218` sellos previos y restaura **`5/5` NBA `FT` y `14/14` NHL `FT`**. En `59` mercados Power De-Vig: **`ΔKL = -0.00408 [-0.00836, -0.00024]` (`p = 0.015`, `significativa`)**. |
| **`EXP_V62`** · Hub `UnifiedMatchIntelligenceV6` (`unified_outlook_v6.ts` + `v6_index.ts`) | Fachada unificada TypeScript/Python sobre las **`57 / 57` ligas (`221` enfrentamientos)** con sello pre-kickoff `SHA-256` bit-exacto, bandas conformales `90%`, *Early Payout*, props destacados y guardrail narrativo determinista. | **`57 / 57` ligas cubiertas** (`154` fútbol + `18` MLB + `18` NBA + `18` NHL + `13` NFL), **`0` violaciones** de Early Payout, bandas epistémicas o guardrail, error máx. cono `1X2 = 1.11 × 10⁻¹⁵`, `80` análisis post-kickoff rechazados y restaurados causalmente, y `0` claves prohibidas. |

---

## 2. Estado de los `16` Axiomas Red-Team Permanentes (`tests/prediction/v6_0_suite.test.ts`)

| Axioma | Regla Inviolable Verificada | Estado |
|---|---|---|
| **`Axioma 1`–`12`** | Herencia íntegra de `PitchLab v5.1` (`Early Payout` fútbol `0/84`, cero bypass `v3`, poda `HGB < 150 KB`, `null` en slices vacíos `n == 0`, deconvolución `NFL Std ∈ [13.0, 13.8]` y ATS `< ln 2`, Matriz 4-Param sin doble inflación, Knockout `90'` limpio, física `MLB >= 1.38×`, precisión SGP QMC `< 0.10 pp` y cuantil `t < 10⁻⁶`, `Booking Points γ_R = 0.1680`, Venn-Abers `>= 88%` + guardrail de comas, e inmutabilidad `v3` + `v5.1`). | **PASS (`12/12`)** |
| **`Axioma 13`** | **Cobertura Universal 57 Ligas y Cono `< 10⁻¹²`:** las `57 / 57` ligas están cubiertas (`53` fútbol + `4` US), con error máx. de reconstrucción `1X2 = 1.11 × 10⁻¹⁵ < 10⁻¹²` y mejora significativa Venn-Abers en zona jugable `[1.55, 2.60]`. | **PASS** |
| **`Axioma 14`** | **Props `v6.0` Monotonía Multi-Línea, SGP Porteros Fréchet y Cero Truncamiento US:** `0` violaciones `P(0.5+) >= P(1.5+) >= P(2.5+) >= P(3.5+)`, cotas exactas de Fréchet en `evaluateGoalkeeperSavesLinkedSgpV6`, bloqueo duro `"out"/"Baja"` (`0` props emitidos) y extracción completa US (`PTS/AST/3PM`, `SO/HR/TB/RBI`, `SOG`, `YDS/REC/TD`). | **PASS** |
| **`Axioma 15`** | **Walk-Forward Físico Juego-a-Juego US + Dominancia Early Payout:** `4 / 4` deportes US (`MLB, NHL, NBA, NFL`) verificados en `date' < date`, conservación Empty-Net NHL `4.61 × 10⁻¹⁵ < 10⁻¹²`, Axioma 8 MLB intacto y `0 / 2,920` violaciones de dominancia *Early Payout*. | **PASS** |
| **`Axioma 16`** | **Congelado Pre-Kickoff Inmutable, Guardrail Narrativo e Integridad `SHA-256` (`25 + 14`):** `0` análisis contaminados `inputsAsOf > kickoff` aceptados en el ledger sellado, paridad IEEE-754 `< 10⁻¹²` y `SHA-256` idénticos Python ↔ TS en los `221` duelos de `live_matchday_v6_candidate_snapshot.json`, `0` claves prohibidas y `39 / 39` hashes verificados (`25` previos + `14` activos `v6.0`). | **PASS** |

---

## 3. Manifiesto `SHA-256` de Artefactos `v6.0` (`src/data/prediction/candidate_registry_v6_0.json`)

| ID Artefacto (`v6.0 Candidate`) | Ruta | Prefijo `SHA-256` | Bytes |
|---|---|---|---:|
| `soccer_57_causal_hierarchy_model_v6_0` | `src/data/prediction/model_soccer_57_v6_0_candidate.json` | `684c6d5ff7e0428b` | `29,555` |
| `soccer_57_parity_snapshot_v6_0` | `src/data/prediction/soccer_57_v6_0_snapshot.json` | `ed6a6f0bdceb1a91` | `289,921` |
| `exp_v58_soccer_57_results_v6_0` | `research/prediction-lab/experiments/EXP_V58_soccer_57_v6_0/artifacts/exp_v58_soccer_57_v6_0_results.json` | `3d59183056dfa79e` | `14,371` |
| `props_coupled_gk_us_model_v6_0` | `src/data/prediction/model_props_v6_0_candidate.json` | `7bf532bd331c3868` | `32,744` |
| `props_parity_snapshot_v6_0` | `src/data/prediction/props_v6_0_snapshot.json` | `5a68f3a323a670e5` | `149,635` |
| `exp_v59_props_results_v6_0` | `research/prediction-lab/experiments/EXP_V59_props_v6_0/artifacts/exp_v59_props_v6_0_results.json` | `035d437c5e07b65c` | `27,412` |
| `multisport_walkforward_physics_model_v6_0` | `src/data/prediction/model_multisport_v6_0_candidate.json` | `712324fc05155e4d` | `83,250` |
| `multisport_parity_and_live_snapshot_v6_0` | `src/data/prediction/multisport_v6_0_snapshot.json` | `6bbf0c9621c7a17a` | `332,337` |
| `exp_v60_multisport_results_v6_0` | `research/prediction-lab/experiments/EXP_V60_multisport_v6_0/artifacts/exp_v60_multisport_v6_0_results.json` | `e4f8e91fe1125f0c` | `57,356` |
| `officials_and_prekickoff_freeze_model_v6_0` | `src/data/prediction/model_officials_freeze_v6_0_candidate.json` | `a9c60b3830a7ce9e` | `205,404` |
| `officials_freeze_parity_snapshot_v6_0` | `src/data/prediction/officials_freeze_v6_0_snapshot.json` | `b71f44d256863cd1` | `122,095` |
| `exp_v61_officials_freeze_results_v6_0` | `research/prediction-lab/experiments/EXP_V61_officials_freeze_v6_0/artifacts/exp_v61_officials_freeze_v6_0_results.json` | `1d8192ba2f63f778` | `11,033` |
| `live_matchday_unified_snapshot_v6_0` | `src/data/prediction/live_matchday_v6_candidate_snapshot.json` | `5a878a5fa71f7e86` | `3,424,258` |
| `exp_v62_unified_results_v6_0` | `research/prediction-lab/experiments/EXP_V62_unified_v6_0/artifacts/exp_v62_unified_v6_0_results.json` | `ed53d158330386ec` | `3,182` |

*(Los `25` artefactos previos —`11` `v3.0..v3.2`, `11` `v5.1` y `3` `v5.2`— conservan `intact: true` y `0` bytes modificados en `candidate_registry_v6_0.json`.)*

---

## 4. Guía rápida de continuación en otro equipo

### 4.1 Clonar / actualizar `prediction-lab` y recrear entornos locales
En el nuevo equipo (Windows PowerShell; en macOS/Linux sustituye `.\research\prediction-lab\.venv\Scripts\python.exe` por `./research/prediction-lab/.venv/bin/python` y `npx.cmd` por `npx`):

```powershell
# 1. Activar soporte de rutas largas en Windows (necesario por archivos de evidencia REA)
git config --global core.longpaths true

# 2. Clonar o traer la rama actualizada desde GitHub
git fetch origin
git switch prediction-lab
git pull --ff-only origin prediction-lab

# 3. Instalar dependencias Node en node_modules (sin alterar package-lock.json)
npm install --no-package-lock --prefer-offline --no-audit --no-fund

# 4. Recrear el entorno virtual Python gitignorado (.venv)
python -m venv research/prediction-lab/.venv
.\research\prediction-lab\.venv\Scripts\python.exe -m pip install --upgrade pip numpy scipy lightgbm pandas scikit-learn pytest

# 5. Verificar toda la suite v6.0 + 16 Axiomas Red-Team + paridad Python <-> TS
npx.cmd tsc --noEmit --strict --noUncheckedIndexedAccess --target ES2022 --module ESNext --moduleResolution bundler --resolveJsonModule --esModuleInterop --skipLibCheck src/domain/prediction/v6_index.ts
npx.cmd vitest run tests/prediction/v6_0_suite.test.ts
npx.cmd vitest run tests/prediction/ --no-file-parallelism
.\research\prediction-lab\.venv\Scripts\python.exe -B -m pytest services/models/test_sealed_holdout_v3_1.py research/prediction-lab/experiments/EXP_V57_v5_2_live_feedback/test_exp_v57_v5_2.py research/prediction-lab/experiments/EXP_V58_soccer_57_v6_0/test_exp_v58_soccer_57_v6_0.py research/prediction-lab/experiments/EXP_V59_props_v6_0/test_exp_v59_props_v6_0.py research/prediction-lab/experiments/EXP_V60_multisport_v6_0/test_exp_v60_multisport_v6_0.py research/prediction-lab/experiments/EXP_V61_officials_freeze_v6_0/test_exp_v61_officials_freeze_v6_0.py research/prediction-lab/experiments/EXP_V62_unified_v6_0/test_exp_v62_unified_v6_0.py -q
```

> **Nota sobre datos vivos externos:** el bundle extraído ya viaja versionado en `research/prediction-lab/experiments/EXP_V57_v5_2_live_feedback/artifacts/live_platform_bridge_dataset.json`, por lo que todos los tests corren en cualquier máquina sin depender de rutas absolutas. Si deseas re-ejecutar los scripts de extracción contra una copia nueva del repo principal (`gemini-dos`), define la variable de entorno `$env:PITCH_DATA_DIR = "<ruta-a-Pitch>/data"`.

### 4.2 Qué quedó 100% listo hoy en `prediction-lab`
- Barrel canónico [`src/domain/prediction/v6_index.ts`](../../src/domain/prediction/v6_index.ts) y hub [`src/domain/prediction/unified_outlook_v6.ts`](../../src/domain/prediction/unified_outlook_v6.ts) listos para empaquetarse en `@pitchlab/spacetime`.
- Motores `soccer_57_v6_0.ts` (`53` competiciones de fútbol), `props_v6_0.ts` (`shots`/`SoT` acoplados + `player_saves` + SGP Portero-Partido + normalizador US multi-columna), `multisport_v6_0.ts` (`MLB/NHL/NBA/NFL` walk-forward + *Early Payout*) y `prekickoff_freeze_v6_0.ts` (`1,110` árbitros + sello pre-kickoff `SHA-256`).
- Snapshot unificado de `57` ligas (`src/data/prediction/live_matchday_v6_candidate_snapshot.json`) y manifiesto criptográfico `src/data/prediction/candidate_registry_v6_0.json` con los `16/16` axiomas en verde.

### 4.3 Qué sigue en la próxima sesión (integración en la app principal `gemini-dos`)
1. **Sincronizar `@pitchlab/spacetime` en la rama de la app (`gemini-dos`):** exportar `v6_index.ts` y los artefactos `*_v6_0_candidate.json` hacia `packages/spacetime` y conectar `apps/web/src/server/spacetime-v5.ts` (o nuevo `spacetime-v6.ts`) para servir las `57` ligas con `UnifiedMatchIntelligenceV6`.
2. **Conectar `props_v6_0.ts` en `apps/web`:**
   - En `apps/web/src/server/props-explorer.ts`, habilitar `player_saves` (porteros) y los splines acoplados de `shots` / `shots_on_target`.
   - En `apps/web/src/server/player-live-stats.ts`, reemplazar el corte `stats.length >= 5` por `normalizeUsPlayerGameLogColumnsV6` y persistir `minutes` + `recentGames` en `squads.json` de fútbol.
3. **Activar el congelado pre-kickoff en la ingesta de snapshots:** invocar `sealPreKickoffOutlookV6` antes del inicio de cada partido para que `NBA`/`NHL` conserven `hasForecast = true` al pasar a `FT` y eliminar las regeneraciones `inputsAsOf > startTime`.
4. **Acumulación prospectiva de CLV:** conectar `closing-odds.ts` y `settlement.ts` con el evaluador prospectivo hasta reunir `>= 150` picks liquidados con cierre real (`>= 64` en NFL) antes de evaluar encender segmentos en producción.
