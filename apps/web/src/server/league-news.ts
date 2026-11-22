import fs from "node:fs";
import path from "node:path";
import {
  canonicalGameHref,
  canonicalTeamHref,
  LeagueInjuriesFileSchema,
  MarketPulseFileSchema,
  toMarketPulseView,
  type LeagueSnapshot,
} from "@pitchlab/contracts";
import {
  getBzzoiroTeamEmblemUrl,
  getOfficialEspnTeamLogoUrl,
} from "@pitchlab/sports-assets";
import type { LeagueNewsItem } from "@pitchlab/ui/types";
import { fetchEspnLeagueNews } from "./espn-news";
import { logSecurityEvent } from "./safe-logger";
import {
  LEAGUE_LABELS,
  loadRawLeagueSnapshot,
  resolveSnapshotsRoot,
  type ProductLeague,
} from "./snapshots";

const FORBIDDEN_RE =
  /\b(dixon-coles|poisson|lightgbm|platt|pitágoras|log5|nflverse|openfootball|api-football|api-sports|bzzoiro|sofascore|sportmonks|espncdn|flagcdn|polymarket|kalshi|understat|espn)\b/gi;

function sanitizeCopy(text: string): string {
  return text.replace(FORBIDDEN_RE, "PitchLab").replace(/\s{2,}/g, " ").trim();
}

const DATE_SHORT_MX = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City",
  weekday: "short",
  day: "numeric",
  month: "short",
});

const TIME_SHORT_MX = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function formatTimestampEs(iso: string | undefined): string {
  if (!iso) return "Corte vigente";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "Corte vigente";
  return `${DATE_SHORT_MX.format(ms)} · ${TIME_SHORT_MX.format(ms)}`;
}

function teamLogoOf(league: string, slug: string): string | undefined {
  return (
    getBzzoiroTeamEmblemUrl(league, slug) ??
    getOfficialEspnTeamLogoUrl(league, slug) ??
    undefined
  );
}

function teamSlugFromId(teamId: string): string {
  return teamId.includes(".") ? teamId.split(".").slice(1).join(".") : teamId;
}

function formatTeamFromSlug(slug: string): string {
  return slug
    .split("-")
    .map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function loadStandingNews(
  league: ProductLeague,
  snapshot: LeagueSnapshot,
): LeagueNewsItem[] {
  const standings = snapshot.standings ?? [];
  if (standings.length < 2) return [];
  const leagueLabel = LEAGUE_LABELS[league] ?? league;
  const leader = standings[0]!;
  const runnerUp = standings[1]!;
  const isNfl = league === "nfl";
  const isNba = league === "nba";
  const isNhl = league === "nhl";
  const isMlb = league === "mlb";
  const usesWinPct = isNfl || isNba || isMlb;
  const unitPlural = isNfl || isNba ? "puntos" : isMlb ? "carreras" : "goles";
  const unitCode = isNfl || isNba ? "PF" : isMlb ? "C" : "GF";
  const againstCode = isNfl || isNba ? "PC" : isMlb ? "CA" : "GC";
  const leaderWinPct =
    leader.winPct ??
    (leader.played > 0 ? (leader.won + 0.5 * leader.drawn) / leader.played : 0);
  const pctStr = leaderWinPct >= 1 ? "1.000" : leaderWinPct.toFixed(3).replace(/^0/, "");
  const gap = leader.points - runnerUp.points;
  const leaderSlug = teamSlugFromId(leader.teamId);
  const topScorer = standings
    .slice()
    .sort((a, b) => b.goalsFor - a.goalsFor)[0];
  const updatedLabel = formatTimestampEs(snapshot.updatedAt);

  const leaderRecord = isNfl
    ? `${leader.won}–${leader.lost}${leader.drawn > 0 ? `–${leader.drawn}` : ""}`
    : isNhl
      ? `${leader.won}–${leader.lost}–${leader.otLosses ?? 0}`
      : `${leader.won}–${leader.lost}`;

  const items: LeagueNewsItem[] = [
    {
      id: `${league}-news-leader`,
      category: "jornada",
      categoryLabel: "Tabla y liderato",
      title: usesWinPct
        ? `${leader.name} lidera ${leagueLabel} con marca ${leaderRecord} (${pctStr})`
        : `${leader.name} lidera ${leagueLabel} con ${leader.points} puntos`,
      summary: sanitizeCopy(
        usesWinPct
          ? `Registra ${leader.won} victorias y ${leader.lost} derrotas en ${leader.played} ${isMlb ? "juegos" : "partidos"} (${leader.goalsFor} ${unitCode} / ${leader.goalsAgainst} ${againstCode}), por delante de ${runnerUp.name}.`
          : gap > 0
            ? `Suma ${leader.won} victorias${isNhl ? `, ${leader.otLosses ?? 0} en tiempo extra` : ` y ${leader.drawn} empates`} y ${leader.lost} derrotas en ${leader.played} partidos (${leader.goalsFor} ${unitCode} / ${leader.goalsAgainst} ${againstCode}), con +${gap} ${gap === 1 ? "punto" : "puntos"} sobre ${runnerUp.name}.`
            : `Comparte la cima en puntos (${leader.points}) junto a ${runnerUp.name} tras ${leader.played} partidos disputados en ${leagueLabel}.`,
      ),
      publishedAtLabel: updatedLabel,
      badge: usesWinPct ? `1.º · ${leaderRecord}` : `1.º · ${leader.points} pts`,
      team: {
        slug: leaderSlug,
        name: leader.name,
        logoUrl: teamLogoOf(league, leaderSlug),
      },
      href: canonicalTeamHref(league, leaderSlug),
      ctaLabel: `Ver perfil de ${leader.shortName || leader.name}`,
    },
  ];

  if (topScorer && topScorer.goalsFor > 0) {
    const atkSlug = teamSlugFromId(topScorer.teamId);
    items.push({
      id: `${league}-news-attack`,
      category: "jornada",
      categoryLabel: "Producción ofensiva",
      title: `${topScorer.name} registra la mejor ofensiva (${topScorer.goalsFor} ${unitPlural})`,
      summary: sanitizeCopy(
        `Promedia ${(topScorer.goalsFor / Math.max(1, topScorer.played)).toFixed(2)} ${unitPlural} por ${isMlb ? "juego" : "partido"} tras ${topScorer.played} encuentros en ${leagueLabel}.`,
      ),
      publishedAtLabel: updatedLabel,
      badge: `${topScorer.goalsFor} ${unitCode}`,
      team: {
        slug: atkSlug,
        name: topScorer.name,
        logoUrl: teamLogoOf(league, atkSlug),
      },
      href: canonicalTeamHref(league, atkSlug),
      ctaLabel: `Ver ${topScorer.shortName || topScorer.name}`,
    });
  }

  return items;
}

function loadInjuryNews(
  league: ProductLeague,
  snapshot: LeagueSnapshot,
): LeagueNewsItem[] {
  const file = path.join(resolveSnapshotsRoot(), league, "injuries.json");
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = LeagueInjuriesFileSchema.parse(
      JSON.parse(fs.readFileSync(file, "utf8")),
    );
    if (!parsed.entries.length) return [];

    const teamInfoById = new Map<
      string,
      { name: string; shortName: string; slug: string; gameId?: string; oppName?: string; kickoffLabel?: string }
    >();
    for (const g of snapshot.games) {
      const kickoffLabel = formatTimestampEs(g.startTime);
      teamInfoById.set(g.home.id, {
        name: g.home.name,
        shortName: g.home.shortName,
        slug: teamSlugFromId(g.home.id),
        gameId: g.id,
        oppName: g.away.shortName || g.away.name,
        kickoffLabel,
      });
      teamInfoById.set(g.away.id, {
        name: g.away.name,
        shortName: g.away.shortName,
        slug: teamSlugFromId(g.away.id),
        gameId: g.id,
        oppName: g.home.shortName || g.home.name,
        kickoffLabel,
      });
    }

    const grouped = new Map<
      string,
      Array<{
        player: string;
        position?: string;
        status: string;
        detail?: string;
        reportedAt?: string;
      }>
    >();

    for (const entry of parsed.entries) {
      const bucket = grouped.get(entry.teamId) ?? [];
      bucket.push(entry);
      grouped.set(entry.teamId, bucket);
    }

    return Array.from(grouped.entries())
      .map(([teamId, entries]) => {
        const bajas = entries.filter((e) => /baja|out/i.test(e.status));
        const dudas = entries.filter((e) => !/baja|out/i.test(e.status));
        const slug = teamInfoById.get(teamId)?.slug ?? teamSlugFromId(teamId);
        const name = teamInfoById.get(teamId)?.name ?? formatTeamFromSlug(slug);
        const oppName = teamInfoById.get(teamId)?.oppName;
        const kickoffLabel = teamInfoById.get(teamId)?.kickoffLabel;
        const gameId = teamInfoById.get(teamId)?.gameId;
        const notable = [...bajas, ...dudas]
          .slice(0, 3)
          .map((e) =>
            [
              e.position ? `${e.player} (${e.position})` : e.player,
              e.detail || e.status,
            ].join(" — "),
          );
        const priorityScore = bajas.length * 3 + dudas.length;
        return {
          priorityScore,
          item: {
            id: `${league}-inj-${teamId}`,
            category: "lesiones" as const,
            categoryLabel: "Parte médico",
            title: sanitizeCopy(
              `${name}: ${bajas.length > 0 ? `${bajas.length} ${bajas.length === 1 ? "baja" : "bajas"}` : ""}${bajas.length > 0 && dudas.length > 0 ? " y " : ""}${dudas.length > 0 ? `${dudas.length} ${dudas.length === 1 ? "duda" : "dudas"}` : ""} reportadas`,
            ),
            summary: sanitizeCopy(
              `${oppName ? `Rumbo al duelo frente a ${oppName}${kickoffLabel ? ` (${kickoffLabel})` : ""}: ` : ""}${notable.join("; ")}.`,
            ),
            publishedAtLabel: formatTimestampEs(
              entries[0]?.reportedAt ?? parsed.observedAt,
            ),
            badge:
              bajas.length > 0 ? `${bajas.length} bajas` : `${dudas.length} dudas`,
            team: {
              slug,
              name,
              logoUrl: teamLogoOf(league, slug),
            },
            href: (() => {
              const g = gameId ? snapshot.games.find((x) => String(x.id) === String(gameId)) : undefined;
              return g
                ? canonicalGameHref(league, {
                    id: g.id,
                    home: { slug: g.home.id, name: g.home.name, shortName: g.home.shortName },
                    away: { slug: g.away.id, name: g.away.name, shortName: g.away.shortName },
                  })
                : canonicalTeamHref(league, slug);
            })(),
            ctaLabel: gameId ? "Ver impacto en el partido" : `Ver perfil de ${name}`,
          },
        };
      })
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .slice(0, 6)
      .map((x) => x.item);
  } catch (err) {
    logSecurityEvent("warn", "league_news_injuries_read_failed", { league, error: err });
    return [];
  }
}

function loadMarketNews(
  league: ProductLeague,
  snapshot: LeagueSnapshot,
): LeagueNewsItem[] {
  const file = path.join(resolveSnapshotsRoot(), league, "market-pulse.json");
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = MarketPulseFileSchema.parse(
      JSON.parse(fs.readFileSync(file, "utf8")),
    );
    const gamesById = new Map(snapshot.games.map((g) => [String(g.id), g]));
    const items: Array<{ weight: number; item: LeagueNewsItem }> = [];

    for (const entry of parsed.entries) {
      const game = gamesById.get(entry.gameId);
      if (!game || game.status === "final") continue;
      const view = toMarketPulseView(entry);
      if (view.thin) continue;
      const homePct = Math.round((view.sides.find((s) => s.side === "home")?.share ?? 0) * 100);
      const awayPct = Math.round((view.sides.find((s) => s.side === "away")?.share ?? 0) * 100);
      const drawPct = Math.round((view.sides.find((s) => s.side === "draw")?.share ?? 0) * 100);
      const totalVol = view.totalVolume;
      const favSide =
        awayPct > homePct && awayPct >= drawPct
          ? {
              name: game.away.shortName || game.away.name,
              slug: teamSlugFromId(game.away.id),
              share: awayPct,
            }
          : {
              name: game.home.shortName || game.home.name,
              slug: teamSlugFromId(game.home.id),
              share: homePct,
            };

      const volLabel =
        totalVol >= 1_000_000
          ? `${(totalVol / 1_000_000).toFixed(2)}M`
          : totalVol >= 1_000
            ? `${Math.round(totalVol / 1_000)}k`
            : `${Math.round(totalVol)}`;

      items.push({
        weight: totalVol,
        item: {
          id: `${league}-mkt-${game.id}`,
          category: "mercado",
          categoryLabel: "Pulso de mercado",
          title: sanitizeCopy(
            `Flujo activo en ${game.home.shortName} vs ${game.away.shortName}`,
          ),
          summary: sanitizeCopy(
            `El pulso observado concentra ${favSide.share} % del volumen hacia ${favSide.name} (${game.home.shortName} ${homePct} % · ${game.away.shortName} ${awayPct} %) para el ${formatTimestampEs(game.startTime)}.`,
          ),
          publishedAtLabel: formatTimestampEs(entry.observedAt),
          badge: totalVol > 500 ? `Vol. ${volLabel}` : `${favSide.share} % flujo`,
          team: {
            slug: favSide.slug,
            name: favSide.name,
            logoUrl: teamLogoOf(league, favSide.slug),
          },
          href: canonicalGameHref(league, {
            id: game.id,
            home: { slug: game.home.id, name: game.home.name, shortName: game.home.shortName },
            away: { slug: game.away.id, name: game.away.name, shortName: game.away.shortName },
          }),
          ctaLabel: "Abrir análisis del partido",
        },
      });
    }

    return items
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 4)
      .map((x) => x.item);
  } catch (err) {
    logSecurityEvent("warn", "league_news_market_pulse_read_failed", { league, error: err });
    return [];
  }
}

function loadAnalysisAndResultNews(
  league: ProductLeague,
  snapshot: LeagueSnapshot,
  fullAccess: boolean,
): LeagueNewsItem[] {
  const items: LeagueNewsItem[] = [];

  if (fullAccess) {
    const upcomingWithAnalysis = snapshot.games
      .filter((g) => g.status !== "final" && snapshot.analyses[g.id])
      .map((g) => ({
        game: g,
        analysis: snapshot.analyses[g.id]!,
        confScore: snapshot.analyses[g.id]?.confidence?.score ?? 0,
      }))
      .sort((a, b) => b.confScore - a.confScore)
      .slice(0, 4);

    for (const { game, analysis } of upcomingWithAnalysis) {
      const [ph, , pa] = analysis.x12 ?? [0.5, 0, 0.5];
      const homeFav = ph >= pa;
      const favTeam = homeFav ? game.home : game.away;
      const favSlug = teamSlugFromId(favTeam.id);
      const favPct = Math.round(Math.max(ph, pa) * 100);
      const keyFactors = (analysis.factors ?? [])
        .slice(0, 2)
        .map((f) => `${f.label}: ${f.value}`)
        .join(" · ");

      items.push({
        id: `${league}-ana-${game.id}`,
        category: "analisis",
        categoryLabel: "Claves del modelo",
        title: sanitizeCopy(
          `${game.home.name} vs ${game.away.name}: foco en ${favTeam.shortName || favTeam.name} (${favPct} %)`,
        ),
        summary: sanitizeCopy(
          keyFactors
            ? `${keyFactors}. ${analysis.projection ? `Proyección de marcador: ${analysis.projection.home.toFixed(1)} – ${analysis.projection.away.toFixed(1)}.` : ""}`
            : `Lectura previa publicada para el ${formatTimestampEs(game.startTime)}.`,
        ),
        publishedAtLabel: formatTimestampEs(game.startTime),
        badge: `${favPct} %`,
        team: {
          slug: favSlug,
          name: favTeam.name,
          logoUrl: teamLogoOf(league, favSlug),
        },
        href: canonicalGameHref(league, {
          id: game.id,
          home: { slug: game.home.id, name: game.home.name, shortName: game.home.shortName },
          away: { slug: game.away.id, name: game.away.name, shortName: game.away.shortName },
        }),
        ctaLabel: "Ver partido y análisis IA",
      });
    }
  }

  const recentFinals = snapshot.games
    .filter((g) => g.status === "final" && g.result)
    .sort((a, b) => b.startTime.localeCompare(a.startTime))
    .slice(0, 4);

  for (const game of recentFinals) {
    const res = game.result!;
    const winner =
      res.home > res.away ? game.home : res.away > res.home ? game.away : game.home;
    const winnerSlug = teamSlugFromId(winner.id);
    items.push({
      id: `${league}-res-${game.id}`,
      category: "resultados",
      categoryLabel: "Resultado verificado FT",
      title: sanitizeCopy(
        `${game.home.shortName || game.home.name} ${res.home} – ${res.away} ${game.away.shortName || game.away.name}`,
      ),
      summary: sanitizeCopy(
        res.home === res.away
          ? `Empate oficial cerrado en ${game.venue ?? game.round ?? LEAGUE_LABELS[league] ?? league}.`
          : `Triunfo oficial de ${winner.name} (${game.round ?? formatTimestampEs(game.startTime)}).`,
      ),
      publishedAtLabel: formatTimestampEs(game.startTime),
      badge: "Final FT",
      team: {
        slug: winnerSlug,
        name: winner.name,
        logoUrl: teamLogoOf(league, winnerSlug),
      },
      href: canonicalGameHref(league, {
        id: game.id,
        home: { slug: game.home.id, name: game.home.name, shortName: game.home.shortName },
        away: { slug: game.away.id, name: game.away.name, shortName: game.away.shortName },
      }),
      ctaLabel: "Ver ficha del resultado",
    });
  }

  return items;
}

export async function loadLeagueNews(
  league: ProductLeague,
  fullAccess: boolean,
): Promise<LeagueNewsItem[]> {
  const snapshot = loadRawLeagueSnapshot(league);
  const liveHeadlines = await fetchEspnLeagueNews(league, snapshot);
  if (!snapshot) return liveHeadlines.slice(0, 14);

  const localSignals: LeagueNewsItem[] = [
    ...(fullAccess ? loadInjuryNews(league, snapshot) : []),
    ...(fullAccess ? loadMarketNews(league, snapshot) : []),
    ...loadStandingNews(league, snapshot),
    ...loadAnalysisAndResultNews(league, snapshot, fullAccess),
  ];

  return [...liveHeadlines, ...localSignals].slice(0, 16);
}
