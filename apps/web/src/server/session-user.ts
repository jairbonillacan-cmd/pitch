import { NextResponse } from "next/server";
import { createDb, type Db } from "@pitchlab/db";
import { getAuth } from "./auth.js";
import { profileIdForAuthUser } from "./member-data.js";

let db: Db | null = null;

/** Usuario de PitchLab de la sesión actual, o una respuesta de error lista para devolver. */
export async function requireMember(
  request: Request,
): Promise<{ db: Db; userId: string } | { error: NextResponse }> {
  const auth = getAuth();
  const url = process.env.DATABASE_URL;
  if (!auth || !url) {
    return { error: NextResponse.json({ error: "Cuentas no configuradas" }, { status: 503 }) };
  }
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return { error: NextResponse.json({ error: "Inicia sesión" }, { status: 401 }) };
  db ??= createDb(url) as unknown as Db;
  const userId = await profileIdForAuthUser(db, session.user.id);
  if (!userId) return { error: NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 }) };
  return { db, userId };
}

/** Correos con acceso a la consola del fundador (PITCHLAB_ADMIN_EMAILS, separados por coma). */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const admins = (process.env.PITCHLAB_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.trim().toLowerCase());
}

/** Como requireMember, pero además exige que el correo esté en PITCHLAB_ADMIN_EMAILS. */
export async function requireAdmin(
  request: Request,
): Promise<{ db: Db; userId: string } | { error: NextResponse }> {
  const auth = getAuth();
  if (!auth) return { error: NextResponse.json({ error: "Cuentas no configuradas" }, { status: 503 }) };
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return { error: NextResponse.json({ error: "Inicia sesión" }, { status: 401 }) };
  if (!isAdminEmail(session.user.email)) {
    return { error: NextResponse.json({ error: "Solo para el equipo fundador" }, { status: 403 }) };
  }
  return requireMember(request);
}
