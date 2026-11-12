export const CLUB_PROFILE_HANDLE_HEADER = "x-pitchlab-profile-handle";

export function normalizeClubHandle(handle: string): string {
  return handle.replace(/^@/, "").trim().toLowerCase();
}
