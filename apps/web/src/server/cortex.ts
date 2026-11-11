/**
 * PitchLab Cortex IA: resumen previo del partido redactado por un LLM vía OpenRouter
 * (ADR-013; modelo del fundador: DeepSeek V4.1 Flash, sin retención de datos).
 *
 * Reglas para que el texto no invente nada:
 * - El modelo solo recibe números ya calculados por Spacetime v3.0 y la lista de factores.
 * - Se rechaza la respuesta si trae un número que no esté en esos datos, si nombra
 *   proveedores o jerga interna (FD-16) o si es demasiado larga. Entonces se usa la
 *   plantilla determinista.
 * - Se guarda en memoria por partido y por versión de los datos.
 */
import { createHash } from "node:crypto";
import type { PlatformGame } from "@pitchlab/ui";

export const DEFAULT_CORTEX_MODEL = "deepseek/deepseek-v4.1-flash-1017";
const MAX_CHARS = 520;
const TIMEOUT_MS = 6000;

/** Términos que no pueden aparecer en la UI (FD-16). */
export const FORBIDDEN_TERMS = [
  "dixon", "coles", "poisson", "logit", "logistic", "elo", "kelly", "shin", "devig", "de-vig",
  "openrouter", "deepseek", "nflverse", "openfootball", "api-football", "understat", "espn",
  "transfermarkt", "rotowire", "clubelo", "open-meteo", "pinnacle", "action network", "smarkets",
  "sumersports", "ourlads", "fbref", "opta", "statiskicks",
];

export interface CortexFacts {
  partido: string;
  liga: string;
  probabilidades: Record<string, string>;
  proyeccion: string | null;
  mercado: { casa: string; probabilidades: Record<string, string> } | null;
  factores: string[];
  bajas: string[];
  estadio: string | null;
}

const pct = (p: number) => `${Math.round(p * 100)} %`;

export function cortexFactsFor(game: PlatformGame): CortexFacts {
  const isNfl = game.sport === "american-football";
  const [ph, pd, pa] = game.x12;
  const probabilidades: Record<string, string> = { [game.home.shortName]: pct(ph), [game.away.shortName]: pct(pa) };
  if (!isNfl) probabilidades.Empate = pct(pd);
  const s = game.spacetime;
  const digits = isNfl ? 1 : 2;
  return {
    partido: `${game.home.name} vs ${game.away.name}`,
    liga: game.leagueLabel,
    probabilidades,
    proyeccion: game.projection
      ? `${game.home.shortName} ${game.projection.home.toFixed(digits)} – ${game.projection.away.toFixed(digits)} ${game.away.shortName}`
      : null,
    mercado: s?.market
      ? {
          casa: s.market.bookLabel,
          probabilidades: Object.fromEntries(
            [
              [game.home.shortName, pct(s.market.noVig.home)],
              ...(isNfl ? [] : [["Empate", pct(s.market.noVig.draw)]]),
              [game.away.shortName, pct(s.market.noVig.away)],
            ] as Array<[string, string]>,
          ),
        }
      : null,
    factores: (s?.drivers ?? [])
      .slice()
      .sort((a, b) => Math.abs(b.impactLogit) - Math.abs(a.impactLogit))
      .slice(0, 3)
      .map((d) => `${d.label} (${d.impactLogit >= 0 ? `a favor de ${game.home.shortName}` : `a favor de ${game.away.shortName}`})`),
    bajas: game.preGame.absences.map((a) => a.player),
    estadio: s?.stadium.name ?? null,
  };
}

/** Números permitidos en el texto: los que aparecen en los datos (y 60 por «60 minutos» no). */
export function allowedNumbers(facts: CortexFacts): Set<string> {
  const out = new Set<string>();
  const text = JSON.stringify(facts);
  for (const m of text.matchAll(/\d+(?:[.,]\d+)?/g)) out.add(m[0].replace(",", "."));
  return out;
}

export function validateCortexText(text: string, facts: CortexFacts): { ok: true; text: string } | { ok: false; reason: string } {
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean.length < 40) return { ok: false, reason: "muy_corto" };
  if (clean.length > MAX_CHARS) return { ok: false, reason: "muy_largo" };
  const lower = clean.toLowerCase();
  const forbidden = FORBIDDEN_TERMS.find((t) => new RegExp(`(^|[^a-záéíóúñ])${t}([^a-záéíóúñ]|$)`).test(lower));
  if (forbidden) return { ok: false, reason: `termino_prohibido:${forbidden}` };
  const allowed = allowedNumbers(facts);
  for (const m of clean.matchAll(/\d+(?:[.,]\d+)?/g)) {
    if (!allowed.has(m[0].replace(",", "."))) return { ok: false, reason: `numero_no_respaldado:${m[0]}` };
  }
  return { ok: true, text: clean };
}

const SYSTEM_PROMPT = [
  "Eres Cortex IA de PitchLab. Escribes en español de México un resumen previo de un partido.",
  "Usa SOLO los datos del JSON. No agregues números, nombres de jugadores, rachas ni noticias que no estén ahí.",
  "No menciones proveedores, casas de datos, modelos ni fórmulas. Puedes nombrar la casa de apuestas del campo 'mercado.casa'.",
  "Máximo 3 oraciones y 70 palabras. Tono claro y sobrio, sin promesas de ganancia ni lenguaje de apuesta segura.",
].join(" ");

const cache = new Map<string, string | null>();

export interface CortexOptions {
  apiKey?: string;
  model?: string;
  provider?: string;
  fetchImpl?: typeof fetch;
}

/** Resumen de Cortex IA o null (sin clave, error, tiempo agotado o texto rechazado). */
export async function cortexSummary(game: PlatformGame, options: CortexOptions = {}): Promise<string | null> {
  const apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  const facts = cortexFactsFor(game);
  const key = `${game.id}:${createHash("sha256").update(JSON.stringify(facts)).digest("hex").slice(0, 16)}`;
  if (cache.has(key)) return cache.get(key) ?? null;

  const provider = options.provider ?? process.env.OPENROUTER_PROVIDER;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let result: string | null = null;
  try {
    const res = await (options.fetchImpl ?? fetch)("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "x-title": "PitchLab",
      },
      body: JSON.stringify({
        model: options.model ?? process.env.OPENROUTER_MODEL ?? DEFAULT_CORTEX_MODEL,
        temperature: 0.3,
        max_tokens: 220,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(facts) },
        ],
        provider: {
          data_collection: "deny",
          ...(provider ? { order: [provider], allow_fallbacks: false } : {}),
        },
      }),
    });
    if (res.ok) {
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = json.choices?.[0]?.message?.content ?? "";
      const checked = validateCortexText(content, facts);
      if (checked.ok) result = checked.text;
      else console.warn(`[cortex] ${game.id}: texto rechazado (${checked.reason})`);
    } else {
      console.warn(`[cortex] ${game.id}: OpenRouter respondió ${res.status}`);
    }
  } catch (err) {
    console.warn(`[cortex] ${game.id}:`, err instanceof Error ? err.message : err);
  } finally {
    clearTimeout(timer);
  }
  cache.set(key, result);
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return result;
}
