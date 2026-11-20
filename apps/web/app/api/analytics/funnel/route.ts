import { NextResponse } from "next/server";
import { eq, recordFunnelEvent, users } from "@pitchlab/db";
import {
  checkEndpointRateLimit,
  rateLimitResponse,
  trustedClientIp,
  verifySameOriginMutation,
} from "../../../../src/server/request-security";
import { optionalPublicDbSession } from "../../../../src/server/session-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ClientFunnelStage = "landing" | "signup_step1";
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

function parseClientFunnelStage(raw: unknown): ClientFunnelStage | null {
  return raw === "landing" || raw === "signup_step1" ? raw : null;
}

function sanitizeSourcePath(raw: unknown, stage: ClientFunnelStage): string {
  if (typeof raw !== "string") return stage === "landing" ? "/" : "/signup";
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return stage === "landing" ? "/" : "/signup";
  }
  return trimmed.split(/[?#]/, 1)[0]!.slice(0, 120) || "/";
}

/**
 * POST /api/analytics/funnel — registra eventos iniciales del embudo propios
 * estrictamente cuando existe consentimiento explícito de analítica (`analyticsConsent`).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const csrfError = verifySameOriginMutation(request);
  if (csrfError) return csrfError;

  const rl = await checkEndpointRateLimit({
    bucket: "analytics-funnel",
    key: trustedClientIp(request.headers) || "local",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return rateLimitResponse(rl.retryAfterSeconds, "Límite temporal de registro de embudo.");
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const stage = parseClientFunnelStage(body?.stage);
  if (!stage) {
    return NextResponse.json({ ok: false, error: "Etapa de embudo no permitida." }, { status: 400 });
  }
  const sourcePath = sanitizeSourcePath(body?.sourcePath, stage);

  const session = await optionalPublicDbSession(request);
  if (!session) {
    return NextResponse.json({ ok: true, recorded: false });
  }

  if (session.userId) {
    const [row] = await session.db
      .select({ analyticsConsent: users.analyticsConsent })
      .from(users)
      .where(eq(users.id, session.userId));
    if (!row?.analyticsConsent) {
      return NextResponse.json({ ok: true, recorded: false });
    }
    const recorded = await recordFunnelEvent(session.db, {
      eventName: stage,
      sessionKey: session.userId,
      userId: session.userId,
      sourcePath,
    });
    return NextResponse.json({ ok: true, recorded }, { status: recorded ? 201 : 200 });
  }

  if (body?.consent !== true) {
    return NextResponse.json({ ok: true, recorded: false });
  }
  const anonymousSessionId =
    typeof body?.anonymousSessionId === "string" ? body.anonymousSessionId.trim() : "";
  if (!SESSION_ID_PATTERN.test(anonymousSessionId)) {
    return NextResponse.json({ ok: false, error: "Sesión anónima inválida." }, { status: 400 });
  }

  const recorded = await recordFunnelEvent(session.db, {
    eventName: stage,
    sessionKey: `anon:${anonymousSessionId}`,
    userId: null,
    sourcePath,
  });
  return NextResponse.json({ ok: true, recorded }, { status: recorded ? 201 : 200 });
}
