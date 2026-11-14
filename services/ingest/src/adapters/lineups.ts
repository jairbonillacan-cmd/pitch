/**
 * Parte 2 · Ranura preparada para alineaciones confirmadas (APAGADA por diseño).
 *
 * Mientras `LINEUPS_COLLECTION_ENABLED` sea `false`, este módulo jamás realiza llamadas de red
 * ni escribe alineaciones probables o inventadas: devuelve el estado deshabilitado auditable
 * para que la consola del fundador y los flujos de ingesta lo reflejen con total transparencia.
 */
import {
  LINEUPS_COLLECTION_ENABLED,
  asLeagueId,
  type LeagueLineupsFile,
} from "@pitchlab/contracts";
import type { CanonicalLeague } from "../mappings.js";

export const LINEUPS_DISABLED_REASON =
  "Apagado hasta conectar una fuente oficial verificada de onces confirmados (cero alineaciones probables o inventadas).";

export interface LineupsSlotCheckResult {
  readonly league: CanonicalLeague;
  readonly enabled: typeof LINEUPS_COLLECTION_ENABLED;
  readonly wroteFile: false;
  readonly payload: LeagueLineupsFile;
}

export function evaluatePreparedLineupsSlot(
  league: CanonicalLeague,
  observedAtIso: string = new Date().toISOString(),
): LineupsSlotCheckResult {
  return {
    league,
    enabled: LINEUPS_COLLECTION_ENABLED,
    wroteFile: false,
    payload: {
      schemaVersion: 1,
      league: asLeagueId(league),
      enabled: LINEUPS_COLLECTION_ENABLED,
      observedAt: observedAtIso,
      source: "disabled_pending_verified_source",
      disabledReason: LINEUPS_DISABLED_REASON,
      entries: [],
    },
  };
}
