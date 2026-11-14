import { NextResponse } from "next/server";
import { deleteSocialPost, getSocialPostById } from "@pitchlab/db";
import { withAuthorBadges } from "../../../../../src/server/badges";
import { requireMember } from "../../../../../src/server/session-user";
import { requireSocialMember } from "../../../../../src/server/social";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Devuelve una publicación puntual (p. ej. al abrir un aviso de la campana). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const member = await requireSocialMember(request);
  if ("error" in member) return member.error;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Publicación inválida" }, { status: 400 });
  const post = await getSocialPostById(member.db, member.userId, id);
  return post
    ? NextResponse.json({ post: (await withAuthorBadges(member.db, [post]))[0] })
    : NextResponse.json({ error: "Publicación no encontrada." }, { status: 404 });
}

/** Borra una publicación propia. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const member = await requireMember(request);
  if ("error" in member) return member.error;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Publicación inválida" }, { status: 400 });
  const deleted = await deleteSocialPost(member.db, member.userId, id);
  return deleted
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "No puedes borrar esa publicación." }, { status: 404 });
}
