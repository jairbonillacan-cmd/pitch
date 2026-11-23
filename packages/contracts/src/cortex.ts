export const CORTEX_MAX_CHARS = 520;

export const FORBIDDEN_TERMS = [
  "dixon", "coles", "poisson", "logit", "logistic", "elo", "kelly", "shin", "devig", "de-vig",
  "lightgbm", "platt", "pitágoras", "pitagoras", "log5",
  "openrouter", "deepseek", "nflverse", "openfootball", "api-football", "football-data", "the-odds-api",
  "understat", "espn", "transfermarkt", "rotowire", "clubelo", "open-meteo", "pinnacle",
  "action network", "smarkets", "polymarket", "kalshi", "sumersports", "ourlads", "fbref",
  "opta", "statiskicks", "touchiq", "aztecavet", "linemate",
  "bzzoiro", "sportmonks", "scoutpicks", "sofascore", "astraanalisis",
];

export interface CortexFacts {
  partido: string;
  local: string;
  visitante: string;
  liga: string;
  probabilidades: Record<string, string>;
  proyeccion: string | null;
  mercado: { casa: string; probabilidades: Record<string, string> } | null;
  factores: string[];
  bajas: string[];
  estadio: string | null;
  extras?: Record<string, unknown>;
}

const DIACRITIC_MARK_RE = /[\u0300-\u036f]/;
const INJECTION_PATTERNS =
  /\b(?:ignore\s+(?:all\s+)?previous(?:\s+instructions)?|disregard\s+(?:all\s+)?instructions|ignora\s+(?:todas?\s+)?las\s+instrucciones|olvida\s+(?:todas?\s+)?las\s+reglas)\b|\b(?:system|assistant|developer)\s*:/gi;

function foldWithIndexMap(text: string): {
  readonly folded: string;
  readonly origStart: number[];
  readonly origEnd: number[];
} {
  const foldedChars: string[] = [];
  const origStart: number[] = [];
  const origEnd: number[] = [];
  let i = 0;
  while (i < text.length) {
    const cp = text.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    const nextIdx = i + ch.length;
    const nfd = ch.normalize("NFD");
    for (const part of nfd) {
      if (!DIACRITIC_MARK_RE.test(part)) {
        foldedChars.push(part);
        origStart.push(i);
        origEnd.push(nextIdx);
      }
    }
    i = nextIdx;
  }
  return { folded: foldedChars.join(""), origStart, origEnd };
}

function stripInjectionsOnce(text: string): string {
  const { folded, origStart, origEnd } = foldWithIndexMap(text);
  const ranges: Array<[number, number]> = [];
  INJECTION_PATTERNS.lastIndex = 0;
  let match: RegExpExecArray | null = INJECTION_PATTERNS.exec(folded);
  while (match !== null) {
    const startIdx = match.index;
    const endIdx = startIdx + match[0].length - 1;
    if (startIdx >= 0 && endIdx >= startIdx && endIdx < origEnd.length) {
      ranges.push([origStart[startIdx]!, origEnd[endIdx]!]);
    }
    match = INJECTION_PATTERNS.exec(folded);
  }
  if (ranges.length === 0) return text;
  let out = "";
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) out += text.slice(cursor, start);
    cursor = Math.max(cursor, end);
  }
  if (cursor < text.length) out += text.slice(cursor);
  return out;
}

export function sanitizeCortexField(raw: string | null | undefined, maxLen: number = 80): string {
  if (!raw) return "";
  let current = raw.replace(/[\u0000-\u001F\u007F<>`]/g, " ");
  for (let pass = 0; pass < 8; pass += 1) {
    const next = stripInjectionsOnce(current).replace(/\s+/g, " ");
    if (next === current) break;
    current = next;
  }
  return current.replace(/\s+/g, " ").trim().slice(0, maxLen);
}

export function allowedNumbers(facts: CortexFacts): Set<string> {
  const out = new Set<string>();
  const text = JSON.stringify(facts);
  for (const m of text.matchAll(/\d+(?:[.,]\d+)?/g)) out.add(m[0].replace(",", "."));
  return out;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parsePercentFloat(raw: string | null): number {
  if (!raw) return Number.NaN;
  return Number.parseFloat(raw);
}

export function validateCortexText(
  text: string,
  facts: CortexFacts,
  limits: { minChars?: number; maxChars?: number } = {},
): { ok: true; text: string } | { ok: false; reason: string } {
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean.length < (limits.minChars ?? 40)) return { ok: false, reason: "muy_corto" };
  if (clean.length > (limits.maxChars ?? CORTEX_MAX_CHARS)) return { ok: false, reason: "muy_largo" };
  const lower = clean.toLowerCase();
  const forbidden = FORBIDDEN_TERMS.find((t) =>
    new RegExp(`(^|[^a-záéíóúñ0-9-])${escapeRegExp(t)}([^a-záéíóúñ0-9-]|$)`).test(lower),
  );
  if (forbidden) return { ok: false, reason: `termino_prohibido:${forbidden}` };
  const filler = CHAT_FILLER.find((re) => re.test(lower));
  if (filler) return { ok: false, reason: "muletilla_de_chat" };
  const betting = BETTING_LANGUAGE.find((re) => re.test(lower));
  if (betting) return { ok: false, reason: "lenguaje_de_apuesta" };
  const editorial = EDITORIAL_FORBIDDEN.find((re) => re.test(lower));
  if (editorial) return { ok: false, reason: "jerga_editorial_prohibida" };
  const allowed = allowedNumbers(facts);
  for (const m of clean.matchAll(/\d+(?:[.,]\d+)?/g)) {
    if (!allowed.has(m[0].replace(",", "."))) return { ok: false, reason: `numero_no_respaldado:${m[0]}` };
  }
  const semantic = checkTeamConsistency(clean, facts);
  if (semantic) return { ok: false, reason: semantic };
  return { ok: true, text: clean };
}

const CHAT_FILLER: readonly RegExp[] = [
  /\bjson\b/,
  /datos_partido/,
  /\bperd[oó]n\b/,
  /\bdisculp/,
  /\blo siento\b/,
  /\bcomo (?:un )?(?:modelo|asistente|ia)\b/,
  /\bmodelo de lenguaje\b/,
  /\bno tengo (?:acceso|informaci[oó]n)\b/,
];

const BETTING_LANGUAGE: readonly RegExp[] = [
  /\bapuesta segura\b/,
  /\bgarantiz/,
  /\bno (?:puede|va a) fallar\b/,
  /\bstake\b/,
  /\bapuesta (?:ya|fuerte|todo)\b/,
];

const EDITORIAL_FORBIDDEN: readonly RegExp[] = [
  /\bconfianza\s*\d/,
  /\bdatos\s+(?:completos|parciales)\b/,
];

interface TeamRef {
  role: "home" | "away";
  key: string;
  names: string[];
}

function teamRefs(facts: CortexFacts): TeamRef[] {
  const keys = Object.keys(facts.probabilidades).filter((k) => k !== "Empate");
  const [homeFull, awayFull] = facts.partido.split(" vs ");
  if (keys.length !== 2 || keys[0] === keys[1]) return [];
  return [
    { role: "home", key: keys[0]!, names: [...new Set([keys[0]!, homeFull ?? ""].filter((n) => n.length >= 3))] },
    { role: "away", key: keys[1]!, names: [...new Set([keys[1]!, awayFull ?? ""].filter((n) => n.length >= 3))] },
  ];
}

function percentNumber(value: string | undefined): string | null {
  const m = value?.match(/\d+(?:[.,]\d+)?/);
  return m ? m[0].replace(",", ".") : null;
}

function mentions(sentence: string, ref: TeamRef): number[] {
  const lower = sentence.toLowerCase();
  const out: number[] = [];
  for (const name of ref.names) {
    const re = new RegExp(`(^|[^a-záéíóúñ0-9])${escapeRegExp(name.toLowerCase())}(?=[^a-záéíóúñ0-9]|$)`, "g");
    for (const m of lower.matchAll(re)) out.push((m.index ?? 0) + m[1]!.length);
  }
  return out;
}

export function checkTeamConsistency(text: string, facts: CortexFacts): string | null {
  const refs = teamRefs(facts);
  if (refs.length !== 2) return null;
  const probOf = (key: string, source: Record<string, string> | undefined) => percentNumber(source?.[key]);
  const valuesOf = (key: string) =>
    new Set([probOf(key, facts.probabilidades), probOf(key, facts.mercado?.probabilidades)].filter(Boolean));
  const [home, away] = refs as [TeamRef, TeamRef];
  const modelHome = parsePercentFloat(probOf(home.key, facts.probabilidades));
  const modelAway = parsePercentFloat(probOf(away.key, facts.probabilidades));
  const favorite = modelHome > modelAway ? home : modelAway > modelHome ? away : null;

  for (const sentence of text.split(/(?<=[.!?;])\s+/)) {
    const lower = sentence.toLowerCase();
    const inSentence = refs.filter((r) => mentions(sentence, r).length > 0);

    if (/favorit/.test(lower) && !/\bno (?:es|llega como|parte como) (?:el )?favorit/.test(lower) && inSentence.length === 1 && favorite) {
      if (inSentence[0] !== favorite) return "favorito_invertido";
    }

    for (const ref of refs) {
      for (const pos of mentions(sentence, ref)) {
        const after = lower.slice(pos, pos + 60);
        const nameLen = ref.names.map((n) => n.toLowerCase()).find((n) => after.startsWith(n))?.length ?? 0;
        const tail = after.slice(nameLen, nameLen + 30);
        if (ref === away && /^[^.]{0,12}\b(?:en casa|en su casa|como local|de local|como anfitri)/.test(tail)) {
          return "rol_invertido";
        }
        if (ref === home && /^[^.]{0,12}\b(?:de visita|como visitante|fuera de casa)/.test(tail)) {
          return "rol_invertido";
        }
      }
    }

    for (const m of sentence.matchAll(/(\d+(?:[.,]\d+)?)\s?%/g)) {
      const value = m[1]!.replace(",", ".");
      const start = m.index ?? 0;
      const end = start + m[0].length;
      const following = lower.slice(end, end + 40);
      let owner: TeamRef | null =
        refs.find((r) =>
          r.names.some((n) =>
            new RegExp(`^\\s*(?:de probabilidad\\s+)?(?:para|de|a favor de)\\s+${escapeRegExp(n.toLowerCase())}(?=[^a-záéíóúñ0-9]|$)`).test(following),
          ),
        ) ?? null;
      if (!owner) {
        let best = -1;
        for (const r of refs) {
          for (const pos of mentions(sentence, r)) {
            if (pos < start && pos > best) {
              best = pos;
              owner = r;
            }
          }
        }
        if (owner && /empate/.test(lower.slice(best, start))) owner = null;
      }
      if (!owner) continue;
      const rival = owner === home ? away : home;
      const mine = valuesOf(owner.key);
      if (!mine.has(value) && valuesOf(rival.key).has(value)) return "porcentaje_mal_atribuido";
    }
  }
  return null;
}
