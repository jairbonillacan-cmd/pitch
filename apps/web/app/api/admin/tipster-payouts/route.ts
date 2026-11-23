import { NextResponse } from "next/server";
import { parseStrictFiniteNumber } from "@pitchlab/contracts";
import { listTipsterCommissionsForAdmin } from "@pitchlab/db";
import { withAdminMutation } from "../../../../src/server/api-guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ADMIN_PAYOUTS_LIMIT = 40;

export const GET = withAdminMutation(
  {
    bucket: "admin-tipster-payouts-list",
    allowGet: true,
    limit: 60,
    windowMs: 60_000,
  },
  async ({ request, user }) => {
    const rawLimit = new URL(request.url).searchParams.get("limit");
    const parsedLimit = parseStrictFiniteNumber(rawLimit);
    const limit =
      parsedLimit !== null && Number.isInteger(parsedLimit)
        ? Math.min(MAX_ADMIN_PAYOUTS_LIMIT, Math.max(1, parsedLimit))
        : MAX_ADMIN_PAYOUTS_LIMIT;

    const { ledger, totalsByTipster } = await listTipsterCommissionsForAdmin(user.db, { limit });

    return NextResponse.json({
      totalsByTipster,
      ledger: ledger.map((r) => ({
        ...r,
        clearsAtIso: r.clearsAt.toISOString(),
        paidOutAtIso: r.paidOutAt ? r.paidOutAt.toISOString() : null,
        createdAtIso: r.createdAt.toISOString(),
      })),
    });
  },
);
