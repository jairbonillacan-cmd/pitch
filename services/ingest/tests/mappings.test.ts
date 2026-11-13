import { describe, expect, it } from "vitest";
import {
  HISTORIC_TEAMS,
  LALIGA_TEAM_MAP,
  LIGA_MX_TEAM_MAP,
  PREMIER_LEAGUE_TEAM_MAP,
  resolveCanonicalTeam,
} from "../src/mappings.js";

/** Normaliza un nombre de fuente para comparar si dos alias son el mismo club. */
function clubKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(fc|afc|cf|club|de|la|ud|ca|rc|rcd)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

describe("mapeo de equipos sin identidades cruzadas (P0-03)", () => {
  it("ningún club pasado de la Premier ni de la Liga MX se pinta con el escudo de otro", () => {
    const forbidden: Array<[string, string]> = [
      ["premier-league", "West Ham United"],
      ["premier-league", "Southampton"],
      ["premier-league", "Wolves"],
      ["premier-league", "Leicester City"],
      ["premier-league", "Burnley"],
      ["liga-mx", "Mazatlán"],
    ];
    for (const [league, name] of forbidden) {
      const team = resolveCanonicalTeam(league as "premier-league" | "liga-mx", name);
      expect(team.id).not.toMatch(/coventry-city|sunderland|hull-city|leeds-united|atlante/);
      expect(team.name).toBe(HISTORIC_TEAMS[league]![name]);
    }
  });

  it("Leicester y Burnley ya no comparten id con Leeds", () => {
    const ids = new Set(
      ["Leeds United", "Leicester City", "Burnley"].map((n) => resolveCanonicalTeam("premier-league", n).id),
    );
    expect(ids.size).toBe(3);
  });

  it("los alias de un mismo slug son el mismo club (no hay alias de otro club)", () => {
    const maps = { "premier-league": PREMIER_LEAGUE_TEAM_MAP, "liga-mx": LIGA_MX_TEAM_MAP, laliga: LALIGA_TEAM_MAP };
    for (const [league, table] of Object.entries(maps)) {
      const bySlug = new Map<string, string[]>();
      for (const [raw, slug] of Object.entries(table)) bySlug.set(slug, [...(bySlug.get(slug) ?? []), raw]);
      for (const [slug, raws] of bySlug) {
        const slugKey = slug.replace(/-/g, " ");
        for (const raw of raws) {
          const key = clubKey(raw);
          // Cada alias comparte al menos una palabra distintiva con su slug (o es una sigla conocida).
          const words = key.split(" ").filter((w) => w.length >= 3);
          const known = ["chivas", "guadalajara", "rayados", "xolos", "unam", "pumas", "bilbao", "wolves"];
          const ok = words.some((w) => slugKey.includes(w)) || words.some((w) => known.includes(w));
          expect(ok, `${league}: '${raw}' → '${slug}'`).toBe(true);
        }
      }
    }
  });

  it("la temporada actual sigue resolviendo a su escudo", () => {
    expect(resolveCanonicalTeam("premier-league", "Coventry City FC").id).toBe("premier-league.coventry-city");
    expect(resolveCanonicalTeam("liga-mx", "Atlante").id).toBe("liga-mx.atlante");
  });
});
