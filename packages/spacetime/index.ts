// Punto de entrada de @pitchlab/spacetime.
// `src/`, `data/` y `tests/` son copias de la rama prediction-lab (ver SOURCE.json):
// no se editan aquí; se mejoran allá y se sincronizan con `pnpm --filter @pitchlab/spacetime sync`.
export * from "./src/service";
export * from "./src/devig";
export * from "./src/engine";
export * from "./src/odds";
export type { NFLLiveArtifactConfig } from "./src/nfl_live";
export type * from "./src/types";
// v3.2: panorama público por mercado (probabilidad y momio justo, sin stake).
export {
  OUTLOOK_SCHEMA_VERSION,
  OUTLOOK_CALIBRATION_SCHEMA_VERSION,
  DEFAULT_MAX_SHARP_AGE_MINUTES,
  buildMatchOutlook,
  probabilityToFairOdds,
  type BuildMatchOutlookInput,
  type OutlookMarketQuoteInput,
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
} from "./src/outlook";
// Punto 5: mercados derivados deterministas para fútbol y NFL (sin editar `src/` sincronizado).
export * from "./derived/outlook_derived";
// v5.1 Candidate Suite (`EXP_V50`–`EXP_V56` + Remediación `REM_00`–`REM_08`):
// namespace dedicado para no colisionar con la superficie congelada v3.0/v3.1/v3.2
// (también disponible vía import directo `@pitchlab/spacetime/v5`).
export * as spacetimeV5 from "./src/v5_index";
