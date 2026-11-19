import fs from "node:fs";
import path from "node:path";
import {
  canonicalPlayerHref,
  canonicalTeamHref,
  COMPETITION_CATALOG,
  isLeagueActiveInWindow,
  LeagueSquadsFileSchema,
  sportForLeague,
  sportHasDraw,
  sportScoringUnit,
  type LeagueId,
} from "@pitchlab/contracts";
import type {
  CompareH2HMatchRow,
  CompareLeagueCatalog,
  CompareMetricRow,
  ComparePlayerCard,
  ComparePlayerOption,
  CompareTeamCard,
  PlayerComparisonPayload,
  TeamComparisonPayload,
} from "@pitchlab/ui/compare";
import { hydratePlayerLivePerformance } from "./player-live-stats";
import { loadLeagueSnapshotEnvelope, resolveSnapshotsRoot, type ProductLeague } from "./snapshots";
import { loadPlayerProfile, loadTeamProfile } from "./team-profile";

export function buildCompareLeagueCatalog(): CompareLeagueCatalog[] {
  const out: CompareLeagueCatalog[] = [];
  const todayIso = new Date().toISOString().slice(0, 10);
  for (const meta of COMPETITION_CATALOG) {
    const env = loadLeagueSnapshotEnvelope(meta.id as ProductLeague);
    const snap = env.data;
    if (!snap) continue;
    // Oculta competencias sin partidos en los próximos 30 días (ni en vivo) del comparador activo.
    const active = isLeagueActiveInWindow(
      snap.games.map((g) => ({
        league: meta.id,
        status: g.status,
        kickoffUtc: g.kickoffUtc,
      })),
      meta.id,
      todayIso,
      30,
    );
    if (!active) continue;
    const seen = new Map<string, { slug: string; name: string; shortName: string; rank: number | null }>();
    (snap.standings ?? []).forEach((row, idx) => {
      const slug = row.teamId.includes(".") ? row.teamId.split(".").slice(1).join(".") : row.teamId;
      if (!seen.has(slug)) {
        seen.set(slug, { slug, name: row.name, shortName: row.shortName, rank: idx + 1 });
      }
    });
    for (const g of snap.games) {
      for (const side of [g.home, g.away]) {
        const slug = side.slug;
        if (slug && !seen.has(slug)) {
          seen.set(slug, { slug, name: side.name, shortName: side.shortName, rank: null });
        }
      }
    }
    const teams = [...seen.values()];
    if (teams.length < 2) continue;
    out.push({
      league: meta.id,
      label: meta.label,
      region: meta.region,
      sport: sportForLeague(meta.id),
      teams,
    });
  }
  return out;
}

export function listComparePlayersForLeague(leagueRaw: string): ComparePlayerOption[] {
  const root = resolveSnapshotsRoot();
  const filePath = path.join(root, leagueRaw, "squads.json");
  if (!fs.existsSync(filePath)) return [];
  try {
    const parsed = LeagueSquadsFileSchema.safeParse(JSON.parse(fs.readFileSync(filePath, "utf8")));
    if (!parsed.success) return [];
    const items: Array<ComparePlayerOption & { priority: number }> = [];
    for (const team of parsed.data.teams) {
      for (const p of team.players) {
        const hasMetrics = (p.seasonMetrics?.length ?? 0) > 0;
        const score =
          (hasMetrics ? 100 : 0) +
          (p.stats.appearances > 0 ? 50 + Math.min(30, p.stats.appearances) : 0) +
          (p.stats.goals + p.stats.assists) * 3 +
          (p.photoKey ? 10 : 0);
        items.push({
          ref: `${team.teamSlug}:${p.slug}`,
          name: p.name,
          shortName: p.shortName,
          teamSlug: team.teamSlug,
          teamName: team.teamName,
          positionLabel: p.positionLabel,
          jersey: p.jersey,
          photoKey: p.photoKey ?? null,
          fallbackPhotoKey: p.fallbackPhotoKey ?? null,
          priority: score,
        });
      }
    }
    items.sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name, "es-MX"));
    return items.slice(0, 120).map(({ priority: _p, ...rest }) => rest);
  } catch (err) {
    void err;
    return [];
  }
}

function toTeamCard(profile: NonNullable<ReturnType<typeof loadTeamProfile>>): CompareTeamCard {
  const st = profile.standing;
  const hasDraw = sportHasDraw(profile.sport);
  const recordLabel = st
    ? hasDraw
      ? `${st.won}G-${st.drawn}E-${st.lost}P`
      : `${st.won}G-${st.lost}P`
    : `${profile.recentAverages.wins}G-${profile.recentAverages.losses}P`;
  const pointsLabel = st
    ? profile.sport === "football" || profile.sport === "ice-hockey"
      ? `${st.points} pts`
      : st.played > 0
        ? `${((st.won / st.played) * 100).toFixed(1)} %`
        : "—"
    : "—";

  return {
    slug: profile.team.slug,
    name: profile.team.name,
    shortName: profile.team.shortName,
    code: profile.team.code,
    rank: st?.rank ?? null,
    recordLabel,
    pointsLabel,
    streak: profile.recentAverages.streak.slice(-5),
    coachName: profile.squad?.coach?.name ?? profile.squad?.coachName ?? null,
    coachPhotoKey: profile.squad?.coach?.photoKey ?? null,
    href: canonicalTeamHref(profile.league, profile.team.slug),
  };
}

export function loadTeamComparison(
  leagueRaw: string,
  teamASlug: string,
  teamBSlug: string,
  options: { fullAccess: boolean },
): TeamComparisonPayload | null {
  if (!teamASlug || !teamBSlug || teamASlug === teamBSlug) return null;
  const profA = loadTeamProfile(leagueRaw, teamASlug, options);
  const profB = loadTeamProfile(leagueRaw, teamBSlug, options);
  if (!profA || !profB) return null;

  const unit = sportScoringUnit(profA.sport);
  const stA = profA.standing;
  const stB = profB.standing;
  const playedA = stA?.played || profA.recentAverages.sampleGames || 0;
  const playedB = stB?.played || profB.recentAverages.sampleGames || 0;

  const winRateA = playedA > 0 ? ((stA?.won ?? profA.recentAverages.wins) / playedA) * 100 : null;
  const winRateB = playedB > 0 ? ((stB?.won ?? profB.recentAverages.wins) / playedB) * 100 : null;
  const gfAvgA =
    stA && stA.played > 0 ? stA.goalsFor / stA.played : profA.recentAverages.scoredAvg;
  const gfAvgB =
    stB && stB.played > 0 ? stB.goalsFor / stB.played : profB.recentAverages.scoredAvg;
  const gaAvgA =
    stA && stA.played > 0 ? stA.goalsAgainst / stA.played : profA.recentAverages.concededAvg;
  const gaAvgB =
    stB && stB.played > 0 ? stB.goalsAgainst / stB.played : profB.recentAverages.concededAvg;
  const diffA = stA ? stA.goalDiff : profA.recentAverages.marginAvg;
  const diffB = stB ? stB.goalDiff : profB.recentAverages.marginAvg;

  const metrics: CompareMetricRow[] = [
    {
      id: "win-rate",
      label: "Efectividad de victorias",
      valueA: winRateA !== null ? `${winRateA.toFixed(1)} %` : "—",
      valueB: winRateB !== null ? `${winRateB.toFixed(1)} %` : "—",
      numA: winRateA,
      numB: winRateB,
    },
    {
      id: "for-avg",
      label: `${unit.plural.charAt(0).toUpperCase()}${unit.plural.slice(1)} a favor / PJ`,
      valueA: gfAvgA !== null ? gfAvgA.toFixed(2) : "—",
      valueB: gfAvgB !== null ? gfAvgB.toFixed(2) : "—",
      numA: gfAvgA,
      numB: gfAvgB,
    },
    {
      id: "against-avg",
      label: `${unit.plural.charAt(0).toUpperCase()}${unit.plural.slice(1)} en contra / PJ`,
      valueA: gaAvgA !== null ? gaAvgA.toFixed(2) : "—",
      valueB: gaAvgB !== null ? gaAvgB.toFixed(2) : "—",
      numA: gaAvgA,
      numB: gaAvgB,
      lowerIsBetter: true,
    },
    {
      id: "diff",
      label: "Diferencial neto",
      valueA: diffA !== null ? `${diffA > 0 ? "+" : ""}${Number.isInteger(diffA) ? diffA : diffA.toFixed(1)}` : "—",
      valueB: diffB !== null ? `${diffB > 0 ? "+" : ""}${Number.isInteger(diffB) ? diffB : diffB.toFixed(1)}` : "—",
      numA: diffA,
      numB: diffB,
    },
  ];

  if (profA.sport === "football") {
    const csA = profA.recentAverages.cleanSheets;
    const csB = profB.recentAverages.cleanSheets;
    metrics.push({
      id: "clean-sheets",
      label: "Arco en cero (reciente)",
      valueA: csA !== null ? `${csA}` : "—",
      valueB: csB !== null ? `${csB}` : "—",
      numA: csA,
      numB: csB,
    });
  }

  // Historial directo real (H2H) desde `profA.recentMatches` filtrando rival === teamB
  const directMatches = profA.recentMatches
    .filter((m) => m.opponent.slug === profB.team.slug)
    .slice(0, 8);

  let winsA = 0;
  let draws = 0;
  let winsB = 0;
  const h2hMatches: CompareH2HMatchRow[] = directMatches.map((m) => {
    const winner: "A" | "B" | "draw" =
      m.outcome === "G" ? "A" : m.outcome === "P" ? "B" : "draw";
    if (winner === "A") winsA += 1;
    else if (winner === "B") winsB += 1;
    else draws += 1;

    return {
      id: m.id,
      dateLabel: m.dateLabel,
      round: m.round,
      homeName: m.isHome ? profA.team.shortName : profB.team.shortName,
      awayName: m.isHome ? profB.team.shortName : profA.team.shortName,
      homeScore: m.isHome ? m.teamScore : m.opponentScore,
      awayScore: m.isHome ? m.opponentScore : m.teamScore,
      winner,
      gameHref: m.gameHref,
    };
  });

  return {
    league: profA.league,
    leagueLabel: profA.leagueLabel,
    sport: profA.sport,
    seasonLabel: profA.seasonLabel,
    teamA: toTeamCard(profA),
    teamB: toTeamCard(profB),
    metrics,
    h2hSummary: {
      played: h2hMatches.length,
      winsA,
      draws,
      winsB,
    },
    h2hMatches,
  };
}

function parseNumericMetric(raw: string): number | null {
  const cleaned = raw.replace(/[,%]/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function toPlayerCard(
  profile: NonNullable<ReturnType<typeof loadPlayerProfile>>,
): ComparePlayerCard {
  const p = profile.player;
  return {
    ref: `${profile.team.slug}:${p.slug}`,
    name: p.name,
    shortName: p.shortName,
    teamSlug: profile.team.slug,
    teamName: profile.team.name,
    positionLabel: p.positionLabel,
    jersey: p.jersey,
    age: p.age,
    heightCm: p.heightCm,
    weightKg: p.weightKg,
    nationality: p.nationality,
    photoKey: p.photoKey ?? null,
    fallbackPhotoKey: p.fallbackPhotoKey ?? null,
    href: canonicalPlayerHref(profile.league, profile.team.slug, p.slug),
  };
}

export async function loadPlayerComparison(
  leagueRaw: string,
  playerARef: string,
  playerBRef: string,
  options: { fullAccess: boolean },
): Promise<PlayerComparisonPayload | null> {
  const parseRef = (ref: string): { teamSlug: string; playerSlug: string } | null => {
    const [teamSlug, playerSlug] = ref.split(":");
    if (!teamSlug || !playerSlug) return null;
    return { teamSlug, playerSlug };
  };
  const aRef = parseRef(playerARef);
  const bRef = parseRef(playerBRef);
  if (!aRef || !bRef) return null;

  const rawA = loadPlayerProfile(leagueRaw, aRef.teamSlug, aRef.playerSlug, options);
  const rawB = loadPlayerProfile(leagueRaw, bRef.teamSlug, bRef.playerSlug, options);
  if (!rawA || !rawB) return null;

  const [profA, profB] = await Promise.all([
    hydratePlayerLivePerformance(rawA),
    hydratePlayerLivePerformance(rawB),
  ]);

  const metrics: CompareMetricRow[] = [];
  const pA = profA.player;
  const pB = profB.player;

  if (
    (pA.seasonMetrics && pA.seasonMetrics.length > 0) ||
    (pB.seasonMetrics && pB.seasonMetrics.length > 0)
  ) {
    const mapA = new Map((pA.seasonMetrics ?? []).map((m) => [m.key, m]));
    const mapB = new Map((pB.seasonMetrics ?? []).map((m) => [m.key, m]));
    const keys = [...new Set([...mapA.keys(), ...mapB.keys()])].slice(0, 6);
    for (const k of keys) {
      const mA = mapA.get(k);
      const mB = mapB.get(k);
      const label = mA?.label ?? mB?.label ?? k;
      const lowerIsBetter = k === "era" || k === "whip" || k === "int" || k === "l";
      metrics.push({
        id: k,
        label,
        valueA: mA?.value ?? "—",
        valueB: mB?.value ?? "—",
        numA: mA ? parseNumericMetric(mA.value) : null,
        numB: mB ? parseNumericMetric(mB.value) : null,
        lowerIsBetter,
      });
    }
  } else if (profA.sport === "football") {
    const rows: Array<{
      id: string;
      label: string;
      a: number;
      b: number;
      lowerIsBetter?: boolean;
    }> = [
      { id: "app", label: "Apariciones", a: pA.stats.appearances, b: pB.stats.appearances },
      { id: "goals", label: "Goles", a: pA.stats.goals, b: pB.stats.goals },
      { id: "assists", label: "Asistencias", a: pA.stats.assists, b: pB.stats.assists },
      {
        id: "ga",
        label: "Producción (G + A)",
        a: pA.stats.goals + pA.stats.assists,
        b: pB.stats.goals + pB.stats.assists,
      },
      { id: "shots", label: "Tiros totales", a: pA.stats.shots, b: pB.stats.shots },
      { id: "sot", label: "Tiros a puerta", a: pA.stats.shotsOnTarget, b: pB.stats.shotsOnTarget },
      {
        id: "cards",
        label: "Tarjetas amarillas",
        a: pA.stats.yellowCards,
        b: pB.stats.yellowCards,
        lowerIsBetter: true,
      },
    ];
    for (const r of rows) {
      metrics.push({
        id: r.id,
        label: r.label,
        valueA: String(r.a),
        valueB: String(r.b),
        numA: r.a,
        numB: r.b,
        lowerIsBetter: r.lowerIsBetter,
      });
    }
  }

  return {
    league: profA.league,
    leagueLabel: profA.leagueLabel,
    sport: profA.sport,
    seasonLabel: profA.seasonLabel,
    playerA: toPlayerCard(profA),
    playerB: toPlayerCard(profB),
    metrics,
  };
}
