export const CLUB_PROFILE_HANDLE_HEADER = "x-pitchlab-profile-handle";
export const CLUB_REQUEST_PATH_HEADER = "x-pitchlab-club-path";

export function normalizeClubHandle(handle: string): string {
  return handle.replace(/^@/, "").trim().toLowerCase();
}
