/**
 * Parte 3 · Validador común previo a publicar cualquier snapshot (calendario/resultados,
 * bajas o momios). Si alguna invariante falla, el candidato se descarta, se conserva intacto
 * el archivo anterior en disco y se devuelve un error estructurado para Salud de datos.
 */
import {
  LeagueInjuriesFileSchema,
  LeagueSnapshotSchema,
  isNationalCompetition,
  type LeagueInjuriesFile,
  type LeagueSnapshot,
  type Team,
} from "@pitchlab/contracts";
import { getTeamAsset } from "@pitchlab/sports-assets";
import { SHARP_SCRAPED_FALLBACK_ORDER, type MatchOutlook, type OddsSnapshotRow } from "@pitchlab/spacetime";
import {
  GENERIC_LEAGUES,
  HISTORIC_TEAMS,
  UnmappedTeamError,
  resolveCanonicalTeam,
  type CanonicalLeague,
  type TeamLeague,
} from "../mappings.js";
import { slugifyTeamName } from "../team-slug.js";

export const MIN_VALID_DECIMAL_ODDS = 1.01;
export const MAX_VALID_DECIMAL_ODDS = 1000.0;
export const MIN_VALID_OVERROUND = 1.0;
export const MAX_VALID_OVERROUND = 1.25;
export const MIN_DOUBLE_CHANCE_SUM = 1.8;
export const MAX_DOUBLE_CHANCE_SUM = 2.4;

const MIN_PLAUSIBLE_YEAR = 2024;
const MAX_PLAUSIBLE_YEAR = 2028;
const MAX_FUTURE_CLOCK_SKEW_MS = 10 * 60_000;
const MAX_FIXTURE_HORIZON_MS = 400 * 86_400_000;
const MAX_NATIONAL_CYCLE_ARCHIVE_MS = 1100 * 86_400_000;

const PSEUDO_TEAM_NAMES = new Set([
  "tbd",
  "tba",
  "unknown",
  "por definir",
  "local",
  "visitante",
  "home",
  "away",
  "test",
  "demo",
  "bye",
]);

/** Casas bloqueadas legalmente o marcadores sintéticos que jamás pueden entrar al snapshot. */
export const BLOCKED_BOOK_IDS = new Set([
  "caliente",
  "caliente_mx",
  "action_network",
  "oddsportal",
  "oddschecker",
  "synthetic",
  "demo",
  "mock",
  "placeholder",
]);

/** Casas autorizadas cuando provienen de un adaptador `api_only` permitido. */
export const PERMITTED_BOOK_IDS = new Set<string>([
  ...SHARP_SCRAPED_FALLBACK_ORDER,
  "betfair_exchange",
  "bet365",
  "draftkings",
  "fanduel",
  "betmgm",
  "betrivers",
  "betcris",
  "bwin",
  "william_hill",
  "codere",
  "unibet",
  "betonline",
]);

export type ValidationFailureCode =
  | "SCHEMA_INVALID"
  | "UNKNOWN_TEAM"
  | "CROSSED_TEAM_IDENTITY"
  | "CROSSED_TEAM_CREST"
  | "HISTORIC_TEAM_IN_ACTIVE_FIXTURE"
  | "SELF_MATCH_TEAM"
  | "CROSS_LEAGUE_TEAM"
  | "SWAPPED_FIXTURE_SIDES"
  | "DUPLICATE_TEAM_SAME_DAY"
  | "IMPOSSIBLE_DATE"
  | "FUTURE_SNAPSHOT_TIMESTAMP"
  | "POST_KICKOFF_QUOTE"
  | "ODDS_OUT_OF_RANGE"
  | "ABSURD_OVERROUND"
  | "BLOCKED_BOOK_SOURCE"
  | "STALE_CANDIDATE_OLDER_THAN_CURRENT"
  | "EMPTY_OR_REGRESSED_SNAPSHOT";

export interface ValidationIssue {
  readonly code: ValidationFailureCode;
  readonly message: string;
  readonly path?: string;
}

export interface ValidationResult<T> {
  readonly ok: boolean;
  readonly value?: T;
  readonly issues: readonly ValidationIssue[];
}

const ISO_DATE_PREFIX_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/i;

/**
 * Parsea una cadena ISO verificando que el año, mes y día existan realmente en el calendario
 * (evita que `new Date("2026-02-30T18:00:00Z")` se deslice en silencio al 2 de marzo).
 */
export function parseStrictIsoMs(
  raw: string | null | undefined,
  options: { requireTimezone?: boolean } = {},
): number | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const match = ISO_DATE_PREFIX_RE.exec(trimmed);
  if (!match) return null;

  if (options.requireTimezone && !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed)) {
    return null;
  }

  const year = Number.parseInt(match[1]!, 10);
  const month = Number.parseInt(match[2]!, 10);
  const day = Number.parseInt(match[3]!, 10);
  const hour = match[4] !== undefined ? Number.parseInt(match[4], 10) : 0;
  const minute = match[5] !== undefined ? Number.parseInt(match[5], 10) : 0;
  const second = match[6] !== undefined ? Number.parseInt(match[6], 10) : 0;

  if (year < MIN_PLAUSIBLE_YEAR || year > MAX_PLAUSIBLE_YEAR) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;

  const calendarCheck = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarCheck.getUTCFullYear() !== year ||
    calendarCheck.getUTCMonth() !== month - 1 ||
    calendarCheck.getUTCDate() !== day
  ) {
    return null;
  }

  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed)
    ? trimmed
    : trimmed.length === 10
      ? `${trimmed}T00:00:00Z`
      : `${trimmed}Z`;
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : null;
}

function isHistoricTeamSlug(league: TeamLeague, teamName: string, slug: string): boolean {
  const historicTable = HISTORIC_TEAMS[league];
  if (!historicTable) return false;
  if (historicTable[teamName.trim()]) return true;
  for (const canonicalHistoric of Object.values(historicTable)) {
    if (slugifyTeamName(canonicalHistoric) === slug) return true;
  }
  return false;
}

/**
 * Verifica que un `Team` coincida exactamente con el catálogo maestro (`mappings.ts`) y con su
 * emblema registrado (`@pitchlab/sports-assets`), bloqueando clubes desconocidos y escudos cruzados
 * como el caso real P0-03 (West Ham -> Coventry City, Mazatlán -> Atlante).
 */
export function validateTeamIdentity(
  league: TeamLeague,
  team: Team,
  options: { allowHistoric?: boolean; path?: string } = {},
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const pathPrefix = options.path ?? team.id;

  if (team.league !== league) {
    issues.push({
      code: "CROSS_LEAGUE_TEAM",
      path: pathPrefix,
      message: `El equipo '${team.name}' (${team.id}) declara liga '${team.league}' dentro de '${league}'.`,
    });
    return issues;
  }

  const cleanName = team.name.trim();
  const cleanLower = cleanName.toLowerCase();
  if (!cleanName || PSEUDO_TEAM_NAMES.has(cleanLower)) {
    issues.push({
      code: "UNKNOWN_TEAM",
      path: pathPrefix,
      message: `Nombre de equipo vacío o comodín no permitido: '${team.name}'.`,
    });
    return issues;
  }

  let canonical: Team;
  try {
    canonical = resolveCanonicalTeam(league, cleanName);
  } catch (err) {
    if (err instanceof UnmappedTeamError) {
      issues.push({
        code: "UNKNOWN_TEAM",
        path: pathPrefix,
        message: err.message,
      });
      return issues;
    }
    issues.push({
      code: "CROSSED_TEAM_CREST",
      path: pathPrefix,
      message: err instanceof Error ? err.message : String(err),
    });
    return issues;
  }

  if (canonical.id !== team.id) {
    issues.push({
      code: "CROSSED_TEAM_IDENTITY",
      path: pathPrefix,
      message: `Equipo cruzado detectado en '${league}': '${team.name}' trae id '${team.id}', pero su id canónico es '${canonical.id}'.`,
    });
    return issues;
  }

  const parts = team.id.split(".");
  const slug = parts[1] ?? "";
  if (parts[0] !== league || !slug) {
    issues.push({
      code: "CROSSED_TEAM_IDENTITY",
      path: pathPrefix,
      message: `ID de equipo mal formado '${team.id}' para la liga '${league}'.`,
    });
    return issues;
  }

  if (!GENERIC_LEAGUES.has(league)) {
    const historic = isHistoricTeamSlug(league, cleanName, slug);
    if (historic && !options.allowHistoric) {
      issues.push({
        code: "HISTORIC_TEAM_IN_ACTIVE_FIXTURE",
        path: pathPrefix,
        message: `El club histórico '${team.name}' (${team.id}) no pertenece al calendario activo de '${league}'.`,
      });
      return issues;
    }

    if (!historic) {
      const asset = getTeamAsset(team.id);
      if (!asset) {
        issues.push({
          code: "CROSSED_TEAM_CREST",
          path: pathPrefix,
          message: `El equipo '${team.name}' (${team.id}) no tiene emblema verificado en '${league}'.`,
        });
        return issues;
      }
      if (asset.code !== team.code || asset.name !== canonical.name) {
        issues.push({
          code: "CROSSED_TEAM_CREST",
          path: pathPrefix,
          message: `Escudo/código cruzado para '${team.name}' (${team.id}): código '${team.code}' != '${asset.code}' (${asset.name}).`,
        });
      }
    }
  } else {
    const expectedSlug = slugifyTeamName(cleanName);
    if (slug !== expectedSlug) {
      issues.push({
        code: "CROSSED_TEAM_IDENTITY",
        path: pathPrefix,
        message: `Slug cruzado en '${league}': '${team.name}' apunta a '${team.id}' en vez de '${league}.${expectedSlug}'.`,
      });
    }
  }

  return issues;
}

export function isValidDecimalOddsRange(price: number): boolean {
  return (
    typeof price === "number" &&
    Number.isFinite(price) &&
    price >= MIN_VALID_DECIMAL_ODDS &&
    price <= MAX_VALID_DECIMAL_ODDS
  );
}

/**
 * Valida un `LeagueSnapshot` completo antes de escribir `latest.json`.
 */
export function validateLeagueSnapshotCandidate(
  candidateRaw: unknown,
  previousSnapshot: LeagueSnapshot | null | undefined,
  options: { nowMs?: number } = {},
): ValidationResult<LeagueSnapshot> {
  const nowMs = options.nowMs ?? Date.now();
  const parsed = LeagueSnapshotSchema.safeParse(candidateRaw);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((iss) => ({
        code: "SCHEMA_INVALID" as const,
        path: iss.path.join("."),
        message: iss.message,
      })),
    };
  }

  const snapshot = parsed.data;
  const issues: ValidationIssue[] = [];
  const league = snapshot.league as TeamLeague;

  // 1. Fecha de actualización plausible y no futura
  const updatedMs = parseStrictIsoMs(snapshot.updatedAt, { requireTimezone: true });
  if (updatedMs === null) {
    issues.push({
      code: "IMPOSSIBLE_DATE",
      path: "updatedAt",
      message: `Fecha updatedAt inválida o imposible: '${snapshot.updatedAt}'.`,
    });
  } else if (updatedMs > nowMs + MAX_FUTURE_CLOCK_SKEW_MS) {
    issues.push({
      code: "FUTURE_SNAPSHOT_TIMESTAMP",
      path: "updatedAt",
      message: `updatedAt '${snapshot.updatedAt}' está en el futuro respecto al reloj actual.`,
    });
  }

  // 2. Monotonía frente al snapshot actual y no vaciado accidental
  if (previousSnapshot) {
    const prevMs = parseStrictIsoMs(previousSnapshot.updatedAt, { requireTimezone: true });
    if (updatedMs !== null && prevMs !== null && updatedMs < prevMs) {
      issues.push({
        code: "STALE_CANDIDATE_OLDER_THAN_CURRENT",
        path: "updatedAt",
        message: `El candidato (${snapshot.updatedAt}) es más viejo que el snapshot actual (${previousSnapshot.updatedAt}).`,
      });
    }

    if (snapshot.games.length === 0 && previousSnapshot.games.length > 0) {
      issues.push({
        code: "EMPTY_OR_REGRESSED_SNAPSHOT",
        path: "games",
        message: `El candidato dejó 0 partidos cuando el snapshot previo tenía ${previousSnapshot.games.length}.`,
      });
    }

    if (
      snapshot.season === previousSnapshot.season &&
      snapshot.periodLabel === previousSnapshot.periodLabel
    ) {
      const prevFinals = previousSnapshot.games.filter((g) => g.status === "final").length;
      const nextFinals = snapshot.games.filter((g) => g.status === "final").length;
      if (prevFinals > 0 && nextFinals < prevFinals) {
        issues.push({
          code: "EMPTY_OR_REGRESSED_SNAPSHOT",
          path: "games",
          message: `El candidato perdió marcadores finales en ${snapshot.periodLabel} (${nextFinals} < ${prevFinals}).`,
        });
      }
    }
  } else if (snapshot.games.length === 0) {
    issues.push({
      code: "EMPTY_OR_REGRESSED_SNAPSHOT",
      path: "games",
      message: `No se puede publicar un snapshot inicial sin partidos para '${league}'.`,
    });
  }

  const prevGamesById = new Map((previousSnapshot?.games ?? []).map((g) => [g.id, g]));
  const scheduledTeamDay = new Set<string>();

  // 3. Partidos: equipos canónicos, escudos sin cruzar y fechas reales
  for (const game of snapshot.games) {
    if (game.league !== snapshot.league) {
      issues.push({
        code: "CROSS_LEAGUE_TEAM",
        path: `games.${game.id}`,
        message: `El partido '${game.id}' pertenece a '${game.league}' dentro del snapshot de '${snapshot.league}'.`,
      });
    }

    if (game.home.id === game.away.id) {
      issues.push({
        code: "SELF_MATCH_TEAM",
        path: `games.${game.id}`,
        message: `Un equipo no puede jugar contra sí mismo (${game.home.id}).`,
      });
    }

    issues.push(
      ...validateTeamIdentity(league, game.home, {
        allowHistoric: false,
        path: `games.${game.id}.home`,
      }),
    );
    issues.push(
      ...validateTeamIdentity(league, game.away, {
        allowHistoric: false,
        path: `games.${game.id}.away`,
      }),
    );

    const prevGame = prevGamesById.get(game.id);
    if (
      prevGame &&
      prevGame.home.id === game.away.id &&
      prevGame.away.id === game.home.id
    ) {
      issues.push({
        code: "SWAPPED_FIXTURE_SIDES",
        path: `games.${game.id}`,
        message: `Localía invertida respecto al snapshot previo en '${game.id}' (${game.home.id} vs ${game.away.id}).`,
      });
    }

    const startMs = parseStrictIsoMs(game.startTime);
    const maxHorizonMs =
      game.status === "final" && isNationalCompetition(snapshot.league)
        ? MAX_NATIONAL_CYCLE_ARCHIVE_MS
        : MAX_FIXTURE_HORIZON_MS;
    if (startMs === null) {
      issues.push({
        code: "IMPOSSIBLE_DATE",
        path: `games.${game.id}.startTime`,
        message: `Fecha startTime imposible en '${game.id}': '${game.startTime}'.`,
      });
    } else if (updatedMs !== null && Math.abs(startMs - updatedMs) > maxHorizonMs) {
      issues.push({
        code: "IMPOSSIBLE_DATE",
        path: `games.${game.id}.startTime`,
        message: `Fecha startTime fuera de ventana de temporada en '${game.id}': '${game.startTime}'.`,
      });
    } else if (game.status === "scheduled") {
      const dayBucket = new Date(startMs).toISOString().slice(0, 10);
      for (const side of [game.home.id, game.away.id]) {
        const key = `${side}::${dayBucket}`;
        if (scheduledTeamDay.has(key)) {
          issues.push({
            code: "DUPLICATE_TEAM_SAME_DAY",
            path: `games.${game.id}`,
            message: `El equipo '${side}' aparece en dos partidos programados el mismo día (${dayBucket}).`,
          });
        }
        scheduledTeamDay.add(key);
      }
    }
  }

  // 4. Análisis: cuotas justas dentro de rango y probabilidades consistentes
  for (const [gameId, analysis] of Object.entries(snapshot.analyses)) {
    const pubMs = parseStrictIsoMs(analysis.publishedAt, { requireTimezone: true });
    if (pubMs === null) {
      issues.push({
        code: "IMPOSSIBLE_DATE",
        path: `analyses.${gameId}.publishedAt`,
        message: `publishedAt inválido en '${gameId}': '${analysis.publishedAt}'.`,
      });
    }

    const sumX12 = analysis.x12[0] + analysis.x12[1] + analysis.x12[2];
    if (!Number.isFinite(sumX12) || Math.abs(sumX12 - 1) > 0.025) {
      issues.push({
        code: "ABSURD_OVERROUND",
        path: `analyses.${gameId}.x12`,
        message: `Las probabilidades 1X2 de '${gameId}' suman ${sumX12.toFixed(4)} (fuera de 1.00 ± 0.025).`,
      });
    }

    for (const prob of analysis.probabilities) {
      if (!isValidDecimalOddsRange(prob.fairOdds)) {
        issues.push({
          code: "ODDS_OUT_OF_RANGE",
          path: `analyses.${gameId}.probabilities.${prob.market}.${prob.selection}`,
          message: `Momio justo fuera de rango [${MIN_VALID_DECIMAL_ODDS}, ${MAX_VALID_DECIMAL_ODDS}]: ${prob.fairOdds}.`,
        });
      }
    }

    for (const group of analysis.marketGroups) {
      for (const row of group.rows) {
        if (!isValidDecimalOddsRange(row.fairOdds)) {
          issues.push({
            code: "ODDS_OUT_OF_RANGE",
            path: `analyses.${gameId}.marketGroups.${group.group}.${row.selection}`,
            message: `Momio justo fuera de rango en '${group.group}': ${row.fairOdds}.`,
          });
        }
      }
    }
  }

  return issues.length === 0 ? { ok: true, value: snapshot, issues: [] } : { ok: false, issues };
}

/**
 * Valida un archivo `injuries.json` antes de publicarlo.
 */
export function validateLeagueInjuriesCandidate(
  candidateRaw: unknown,
  previousFile: LeagueInjuriesFile | null | undefined,
  options: { nowMs?: number } = {},
): ValidationResult<LeagueInjuriesFile> {
  const nowMs = options.nowMs ?? Date.now();
  const parsed = LeagueInjuriesFileSchema.safeParse(candidateRaw);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((iss) => ({
        code: "SCHEMA_INVALID" as const,
        path: iss.path.join("."),
        message: iss.message,
      })),
    };
  }

  const file = parsed.data;
  const issues: ValidationIssue[] = [];
  const league = file.league as TeamLeague;

  const obsMs = parseStrictIsoMs(file.observedAt, { requireTimezone: true });
  if (obsMs === null) {
    issues.push({
      code: "IMPOSSIBLE_DATE",
      path: "observedAt",
      message: `observedAt inválido en bajas de '${league}': '${file.observedAt}'.`,
    });
  } else if (obsMs > nowMs + MAX_FUTURE_CLOCK_SKEW_MS) {
    issues.push({
      code: "FUTURE_SNAPSHOT_TIMESTAMP",
      path: "observedAt",
      message: `observedAt futuro en bajas de '${league}': '${file.observedAt}'.`,
    });
  }

  if (previousFile) {
    const prevMs = parseStrictIsoMs(previousFile.observedAt, { requireTimezone: true });
    if (obsMs !== null && prevMs !== null && obsMs < prevMs) {
      issues.push({
        code: "STALE_CANDIDATE_OLDER_THAN_CURRENT",
        path: "observedAt",
        message: `El reporte de bajas (${file.observedAt}) es más viejo que el actual (${previousFile.observedAt}).`,
      });
    }
  }

  for (let i = 0; i < file.entries.length; i += 1) {
    const entry = file.entries[i]!;
    const [entryLeague, slug] = entry.teamId.split(".");
    if (entryLeague !== league || !slug) {
      issues.push({
        code: "CROSS_LEAGUE_TEAM",
        path: `entries.${i}.teamId`,
        message: `Baja con teamId '${entry.teamId}' ajeno a la liga '${league}'.`,
      });
      continue;
    }
    if (!GENERIC_LEAGUES.has(league)) {
      const asset = getTeamAsset(entry.teamId);
      if (!asset) {
        issues.push({
          code: "UNKNOWN_TEAM",
          path: `entries.${i}.teamId`,
          message: `El club '${entry.teamId}' en bajas no existe en el catálogo oficial de '${league}'.`,
        });
      }
    }
    if (parseStrictIsoMs(entry.reportedAt, { requireTimezone: true }) === null) {
      issues.push({
        code: "IMPOSSIBLE_DATE",
        path: `entries.${i}.reportedAt`,
        message: `reportedAt inválido en baja de '${entry.player}': '${entry.reportedAt}'.`,
      });
    }
  }

  return issues.length === 0 ? { ok: true, value: file, issues: [] } : { ok: false, issues };
}

const V3_CODE_TO_APP_LEAGUE: Readonly<Record<string, CanonicalLeague>> = {
  MEX: "liga-mx",
  E0: "premier-league",
  SP1: "laliga",
  D1: "bundesliga",
  I1: "serie-a",
  F1: "ligue-1",
  NFL: "nfl",
  "liga-mx": "liga-mx",
  epl: "premier-league",
  "premier-league": "premier-league",
  laliga: "laliga",
  bundesliga: "bundesliga",
  "serie-a": "serie-a",
  "ligue-1": "ligue-1",
  nfl: "nfl",
};

function expectedMarketSides(market: string): readonly string[] | null {
  const m = market.trim().toLowerCase();
  if (m === "1x2") return ["home", "draw", "away"];
  if (m === "double_chance") return ["1X", "12", "X2"];
  if (m === "totals" || m === "corners_total") return ["over", "under"];
  if (
    m === "btts" ||
    m === "clean_sheet_home" ||
    m === "clean_sheet_away" ||
    m === "win_to_nil_home" ||
    m === "win_to_nil_away"
  ) {
    return ["yes", "no"];
  }
  if (m === "moneyline" || m === "dnb" || m === "ah" || m === "spread") return ["home", "away"];
  return null;
}

export interface OddsTickBatchValidationResult {
  readonly acceptedRows: OddsSnapshotRow[];
  readonly rejectedIssues: ValidationIssue[];
}

/**
 * Filtra y valida lotes de ticks de momios descartando:
 * - casas bloqueadas legalmente o no autorizadas,
 * - equipos desconocidos o idénticos en `event_id` (verificados contra `mappings.ts`),
 * - cuotas fuera de `[1.01, 1000.0]`,
 * - grupos de mercado con margen/overround absurdo (`< 1.00` o `> 1.25`),
 * - fechas imposibles o capturas posteriores al saque inicial (`ts_captured > ts_event_start`).
 */
export function validateOddsTickBatch(
  rows: readonly OddsSnapshotRow[],
  options: { nowMs?: number } = {},
): OddsTickBatchValidationResult {
  const nowMs = options.nowMs ?? Date.now();
  const rejectedIssues: ValidationIssue[] = [];
  const prelimRows: OddsSnapshotRow[] = [];

  for (let idx = 0; idx < rows.length; idx += 1) {
    const r = rows[idx]!;
    const path = `ticks[${idx}](${r.event_id})`;
    const bookNorm = String(r.book ?? "").trim().toLowerCase();

    if (!bookNorm || BLOCKED_BOOK_IDS.has(bookNorm) || !PERMITTED_BOOK_IDS.has(bookNorm)) {
      rejectedIssues.push({
        code: "BLOCKED_BOOK_SOURCE",
        path,
        message: `Casa de apuestas bloqueada o no autorizada: '${r.book}'.`,
      });
      continue;
    }

    if (!isValidDecimalOddsRange(r.price_decimal)) {
      rejectedIssues.push({
        code: "ODDS_OUT_OF_RANGE",
        path,
        message: `Momio decimal fuera de rango [${MIN_VALID_DECIMAL_ODDS}, ${MAX_VALID_DECIMAL_ODDS}]: ${String(r.price_decimal)}.`,
      });
      continue;
    }

    const capMs = parseStrictIsoMs(r.ts_captured, { requireTimezone: true });
    const startMs = parseStrictIsoMs(r.ts_event_start, { requireTimezone: true });
    if (capMs === null || startMs === null) {
      rejectedIssues.push({
        code: "IMPOSSIBLE_DATE",
        path,
        message: `Fechas inválidas en tick: ts_captured='${r.ts_captured}', ts_event_start='${r.ts_event_start}'.`,
      });
      continue;
    }
    if (capMs > nowMs + MAX_FUTURE_CLOCK_SKEW_MS) {
      rejectedIssues.push({
        code: "FUTURE_SNAPSHOT_TIMESTAMP",
        path,
        message: `ts_captured '${r.ts_captured}' está en el futuro.`,
      });
      continue;
    }
    if (capMs > startMs) {
      rejectedIssues.push({
        code: "POST_KICKOFF_QUOTE",
        path,
        message: `Captura post-kickoff descartada: ts_captured (${r.ts_captured}) > ts_event_start (${r.ts_event_start}).`,
      });
      continue;
    }

    const appLeague = V3_CODE_TO_APP_LEAGUE[r.league];
    if (!appLeague) {
      rejectedIssues.push({
        code: "CROSS_LEAGUE_TEAM",
        path,
        message: `Liga desconocida o fuera del producto en momios: '${r.league}'.`,
      });
      continue;
    }

    // Formato canónico: ws:<sport>:<league>:<YYYYMMDD>:<home_slug>:<away_slug>
    const evParts = String(r.event_id ?? "").split(":");
    if (evParts.length !== 6 || evParts[0] !== "ws") {
      rejectedIssues.push({
        code: "CROSSED_TEAM_IDENTITY",
        path,
        message: `event_id mal formado: '${r.event_id}'.`,
      });
      continue;
    }
    const homeSlug = evParts[4]!.replace(/_/g, "-");
    const awaySlug = evParts[5]!.replace(/_/g, "-");
    if (!homeSlug || !awaySlug || homeSlug === awaySlug) {
      rejectedIssues.push({
        code: "SELF_MATCH_TEAM",
        path,
        message: `Equipos vacíos o idénticos en event_id '${r.event_id}'.`,
      });
      continue;
    }

    if (!GENERIC_LEAGUES.has(appLeague)) {
      const homeAsset = getTeamAsset(`${appLeague}.${homeSlug}`);
      const awayAsset = getTeamAsset(`${appLeague}.${awaySlug}`);
      if (!homeAsset || !awayAsset) {
        rejectedIssues.push({
          code: "UNKNOWN_TEAM",
          path,
          message: `Equipo desconocido o descendido en momios de '${appLeague}': '${homeSlug}' vs '${awaySlug}'.`,
        });
        continue;
      }
    }

    prelimRows.push(r);
  }

  // Agrupación por mercado completo `(event_id, market, line, book, ts_captured)` para validar overround
  const groups = new Map<string, OddsSnapshotRow[]>();
  for (const r of prelimRows) {
    const lineKey = r.line === null || r.line === undefined ? "null" : String(r.line);
    const gKey = `${r.event_id}\u001f${r.market.toLowerCase()}\u001f${lineKey}\u001f${r.book.toLowerCase()}\u001f${r.ts_captured}`;
    const list = groups.get(gKey) ?? [];
    list.push(r);
    groups.set(gKey, list);
  }

  const acceptedRows: OddsSnapshotRow[] = [];
  for (const [gKey, items] of groups.entries()) {
    const sample = items[0]!;
    const reqSides = expectedMarketSides(sample.market);
    if (!reqSides) {
      rejectedIssues.push({
        code: "SCHEMA_INVALID",
        path: gKey,
        message: `Mercado desconocido en momios: '${sample.market}'.`,
      });
      continue;
    }

    const bySel = new Map<string, OddsSnapshotRow>();
    for (const item of items) {
      const normSel =
        sample.market.toLowerCase() === "double_chance"
          ? item.selection.trim().toUpperCase()
          : item.selection.trim().toLowerCase();
      bySel.set(normSel, item);
    }

    if (reqSides.some((s) => !bySel.has(s))) {
      rejectedIssues.push({
        code: "ABSURD_OVERROUND",
        path: sample.event_id,
        message: `Mercado incompleto (${sample.market} en ${sample.book}): faltan lados obligatorios.`,
      });
      continue;
    }

    const sumImplied = reqSides.reduce(
      (acc, side) => acc + 1 / bySel.get(side)!.price_decimal,
      0,
    );
    const isDc = sample.market.toLowerCase() === "double_chance";
    const minSum = isDc ? MIN_DOUBLE_CHANCE_SUM : MIN_VALID_OVERROUND;
    const maxSum = isDc ? MAX_DOUBLE_CHANCE_SUM : MAX_VALID_OVERROUND;

    if (!Number.isFinite(sumImplied) || sumImplied < minSum || sumImplied > maxSum) {
      rejectedIssues.push({
        code: "ABSURD_OVERROUND",
        path: sample.event_id,
        message: `Margen/overround absurdo en ${sample.market} (${sample.book}): Σ(1/cuota)=${sumImplied.toFixed(4)} fuera de [${minSum}, ${maxSum}].`,
      });
      continue;
    }

    for (const side of reqSides) {
      acceptedRows.push(bySel.get(side)!);
    }
  }

  return { acceptedRows, rejectedIssues };
}

export interface LiveMatchdayOutlooksMeta {
  schema_version: string;
  generated_at_utc: string;
  max_quote_age_hours: number;
  n_outlooks_total: number;
  n_football: number;
  n_nfl: number;
  counts_by_league: Record<string, number>;
  n_with_fresh_sharp_quotes_lt_72h: number;
  n_with_any_fresh_quotes_lt_72h: number;
  timeseries_files_scanned?: number;
  timeseries_rows_validated?: number;
  timeseries_rows_fresh_lt_72h?: number;
  capture_status: string;
  health_generated_at_utc?: string;
  regeneration_latency_ms?: number;
  active_sources?: string[];
}

export interface LiveMatchdaySnapshotPayload {
  schema_version?: string;
  generated_at: string;
  edge_matrix_records: unknown[];
  team_master_records: unknown[];
  outlooks_meta?: LiveMatchdayOutlooksMeta;
  outlooks: MatchOutlook[];
  [key: string]: unknown;
}

/**
 * Valida el snapshot consolidado `live_matchday_v3_snapshot.json` antes de escribirlo en disco.
 */
export function validateLiveOddsSnapshotCandidate(
  candidate: LiveMatchdaySnapshotPayload,
  previous: LiveMatchdaySnapshotPayload | null | undefined,
  options: { nowMs?: number } = {},
): ValidationResult<LiveMatchdaySnapshotPayload> {
  const nowMs = options.nowMs ?? Date.now();
  const issues: ValidationIssue[] = [];

  const genMs = parseStrictIsoMs(candidate.generated_at, { requireTimezone: true });
  if (genMs === null) {
    issues.push({
      code: "IMPOSSIBLE_DATE",
      path: "generated_at",
      message: `generated_at inválido en live_matchday_v3_snapshot: '${candidate.generated_at}'.`,
    });
  } else if (genMs > nowMs + MAX_FUTURE_CLOCK_SKEW_MS) {
    issues.push({
      code: "FUTURE_SNAPSHOT_TIMESTAMP",
      path: "generated_at",
      message: `generated_at futuro en live_matchday_v3_snapshot: '${candidate.generated_at}'.`,
    });
  }

  const metaGenRaw = candidate.outlooks_meta?.generated_at_utc;
  const metaGenMs = metaGenRaw
    ? parseStrictIsoMs(metaGenRaw, { requireTimezone: true })
    : null;
  if (metaGenRaw !== undefined) {
    if (metaGenMs === null) {
      issues.push({
        code: "IMPOSSIBLE_DATE",
        path: "outlooks_meta.generated_at_utc",
        message: `outlooks_meta.generated_at_utc inválido: '${metaGenRaw}'.`,
      });
    } else if (metaGenMs > nowMs + MAX_FUTURE_CLOCK_SKEW_MS) {
      issues.push({
        code: "FUTURE_SNAPSHOT_TIMESTAMP",
        path: "outlooks_meta.generated_at_utc",
        message: `outlooks_meta.generated_at_utc futuro: '${metaGenRaw}'.`,
      });
    }
  }

  if (previous) {
    const prevMs = parseStrictIsoMs(previous.generated_at, { requireTimezone: true });
    if (genMs !== null && prevMs !== null && genMs < prevMs) {
      issues.push({
        code: "STALE_CANDIDATE_OLDER_THAN_CURRENT",
        path: "generated_at",
        message: `live_matchday_v3_snapshot candidato (${candidate.generated_at}) es más viejo que el actual (${previous.generated_at}).`,
      });
    }
    const prevMetaMs = previous.outlooks_meta?.generated_at_utc
      ? parseStrictIsoMs(previous.outlooks_meta.generated_at_utc, { requireTimezone: true })
      : null;
    if (metaGenMs !== null && prevMetaMs !== null && metaGenMs < prevMetaMs) {
      issues.push({
        code: "STALE_CANDIDATE_OLDER_THAN_CURRENT",
        path: "outlooks_meta.generated_at_utc",
        message: `outlooks_meta candidato (${metaGenRaw}) es más viejo que el actual (${previous.outlooks_meta?.generated_at_utc}).`,
      });
    }
    if (candidate.outlooks.length === 0 && (previous.outlooks?.length ?? 0) > 0) {
      issues.push({
        code: "EMPTY_OR_REGRESSED_SNAPSHOT",
        path: "outlooks",
        message: `El candidato dejó 0 outlooks cuando el snapshot previo tenía ${previous.outlooks.length}.`,
      });
    }
  }

  for (const outlook of candidate.outlooks) {
    if (outlook.homeTeam.trim().toLowerCase() === outlook.awayTeam.trim().toLowerCase()) {
      issues.push({
        code: "SELF_MATCH_TEAM",
        path: `outlooks.${outlook.matchId}`,
        message: `Equipos idénticos en outlook '${outlook.matchId}': '${outlook.homeTeam}'.`,
      });
    }
    const kickoffMs = outlook.kickoffUtc
      ? parseStrictIsoMs(outlook.kickoffUtc, { requireTimezone: true })
      : null;
    if (outlook.kickoffUtc && kickoffMs === null) {
      issues.push({
        code: "IMPOSSIBLE_DATE",
        path: `outlooks.${outlook.matchId}.kickoffUtc`,
        message: `kickoffUtc imposible en '${outlook.matchId}': '${outlook.kickoffUtc}'.`,
      });
    }

    for (const mkt of outlook.markets) {
      for (const sel of mkt.selections) {
        if (!isValidDecimalOddsRange(sel.fairOdds.decimal)) {
          issues.push({
            code: "ODDS_OUT_OF_RANGE",
            path: `outlooks.${outlook.matchId}.${mkt.marketKey}.${sel.selection}`,
            message: `fairOdds fuera de rango en '${outlook.matchId}': ${sel.fairOdds.decimal}.`,
          });
        }
      }
      if (mkt.market !== null) {
        const bookNorm = mkt.market.book.trim().toLowerCase();
        if (BLOCKED_BOOK_IDS.has(bookNorm) || !PERMITTED_BOOK_IDS.has(bookNorm)) {
          issues.push({
            code: "BLOCKED_BOOK_SOURCE",
            path: `outlooks.${outlook.matchId}.${mkt.marketKey}.market`,
            message: `Casa bloqueada detectada en outlook publicado: '${mkt.market.book}'.`,
          });
        }
        const capMs = parseStrictIsoMs(mkt.market.tsCaptured, { requireTimezone: true });
        if (capMs === null) {
          issues.push({
            code: "IMPOSSIBLE_DATE",
            path: `outlooks.${outlook.matchId}.${mkt.marketKey}.market.tsCaptured`,
            message: `tsCaptured inválido: '${mkt.market.tsCaptured}'.`,
          });
        } else if (kickoffMs !== null && capMs > kickoffMs) {
          issues.push({
            code: "POST_KICKOFF_QUOTE",
            path: `outlooks.${outlook.matchId}.${mkt.marketKey}.market.tsCaptured`,
            message: `tsCaptured post-kickoff en outlook '${outlook.matchId}'.`,
          });
        }
        const ovr = mkt.market.overround;
        if (!Number.isFinite(ovr) || ovr < -1e-6 || ovr > MAX_VALID_OVERROUND - 1.0 + 1e-6) {
          issues.push({
            code: "ABSURD_OVERROUND",
            path: `outlooks.${outlook.matchId}.${mkt.marketKey}.market.overround`,
            message: `Overround fuera de rango en '${outlook.matchId}': ${ovr}.`,
          });
        }
        if (mkt.market.oddsBySelection) {
          for (const [selKey, price] of Object.entries(mkt.market.oddsBySelection)) {
            if (!isValidDecimalOddsRange(price)) {
              issues.push({
                code: "ODDS_OUT_OF_RANGE",
                path: `outlooks.${outlook.matchId}.${mkt.marketKey}.odds.${selKey}`,
                message: `Cuota de casa fuera de rango (${selKey}=${price}).`,
              });
            }
          }
        }
      }
    }
  }

  return issues.length === 0 ? { ok: true, value: candidate, issues: [] } : { ok: false, issues };
}
