export const MAX_PROFILE_BIO_LENGTH = 160;

export function profileBioLength(bio: string): number {
  return Array.from(bio).length;
}

export interface PublicMemberProfile {
  displayName: string;
  handle: string;
  bio: string | null;
  avatarUrl?: string | null;
  xUsername: string | null;
  joinedAt: string;
  isTipstar: boolean;
  /** Seguidores y seguidos en Comunidad (solo en la página del perfil). */
  followers?: number;
  following?: number;
  /** Quien mira ya sigue a este socio (incluido en `followers`). */
  viewerFollows?: boolean;
}
