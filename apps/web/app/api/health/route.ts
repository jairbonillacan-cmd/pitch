import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function detectRuntimeLabel(): string {
  const explicit = process.env.PITCHLAB_RUNTIME_LABEL?.trim();
  if (explicit) return explicit;
  if (process.env.K_SERVICE) return "cloud-run";
  if (process.env.VERCEL) return "vercel";
  if (process.env.FLY_APP_NAME) return "fly";
  if (process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID) return "railway";
  if (process.env.RENDER) return "render";
  if (process.env.AWS_EXECUTION_ENV || process.env.ECS_CONTAINER_METADATA_URI_V4) return "aws";
  if (process.env.CONTAINER_APP_NAME || process.env.WEBSITE_SITE_NAME) return "azure";
  return "node";
}

/**
 * Sonda ligera de salud agnóstica de proveedor (Docker HEALTHCHECK, Kubernetes, Cloud Run, Fly, Railway, ECS, VPS).
 * No toca la base de datos para responder en < 2 ms sin despertar conexiones inactivas de PostgreSQL.
 */
export function GET(): NextResponse {
  return NextResponse.json(
    {
      ok: true,
      service: "pitchlab-web",
      runtime: detectRuntimeLabel(),
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
