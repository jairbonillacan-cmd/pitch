# Plan v3.2 — Motores de prediction-lab: "lo más probable + cuota justa" y medición en vivo

> **Destino:** al aprobarse, este plan se guarda como `docs/predicciones/20_SWARM_V3_2_GEMINI.md` en `.worktrees/prediction-lab` y se le pasa tal cual a **Gemini 4 Carbon High** con `/swarm`. Los subagentes también son Gemini 4 Carbon High.
> **Alcance:** fútbol (ligas europeas + Liga MX) y NFL. Worktrees: `.worktrees/prediction-lab` (rama `prediction-lab`, base `f3564a4`) y `.worktrees/web-scraping` (rama `web-scraping`, base `3a8b3c0`).

## Contexto

`v3.1` terminó el 2026-11-11 con un resultado honesto. El modelo tabular pierde contra el cierre de Pinnacle (`+0.0129` nats en el holdout). Hay **0/60 segmentos encendidos**. La única ventaja medida, las líneas rezagadas con Doble Confirmación (`+10.93%` CLV en dev), depende de capturar momios cada ≤3.69 min, y eso hoy no existe. El holdout de 2025-02-02 a 2026-11-08 **ya se consumió**.

La exploración del código encontró además cuatro problemas que el plan v3.1 no tocó:

1. **El camino de producción no usa nada de v3.1.** `service.ts` solo importa `devig`, `engine`, `multisport` y `nfl_live` (`service.ts:16-76`). Sigue usando la compuerta v3.0 "Geodesic v2", que tuvo ROI de `-17.97%` en el holdout, y nadie lee `production_segments_v3_1.json`.
2. **Hay cuotas inventadas.** Cuando no llegan cuotas, `service.ts:979-997` las fabrica con un margen supuesto de 4–4.5% y calcula edge y stake contra ese precio sintético. En la rama de Smarkets, `service.ts:1169` le pasa al mercado la probabilidad del propio modelo.
3. **No existe la salida que pide el producto.** `apps/web/PRODUCT.md:22` pide que cada pantalla muestre "lo más probable + cuota justa", sin montos. El motor no produce `fairOdds` ni `mostLikely`: eso se calcula en `packages/contracts`. Además expone `kellyFraction` y `stake`, que el producto prohíbe mostrar.
4. **No hay captura continua ni paper-trading.** `web-scraping` no tiene programador: todas las capturas son del 9 y 10 de noviembre. Las filas de Codere no traen evento. `PickLedger` vive solo en memoria y no hay un archivo `.jsonl` de picks.

La app ya consume estos motores a través de `packages/spacetime`, una copia fijada en `263857a` que se sincroniza con `pnpm --filter @pitchlab/spacetime sync`. Lo que salga de esta ronda se integra en la app después, en otra sesión.

**Resultado esperado:**
- **Ola 1:** una salida por partido y mercado calibrada y honesta ("lo más probable + cuota justa"), sin stakes ni cuotas inventadas, que la app pueda consumir.
- **Ola 2:** captura multi-tick funcionando y un ledger prospectivo que vaya acumulando evidencia para volver a encender picks.
- **Ola 3:** mejoras de modelo para NFL y para fútbol con XI confirmado, evaluadas bajo la misma puerta y sin activarlas.

---

## 0. Reglas rectoras (todo agente las cumple; el verificador las audita)

1. **No se re-tunea nada de v3.1.** `blend_weights_v3_1.json`, `pick_policy_v3_1.json`, `stale_lines_config.json` y `production_segments_v3_1.json` quedan congelados. Cualquier parámetro nuevo se elige solo en `walk_forward_dev` (`< 2025-02-02T17:30Z`).
2. **El holdout viejo está consumido.** Se puede citar como dato descriptivo con la etiqueta "holdout consumido", pero **nunca** se usa para elegir. El nuevo conjunto de prueba es **prospectivo**: picks con `ts_pick > 2026-11-08T20:30:00Z` registrados en el ledger.
3. **Ningún segmento pasa a `production_enabled: true`** sin `>= 150` picks prospectivos totales, `n_clv >= 15` en el segmento y un IC 95% bootstrap (`>= 1,000`, `mulberry32`) de `CLV% > 0`. En esta ronda se espera que siga en `0`, y eso está bien.
4. **No se inventan precios.** Sin cuota real fresca, la salida no lleva edge, EV, Kelly ni "valor", y queda marcada `market: null`.
5. **La salida pública no lleva stake.** `MatchOutlook` no tiene `stake`, `kelly` ni "pick seguro". Esos campos quedan solo en el ledger interno de investigación.
6. **Se reporta con evidencia.** Cada cifra lleva el comando que la produce, el commit y un IC 95%. Si el IC cruza 0, se etiqueta `"no significativa"`. Las afirmaciones se marcan `OBSERVADO`, `INFERIDO` o `DESCONOCIDO`.
7. **Scraping legal.** No se agrega ni se intensifica ninguna evasión anti-bot (`solve_cloudflare`, rotación de huellas, etc.). Si una fuente solo funciona con evasión o sus ToS prohíben la captura automatizada, se marca `blocked_pending_owner_decision` y se sigue con las demás. Se respetan los límites de tasa y `robots.txt`. Las APIs públicas o documentadas tienen preferencia (Smarkets, Betfair Exchange, The Odds API en su plan gratuito).
8. **Hay dos copias de cada lógica, en TypeScript y en Python.** Toda lógica que exista en ambos lenguajes lleva un test de paridad (`< 1e-9`, o `< 1e-12` donde v3.1 ya lo exigía).
9. **Fronteras.** Nadie toca `packages/ui`, `apps/web`, `packages/spacetime` ni el repo raíz (`gemini-reestructura`). Nadie hace push, rebase ni stash sin etiqueta. Cada agente hace commit solo de sus propios archivos.

---

## 1. Protocolo del swarm

- **Orquestador (O):** crea `research/prediction-lab/coordination/v3_2/` con `MASTER.md` (este plan), `CONTRACT_OUTLOOK.md`, `CONTRACT_ODDS_TIMESERIES.md` y `status/`. Lanza las olas, resuelve conflictos y es el único que actualiza `docs/execution/PROJECT_STATE.md`.
- **Cada subagente** recibe su ficha de la §3 (que es autocontenida), lee primero `docs/execution/PROJECT_STATE.md` y `docs/predicciones/19_HOJA_DE_RUTA_MOTORES_Y_PICKS_V4.md`, y escribe **solo** en las rutas de su ficha.
- **Al arrancar** escribe `status/<ID>.json` con `state: "running"` y `started_at`. **Al cerrar** lo actualiza con `finished_at`, `files_written`, `commands_run`, `metrics`, `open_issues` y `next`. Esto corrige el fallo de v1, donde un agente no publicaba su estado (`13_COORDINACION_SUBAGENTES.md` §8).
- **Formato de commit:** `feat(v3.2-<ID>): …` en español, con un commit por agente y por entrega.
- **Puertas:** al cerrar cada ola, el verificador `V` (solo lectura) audita y escribe su veredicto en `research/prediction-lab/reports/A29_verificacion_v3_2.md`. La siguiente ola no arranca sin `PASS`.

---

## 2. Olas y dependencias

| Ola | Agentes en paralelo | Depende de | Puerta |
|---|---|---|---|
| 0 | O (preparación: contratos, línea base de tests) | — | tests en verde antes de tocar código |
| 1 | B1 Outlook · B2 Compuerta de producción · B3 Captura legal (web-scraping) · B4 Calibración publicada | Ola 0 | Puerta 1 (V) |
| 2 | B5 Ledger prospectivo · B6 Corpus sharp NFL · B8 Regenerador de snapshot | B1, B2, B3 (B6 también B3) | Puerta 2 (V) |
| 3 | B7 Experimento XI confirmado (fútbol) · B9 NFL Minkowski EPA (experimento) | B4, B6 | Puerta 3 (V) |
| 4 | B10 Documentación y estado | todo | cierre del orquestador |

Los conflictos de archivos se evitan con la propiedad de la §3. B1 crea `math.ts`; B2 y B5 solo lo importan.

---

## 3. Fichas de los agentes

### B1 · `b1-outlook` — Motor de salida "lo más probable + cuota justa"
- **Objetivo:** crear `buildMatchOutlook(input) → MatchOutlook`, la salida pública de cada partido.
  - **Fútbol:** 1X2, doble oportunidad, totales 1.5/2.5/3.5, BTTS, DNB, AH ±0.5/±1 y los 3 marcadores más probables, todos sacados de una sola matriz Dixon-Coles.
  - **NFL:** moneyline, spread y total con la línea de mercado cuando exista.
  - **Cada selección lleva:** `p`, `fairOdds{decimal, american}`, `rank`, `isMostLikely`, `pSource` (`market_sharp_novig` | `blend_v3_1` | `model` | `base_rate`), `calibrationBucket` y `dataQuality`.
  - **Cada mercado lleva** un `headline`: la selección más probable y su cuota justa.
- **Reutiliza:**
  - `buildDixonColesScoreMatrix` y `deriveAll2WayMarkets` (`markets_2way.ts`). Esta pasa a ser la **única** implementación de Dixon-Coles; la de `service.ts:575` se reemplaza llamándola.
  - `devig` y `devig2Way` (`devig.ts`) y `computeSegmentBlendedProbs` (`blend.ts`).
  - El mismo clamp `0.01–0.99` de `probabilityToFairOdds` en `packages/contracts/src/view-models.ts:102`, documentado en el contrato para que el sync con la app sea directo.
- **Además:** crea `src/domain/prediction/math.ts` con `clamp`, `logit`, `sigmoid`, `normalCdf` y `createMulberry32`, y elimina los duplicados en `clv.ts`, `montecarlo.ts`, `multisport.ts`, `nfl_live.ts`, `stale_lines.ts` y `devig.ts`. La paridad TS↔Python se mantiene sin cambios.
- **Escribe:**
  - `src/domain/prediction/{outlook.ts, math.ts}`
  - los imports de math en los módulos listados
  - `tests/prediction/outlook.test.ts`
  - `research/prediction-lab/coordination/v3_2/CONTRACT_OUTLOOK.md`
- **Aceptación:**
  - Las probabilidades de cada mercado suman 1 con error `< 1e-12`.
  - La cuota justa es 1/p con el clamp.
  - El 1X2 de la matriz es igual al de `deriveAll2WayMarkets`.
  - No hay ningún campo de stake o Kelly.
  - Todos los tests existentes siguen en verde.

### B2 · `b2-gate` — Compuerta de producción y honestidad del servicio
- **Objetivo:** que `service.ts` respete v3.1 y deje de producir valor falso.
  1. **Cargar la compuerta de segmentos.** Leer `production_segments_v3_1.json` y `blend_weights_v3_1.json`. Con un segmento apagado, la salida no lleva `expectedEdge`, `kellyFraction` ni `geodesicV2.stake`, y se agrega `valueStatus: "disabled_segment"`.
  2. **Quitar las cuotas sintéticas** (`service.ts:979-997`). Sin cuota real, `valueStatus: "no_market"`.
  3. **Corregir `service.ts:1169`**, donde el ancla de Smarkets recibe la probabilidad del modelo.
  4. **Medir la imputación en NFL y fútbol en vivo.** Agregar `featureCoverage` (por ejemplo, 4/29 en NFL), con `dataQualityFlag: "low_coverage"` cuando la cobertura sea menor a 50%.
  5. **Mover los números mágicos a una configuración versionada** (`src/data/prediction/service_constants_v3_2.json`): Elo 65 y 1550, `seasonProgress` 0.35, RLM ±12, margen NFL, altitud 0.08 y la lista de clubes populares de Liga MX. Cada uno lleva su origen y la etiqueta "heurística no validada" cuando corresponda.
  6. **Unificar los tiers.** `ledger.ts` y `clv_report.py` aceptan solo `solido` y `valor`. Los valores heredados (`baseline_v3_0`, `especulativo`) solo se aceptan al leer registros históricos.
- **Escribe:** `src/domain/prediction/{service.ts, engine.ts, types.ts, ledger.ts}`, `services/models/clv_report.py`, `src/data/prediction/service_constants_v3_2.json` y `tests/prediction/{service_gate.test.ts, …}`.
- **Aceptación:**
  - Con los 60 segmentos apagados, una batería de partidos en vivo no emite ningún edge, Kelly ni stake.
  - Ningún precio aparece en la salida sin una cuota de origen con `ts_captured`.
  - La paridad del ledger se mantiene (`< 1e-12`).
  - La compatibilidad de `predictMatch` y `predictLiveMatchup` se conserva: los campos solo se agregan, nunca se renombran.

### B3 · `b3-capture` — Captura multi-tick legal (worktree `web-scraping`)
- **Pasos:**
  1. **Revisión legal.** Escribir `docs/LEGAL_FUENTES_CUOTAS.md` con una tabla por fuente (Pinnacle, Smarkets, Caliente, Codere, Betfair, The Odds API, Action Network): ToS, robots, API oficial (sí/no), si necesita evasión y el estado (`ok`, `api_only` o `blocked_pending_owner_decision`). **Ninguna fuente bloqueada entra al programador.**
  2. **Programador** `scrapers/cadence_scheduler.py`. Lee los intervalos de `stale_lines_config.json` de prediction-lab, en solo lectura:
     - `<= 3.69 min` en `[T-60m, T-0]`
     - `<= 8.57 min` en `[T-4.4h, T-60m)`
     - `<= 11.69 min` en `[T-8.5h, T-4.4h)`
     - `<= 30.40 min` antes de eso
     Calcula los horarios por evento a partir del calendario y tiene `--dry-run`, `--once` y `--loop`, con backoff y límite de tasa por fuente. Cada ciclo captura juntos al menos una casa sharp (Pinnacle o Smarkets) y las recreativas permitidas.
  3. **Serie temporal append-only** en `data/odds_timeseries/<sport>/<YYYY-MM-DD>.jsonl`. Usa el esquema de 11 columnas de `odds.ts` (`event_id, sport, league, market, line, selection, book, price_decimal, ts_captured, ts_event_start, source`) más `raw_sha256`, con `event_id` canónico mediante la resolución de equipos existente.
  4. **Arreglar Codere** para que traiga equipos y evento. Si no es posible de forma legal, se marca bloqueada.
  5. **Salud de la captura** en `data/odds_timeseries/health.json`: ticks por evento, brecha mediana por régimen y cobertura sharp.
- **Escribe:** solo `.worktrees/web-scraping/{scrapers/cadence_scheduler.py, scrapers/sources/*, docs/LEGAL_FUENTES_CUOTAS.md, data/odds_timeseries/**, tests/**}`, más `research/prediction-lab/coordination/v3_2/CONTRACT_ODDS_TIMESERIES.md` en prediction-lab.
- **Aceptación:**
  - Una corrida real de `--loop` de al menos 3 h sobre una jornada de fútbol o NFL produce al menos 2 ticks por evento, separados por al menos 2 min, con brecha mediana `<= 3.69 min` en `T-60m` para cada fuente aprobada.
  - Los archivos pasan `validateAndDeduplicateSnapshots` (`odds.ts`) sin errores.
  - Si no hay jornada durante la ventana del swarm, se entrega la prueba con `--once` y `--dry-run`, se marca `prospective_capture_pending` y se explica el motivo.

### B4 · `b4-calibration` — Probabilidad publicada calibrada
- **Objetivo:** decidir, por `liga × mercado`, de qué fuente sale la probabilidad que ve el usuario (`market_sharp_novig` > `blend_v3_1` > `model` > `base_rate`, según disponibilidad y frescura) y publicar su calibración.
- **Métricas,** solo en `walk_forward_dev`, con IC 95% bootstrap: log-loss, Brier, RPS, curva de fiabilidad de 10 bins y ECE.
  - **Fútbol:** 1X2, totales 2.5, BTTS y AH.
  - **NFL:** moneyline, comparada contra el consenso de nflverse con la etiqueta "sin cierre sharp".
- **Artefactos:** `services/models/outlook_calibration.py`, `services/models/artifacts/outlook_calibration_v3_2.json`, su espejo en `src/data/prediction/outlook_calibration_v3_2.json` (mismo SHA-256) y el reporte `research/prediction-lab/reports/A29_calibracion_publicada.md`.
- **Aceptación:**
  - Tabla completa con `n`, IC y la etiqueta `"no significativa"` donde corresponda.
  - Cero evaluaciones sobre el holdout consumido; se registran en `holdout_trial_registry.jsonl` con `eval_split="walk_forward_dev"`.
  - B1 consume el JSON en `calibrationBucket` (se coordina mediante el contrato).

### B5 · `b5-paper` — Ledger prospectivo y runner de paper-trading (Ola 2)
- **Pipeline:** `services/models/paper_trading.py` lee la serie de B3, valida con `odds_snapshots.py`, genera candidatos con `stale_lines.py` y `picks_engine.py` (parámetros v3.1 congelados, `execution_delay = 2.0 min`, llenado con el primer tick ≥ decisión + 2 min) y los agrega a `data/ledger/picks_v3_2_prospective.jsonl` con `append_pick_to_jsonl` (`clv_report.py:836-855`).
- **Después del partido** resuelve el cierre sharp (`resolve_closing_odds`) y liquida el pick.
- **Cada semana** genera `research/prediction-lab/reports/A29_prospectivo_semana_<n>.md` con CLV%, CLV_prob, ROI y MaxDD por segmento, más el avance hacia la puerta de 150 picks.
- **Paridad:** la cadena SHA-256 del `.jsonl` se verifica igual en TS (`PickLedger.fromJsonl` + `verifyLedgerIntegrity`) y en Python.
- **Escribe:** `services/models/{paper_trading.py, test_paper_trading.py}`, `data/ledger/**` y `tests/prediction/ledger_prospective.test.ts`.
- **Aceptación:**
  - El runner es idempotente: correrlo dos veces no duplica `pick_id`.
  - Es causal: ningún tick posterior a la decisión entra en ella.
  - Funciona contra los datos reales de B3 o, si no los hay, contra un fixture sintético marcado `provenance: synthetic`.
  - `production_enabled` no cambia.

### B6 · `b6-nfl-sharp` — Corpus de cierre sharp para NFL (Ola 2)
- **Objetivo:** construir `services/ingest/nfl_sharp_closing.py`, que une los ticks de Pinnacle y Smarkets de NFL capturados por B3 con los `game_id` de nflverse y produce `research/prediction-lab/data/processed/nfl_sharp_closing.parquet`.
- **Cobertura:** se reporta cuántos partidos tienen cierre sharp y desde cuándo. Es lo que desbloquea la medición de NFL (TODO 4.1). Sin corpus suficiente (`>= 64` partidos), NFL sigue apagado y así se reporta.
- **Escribe:** `services/ingest/nfl_sharp_closing.py`, su test y el reporte `A29_nfl_sharp_corpus.md`.

### B8 · `b8-snapshot` — Regenerador de snapshot para la app (Ola 2)
- **Objetivo:** construir `services/models/regenerate_live_snapshot.py`, que regenera `src/data/prediction/live_matchday_v3_snapshot.json` a partir de la serie de B3 y agrega `outlooks: MatchOutlook[]` (B1). Hoy las cuotas desaparecen de la app a las 72 h (`docs/execution/PROJECT_STATE.md:120` del repo raíz).
- **También:** el comando programable y `SYNC_NOTES.md`, que explica qué tendría que hacer la sesión de la app al correr `pnpm --filter @pitchlab/spacetime sync`. **No toca la app.**
- **Aceptación:** el snapshot es válido según los tipos de `outlook.ts`, sus cuotas tienen menos de 72 h y no lleva ningún campo de stake.

### B7 · `b7-xi` — Fútbol con XI confirmado: instrumentación y experimento (Ola 3)
- **Instrumentación:** contrato `ts_xi_published` y captura de alineaciones oficiales en `T-60m` desde fuentes que pasen la revisión legal de B3.
- **Experimento offline** en `walk_forward_dev`: el ajuste de disponibilidad (`predictMotorAWithAvailability`, `computeLineupAvailabilityDelta`) frente a la línea base, con retraso de 2 min, reportando `ΔLL` contra el cierre de Pinnacle.
- **Es hipótesis no probada:** no se activa, y su resultado entra al reporte con IC.
- **Escribe:** `research/prediction-lab/experiments/EXP_V32_xi/**` y el reporte `A29_xi_confirmado.md`.

### B9 · `b9-nfl-epa` — NFL Minkowski con agregados EPA causales (Ola 3)
- **Objetivo:** reducir la imputación en vivo de NFL (hoy 4/29 features) con agregados semanales de nflverse (`w' < w`): Dropback EPA, Rush EPA, Success%, Pressure y QB CPOE+EPA.
- **Evaluación:** en el arnés A3 (`backtest.py`), dev solamente. El benchmark es el consenso de nflverse y el corpus de B6 cuando exista.
- **Es hipótesis no probada.** Se registra en el trial registry y no se activa.
- **Escribe:** `research/prediction-lab/experiments/EXP_V32_nfl_epa/**`, `src/data/prediction/model_nfl_v3_2_candidate.json` (marcado `candidate`) y el reporte `A29_nfl_epa.md`.

### V · `v-verifier` — Red Team (solo lectura, al cierre de cada ola)
- **Audita por ola:**
  - **Reglas:** el cumplimiento de las reglas rectoras 1–9.
  - **Propiedad:** con `git diff --name-only` contra la base.
  - **Fugas y holdout:** fugas temporales, cero usos del holdout para elegir y `production_enabled = 0`.
  - **Salida pública:** que no haya stake ni cuotas inventadas en ella.
  - **Paridad y tests:** la paridad TS↔Python y las suites completas.
- **Escribe:** `reports/A29_verificacion_v3_2.md` con `PASS`/`FAIL` por control y la evidencia.

### B10 · `b10-docs` — Cierre (Ola 4)
- **Actualiza:**
  - `docs/predicciones/19_HOJA_DE_RUTA…` (§2 con los resultados de v3.2)
  - `MODEL_CARD.md`
  - el reporte maestro `research/prediction-lab/reports/A29_v3_2_maestro.md`
  - un borrador de handoff que el orquestador copia en `PROJECT_STATE.md`

---

## 4. Archivos críticos

| Archivo | Cambio |
|---|---|
| `src/domain/prediction/service.ts` | compuerta de segmentos, sin cuotas sintéticas, fix en :1169, constantes externas (B2) |
| `src/domain/prediction/outlook.ts` (nuevo) | `MatchOutlook`, "lo más probable + cuota justa" (B1) |
| `src/domain/prediction/math.ts` (nuevo) | utilidades compartidas sin duplicados (B1) |
| `src/domain/prediction/markets_2way.ts` | pasa a ser la única implementación de Dixon-Coles (B1 solo la consume) |
| `src/data/prediction/production_segments_v3_1.json` | solo lectura, la carga B2 |
| `services/models/{paper_trading,outlook_calibration,regenerate_live_snapshot}.py` (nuevos) | B5, B4, B8 |
| `services/models/clv_report.py` | se reutiliza `append_pick_to_jsonl` y se unifican los tiers (B2/B5) |
| `.worktrees/web-scraping/scrapers/cadence_scheduler.py` (nuevo) | B3 |

---

## 5. Verificación de punta a punta

1. **Suites completas:**
   - `npx vitest run`, todo en verde (base: 57 archivos y 1,126 tests, más los nuevos).
   - `.\research\prediction-lab\.venv\Scripts\python.exe -m pytest services/models -v` (base: 85, más los nuevos).
2. **Compuerta:** un script de B2 corre `predictLiveMatchup` sobre los 242 enfrentamientos de `live_matchday_v3_snapshot.json` y confirma que emite `0` stakes o edges con segmentos apagados y `0` precios sin origen.
3. **Outlook:** en un partido de Liga MX y otro de NFL, la salida muestra el headline por mercado con su cuota justa. Las sumas cuadran y no hay campo de stake.
4. **Captura:** `health.json` de B3 con una brecha mediana `<= 3.69 min` en `T-60m`; las filas pasan `validateAndDeduplicateSnapshots`.
5. **Ledger:** se corre `paper_trading.py` dos veces y no hay duplicados. La cadena SHA-256 se verifica en TS y en Python.
6. **Holdout:** `holdout_trial_registry.jsonl` no tiene entradas nuevas con `eval_split="holdout_sealed"`.
7. **Producción:** `production_segments_v3_1.json` no cambió (mismo SHA-256).
8. **Veredicto:** `A29_verificacion_v3_2.md` con `PASS` en las 3 puertas.

## 6. Fuera de alcance de esta ronda

- Integrar el resultado en `apps/web` y `packages/spacetime`: lo hace otra sesión con el `SYNC_NOTES.md` de B8.
- MLB, NHL, NBA y NCAAF.
- Player props: no hay cierre sharp histórico.
- Encender segmentos: requiere los 150 picks prospectivos, que tardarán semanas.
