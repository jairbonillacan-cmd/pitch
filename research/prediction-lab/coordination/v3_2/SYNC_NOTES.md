# SYNC_NOTES — Guía de sincronización `prediction-lab` → `@pitchlab/spacetime` → `@pitchlab/contracts` → `apps/web` (`v3.2`)

**Autor:** Agente `B8` (`b8-snapshot`, Ola 2 · `PREDLAB-V3.2`)
**Estado:** Listo para consumo por la sesión de aplicación (`apps/web` / `packages/spacetime` / `packages/contracts`) tras cierre de Puerta 2.
**Frontera respetada en este swarm:** `prediction-lab` no tocó `apps/web`, `packages/ui`, `packages/spacetime` ni el repo raíz (`MASTER.md` §0.9).

---

## 1. Resumen ejecutivo de qué cambia en `v3.2`

El producto público de predicción pasa de mostrar recomendaciones de apuesta con stake/Kelly a un **motor de pronóstico probabilístico por mercado (`MatchOutlook`)**:

1. **Dominio nuevo y compartido (`B1` + `B2`):**
   - `src/domain/prediction/outlook.ts` — `buildMatchOutlook`, `MatchOutlook`, `MarketOutlook`, `SelectionOutlook`, `ScorelineOutlook`, `probabilityToFairOdds`.
   - `src/domain/prediction/math.ts` — primitivas numéricas compartidas (`clamp`, `clamp01`, `roundToDecimals`, `parseUtcMillisOrNull`, `isFiniteNumber`, `normalCdf`).
   - `src/domain/prediction/service.ts` — constantes extraídas a JSON y prohibición dura de cuotas sintéticas (`sports_only` / sin `ts_captured` → `market: null`, `executableBetsCount: 0`).
2. **Artefactos JSON nuevos o regenerados (`B1`, `B2`, `B8`):**
   - `src/data/prediction/outlook_calibration_v3_2.json` — tabla empírica de calibración por decil OOF/walk-forward (`12` segmentos, `ECE`, `n`, `empiricalFreq`, `meanPred`).
   - `src/data/prediction/service_constants_v3_2.json` — constantes auditadas de síntesis en vivo con `source` y `justification`.
   - `src/data/prediction/live_matchday_v3_snapshot.json` (`schema_version: "3.2.0"`) — conserva intactos los bloques heredados (`242` `edge_matrix_records`, `376` `team_master_records`, `counts_by_league`, `expected_predictions`) y agrega en la raíz:
     - `outlooks_meta` (`generated_at_utc`, `max_quote_age_hours: 72`, `n_outlooks_total: 130`, `n_football: 84`, `n_nfl: 46`, `n_with_fresh_sharp_quotes_lt_72h`, `capture_status`).
     - `outlooks: MatchOutlook[]` (`130` partidos = `84` fútbol × `11` mercados + `topScorelines[3]`, y `46` NFL).

---

## 2. Paso 0 — Refresco previo del snapshot antes de sincronizar

Antes de correr el sync hacia `@pitchlab/spacetime`, regenera y verifica el snapshot contra la serie multi-tick legal de `B3` (`web-scraping/data/odds_timeseries`):

```powershell
Set-Location "C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\prediction-lab"

# 1. Regenerar live_matchday_v3_snapshot.json con ventana estricta < 72 h
.\research\prediction-lab\.venv\Scripts\python.exe services/models/regenerate_live_snapshot.py `
  --timeseries-dir ..\web-scraping\data\odds_timeseries `
  --max-quote-age-hours 72 `
  --out src/data/prediction/live_matchday_v3_snapshot.json

# 2. Auditoría en seco (--check) para CI / cron (código 0 si todo cumple < 72 h y 0 campos de stake)
.\research\prediction-lab\.venv\Scripts\python.exe services/models/regenerate_live_snapshot.py `
  --timeseries-dir ..\web-scraping\data\odds_timeseries `
  --max-quote-age-hours 72 `
  --out src/data/prediction/live_matchday_v3_snapshot.json `
  --check
```

### Programación periódica (cron / Task Scheduler)
- `live_matchday_v3_snapshot.json` debe regenerarse cada **15–30 minutos** mientras el recolector prospectivo de `B3` esté activo (`capture_status == "active"`), siempre con `--max-quote-age-hours 72`.
- En el pipeline de despliegue o healthcheck de la app, ejecuta `--check`: si alguna cuota adjunta supera `>= 72 h` respecto al reloj UTC actual, `--check` devuelve `exit code 1` para forzar regeneración inmediata antes de servir cuotas vencidas.

---

## 3. Paso 1 — Ejecutar `pnpm --filter @pitchlab/spacetime sync` y revisar manifiesto

Desde el workspace principal de la app (donde reside `packages/spacetime`):

1. **Asegurar que el script `sync` de `@pitchlab/spacetime` copie todos los módulos y artefactos `v3.2` requeridos:**
   - **Módulos de dominio (`src/domain/prediction/`):**
     - `outlook.ts` *(nuevo en v3.2)*
     - `math.ts` *(nuevo en v3.2)*
     - `service.ts` *(actualizado en v3.2)*
     - `markets_2way.ts`, `blend.ts`, `devig.ts`, `odds.ts`, `engine.ts`, `nfl.ts`, `nfl_live.ts`, `multisport.ts`, `market_v3.ts`, `picks.ts`, `types.ts`
   - **Artefactos de datos (`src/data/prediction/`):**
     - `outlook_calibration_v3_2.json` *(nuevo en v3.2)*
     - `service_constants_v3_2.json` *(nuevo en v3.2)*
     - `live_matchday_v3_snapshot.json` *(regenerado en v3.2 con `.outlooks` y `.outlooks_meta`)*
     - Artefactos `v3.1` congelados que lee `outlook.ts` en solo lectura: `production_segments_v3_1.json` (`0/60` habilitados), `blend_weights_v3_1.json`, `markets_2way_config.json`, `model_motor_a.json`, `model_nfl.json`
2. **Correr la sincronización y re-exportar desde el entrypoint de `@pitchlab/spacetime`:**
   ```powershell
   pnpm --filter @pitchlab/spacetime sync
   pnpm --filter @pitchlab/spacetime typecheck
   pnpm --filter @pitchlab/spacetime test
   ```
3. **Exports públicos que debe exponer `@pitchlab/spacetime`:**
   ```ts
   export {
     OUTLOOK_SCHEMA_VERSION,
     OUTLOOK_CALIBRATION_SCHEMA_VERSION,
     DEFAULT_MAX_SHARP_AGE_MINUTES,
     buildMatchOutlook,
     probabilityToFairOdds,
     decimalToAmerican,
     type MatchOutlook,
     type MarketOutlook,
     type SelectionOutlook,
     type MarketHeadline,
     type ScorelineOutlook,
     type MarketQuoteContext,
     type CalibrationBucketRef,
     type OutlookDataQuality,
     type OutlookDataQualityFlag,
     type PublishedProbSource,
     type OutlookSport,
     type OutlookMarketKey,
     type FootballOutlookMarketKey,
     type NFLOutlookMarketKey,
     type FairOdds,
   } from "./domain/prediction/outlook";
   ```

---

## 4. Paso 2 — Exposición tipada en `packages/contracts`

En `packages/contracts/src/`:

1. **Paridad de `probabilityToFairOdds` (ya alineada 1:1):**
   - `packages/contracts/src/view-models.ts` (`líneas 100-105`) ya implementa `probabilityToFairOdds(p)` con clamp `[0.01, 0.99]`, redondeo decimal a 2 cifras y conversión `decimalToAmerican` idéntica bit a bit a `src/domain/prediction/outlook.ts`. No cambies esa fórmula.
2. **Normalización de identificadores entre `live_matchday_v3_snapshot.json.outlooks` y `@pitchlab/contracts`:**
   - **Liga (`LeagueId` en `packages/contracts/src/ids.ts`):**
     - En el snapshot, Premier League usa `league: "epl"` (`canonicalLeague: "E0"`), mientras que `VALID_LEAGUES` en `@pitchlab/contracts` usa `"premier-league"`. Mapea `"epl" -> "premier-league"` en el adaptador de lectura (`bundesliga`, `laliga`, `liga-mx`, `ligue-1`, `serie-a` y `nfl` coinciden directo).
   - **Deporte (`SportId` en `packages/contracts/src/analysis.ts`):**
     - `MatchOutlook.sport` usa `"football" | "nfl"`; `MatchAnalysis.sport` en `@pitchlab/contracts` usa `"football" | "american-football"`. Mapea `"nfl" -> "american-football"` en la frontera de contratos si reutilizas `MatchAnalysis`.
3. **Contrato recomendado en `packages/contracts/src/analysis.ts` (y re-export en `packages/contracts/src/index.ts`):**
   - Agrega o adapta el bloque de pronóstico de partido para transportar sin pérdida:
     - `headline` por mercado (`selection`, `label`, `line`, `p`, `fairOdds: { decimal, american }`, `pSource`).
     - `selections` ordenadas por probabilidad (`rank`, `isMostLikely`, `p`, `fairOdds`, `pSource`, `calibrationBucket`, `dataQuality`).
     - `isOverlappingMarket: boolean` y `expectedProbabilitySum: 1 | 2` (para que la UI distinga `double_chance`, cuya suma es `2.0`, de particiones `1.0`).
     - `topScorelines` (`readonly [ScorelineOutlook, ScorelineOutlook, ScorelineOutlook]` en fútbol; `[]` en NFL, mapeable también a `mostLikelyScore = topScorelines[0]`).
     - `market: MarketQuoteContext | null` (únicamente cuando existe captura real `< 72 h` y `tsCaptured <= kickoffUtc`).

---

## 5. Paso 3 — Reglas obligatorias de renderizado en `apps/web` (cero stake y cero cuotas sintéticas)

Al conectar `apps/web` a `live_matchday_v3_snapshot.json.outlooks` (o a `buildMatchOutlook` en tiempo real):

1. **Prohibido mostrar stake, Kelly, EV o lenguaje de apuesta recomendada (`MASTER.md` §0.5):**
   - Ningún componente, tabla, tooltip ni endpoint de `apps/web` debe calcular ni renderizar `stake`, `kelly`, `kellyFraction`, `expectedEdge`, `EV`, `tier` (`"solido"` / `"valor"`), ni etiquetas como *"pick seguro"* o *"apuesta recomendada"*.
   - `production_segments_v3_1.json` tiene **`0/60` segmentos habilitados** (`production_enabled = 0`) y `executable_bets_count === 0`.
2. **Distinción visual explícita entre "Cuota justa del modelo" y "Cuota real de casa" (`MASTER.md` §0.4):**
   - **`selection.fairOdds` (`1 / p` redondeada):** etiquétala siempre como **"Cuota justa estimada"** o **"Precio justo implícito"** junto a la probabilidad `p` (`%`) y su origen (`pSource`: `"Modelo"`, `"Mercado sharp sin vig"` o `"Blend v3.1"`). **Jamás** la etiquetes como cuota ofrecida por una casa de apuestas.
   - **`marketOutlook.market` (`MarketQuoteContext | null`):**
     - Si `market === null` (como ocurre hoy en los `130` partidos mientras `B3` está en `capture_status: "prospective_capture_pending"`): muestra **"Sin cuota real reciente (< 72 h)"** u oculta la columna de casa de apuestas. **PROHIBIDO** rellenar con `1 / p`, cuotas mock, o capturas históricas vencidas (`>= 72 h`).
     - Si `market !== null`: muestra `market.book`, `market.overround` y el sello de frescura derivado de `market.tsCaptured` (validando siempre `< 72 h` respecto al reloj UTC).
3. **Transparencia de calidad de datos y calibración:**
   - Muestra insignia de calidad usando `outlook.dataQuality` (`flag`: `"ok"`, `"low_coverage"` o `"fallback_base_rate"`, `sharpMarketAvailable: boolean` y `coverageRatio`) para que el usuario sepa cuándo la inferencia descansa en cobertura parcial de features o sin referencia sharp.
   - Si `selection.calibrationBucket.empiricalFreq !== null` (`n >= 10` en OOF/walk-forward), puedes mostrar en un tooltip: *"Histórico del modelo en rango [pMin–pMax]: acierto empírico X% en N partidos (`ECE` segmento)"*. Cuando `n < 10` (`empiricalFreq === null`), muestra *"Muestra histórica insuficiente en este decil"*.

---

## 6. Checklist rápido de validación post-sync en la sesión de la app

- [ ] `regenerate_live_snapshot.py --check` devuelve `{"status": "ok", "mode": "check", "n_outlooks_total": 130, ...}` con `exit code 0`.
- [ ] `pnpm --filter @pitchlab/spacetime sync && pnpm --filter @pitchlab/spacetime test` pasa en verde.
- [ ] `pnpm --filter @pitchlab/contracts typecheck` pasa en verde.
- [ ] Búsqueda en `apps/web` confirma `0` referencias visibles al usuario de `kelly`, `stake`, `pick seguro` o cuotas de casa inventadas cuando `market === null`.
