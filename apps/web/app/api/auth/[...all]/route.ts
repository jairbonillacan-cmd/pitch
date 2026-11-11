import { NextResponse } from "next/server";
import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "../../../../src/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const notConfigured = () =>
  NextResponse.json({ error: "Autenticación no configurada" }, { status: 503 });

/** /api/auth/* de Better Auth; 503 mientras no existan DATABASE_URL y BETTER_AUTH_SECRET. */
export async function GET(request: Request): Promise<Response> {
  const auth = getAuth();
  return auth ? toNextJsHandler(auth).GET(request) : notConfigured();
}

export async function POST(request: Request): Promise<Response> {
  const auth = getAuth();
  return auth ? toNextJsHandler(auth).POST(request) : notConfigured();
}
