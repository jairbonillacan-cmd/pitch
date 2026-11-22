import { NextResponse } from "next/server";
import { z } from "zod";
import { siteUrl } from "@pitchlab/emails";
import { withPublicRead } from "../../../../../src/server/api-guards";
import {
  processUnsubscribeToken,
  verifyUnsubscribeToken,
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

const SHARED_STYLES = `
      :root{color-scheme:dark}
      body{font-family:system-ui,-apple-system,sans-serif;background:rgb(10 13 18);color:rgb(244 246 249);display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px}
      main{max-width:440px;width:100%;background:rgb(18 23 33);border:1px solid rgb(36 45 61);border-radius:16px;padding:28px;text-align:center}
      h1{font-size:20px;margin:0 0 12px}
      p{font-size:14px;line-height:1.55;color:rgb(184 194 209);margin:0 0 20px}
      form{margin:0 0 14px}
      button,a{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:10px 20px;border-radius:999px;font-weight:700;text-decoration:none;font-size:max(1rem,1em);cursor:pointer;box-sizing:border-box}
      button{border:0;width:100%;background:rgb(16 185 129);color:rgb(5 46 22)}
      a.primary{background:rgb(16 185 129);color:rgb(5 46 22)}
      a.secondary{background:transparent;color:rgb(184 194 209);border:1px solid rgb(52 64 84);width:100%}
      button:focus-visible,a:focus-visible{outline:3px solid rgb(16 185 129);outline-offset:2px}`;

function escapeHtmlAttr(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function confirmationHtml(ok: boolean, scope?: UnsubscribeScope): string {
  const base = escapeHtmlAttr(siteUrl());
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
    <style>${SHARED_STYLES}
    </style>
  </head>
  <body>
    <main>
      <h1>${heading}</h1>
      <p>${detail}</p>
      <a class="primary" href="${base}/app/account">Ir a Mi cuenta</a>
    </main>
  </body>
</html>`;
}

function confirmPromptHtml(scope: UnsubscribeScope, rawToken: string): string {
  const base = escapeHtmlAttr(siteUrl());
  const safeToken = escapeHtmlAttr(rawToken);
  const detail = `Si confirmas, dejarás de recibir el ${SCOPE_COPY[scope]} en tu correo. Puedes volver a activarlo cuando quieras desde tu cuenta.`;
  return `<!doctype html>
<html lang="es-MX">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Confirmar baja de correos · PitchLab</title>
    <style>${SHARED_STYLES}
    </style>
  </head>
  <body>
    <main>
      <h1>Confirmar baja de correos</h1>
      <p>${detail}</p>
      <form method="POST" action="/api/me/email-preferences/unsubscribe">
        <input type="hidden" name="token" value="${safeToken}" />
        <input type="hidden" name="format" value="html" />
        <button type="submit">Confirmar baja de correos</button>
      </form>
      <a class="secondary" href="${base}/app/account">Ir a Mi cuenta</a>
    </main>
  </body>
</html>`;
}

function parseUnsubscribeBody(raw: string): { token: string | null; wantsHtml: boolean } {
  if (!raw || raw.length > MAX_UNSUBSCRIBE_BODY_BYTES) {
    return { token: null, wantsHtml: false };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return { token: null, wantsHtml: false };
  }
  if (trimmed.startsWith("{")) {
    try {
      const parsedJson: unknown = JSON.parse(trimmed);
      const validated = UnsubscribeJsonBodySchema.safeParse(parsedJson);
      return { token: validated.success ? validated.data.token : null, wantsHtml: false };
    } catch (err) {
      void err;
      return { token: null, wantsHtml: false };
    }
  }
  const params = new URLSearchParams(raw);
  const formToken = params.get("token");
  const validToken = formToken && formToken.length <= MAX_TOKEN_LENGTH ? formToken : null;
  const wantsHtml = params.get("format") === "html";
  return { token: validToken, wantsHtml };
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
    const rawToken = url.searchParams.get("token")?.trim() ?? "";
    if (!rawToken || rawToken.length > MAX_TOKEN_LENGTH) {
      return new Response(confirmationHtml(false), {
        status: 400,
        headers: { ...NO_STORE, "Content-Type": "text/html; charset=utf-8" },
      });
    }
    const verified = verifyUnsubscribeToken(rawToken);
    if (!verified) {
      return new Response(confirmationHtml(false), {
        status: 400,
        headers: { ...NO_STORE, "Content-Type": "text/html; charset=utf-8" },
      });
    }
    return new Response(confirmPromptHtml(verified.scope, rawToken), {
      status: 200,
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
    const raw = await request.text().catch(() => "");
    const parsedBody = parseUnsubscribeBody(raw);
    if (!db) {
      if (parsedBody.wantsHtml) {
        return new Response(confirmationHtml(false), {
          status: 503,
          headers: { ...NO_STORE, "Content-Type": "text/html; charset=utf-8" },
        });
      }
      return NextResponse.json(
        { error: "Base de datos no disponible" },
        { status: 503, headers: NO_STORE },
      );
    }
    const url = new URL(request.url);
    const queryToken = url.searchParams.get("token");
    const token =
      queryToken && queryToken.length <= MAX_TOKEN_LENGTH ? queryToken : parsedBody.token;
    const res = await processUnsubscribeToken(db, token);
    if (parsedBody.wantsHtml) {
      return new Response(confirmationHtml(res.ok, res.ok ? res.scope : undefined), {
        status: res.ok ? 200 : 400,
        headers: { ...NO_STORE, "Content-Type": "text/html; charset=utf-8" },
      });
    }
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: "Token inválido o caducado" },
        { status: 400, headers: NO_STORE },
      );
    }
    return NextResponse.json({ ok: true, scope: res.scope }, { headers: NO_STORE });
  },
);
