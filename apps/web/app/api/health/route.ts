import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Sonda ligera de salud para Google Cloud Run (startup / liveness) y monitoreo externo.
 * No toca la base de datos para responder en < 2 ms sin despertar conexiones inactivas de Neon.
 */
export function GET(): NextResponse {
  return NextResponse.json(
    {
      ok: true,
      service: "pitchlab-web",
      runtime: process.env.K_SERVICE ? "cloud-run" : process.env.VERCEL ? "vercel" : "node",
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
