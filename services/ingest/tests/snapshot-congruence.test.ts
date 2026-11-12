/**
 * Congruencia de lo publicado: corre sobre los snapshots versionados.
 * - Los picks de un partido pueden cumplirse a la vez y respetan el rango de su perfil.
 * - El marcador proyectado pertenece al resultado favorito y al lado favorito de 2.5.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LeagueSnapshotSchema } from "@pitchlab/contracts";
import { PICK_PROFILES, picksCompatible } from "@pitchlab/models";

const SNAPSHOTS = resolve(import.meta.dirname, "..", "..", "..", "data", "snapshots");
const leagues = existsSync(SNAPSHOTS)
  ? readdirSync(SNAPSHOTS).filter((d) => existsSync(resolve(SNAPSHOTS, d, "latest.json")))
  : [];

describe("congruencia de los snapshots publicados", () => {
  for (const league of leagues) {
    it(league, () => {
      const snap = LeagueSnapshotSchema.parse(
        JSON.parse(readFileSync(resolve(SNAPSHOTS, league, "latest.json"), "utf8")),
      );
      const football = league !== "nfl";
      for (const analysis of Object.values(snap.analyses)) {
        const picks = analysis.picks ?? [];
        expect(picksCompatible(picks, football ? 10 : 70), `${analysis.game} picks`).toBe(true);
        for (const pick of picks) {
          const rule = PICK_PROFILES.find((r) => r.profile === pick.profile)!;
          expect(pick.p, `${analysis.game} ${pick.profile}`).toBeGreaterThanOrEqual(rule.min);
          expect(pick.p).toBeLessThan(rule.max);
        }

        const score = analysis.projectedScore;
        if (football && score) {
          const [h, d, a] = analysis.x12;
          const fav = h >= d && h >= a ? "home" : a >= d ? "away" : "draw";
          const got = score.home > score.away ? "home" : score.home < score.away ? "away" : "draw";
          expect(got, `${analysis.game} resultado`).toBe(fav);
          const over25 = analysis.marketGroups
            .flatMap((g) => g.rows)
            .find((r) => r.market === "totals" && r.selection === "over_2.5");
          if (over25 && Math.abs(over25.p - 0.5) > 0.02) {
            expect(score.home + score.away > 2.5, `${analysis.game} goles`).toBe(over25.p > 0.5);
          }
        }
      }
    });
  }
});
