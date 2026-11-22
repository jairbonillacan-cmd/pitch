const CONTROL_BIDI_ZERO_WIDTH_RE =
  /[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/;

const STRIP_CONTROL_BIDI_RE =
  /[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]+/g;

export function hasControlOrBidiChars(raw: string): boolean {
  return CONTROL_BIDI_ZERO_WIDTH_RE.test(raw);
}

export function sanitizeQueryText(raw: string | null | undefined, maxLen: number): string {
  if (typeof raw !== "string") return "";
  return raw.replace(STRIP_CONTROL_BIDI_RE, "").trim().slice(0, maxLen);
}
