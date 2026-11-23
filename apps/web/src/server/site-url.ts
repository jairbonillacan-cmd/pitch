export function getSiteUrl(): string {
  return (process.env.BETTER_AUTH_URL ?? "https://pitchlab.mx").replace(/\/$/, "");
}
