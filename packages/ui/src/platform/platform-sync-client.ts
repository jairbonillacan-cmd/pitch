import { parseStrictFiniteNumber } from "@pitchlab/contracts";
import type { SocialFeedScope } from "./platform-storage";
import type { JournalEntry } from "./types";

export interface ServerJournalRow {
  id: string;
  pickId: string;
  gameId: string;
  leagueLabel: string;
  matchLabel: string;
  pickLabel: string;
  origin: string;
  units: string;
  userDecimal: string;
  fairDecimal: string;
  clvPct: string | null;
  closingDecimal?: string | null;
  status: string;
  pickKind?: string | null;
  parlayLegs?: JournalEntry["parlayLegs"] | null;
  parlayLegResults?: JournalEntry["parlayLegResults"] | null;
  note: string | null;
  sealedAt: string;
  settledAt?: string | null;
}

export const SEAL_ERRORS: Readonly<Record<string, string>> = {
  partido_iniciado: "El partido ya empezó: no se puede sellar.",
  unidades_invalidas: "Las unidades deben estar entre 0.25u y 5u.",
  momio_invalido: "Momio inválido.",
  ya_sellado: "Ese pick ya estaba sellado en Mi récord.",
  parlay_invalido: "Las selecciones de este parlay ya no son compatibles o faltan en cartelera.",
};

const VALID_JOURNAL_ORIGINS: Readonly<Record<string, JournalEntry["origin"]>> = {
  "Spacetime Suite": "Spacetime Suite",
  "Parlay Combinado": "Parlay Combinado",
  "Player Prop": "Player Prop",
  Propio: "Propio",
};

export function fromServerRow(row: ServerJournalRow): JournalEntry {
  const status: JournalEntry["status"] =
    row.status === "won" || row.status === "lost" || row.status === "void" ? row.status : "pending";
  return {
    id: row.id,
    pickId: row.pickId,
    gameId: row.gameId,
    leagueLabel: row.leagueLabel,
    matchLabel: row.matchLabel,
    pickLabel: row.pickLabel,
    origin: VALID_JOURNAL_ORIGINS[row.origin] ?? "Propio",
    units: parseStrictFiniteNumber(row.units) ?? 0,
    userDecimal: parseStrictFiniteNumber(row.userDecimal) ?? 0,
    fairDecimal: parseStrictFiniteNumber(row.fairDecimal) ?? 0,
    clvPct:
      row.clvPct === null ? undefined : (parseStrictFiniteNumber(row.clvPct) ?? undefined),
    closingDecimal: row.closingDecimal ? parseStrictFiniteNumber(row.closingDecimal) : null,
    status,
    pickKind: row.pickKind === "parlay" ? "parlay" : "single",
    ...(Array.isArray(row.parlayLegs) ? { parlayLegs: row.parlayLegs } : {}),
    ...(Array.isArray(row.parlayLegResults) ? { parlayLegResults: row.parlayLegResults } : {}),
    sealedAt: new Date(row.sealedAt).toLocaleString("es-MX", {
      dateStyle: "short",
      timeStyle: "short",
    }),
    sealedAtIso: new Date(row.sealedAt).toISOString(),
    settledAtIso: row.settledAt ? new Date(row.settledAt).toISOString() : null,
    note: row.note ?? undefined,
  };
}

export async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { credentials: "same-origin" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch (err) {
    void err;
    return null;
  }
}

export async function postJson(url: string, body: unknown): Promise<Response | null> {
  try {
    return await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    void err;
    return null;
  }
}

export async function sealOnServer(
  entry: JournalEntry,
): Promise<{ ok: boolean; id?: string; reason?: string }> {
  const res = await postJson("/api/me/journal", {
    pickId: entry.pickId,
    gameId: entry.gameId,
    leagueLabel: entry.leagueLabel,
    matchLabel: entry.matchLabel,
    pickLabel: entry.pickLabel,
    origin: entry.origin,
    units: entry.units,
    userDecimal: entry.userDecimal,
    fairDecimal: entry.fairDecimal,
    pickKind: entry.pickKind ?? "single",
    ...(entry.pickKind === "parlay" && entry.parlayLegs
      ? { parlayLegs: entry.parlayLegs.map((l) => ({ gameId: l.gameId, pickId: l.pickId })) }
      : {}),
    note: entry.note,
  });
  if (!res) return { ok: false };
  if (res.status === 401 || res.status === 503) return { ok: false, reason: "sin_sesion" };
  const raw: unknown = await res.json().catch(() => ({}));
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false };
  }
  const okVal: unknown = Reflect.get(raw, "ok");
  const idVal: unknown = Reflect.get(raw, "id");
  const reasonVal: unknown = Reflect.get(raw, "reason");
  return {
    ok: Boolean(okVal),
    id: typeof idVal === "string" ? idVal : undefined,
    reason: typeof reasonVal === "string" ? reasonVal : undefined,
  };
}

export function buildSocialFeedQueryParams(
  limit: number,
  scope?: SocialFeedScope,
  before?: string | null,
): URLSearchParams {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set("before", before);
  if (scope?.following) params.set("following", "1");
  if (scope?.author) params.set("author", scope.author.trim().toLowerCase());
  if (scope?.gameId) params.set("gameId", scope.gameId.trim());
  if (scope?.leagueLabel && scope.leagueLabel !== "all") params.set("league", scope.leagueLabel);
  if (scope?.openPickOnly) params.set("openPick", "1");
  if (scope?.sort === "most_commented") params.set("sort", "most_commented");
  return params;
}
