/**
 * Cuotas de cierre congeladas justo antes del inicio de cada partido para calcular el CLV real.
 */
import { and, desc, eq, inArray, lte } from "drizzle-orm";
import type { Db } from "./billing";
import { closingOdds } from "./schema";

const STRICT_CANONICAL_NUMBER_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

function parseStrictDbNumber(raw: unknown): number | null {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? (raw === 0 ? 0 : raw) : null;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!STRICT_CANONICAL_NUMBER_RE.test(trimmed)) return null;
    const parsed = Number.parseFloat(trimmed);
    return Number.isFinite(parsed) ? (parsed === 0 ? 0 : parsed) : null;
  }
  return null;
}

export interface ClosingOddsInput {
  gameId: string;
  market: string;
  selection: string;
  lineKey?: string;
  book: string;
  decimalOdds: number;
  fairDecimal?: number | null;
  noVigProb?: number | null;
  source: string;
  kickoffAt: Date;
  capturedAt: Date;
}

export interface ClosingOddsRow {
  gameId: string;
  market: string;
  selection: string;
  lineKey: string;
  book: string;
  decimalOdds: number;
  fairDecimal: number | null;
  noVigProb: number | null;
  source: string;
  kickoffAt: Date;
  capturedAt: Date;
}

/** Guarda o actualiza la última cuota observada antes del kickoff (`capturedAt <= kickoffAt`). */
export async function upsertClosingOdds(db: Db, rows: readonly ClosingOddsInput[], now = new Date()): Promise<number> {
  const valid = rows.filter(
    (r) =>
      r.gameId.trim().length > 0 &&
      r.market.trim().length > 0 &&
      r.selection.trim().length > 0 &&
      Number.isFinite(r.decimalOdds) &&
      r.decimalOdds >= 1.01 &&
      r.decimalOdds <= 1000 &&
      r.capturedAt.getTime() <= r.kickoffAt.getTime(),
  );
  if (valid.length === 0) return 0;

  let written = 0;
  for (const r of valid) {
    const lineKey = (r.lineKey ?? "").trim();
    const market = r.market.trim().toLowerCase();
    const selection = r.selection.trim().toLowerCase();
    const [existing] = await db
      .select({ capturedAt: closingOdds.capturedAt })
      .from(closingOdds)
      .where(
        and(
          eq(closingOdds.gameId, r.gameId),
          eq(closingOdds.market, market),
          eq(closingOdds.selection, selection),
          eq(closingOdds.lineKey, lineKey),
        ),
      )
      .limit(1);

    if (existing && existing.capturedAt.getTime() >= r.capturedAt.getTime()) {
      continue;
    }

    const values = {
      gameId: r.gameId.trim(),
      market,
      selection,
      lineKey,
      book: r.book.trim().slice(0, 64) || "mercado",
      decimalOdds: r.decimalOdds.toFixed(3),
      fairDecimal:
        r.fairDecimal !== undefined && r.fairDecimal !== null && Number.isFinite(r.fairDecimal) && r.fairDecimal >= 1.01
          ? r.fairDecimal.toFixed(3)
          : null,
      noVigProb:
        r.noVigProb !== undefined && r.noVigProb !== null && Number.isFinite(r.noVigProb) && r.noVigProb > 0 && r.noVigProb < 1
          ? r.noVigProb.toFixed(5)
          : null,
      source: r.source.trim().slice(0, 64) || "snapshot",
      kickoffAt: r.kickoffAt,
      capturedAt: r.capturedAt,
      updatedAt: now,
    };

    await db
      .insert(closingOdds)
      .values(values)
      .onConflictDoUpdate({
        target: [closingOdds.gameId, closingOdds.market, closingOdds.selection, closingOdds.lineKey],
        set: {
          book: values.book,
          decimalOdds: values.decimalOdds,
          fairDecimal: values.fairDecimal,
          noVigProb: values.noVigProb,
          source: values.source,
          kickoffAt: values.kickoffAt,
          capturedAt: values.capturedAt,
          updatedAt: values.updatedAt,
        },
      });
    written += 1;
  }

  return written;
}

export async function listClosingOddsForGames(db: Db, gameIds: readonly string[]): Promise<ClosingOddsRow[]> {
  const uniqueIds = Array.from(new Set(gameIds.map((id) => id.trim()).filter(Boolean)));
  if (uniqueIds.length === 0) return [];
  const rows = await db
    .select()
    .from(closingOdds)
    .where(and(inArray(closingOdds.gameId, uniqueIds), lte(closingOdds.capturedAt, closingOdds.kickoffAt)))
    .orderBy(desc(closingOdds.capturedAt));
  return rows.map((r) => ({
    gameId: r.gameId,
    market: r.market,
    selection: r.selection,
    lineKey: r.lineKey,
    book: r.book,
    decimalOdds: parseStrictDbNumber(r.decimalOdds) ?? 0,
    fairDecimal: r.fairDecimal ? parseStrictDbNumber(r.fairDecimal) : null,
    noVigProb: r.noVigProb ? parseStrictDbNumber(r.noVigProb) : null,
    source: r.source,
    kickoffAt: r.kickoffAt,
    capturedAt: r.capturedAt,
  }));
}
