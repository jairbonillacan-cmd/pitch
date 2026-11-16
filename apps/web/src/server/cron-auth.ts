/**
 * Autenticación compartida para rutas cron protegidas por `CRON_SECRET`.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export function verifyBearerSecret(authorization: string | null, secret: string | undefined): boolean {
  const expectedSecret = secret?.trim();
  if (!expectedSecret || !authorization) return false;
  const expectedHeader = `Bearer ${expectedSecret}`;
  const gotDigest = createHash("sha256").update(authorization).digest();
  const expectedDigest = createHash("sha256").update(expectedHeader).digest();
  return timingSafeEqual(gotDigest, expectedDigest);
}

/** Devuelve una respuesta 503/401 si la llamada cron no trae el secreto Bearer esperado. */
export function requireCronAuth(request: Request): NextResponse | null {
  if (!process.env.CRON_SECRET?.trim()) {
    return NextResponse.json({ error: "CRON_SECRET no configurado" }, { status: 503 });
  }
  if (!verifyBearerSecret(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  return null;
}
