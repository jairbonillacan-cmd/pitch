import { NextResponse } from "next/server";
import { z } from "zod";
import { createSanitizedErrorPayload } from "@pitchlab/contracts";
import {
  createTipsterCode,
  findTipsterByPromoCode,
  listTipsterCodes,
  recordAdminAudit,
} from "@pitchlab/db";
import { withAdminMutation } from "../../../../src/server/api-guards";
import { sendTipsterActivatedEmail } from "../../../../src/server/lifecycle-emails";
import { getMailer } from "../../../../src/server/mailer";
import { trialHashes } from "../../../../src/server/signup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TIPSTERS_RESPONSE = 40;

const MESSAGES: Record<string, string> = {
  codigo_invalido: "El código debe tener de 3 a 16 letras o números.",
  handle_invalido: "El usuario debe tener de 3 a 24 letras, números o guion bajo.",
  duplicado: "Ese código o usuario ya existe.",
};

const CreateTipsterBodySchema = z.object({
  email: z.string().trim().min(3).max(254).email(),
  handle: z.string().trim().min(1).max(64),
  displayName: z.string().trim().min(1).max(120),
  promoCode: z.string().trim().min(1).max(32),
  specialty: z.string().trim().max(120).optional().default(""),
});

export const POST = withAdminMutation(
  {
    bucket: "admin-tipsters-create",
    limit: 30,
    windowMs: 60_000,
  },
  async ({ request, user }) => {
    const rawBody: unknown = await request.json().catch(() => null);
    const parsed = CreateTipsterBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      const payload = createSanitizedErrorPayload(
        "INVALID_TIPSTER_INPUT",
        "Correo y datos del tipster requeridos.",
      );
      return NextResponse.json({ ...payload, error: payload.message }, { status: 400 });
    }

    const { email, handle, displayName, promoCode, specialty } = parsed.data;
    const res = await createTipsterCode(user.db, {
      email,
      handle,
      displayName,
      promoCode,
      specialty,
    });
    if (!res.ok) {
      return NextResponse.json({ error: MESSAGES[res.reason] }, { status: 409 });
    }

    const { ipSubnetHash } = trialHashes(request.headers, process.env.BETTER_AUTH_SECRET ?? "");
    await recordAdminAudit(user.db, {
      actorUserId: user.userId,
      actorEmail: user.email,
      action: "tipster.create",
      targetKey: promoCode.toUpperCase(),
      payloadJson: {
        email: email.toLowerCase(),
        handle: handle.replace(/^@/, "").toLowerCase(),
        specialty,
      },
      ipSubnetHash,
    });

    const createdTipster = await findTipsterByPromoCode(user.db, promoCode);
    if (createdTipster) {
      await sendTipsterActivatedEmail(user.db, getMailer(), {
        userId: createdTipster.userId,
        email: createdTipster.email,
        displayName: createdTipster.displayName,
        promoCode: createdTipster.promoCode,
        trialDays: createdTipster.freeTrialDays,
        commissionPct: createdTipster.commissionPct,
      });
    }

    const tipsters = await listTipsterCodes(user.db);
    return NextResponse.json({ tipsters: tipsters.slice(0, MAX_TIPSTERS_RESPONSE) }, { status: 201 });
  },
);
