"use client";

import React, { useEffect, useMemo, useState } from "react";
import { formatOddsValue } from "../access-guard";
import type { OddsFormat, ParlayLeg, SgpCopulaAuditView } from "../types";
import { MaestroIcon } from "./MaestroPrimitives";

export interface SgpCopulaAuditCardProps {
  readonly legs: readonly ParlayLeg[];
  readonly oddsFormat: OddsFormat;
  /** Momio combinado decimal que ofrece la casa del socio (opcional, activa el auditor de margen oculto). */
  readonly offeredCombinedDecimalOdds?: number | null;
  /** Permite inyectar una evaluación directa en Storybook y pruebas sin llamadas de red. */
  readonly precomputedAudit?: SgpCopulaAuditView | null;
  /** Modo compacto para el bottom-sheet móvil. */
  readonly compact?: boolean;
  /** Notifica al boleto padre cuando se resuelve la probabilidad exacta de la Cópula Student-t. */
  readonly onAuditResolved?: (audit: SgpCopulaAuditView | null) => void;
}

interface MappedSgpLeg {
  readonly legId: string;
  readonly factor: string;
  readonly marginalProbability: number;
  readonly direction: 1 | -1;
}

const DIRECTION_COPY: Readonly<
  Record<
    SgpCopulaAuditView["correlationDirection"],
    { readonly label: string; readonly tone: string; readonly note: string }
  >
> = {
  positively_correlated: {
    label: "Correlación a favor",
    tone: "var(--pl-success)",
    note: "Estas selecciones suelen cumplirse juntas con mayor frecuencia que por separado.",
  },
  negatively_correlated: {
    label: "Correlación en contra",
    tone: "var(--pl-warning)",
    note: "Una selección dificulta la otra: la probabilidad real baja frente al producto simple.",
  },
  near_independent: {
    label: "Casi independientes",
    tone: "var(--pl-brand)",
    note: "Poca dependencia entre los eventos dentro del mismo partido.",
  },
};

const TAX_COPY: Readonly<
  Record<
    NonNullable<SgpCopulaAuditView["bookQuoteAudit"]>["taxFlag"],
    { readonly label: string; readonly tone: string }
  >
> = {
  fair_or_low_vig: { label: "Margen razonable", tone: "var(--pl-success)" },
  standard_sgp_vig: { label: "Margen típico de casa", tone: "var(--pl-warning)" },
  severe_sgp_tax: { label: "Sobrecargo alto SGP", tone: "var(--pl-danger)" },
};

/** Mapea una selección del parlay a un factor latente de `sgp_copula_v5_0_candidate.json`. */
export function mapPickToSgpFactor(
  leg: ParlayLeg,
  sport: "soccer" | "nfl",
): MappedSgpLeg | null {
  const { pick } = leg;
  const m = (pick.market ?? "").toLowerCase();
  const s = pick.selectionKey.toLowerCase();
  const l = pick.label.toLowerCase();
  const p = Math.max(0.01, Math.min(0.99, pick.p));

  if (sport === "nfl") {
    if (
      m.includes("total") ||
      pick.conflictGroup === "over_total" ||
      pick.conflictGroup === "under_total" ||
      l.includes("más de") ||
      l.includes("menos de")
    ) {
      const dir: 1 | -1 =
        pick.conflictGroup === "under_total" || s.includes("under") || l.includes("menos de")
          ? -1
          : 1;
      return { legId: pick.id, factor: "total_points", marginalProbability: p, direction: dir };
    }
    const dir: 1 | -1 =
      pick.conflictGroup === "away_side" || s.includes("away") ? -1 : 1;
    return { legId: pick.id, factor: "home_margin", marginalProbability: p, direction: dir };
  }

  // Fútbol
  if (m.includes("corner") || l.includes("córner") || l.includes("esquina")) {
    const dir: 1 | -1 = s.includes("under") || l.includes("menos de") ? -1 : 1;
    return { legId: pick.id, factor: "total_corners", marginalProbability: p, direction: dir };
  }
  if (m.includes("yellow") || m.includes("card") || m.includes("booking") || l.includes("amarilla") || l.includes("tarjeta")) {
    const dir: 1 | -1 = s.includes("under") || l.includes("menos de") ? -1 : 1;
    return { legId: pick.id, factor: "total_yellow_cards", marginalProbability: p, direction: dir };
  }
  if (m.includes("sot") || l.includes("a puerta")) {
    const dir: 1 | -1 = s.includes("under") || l.includes("menos de") ? -1 : 1;
    return { legId: pick.id, factor: "total_shots_on_target", marginalProbability: p, direction: dir };
  }
  if (m.startsWith("ht_") || l.includes("1er tiempo")) {
    const dir: 1 | -1 = s.includes("under") || l.includes("menos de") ? -1 : 1;
    return { legId: pick.id, factor: "ht_total_goals", marginalProbability: p, direction: dir };
  }
  if (
    m.includes("total") ||
    m.includes("btts") ||
    pick.conflictGroup === "over_total" ||
    pick.conflictGroup === "under_total" ||
    pick.conflictGroup === "btts_yes" ||
    pick.conflictGroup === "btts_no" ||
    l.includes("más de") ||
    l.includes("menos de") ||
    l.includes("ambos anotan")
  ) {
    const dir: 1 | -1 =
      pick.conflictGroup === "under_total" ||
      pick.conflictGroup === "btts_no" ||
      s.includes("under") ||
      s.includes("no") ||
      l.includes("menos de")
        ? -1
        : 1;
    return { legId: pick.id, factor: "total_goals", marginalProbability: p, direction: dir };
  }
  const dir: 1 | -1 =
    pick.conflictGroup === "away_side" || s.includes("away") || s === "2" ? -1 : 1;
  return { legId: pick.id, factor: "goal_diff", marginalProbability: p, direction: dir };
}

function findPrimarySgpCluster(legs: readonly ParlayLeg[]): {
  sport: "soccer" | "nfl";
  mapped: MappedSgpLeg[];
  matchLabel: string;
} | null {
  const byGame = new Map<string, ParlayLeg[]>();
  for (const leg of legs) {
    const list = byGame.get(leg.pick.gameId) ?? [];
    list.push(leg);
    byGame.set(leg.pick.gameId, list);
  }
  for (const group of byGame.values()) {
    if (group.length < 2) continue;
    const first = group[0]!;
    const sport: "soccer" | "nfl" | null =
      first.pick.league === "nfl"
        ? "nfl"
        : first.pick.league !== "nba" &&
            first.pick.league !== "nhl" &&
            first.pick.league !== "mlb"
          ? "soccer"
          : null;
    if (!sport) continue;
    const mapped = group
      .slice(0, 8)
      .map((l) => mapPickToSgpFactor(l, sport))
      .filter((x): x is MappedSgpLeg => x !== null);
    if (mapped.length >= 2) {
      return { sport, mapped, matchLabel: first.pick.matchLabel };
    }
  }
  return null;
}

/**
 * Muestra la correlación real de un Same-Game Parlay calculada con Cópula Student-t en servidor
 * (`/api/parlays/sgp`) y audita el sobrecargo oculto cuando el usuario captura el momio de su casa.
 */
export function SgpCopulaAuditCard({
  legs,
  oddsFormat,
  offeredCombinedDecimalOdds = null,
  precomputedAudit = null,
  compact = false,
  onAuditResolved,
}: SgpCopulaAuditCardProps): React.JSX.Element | null {
  const cluster = useMemo(() => findPrimarySgpCluster(legs), [legs]);
  const [fetchedAudit, setFetchedAudit] = useState<SgpCopulaAuditView | null>(null);
  const [loading, setLoading] = useState(false);

  const offeredValid =
    typeof offeredCombinedDecimalOdds === "number" &&
    Number.isFinite(offeredCombinedDecimalOdds) &&
    offeredCombinedDecimalOdds > 1.01
      ? Math.round(offeredCombinedDecimalOdds * 100) / 100
      : null;

  const requestKey = useMemo(() => {
    if (!cluster) return "";
    return JSON.stringify({
      sport: cluster.sport,
      legs: cluster.mapped,
      offeredCombinedDecimalOdds: offeredValid,
    });
  }, [cluster, offeredValid]);

  useEffect(() => {
    if (precomputedAudit) {
      onAuditResolved?.(precomputedAudit);
      return;
    }
    if (!cluster || !requestKey) {
      setFetchedAudit(null);
      setLoading(false);
      onAuditResolved?.(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(() => {
      fetch("/api/parlays/sgp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: requestKey,
        signal: controller.signal,
      })
        .then((res) => (res.ok ? (res.json() as Promise<{ audit?: SgpCopulaAuditView }>) : null))
        .then((json) => {
          if (!controller.signal.aborted && json?.audit) {
            setFetchedAudit(json.audit);
            onAuditResolved?.(json.audit);
          }
        })
        .catch((err) => {
          if (!controller.signal.aborted) {
            void err;
            setFetchedAudit(null);
            onAuditResolved?.(null);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [cluster, onAuditResolved, precomputedAudit, requestKey]);

  const audit = precomputedAudit ?? fetchedAudit;
  if (!cluster && !precomputedAudit) return null;

  const dirMeta = audit ? DIRECTION_COPY[audit.correlationDirection] : null;
  const taxMeta = audit?.bookQuoteAudit ? TAX_COPY[audit.bookQuoteAudit.taxFlag] : null;

  return (
    <section
      className="rounded-2xl p-3.5 space-y-2.5"
      style={{
        background: "var(--pl-surface)",
        boxShadow: dirMeta
          ? `inset 0 0 0 1px color-mix(in srgb, ${dirMeta.tone} 34%, var(--pl-border))`
          : "inset 0 0 0 1px var(--pl-border)",
      }}
      data-sgp-copula-card=""
      data-sgp-direction={audit?.correlationDirection ?? "loading"}
      aria-live="polite"
      aria-label="Análisis de correlación del mismo partido"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span
          className="text-xs font-extrabold inline-flex items-center gap-1.5"
          style={{ color: "var(--pl-brand)" }}
        >
          <MaestroIcon name="activity" size={13} />
          <span>Correlación mismo partido (SGP)</span>
        </span>
        {dirMeta ? (
          <span
            className="pl-pill text-[11px] font-bold"
            style={{
              color: dirMeta.tone,
              background: `color-mix(in srgb, ${dirMeta.tone} 12%, var(--pl-surface-elevated))`,
            }}
          >
            {dirMeta.label} · ×{audit!.correlationMultiplier.toFixed(2)}
          </span>
        ) : (
          <span className="text-[11px]" style={{ color: "var(--pl-text-muted)" }}>
            {loading ? "Calculando dependencia…" : "Dependencia ajustada"}
          </span>
        )}
      </header>

      {audit ? (
        <>
          <div className="grid grid-cols-2 gap-2 num">
            <div
              className="rounded-xl p-2.5"
              style={{ background: "var(--pl-surface-elevated)" }}
            >
              <span className="block text-[11px]" style={{ color: "var(--pl-text-muted)" }}>
                Si fueran independientes
              </span>
              <strong className="text-sm font-bold">
                {(audit.independentProbability * 100).toFixed(1)} %
              </strong>
            </div>
            <div
              className="rounded-xl p-2.5"
              style={{ background: "var(--pl-surface-elevated)" }}
            >
              <span className="block text-[11px]" style={{ color: "var(--pl-text-muted)" }}>
                Prob. conjunta real
              </span>
              <strong className="text-sm font-extrabold" style={{ color: "var(--pl-brand)" }}>
                {(audit.jointProbability * 100).toFixed(1)} % ·{" "}
                {formatOddsValue(audit.fairCombinedDecimal, oddsFormat)}
              </strong>
            </div>
          </div>

          {!compact && dirMeta ? (
            <p className="m-0 text-[11px] leading-snug" style={{ color: "var(--pl-text-secondary)", textWrap: "pretty" }}>
              {dirMeta.note}
            </p>
          ) : null}

          {audit.bookQuoteAudit && taxMeta ? (
            <div
              className="rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs num"
              style={{
                background: `color-mix(in srgb, ${taxMeta.tone} 10%, var(--pl-surface-elevated))`,
                boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${taxMeta.tone} 32%, var(--pl-border))`,
              }}
              data-sgp-tax-flag={audit.bookQuoteAudit.taxFlag}
            >
              <div className="min-w-0">
                <strong className="block" style={{ color: taxMeta.tone }}>
                  {taxMeta.label} ({audit.bookQuoteAudit.effectiveHoldPct.toFixed(1)} % margen)
                </strong>
                <span className="text-[11px]" style={{ color: "var(--pl-text-secondary)" }}>
                  Tu casa {formatOddsValue(audit.bookQuoteAudit.offeredDecimal, oddsFormat)} vs justo{" "}
                  {formatOddsValue(audit.bookQuoteAudit.fairCombinedDecimal, oddsFormat)}
                </span>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
