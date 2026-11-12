export const MAX_PROFILE_BIO_LENGTH = 160;

export interface PublicMemberProfile {
  displayName: string;
  handle: string;
  bio: string | null;
  xUsername: string | null;
  joinedAt: string;
  isTipstar: boolean;
}
