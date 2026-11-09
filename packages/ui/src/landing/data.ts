/**
 * Datos de la landing «Pregunta un partido», derivados de los snapshots reales
 * (`data/snapshots/<liga>/latest.json`). Puro: lo usan la app (servidor) y Storybook.
 */

export interface LvTeam {
  slug: string;
  name: string;
  short: string;
  code: string;
}

export interface LvOutcome {
  label: string;
  /** Etiqueta corta para la leyenda: «Local», «Empate», «Visita». */
  short: string;
  p: number;
  fairOdds: number;
}

export interface LvMatch {
  id: string;
  league: string;
  leagueLabel: string;
  round: string;
  kickoff: string;
  venue?: string;
  status: "scheduled" | "final";
  result?: { home: number; away: number };
  home: LvTeam;
  away: LvTeam;
  outcomes: LvOutcome[];
  /** Dos mercados de contexto (goles y ambos anotan, o total en NFL). */
  extras: { label: string; p: number }[];
  likelyScore?: string;
  factors: { label: string; value: string; detail?: string }[];
  publishedAt: string;
  modelLabel: string;
}

export interface LvLeague {
  slug: string;
  label: string;
  round: string;
  updatedAt: string;
  /** Próximos partidos con análisis, ordenados por hora. */
  upcoming: LvMatch[];
  /** Partidos ya jugados con el análisis publicado antes del inicio. */
  finals: LvMatch[];
}

/* ---------- Forma mínima del snapshot que se lee (no todo el contrato) ---------- */
interface SnapTeam {
  id: string;
  name: string;
  shortName?: string;
  code?: string;
}
interface SnapGame {
  id: string;
  league: string;
  round?: string;
  startTime: string;
  status: string;
  venue?: string;
  home: SnapTeam;
  away: SnapTeam;
  result?: { home: number; away: number };
}
interface SnapRow {
  market: string;
  selection: string;
  label: string;
  p: number;
  fairOdds: number;
  line?: number;
}
interface SnapAnalysis {
  model?: { label?: string };
  marketGroups?: { group: string; rows: SnapRow[] }[];
  mostLikelyScore?: { home: number; away: number };
  factors?: { label: string; value?: string; detail?: string }[];
  publishedAt: string;
}
export interface LandingSnapshot {
  league: string;
  periodLabel?: string;
  updatedAt: string;
  games: SnapGame[];
  analyses: Record<string, SnapAnalysis>;
}

const LEAGUE_LABELS: Record<string, string> = {
  "liga-mx": "Liga MX",
  "premier-league": "Premier League",
  laliga: "LaLiga",
  bundesliga: "Bundesliga",
  "serie-a": "Serie A",
  "ligue-1": "Ligue 1",
  nfl: "NFL",
  nhl: "NHL",
  mlb: "MLB",
};

export function leagueLabel(slug: string): string {
  return LEAGUE_LABELS[slug] ?? slug;
}

function team(t: SnapTeam): LvTeam {
  const slug = t.id.includes(".") ? t.id.slice(t.id.indexOf(".") + 1) : t.id;
  return {
    slug,
    name: t.name,
    short: t.shortName ?? t.name,
    code: t.code ?? (t.shortName ?? t.name).slice(0, 3).toUpperCase(),
  };
}

const SHORTS: Record<string, string> = { home: "Local", draw: "Empate", away: "Visita" };

function toMatch(game: SnapGame, a: SnapAnalysis, label: string): LvMatch {
  const rows = a.marketGroups?.flatMap((g) => g.rows) ?? [];
  const h2h = rows.filter((r) => r.market === "h2h" && r.p > 0);
  const find = (market: string, selection: string) =>
    rows.find((r) => r.market === market && r.selection === selection);
  const extras = [
    find("totals", "over_2.5"),
    find("btts", "yes"),
  ].filter((r): r is SnapRow => Boolean(r));
  const extrasLabeled = extras.map((r) => ({
    label: r.market === "btts" ? "Ambos anotan" : `${r.label} goles`,
    p: r.p,
  }));
  return {
    id: game.id,
    league: game.league,
    leagueLabel: label,
    round: game.round ?? "",
    kickoff: game.startTime,
    venue: game.venue,
    status: game.status === "final" ? "final" : "scheduled",
    result: game.result ? { home: game.result.home, away: game.result.away } : undefined,
    home: team(game.home),
    away: team(game.away),
    outcomes: h2h.map((r) => ({
      label: r.label,
      short: SHORTS[r.selection] ?? r.label,
      p: r.p,
      fairOdds: r.fairOdds,
    })),
    extras: extrasLabeled,
    likelyScore: a.mostLikelyScore
      ? `${a.mostLikelyScore.home}–${a.mostLikelyScore.away}`
      : undefined,
    factors: (a.factors ?? [])
      .filter((f) => f.value)
      .slice(0, 3)
      .map((f) => ({ label: f.label, value: f.value ?? "", detail: f.detail })),
    publishedAt: a.publishedAt,
    modelLabel: a.model?.label ?? "Modelo PitchLab · en validación",
  };
}

/** Convierte un snapshot de liga en lo que la landing necesita. */
export function landingLeagueFromSnapshot(snap: LandingSnapshot): LvLeague {
  const label = leagueLabel(snap.league);
  const withAnalysis = snap.games
    .map((g) => ({ g, a: snap.analyses[g.id] }))
    .filter((x): x is { g: SnapGame; a: SnapAnalysis } => Boolean(x.a))
    .sort((x, y) => x.g.startTime.localeCompare(y.g.startTime));
  const matches = withAnalysis.map(({ g, a }) => toMatch(g, a, label));
  return {
    slug: snap.league,
    label,
    round: snap.periodLabel ?? matches[0]?.round ?? "",
    updatedAt: snap.updatedAt,
    upcoming: matches.filter((m) => m.status === "scheduled" && m.outcomes.length > 1),
    // Solo cuenta como historial lo publicado antes del inicio.
    finals: matches
      .filter((m) => m.status === "final" && m.result && m.publishedAt <= m.kickoff)
      .reverse(),
  };
}
