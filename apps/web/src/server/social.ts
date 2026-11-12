/**
 * Comunidad: quién puede escribir y validación del texto que llega del navegador.
 * Las reglas que necesitan la base (límite por hora, repetidos, récord) viven en
 * `@pitchlab/db` (`social.ts`).
 */
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { containsExternalLink } from "@pitchlab/contracts";
import {
  createDb,
  eq,
  followCounts,
  listFollowing,
  SOCIAL_LIMITS,
  users,
  type Db,
  type NewSocialPost,
  type SocialPickSnapshot,
} from "@pitchlab/db";
import { getAuth } from "./auth";
import { profileIdForAuthUser } from "./member-data";
import { requireMember } from "./session-user";
import { getViewerAccess } from "./viewer-access";

let socialDb: Db | undefined;

type Member = Exclude<Awaited<ReturnType<typeof requireMember>>, { error: NextResponse }>;

/** Socio con sesión, registro completo y Pase vigente (la Comunidad es para socios). */
export async function requireSocialMember(request: Request): Promise<Member | { error: NextResponse }> {
  const member = await requireMember(request);
  if ("error" in member) return member;
  const access = await getViewerAccess();
  if (!access.signupComplete || !access.profile?.handle) {
    return { error: NextResponse.json({ error: "Termina tu registro para participar." }, { status: 403 }) };
  }
  if (!access.fullAccess) {
    return { error: NextResponse.json({ error: "La comunidad es para socios con Pase vigente." }, { status: 403 }) };
  }
  return member;
}

export type TextCheck = { ok: true; text: string } | { ok: false; error: string };

export function checkSocialText(raw: unknown, kind: "post" | "comment"): TextCheck {
  const text = typeof raw === "string" ? raw.trim() : "";
  const min = kind === "post" ? SOCIAL_LIMITS.postMin : 1;
  const max = kind === "post" ? SOCIAL_LIMITS.postMax : SOCIAL_LIMITS.commentMax;
  if (text.length < min) {
    return { ok: false, error: kind === "post" ? "Escribe al menos una frase sobre tu pick." : "Escribe un comentario." };
  }
  if (text.length > max) return { ok: false, error: `Máximo ${max} caracteres.` };
  if (containsExternalLink(text)) {
    return { ok: false, error: "Enlaces externos (Telegram, WhatsApp, URLs) bloqueados automáticamente." };
  }
  return { ok: true, text };
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const shortText = (v: unknown, max = 120): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Pick adjunto: solo números y textos razonables; si no cuadra, se publica sin pick. */
export function parseSocialPick(raw: unknown): SocialPickSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const pickId = shortText(p.pickId);
  const gameId = shortText(p.gameId);
  const label = shortText(p.label);
  if (!pickId || !gameId || !label) return null;
  if (!finite(p.units) || p.units <= 0 || p.units > 5) return null;
  if (!finite(p.userDecimal) || p.userDecimal <= 1 || p.userDecimal > 1000) return null;
  if (!finite(p.fairDecimal) || p.fairDecimal <= 1 || p.fairDecimal > 1000) return null;
  if (!finite(p.modelProbability) || p.modelProbability < 0 || p.modelProbability > 1) return null;
  return {
    pickId,
    gameId,
    label,
    units: p.units,
    userDecimal: p.userDecimal,
    fairDecimal: p.fairDecimal,
    modelProbability: p.modelProbability,
  };
}

export function parseNewPost(body: Record<string, unknown> | null): { ok: true; post: NewSocialPost } | { ok: false; error: string } {
  const text = checkSocialText(body?.body, "post");
  if (!text.ok) return text;
  const pick = parseSocialPick(body?.pick);
  return {
    ok: true,
    post: {
      body: text.text,
      leagueLabel: shortText(body?.leagueLabel, 60) || "Comunidad",
      matchLabel: shortText(body?.matchLabel, 120),
      pickBadge: shortText(body?.pickBadge, 120),
      gameId: pick?.gameId ?? (shortText(body?.gameId) || null),
      originType: body?.originType === "Spacetime Suite" ? "Spacetime Suite" : "Bitácora Propia",
      pick,
    },
  };
}

export const SOCIAL_REASON_MESSAGES: Record<string, { status: number; error: string }> = {
  limite: { status: 429, error: "Vas muy rápido. Espera un rato antes de volver a publicar." },
  repetido: { status: 409, error: "Ya publicaste ese mismo texto." },
  sin_usuario: { status: 403, error: "Elige tu @usuario para participar." },
  no_existe: { status: 404, error: "Esa publicación ya no existe." },
  propio: { status: 400, error: "No puedes seguirte a ti mismo." },
};

export function reasonResponse(reason: string): NextResponse {
  const r = SOCIAL_REASON_MESSAGES[reason] ?? { status: 400, error: "No se pudo completar." };
  return NextResponse.json({ error: r.error, reason }, { status: r.status });
}

/**
 * Seguidores y seguidos de un perfil, y si quien mira ya lo sigue. Sin base o sin sesión,
 * devuelve lo que se pueda (sin `viewerFollows`).
 */
export async function loadFollowInfo(
  handle: string,
): Promise<{ followers: number; following: number; viewerFollows: boolean } | null> {
  const url = process.env.DATABASE_URL;
  const auth = getAuth();
  if (!url) return null;
  socialDb ??= createDb(url) as unknown as Db;
  const db = socialDb;
  const [target] = await db.select({ id: users.id }).from(users).where(eq(users.handle, handle.toLowerCase()));
  if (!target) return null;
  const counts = await followCounts(db, target.id);
  let viewerFollows = false;
  const session = auth ? await auth.api.getSession({ headers: await headers() }).catch(() => null) : null;
  if (session) {
    const viewerId = await profileIdForAuthUser(db, session.user.id);
    if (viewerId && viewerId !== target.id) {
      viewerFollows = (await listFollowing(db, viewerId)).includes(handle.toLowerCase());
    }
  }
  return { ...counts, viewerFollows };
}
