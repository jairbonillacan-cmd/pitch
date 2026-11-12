# CONTRACT_OUTLOOK — Contrato de salida pública `MatchOutlook` (`v3.2`)

> **Propietarios:** Orquestador `O` (borrador inicial en Ola 0) y `B1` (`b1-outlook`, especificación final alineada 1:1 con `src/domain/prediction/outlook.ts` y `src/domain/prediction/math.ts`).
> **Consumidores:** `B1` (implementación TS), `B4` (`outlook_calibration_v3_2.json`), `B8` (`regenerate_live_snapshot.py` + `SYNC_NOTES.md`), Verificador `V`.

---

## 1. Invariantes no negociables (Reglas #4, #5 y #8)

1. **Cero campos de apuesta o dimensionamiento:** `MatchOutlook` y todos sus subtipos **PROHÍBEN** incluir `stake`, `kelly`, `kellyFraction`, `expectedEdge`, `edge`, `ev`, `value`, `valueStatus`, `tier` o `"pick seguro"`.
2. **Cero cuotas inventadas:** si no existe una cuota real causal y fresca (`ts_captured <= ts_decision`, `ts_captured <= ts_event_start` cuando el inicio es conocido, y antigüedad `<= max_sharp_age_minutes`), el bloque de contexto de mercado del mercado queda en `market: null`. Jamás se fabrican precios sintéticos aplicando un margen supuesto sobre `1 / p`.
3. **Cuota justa (`fairOdds`) idéntica a `packages/contracts/src/view-models.ts:100-105` y `packages/contracts/src/odds.ts:47-55`:**
   ```ts
   export interface FairOdds {
     readonly decimal: number;
     readonly american: number;
   }

   export function probabilityToFairOdds(p: number): FairOdds {
     if (typeof p !== "number" || !Number.isFinite(p)) {
       throw new OutlookValidationError(
         `probabilityToFairOdds requiere una probabilidad finita; recibido ${String(p)}`,
       );
     }
     const clamped = clamp(p, 0.01, 0.99);
     const decimal = Math.round((1 / clamped) * 100) / 100;
     const american =
       decimal >= 2
         ? Math.round((decimal - 1) * 100)
         : Math.round(-100 / (decimal - 1));
     return Object.freeze({ decimal, american });
   }
   ```
   *(Nota: `fairOdds` representa `1 / p` con clamp `[0.01, 0.99]` y redondeo a 2 decimales para sincronización directa con `@pitchlab/contracts` / `@pitchlab/spacetime`; `p` se conserva en doble precisión IEEE-754 sin redondear).*
4. **Única implementación de Dixon-Coles:**
   - Todos los mercados de fútbol de `MatchOutlook` (`1x2`, `double_chance`, `totals_1_5`, `totals_2_5`, `totals_3_5`, `btts`, `dnb`, `ah_-1_0`, `ah_-0_5`, `ah_0_5`, `ah_1_0` y `topScorelines`) se derivan de **una sola matriz** `buildDixonColesScoreMatrix` / `deriveAll2WayMarkets` en `src/domain/prediction/markets_2way.ts`.
   - Frontera de archivos en Ola 1: `B1` consume `markets_2way.ts` desde `outlook.ts` (sin tocar `service.ts`); `B2` (propietario exclusivo de `service.ts`) reemplaza `dixonColesProbs8` en `service.ts:575` invocando `buildDixonColesScoreMatrix` de `markets_2way.ts`.
5. **Suma de probabilidades por mercado (`|Σ p - 1| < 1e-12`), `double_chance` y `pPush`:**
   - **Mercados de partición exhaustiva** (`1x2`, `totals_1_5`, `totals_2_5`, `totals_3_5`, `btts`, `ah_-0_5`, `ah_0_5`, NFL `spread` / `totals` de media unidad): `isOverlappingMarket: false`, `expectedProbabilitySum: 1` y `|sum(selections.map(s => s.p)) - 1| < 1e-12`.
   - **Mercados de 2 vías con devolución en empate (*push*)** (`dnb`, `ah_-1_0`, `ah_1_0`, NFL `moneyline` con `pTie > 0`, y NFL `spread`/`totals` en línea entera con corrección de continuidad `±0.5`):
     - `isOverlappingMarket: false` y `expectedProbabilitySum: 1`.
     - Las dos selecciones publican la probabilidad condicional sin empate (`p_cond = p_win / (1 - p_push)` = `p_effective_win`), cumpliendo `|p_sideA + p_sideB - 1| < 1e-12`. En particular, en fútbol sin cuota sharp propia en `dnb`, `dnb.home.p === pH / (pH + pA)` y `dnb.away.p === pA / (pH + pA)` con precisión `< 1e-15`.
     - Bajo devolución íntegra del principal en *push*, `1 / p_cond` es además la **cuota decimal justa exacta de valor esperado cero** (`p_win * (d - 1) - p_loss = 0  ⇔  d = (p_win + p_loss) / p_win = 1 / p_cond`).
     - La probabilidad incondicional de reembolso se expone explícitamente en `MarketOutlook.pPush` (`pD` en `dnb`, `P(h - a = 1)` en `ah_-1_0`, `P(a - h = 1)` en `ah_1_0`, `pTie` en NFL `moneyline` cuando `> 0`, y la masa entera `±0.5` en NFL `spread`/`totals` enteros). En mercados de media unidad donde el *push* es imposible, `pPush` queda omitido (`undefined`).
   - **Mercado solapado `double_chance` (`1X`, `12`, `X2`):**
     - Marcado explícitamente con `isOverlappingMarket: true` y `expectedProbabilitySum: 2`.
     - Se calcula por aditividad exacta de Kolmogorov sobre el simplex `1x2` publicado del mismo partido (`p("1X") = pHome + pDraw`, `p("12") = pHome + pAway`, `p("X2") = pDraw + pAway`), garantizando simultáneamente `|Σ p - 2| < 1e-12` y coherencia exacta con cada complemento en `1x2` (`|p("1X") + p("away") - 1| < 1e-12`, `|p("12") + p("draw") - 1| < 1e-12`, `|p("X2") + p("home") - 1| < 1e-12`). Cuando no hay cuota sharp en `1x2`, coincide bit a bit con la suma sobre la matriz Dixon-Coles (`p("1X") === ah_0_5.home.p`); `double_chance.market` permanece en `null` salvo que exista una captura real fresca propia del mercado `double_chance`.

---

## 2. Jerarquía de `pSource` y firmas exactas exportadas por `src/domain/prediction/outlook.ts`

### 2.1 Enumeración `PublishedProbSource` y orden de prelación
```ts
export type PublishedProbSource =
  | "market_sharp_novig"
  | "blend_v3_1"
  | "model"
  | "base_rate";
```
Orden de prelación por `liga × mercado` (gobernado por `outlook_calibration_v3_2.json` de `B4` y `blend_weights_v3_1.json` congelado):
1. `blend_v3_1` / `market_sharp_novig`: únicamente cuando existe cuota sharp real, causal y fresca (`book ∈ {"pinnacle", "smarkets"}`, `pinnacle` prioritario sobre `smarkets`, `ts_captured <= ts_decision`, pre-kickoff, `age <= max_sharp_age_minutes = 180` y `Σ(1/o_i) ∈ [0.9, 1.2]`):
   - Si el modelo base es válido (`!== "base_rate"`), el segmento en `blend_weights_v3_1.json` tiene `w_effective > 0.05` y `outlook_calibration_v3_2.json` selecciona mezcla (`selected_source_when_sharp_present === "blend_v3_1"`, o `blendSeg.model_picks_enabled === true` si el segmento aún no figura en el artefacto de calibración): `computeSegmentBlendedProbs` $\rightarrow$ `pSource = "blend_v3_1"`.
   - En cualquier otro caso con cuota sharp fresca (`w_effective <= 0.05` o `selected_source_when_sharp_present === "market_sharp_novig"`): `devig` / `devig2Way` con `best_devig_method` del segmento $\rightarrow$ `pSource = "market_sharp_novig"`.
   - Las casas recreativas (`caliente`, `codere`, `b365`, `draftkings`, etc.) **jamás** activan `sharpMarketAvailable: true` ni alteran `pSource`; si son reales, causales y frescas, solo informan el bloque descriptivo `market: { book, tsCaptured, overround }`.
2. `model`: cuando no hay cuota sharp fresca disponible, pero el motor deportivo (`Motor A` / tasas `dc_lam_home`, `dc_lam_away` en fútbol; `NFL Minkowski` en NFL) dispone de features válidas. Si la fracción de features base no nulas cae por debajo de `LOW_COVERAGE_THRESHOLD = 0.5`, `dataQuality.flag` se marca `"low_coverage"`.
3. `base_rate`: fallback explícito (`GLOBAL_HDA_RATES = {0.44, 0.26, 0.30}` proyectado sobre la matriz Dixon-Coles en fútbol; `GLOBAL_NFL_BASE_RATES = {0.55, 0.0, 0.45}` en NFL) cuando faltan tanto cuotas sharp como features mínimas del modelo (`dataQuality.flag = "fallback_base_rate"`, `coverageRatio = 0`).

### 2.2 Interfaces y funciones públicas exportadas por `src/domain/prediction/outlook.ts`

```ts
export const OUTLOOK_SCHEMA_VERSION = "match_outlook_v3.2.0" as const;
export const OUTLOOK_CALIBRATION_SCHEMA_VERSION = "outlook_calibration_v3.2.0" as const;
export const DEFAULT_MAX_SHARP_AGE_MINUTES = 180.0;
export const LOW_COVERAGE_THRESHOLD = 0.5;
export const DEFAULT_NFL_SIGMA_MARGIN = 13.5;
export const DEFAULT_NFL_SIGMA_TOTAL = 10.5;

export type OutlookSport = "football" | "nfl";

export type FootballOutlookMarketKey =
  | "1x2"
  | "double_chance"
  | "totals_1_5"
  | "totals_2_5"
  | "totals_3_5"
  | "btts"
  | "dnb"
  | "ah_-1_0"
  | "ah_-0_5"
  | "ah_0_5"
  | "ah_1_0";

export type NFLOutlookMarketKey = "moneyline" | "spread" | "totals";
export type OutlookMarketKey = FootballOutlookMarketKey | NFLOutlookMarketKey;

export type OutlookSelectionKey =
  | "home"
  | "draw"
  | "away"
  | "1X"
  | "12"
  | "X2"
  | "over"
  | "under"
  | "yes"
  | "no";

export type OutlookDataQualityFlag = "ok" | "low_coverage" | "fallback_base_rate";

export interface CalibrationBucketRef {
  readonly segmentKey: string;
  readonly binIndex: number;
  readonly pMin: number;
  readonly pMax: number;
  readonly empiricalFreq: number | null;
  readonly meanPred: number | null;
  readonly n: number;
  readonly eceSegment: number | null;
  readonly benchmarkNote: string | null;
}

export interface OutlookDataQuality {
  readonly coverageRatio: number;
  readonly flag: OutlookDataQualityFlag;
  readonly sharpMarketAvailable: boolean;
}

export interface SelectionOutlook {
  readonly selection: OutlookSelectionKey;
  readonly label: string;
  readonly line: number | null;
  readonly p: number;
  readonly fairOdds: FairOdds;
  readonly rank: number;
  readonly isMostLikely: boolean;
  readonly pSource: PublishedProbSource;
  readonly calibrationBucket: CalibrationBucketRef;
  readonly dataQuality: OutlookDataQuality;
}

export interface MarketHeadline {
  readonly selection: OutlookSelectionKey;
  readonly label: string;
  readonly line: number | null;
  readonly p: number;
  readonly fairOdds: FairOdds;
  readonly pSource: PublishedProbSource;
}

export interface MarketQuoteContext {
  readonly book: string;
  readonly tsCaptured: string;
  readonly overround: number; // margen Σ(1/o_i) - 1, idéntico a devig.ts / odds.ts
}

export interface MarketOutlook {
  readonly marketKey: OutlookMarketKey;
  readonly line: number | null;
  readonly pPush?: number;
  readonly isOverlappingMarket: boolean;
  readonly expectedProbabilitySum: number;
  readonly headline: MarketHeadline;
  readonly selections: readonly SelectionOutlook[];
  readonly market: MarketQuoteContext | null;
}

export interface ScorelineOutlook {
  readonly homeGoals: number;
  readonly awayGoals: number;
  readonly score: string;
  readonly p: number;
  readonly fairOdds: FairOdds;
  readonly rank: number;
  readonly isMostLikely: boolean;
  readonly pSource: PublishedProbSource;
}

export interface MatchOutlook {
  readonly schemaVersion: typeof OUTLOOK_SCHEMA_VERSION;
  readonly matchId: string;
  readonly sport: OutlookSport;
  readonly league: string;
  readonly canonicalLeague: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly kickoffUtc: string | null;
  readonly tsDecision: string;
  readonly markets: readonly MarketOutlook[];
  readonly marketsByKey: Readonly<Partial<Record<OutlookMarketKey, MarketOutlook>>>;
  readonly topScorelines: readonly ScorelineOutlook[];
  readonly dixonColesParams: {
    readonly lamHome: number;
    readonly lamAway: number;
    readonly rho: number;
    readonly maxGoals: number;
  } | null;
  readonly dataQuality: OutlookDataQuality;
}

export function probabilityToFairOdds(p: number): FairOdds;
export function canonicalizeOutlookLeague(sport: OutlookSport, league: string): string;
export function resolveCalibrationBucket(
  p: number,
  sport: OutlookSport,
  canonicalLeague: string,
  marketKey: OutlookMarketKey,
  calibrationArtifact?: OutlookCalibrationArtifact,
): CalibrationBucketRef;
export function buildMatchOutlook(input: BuildMatchOutlookInput): MatchOutlook;
export function getDefaultOutlookCalibrationArtifact(): OutlookCalibrationArtifact;
export function registerDefaultOutlookCalibrationArtifact(
  artifact: OutlookCalibrationArtifact,
): void;
```

Mercados emitidos por deporte:
- **Fútbol (`sport: "football"`):** siempre emite los 11 mercados en orden canónico (`1x2`, `double_chance`, `totals_1_5`, `totals_2_5`, `totals_3_5`, `btts`, `dnb`, `ah_-1_0`, `ah_-0_5`, `ah_0_5`, `ah_1_0`) y `topScorelines` con los 3 marcadores exactos `(homeGoals, awayGoals, score, p, fairOdds)` más probables extraídos de la misma matriz Dixon-Coles.
- **NFL (`sport: "nfl"`):** siempre emite `moneyline`, y agrega `spread` y/o `totals` cuando existe línea disponible (procedente de una cuota real fresca en `marketQuotes`/`oddsSnapshots` o de `nfl.spreadLine` / `nfl.totalLine`; si solo hay `spreadLine`/`totalLine` sin captura de cuota fresca con `ts_captured`, el mercado se publica con `market: null`, sin inventar jamás cuotas de casa ni líneas artificiales).

---

## 3. Interfaz JSON `outlook_calibration_v3_2.json` (`B4` $\rightarrow$ `B1`)

Ubicaciones espejo (idéntico SHA-256):
- `services/models/artifacts/outlook_calibration_v3_2.json`
- `src/data/prediction/outlook_calibration_v3_2.json`

Estructura consumida por `OutlookCalibrationArtifact`:
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
Orden de resolución de segmento en `resolveCalibrationBucket`:
1. Clave exacta `<canonicalLeague>::<marketKey>` (ej. `"MEX::1x2"`, `"MEX::totals_2_5"`, `"NFL::moneyline"`).
2. Clave de familia `<canonicalLeague>::<familyMarket>` (`totals_*` $\rightarrow$ `"totals"` / `"totals_2_5"` / `"ou"`; `ah_*` $\rightarrow$ `"ah"`).
3. Fallback global `"GLOBAL::<sport>::<marketKey>"` o `"GLOBAL::<sport>::<familyMarket>"`.
4. Fallback teórico `"THEORETICAL_FALLBACK"` con decil `[floor(p*10)/10, (floor(p*10)+1)/10]`, `n: 0`, `empiricalFreq: null`, `meanPred: null`, `eceSegment: null`.

---

## 4. Utilidades matemáticas compartidas (`src/domain/prediction/math.ts`, propietario `B1`)

Firmas exactas exportadas desde `src/domain/prediction/math.ts`:
```ts
export const DEFAULT_LOGIT_EPS = 1e-6;
export function clamp(value: number, min: number, max: number): number;
export function logit(p: number, eps?: number): number;
export function sigmoid(x: number): number;
export function normalCdf(x: number): number;
export function createMulberry32(seed: number): () => number;
```

Consumidores deduplicados (con re-exports preservados para compatibilidad hacia atrás y paridad TS ↔ Python `< 1e-12`):
- `src/domain/prediction/clv.ts` (`clamp`, re-exporta `createMulberry32`)
- `src/domain/prediction/montecarlo.ts` (re-exporta `createMulberry32`)
- `src/domain/prediction/multisport.ts` (re-exporta `clamp`, `logit`, `normalCdf`, `sigmoid`)
- `src/domain/prediction/nfl_live.ts` (`clamp`, `sigmoid`)
- `src/domain/prediction/stale_lines.ts` (`clamp`, `logit`, `sigmoid`)
- `src/domain/prediction/devig.ts` (`clamp`)
- `src/domain/prediction/outlook.ts` (`clamp`, `logit`, `normalCdf`, `sigmoid`)
