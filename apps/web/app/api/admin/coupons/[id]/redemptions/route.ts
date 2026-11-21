import { NextResponse } from "next/server";
import { z } from "zod";
import { createSanitizedErrorPayload, parseStrictFiniteNumber } from "@pitchlab/contracts";
import { listCouponRedemptionsAdmin } from "@pitchlab/db";
import { withAdminMutation, type AdminMutationContext } from "../../../../../../src/server/api-guards";
import { UUID_RE } from "../../../../../../src/server/transfer-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ADMIN_LIST_LIMIT = 40;
const couponIdSchema = z.string().trim().regex(UUID_RE);

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

export const GET = withAdminMutation(
  { bucket: "admin-coupons-redemptions", allowGet: true, limit: 60 },
  async ({ request, params, user }: AdminMutationContext<{ id: string }>) => {
    const parsedId = couponIdSchema.safeParse(params.id);
    if (!parsedId.success) {
      return invalidInputResponse("INVALID_COUPON_ID", "Cupón inválido.");
    }

    const limit = parseBoundedLimit(request, MAX_ADMIN_LIST_LIMIT);
    const rows = await listCouponRedemptionsAdmin(user.db, parsedId.data);
    const boundedRows = rows.slice(0, limit);

    return NextResponse.json({
      redemptions: boundedRows.map((r) => ({
        ...r,
        createdAtIso: r.createdAt.toISOString(),
      })),
    });
  },
);
