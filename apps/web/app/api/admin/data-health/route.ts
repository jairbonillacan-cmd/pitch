import { NextResponse } from "next/server";
import { withAdminMutation } from "../../../../src/server/api-guards";
import { loadServerDataHealthReport } from "../../../../src/server/data-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAdminMutation(
  { bucket: "admin-data-health", allowGet: true, limit: 60 },
  () => {
    const report = loadServerDataHealthReport();
    return NextResponse.json(report);
  },
);
