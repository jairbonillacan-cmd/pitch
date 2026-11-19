/**
 * Cargador SSR de tendencias de jugadores («Últimos 5 / 10 / 20» vs línea deslizable)
 * leyendo exclusivamente actuaciones reales verificadas en `data/snapshots/<league>/squads.json`.
 */
import fs from "node:fs";
import path from "node:path";
import {
  COMPETITION_BY_ID,
  LeagueSquadsFileSchema,
  asLeagueId,
  canonicalPlayerHref,
  sportForLeague,
  type LeagueId,
  type PlatformSport,
} from "@pitchlab/contracts";
import type { PlayerPropStreakCardProps, PropMetricSeries } from "@pitchlab/ui/platform";
import { PRODUCT_LEAGUES, resolveSnapshotsRoot, type ProductLeague } from "./snapshots";

export interface ExplorerStreakCard extends PlayerPropStreakCardProps {
  readonly id: string;
  readonly sport: PlatformSport;
  readonly leagueLabel: string;
}

const METRIC_PRIORITY: Record<PlatformSport, readonly string[]> = {
  football: ["Tiros a puerta", "Tiros", "Goles", "Asistencias", "Faltas", "Amarillas"],
  basketball: ["PTS", "REB", "AST", "3PM", "Puntos", "Rebotes", "Asistencias"],
  "american-football": ["Yds", "Rec", "TD", "Car", "Cmp", "Pass Yds", "Rush Yds", "Rec Yds"],
  "ice-hockey": ["SOG", "PTS", "G", "A", "Tiros", "Puntos", "Goles"],
  baseball: ["H", "TB", "K", "R", "RBI", "HR", "Hits", "Ponches"],
};

function parseNumericStat(raw: string): number | null {
  const trimmed = raw.trim().replace(",", ".");
  if (!trimmed || trimmed === "-" || trimmed === "—") return null;
  if (trimmed.includes("/")) {
    const first = Number(trimmed.split("/")[0]);
    return Number.isFinite(first) && first >= 0 ? first : null;
  }
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function defaultLineFromValues(values: readonly number[]): {
  defaultLine: number;
  minLine: number;
  maxLine: number;
  step: number;
} {
  const avg = values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
  const maxVal = Math.max(...values, 1);
  if (maxVal >= 40) {
    const step = 5;
    const base = Math.max(4.5, Math.floor(avg / step) * step - 0.5);
    return {
      defaultLine: base,
      minLine: Math.max(0.5, base - 25),
      maxLine: Math.ceil(maxVal / step) * step + 4.5,
      step,
    };
  }
  if (maxVal >= 12) {
    const step = 1;
    const base = Math.max(0.5, Math.floor(avg) - 0.5);
    return {
      defaultLine: base,
      minLine: Math.max(0.5, base - 6),
      maxLine: Math.ceil(maxVal) + 2.5,
      step,
    };
  }
  const base = Math.max(0.5, Math.floor(avg) + 0.5);
  return {
    defaultLine: base,
    minLine: 0.5,
    maxLine: Math.max(3.5, Math.ceil(maxVal) + 0.5),
    step: 0.5,
  };
}

let cachedExplorer: { at: number; items: ExplorerStreakCard[] } | null = null;
const EXPLORER_TTL_MS = 10 * 60_000;

export function loadPlayerPropStreakCards(maxCards = 36): ExplorerStreakCard[] {
  const now = Date.now();
  if (cachedExplorer && now - cachedExplorer.at < EXPLORER_TTL_MS) {
    return cachedExplorer.items.slice(0, maxCards);
  }

  const root = resolveSnapshotsRoot();
  const cards: ExplorerStreakCard[] = [];
  const prioritizedLeagues: readonly ProductLeague[] = [
    "nba",
    "nfl",
    "mlb",
    "nhl",
    "liga-mx",
    "premier-league",
    "laliga",
    "champions-league",
    "mls",
    ...PRODUCT_LEAGUES,
  ];
  const seenLeagues = new Set<string>();

  for (const lg of prioritizedLeagues) {
    if (seenLeagues.has(lg)) continue;
    seenLeagues.add(lg);
    const squadsPath = path.join(root, lg, "squads.json");
    if (!fs.existsSync(squadsPath)) continue;

    let perLeagueCount = 0;
    try {
      const parsed = LeagueSquadsFileSchema.safeParse(JSON.parse(fs.readFileSync(squadsPath, "utf8")));
      if (!parsed.success) continue;
      const leagueId = asLeagueId(lg) as LeagueId;
      const sport = sportForLeague(lg);
      const leagueLabel = COMPETITION_BY_ID[lg]?.label ?? lg;
      const prefLabels = METRIC_PRIORITY[sport] ?? [];

      for (const team of parsed.data.teams) {
        for (const player of team.players) {
          const logs = player.recentGames;
          if (!logs || logs.length < 3) continue;

          const statLabels = Array.from(
            new Set(logs.flatMap((g) => g.stats.map((s) => s.label))),
          );
          const orderedLabels = [
            ...prefLabels.filter((lbl) => statLabels.includes(lbl)),
            ...statLabels.filter((lbl) => !prefLabels.includes(lbl)),
          ].slice(0, 4);

          const series: PropMetricSeries[] = [];
          for (const lbl of orderedLabels) {
            const pts = logs
              .slice()
              .reverse()
              .map((g) => {
                const hit = g.stats.find((s) => s.label === lbl);
                const val = hit ? parseNumericStat(hit.value) : null;
                if (val === null) return null;
                return {
                  label: (g.opponentAbbr ?? g.opponent).slice(0, 8),
                  opponent: g.opponent,
                  date: g.dateIso,
                  value: val,
                };
              })
              .filter((p): p is NonNullable<typeof p> => p !== null);

            if (pts.length < 3) continue;
            const values = pts.map((p) => p.value);
            if (Math.max(...values) <= 0) continue;
            const bounds = defaultLineFromValues(values);
            series.push({
              key: lbl.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
              label: lbl,
              unit: lbl.toLowerCase(),
              defaultLine: bounds.defaultLine,
              minLine: bounds.minLine,
              maxLine: bounds.maxLine,
              step: bounds.step,
              points: pts,
            });
          }

          if (series.length === 0) continue;

          cards.push({
            id: `${lg}:${team.teamSlug}:${player.slug}`,
            sport,
            league: leagueId,
            leagueLabel,
            playerName: player.name,
            teamName: team.teamName,
            teamSlug: team.teamSlug,
            photoKey: player.photoKey,
            positionLabel: player.positionLabel,
            series,
            playerHref: canonicalPlayerHref(leagueId, team.teamSlug, player.slug),
          });
          perLeagueCount += 1;
          if (perLeagueCount >= 6) break;
        }
        if (perLeagueCount >= 6) break;
      }
    } catch (err) {
      void err;
    }

    if (cards.length >= 48) break;
  }

  cachedExplorer = { at: now, items: cards };
  return cards.slice(0, maxCards);
}
