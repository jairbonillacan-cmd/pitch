// Punto de entrada de @pitchlab/spacetime.
// `src/`, `data/` y `tests/` son copias de la rama prediction-lab (ver SOURCE.json):
// no se editan aquí; se mejoran allá y se sincronizan con `pnpm --filter @pitchlab/spacetime sync`.
export * from "./src/service.js";
export * from "./src/devig.js";
export * from "./src/engine.js";
export type * from "./src/types.js";
