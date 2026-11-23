import { isNationalCompetition } from "@pitchlab/contracts";

export interface LeagueStandingsSplitMeta {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  form: ReadonlyArray<"G" | "E" | "P">;
}

export interface LeagueStandingsMeta {
  formBySlug: Readonly<Record<string, ReadonlyArray<"G" | "E" | "P">>>;
  homeBySlug?: Readonly<Record<string, LeagueStandingsSplitMeta>>;
  awayBySlug?: Readonly<Record<string, LeagueStandingsSplitMeta>>;
}

export type StandingsZoneTone = "ucl" | "uel" | "uecl" | "warn" | "rel";

export interface StandingsZoneDef {
  id: string;
  label: string;
  tone: StandingsZoneTone;
  startRank: number;
  endRank: number;
}

export function resolveLeagueStandingsZones(
  league: string,
  sport: string,
  totalTeams: number,
): StandingsZoneDef[] {
  if (totalTeams < 4) return [];
  const clamp = (zones: StandingsZoneDef[]) =>
    zones
      .filter((z) => z.startRank <= totalTeams)
      .map((z) => ({ ...z, endRank: Math.min(z.endRank, totalTeams) }))
      .filter((z) => z.endRank >= z.startRank);

  if (league === "bundesliga") {
    return clamp([
      { id: "ucl", label: "Liga de Campeones", tone: "ucl", startRank: 1, endRank: 4 },
      { id: "uel", label: "UEFA Europa League", tone: "uel", startRank: 5, endRank: 5 },
      {
        id: "uecl",
        label: "Clasificación para la Conference League",
        tone: "uecl",
        startRank: 6,
        endRank: 6,
      },
      ...(totalTeams >= 16
        ? [
            {
              id: "playoff-rel",
              label: "Playoffs Descenso",
              tone: "warn" as const,
              startRank: totalTeams - 2,
              endRank: totalTeams - 2,
            },
            {
              id: "rel",
              label: "Descenso",
              tone: "rel" as const,
              startRank: totalTeams - 1,
              endRank: totalTeams,
            },
          ]
        : []),
    ]);
  }

  if (league === "premier-league") {
    return clamp([
      { id: "ucl", label: "Liga de Campeones", tone: "ucl", startRank: 1, endRank: 4 },
      { id: "uel", label: "UEFA Europa League", tone: "uel", startRank: 5, endRank: 5 },
      ...(totalTeams >= 18
        ? [
            {
              id: "rel",
              label: "Descenso",
              tone: "rel" as const,
              startRank: totalTeams - 2,
              endRank: totalTeams,
            },
          ]
        : []),
    ]);
  }

  if (league === "laliga" || league === "la-liga" || league === "serie-a") {
    return clamp([
      { id: "ucl", label: "Liga de Campeones", tone: "ucl", startRank: 1, endRank: 4 },
      { id: "uel", label: "UEFA Europa League", tone: "uel", startRank: 5, endRank: 5 },
      {
        id: "uecl",
        label: "Clasificación para la Conference League",
        tone: "uecl",
        startRank: 6,
        endRank: 6,
      },
      ...(totalTeams >= 18
        ? [
            {
              id: "rel",
              label: "Descenso",
              tone: "rel" as const,
              startRank: totalTeams - 2,
              endRank: totalTeams,
            },
          ]
        : []),
    ]);
  }

  if (league === "ligue-1") {
    return clamp([
      { id: "ucl", label: "Liga de Campeones", tone: "ucl", startRank: 1, endRank: 3 },
      {
        id: "ucl-q",
        label: "Clasificación Liga de Campeones",
        tone: "uel",
        startRank: 4,
        endRank: 4,
      },
      { id: "uel", label: "UEFA Europa League", tone: "uel", startRank: 5, endRank: 5 },
      {
        id: "uecl",
        label: "Clasificación para la Conference League",
        tone: "uecl",
        startRank: 6,
        endRank: 6,
      },
      ...(totalTeams >= 16
        ? [
            {
              id: "playoff-rel",
              label: "Playoffs Descenso",
              tone: "warn" as const,
              startRank: totalTeams - 2,
              endRank: totalTeams - 2,
            },
            {
              id: "rel",
              label: "Descenso",
              tone: "rel" as const,
              startRank: totalTeams - 1,
              endRank: totalTeams,
            },
          ]
        : []),
    ]);
  }

  if (league === "liga-mx") {
    return clamp([
      { id: "liguilla", label: "Liguilla (Cuartos de final)", tone: "ucl", startRank: 1, endRank: 8 },
    ]);
  }

  if (league === "champions-league" || league === "europa-league" || league === "conference-league") {
    return clamp([
      { id: "r16", label: "Octavos de final", tone: "ucl", startRank: 1, endRank: 8 },
      { id: "ko", label: "Playoffs eliminatorios", tone: "uel", startRank: 9, endRank: 24 },
      ...(totalTeams >= 25
        ? [{ id: "out", label: "Eliminación", tone: "rel" as const, startRank: 25, endRank: totalTeams }]
        : []),
    ]);
  }

  if (sport === "basketball") {
    if (totalTeams > 16) return [];
    return clamp([
      { id: "po", label: "Playoffs directos", tone: "ucl", startRank: 1, endRank: 6 },
      ...(totalTeams >= 10
        ? [{ id: "pi", label: "Torneo Play-In", tone: "warn" as const, startRank: 7, endRank: 10 }]
        : []),
    ]);
  }

  if (sport === "ice-hockey") {
    if (totalTeams > 16) return [];
    return clamp([
      { id: "po", label: "Clasificación a Playoffs", tone: "ucl", startRank: 1, endRank: 8 },
    ]);
  }

  if (sport === "american-football") {
    if (totalTeams > 16) return [];
    return clamp([
      { id: "po", label: "Clasificación a Playoffs", tone: "ucl", startRank: 1, endRank: Math.min(7, totalTeams) },
    ]);
  }

  if (sport === "baseball") {
    if (totalTeams > 16) return [];
    return clamp([
      { id: "div", label: "Líderes divisionales", tone: "ucl", startRank: 1, endRank: 3 },
      { id: "wc", label: "Comodín (Wild Card)", tone: "uel", startRank: 4, endRank: 6 },
    ]);
  }

  if (league === "amistosos" || isNationalCompetition(league)) {
    if (league === "amistosos" || totalTeams > 6) return [];
    return clamp([
      { id: "qual", label: "Clasificación a fase final", tone: "ucl", startRank: 1, endRank: Math.min(2, totalTeams) },
    ]);
  }

  return [];
}

export function resolveLeagueTieBreakers(
  league: string,
  sport: string,
  scoringPlural: string,
): { intro: string; items: string[] } {
  const unitCap = scoringPlural.charAt(0).toUpperCase() + scoringPlural.slice(1);
  if (league === "amistosos") {
    return {
      intro: "Tabla acumulada de resultados en encuentros internacionales amistosos (sin plazas eliminatorias):",
      items: [`Diferencia de ${scoringPlural}`, `${unitCap} a favor`],
    };
  }
  if (league === "liga-mx") {
    return {
      intro: "Los 8 mejores clasifican directo a Cuartos de final de la Liguilla (sin Play-In ni descenso). Criterios de desempate:",
      items: [
        "Diferencia de goles",
        "Goles a favor",
        "Goles anotados como visitante",
        "Enfrentamiento directo",
      ],
    };
  }
  if (league === "laliga" || league === "la-liga") {
    return {
      intro: "Si dos o más clubes empatan en puntos al final de la temporada, los criterios de desempate son:",
      items: [
        "Enfrentamiento directo (puntos y diferencia de goles entre los implicados)",
        "Diferencia de goles general",
        "Goles a favor",
      ],
    };
  }
  if (league === "serie-a") {
    return {
      intro: "En caso de empate en puntos (el título y el descenso se definen por partido de desempate cuando hay igualdad entre dos equipos):",
      items: [
        "Enfrentamiento directo (puntos y diferencia de goles)",
        "Diferencia de goles general",
        "Goles a favor",
      ],
    };
  }
  if (league === "premier-league") {
    return {
      intro: "En caso de empate en puntos (las plazas europeas adicionales dependen de las copas nacionales):",
      items: ["Diferencia de goles", "Goles a favor", "Enfrentamiento directo"],
    };
  }
  if (league === "bundesliga" || league === "ligue-1") {
    return {
      intro: "Si dos equipos terminan igualados en puntos, los criterios de desempate son:",
      items: ["Diferencia de goles", "Goles a favor", "Enfrentamiento directo"],
    };
  }
  if (league === "champions-league" || league === "europa-league" || league === "conference-league") {
    const roundsLabel = league === "conference-league" ? "6 jornadas" : "8 jornadas";
    return {
      intro: `En la fase de liga (36 clubes, ${roundsLabel}), el desempate sigue el reglamento UEFA:`,
      items: ["Diferencia de goles", "Goles a favor", "Goles como visitante", "Número de victorias"],
    };
  }
  if (sport === "ice-hockey") {
    return {
      intro: "Criterios de desempate en temporada regular NHL:",
      items: [
        "Victorias en tiempo reglamentario (RW)",
        "Victorias en tiempo reglamentario y tiempo extra (ROW)",
        "Diferencia de goles",
      ],
    };
  }
  if (sport === "basketball" || sport === "american-football" || sport === "baseball") {
    return {
      intro: "Criterios principales de desempate en clasificación:",
      items: [
        "Porcentaje de victorias",
        "Enfrentamiento directo",
        `Diferencia de ${scoringPlural}`,
      ],
    };
  }
  return {
    intro: "Si dos selecciones o equipos están empatados en la clasificación, se utilizan los siguientes criterios de desempate:",
    items: [`Diferencia de ${scoringPlural}`, `${unitCap} a favor`, "Enfrentamiento directo"],
  };
}
