// Punto de entrada de @pitchlab/spacetime.
// `src/`, `data/` y `tests/` son copias de la rama prediction-lab (ver SOURCE.json):
// no se editan aquí; se mejoran allá y se sincronizan con `pnpm --filter @pitchlab/spacetime sync`.
export * from "./src/service";
export * from "./src/devig";
export * from "./src/engine";
export type * from "./src/types";
// v3.2: panorama público por mercado (probabilidad y momio justo, sin stake).
export {
  OUTLOOK_SCHEMA_VERSION,
  OUTLOOK_CALIBRATION_SCHEMA_VERSION,
  DEFAULT_MAX_SHARP_AGE_MINUTES,
  buildMatchOutlook,
  probabilityToFairOdds,
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
