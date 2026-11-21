import { NextResponse } from "next/server";
import { z } from "zod";
import { createSanitizedErrorPayload } from "@pitchlab/contracts";
import {
  deletePushSubscription,
  listUserPushSubscriptions,
  PushEndpointConflictError,
  upsertPushSubscription,
  upsertUserPreferences,
  type StoredPushSubscription,
} from "@pitchlab/db";
import { withActivePaseMutation, withSessionRead } from "../../../../src/server/api-guards";
import { logSecurityEvent } from "../../../../src/server/safe-logger";
import {
  isWebPushConfigured,
  parseAllowedWebPushEndpoint,
  vapidConfigFromEnv,
} from "../../../../src/server/web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PUSH_SUBSCRIPTIONS = 40;

const PushSubscribeSchema = z.object({
  endpoint: z.string().trim().min(1).max(2048),
  keys: z.object({
    p256dh: z.string().trim().min(16).max(512),
    auth: z.string().trim().min(8).max(256),
  }),
  topics: z
    .object({
      picks: z.boolean().optional(),
      live: z.boolean().optional(),
      social: z.boolean().optional(),
    })
    .optional(),
});

const PushDeleteBodySchema = z.object({
  endpoint: z.string().trim().min(1).max(2048).optional(),
});

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

export const GET = withSessionRead(
  {
    bucket: "me-push-read",
    allowBetaPin: false,
    requireFullAccess: true,
    cacheControl: "private, no-store",
  },
  async ({ user }) => {
    const vapid = vapidConfigFromEnv();
    const subs = (await listUserPushSubscriptions(user.db, user.userId)).slice(
      0,
      MAX_PUSH_SUBSCRIPTIONS,
    );
    return NextResponse.json({
      configured: Boolean(vapid),
      vapidPublicKey: vapid?.publicKey ?? null,
      subscriptions: subs.map(serializeSub),
    });
  },
);

export const POST = withActivePaseMutation(
  {
    bucket: "me-push-subscribe",
    limit: 20,
    windowMs: 3_600_000,
  },
  async ({ request, user }) => {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch (err) {
      void err;
      return NextResponse.json(
        {
          ok: false,
          error: "Suscripción Web Push incompleta o inválida.",
          ...createSanitizedErrorPayload(
            "INVALID_JSON",
            "Suscripción Web Push incompleta o inválida.",
          ),
        },
        { status: 400 },
      );
    }

    const parsed = PushSubscribeSchema.safeParse(rawBody);
    const endpoint = parsed.success ? parseAllowedWebPushEndpoint(parsed.data.endpoint) : null;
    if (!parsed.success || !endpoint) {
      return NextResponse.json(
        {
          ok: false,
          error: "Suscripción Web Push incompleta o inválida.",
          ...createSanitizedErrorPayload(
            "INVALID_PUSH_SUBSCRIPTION",
            "Suscripción Web Push incompleta o inválida.",
          ),
        },
        { status: 400 },
      );
    }

    const { keys, topics } = parsed.data;

    let saved: StoredPushSubscription;
    try {
      saved = await upsertPushSubscription(user.db, {
        userId: user.userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        topicPicks: topics?.picks ?? true,
        topicLive: topics?.live ?? true,
        topicSocial: topics?.social ?? true,
        userAgent: request.headers.get("user-agent"),
      });
    } catch (err) {
      if (err instanceof PushEndpointConflictError) {
        return NextResponse.json(
          {
            ok: false,
            error: "Este endpoint de notificación ya pertenece a otra cuenta.",
            ...createSanitizedErrorPayload(
              "PUSH_ENDPOINT_CONFLICT",
              "Este endpoint de notificación ya pertenece a otra cuenta.",
            ),
          },
          { status: 409 },
        );
      }
      logSecurityEvent("error", "push_subscribe_failed", {
        userId: user.userId,
        error: err,
      });
      return NextResponse.json(
        {
          ok: false,
          error: "No se pudo guardar la suscripción push.",
          ...createSanitizedErrorPayload(
            "PUSH_SUBSCRIBE_FAILED",
            "No se pudo guardar la suscripción push.",
          ),
        },
        { status: 500 },
      );
    }

    await upsertUserPreferences(user.db, user.userId, { pushEnabled: true });

    return NextResponse.json(
      {
        ok: true,
        configured: isWebPushConfigured(),
        subscription: serializeSub(saved),
      },
      { status: 201 },
    );
  },
);

export const DELETE = withActivePaseMutation(
  {
    bucket: "me-push-unsubscribe",
    requireJson: false,
  },
  async ({ request, user }) => {
    const url = new URL(request.url);
    const queryEndpoint = url.searchParams.get("endpoint");

    let bodyEndpoint: string | undefined;
    const rawText = await request.text();
    if (rawText.trim().length > 0) {
      let rawBody: unknown;
      try {
        rawBody = JSON.parse(rawText);
      } catch (err) {
        void err;
        return NextResponse.json(
          {
            ok: false,
            error: "Endpoint push inválido.",
            ...createSanitizedErrorPayload("INVALID_JSON", "Endpoint push inválido."),
          },
          { status: 400 },
        );
      }
      const parsedBody = PushDeleteBodySchema.safeParse(rawBody);
      if (!parsedBody.success) {
        return NextResponse.json(
          {
            ok: false,
            error: "Endpoint push inválido.",
            ...createSanitizedErrorPayload("INVALID_PUSH_ENDPOINT", "Endpoint push inválido."),
          },
          { status: 400 },
        );
      }
      bodyEndpoint = parsedBody.data.endpoint;
    }

    const rawEndpoint = bodyEndpoint ?? queryEndpoint;
    const endpoint = rawEndpoint ? parseAllowedWebPushEndpoint(rawEndpoint) : undefined;
    if (rawEndpoint && !endpoint) {
      return NextResponse.json(
        {
          ok: false,
          error: "Endpoint push inválido.",
          ...createSanitizedErrorPayload("INVALID_PUSH_ENDPOINT", "Endpoint push inválido."),
        },
        { status: 400 },
      );
    }

    const removed = await deletePushSubscription(user.db, user.userId, endpoint ?? undefined);
    const remaining = await listUserPushSubscriptions(user.db, user.userId);
    if (remaining.length === 0) {
      await upsertUserPreferences(user.db, user.userId, { pushEnabled: false });
    }

    return NextResponse.json({ ok: true, removed, remaining: remaining.length });
  },
);
