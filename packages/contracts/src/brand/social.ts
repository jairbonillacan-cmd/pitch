export const OFFICIAL_SOCIAL_LINKS = [
  ["X", "https://x.com/pitchlabmx"],
  ["Instagram", "https://instagram.com/pitchlab.mx"],
  ["TikTok", "https://tiktok.com/@pitchlabmx"],
  ["YouTube", "https://youtube.com/@pitchlabmx"],
  ["Threads", "https://threads.net/@pitchlabmx"],
  ["Facebook", "https://facebook.com/pitchlabmx"],
  ["LinkedIn", "https://linkedin.com/company/pitchlabmx"],
] as const;

export interface SocialProfile {
  platform: string;
  label: string;
  handle: string;
  url?: string;
  status: "live" | "soon";
}

export const SOCIAL_PROFILES: readonly SocialProfile[] = [
  { platform: "x", label: "X / Twitter", handle: "@pitchlabmx", status: "soon" },
  { platform: "instagram", label: "Instagram", handle: "@pitchlab.mx", status: "soon" },
  { platform: "tiktok", label: "TikTok", handle: "@pitchlabmx", status: "soon" },
  { platform: "youtube", label: "YouTube", handle: "@pitchlabmx", status: "soon" },
  { platform: "telegram", label: "Telegram", handle: "PitchLab MX", status: "soon" },
  { platform: "discord", label: "Discord", handle: "PitchLab", status: "soon" },
] as const;
