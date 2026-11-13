/**
 * Adaptador de datos de NFL desde los releases públicos de nflverse (CC-BY 4.0).
 *
 * Asset oficial documentado:
 * - URL: https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv
 * - Release tag: `schedules` en `nflverse/nflverse-data`
 * - Licencia: CC-BY 4.0 (atribuida en /legal/creditos).
 * - Restricción (FREE_DATA_STRATEGY.md §1): NO se usa ningún dataset de FTN (CC-BY-SA 4.0)
 *   y se ignora explícitamente la columna `ftn` del CSV.
 */
import { z } from "zod";
import {
  asGameId,
  asLeagueId,
  asSeasonId,
  easternWallTimeToUtcIso,
  type GameDTO,
} from "@pitchlab/contracts";
import type { NflTeamRateInput } from "@pitchlab/engines-reference";
import { listAllTeamsForLeague, resolveCanonicalTeam } from "../mappings.js";

export const NFLVERSE_SCHEDULES_URL =
  "https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv";

export const NflverseCsvRowSchema = z.object({
  game_id: z.string().min(1),
  season: z.coerce.number().int(),
  game_type: z.string().min(1),
  week: z.coerce.number().int().positive(),
  gameday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gametime: z.string().optional().default("13:00"),
  away_team: z.string().min(2),
  away_score: z.string().optional().default(""),
  home_team: z.string().min(2),
  home_score: z.string().optional().default(""),
  location: z.string().optional().default("Home"),
  stadium: z.string().optional().default(""),
});

export type NflverseCsvRow = z.infer<typeof NflverseCsvRowSchema>;

/** Parser de CSV RFC-4180 básico (soporta comillas dobles). */
export function parseCsv(csvText: string): Record<string, string>[] {
  const lines = csvText
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  const splitLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  };

  const headers = splitLine(lines[0]!.replace(/^\uFEFF/, ""));
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitLine(lines[i]!);
    const record: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c]!;
      // Ignorar explícitamente la columna ftn (CC-BY-SA)
      if (key === "ftn") continue;
      record[key] = cols[c] ?? "";
    }
    rows.push(record);
  }

  return rows;
}

export interface NormalizedNflSeason {
  seasonId: string;
  seasonLabel: string;
  activeWeek: number;
  periodLabel: string;
  allGames: GameDTO[];
  activeWeekGames: GameDTO[];
  teamRateInputs: NflTeamRateInput[];
}

export function normalizeNflverseSchedule(
  csvText: string,
  options: { season?: number; referenceDate?: string; targetWeek?: number } = {},
): NormalizedNflSeason {
  const targetSeason = options.season ?? 2026;
  const referenceDate = options.referenceDate ?? "2026-11-08";
  const observedAt = new Date(`${referenceDate}T12:00:00Z`).toISOString();

  const rawRows = parseCsv(csvText);
  const regRows: NflverseCsvRow[] = [];

  for (const r of rawRows) {
    if (String(r.season) !== String(targetSeason)) continue;
    if (r.game_type !== "REG") continue;
    regRows.push(NflverseCsvRowSchema.parse(r));
  }

  if (regRows.length === 0) {
    throw new Error(`No se encontraron partidos de temporada regular ${targetSeason} en nflverse.`);
  }

  const allGames: GameDTO[] = regRows.map((row) => {
    const home = resolveCanonicalTeam("nfl", row.home_team);
    const away = resolveCanonicalTeam("nfl", row.away_team);
    const hasScore = row.home_score.trim() !== "" && row.away_score.trim() !== "";
    const homeScore = hasScore ? Number(row.home_score) : null;
    const awayScore = hasScore ? Number(row.away_score) : null;
    const timePart = row.gametime && /^\d{2}:\d{2}$/.test(row.gametime) ? row.gametime : "13:00";
    const startTime = easternWallTimeToUtcIso(row.gameday, timePart);
    const homeSlug = home.id.split(".")[1]!;
    const awaySlug = away.id.split(".")[1]!;

    return {
      id: asGameId(`nfl-${targetSeason}-w${row.week}-${awaySlug}-${homeSlug}`),
      league: asLeagueId("nfl"),
      season: asSeasonId(`nfl-${targetSeason}`),
      week: row.week,
      round: `Semana ${row.week}`,
      startTime,
      status: hasScore ? "final" : "scheduled",
      home,
      away,
      venue: row.stadium || undefined,
      neutralSite: row.location.toLowerCase() === "neutral",
      result:
        hasScore && homeScore !== null && awayScore !== null
          ? {
              home: homeScore,
              away: awayScore,
              observedAt,
              source: "nflverse",
            }
          : undefined,
    };
  });

  // Determinar semana activa: si se pasa targetWeek se usa esa; si no, la semana que abarca referenceDate
  // o la primera semana con partidos pendientes.
  const weeks = [...new Set(allGames.map((g) => g.week!))].sort((a, b) => a - b);
  let activeWeek = options.targetWeek;
  if (!activeWeek) {
    const weekWithScheduled = weeks.find((w) =>
      allGames.some((g) => g.week === w && g.status === "scheduled"),
    );
    activeWeek = weekWithScheduled ?? weeks[weeks.length - 1]!;
  }

  const activeWeekGames = allGames
    .filter((g) => g.week === activeWeek)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  // Calcular tasas por equipo en la temporada en curso (a favor / en contra / partidos jugados)
  // usando los partidos finalizados de semanas anteriores a activeWeek (sin filtración del futuro)
  // o todos los finalizados previos si estamos en semana 1.
  const allCatalogTeams = listAllTeamsForLeague("nfl");
  const statsMap = new Map<string, { pf: number; pa: number; gp: number }>();
  for (const t of allCatalogTeams) {
    statsMap.set(t.id, { pf: 0, pa: 0, gp: 0 });
  }

  for (const g of allGames) {
    if (g.status === "final" && g.result && (g.week ?? 0) < activeWeek) {
      const hStat = statsMap.get(g.home.id);
      const aStat = statsMap.get(g.away.id);
      if (hStat) {
        hStat.pf += g.result.home;
        hStat.pa += g.result.away;
        hStat.gp += 1;
      }
      if (aStat) {
        aStat.pf += g.result.away;
        aStat.pa += g.result.home;
        aStat.gp += 1;
      }
    }
  }

  const teamRateInputs: NflTeamRateInput[] = allCatalogTeams.map((t) => {
    const st = statsMap.get(t.id) ?? { pf: 0, pa: 0, gp: 0 };
    return {
      teamId: t.id,
      name: t.name,
      shortName: t.shortName,
      code: t.code,
      pointsFor: st.pf,
      pointsAgainst: st.pa,
      gamesPlayed: st.gp,
    };
  });

  return {
    seasonId: `nfl-${targetSeason}`,
    seasonLabel: String(targetSeason),
    activeWeek,
    periodLabel: `Semana ${activeWeek}`,
    allGames,
    activeWeekGames,
    teamRateInputs,
  };
}

export async function fetchNflverseCsv(url: string = NFLVERSE_SCHEDULES_URL): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "PitchLab-Ingest/0.1 (+https://pitchlab.mx)",
    },
  });
  if (!res.ok) {
    throw new Error(`Error descargando nflverse (${res.status}): ${url}`);
  }
  return res.text();
}

/**
 * Partidos de temporada regular de una temporada completa, en el formato del modelo
 * (`NflMatchRow`). Se usa para incorporar la temporada anterior con peso reducido.
 */
export function extractNflSeasonRows(
  csvText: string,
  season: number,
  mapTeamId: (abbreviation: string) => string = (abbr) =>
    resolveCanonicalTeam("nfl", abbr).id,
): Array<{
  week: number;
  date: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
}> {
  const rows: Array<{
    week: number;
    date: string;
    home: string;
    away: string;
    homeScore: number;
    awayScore: number;
  }> = [];

  for (const raw of parseCsv(csvText)) {
    if (String(raw.season) !== String(season)) continue;
    if (raw.game_type !== "REG") continue;
    if (!raw.home_score || !raw.away_score) continue;
    const parsed = NflverseCsvRowSchema.safeParse(raw);
    if (!parsed.success) continue;
    rows.push({
      week: parsed.data.week,
      date: parsed.data.gameday,
      home: mapTeamId(parsed.data.home_team),
      away: mapTeamId(parsed.data.away_team),
      homeScore: Number(parsed.data.home_score),
      awayScore: Number(parsed.data.away_score),
    });
  }

  return rows;
}
