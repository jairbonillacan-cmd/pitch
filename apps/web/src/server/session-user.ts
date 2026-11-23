import { NextResponse } from "next/server";
import { createDb, hasActivePaseTotal, signupCompleted, type Db } from "@pitchlab/db";
import { getAuth } from "./auth";
import { profileIdForAuthUser } from "./member-data";

let db: Db | null = null;

export function setSessionDbForTests(instance: Db | null): void {
  db = instance;
}

export function serverDb(url: string | undefined = process.env.DATABASE_URL): Db | null {
  if (db) return db;
  if (!url) return null;
  db = createDb(url);
  return db;
}

export interface AuthenticatedMember {
  db: Db;
  userId: string;
  email: string;
  emailVerified: boolean;
  authUserId: string;
}

export async function requireStep1Member(
  request: Request,
): Promise<AuthenticatedMember | { error: NextResponse }> {
  const auth = getAuth();
  const url = process.env.DATABASE_URL;
  if (!auth || !url) {
    return { error: NextResponse.json({ error: "Cuentas no configuradas" }, { status: 503 }) };
  }
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return { error: NextResponse.json({ error: "Inicia sesión" }, { status: 401 }) };
  db ??= createDb(url);
  const userId = await profileIdForAuthUser(db, session.user.id);
  if (!userId) return { error: NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 }) };
  return {
    db,
    userId,
    email: session.user.email,
    emailVerified: Boolean(session.user.emailVerified),
    authUserId: session.user.id,
  };
}

export async function optionalPublicDbSession(
  request: Request,
): Promise<{ db: Db; userId: string | null } | null> {
  const url = process.env.DATABASE_URL;
  if (!db && !url) return null;
  db ??= createDb(url!);
  let userId: string | null = null;
  const auth = getAuth();
  if (auth) {
    const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
    if (session) {
      userId = (await profileIdForAuthUser(db, session.user.id)) ?? null;
    }
  }
  return { db, userId };
}

export async function requireMember(
  request: Request,
): Promise<AuthenticatedMember | { error: NextResponse }> {
  const member = await requireStep1Member(request);
  if ("error" in member) return member;
  if (!(await signupCompleted(member.db, member.userId))) {
    return { error: NextResponse.json({ error: "registro_incompleto" }, { status: 403 }) };
  }
  return member;
}

export async function requireActivePaseMember(
  request: Request,
): Promise<AuthenticatedMember | { error: NextResponse }> {
  const member = await requireMember(request);
  if ("error" in member) return member;
  const verifiedAdmin = member.emailVerified && isAdminEmail(member.email);
  if (!verifiedAdmin && !(await hasActivePaseTotal(member.db, member.userId, new Date()))) {
    return { error: NextResponse.json({ error: "pase_requerido" }, { status: 403 }) };
  }
  return member;
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const admins = (process.env.PITCHLAB_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.trim().toLowerCase());
}

export async function requireAdmin(
  request: Request,
): Promise<{ db: Db; userId: string; email: string } | { error: NextResponse }> {
  const auth = getAuth();
  if (!auth) return { error: NextResponse.json({ error: "Cuentas no configuradas" }, { status: 503 }) };
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return { error: NextResponse.json({ error: "Inicia sesión" }, { status: 401 }) };
  if (!session.user.emailVerified || !isAdminEmail(session.user.email)) {
    return { error: NextResponse.json({ error: "Solo para el equipo fundador" }, { status: 403 }) };
  }
  const member = await requireMember(request);
  if ("error" in member) return member;
  return { db: member.db, userId: member.userId, email: member.email };
}
