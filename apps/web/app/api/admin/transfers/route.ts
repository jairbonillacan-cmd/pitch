import { NextResponse } from "next/server";
import { z } from "zod";
import { parseStrictFiniteNumber } from "@pitchlab/contracts";
import { listAdminTransferRequests, type TransferRequestStatus } from "@pitchlab/db";
import { withAdminMutation } from "../../../../src/server/api-guards";
import { serializeAdminTransferRequest } from "../../../../src/server/transfer-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ADMIN_TRANSFERS_LIMIT = 40;

const TransferStatusQuerySchema = z.enum([
  "all",
  "pending_review",
  "approved",
  "rejected",
  "canceled",
]);

export const GET = withAdminMutation(
  {
    bucket: "admin-transfers-list",
    allowGet: true,
    limit: 60,
    windowMs: 60_000,
  },
  async ({ request, user }) => {
    const sp = new URL(request.url).searchParams;
    const rawStatus = sp.get("status") ?? "all";
    const parsedStatus = TransferStatusQuerySchema.safeParse(rawStatus);
    const status: TransferRequestStatus | "all" = parsedStatus.success ? parsedStatus.data : "all";
    const query = sp.get("q")?.trim().slice(0, 120) ?? "";

    const parsedLimit = parseStrictFiniteNumber(sp.get("limit"));
    const limit =
      parsedLimit !== null && Number.isInteger(parsedLimit)
        ? Math.min(MAX_ADMIN_TRANSFERS_LIMIT, Math.max(1, parsedLimit))
        : MAX_ADMIN_TRANSFERS_LIMIT;

    const rows = await listAdminTransferRequests(user.db, {
      status,
      query: query || undefined,
      limit,
    });

    const requests = rows.map(serializeAdminTransferRequest);
    const pendingCount = requests.filter((r) => r.status === "pending_review").length;

    return NextResponse.json({ requests, pendingCount });
  },
);
