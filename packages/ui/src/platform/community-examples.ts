/**
 * Perfiles de ejemplo de Comunidad (marcados «Ejemplo» en la UI).
 *
 * Su bitácora se genera de forma determinista a partir de su récord publicado
 * (picks cerrados, cumplidos, saldo y ventaja contra el cierre), para que el
 * perfil, las estadísticas y el ranking cuadren entre sí. Nada de esto se usa
 * para perfiles reales: esos salen del journal de cada persona.
 */
import type { LeagueId } from "@pitchlab/contracts";
import type { LeaderboardAnalyst } from "./profile-stats";
import { TIPSTER_CREATORS } from "./spacetime-catalog";
import { formatOddsValue } from "./access-guard";
import type { JournalEntry, MatchPick, PlatformGame, SocialPost } from "./types";

export interface ExampleTeam {
  slug: string;
  name: string;
}

export interface ExampleGameMeta {
  league: LeagueId;
  leagueLabel: string;
  home: ExampleTeam;
  away: ExampleTeam;
  score?: { home: number; away: number };
  kickoffIso: string;
}

interface LeagueTemplate {
  league: LeagueId;
  label: string;
  teams: readonly ExampleTeam[];
  picks: readonly ((home: ExampleTeam, away: ExampleTeam) => string)[];
  sport: "soccer" | "football";
}

const LEAGUES: Record<string, LeagueTemplate> = {
  nfl: {
    league: "nfl" as LeagueId,
    label: "NFL",
    sport: "football",
    teams: [
      { slug: "new-york-giants", name: "Giants" },
      { slug: "washington-commanders", name: "Washington" },
      { slug: "dallas-cowboys", name: "Dallas" },
      { slug: "philadelphia-eagles", name: "Filadelfia" },
      { slug: "kansas-city-chiefs", name: "Kansas City" },
      { slug: "buffalo-bills", name: "Buffalo" },
      { slug: "san-francisco-49ers", name: "San Francisco" },
      { slug: "detroit-lions", name: "Detroit" },
    ],
    picks: [
      (_h, a) => `${a.name} +6.5`,
      () => "Menos de 44.5 puntos",
      () => "Más de 41.5 puntos",
      (h) => `${h.name} −3.5`,
    ],
  },
  "liga-mx": {
    league: "liga-mx" as LeagueId,
    label: "Liga MX",
    sport: "soccer",
    teams: [
      { slug: "queretaro", name: "Querétaro" },
      { slug: "monterrey", name: "Monterrey" },
      { slug: "america", name: "América" },
      { slug: "chivas", name: "Chivas" },
      { slug: "tigres-uanl", name: "Tigres" },
      { slug: "cruz-azul", name: "Cruz Azul" },
      { slug: "toluca", name: "Toluca" },
      { slug: "pumas-unam", name: "Pumas" },
    ],
    picks: [
      () => "Más de 1.5 goles",
      (h) => `${h.name} o empate`,
      () => "Ambos anotan",
      () => "Menos de 3.5 goles",
    ],
  },
  "premier-league": {
    league: "premier-league" as LeagueId,
    label: "Premier League",
    sport: "soccer",
    teams: [
      { slug: "arsenal", name: "Arsenal" },
      { slug: "liverpool", name: "Liverpool" },
      { slug: "manchester-city", name: "Man City" },
      { slug: "chelsea", name: "Chelsea" },
      { slug: "newcastle-united", name: "Newcastle" },
      { slug: "aston-villa", name: "Aston Villa" },
      { slug: "tottenham-hotspur", name: "Tottenham" },
      { slug: "brighton-hove-albion", name: "Brighton" },
    ],
    picks: [
      () => "Ambos anotan",
      (h) => `${h.name} o empate`,
      () => "Más de 2.5 goles",
      () => "Menos de 3.5 goles",
    ],
  },
  laliga: {
    league: "laliga" as LeagueId,
    label: "LaLiga",
    sport: "soccer",
    teams: [
      { slug: "real-madrid", name: "Real Madrid" },
      { slug: "barcelona", name: "Barcelona" },
      { slug: "atletico-madrid", name: "Atlético" },
      { slug: "real-sociedad", name: "Real Sociedad" },
      { slug: "villarreal", name: "Villarreal" },
      { slug: "sevilla", name: "Sevilla" },
      { slug: "real-betis", name: "Betis" },
      { slug: "athletic-club", name: "Athletic" },
    ],
    picks: [
      () => "Más de 1.5 goles",
      (h) => `${h.name} o empate`,
      () => "Ambos anotan",
      () => "Menos de 2.5 goles",
    ],
  },
};

export interface ExampleAnalystSpec {
  handle: string;
  name: string;
  isTipster: boolean;
  specialty: string;
  bio: string;
  avatarInitials: string;
  avatarGradVar: string;
  joinedAt: string;
  settled: number;
  won: number;
  netUnits: number;
  clvAvg: number;
  leagues: readonly (keyof typeof LEAGUES)[];
  followers: number;
  following: number;
}

function parseNum(raw: string): number {
  return Number.parseFloat(raw.replace(/[^0-9.-]/g, "")) || 0;
}

const TIPSTER_LEAGUES: Record<string, readonly (keyof typeof LEAGUES)[]> = {
  sofia_nfl: ["nfl", "liga-mx", "premier-league"],
  carlos_quant: ["premier-league", "laliga"],
  diego_tactico: ["liga-mx", "nfl"],
};

const TIPSTER_FOLLOWERS: Record<string, [number, number]> = {
  sofia_nfl: [763, 28],
  carlos_quant: [612, 41],
  diego_tactico: [438, 35],
};

const EXAMPLE_SOCIOS: readonly ExampleAnalystSpec[] = [
  {
    handle: "mariana_t",
    name: "Mariana T.",
    isTipster: false,
    specialty: "Liga MX",
    bio: "Liga MX los fines de semana. Registro cada pick antes del silbatazo.",
    avatarInitials: "MT",
    avatarGradVar: "var(--avatar-grad-3)",
    joinedAt: "2026-05-02",
    settled: 74,
    won: 44,
    netUnits: 9.8,
    clvAvg: 3.4,
    leagues: ["liga-mx"],
    followers: 96,
    following: 22,
  },
  {
    handle: "andres_l",
    name: "Andrés L.",
    isTipster: false,
    specialty: "NFL",
    bio: "Totales y spreads de NFL.",
    avatarInitials: "AL",
    avatarGradVar: "var(--avatar-grad-2)",
    joinedAt: "2026-06-12",
    settled: 61,
    won: 35,
    netUnits: 7.1,
    clvAvg: 2.9,
    leagues: ["nfl"],
    followers: 71,
    following: 18,
  },
  {
    handle: "valeria_g",
    name: "Valeria G.",
    isTipster: false,
    specialty: "Premier League",
    bio: "Premier League y ambos anotan.",
    avatarInitials: "VG",
    avatarGradVar: "var(--avatar-grad-5)",
    joinedAt: "2026-04-20",
    settled: 88,
    won: 49,
    netUnits: 6.2,
    clvAvg: 2.4,
    leagues: ["premier-league"],
    followers: 64,
    following: 30,
  },
  {
    handle: "rodrigo_p",
    name: "Rodrigo P.",
    isTipster: false,
    specialty: "LaLiga y Premier",
    bio: "Fútbol europeo entre semana.",
    avatarInitials: "RP",
    avatarGradVar: "var(--avatar-grad-4)",
    joinedAt: "2026-07-01",
    settled: 52,
    won: 28,
    netUnits: 3.9,
    clvAvg: 1.8,
    leagues: ["laliga", "premier-league"],
    followers: 39,
    following: 15,
  },
  {
    handle: "paola_c",
    name: "Paola C.",
    isTipster: false,
    specialty: "NFL y Liga MX",
    bio: "NFL los domingos, Liga MX el sábado.",
    avatarInitials: "PC",
    avatarGradVar: "var(--avatar-grad-1)",
    joinedAt: "2026-05-28",
    settled: 66,
    won: 35,
    netUnits: 2.6,
    clvAvg: 1.5,
    leagues: ["nfl", "liga-mx"],
    followers: 33,
    following: 27,
  },
  {
    handle: "luis_f",
    name: "Luis F.",
    isTipster: false,
    specialty: "Liga MX",
    bio: "Pocos picks, bien pensados.",
    avatarInitials: "LF",
    avatarGradVar: "var(--avatar-grad-2)",
    joinedAt: "2026-06-30",
    settled: 47,
    won: 24,
    netUnits: -1.4,
    clvAvg: 0.9,
    leagues: ["liga-mx"],
    followers: 21,
    following: 12,
  },
];

export const EXAMPLE_ANALYST_SPECS: readonly ExampleAnalystSpec[] = [
  ...TIPSTER_CREATORS.filter((c) => c.isExample).map<ExampleAnalystSpec>((c) => ({
    handle: c.handle,
    name: c.name,
    isTipster: true,
    specialty: c.specialty,
    bio: c.bio ?? c.weeklyPickThesis,
    avatarInitials: c.avatarInitials,
    avatarGradVar: c.avatarGradVar,
    joinedAt: c.joinedAt,
    settled: c.settledCount,
    won: c.wonCount,
    netUnits: parseNum(c.verifiedUnits),
    clvAvg: parseNum(c.clvAvg),
    leagues: TIPSTER_LEAGUES[c.handle] ?? ["liga-mx"],
    followers: TIPSTER_FOLLOWERS[c.handle]?.[0] ?? 120,
    following: TIPSTER_FOLLOWERS[c.handle]?.[1] ?? 20,
  })),
  ...EXAMPLE_SOCIOS,
];

/* ---------------------------------------------------------------------------
   Generador determinista
   ------------------------------------------------------------------------- */

function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const exampleGameMeta = new Map<string, ExampleGameMeta>();
const journalCache = new Map<string, JournalEntry[]>();

/** Partido de un pick de ejemplo (escudos, marcador e inicio). */
export function getExampleGameMeta(gameId: string): ExampleGameMeta | undefined {
  return exampleGameMeta.get(gameId);
}

const PARLAYS_PER_ANALYST = 4;

/**
 * Bitácora cerrada de un perfil de ejemplo: exactamente `settled` picks, `won`
 * cumplidos, saldo `netUnits` (1u por pick) y ventaja media ≈ `clvAvg`.
 * Las fechas caen entre `joinedAt` y `today`, más densas cerca de hoy.
 */
export function generateExampleJournal(
  spec: ExampleAnalystSpec,
  today: Date = new Date(),
): JournalEntry[] {
  const dayKey = today.toISOString().slice(0, 10);
  const cacheKey = `${spec.handle}:${dayKey}`;
  const cached = journalCache.get(cacheKey);
  if (cached) return cached;

  const rand = mulberry32(hashString(spec.handle));
  const n = spec.settled;
  const lost = n - spec.won;

  // Quiénes se cumplen: barajado determinista.
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const wonSet = new Set(order.slice(0, spec.won));

  // Momios: se escalan los cumplidos para que el saldo cuadre exacto.
  const raw = Array.from({ length: n }, () => 1.55 + rand() * 0.8);
  const targetWonProfit = spec.netUnits + lost;
  const wonRawProfit = raw.reduce((s, d, i) => (wonSet.has(i) ? s + (d - 1) : s), 0);
  const k = spec.won > 0 && wonRawProfit > 0 ? targetWonProfit / wonRawProfit : 1;
  const decimals = raw.map((d, i) => (wonSet.has(i) ? 1 + (d - 1) * k : d));

  const joined = new Date(`${spec.joinedAt}T12:00:00Z`).getTime();
  const end = today.getTime() - 30 * 60 * 60 * 1000;
  const span = Math.max(end - joined, 24 * 60 * 60 * 1000);

  const entries: JournalEntry[] = [];
  for (let i = 0; i < n; i += 1) {
    const leagueKey = spec.leagues[Math.floor(rand() * spec.leagues.length)]!;
    const tpl = LEAGUES[leagueKey]!;
    const hi = Math.floor(rand() * tpl.teams.length);
    let ai = Math.floor(rand() * (tpl.teams.length - 1));
    if (ai >= hi) ai += 1;
    const home = tpl.teams[hi]!;
    const away = tpl.teams[ai]!;
    const pickLabel = tpl.picks[Math.floor(rand() * tpl.picks.length)]!(home, away);

    const sealedMs = end - span * Math.pow(rand(), 1.6);
    const leadHours = 6 + Math.floor(rand() * 60);
    const kickoffMs = Math.min(sealedMs + leadHours * 60 * 60 * 1000, today.getTime() - 4 * 60 * 60 * 1000);

    const userDecimal = Math.round(decimals[i]! * 100) / 100;
    const clvPct = Math.round((spec.clvAvg + (rand() - 0.5) * 6) * 10) / 10;
    const p = Math.min(0.92, Math.max(0.3, 1 / userDecimal + clvPct / 100));
    const fairDecimal = Math.round((1 / p) * 100) / 100;
    const status: JournalEntry["status"] = wonSet.has(i) ? "won" : "lost";

    const gameId = `ex-${spec.handle}-${i}`;
    exampleGameMeta.set(gameId, {
      league: tpl.league,
      leagueLabel: tpl.label,
      home,
      away,
      kickoffIso: new Date(kickoffMs).toISOString(),
    });

    const sealedIso = new Date(sealedMs).toISOString();
    entries.push({
      id: `${gameId}-j`,
      pickId: `${gameId}-p`,
      gameId,
      leagueLabel: tpl.label,
      matchLabel: `${home.name} vs ${away.name}`,
      pickLabel,
      origin: "Spacetime Suite",
      units: 1,
      userDecimal,
      fairDecimal,
      clvPct,
      status,
      sealedAt: sealedIso.slice(0, 10),
      sealedAtIso: sealedIso,
    });
  }

  // Algunos boletos combinados: reutilizan picks existentes como piernas.
  const parlayCount = Math.min(PARLAYS_PER_ANALYST, Math.floor(n / 20));
  for (let i = 0; i < parlayCount; i += 1) {
    const idx = Math.floor((i + 0.5) * (n / parlayCount));
    const base = entries[idx]!;
    const want = 2 + (i % 2);
    const legEntries: JournalEntry[] = [base];
    for (let step = 1; step < n && legEntries.length < want; step += 1) {
      const candidate = entries[(idx + step * 7) % n]!;
      if (
        candidate.origin !== "Parlay Combinado" &&
        legEntries.every(
          (e) => e.matchLabel !== candidate.matchLabel && e.leagueLabel !== candidate.leagueLabel,
        )
      ) {
        legEntries.push(candidate);
      }
    }
    for (let step = 1; step < n && legEntries.length < want; step += 1) {
      const candidate = entries[(idx + step * 5) % n]!;
      if (candidate.origin !== "Parlay Combinado" && legEntries.every((e) => e.matchLabel !== candidate.matchLabel)) {
        legEntries.push(candidate);
      }
    }
    const legs = legEntries.map((e) => `${e.pickLabel} · ${e.leagueLabel}`);
    const legsP = legEntries.reduce((prod, e) => prod * (1 / e.fairDecimal), 1);
    entries[idx] = {
      ...base,
      origin: "Parlay Combinado",
      leagueLabel: "Combinada",
      matchLabel: `${legs.length} selecciones`,
      pickLabel: legs.join(" + "),
      fairDecimal: Math.round((1 / legsP) * 100) / 100,
    };
  }

  entries.sort((a, b) => (b.sealedAtIso ?? "").localeCompare(a.sealedAtIso ?? ""));
  journalCache.set(cacheKey, entries);
  return entries;
}

export function getExampleAnalystSpec(handle: string): ExampleAnalystSpec | undefined {
  const clean = handle.toLowerCase();
  return EXAMPLE_ANALYST_SPECS.find((s) => s.handle === clean);
}

/** Filas de ejemplo para el leaderboard compartido. */
export function exampleLeaderboardRows(today: Date = new Date()): LeaderboardAnalyst[] {
  return EXAMPLE_ANALYST_SPECS.map((spec) => ({
    handle: spec.handle,
    name: spec.name,
    roleLabel: spec.isTipster ? "Tipster" : "Socio",
    specialty: spec.specialty,
    avatarInitials: spec.avatarInitials,
    avatarGradVar: spec.avatarGradVar,
    isTipster: spec.isTipster,
    isVerified: spec.isTipster,
    isExample: true,
    journal: generateExampleJournal(spec, today),
  }));
}

/**
 * Picks abiertos de un perfil de ejemplo sobre partidos próximos reales del
 * dataset (máx. `limit`), registrados antes del inicio.
 */
export function exampleOpenEntries(
  spec: ExampleAnalystSpec,
  games: ReadonlyArray<PlatformGame>,
  today: Date = new Date(),
  limit = 2,
): JournalEntry[] {
  const leagues = new Set<string>(spec.leagues);
  const upcoming = games
    .filter((g) => g.status === "NS" && leagues.has(g.league) && g.picks.length > 0)
    .sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc))
    .slice(0, limit);
  const rand = mulberry32(hashString(`${spec.handle}:open`));
  return upcoming.map((game, i) => {
    const pick = [...game.picks].sort((a, b) => b.p - a.p)[0]!;
    const kickoff = new Date(game.kickoffUtc).getTime();
    const sealed = Math.min(
      today.getTime() - 2 * 60 * 60 * 1000,
      kickoff - (24 + Math.floor(rand() * 24)) * 60 * 60 * 1000,
    );
    const userDecimal =
      pick.marketDecimal ?? Math.round(pick.fairDecimal * (1.04 + rand() * 0.06) * 100) / 100;
    const clvPct = Math.round((1 / pick.fairDecimal - 1 / userDecimal) * 1000) / 10;
    const sealedIso = new Date(sealed).toISOString();
    return {
      id: `ex-open-${spec.handle}-${i}`,
      pickId: pick.id,
      gameId: game.id,
      leagueLabel: pick.leagueLabel,
      matchLabel: pick.matchLabel,
      pickLabel: pick.label,
      origin: "Spacetime Suite",
      units: i === 0 ? 2 : 1,
      userDecimal,
      fairDecimal: pick.fairDecimal,
      clvPct,
      status: "pending",
      sealedAt: sealedIso.slice(0, 10),
      sealedAtIso: sealedIso,
    };
  });
}

/* ---------------------------------------------------------------------------
   Publicaciones de ejemplo con su pick real del dataset
   ------------------------------------------------------------------------- */

function bestPickOf(game: PlatformGame): MatchPick | null {
  const picks = [...game.picks].filter((p) => p.p >= 0.5 && p.p <= 0.85);
  if (picks.length === 0) return null;
  picks.sort((a, b) => (b.edgePts ?? -1) - (a.edgePts ?? -1) || b.p - a.p);
  return picks[0]!;
}

function unitsFromBadge(badge: string): number {
  const m = badge.match(/(\d+(?:\.\d+)?)u/);
  return m ? Number(m[1]) : 1;
}

function pct(p: number): string {
  return `${(p * 100).toFixed(1)} %`;
}

/**
 * Les da a las publicaciones de ejemplo un pick de un partido real del
 * dataset (mismo deporte/liga cuando se puede) y reescribe su texto con datos:
 * momio, momio justo y probabilidad. Las que no encuentran partido se quedan
 * sin pick (y sin «Copiar a mi bitácora»).
 */
export function attachExamplePostPicks(
  posts: ReadonlyArray<SocialPost>,
  games: ReadonlyArray<PlatformGame>,
): SocialPost[] {
  const used = new Set<string>();
  const pickFor = (leagueLabel: string, wantFinished: boolean): { game: PlatformGame; pick: MatchPick } | null => {
    const pool = games.filter(
      (g) => (wantFinished ? g.status === "FT" : g.status === "NS") && !used.has(g.id),
    );
    const sameLeague = pool.filter((g) => g.leagueLabel === leagueLabel);
    for (const list of [sameLeague, pool]) {
      for (const game of list) {
        const pick = wantFinished
          ? game.picks.find((p) => p.result === "hit" || p.result === "miss") ?? null
          : bestPickOf(game);
        if (pick) {
          used.add(game.id);
          return { game, pick };
        }
      }
    }
    return null;
  };

  return posts.map((post) => {
    if (!post.isExample || post.pick) return post;
    const closed = /cumplid/i.test(post.pickBadge) || /cumplid/i.test(post.createdAt);
    if (post.authorHandle === "carlos_quant") {
      const found = pickFor(post.leagueLabel, false);
      if (!found) return post;
      const { game, pick } = found;
      const home = game.home.shortName || game.home.name;
      const away = game.away.shortName || game.away.name;
      const ref = pick.marketDecimal;
      const body = ref
        ? `${home}–${away}: el modelo le da ${pct(pick.p)} a «${pick.label}» y la casa paga ${formatOddsValue(ref, "american")} (${pct(1 / ref)}). ${
            Math.abs(pick.p - 1 / ref) < 0.03 ? "Sin diferencia, esta vez no entro." : "Hay diferencia; lo sigo de cerca."
          }`
        : `${home}–${away}: el modelo le da ${pct(pick.p)} a «${pick.label}», momio justo ${formatOddsValue(pick.fairDecimal, "american")}. Espero a ver el momio de mi casa.`;
      return { ...post, leagueLabel: game.leagueLabel, matchLabel: `${home} vs ${away}`, gameId: game.id, body };
    }
    const found = pickFor(post.leagueLabel, closed) ?? (closed ? null : pickFor(post.leagueLabel, false));
    if (!found) return post;
    const { game, pick } = found;
    const units = unitsFromBadge(post.pickBadge);
    const userDecimal =
      pick.marketDecimal ?? Math.round(pick.fairDecimal * 1.06 * 100) / 100;
    const status: "open" | "won" | "lost" =
      game.status === "FT" ? (pick.result === "miss" ? "lost" : "won") : "open";
    const user = formatOddsValue(userDecimal, "american");
    const fair = formatOddsValue(pick.fairDecimal, "american");
    const body =
      status === "open"
        ? `${pick.label} a ${user}. El modelo lo pone en ${fair} (${pct(pick.p)}); entro antes de que se mueva la línea.`
        : status === "won"
          ? `${pick.label}, cumplido. Lo tomé a ${user}; el modelo le daba ${pct(pick.p)}.`
          : `${pick.label} no se cumplió. El modelo le daba ${pct(pick.p)}; lo tomé a ${user}.`;
    const home = game.home.shortName || game.home.name;
    const away = game.away.shortName || game.away.name;
    return {
      ...post,
      leagueLabel: game.leagueLabel,
      matchLabel: `${home} vs ${away}`,
      gameId: game.id,
      body,
      pick: {
        pickId: pick.id,
        gameId: game.id,
        label: pick.label,
        units,
        userDecimal,
        fairDecimal: pick.fairDecimal,
        modelProbability: pick.p,
        status,
      },
    };
  });
}
