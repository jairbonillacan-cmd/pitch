/**
 * Volumen por resultado en mercados de predicción con API pública (FD-20).
 *
 * Vive en un archivo aparte por liga (`data/snapshots/<liga>/market-pulse.json`) para poder
 * actualizarse sin tocar los análisis publicados, que nunca se recalculan. No es dinero de casas
 * mexicanas: es la actividad de mercados internacionales y se presenta como sentimiento.
 */
import { z } from "zod";

export const MarketPulseSideSchema = z.enum(["home", "draw", "away"]);
export type MarketPulseSide = z.infer<typeof MarketPulseSideSchema>;

export const MarketPulseEntrySchema = z.object({
  gameId: z.string().min(1),
  /** Proveedor; nunca se muestra en la UI (FD-16). */
  source: z.enum(["polymarket", "kalshi"]),
  /** `usd`: volumen en dólares. `contracts`: contratos de hasta US$1. */
  unit: z.enum(["usd", "contracts"]),
  observedAt: z.string().min(10),
  outcomes: z
    .array(
      z.object({
        side: MarketPulseSideSchema,
        volume: z.number().nonnegative(),
        /** Precio del «sí» (0-1): probabilidad implícita del mercado. */
        price: z.number().min(0).max(1).nullable(),
      }),
    )
    .min(2)
    .max(3),
});
export type MarketPulseEntry = z.infer<typeof MarketPulseEntrySchema>;

export const MarketPulseFileSchema = z.object({
  schemaVersion: z.literal(1),
  league: z.string().min(1),
  observedAt: z.string().min(10),
  entries: z.array(MarketPulseEntrySchema),
});
export type MarketPulseFile = z.infer<typeof MarketPulseFileSchema>;

/** Debajo de este volumen el reparto no significa nada y la UI no lo interpreta. */
export const MARKET_PULSE_MIN_VOLUME = { usd: 5_000, contracts: 10_000 } as const;

/** Diferencia (puntos de probabilidad) a partir de la cual el mercado se considera cargado. */
export const MARKET_PULSE_LEAN_GAP = 0.12;

export interface MarketPulseView {
  unit: "usd" | "contracts";
  observedAt: string;
  totalVolume: number;
  /** El volumen total es menor al mínimo: se muestra sin lectura. */
  thin: boolean;
  sides: Array<{
    side: MarketPulseSide;
    volume: number;
    /** Parte del volumen total (0-1). */
    share: number;
    price: number | null;
  }>;
}

export function toMarketPulseView(entry: MarketPulseEntry): MarketPulseView {
  const totalVolume = entry.outcomes.reduce((sum, o) => sum + o.volume, 0);
  const order: Record<MarketPulseSide, number> = { home: 0, draw: 1, away: 2 };
  return {
    unit: entry.unit,
    observedAt: entry.observedAt,
    totalVolume,
    thin: totalVolume < MARKET_PULSE_MIN_VOLUME[entry.unit],
    sides: [...entry.outcomes]
      .sort((a, b) => order[a.side] - order[b.side])
      .map((o) => ({
        side: o.side,
        volume: o.volume,
        share: totalVolume > 0 ? o.volume / totalVolume : 0,
        price: o.price,
      })),
  };
}

/**
 * Lado donde el volumen supera con más holgura a la probabilidad del modelo.
 * Devuelve `null` si el mercado es delgado o ningún lado pasa de `MARKET_PULSE_LEAN_GAP`.
 */
export function marketPulseLean(
  view: MarketPulseView,
  model: Partial<Record<MarketPulseSide, number>>,
): { side: MarketPulseSide; share: number; model: number; gap: number } | null {
  if (view.thin) return null;
  let best: { side: MarketPulseSide; share: number; model: number; gap: number } | null = null;
  for (const s of view.sides) {
    const p = model[s.side];
    if (p === undefined) continue;
    const gap = s.share - p;
    if (gap >= MARKET_PULSE_LEAN_GAP && (!best || gap > best.gap)) {
      best = { side: s.side, share: s.share, model: p, gap };
    }
  }
  return best;
}
