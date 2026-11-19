/**
 * Parte 2 · Recolección honesta de bajas y lesiones por liga desde fuentes públicas permitidas:
 *   - NFL: `nflverse` CC-BY 4.0 (`injuries_<season>.csv`) con respaldo en API pública de ESPN NFL.
 *   - Fútbol (6 ligas): API pública de ESPN (`site.api.espn.com/.../injuries`). Cuando la fuente
 *     no publica parte médico abierto para una liga, se escribe `entries: []` con
 *     `coverageStatus: "no_public_feed"` (jamás se inventan jugadores ni estados).
 *
 * Antes de tocar disco, todo candidato pasa por `validateLeagueInjuriesCandidate` (Parte 3).
 * Si la red o la validación fallan, se conserva intacto el `injuries.json` anterior.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  asLeagueId,
  asTeamId,
  type InjuryStatus,
  type LeagueInjuriesFile,
  type LeagueSnapshot,
  type TeamInjuryEntry,
} from "@pitchlab/contracts";
import { resolveCanonicalTeam, type TeamLeague } from "../mappings.js";
import { parseCsv } from "./nflverse.js";
import {
  parseStrictIsoMs,
  validateLeagueInjuriesCandidate,
  type ValidationIssue,
} from "../validation/snapshot-validator.js";

const ESPN_INJURIES_SLUGS: Readonly<Record<string, { sportPath: string; slug: string }>> = {
  nfl: { sportPath: "football", slug: "nfl" },
  nba: { sportPath: "basketball", slug: "nba" },
  nhl: { sportPath: "hockey", slug: "nhl" },
  mlb: { sportPath: "baseball", slug: "mlb" },
  "premier-league": { sportPath: "soccer", slug: "eng.1" },
  laliga: { sportPath: "soccer", slug: "esp.1" },
  bundesliga: { sportPath: "soccer", slug: "ger.1" },
  "serie-a": { sportPath: "soccer", slug: "ita.1" },
  "ligue-1": { sportPath: "soccer", slug: "fra.1" },
  "liga-mx": { sportPath: "soccer", slug: "mex.1" },
};

export interface FetchTextOrJson {
  fetchText(url: string): Promise<{ status: number; body: string }>;
}

const defaultHttpFetcher: FetchTextOrJson = {
  async fetchText(url: string) {
    const isEspn = url.includes("espn.com/");
    const res = await fetch(url, {
      headers: isEspn
        ? { accept: "application/json, text/plain, */*" }
        : {
            accept: "application/json, text/csv, text/plain, */*",
            "user-agent": "PitchLab-Bot/1.0 (+https://pitchlab.mx; data-research)",
          },
      signal: AbortSignal.timeout(15_000),
    });
    const body = await res.text();
    return { status: res.status, body };
  },
};

function mapRawStatusToInjuryStatus(raw: string | undefined): InjuryStatus | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (
    s === "out" ||
    s === "injured reserve" ||
    s === "ir" ||
    s === "ltir" ||
    s === "suspended" ||
    s === "suspension" ||
    s === "pup" ||
    s === "non-football injury" ||
    s === "baja" ||
    s.includes("-day il") ||
    s.includes("injured list") ||
    s.startsWith("il-") ||
    s === "bereavement" ||
    s === "paternity" ||
    s === "restricted"
  ) {
    return "Baja";
  }
  if (
    s === "doubtful" ||
    s === "questionable" ||
    s === "day-to-day" ||
    s === "day to day" ||
    s === "duda"
  ) {
    return "Duda";
  }
  return null;
}

function normalizeIsoTimestamp(raw: string | undefined, fallbackIso: string): string {
  if (!raw) return fallbackIso;
  const ms = parseStrictIsoMs(raw);
  if (ms === null) return fallbackIso;
  return new Date(ms).toISOString();
}

function translateInjuryDetailEs(rawDetail: string | undefined, rawStatus: string | undefined): string {
  const cleaned = (rawDetail ?? "").trim();
  const map: Readonly<Record<string, string>> = {
    hamstring: "Isquiotibiales",
    knee: "Rodilla",
    ankle: "Tobillo",
    concussion: "Protocolo de conmoción",
    shoulder: "Hombro",
    calf: "Gemelo",
    groin: "Ingle",
    quadricep: "Cuádriceps",
    thigh: "Muslo",
    back: "Espalda",
    illness: "Enfermedad",
    foot: "Pie",
    hip: "Cadera",
    wrist: "Muñeca",
    rib: "Costillas",
    ribs: "Costillas",
    neck: "Cuello",
    achilles: "Tendón de Aquiles",
    suspension: "Suspensión",
    suspended: "Suspensión",
    undisclosed: "Parte médico reservado",
  };
  if (cleaned) {
    const translated = map[cleaned.toLowerCase()];
    if (translated) return translated;
    return cleaned.slice(0, 180);
  }
  const st = (rawStatus ?? "").trim().toLowerCase();
  if (st.includes("suspend")) return "Suspensión";
  if (st.includes("reserve") || st === "ir") return "Reserva de lesionados";
  return "Reporte oficial del club";
}

export function parseNflverseInjuriesCsv(params: {
  readonly csvText: string;
  readonly targetWeek?: number | null;
  readonly observedAtIso: string;
}): TeamInjuryEntry[] {
  const rows = parseCsv(params.csvText);
  if (rows.length === 0) return [];

  let targetWeek = params.targetWeek ?? null;
  if (targetWeek === null) {
    let maxW = 0;
    for (const r of rows) {
      const w = Number(r.week ?? 0);
      if (Number.isFinite(w) && w > maxW) maxW = w;
    }
    targetWeek = maxW > 0 ? maxW : null;
  }

  const dedup = new Map<string, TeamInjuryEntry>();
  for (const r of rows) {
    if (targetWeek !== null && Number(r.week ?? 0) !== targetWeek) continue;
    const rawTeam = (r.team ?? "").trim();
    const player = (r.full_name ?? r.player_name ?? "").trim();
    const reportStatus = (r.report_status ?? r.game_status ?? "").trim();
    const mappedStatus = mapRawStatusToInjuryStatus(reportStatus);
    if (!rawTeam || !player || !mappedStatus) continue;

    let teamIdStr: string;
    try {
      teamIdStr = resolveCanonicalTeam("nfl", rawTeam).id;
    } catch (err) {
      void err;
      continue;
    }

    const primaryInjury = (r.report_primary_injury ?? r.practice_primary_injury ?? "").trim();
    const position = (r.position ?? "").trim();
    const reportedAt = normalizeIsoTimestamp(r.date_modified, params.observedAtIso);
    const entry: TeamInjuryEntry = {
      teamId: asTeamId(teamIdStr),
      player: player.slice(0, 120),
      ...(position ? { position: position.slice(0, 40) } : {}),
      status: mappedStatus,
      detail: translateInjuryDetailEs(primaryInjury, reportStatus),
      reportedAt,
    };
    dedup.set(`${teamIdStr}::${player.toLowerCase()}`, entry);
  }

  return [...dedup.values()].slice(0, 400);
}

export function parseEspnInjuriesPayload(params: {
  readonly payload: unknown;
  readonly league: TeamLeague;
  readonly observedAtIso: string;
}): TeamInjuryEntry[] {
  if (!params.payload || typeof params.payload !== "object") return [];
  const root = params.payload as Record<string, unknown>;
  const teamBlocks = Array.isArray(root.injuries) ? root.injuries : [];

  const dedup = new Map<string, TeamInjuryEntry>();
  for (const rawBlock of teamBlocks) {
    if (!rawBlock || typeof rawBlock !== "object") continue;
    const block = rawBlock as Record<string, unknown>;
    const teamObj =
      block.team && typeof block.team === "object"
        ? (block.team as Record<string, unknown>)
        : block;
    const rawTeamName = String(
      block.displayName ?? teamObj.displayName ?? teamObj.name ?? teamObj.abbreviation ?? "",
    ).trim();
    if (!rawTeamName) continue;

    let teamIdStr: string;
    try {
      teamIdStr = resolveCanonicalTeam(params.league, rawTeamName).id;
    } catch (err) {
      void err;
      continue;
    }

    const items = Array.isArray(block.injuries) ? block.injuries : [];
    for (const rawInj of items) {
      if (!rawInj || typeof rawInj !== "object") continue;
      const inj = rawInj as Record<string, unknown>;
      const athlete =
        inj.athlete && typeof inj.athlete === "object"
          ? (inj.athlete as Record<string, unknown>)
          : {};
      const player = String(
        athlete.displayName ?? athlete.fullName ?? athlete.shortName ?? "",
      ).trim();
      const statusRaw = String(inj.status ?? inj.type ?? "").trim();
      const mappedStatus = mapRawStatusToInjuryStatus(statusRaw);
      if (!player || !mappedStatus) continue;

      const posObj =
        athlete.position && typeof athlete.position === "object"
          ? (athlete.position as Record<string, unknown>)
          : null;
      const position = String(posObj?.abbreviation ?? posObj?.name ?? "").trim();
      const detailsObj =
        inj.details && typeof inj.details === "object"
          ? (inj.details as Record<string, unknown>)
          : null;
      const rawDetail = String(
        detailsObj?.type ?? detailsObj?.detail ?? inj.shortComment ?? "",
      ).trim();
      const rawReturn =
        typeof detailsObj?.returnDate === "string" ? detailsObj.returnDate.trim() : "";
      const returnDate = rawReturn
        ? /^\d{4}-\d{2}-\d{2}/.test(rawReturn)
          ? rawReturn.slice(0, 10)
          : rawReturn.slice(0, 80)
        : undefined;
      const reportedAt = normalizeIsoTimestamp(
        typeof inj.date === "string" ? inj.date : undefined,
        params.observedAtIso,
      );

      const entry: TeamInjuryEntry = {
        teamId: asTeamId(teamIdStr),
        player: player.slice(0, 120),
        ...(position ? { position: position.slice(0, 40) } : {}),
        status: mappedStatus,
        detail: translateInjuryDetailEs(rawDetail, statusRaw),
        ...(rawDetail ? { injuryType: rawDetail.slice(0, 120) } : {}),
        ...(returnDate ? { returnDate } : {}),
        reportedAt,
      };
      dedup.set(`${teamIdStr}::${player.toLowerCase()}`, entry);
    }
  }

  return [...dedup.values()].slice(0, 400);
}

/**
 * Fusiona entradas primarias (p. ej. Bzzoiro squad availability con fecha de regreso) y
 * secundarias (p. ej. ESPN) sin duplicar jugadores por equipo, conservando `returnDate` e `injuryType`.
 */
export function mergeLeagueInjuryEntries(
  primary: readonly TeamInjuryEntry[],
  secondary: readonly TeamInjuryEntry[],
): TeamInjuryEntry[] {
  const byKey = new Map<string, TeamInjuryEntry>();
  for (const item of secondary) {
    byKey.set(`${item.teamId}::${item.player.toLowerCase()}`, item);
  }
  for (const item of primary) {
    const k = `${item.teamId}::${item.player.toLowerCase()}`;
    const prev = byKey.get(k);
    byKey.set(k, {
      ...(prev ?? item),
      ...item,
      returnDate: item.returnDate ?? prev?.returnDate,
      injuryType: item.injuryType ?? prev?.injuryType,
    });
  }
  return [...byKey.values()].slice(0, 500);
}

export function loadPreviousLeagueInjuries(
  snapshotsRoot: string,
  league: TeamLeague,
): LeagueInjuriesFile | null {
  const filePath = resolve(snapshotsRoot, league, "injuries.json");
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as LeagueInjuriesFile;
  } catch (err) {
    void err;
    return null;
  }
}

function readActiveNflWeek(snapshotsRoot: string): { seasonYear: number; week: number | null } {
  const latestPath = resolve(snapshotsRoot, "nfl", "latest.json");
  if (!existsSync(latestPath)) return { seasonYear: 2026, week: null };
  try {
    const snap = JSON.parse(readFileSync(latestPath, "utf8")) as LeagueSnapshot;
    const yearMatch = /^(\d{4})/.exec(String(snap.season));
    const seasonYear = yearMatch ? Number(yearMatch[1]) : 2026;
    const upcomingWeeks = snap.games
      .filter((g) => g.status !== "final" && typeof g.week === "number")
      .map((g) => g.week!);
    return {
      seasonYear,
      week: upcomingWeeks[0] ?? snap.games[0]?.week ?? null,
    };
  } catch (err) {
    void err;
    return { seasonYear: 2026, week: null };
  }
}

function writeJsonAtomicPreservingEol(filePath: string, payload: unknown): void {
  let eol = "\n";
  if (existsSync(filePath)) {
    try {
      const head = readFileSync(filePath, "utf8").slice(0, 2048);
      if (head.includes("\r\n")) eol = "\r\n";
    } catch (err) {
      void err;
    }
  }
  mkdirSync(dirname(filePath), { recursive: true });
  const content = `${JSON.stringify(payload, null, 2)}\n`.replace(/\r?\n/g, eol);
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmpPath, content, "utf8");
  renameSync(tmpPath, filePath);
}

export interface CollectLeagueInjuriesResult {
  readonly league: TeamLeague;
  readonly ok: boolean;
  readonly wroteFile: boolean;
  readonly entriesCount: number;
  readonly source: string;
  readonly coverageStatus: LeagueInjuriesFile["coverageStatus"];
  readonly issues: readonly ValidationIssue[];
  readonly errorMessage?: string;
}

export async function collectAndWriteLeagueInjuries(params: {
  readonly snapshotsRoot: string;
  readonly league: TeamLeague;
  readonly observedAtIso?: string;
  readonly fetcher?: FetchTextOrJson;
  readonly extraEntries?: readonly TeamInjuryEntry[];
  readonly dryRun?: boolean;
}): Promise<CollectLeagueInjuriesResult> {
  const fetcher = params.fetcher ?? defaultHttpFetcher;
  const observedAtIso = params.observedAtIso ?? new Date().toISOString();
  const nowMs = parseStrictIsoMs(observedAtIso, { requireTimezone: true }) ?? Date.now();
  const previous = loadPreviousLeagueInjuries(params.snapshotsRoot, params.league);
  const targetPath = resolve(params.snapshotsRoot, params.league, "injuries.json");

  let entries: TeamInjuryEntry[] = [];
  let source = "espn-public";
  let coverageStatus: LeagueInjuriesFile["coverageStatus"] = "no_public_feed";

  try {
    if (params.league === "nfl") {
      const { seasonYear, week } = readActiveNflWeek(params.snapshotsRoot);
      const nflverseUrl = `https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_${seasonYear}.csv`;
      const csvResp = await fetcher.fetchText(nflverseUrl);
      if (csvResp.status === 200 && csvResp.body.trim().length > 0) {
        entries = parseNflverseInjuriesCsv({
          csvText: csvResp.body,
          targetWeek: week,
          observedAtIso,
        });
        if (entries.length > 0) {
          source = "nflverse-cc-by-4.0";
          coverageStatus = "ok";
        }
      }

      if (entries.length === 0) {
        const espnResp = await fetcher.fetchText(
          "https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries",
        );
        if (espnResp.status === 200) {
          entries = parseEspnInjuriesPayload({
            payload: JSON.parse(espnResp.body) as unknown,
            league: "nfl",
            observedAtIso,
          });
          source = "espn-public-nfl";
          coverageStatus = entries.length > 0 ? "ok" : "no_public_feed";
        } else if (csvResp.status !== 200 && csvResp.status !== 404) {
          throw new Error(
            `Fuentes de bajas NFL respondieron HTTP ${csvResp.status} / HTTP ${espnResp.status}.`,
          );
        }
      }
    } else {
      const cfg = ESPN_INJURIES_SLUGS[params.league];
      if (!cfg) {
        coverageStatus = "no_public_feed";
      } else {
        const url = `https://site.api.espn.com/apis/site/v2/sports/${cfg.sportPath}/${cfg.slug}/injuries`;
        const resp = await fetcher.fetchText(url);
        if (resp.status === 200) {
          const parsedJson = JSON.parse(resp.body) as unknown;
          entries = parseEspnInjuriesPayload({
            payload: parsedJson,
            league: params.league,
            observedAtIso,
          });
          source = `espn-public-${cfg.slug}`;
          coverageStatus = entries.length > 0 ? "ok" : "no_public_feed";
        } else if (
          resp.status === 404 ||
          (cfg.sportPath === "soccer" && resp.status === 403)
        ) {
          source = `espn-public-${cfg.slug}`;
          coverageStatus = "no_public_feed";
          entries = [];
        } else {
          throw new Error(`ESPN injuries (${params.league}) respondió HTTP ${resp.status}.`);
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      league: params.league,
      ok: false,
      wroteFile: false,
      entriesCount: previous?.entries.length ?? 0,
      source: previous?.source ?? source,
      coverageStatus: previous?.coverageStatus ?? "no_public_feed",
      issues: [],
      errorMessage: msg,
    };
  }

  // Fusión con bajas enriquecidas externas (p. ej. Bzzoiro `/teams/{id}/squad/` con fecha de regreso).
  if (params.extraEntries && params.extraEntries.length > 0) {
    entries = mergeLeagueInjuryEntries(params.extraEntries, entries);
    coverageStatus = entries.length > 0 ? "ok" : coverageStatus;
    if (!source.includes("bzzoiro")) {
      source = entries.length > 0 ? `${source}+bzzoiro` : source;
    }
  }

  // Si la fuente pública viene vacía temporalmente pero el archivo previo tenía bajas frescas (< 18 h),
  // conservamos las entradas previas marcando cobertura parcial para no borrar un parte médico válido.
  if (entries.length === 0 && previous && previous.entries.length > 0) {
    const prevMs = parseStrictIsoMs(previous.observedAt, { requireTimezone: true });
    if (prevMs !== null && nowMs - prevMs <= 18 * 3_600_000) {
      entries = [...previous.entries];
      source = previous.source;
      coverageStatus = "partial";
    }
  }

  const candidate: LeagueInjuriesFile = {
    schemaVersion: 1,
    league: asLeagueId(params.league),
    observedAt: observedAtIso,
    source,
    coverageStatus,
    entries,
  };

  const validation = validateLeagueInjuriesCandidate(candidate, previous, { nowMs });
  if (!validation.ok) {
    return {
      league: params.league,
      ok: false,
      wroteFile: false,
      entriesCount: previous?.entries.length ?? 0,
      source: previous?.source ?? source,
      coverageStatus: previous?.coverageStatus ?? "no_public_feed",
      issues: validation.issues,
      errorMessage: validation.issues.map((i) => i.message).join("; "),
    };
  }

  if (!params.dryRun) {
    writeJsonAtomicPreservingEol(targetPath, validation.value);
  }

  return {
    league: params.league,
    ok: true,
    wroteFile: !params.dryRun,
    entriesCount: entries.length,
    source,
    coverageStatus,
    issues: [],
  };
}
