import { NextResponse } from "next/server";
import { createTipstarCode, listTipstarCodes, recordAdminAudit } from "@pitchlab/db";
import { verifySameOriginMutation } from "../../../../src/server/request-security";
import { requireAdmin } from "../../../../src/server/session-user";
import { trialHashes } from "../../../../src/server/signup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  codigo_invalido: "El código debe tener de 3 a 16 letras o números.",
  handle_invalido: "El usuario debe tener de 3 a 24 letras, números o guion bajo.",
  duplicado: "Ese código o usuario ya existe.",
};

/** POST { email, handle, displayName, promoCode, specialty } — da de alta un tipstar oficial y registra auditoría. */
export async function POST(request: Request): Promise<NextResponse> {
  const csrfError = verifySameOriginMutation(request);
  if (csrfError) return csrfError;

  const admin = await requireAdmin(request);
  if ("error" in admin) return admin.error;
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const s = (k: string) => (typeof b?.[k] === "string" ? (b[k] as string) : "");
  if (!s("email").includes("@")) return NextResponse.json({ error: "Correo del tipstar requerido" }, { status: 400 });
  const res = await createTipstarCode(admin.db, {
    email: s("email"),
    handle: s("handle"),
    displayName: s("displayName"),
    promoCode: s("promoCode"),
    specialty: s("specialty"),
  });
  if (!res.ok) return NextResponse.json({ error: MESSAGES[res.reason] }, { status: 409 });
  const { ipSubnetHash } = trialHashes(request.headers, process.env.BETTER_AUTH_SECRET ?? "");
  await recordAdminAudit(admin.db, {
    actorUserId: admin.userId,
    actorEmail: admin.email,
    action: "tipstar.create",
    targetKey: s("promoCode").trim().toUpperCase(),
    payloadJson: {
      email: s("email").trim().toLowerCase(),
      handle: s("handle").trim().replace(/^@/, "").toLowerCase(),
      specialty: s("specialty").trim(),
    },
    ipSubnetHash,
  });
  return NextResponse.json({ tipstars: await listTipstarCodes(admin.db) }, { status: 201 });
}
