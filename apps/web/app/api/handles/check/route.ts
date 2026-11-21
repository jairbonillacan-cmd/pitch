import { NextResponse } from "next/server";
import { checkHandleFormat, isHandleAvailable } from "@pitchlab/db";
import { withPublicRead } from "../../../../src/server/api-guards";
import { getAuth } from "../../../../src/server/auth";
import { profileIdForAuthUser } from "../../../../src/server/member-data";
import { serverDb } from "../../../../src/server/session-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withPublicRead(
  {
    bucket: "handles-check",
    limit: 30,
    windowMs: 60_000,
    cacheControl: "no-store",
  },
  async ({ request }) => {
    const db = serverDb();
    if (!db) {
      return NextResponse.json({ error: "Cuentas no configuradas" }, { status: 503 });
    }

    const raw = new URL(request.url).searchParams.get("h") ?? "";
    const check = checkHandleFormat(raw.slice(0, 40));
    if (!check.ok) {
      return NextResponse.json({ ok: false, reason: check.reason });
    }

    let ownId: string | undefined;
    const auth = getAuth();
    if (auth) {
      const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
      if (session) {
        ownId = (await profileIdForAuthUser(db, session.user.id)) ?? undefined;
      }
    }

    const free = await isHandleAvailable(db, check.handle, ownId);
    return NextResponse.json(
      free ? { ok: true, handle: check.handle } : { ok: false, reason: "ocupado" },
    );
  },
);
