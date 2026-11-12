# CONTRACT_OUTLOOK — Contrato de salida pública `MatchOutlook` (`v3.2`)

> **Propietarios:** Orquestador `O` (borrador inicial en Ola 0) y `B1` (`b1-outlook`, especificación final alineada con `src/domain/prediction/outlook.ts`).
> **Consumidores:** `B1` (implementación TS), `B4` (`outlook_calibration_v3_2.json`), `B8` (`regenerate_live_snapshot.py` + `SYNC_NOTES.md`), Verificador `V`.

---

## 1. Invariantes no negociables (Reglas #4, #5 y #8)

1. **Cero campos de apuesta o dimensionamiento:** `MatchOutlook` y todos sus subtipos **PROHÍBEN** incluir `stake`, `kelly`, `kellyFraction`, `expectedEdge`, `ev`, `value`, `tier` o `"pick seguro"`.
2. **Cero cuotas inventadas:** si no existe una cuota real fresca (`ts_captured <= ts_decision` dentro de la ventana de frescura), el bloque de contexto de mercado del mercado queda en `market: null`. Jamás se fabrican precios sintéticos aplicando un margen supuesto sobre `1 / p`.
3. **Cuota justa (`fairOdds`) idéntica a `packages/contracts/src/view-models.ts:100-105` y `packages/contracts/src/odds.ts:47-55`:**
   ```ts
   export interface FairOdds {
     readonly decimal: number;
     readonly american: number;
   }

   export function probabilityToFairOdds(p: number): FairOdds {
     const clamped = Math.min(0.99, Math.max(0.01, p));
     const decimal = Math.round((1 / clamped) * 100) / 100;
     const american =
       decimal >= 2
         ? Math.round((decimal - 1) * 100)
         : Math.round(-100 / (decimal - 1));
     return { decimal, american };
   }
   ```
   *(Nota: `fairOdds` representa `1 / p` con clamp `[0.01, 0.99]` y redondeo a 2 decimales para sincronización directa con `@pitchlab/contracts` / `@pitchlab/spacetime`; `p` se conserva en doble precisión sin redondear).*
4. **Única implementación de Dixon-Coles:**
   - Todos los mercados de fútbol de `MatchOutlook` se derivan de **una sola llamada** a `buildDixonColesScoreMatrix` / `deriveAll2WayMarkets` en `src/domain/prediction/markets_2way.ts`.
   - Frontera de archivos en Ola 1: `B1` consume `markets_2way.ts` desde `outlook.ts` (sin tocar `service.ts`); `B2` (propietario exclusivo de `service.ts`) reemplaza `dixonColesProbs8` en `service.ts:575` invocando `buildDixonColesScoreMatrix` de `markets_2way.ts`.
5. **Suma de probabilidades por mercado (`|Σ p - 1| < 1e-12`):**
   - Mercados de partición exhaustiva (`1x2`, `totals` `1.5/2.5/3.5`, `btts`, `ah` `±0.5`, NFL `moneyline`, `spread` / `totals` de media unidad): `sum(selections.map(s => s.p)) === 1` con error `< 1e-12`.
   - Mercados de 2 vías con *push* (`dnb`, `ah` entero `±1.0`, NFL `spread`/`totals` en línea entera): las dos selecciones publican la probabilidad condicional sin empate (`p_win / (1 - p_push)`) —o bien `p_effective_win` cuando `p_push == 0`— de forma que `p_sideA + p_sideB = 1` con error `< 1e-12`, exponiendo `pPush` explícitamente en los metadatos del mercado.
   - `double_chance` (`1X`, `12`, `X2`): cada selección (`1X = pH + pD`, `12 = pH + pA`, `X2 = pD + pA`) es exacta sobre la misma matriz DC (`sum = 2.0` sobre las 3 opciones solapadas, y `p(opción) + p(complemento) = 1` con `< 1e-12`); si se requiere normalización o etiqueta explícita `isOverlappingMarket: true`, `B1` documenta el campo exacto en la versión final de este contrato.

---

## 2. Jerarquía de `pSource` y esquema de `MatchOutlook`

### 2.1 Enumeración `PublishedProbSource`
```ts
export type PublishedProbSource =
  | "market_sharp_novig"
  | "blend_v3_1"
  | "model"
  | "base_rate";
```
Orden de prelación por `liga × mercado` (gobernado por `outlook_calibration_v3_2.json` de `B4` y `blend_weights_v3_1.json` congelado):
1. `blend_v3_1` / `market_sharp_novig`: cuando hay cuota sharp real y fresca (`pinnacle` o `smarkets`, edad `<= max_sharp_age_minutes = 180` y `ts_captured <= ts_decision`):
   - Si el segmento en `blend_weights_v3_1.json` tiene `w_effective > 0.05` (y `outlook_calibration_v3_2.json` selecciona mezcla): `computeSegmentBlendedProbs` $\rightarrow$ `pSource = "blend_v3_1"`.
   - Si `w_effective <= 0.05` (mercado sharp puro sin margen): `devig` / `devig2Way` con `best_devig_method` del segmento $\rightarrow$ `pSource = "market_sharp_novig"`.
2. `model`: cuando no hay cuota sharp fresca disponible, pero el motor deportivo (`Motor A` / matriz Dixon-Coles en fútbol; `NFL Minkowski` en NFL) dispone de features válidas.
3. `base_rate`: fallback explícito cuando faltan tanto cuotas sharp como features mínimas del modelo.

### 2.2 Estructura de selección, mercado y partido
Cada selección dentro de un mercado lleva obligatoriamente:
- `selection`: identificador canónico (`"home" | "draw" | "away" | "1X" | "12" | "X2" | "over" | "under" | "yes" | "no"`).
- `label`: etiqueta legible para UI.
- `line`: `number | null`.
- `p`: probabilidad calibrada en `(0, 1)`.
- `fairOdds`: `{ decimal: number; american: number }`.
- `rank`: entero `1..K` (ordenado por `p` descendente, desempate determinista).
- `isMostLikely`: `boolean` (`rank === 1`).
- `pSource`: `PublishedProbSource`.
- `calibrationBucket`: referencia al bin de fiabilidad (`binIndex`, `pMin`, `pMax`, `empiricalFreq`, `meanPred`, `n`, `eceSegment`).
- `dataQuality`: `{ coverageRatio: number; flag: "ok" | "low_coverage" | "fallback_base_rate"; sharpMarketAvailable: boolean }`.

Cada mercado (`MarketOutlook`) lleva:
- `marketKey`: clave canónica (`"1x2"`, `"double_chance"`, `"totals_1_5"`, `"totals_2_5"`, `"totals_3_5"`, `"btts"`, `"dnb"`, `"ah_-1_0"`, `"ah_-0_5"`, `"ah_0_5"`, `"ah_1_0"`, `"moneyline"`, `"spread"`, `"totals"`).
- `line`: `number | null`.
- `pPush`?: `number` (para `dnb` y líneas enteras).
- `headline`: `{ selection: string; label: string; line: number | null; p: number; fairOdds: FairOdds; pSource: PublishedProbSource }`.
- `selections`: `readonly SelectionOutlook[]`.
- `market`: `{ book: "pinnacle" | "smarkets" | string; tsCaptured: string; overround: number } | null` (`null` cuando no existe cuota real fresca).

Mercados requeridos por deporte:
- **Fútbol (`sport: "football"`):** `1X2`, doble oportunidad (`1X/12/X2`), totales `1.5`, `2.5`, `3.5`, `BTTS`, `DNB`, `AH` (`-1.0`, `-0.5`, `+0.5`, `+1.0`) y `topScorelines` (los 3 marcadores exactos `(homeGoals, awayGoals, p, fairOdds)` más probables extraídos de la misma matriz Dixon-Coles).
- **NFL (`sport: "nfl"`):** `moneyline`, y `spread` + `totals` cuando exista línea de mercado real (o con `market: null` si solo hay proyección de margen/total si así lo documenta `B1`, nunca inventando cuotas de casa).

---

## 3. Interfaz JSON `outlook_calibration_v3_2.json` (`B4` $\rightarrow$ `B1`)

Ubicaciones espejo (idéntico SHA-256):
- `services/models/artifacts/outlook_calibration_v3_2.json`
- `src/data/prediction/outlook_calibration_v3_2.json`

Estructura mínima acordada para que `B1` y `B4` trabajen en paralelo sin bloqueo:
```json
{
  "schema_version": "outlook_calibration_v3.2.0",
  "eval_split": "walk_forward_dev",
  "holdout_cut_utc": "2025-02-02T17:30:00Z",
  "holdout_sealed_untouched": true,
  "bootstrap_samples": 1000,
  "max_sharp_age_minutes": 180.0,
  "segments": {
    "E0::1x2": {
      "sport": "football",
      "league": "E0",
      "market": "1x2",
      "selected_source_when_sharp_present": "market_sharp_novig",
      "fallback_order": ["market_sharp_novig", "blend_v3_1", "model", "base_rate"],
      "benchmark_note": "pinnacle_closing_novig",
      "n": 2518,
      "ece": 0.012,
      "ece_ci95": [0.008, 0.018],
      "log_loss": 0.9466,
      "log_loss_ci95": [0.9310, 0.9620],
      "brier": 0.5620,
      "brier_ci95": [0.5510, 0.5730],
      "rps": 0.1980,
      "rps_ci95": [0.1930, 0.2030],
      "delta_ll_vs_benchmark": 0.0,
      "delta_ll_ci95": [0.0, 0.0],
      "significance": "no significativa",
      "reliability_bins": [
        {
          "bin_index": 0,
          "p_min": 0.0,
          "p_max": 0.1,
          "n": 120,
          "mean_pred": 0.065,
          "empirical_freq": 0.067,
          "ci95_low": 0.025,
          "ci95_high": 0.117
        }
      ]
    }
  }
}
```
- `B1` debe tolerar que un segmento específico no exista en `segments` haciendo fallback a `"GLOBAL::<sport>::<market>"` o a un bin teórico `[floor(p*10)/10, (floor(p*10)+1)/10]` con `n: 0, empiricalFreq: null`, y usar el archivo real de `B4` en cuanto esté escrito.

---

## 4. Utilidades matemáticas compartidas (`src/domain/prediction/math.ts`, propietario `B1`)

`B1` exporta desde `src/domain/prediction/math.ts`:
- `clamp(value: number, min: number, max: number): number`
- `logit(p: number, eps?: number): number`
- `sigmoid(x: number): number`
- `normalCdf(x: number): number`
- `createMulberry32(seed: number): () => number`

Y reemplaza las copias duplicadas en `clv.ts`, `montecarlo.ts`, `multisport.ts`, `nfl_live.ts`, `stale_lines.ts` y `devig.ts` re-exportando donde sea necesario para no romper ningún import externo ni alterar la paridad TS ↔ Python (`< 1e-12`).
