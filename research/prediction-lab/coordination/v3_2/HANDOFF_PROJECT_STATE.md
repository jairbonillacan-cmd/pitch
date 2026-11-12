# Handoff para `docs/execution/PROJECT_STATE.md` — Cierre del Ciclo `PREDLAB-V3.2` (`B10` → `O`)

> **Destinatario exclusivo:** Orquestador `O` (`coordinator`). Conforme a `§0 Regla #9`, `b10-docs` **no** modifica `docs/execution/PROJECT_STATE.md` directamente. Este documento entrega los bloques listos para pegar/integrar en `docs/execution/PROJECT_STATE.md`, con todos los commits, veredictos de puertas y hashes `SHA-256` verificados al cierre de `PREDLAB-V3.2` (`2026-11-12`).

---

## 1. Resumen de Integración Recomendada para `O`

1. Actualizar la cabecera de `docs/execution/PROJECT_STATE.md` (`Última actualización: 2026-11-12`).
2. En **`## Estado actual`**, conservar íntegro el historial de `v3.0` y `v3.1` (etiquetando la apertura única de `v3.1` como `"holdout consumido"`) e insertar los bloques verificados de **`PREDLAB-V3.2` (Olas 0–4 y Puertas 1–3 `PASS`, `50/50` controles)** detallados en §2.1 abajo, reemplazando la línea final `- **Siguiente:**`.
3. Añadir la tabla **`## Documentos, artefactos y hashes SHA-256 de v3.2 (y congelados de v3.1)`** (§2.2).
4. Agregar a **`## Hallazgos cuantitativos que cambian supuestos`** los puntos `5`–`8` medidos en `v3.2` (§2.3).
5. Agregar a **`## Decisiones tomadas`**, **`## Pendiente (en orden)`** y **`## Bloqueos`** los bloques actualizados (§2.4–§2.6).
6. Añadir en **`## Handoffs`** la entrada completa **`### PREDLAB-V3.2 · ...`** (§2.7), rellenando únicamente el hash corto del commit atómico de `B10` y del propio cierre de `O`.

---

## 2. Bloques Listos para Integrar en `docs/execution/PROJECT_STATE.md`

### 2.1 Adición para `## Estado actual`

```markdown
- **Ciclo `PREDLAB-V3.2` — Panorama Público sin Stake (`MatchOutlook`), Captura Legal, Paper-Trading y Candidatos Causales:** ✅ completo (2026-11-12, **cero re-tuning de `v3.1`, cero lecturas de `holdout_sealed` (`"holdout consumido"`), `50/50` controles Red Team en `PASS`**):
  - **Ola 0 — Contratos y Línea Base (`O`, `b04e342`):** congelamiento criptográfico `SHA-256` de los artefactos `v3.1` (`production_segments_v3_1.json`, `blend_weights_v3_1.json`, `pick_policy_v3_1.json`, `stale_lines_config.json`, `engine.ts`, `sealed_holdout_v3_1_eval.json`) y contratos `MASTER.md`, `CONTRACT_OUTLOOK.md` y `CONTRACT_ODDS_TIMESERIES.md`.
  - **Ola 1 — Motor `MatchOutlook`, Compuerta Dura, Captura Legal y Calibración Causal (`B3` `4993a9b`/`48854e8`, `B2` `5f403ae`, `B1` `a33cdc4`, `B4` `1e22b6a` · Puerta 1 `V` `e20e823` `PASS` `18/18`):**
    - `B1`: primitivas centralizadas en `src/domain/prediction/math.ts` y constructor puro `src/domain/prediction/outlook.ts` (`11` mercados fútbol + `topScorelines[3]` desde una única matriz Dixon-Coles y `3` mercados NFL; `0` campos de `stake`/`kelly`/`ev`/`tier`; paridad TS↔Py `max|Δ| = 4.991e-13 < 1e-12`).
    - `B2`: eliminación de cuotas sintéticas (`reconstructExecutionOdds`) y `dixonColesProbs8` en `service.ts`, compuerta `0/60` segmentos activos (`executableBetsCount = 0` en los `242` partidos vivos), ancla explícita Smarkets, `featureCoverage` (`38/113 = 33.63%` en fútbol vivo y `4/29 = 13.79%` en NFL `v3.0` vivo, ambos `"low_coverage"`), `service_constants_v3_2.json` (`13` constantes) y unificación de `VALID_PICK_TIERS = ("solido", "valor")`.
    - `B3`: auditoría legal de `7` fuentes de cuotas (`docs/LEGAL_FUENTES_CUOTAS.md`: `2` `api_only` + `5` `blocked_pending_owner_decision`), `scrapers/cadence_scheduler.py` acoplado en solo lectura a `stale_lines_config.json` (`T-60m <= 3.6858 min`, `0` evasión anti-bot) y `data/odds_timeseries/health.json` en `prospective_capture_pending` (`0` filas falsas).
    - `B4`: evaluación causal en `walk_forward_dev` (`56,649` eventos `< 2025-02-02T17:30:00Z`, `trial_seq = 30`, `unlock_holdout = false`) y publicación de `outlook_calibration_v3_2.json` (`98` segmentos: `93` `liga × mercado` + `5` `GLOBAL`; selecciona `blend_v3_1` en `3/93` —`D2::1x2`, `G1::1x2`, `G1::totals`, todos con `ΔLL` `"no significativa"`— y `market_sharp_novig` en `90/93`; `NFL::moneyline` etiquetado `"sin cierre sharp"`).
  - **Ola 2 — Paper-Trading Encadenado, Corpus Sharp NFL y Snapshot Vivo (`B6` `70e08db`, `B8` `96a8f4b`, `B5` `adb0313` · Puerta 2 `V` `19453fb` `PASS` `16/16`):**
    - `B5`: runner causal e idempotente `services/models/paper_trading.py` (`corte > 2026-11-08T20:30:00Z`, `execution_delay >= 2.0 min`, separación estricta `provenance = "real"` vs `"synthetic"`). Ledger real `data/ledger/picks_v3_2_prospective.jsonl` en `0 / 150` picks reales; fixture sintético aislado (`12` eslabones, `4` picks) con paridad `0` bits TS↔Python.
    - `B6`: `nfl_sharp_closing.parquet` (`39` filas `pinnacle` en `13` juegos futuros unidos a `nflverse`, `31,196` filas de consenso y `986` recreativas rechazadas) y compuerta `n_settled = 0 < 64` (`production_enabled = false`, calibración sharp `DESCONOCIDO`).
    - `B8`: regeneración verificada (`--check`) de `src/data/prediction/live_matchday_v3_snapshot.json` (`schema_version = "3.2.0"`, `130` `MatchOutlook` con `market: null` y `pSource: "model"` ante `0` cuotas `< 72 h` + `242` matchups con `executable_bets_count = 0`) y guía `SYNC_NOTES.md`.
  - **Ola 3 — Experimentos Causales XI Confirmado y NFL EPA como Candidatos Inactivos (`B7` `53ff835`, `B9` `bbfdbc5` · Puerta 3 `V` `14e3e1e` `PASS` `16/16`):**
    - `B7` (`EXP_V32_xi`): contrato anti-fuga `CONTRACT_XI_PUBLISHED.md` (`ts_xi_published <= ts_captured <= ts_decision - 2.0 min < kickoff_utc`), auditoría de `7` fuentes XI (`2` `api_only` + `5` `blocked_pending_owner_decision`) y verificación de `0 / 52,746` partidos con `ts_xi_published` real en `walk_forward_dev` (`ΔLL = 0.000000`, `"no significativa"`, efecto real `DESCONOCIDO`, `production_activated: false`).
    - `B9` (`EXP_V32_nfl_epa`): candidato separado `src/data/prediction/model_nfl_v3_2_candidate.json` (`41` features con `12` agregados PBP `nflverse` estrictamente causales `w' < w` `< 2025-02-02`, `trial_seq = 31`, `unlock_holdout = false`, `status = "candidate"`, `production_activated = false`; `model_nfl.json` intacto). Sube cobertura viva NFL de `4/29` (`13.79%`) a `34.37/41` (`83.83%`, `0/46` `"low_coverage"`), mejora `-0.065911 [-0.075109, -0.056734]` vs `v3.0` vivo, resulta `"no significativa"` en `DEV_OOS 2020..2024` (`-0.003153 [-0.006492, +0.000129]`) vs `v3.0` `29/29` y pierde `+0.013040 [+0.007707, +0.017938]` frente al consenso `nflverse` (`"sin cierre sharp"`).
  - **Ola 4 — Consolidación Documental (`B10` `<COMMIT_B10>`, `O` `<COMMIT_O>`):** actualización de `19_HOJA_DE_RUTA_MOTORES_Y_PICKS_V4.md`, `MODEL_CARD.md` (`v3.2.0`), reporte maestro `A29_v3_2_maestro.md` y cierre de estado del proyecto.
- **Siguiente:** aprovisionar credenciales oficiales (`THE_ODDS_API_KEY` / `BETFAIR_APP_KEY` en `web-scraping`; `API_FOOTBALL_KEY` / `FOOTBALL_DATA_API_KEY` para XI), operar captura continua multi-tick y reunir `>= 150` picks prospectivos reales (`CLV% > 0` con IC 95% bootstrap `mulberry32`) en fútbol y `>= 64` juegos NFL liquidados con cierre sharp real antes de activar cualquier segmento o candidato.
```

---

### 2.2 Tabla de Artefactos y Hashes `SHA-256` (`v3.1` Congelados + `v3.2` Nuevos)

```markdown
## Documentos, artefactos y hashes SHA-256 verificados al cierre de `v3.2`

| Ruta | Ola / Owner | Estado y Rol | `SHA-256` |
|---|---|---|---|
| `src/data/prediction/production_segments_v3_1.json` | Congelado `v3.1` (`A10`) | Compuerta de segmentos (`0/60` en `production_enabled: true`) | `0bc03bbff96a5d82a1a7858e1e8623bf7bfdb250c546d2773a71d56ed9ada9bc` |
| `src/data/prediction/blend_weights_v3_1.json` | Congelado `v3.1` (`A4`) | Pesos logit y método de-vig por segmento | `b29d7a451f6011126997c122778b42ad3239c78337d17c5fa78d550f5c92739b` |
| `src/data/prediction/pick_policy_v3_1.json` | Congelado `v3.1` (`A5`) | Política interna `solido`/`valor`, Kelly ¼ y topes `2u/2u/3u/5u` | `2359c8f8822ea394a380202c04e0bcd010d1a3fae7c5c25b8c11ebe810bfb7d1` |
| `src/data/prediction/stale_lines_config.json` | Congelado `v3.1` (`A8`) | Cadencias óptimas multi-tick (`T-60m <= 3.69 min`) | `8bcb9c7be93270cde0cac2d58bc19f0381184dd2e769f358dd28334db2a05eac` |
| `src/domain/prediction/engine.ts` · `src/data/prediction/model_nfl.json` | Congelados `v3.0` | Motor TS puro intacto y pesos activos `NFL Minkowski v3.0` | `9270125c...53bc` / `e74ae241...9225` |
| `services/models/artifacts/sealed_holdout_v3_1_eval.json` | Congelado `v3.1` (`A10`) | Evaluación única `"holdout consumido"` (`0` re-lecturas en `v3.2`) | `5c9e550bfd7889e44f674c91cf64cea4c07b4281fc72231b8cadff850309f2dd` |
| `src/domain/prediction/{math,outlook}.ts` | Ola 1 `v3.2` (`B1`, `a33cdc4`) | Primitivas únicas y panorama multi-mercado `MatchOutlook` sin stake | *(código auditado en Puerta 1)* |
| `src/data/prediction/service_constants_v3_2.json` | Ola 1 `v3.2` (`B2`, `5f403ae`) | `13` bloques de constantes externalizadas de `service.ts` | `fcbc8e7dee3b302f57cb9b68f0c5403cc10cdfb308bc6aff9e71e30957fa15b7` |
| `scrapers/cadence_scheduler.py` · `docs/LEGAL_FUENTES_CUOTAS.md` | Ola 1 `v3.2` (`B3`, `4993a9b`) | Programador multi-tick legal y auditoría de `7` fuentes en `web-scraping` | *(worktree `web-scraping@4993a9b`)* |
| `src/data/prediction/outlook_calibration_v3_2.json` | Ola 1 `v3.2` (`B4`, `1e22b6a`) | Calibración causal `walk_forward_dev` (`98` segmentos, `10` bins; espejo idéntico en `services/models/artifacts/`) | `090cfaa23d35bdd569ea3a17d0084b6af7b2e99eeb8cdb00b15a8b588654194e` |
| `data/ledger/picks_v3_2_prospective.jsonl` | Ola 2 `v3.2` (`B5`, `adb0313`) | Ledger prospectivo real (`0` bytes, `0/150` picks reales) | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `data/ledger/fixtures/picks_v3_2_synthetic_fixture.jsonl` | Ola 2 `v3.2` (`B5`, `adb0313`) | Fixture funcional sintético aislado (`12` eslabones, `head_hash = eaea0bae...`) | `70b537b3b9beed80d7b6a18e689042271d496c6f15314def049a793a18aa5978` |
| `research/prediction-lab/data/processed/nfl_sharp_closing.parquet` | Ola 2 `v3.2` (`B6`, `70e08db`) | Corpus sharp NFL (`39` filas `pinnacle`, `13` juegos, `0 < 64` liquidados) | `178ad93241bd2bf004f77cf576a180afbb547ab65b4b28bbc63ad76f06680cae` |
| `src/data/prediction/live_matchday_v3_snapshot.json` | Ola 2 `v3.2` (`B8`, `96a8f4b`) | Snapshot vivo `3.2.0` (`130` `MatchOutlook` + `242` matchups, `0` apuestas) | `1dace760d68442e73c4b365f85cd16509093716b1bcac72aa1da67b61ec29699` |
| `research/prediction-lab/experiments/EXP_V32_xi/exp_v32_xi_results.json` | Ola 3 `v3.2` (`B7`, `53ff835`) | Evaluación causal XI confirmado (`production_activated: false`) | `c92d51eb5bae01b2e6e8032a521cd34dce87e2ed144145c93d0765a6d0b8a19b` |
| `src/data/prediction/model_nfl_v3_2_candidate.json` | Ola 3 `v3.2` (`B9`, `bbfdbc5`) | Candidato NFL EPA `41` features (`status: "candidate"`, `production_activated: false`) | `ebf6c3c3cfe417d57a685f0b574fed212da3f1e58da8568434f82197f5a46158` |
| `services/models/artifacts/holdout_trial_registry.jsonl` | Olas 1–3 (`B4`, `B9`) | `31` entradas (`1..29` intactas de `v3.1`; `#30` y `#31` en `walk_forward_dev`) | `058d5d0d9bcaeb97f0415f871b50a7a3279b34ad59dcdcaacf33ac4b4fe8923e` |
| `research/prediction-lab/reports/A29_verificacion_v3_2.md` · `A29_v3_2_maestro.md` | Puertas 1–3 (`V`) · Ola 4 (`B10`) | Auditoría Red Team (`50/50 PASS`) y reporte maestro consolidado de cierre | *(documentación maestra `v3.2`)* |
```

---

### 2.3 Adiciones para `## Hallazgos cuantitativos que cambian supuestos`

```markdown
5. **En Hándicap Asiático con ponderación exacta de cuartos de línea (`active_w = 0.5` en `.25`/`.75`, `B4` `1e22b6a`), ningún segmento de fútbol retiene ventaja causal de mezcla sobre la apertura sharp de Pinnacle:** en los `93` segmentos `liga × mercado` evaluados en `walk_forward_dev`, solo `3` (`D2::1x2`, `G1::1x2`, `G1::totals`) seleccionan `blend_v3_1` y en los tres el IC 95% bootstrap de `ΔLL` cruza `0` (`"no significativa"`).
6. **La inferencia viva de `v3.0` sufría un apagón silencioso de cobertura (`B2` `5f403ae`), corregible con agregados PBP causales pero no equivalente a los `-0.008..-0.012` nats hipotéticos (`B9` `bbfdbc5`):** en NFL vivo, `model_nfl.json` operaba con `4/29` features (`13.79%`, `LL = 0.6879`). El candidato causal `model_nfl_v3_2_candidate.json` (`41` features) sube la cobertura viva a `34.37/41` (`83.83%`, `ΔLL = -0.065911 [-0.075109, -0.056734]` vs `v3.0` vivo), pero frente a `v3.0` histórico completo (`29/29`) gana solo `-0.002516 [-0.004585, -0.000523]` en `dev` agregado, es `"no significativa"` en `DEV_OOS 2020..2024` (`-0.003153 [-0.006492, +0.000129]`), y pierde `+0.013040 [+0.007707, +0.017938]` frente al consenso `nflverse` (`"sin cierre sharp"`).
7. **No existen timestamps históricos reales de publicación de XI (`0 / 52,746` en `walk_forward_dev`, `B7` `53ff835`):** activar ajustes de disponibilidad con proxies ruidosos degrada la calibración (`ΔLL = +0.001100 [+0.000705, +0.001494]` con `σ_δ = 0.12`, `INFERIDO`), por lo que el ajuste de XI solo puede evaluarse prospectivamente con timestamps auditables pre-decisión.
```

---

### 2.4 Adiciones para `## Decisiones tomadas`

```markdown
- **Separación estricta entre pronóstico público (`MatchOutlook`) y apuesta (`v3.2`):** la salida pública expone solo probabilidades calibradas y `fairOdds = 1/p`, sin `stake`, `kelly`, `ev`, `tier` ni cuotas sintéticas (`market: null` sin cuota real fresca `< 72 h`).
- **Candidatos de Ola 3 mantenidos explícitamente apagados (`production_activated: false`):** ni `EXP_V32_xi` (`B7`) ni `model_nfl_v3_2_candidate.json` (`B9`, `status: "candidate"`) reemplazan motores activos hasta superar las compuertas prospectivas con datos reales.
- **Cumplimiento legal estricto sin evasión anti-bot (`B3` y `B7`):** `4` adaptadores oficiales listos en modo `api_only` (`the_odds_api`, `betfair_exchange`, `api_football`, `football_data_org`) y `10` fuentes web bloqueadas por código (`blocked_pending_owner_decision`) hasta decisión comercial/legal expresa del propietario.
```

---

### 2.5 Reemplazo sugerido para `## Pendiente (en orden)` y `## Bloqueos`

```markdown
## Pendiente (en orden)

1. **Aprovisionar credenciales oficiales para desbloquear captura prospectiva legal (`B3` / `B7`):** configurar `THE_ODDS_API_KEY` y/o `BETFAIR_APP_KEY` + `BETFAIR_SESSION_TOKEN` en `.worktrees/web-scraping` para activar `cadence_scheduler.py`, y `API_FOOTBALL_KEY` / `FOOTBALL_DATA_API_KEY` para activar `xi_collector.py` (o emitir decisión formal del propietario sobre las fuentes `blocked_pending_owner_decision`).
2. **Acumular cartera prospectiva real en `PickLedger` (`B5`, meta `>= 150` picks):** ejecutar periódicamente `paper_trading.py --provenance real` (`execution_delay >= 2.0 min`, `ts_pick > 2026-11-08T20:30:00Z`) y evaluar apertura por segmento solo cuando existan `>= 150` picks totales, `n_clv >= 15` en el segmento e IC 95% bootstrap (`mulberry32`) de `CLV% > 0`.
3. **Acumular cierres sharp liquidados en NFL (`B6` / `B9`, meta `>= 64` juegos):** liquidar los `13` juegos ya capturados y continuar recolectando cierres `pinnacle`/`smarkets` hasta `>= 64` juegos NFL liquidados para evaluar `model_nfl_v3_2_candidate.json` contra un benchmark sharp real.
4. **Sincronizar UI web cuando producto lo priorice (`B8`):** conectar `apps/web` y `packages/ui` al arreglo `outlooks` de `src/data/prediction/live_matchday_v3_snapshot.json` siguiendo `research/prediction-lab/coordination/v3_2/SYNC_NOTES.md`.

---

## Bloqueos

- **Credenciales API ausentes en entorno (`prospective_capture_pending`):** `0` fuentes activas en `web-scraping` (`B3`) y `EXP_V32_xi` (`B7`) mientras no se inyecten `THE_ODDS_API_KEY` / `BETFAIR_APP_KEY` / `API_FOOTBALL_KEY` / `FOOTBALL_DATA_API_KEY` ni exista convenio escrito para las `10` fuentes `blocked_pending_owner_decision`.
- **Compuertas de tamaño muestral prospectivo en cero:** `0 / 150` picks reales en `picks_v3_2_prospective.jsonl` (`0/60` segmentos activos) y `0 / 64` juegos NFL liquidados con cierre sharp en `nfl_sharp_closing.parquet`.
- **Ausencia de cuotas sharp históricas en `btts` y por jugador:** impide evaluar valor histórico contra casa sharp en `btts` y bloquea cualquier motor de *player props* (`19_HOJA_DE_RUTA_MOTORES_Y_PICKS_V4.md` §4.4).
```

---

### 2.6 Entrada lista para `## Handoffs`

```markdown
### PREDLAB-V3.2 · Motor público `MatchOutlook` sin stake, compuerta anti-sintéticos, captura legal multi-tick, ledger prospectivo y candidatos causales XI / NFL EPA — 2026-11-12 — Ramas `prediction-lab` y `web-scraping`
- **Hecho:**
  - **Ola 0 (`b04e342`):** contratos maestros (`MASTER.md`, `CONTRACT_OUTLOOK.md`, `CONTRACT_ODDS_TIMESERIES.md`, `20_SWARM_V3_2_GEMINI.md`) y congelamiento `SHA-256` de `v3.1`.
  - **Ola 1 (`4993a9b` en `web-scraping`; `48854e8`, `5f403ae`, `a33cdc4`, `1e22b6a` y Puerta 1 `e20e823` en `prediction-lab`):** `math.ts` + `outlook.ts` (`11` mercados fútbol + `topScorelines[3]`, `3` NFL, `0` stakes), eliminación de cuotas sintéticas y `featureCoverage` en `service.ts` (`0/60` activos), programador legal `cadence_scheduler.py` (`7` fuentes auditadas, `0` anti-bot) y `outlook_calibration_v3_2.json` (`98` segmentos en `walk_forward_dev`, `trial_seq = 30`).
  - **Ola 2 (`70e08db`, `96a8f4b`, `adb0313` y Puerta 2 `19453fb`):** corpus `nfl_sharp_closing.parquet` (`39` filas `pinnacle`, compuerta `0 < 64`), regeneración de `live_matchday_v3_snapshot.json` (`130` `MatchOutlook`, `market: null`, `0` apuestas) + `SYNC_NOTES.md`, y runner idempotente `paper_trading.py` (`delay >= 2.0 min`, `0/150` reales + fixture sintético con paridad `0` bits TS↔Py).
  - **Ola 3 (`53ff835`, `bbfdbc5` y Puerta 3 `14e3e1e`):** contrato y experimento `EXP_V32_xi` (`0/52,746` XI históricos reales, `production_activated: false`) y candidato separado `model_nfl_v3_2_candidate.json` (`41` features EPA causales `w' < w`, cobertura viva NFL `13.79% -> 83.83%`, `trial_seq = 31`, `production_activated: false`).
  - **Ola 4 (`<COMMIT_B10>`, `<COMMIT_O>`):** consolidación en `19_HOJA_DE_RUTA_MOTORES_Y_PICKS_V4.md`, `MODEL_CARD.md` (`v3.2.0`), reporte maestro `A29_v3_2_maestro.md` y actualización de `PROJECT_STATE.md`.
- **Cómo probarlo:**
  - Verificar snapshot en vivo (`130` `MatchOutlook`, `< 72 h`, `0` stakes): `.\research\prediction-lab\.venv\Scripts\python.exe services/models/regenerate_live_snapshot.py --timeseries-dir ..\web-scraping\data\odds_timeseries --max-quote-age-hours 72 --out src/data/prediction/live_matchday_v3_snapshot.json --check`
  - Suite Python completa `prediction-lab` (`120` tests en verde): `$env:PYTHONDONTWRITEBYTECODE='1'; .\research\prediction-lab\.venv\Scripts\python.exe -B -m pytest services/models research/prediction-lab/experiments/EXP_V32_xi research/prediction-lab/experiments/EXP_V32_nfl_epa -v`
  - Suite TypeScript completa `prediction-lab` (`61` archivos / `1,153` tests activos en verde): `npx.cmd vitest run; git checkout -- evidence/statistical-tests/aztecavet-experiments.json`
  - Suite Python `web-scraping` (`7` tests en verde): `Set-Location ..\web-scraping; .\.venv\Scripts\python.exe -m pytest tests -v`
```
