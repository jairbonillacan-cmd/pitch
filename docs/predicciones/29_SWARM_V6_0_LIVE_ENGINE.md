# 29 · Plan Maestro `/swarm` — `PitchLab Spacetime v6.0 Candidate` (Retroalimentación Total 57 Ligas, Props y Deportes US)

> **Base de partida:** `prediction-lab` con `PitchLab v5.1` (`12/12` axiomas Red-Team) + puente y base `PitchLab v5.2` (`EXP_V57`, `25/25` tests Vitest `< 10⁻¹²` en verde).  
> **Objetivo del Swarm:** Escalar los prototipos validados en `v5.2` a la suite unificada **`PitchLab v6.0 Candidate`** (`EXP_V58`–`EXP_V62`) cubriendo las **57 ligas**, boxscores completos de jugadores + porteros, validación walk-forward física en `MLB/NHL/NBA/NFL`, priors arbitrales globales y congelado pre-kickoff sin fugas.

---

## 0. Reglas Inviolables de Gobernanza (Auditadas por `w6-redteam-verifier`)

1. **Inmutabilidad Criptográfica (`SHA-256`):** `0` bytes modificados en los **`11` artefactos congelados `v3.0/v3.1/v3.2`**, en los **`11` artefactos `v5.1`** (`candidate_registry_v5_1.json`) y en los **`3` artefactos base `v5.2`** (`candidate_registry_v5_2.json`). Todo artefacto nuevo lleva sufijo `*_v6_0_candidate.json` con `status: "candidate"` y `production_activated: false`.
2. **Blindaje de `holdout_sealed`:** Prohibido leer o ajustar hiperparámetros sobre `holdout_sealed` (`2025-02-02T17:30:00Z`–`2026-11-08T20:30:00Z`). Toda evaluación sobre resultados `2026` opera en **walk-forward causal estricto por fecha (`date' < date`)**, jamás intra-día ni post-partido.
3. **Inferencia Estadística Cluster-Robusta:** Todo `ΔLog-Loss`, `ΔBrier` o `ΔMAE` usa **cluster-bootstrap determinista `mulberry32` (`1,000` réplicas, `seed = 20261111`)** agrupado por `date` / `match_id`, devolviendo `null` (nunca `0.0`) en cortes vacíos (`n == 0`) y etiquetando `"no significativa"` cuando el IC 95% cruza `0`.
4. **Paridad IEEE-754 `< 10⁻¹²` Python ↔ TypeScript:** Toda función matemática en Python tiene espejo exacto en TypeScript (`src/domain/prediction/*_v6_0.ts`) usando las primitivas de `src/domain/prediction/math.ts` (`clamp`, `logit`, `sigmoid`, `normalCdf`, `createMulberry32`).
5. **Salida Pública Limpia y Frontera de Repositorio:** `0` campos `stake`, `kelly`, `kellyFraction`, `expectedEdge` o `tier` en snapshots/outlooks públicos. El directorio `PITCH_DATA_DIR` (`C:/Users/jairb/OneDrive/Desktop/Proyectos/Pitch/data`) se consume **estrictamente en solo lectura**; ningún worker modifica archivos fuera de su worktree de `prediction-lab` ni ejecuta `git push`.

---

## 1. Roster de Workers, Aislamiento (`workspace: "share"`) y Olas

| Ola | Worker | Workspace | Responsabilidad Exclusiva (Rutas Propias) |
|---|---|---|---|
| **Ola 0** | `coordinator` | `inherit` | Carga skill `swarm_pane`, escribe `plan.json`, verifica entorno Python (`.venv` si falta) y baseline `vitest` (`v5_0`, `v5_1`, `v5_2` en `PASS`). |
| **Ola 1** | `w1-soccer-57` | `share` | `EXP_V58`: Estado causal para las `53` ligas/copas de fútbol (`season-results.json` + `history/*.jsonl`), jerarquía por confederación, Matriz 4-Param Diagonal-NB y recalibración *Inductive Venn-Abers* en zona jugable `[1.55, 2.60]`. Rutas: `research/prediction-lab/experiments/EXP_V58_soccer_57_v6_0/**`, `src/domain/prediction/soccer_57_v6_0.ts`, `src/data/prediction/*soccer_57_v6_0_candidate.json`. |
| **Ola 1** | `w2-player-props` | `share` | `EXP_V59`: Splines monótonos Logit-PAVA acoplados al partido para `shots` y `shots_on_target`, motor físico `player_saves` acoplado a `soccer_micro_markets` + `Raikov` SGP, y extractor/normalizador sin truncamiento de 5 columnas para props US (`PTS/AST/3PM` NBA, `SO/HR/TB` MLB, `SOG` NHL, `YDS/REC/TD` NFL). Rutas: `research/prediction-lab/experiments/EXP_V59_props_v6_0/**`, `src/domain/prediction/props_v6_0.ts`, `src/data/prediction/*props_v6_0_candidate.json`. |
| **Ola 1** | `w3-multisport-oos` | `share` | `EXP_V60`: Calibración y validación walk-forward juego-a-juego (`2,920` partidos reales `date' < date`) sobre los motores físicos `Kepler MLB` (`F5`, Extra-Innings Manfred, `+5` EP), `Curvature NHL` (`Empty-Net`, `Puck-Line`, `OT`), `Tensor NBA` (`B2B`/`3-in-4`, bajas reales `injuries.json`, `+20` EP) y `Minkowski NFL`. Rutas: `research/prediction-lab/experiments/EXP_V60_multisport_v6_0/**`, `src/domain/prediction/multisport_v6_0.ts`, `src/data/prediction/*multisport_v6_0_candidate.json`. |
| **Ola 1** | `w4-officials-ledger` | `share` | `EXP_V61`: Expansión de priors arbitrales (`586` asignaciones vivas + ligas Conmebol/MX/Copas), contrato de congelado pre-kickoff (`inputsAsOf <= startTime`, preservación de pronóstico pre-partido en NBA/NHL al pasar a `FT`) y evaluador prospectivo de CLV sobre `quotes_latest.json` sin tocar `picks_v3_2_prospective.jsonl`. Rutas: `research/prediction-lab/experiments/EXP_V61_officials_freeze_v6_0/**`, `src/domain/prediction/prekickoff_freeze_v6_0.ts`, `src/data/prediction/*officials_v6_0_candidate.json`. |
| **Puerta 1** | `w6-redteam-verifier` | `inherit` | Audita los 4 entregables de Ola 1 antes de integrar; bloquea cualquier fuga temporal `date' >= date`, sesgo de supervivencia o desviación `>= 10⁻¹²`. |
| **Ola 2** | `w5-unified-v6` | `share` | `EXP_V62`: Hub `UnifiedMatchIntelligenceV6` (`src/domain/prediction/unified_outlook_v6.ts` + `src/domain/prediction/v6_index.ts`), snapshot vivo de `57` ligas (`src/data/prediction/live_matchday_v6_candidate_snapshot.json`), registro SHA-256 `candidate_registry_v6_0.json` y suite `tests/prediction/v6_0_suite.test.ts`. |
| **Puerta 2** | `w6-redteam-verifier` | `inherit` | Ejecuta batería permanente de **`16` Axiomas Red-Team** (`12` de `v5.1` + `4` nuevos de `v6.0`), `tsc --noEmit --strict --noUncheckedIndexedAccess` y `vitest run`, y redacta `docs/predicciones/30_SUITE_UNIFICADA_V60_Y_AUDITORIA.md`. |
