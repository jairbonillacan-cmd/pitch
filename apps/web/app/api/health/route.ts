import { NextResponse } from "next/server";
import { withPublicRead } from "../../../src/server/api-guards";

export const runtime = "nodejs";
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

export const GET = withPublicRead(
  {
    bucket: "health",
    skipRateLimit: true,
    cacheControl: "no-store",
  },
  () =>
    NextResponse.json(
      {
        ok: true,
        service: "pitchlab-web",
        runtime: detectRuntimeLabel(),
      },
      { status: 200 },
    ),
);
