import { NextRequest, NextResponse } from "next/server";
import { resolveVerifiedNewsArticleSummary } from "../../../../src/server/espn-news";
import { PRODUCT_LEAGUES, type ProductLeague } from "../../../../src/server/snapshots";

function isProductLeague(value: string): value is ProductLeague {
  return (PRODUCT_LEAGUES as readonly string[]).includes(value);
}

/**
 * Devuelve en JSON el resumen editorial limpio de una nota verificada del feed de la liga
 * para mostrarlo dentro del lector de PitchLab, sin redirigir fuera de la plataforma.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const leagueRaw = (searchParams.get("league") ?? "").trim();
  const idRaw = (searchParams.get("id") ?? "").trim();

  if (!isProductLeague(leagueRaw) || !/^\d{1,20}$/.test(idRaw)) {
    return NextResponse.json({ error: "Parámetros de noticia inválidos" }, { status: 400 });
  }

  const summary = await resolveVerifiedNewsArticleSummary(leagueRaw, idRaw);
  if (!summary) {
    return NextResponse.json({ error: "Nota no encontrada" }, { status: 404 });
  }

  const response = NextResponse.json(summary, { status: 200 });
  response.headers.set("Cache-Control", "private, max-age=300");
  return response;
}
