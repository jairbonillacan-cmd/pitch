import { NextResponse } from "next/server";
import { z } from "zod";
import { siteUrl } from "@pitchlab/emails";
import {
  ApiGuardHttpError,
  withPublicRead,
} from "../../../../../src/server/api-guards";
import {
  processUnsubscribeToken,
  verifyUnsubscribeToken,
  type UnsubscribeScope,
} from "../../../../../src/server/lifecycle-emails";
import { serverDb } from "../../../../../src/server/session-user";
import { UNSUBSCRIBE_SHARED_STYLES, getUnsubscribeCsp } from "../../../../../src/unsubscribe-csp.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const MAX_UNSUBSCRIBE_BODY_BYTES = 8_192;
const MAX_TOKEN_LENGTH = 2_048;

const UnsubscribeJsonBodySchema = z
  .object({
    token: z.string().min(1).max(MAX_TOKEN_LENGTH),
  })
  .strict();

const SCOPE_COPY: Record<UnsubscribeScope, string> = {
  weekly_digest: "resumen semanal",
  monthly_record: "resumen mensual de Mi récord",
  all: "avisos y resúmenes por correo",
};

let cachedUnsubscribeHtmlHeaders: Record<string, string> | null = null;

async function getUnsubscribeHtmlHeaders(): Promise<Record<string, string>> {
  if (cachedUnsubscribeHtmlHeaders) return cachedUnsubscribeHtmlHeaders;
  cachedUnsubscribeHtmlHeaders = {
    ...NO_STORE,
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": await getUnsubscribeCsp(),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
  };
  return cachedUnsubscribeHtmlHeaders;
}

async function readBoundedText(request: Request, maxBytes: number): Promise<string> {
  if (request.body) {
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value || value.byteLength === 0) continue;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel().catch(() => {});
          throw new ApiGuardHttpError(413, "cuerpo_demasiado_grande");
        }
        chunks.push(value);
      }
    } catch (err) {
      await reader.cancel().catch(() => {});
      throw err;
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder().decode(merged);
  }
  const buffer = await request.arrayBuffer();
  if (buffer.byteLength > maxBytes) {
    throw new ApiGuardHttpError(413, "cuerpo_demasiado_grande");
  }
  return new TextDecoder().decode(buffer);
}

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
    <style>${UNSUBSCRIBE_SHARED_STYLES}
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
    <style>${UNSUBSCRIBE_SHARED_STYLES}
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
    const htmlHeaders = await getUnsubscribeHtmlHeaders();
    const db = serverDb();
    if (!db) {
      return new Response(confirmationHtml(false), {
        status: 503,
        headers: htmlHeaders,
      });
    }
    const url = new URL(request.url);
    const rawToken = url.searchParams.get("token")?.trim() ?? "";
    if (!rawToken || rawToken.length > MAX_TOKEN_LENGTH) {
      return new Response(confirmationHtml(false), {
        status: 400,
        headers: htmlHeaders,
      });
    }
    const verified = verifyUnsubscribeToken(rawToken);
    if (!verified) {
      return new Response(confirmationHtml(false), {
        status: 400,
        headers: htmlHeaders,
      });
    }
    return new Response(confirmPromptHtml(verified.scope, rawToken), {
      status: 200,
      headers: htmlHeaders,
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
    const raw = await readBoundedText(request, MAX_UNSUBSCRIBE_BODY_BYTES).catch((err) => {
      if (err instanceof ApiGuardHttpError) throw err;
      return "";
    });
    const parsedBody = parseUnsubscribeBody(raw);
    if (!db) {
      if (parsedBody.wantsHtml) {
        return new Response(confirmationHtml(false), {
          status: 503,
          headers: await getUnsubscribeHtmlHeaders(),
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
        headers: await getUnsubscribeHtmlHeaders(),
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
