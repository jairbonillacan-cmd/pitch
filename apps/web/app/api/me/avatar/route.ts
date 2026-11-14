import { NextResponse } from "next/server";
import { setMemberAvatarUrl } from "@pitchlab/db";
import {
  getAvatarUploader,
  isAvatarStorageEnabled,
  prepareAvatarImage,
} from "../../../../src/server/avatar-storage";
import { requireMember } from "../../../../src/server/session-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { headers: { "Cache-Control": "no-store" } };

export async function POST(request: Request): Promise<NextResponse> {
  const member = await requireMember(request);
  if ("error" in member) return member.error;

  if (!isAvatarStorageEnabled()) {
    return NextResponse.json({ error: "almacenamiento_no_disponible" }, { status: 503, ...noStore });
  }

  const formData = await request.formData().catch(() => null);
  const rawEntry = formData?.get("file") ?? formData?.get("avatar") ?? null;
  const file = rawEntry instanceof File ? rawEntry : null;

  const prepared = await prepareAvatarImage(file);
  if (!prepared.ok) {
    const status = prepared.error === "archivo_muy_grande" ? 413 : 400;
    return NextResponse.json({ error: prepared.error }, { status, ...noStore });
  }

  const uploader = getAvatarUploader();
  let uploadedUrl: string;
  try {
    const uploaded = await uploader.upload({
      userId: member.userId,
      buffer: prepared.buffer,
      contentType: prepared.contentType,
    });
    uploadedUrl = uploaded.url;
  } catch (err) {
    void err;
    return NextResponse.json({ error: "subida_fallida" }, { status: 502, ...noStore });
  }

  const saved = await setMemberAvatarUrl(member.db, member.userId, uploadedUrl);
  if (saved.status === "missing") {
    if (uploader.remove) await uploader.remove(uploadedUrl);
    return NextResponse.json({ error: "perfil_no_encontrado" }, { status: 404, ...noStore });
  }

  if (saved.previousAvatarUrl && saved.previousAvatarUrl !== uploadedUrl && uploader.remove) {
    await uploader.remove(saved.previousAvatarUrl);
  }

  return NextResponse.json({ avatarUrl: saved.avatarUrl }, noStore);
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const member = await requireMember(request);
  if ("error" in member) return member.error;

  const saved = await setMemberAvatarUrl(member.db, member.userId, null);
  if (saved.status === "missing") {
    return NextResponse.json({ error: "perfil_no_encontrado" }, { status: 404, ...noStore });
  }

  const uploader = getAvatarUploader();
  if (saved.previousAvatarUrl && uploader.remove) {
    await uploader.remove(saved.previousAvatarUrl);
  }

  return NextResponse.json({ avatarUrl: null }, noStore);
}
