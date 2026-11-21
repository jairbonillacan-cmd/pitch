import { NextResponse } from "next/server";
import { suggestHandles } from "@pitchlab/db";
import { withPublicRead } from "../../../../src/server/api-guards";
import { getAuth } from "../../../../src/server/auth";
import { profileIdForAuthUser } from "../../../../src/server/member-data";
import {
  checkEndpointRateLimit,
  rateLimitResponse,
} from "../../../../src/server/request-security";
import { serverDb } from "../../../../src/server/session-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withPublicRead(
  {
    bucket: "handles-suggest",
    limit: 20,
    windowMs: 60_000,
    cacheControl: "no-store",
  },
  async ({ request }) => {
    const db = serverDb();
    if (!db) {
      return NextResponse.json({ error: "Cuentas no configuradas" }, { status: 503 });
    }

    const auth = getAuth();
    const session = auth
      ? await auth.api.getSession({ headers: request.headers }).catch(() => null)
      : null;

    if (session?.user?.id) {
      const userRl = await checkEndpointRateLimit({
        bucket: "handles-suggest:user",
        key: session.user.id,
        limit: 20,
        windowMs: 60_000,
        db,
      });
      if (!userRl.allowed) {
        return rateLimitResponse(userRl.retryAfterSeconds);
      }
    }

    const rawName = new URL(request.url).searchParams.get("name")?.slice(0, 60) ?? "";
    const bases = [rawName, session?.user?.name ?? "", session?.user?.email ?? ""]
      .map((value) => value.trim())
      .filter(Boolean);

    const ownId = session?.user?.id
      ? ((await profileIdForAuthUser(db, session.user.id)) ?? undefined)
      : undefined;

    const suggestions = await suggestHandles(db, bases, 3, { exceptUserId: ownId });
    return NextResponse.json({ suggestions });
  },
);
