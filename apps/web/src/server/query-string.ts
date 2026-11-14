/** Convierte un diccionario de `searchParams` de Next.js en una cadena `?a=1&b=2` o `""`. */
export function toQueryString(
  params?: Record<string, string | string[] | undefined>,
  excludeKeys?: ReadonlySet<string>,
): string {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    if (excludeKeys?.has(key) || raw === undefined) continue;
    if (Array.isArray(raw)) {
      for (const item of raw) {
        if (item !== undefined) search.append(key, item);
      }
    } else {
      search.append(key, raw);
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}
