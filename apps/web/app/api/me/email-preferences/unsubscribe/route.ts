import { NextResponse } from "next/server";
import { z } from "zod";
import { siteUrl } from "@pitchlab/emails";
import { withPublicRead } from "../../../../../src/server/api-guards";
import {
  processUnsubscribeToken,
  type UnsubscribeScope,
} from "../../../../../src/server/lifecycle-emails";
import { serverDb } from "../../../../../src/server/session-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const MAX_UNSUBSCRIBE_BODY_BYTES = 8_192;
const MAX_TOKEN_LENGTH = 2_048;

const UnsubscribeJsonBodySchema = z.object({
  token: z.string().min(1).max(MAX_TOKEN_LENGTH),
});

const SCOPE_COPY: Record<UnsubscribeScope, string> = {
  weekly_digest: "resumen semanal",
  monthly_record: "resumen mensual de Mi récord",
  all: "avisos y resúmenes por correo",
};

function confirmationHtml(ok: boolean, scope?: UnsubscribeScope): string {
  const base = siteUrl();
  const title = ok ? "Baja confirmada · PitchLab" : "Enlace inválido o caducado · PitchLab";
  const heading = ok ? "Listo, ya te dimos de baja" : "Enlace inválido o caducado";
  const detail =
    ok && scope
      ? `Ya no recibirás el ${SCOPE_COPY[scope]} en tu correo. Puedes volver a activarlo cuando quieras desde tu cuenta.`
      : "Este enlace ya venció o no es válido. Puedes cambiar tus avisos directamente desde Mi cuenta.";
  return `<!doctype html>
<html lang="es-MX">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${title}</title>
    <style>
      :root{color-scheme:dark}
      body{font-family:system-ui,-apple-system,sans-serif;background:rgb(10 13 18);color:rgb(244 246 249);display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px}
      main{max-width:440px;width:100%;background:rgb(18 23 33);border:1px solid rgb(36 45 61);border-radius:16px;padding:28px;text-align:center}
      h1{font-size:20px;margin:0 0 12px}
      p{font-size:14px;line-height:1.55;color:rgb(184 194 209);margin:0 0 20px}
      a{display:inline-block;padding:10px 18px;border-radius:999px;background:rgb(16 185 129);color:rgb(5 46 22);font-weight:700;text-decoration:none;font-size:14px}
    </style>
  </head>
  <body>
    <main>
      <h1>${heading}</h1>
      <p>${detail}</p>
      <a href="${base}/app/cuenta">Ir a Mi cuenta</a>
    </main>
  </body>
</html>`;
}

function extractTokenFromBody(raw: string): string | null {
  if (!raw || raw.length > MAX_UNSUBSCRIBE_BODY_BYTES) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{")) {
    try {
      const parsedJson: unknown = JSON.parse(trimmed);
      const validated = UnsubscribeJsonBodySchema.safeParse(parsedJson);
      return validated.success ? validated.data.token : null;
    } catch (err) {
      void err;
      return null;
    }
  }
  const formToken = new URLSearchParams(raw).get("token");
  return formToken && formToken.length <= MAX_TOKEN_LENGTH ? formToken : null;
}

export const GET = withPublicRead(
  {
    bucket: "email-unsubscribe",
    limit: 30,
    windowMs: 60_000,
    cacheControl: "no-store",
  },
  async ({ request }) => {
    const db = serverDb();
    if (!db) {
      return new Response(confirmationHtml(false), {
        status: 503,
        headers: { ...NO_STORE, "Content-Type": "text/html; charset=utf-8" },
      });
    }
    const url = new URL(request.url);
    const res = await processUnsubscribeToken(db, url.searchParams.get("token"));
    return new Response(confirmationHtml(res.ok, res.ok ? res.scope : undefined), {
      status: res.ok ? 200 : 400,
      headers: { ...NO_STORE, "Content-Type": "text/html; charset=utf-8" },
    });
  },
);

export const POST = withPublicRead(
  {
    bucket: "email-unsubscribe",
    limit: 30,
    windowMs: 60_000,
    cacheControl: "no-store",
  },
  async ({ request }) => {
    const db = serverDb();
    if (!db) {
      return NextResponse.json(
        { error: "Base de datos no disponible" },
        { status: 503, headers: NO_STORE },
      );
    }
    const url = new URL(request.url);
    let token = url.searchParams.get("token");
    if (!token) {
      const raw = await request.text().catch(() => "");
      token = extractTokenFromBody(raw);
    }
    const res = await processUnsubscribeToken(db, token);
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: "Token inválido o caducado" },
        { status: 400, headers: NO_STORE },
      );
    }
    return NextResponse.json({ ok: true, scope: res.scope }, { headers: NO_STORE });
  },
);
