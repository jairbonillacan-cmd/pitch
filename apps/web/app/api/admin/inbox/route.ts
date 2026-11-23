import { NextResponse } from "next/server";
import { z } from "zod";
import { createSanitizedErrorPayload, parseStrictFiniteNumber } from "@pitchlab/contracts";
import { listAdminInbox, markAdminInboxResolved } from "@pitchlab/db";
import { withAdminMutation } from "../../../../src/server/api-guards";
import { trialHashes } from "../../../../src/server/signup";
import { UUID_RE } from "../../../../src/server/transfer-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ADMIN_LIST_LIMIT = 40;

function parseBoundedLimit(request: Request, defaultLimit: number): number {
  const raw = new URL(request.url).searchParams.get("limit");
  if (raw === null || raw.trim() === "") return defaultLimit;
  const parsed = parseStrictFiniteNumber(raw);
  if (parsed === null || !Number.isInteger(parsed)) return defaultLimit;
  return Math.max(1, Math.min(MAX_ADMIN_LIST_LIMIT, parsed));
}

function invalidInputResponse(code: string, message: string, status = 400): NextResponse {
  const payload = createSanitizedErrorPayload(code, message);
  return NextResponse.json(
    { ok: false, error: payload.message, code: payload.code, message: payload.message },
    { status },
  );
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch (err) {
    void err;
    return null;
  }
}

const resolveInboxBodySchema = z
  .object({
    itemId: z.string().trim().regex(UUID_RE),
    note: z.string().max(1000).nullable().optional(),
  })
  .strict();

export const GET = withAdminMutation(
  { bucket: "admin-inbox-read", allowGet: true, limit: 60 },
  async ({ request, user }) => {
    const limit = parseBoundedLimit(request, MAX_ADMIN_LIST_LIMIT);
    const items = await listAdminInbox(user.db, limit);
    return NextResponse.json({ items });
  },
);

export const PATCH = withAdminMutation(
  { bucket: "admin-inbox", limit: 60 },
  async ({ request, user }) => {
    const rawBody = await readJsonBody(request);
    const parsed = resolveInboxBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return invalidInputResponse(
        "INVALID_INBOX_ITEM",
        "Falta un identificador válido del mensaje.",
      );
    }

    const note = parsed.data.note ? parsed.data.note.trim().slice(0, 280) || null : null;
    const { ipSubnetHash } = trialHashes(request.headers, process.env.BETTER_AUTH_SECRET ?? "");
    const res = await markAdminInboxResolved(user.db, {
      adminUserId: user.userId,
      adminEmail: user.email,
      itemId: parsed.data.itemId,
      note,
      ipSubnetHash,
    });
    if (!res.ok) {
      return invalidInputResponse("INBOX_ITEM_NOT_FOUND", "Mensaje no encontrado.", 404);
    }

    return NextResponse.json({ ok: true });
  },
);
