import { NextResponse } from "next/server";
import type { SgpLegInput } from "@pitchlab/spacetime/v5";
import { checkEndpointRateLimit, trustedClientIp } from "../../../../src/server/request-security";
import { evaluateSgpCopulaV5 } from "../../../../src/server/spacetime-v5";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_FACTORS: Readonly<Record<"soccer" | "nfl", ReadonlySet<string>>> = {
  soccer: new Set([
    "goal_diff",
    "total_goals",
    "ht_total_goals",
    "home_corners",
    "away_corners",
    "total_corners",
    "total_yellow_cards",
    "total_shots_on_target",
  ]),
  nfl: new Set([
    "home_margin",
    "total_points",
    "home_pass_attempts",
    "home_rush_attempts",
    "away_pass_attempts",
    "away_rush_attempts",
  ]),
};

interface SgpRequestBody {
  sport?: unknown;
  legs?: unknown;
  offeredCombinedDecimalOdds?: unknown;
}

export async function POST(request: Request): Promise<NextResponse> {
  const rate = await checkEndpointRateLimit({
    bucket: "parlays-sgp-eval",
    key: trustedClientIp(request.headers) || "local",
    limit: 90,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Demasiadas consultas de correlación. Espera unos segundos." },
      { status: 429 },
    );
  }

  let body: SgpRequestBody;
  try {
    body = (await request.json()) as SgpRequestBody;
  } catch (err) {
    void err;
    return NextResponse.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
  }

  const sport = body.sport === "soccer" || body.sport === "nfl" ? body.sport : null;
  if (!sport) {
    return NextResponse.json({ error: "Deporte SGP no soportado (soccer o nfl)." }, { status: 400 });
  }

  if (!Array.isArray(body.legs) || body.legs.length < 2 || body.legs.length > 8) {
    return NextResponse.json(
      { error: "Se requieren entre 2 y 8 selecciones del mismo partido." },
      { status: 400 },
    );
  }

  const validFactors = ALLOWED_FACTORS[sport];
  const legs: SgpLegInput[] = [];
  for (let i = 0; i < body.legs.length; i += 1) {
    const raw = body.legs[i] as Record<string, unknown> | null;
    if (!raw || typeof raw !== "object") {
      return NextResponse.json({ error: `Selección ${i + 1} inválida.` }, { status: 400 });
    }
    const factor = typeof raw.factor === "string" ? raw.factor.trim() : "";
    const p = typeof raw.marginalProbability === "number" ? raw.marginalProbability : Number.NaN;
    const direction = raw.direction === 1 || raw.direction === -1 ? raw.direction : null;
    const legId = typeof raw.legId === "string" && raw.legId.trim() ? raw.legId.trim().slice(0, 80) : `leg_${i + 1}`;
    if (!validFactors.has(factor) || !Number.isFinite(p) || p <= 0.001 || p >= 0.999 || direction === null) {
      return NextResponse.json(
        { error: `Parámetros fuera de rango en selección ${i + 1}.` },
        { status: 400 },
      );
    }
    legs.push({ legId, factor, marginalProbability: p, direction });
  }

  let offered: number | null = null;
  if (body.offeredCombinedDecimalOdds !== undefined && body.offeredCombinedDecimalOdds !== null) {
    const num = Number(body.offeredCombinedDecimalOdds);
    if (!Number.isFinite(num) || num <= 1.01 || num > 1000) {
      return NextResponse.json({ error: "Momio decimal ofrecido inválido." }, { status: 400 });
    }
    offered = num;
  }

  const audit = evaluateSgpCopulaV5({
    sport,
    legs,
    offeredCombinedDecimalOdds: offered,
  });

  return NextResponse.json({ audit }, { headers: { "Cache-Control": "no-store" } });
}
