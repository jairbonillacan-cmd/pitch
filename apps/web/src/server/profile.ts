import { containsExternalLink, MAX_PROFILE_BIO_LENGTH, profileBioLength, type PublicMemberProfile } from "@pitchlab/contracts";
import { checkHandleFormat, cleanDisplayName, createDb, publicProfileByHandle, type Db } from "@pitchlab/db";

type ProfileChanges = {
  displayName?: string;
  handle?: string;
  bio?: string | null;
};

export function parseProfileChanges(raw: unknown): { changes: ProfileChanges } | { error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "datos_invalidos" };
  const body = raw as Record<string, unknown>;
  if (Object.keys(body).some((key) => key !== "displayName" && key !== "handle" && key !== "bio")) {
    return { error: "datos_invalidos" };
  }

  const changes: ProfileChanges = {};
  if ("displayName" in body) {
    const name = typeof body.displayName === "string" ? cleanDisplayName(body.displayName) : null;
    if (!name) return { error: "nombre_invalido" };
    changes.displayName = name;
  }
  if ("handle" in body) {
    if (typeof body.handle !== "string") return { error: "usuario_invalido" };
    const handle = checkHandleFormat(body.handle);
    if (!handle.ok) return { error: handle.reason === "reservado" ? "usuario_reservado" : "usuario_invalido" };
    changes.handle = handle.handle;
  }
  if ("bio" in body) {
    if (body.bio !== null && typeof body.bio !== "string") return { error: "bio_invalida" };
    if (typeof body.bio === "string" && (profileBioLength(body.bio) > MAX_PROFILE_BIO_LENGTH || body.bio.includes("\0"))) {
      return { error: "bio_invalida" };
    }
    if (typeof body.bio === "string" && containsExternalLink(body.bio)) return { error: "bio_con_enlace" };
    changes.bio = body.bio?.trim() || null;
  }
  return Object.keys(changes).length ? { changes } : { error: "datos_invalidos" };
}

let profileDb: Db | undefined;

export async function loadPublicMemberProfile(handle: string): Promise<PublicMemberProfile | null> {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  profileDb ??= createDb(url) as unknown as Db;
  const row = await publicProfileByHandle(profileDb, handle);
  if (!row?.handle) return null;
  return {
    displayName: row.displayName || row.handle,
    handle: row.handle,
    bio: row.bio,
    xUsername: row.xUsername,
    joinedAt: row.joinedAt.toISOString(),
    isTipstar: row.isTipstar,
  };
}
