import { NextResponse } from "next/server";
import { z } from "zod";
import { createSanitizedErrorPayload } from "@pitchlab/contracts";
import { eq, recordFunnelEvent, users } from "@pitchlab/db";
import { withPublicRead } from "../../../../src/server/api-guards";
import { optionalPublicDbSession } from "../../../../src/server/session-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ClientFunnelStage = "landing" | "signup_step1";

const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

const FunnelPayloadSchema = z
  .object({
    stage: z.enum(["landing", "signup_step1"]),
    sourcePath: z.string().max(256).optional(),
    consent: z.boolean().optional(),
    anonymousSessionId: z.string().max(128).optional(),
  })
  .strict();

function sanitizeSourcePath(raw: string | undefined, stage: ClientFunnelStage): string {
  if (typeof raw !== "string") return stage === "landing" ? "/" : "/signup";
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return stage === "landing" ? "/" : "/signup";
  }
  return trimmed.split(/[?#]/, 1)[0]!.slice(0, 120) || "/";
}

export const POST = withPublicRead(
  {
    bucket: "analytics-funnel",
    limit: 30,
    windowMs: 60_000,
    verifySameOrigin: true,
    requireJson: true,
    cacheControl: "no-store",
  },
  async ({ request }) => {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch (err) {
      void err;
      const payload = createSanitizedErrorPayload("INVALID_JSON", "Cuerpo JSON inválido.");
      return NextResponse.json(
        { ok: false, error: payload.message, code: payload.code },
        { status: 400 },
      );
    }

    const parsed = FunnelPayloadSchema.safeParse(rawBody);
    if (!parsed.success) {
      const payload = createSanitizedErrorPayload(
        "INVALID_FUNNEL_PAYLOAD",
        "Etapa de embudo no permitida.",
      );
      return NextResponse.json(
        { ok: false, error: payload.message, code: payload.code },
        { status: 400 },
      );
    }

    const { stage, consent, anonymousSessionId: rawAnonymousSessionId } = parsed.data;
    const sourcePath = sanitizeSourcePath(parsed.data.sourcePath, stage);

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

    if (consent !== true) {
      return NextResponse.json({ ok: true, recorded: false });
    }

    const anonymousSessionId = (rawAnonymousSessionId ?? "").trim();
    if (!SESSION_ID_PATTERN.test(anonymousSessionId)) {
      const payload = createSanitizedErrorPayload(
        "INVALID_ANONYMOUS_SESSION",
        "Sesión anónima inválida.",
      );
      return NextResponse.json(
        { ok: false, error: payload.message, code: payload.code },
        { status: 400 },
      );
    }

    const recorded = await recordFunnelEvent(session.db, {
      eventName: stage,
      sessionKey: `anon:${anonymousSessionId}`,
      userId: null,
      sourcePath,
    });
    return NextResponse.json({ ok: true, recorded }, { status: recorded ? 201 : 200 });
  },
);
