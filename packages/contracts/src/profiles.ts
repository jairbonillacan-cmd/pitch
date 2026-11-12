export const MAX_PROFILE_BIO_LENGTH = 160;

export function profileBioLength(bio: string): number {
  return Array.from(bio).length;
}

export interface PublicMemberProfile {
  displayName: string;
  handle: string;
  bio: string | null;
  xUsername: string | null;
  joinedAt: string;
  isTipstar: boolean;
}
