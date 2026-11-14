const EXTERNAL_LINK_PATTERNS: readonly RegExp[] = [
  /https?:\/\//i,
  /\bwww\./i,
  /\bt\.me\b/i,
  /\bwa\.me\b/i,
  /\btelegram\b/i,
  /\bdiscord\.gg\b/i,
  /\bbit\.ly\b/i,
  /\bwhatsapp\.com\b/i,
];

export function containsExternalLink(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  return EXTERNAL_LINK_PATTERNS.some((re) => re.test(trimmed));
}
