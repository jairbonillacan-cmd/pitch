import { NextResponse } from "next/server";
import { setMemberAvatarUrl } from "@pitchlab/db";
import { withMemberMutation } from "../../../../src/server/api-guards";
import {
  getAvatarUploader,
  isAvatarStorageEnabled,
  prepareAvatarImage,
} from "../../../../src/server/avatar-storage";
import { logSecurityEvent } from "../../../../src/server/safe-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withMemberMutation(
  { bucket: "me-avatar", requireJson: false },
  async ({ request, user }) => {
    if (!isAvatarStorageEnabled()) {
      return NextResponse.json({ error: "almacenamiento_no_disponible" }, { status: 503 });
    }

    const formData = await request.formData().catch(() => null);
    const rawEntry = formData?.get("file") ?? formData?.get("avatar") ?? null;
    const file = rawEntry instanceof File ? rawEntry : null;

    const prepared = await prepareAvatarImage(file);
    if (!prepared.ok) {
      const status = prepared.error === "archivo_muy_grande" ? 413 : 400;
      return NextResponse.json({ error: prepared.error }, { status });
    }

    const uploader = getAvatarUploader();
    let uploadedUrl: string;
    try {
      const uploaded = await uploader.upload({
        userId: user.userId,
        buffer: prepared.buffer,
        contentType: prepared.contentType,
      });
      uploadedUrl = uploaded.url;
    } catch (err) {
      logSecurityEvent("warn", "avatar_upload_failed", { userId: user.userId, error: err });
      return NextResponse.json({ error: "subida_fallida" }, { status: 502 });
    }

    const saved = await setMemberAvatarUrl(user.db, user.userId, uploadedUrl);
    if (saved.status === "missing") {
      if (uploader.remove) await uploader.remove(uploadedUrl);
      return NextResponse.json({ error: "perfil_no_encontrado" }, { status: 404 });
    }

    if (saved.previousAvatarUrl && saved.previousAvatarUrl !== uploadedUrl && uploader.remove) {
      await uploader.remove(saved.previousAvatarUrl);
    }

    return NextResponse.json({ avatarUrl: saved.avatarUrl });
  },
);

export const DELETE = withMemberMutation(
  { bucket: "me-avatar", requireJson: false },
  async ({ user }) => {
    const saved = await setMemberAvatarUrl(user.db, user.userId, null);
    if (saved.status === "missing") {
      return NextResponse.json({ error: "perfil_no_encontrado" }, { status: 404 });
    }

    const uploader = getAvatarUploader();
    if (saved.previousAvatarUrl && uploader.remove) {
      await uploader.remove(saved.previousAvatarUrl);
    }

    return NextResponse.json({ avatarUrl: null });
  },
);
