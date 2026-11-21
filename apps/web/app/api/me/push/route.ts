import { NextResponse } from "next/server";
import {
  deletePushSubscription,
  listUserPushSubscriptions,
  PushEndpointConflictError,
  upsertPushSubscription,
  upsertUserPreferences,
  type StoredPushSubscription,
} from "@pitchlab/db";
import {
  checkEndpointRateLimit,
  rateLimitResponse,
  verifySameOriginMutation,
} from "../../../../src/server/request-security";
import { requireActivePaseMember } from "../../../../src/server/session-user";
import {
  isWebPushConfigured,
  parseAllowedWebPushEndpoint,
  vapidConfigFromEnv,
} from "../../../../src/server/web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function parseEndpointUrl(raw: unknown): string | null {
  return parseAllowedWebPushEndpoint(raw);
}

function serializeSub(sub: {
  endpoint: string;
  topicPicks: boolean;
  topicLive: boolean;
  topicSocial: boolean;
  updatedAt: Date;
}) {
  return {
    endpoint: sub.endpoint,
    topicPicks: sub.topicPicks,
    topicLive: sub.topicLive,
    topicSocial: sub.topicSocial,
    updatedAtIso: sub.updatedAt.toISOString(),
  };
}

/** GET /api/me/push — estado de Web Push VAPID y suscripciones del socio. */
export async function GET(request: Request): Promise<NextResponse> {
  const member = await requireActivePaseMember(request);
  if ("error" in member) return member.error;

  const vapid = vapidConfigFromEnv();
  const subs = await listUserPushSubscriptions(member.db, member.userId);
  return NextResponse.json(
    {
      configured: Boolean(vapid),
      vapidPublicKey: vapid?.publicKey ?? null,
      subscriptions: subs.map(serializeSub),
    },
    { headers: NO_STORE },
  );
}

/** POST /api/me/push — registra o actualiza la suscripción Web Push del navegador. */
export async function POST(request: Request): Promise<NextResponse> {
  const csrfError = verifySameOriginMutation(request);
  if (csrfError) return csrfError;

  const member = await requireActivePaseMember(request);
  if ("error" in member) return member.error;

  const rl = await checkEndpointRateLimit({
    bucket: "me-push-subscribe",
    key: member.userId,
    limit: 20,
    windowMs: 3_600_000,
  });
  if (!rl.allowed) {
    return rateLimitResponse(rl.retryAfterSeconds, "Demasiados cambios de notificaciones push.");
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const endpoint = parseEndpointUrl(body?.endpoint);
  const keys = (body?.keys && typeof body.keys === "object" ? body.keys : null) as Record<
    string,
    unknown
  > | null;
  const p256dh = typeof keys?.p256dh === "string" ? keys.p256dh.trim() : "";
  const auth = typeof keys?.auth === "string" ? keys.auth.trim() : "";

  if (!endpoint || p256dh.length < 16 || p256dh.length > 512 || auth.length < 8 || auth.length > 256) {
    return NextResponse.json(
      { ok: false, error: "Suscripción Web Push incompleta o inválida." },
      { status: 400 },
    );
  }

  const topics =
    body?.topics && typeof body.topics === "object"
      ? (body.topics as Record<string, unknown>)
      : {};

  let saved: StoredPushSubscription;
  try {
    saved = await upsertPushSubscription(member.db, {
      userId: member.userId,
      endpoint,
      p256dh,
      auth,
      topicPicks: typeof topics.picks === "boolean" ? topics.picks : true,
      topicLive: typeof topics.live === "boolean" ? topics.live : true,
      topicSocial: typeof topics.social === "boolean" ? topics.social : true,
      userAgent: request.headers.get("user-agent"),
    });
  } catch (err) {
    if (err instanceof PushEndpointConflictError) {
      return NextResponse.json(
        { ok: false, error: "Este endpoint de notificación ya pertenece a otra cuenta." },
        { status: 409, headers: NO_STORE },
      );
    }
    throw err;
  }
  await upsertUserPreferences(member.db, member.userId, { pushEnabled: true });

  return NextResponse.json(
    {
      ok: true,
      configured: isWebPushConfigured(),
      subscription: serializeSub(saved),
    },
    { status: 201, headers: NO_STORE },
  );
}

/** DELETE /api/me/push — elimina un endpoint o todas las suscripciones push del socio. */
export async function DELETE(request: Request): Promise<NextResponse> {
  const csrfError = verifySameOriginMutation(request);
  if (csrfError) return csrfError;

  const member = await requireActivePaseMember(request);
  if ("error" in member) return member.error;

  const url = new URL(request.url);
  const queryEndpoint = url.searchParams.get("endpoint");
  const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
  const rawEndpoint = body?.endpoint ?? queryEndpoint;
  const endpoint = rawEndpoint ? parseEndpointUrl(rawEndpoint) : undefined;
  if (rawEndpoint && !endpoint) {
    return NextResponse.json({ ok: false, error: "Endpoint push inválido." }, { status: 400 });
  }

  const removed = await deletePushSubscription(member.db, member.userId, endpoint ?? undefined);
  const remaining = await listUserPushSubscriptions(member.db, member.userId);
  if (remaining.length === 0) {
    await upsertUserPreferences(member.db, member.userId, { pushEnabled: false });
  }

  return NextResponse.json(
    { ok: true, removed, remaining: remaining.length },
    { headers: NO_STORE },
  );
}
