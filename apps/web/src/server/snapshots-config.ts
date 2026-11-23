import fs from "node:fs";
import path from "node:path";
import {
  COMPETITION_BY_ID,
  LEAGUE_CAPABILITY_LIST,
  type ProductLeagueKey,
} from "@pitchlab/contracts";

export function resolveSnapshotsRoot(): string {
  const candidates = [
    path.resolve(process.cwd(), "data/snapshots"),
    path.resolve(process.cwd(), "../../data/snapshots"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[1] ?? candidates[0]!;
}

export const PRODUCT_LEAGUES: readonly ProductLeagueKey[] = Object.freeze(
  LEAGUE_CAPABILITY_LIST.map((entry) => entry.id),
);

export type ProductLeague = (typeof PRODUCT_LEAGUES)[number];

export const LEAGUE_LABELS: Record<ProductLeague, string> = Object.fromEntries(
  PRODUCT_LEAGUES.map((id) => [id, COMPETITION_BY_ID[id]?.label ?? id]),
) as Record<ProductLeague, string>;
