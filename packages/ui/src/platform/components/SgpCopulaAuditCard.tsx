"use client";

import React, { useMemo, useRef, useState } from "react";
import { parseStrictFiniteNumber } from "@pitchlab/contracts";
import { formatOddsValue } from "../access-guard";
import { useSafeEffect } from "../hooks";
import type { OddsFormat, ParlayLeg, SgpCopulaAuditView } from "../types";
import { MaestroIcon } from "./MaestroPrimitives";

export interface SgpCopulaAuditCardProps {
  readonly legs: readonly ParlayLeg[];
  readonly oddsFormat: OddsFormat;
  readonly offeredCombinedDecimalOdds?: number | null;
  readonly precomputedAudit?: SgpCopulaAuditView | null;
  readonly compact?: boolean;
  readonly onAuditResolved?: (audit: SgpCopulaAuditView | null) => void;
}

interface MappedSgpLeg {
  readonly legId: string;
  readonly factor: string;
  readonly marginalProbability: number;
  readonly direction: 1 | -1;
}

interface FrechetBounds {
  readonly lower: number;
  readonly upper: number;
}

const DIRECTION_COPY: Readonly<
  Record<
    SgpCopulaAuditView["correlationDirection"],
    {
      readonly label: string;
      readonly fg: string;
      readonly bg: string;
      readonly border: string;
      readonly note: string;
    }
  >
> = {
  positively_correlated: {
    label: "Correlación a favor",
    fg: "var(--pl-pill-success-fg)",
    bg: "var(--pl-pill-success-bg)",
    border: "var(--pl-pill-success-border)",
    note: "Estas selecciones suelen cumplirse juntas con mayor frecuencia que por separado.",
  },
  negatively_correlated: {
    label: "Correlación en contra",
    fg: "var(--pl-pill-warning-fg)",
    bg: "var(--pl-pill-warning-bg)",
    border: "var(--pl-pill-warning-border)",
    note: "Una selección dificulta la otra: la probabilidad real baja frente al producto simple.",
  },
  near_independent: {
    label: "Casi independientes",
    fg: "var(--pl-pill-brand-fg)",
    bg: "var(--pl-pill-brand-bg)",
    border: "var(--pl-pill-brand-border)",
    note: "Poca dependencia entre los eventos dentro del mismo partido.",
  },
};

const TAX_COPY: Readonly<
  Record<
    NonNullable<SgpCopulaAuditView["bookQuoteAudit"]>["taxFlag"],
    {
      readonly label: string;
      readonly fg: string;
      readonly bg: string;
      readonly border: string;
    }
  >
> = {
  fair_or_low_vig: {
    label: "Margen razonable",
    fg: "var(--pl-pill-success-fg)",
    bg: "var(--pl-pill-success-bg)",
    border: "var(--pl-pill-success-border)",
  },
  standard_sgp_vig: {
    label: "Margen típico de casa",
    fg: "var(--pl-pill-warning-fg)",
    bg: "var(--pl-pill-warning-bg)",
    border: "var(--pl-pill-warning-border)",
  },
  severe_sgp_tax: {
    label: "Sobrecargo alto SGP",
    fg: "var(--pl-pill-danger-fg)",
    bg: "var(--pl-pill-danger-bg)",
    border: "var(--pl-pill-danger-border)",
  },
};

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

  if (m.includes("corner") || l.includes("córner") || l.includes("esquina")) {
    const dir: 1 | -1 = s.includes("under") || l.includes("menos de") ? -1 : 1;
    return { legId: pick.id, factor: "total_corners", marginalProbability: p, direction: dir };
  }
  if (
    m.includes("yellow") ||
    m.includes("card") ||
    m.includes("booking") ||
    l.includes("amarilla") ||
    l.includes("tarjeta")
  ) {
    const dir: 1 | -1 = s.includes("under") || l.includes("menos de") ? -1 : 1;
    return { legId: pick.id, factor: "total_yellow_cards", marginalProbability: p, direction: dir };
  }
  if (m.includes("sot") || l.includes("a puerta")) {
    const dir: 1 | -1 = s.includes("under") || l.includes("menos de") ? -1 : 1;
    return {
      legId: pick.id,
      factor: "total_shots_on_target",
      marginalProbability: p,
      direction: dir,
    };
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
  frechet: FrechetBounds;
} | null {
  const byGame = new Map<string, ParlayLeg[]>();
  for (const leg of legs) {
    const list = byGame.get(leg.pick.gameId) ?? [];
    list.push(leg);
    byGame.set(leg.pick.gameId, list);
  }
  for (const group of byGame.values()) {
    if (group.length < 2) continue;
    const first = group[0];
    if (!first) continue;
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
      const sumP = mapped.reduce((acc, item) => acc + item.marginalProbability, 0);
      const minP = mapped.reduce((acc, item) => Math.min(acc, item.marginalProbability), 1);
      const lower = Math.max(0.0001, sumP - (mapped.length - 1));
      const upper = Math.min(0.99, Math.max(lower, minP));
      return {
        sport,
        mapped,
        matchLabel: first.pick.matchLabel,
        frechet: { lower, upper },
      };
    }
  }
  return null;
}

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
  const [unavailableNote, setUnavailableNote] = useState<string | null>(null);
  const onAuditResolvedRef = useRef(onAuditResolved);
  onAuditResolvedRef.current = onAuditResolved;

  const offeredParsed = parseStrictFiniteNumber(offeredCombinedDecimalOdds);
  const offeredValid =
    offeredParsed !== null && offeredParsed > 1.01
      ? Math.round(offeredParsed * 100) / 100
      : null;

  const requestKey = useMemo(() => {
    if (!cluster) return "";
    return JSON.stringify({
      sport: cluster.sport,
      legs: cluster.mapped,
      offeredCombinedDecimalOdds: offeredValid,
    });
  }, [cluster, offeredValid]);

  useSafeEffect(() => {
    if (precomputedAudit) {
      setUnavailableNote(null);
      onAuditResolvedRef.current?.(precomputedAudit);
      return;
    }
    if (!cluster || !requestKey) {
      setFetchedAudit(null);
      setLoading(false);
      setUnavailableNote(null);
      onAuditResolvedRef.current?.(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setUnavailableNote(null);
    const timer = window.setTimeout(() => {
      fetch("/api/parlays/sgp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: requestKey,
        signal: controller.signal,
      })
        .then((res) => {
          if (!res.ok) {
            if (!controller.signal.aborted) {
              setFetchedAudit(null);
              setUnavailableNote("Auditoría SGP en servidor disponible con pase activo.");
              onAuditResolvedRef.current?.(null);
            }
            return null;
          }
          return res.json() as Promise<{ audit?: SgpCopulaAuditView }>;
        })
        .then((json) => {
          if (!controller.signal.aborted && json?.audit) {
            setFetchedAudit(json.audit);
            setUnavailableNote(null);
            onAuditResolvedRef.current?.(json.audit);
          }
        })
        .catch((err) => {
          if (!controller.signal.aborted) {
            void err;
            setFetchedAudit(null);
            onAuditResolvedRef.current?.(null);
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
  }, [cluster, precomputedAudit, requestKey]);

  const audit = precomputedAudit ?? fetchedAudit;
  if (!cluster && !precomputedAudit) return null;

  const dirMeta = audit ? DIRECTION_COPY[audit.correlationDirection] : null;
  const taxMeta = audit?.bookQuoteAudit ? TAX_COPY[audit.bookQuoteAudit.taxFlag] : null;
  const boundedJointProb =
    audit && cluster
      ? Math.min(cluster.frechet.upper, Math.max(cluster.frechet.lower, audit.jointProbability))
      : (audit?.jointProbability ?? null);

  return (
    <section
      className="rounded-xl p-3 space-y-2.5"
      style={{
        background: "var(--pl-surface)",
        border: dirMeta ? `1px solid ${dirMeta.border}` : "1px solid var(--pl-border)",
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
        {dirMeta && audit ? (
          <span
            className="pl-sf-signal-pill is-compact num"
            style={{
              color: dirMeta.fg,
              background: dirMeta.bg,
              borderColor: dirMeta.border,
            }}
          >
            {dirMeta.label} · ×{audit.correlationMultiplier.toFixed(2)}
          </span>
        ) : (
          <span className="text-[11px]" style={{ color: "var(--pl-text-muted)" }}>
            {loading ? "Calculando dependencia…" : "Dependencia ajustada"}
          </span>
        )}
      </header>

      {audit && boundedJointProb !== null ? (
        <>
          <div className="grid grid-cols-2 gap-2 num">
            <div
              className="rounded-lg p-2.5"
              style={{
                background: "var(--pl-surface-elevated)",
                border: "1px solid var(--pl-border)",
              }}
            >
              <span className="block text-[11px]" style={{ color: "var(--pl-text-muted)" }}>
                Si fueran independientes
              </span>
              <strong className="text-sm font-bold">
                {(audit.independentProbability * 100).toFixed(1)} %
              </strong>
            </div>
            <div
              className="rounded-lg p-2.5"
              style={{
                background: "var(--pl-surface-elevated)",
                border: "1px solid var(--pl-border)",
              }}
            >
              <span className="block text-[11px]" style={{ color: "var(--pl-text-muted)" }}>
                Prob. conjunta real
              </span>
              <strong className="text-sm font-extrabold" style={{ color: "var(--pl-brand)" }}>
                {(boundedJointProb * 100).toFixed(1)} % ·{" "}
                {formatOddsValue(audit.fairCombinedDecimal, oddsFormat)}
              </strong>
            </div>
          </div>

          {cluster ? (
            <div
              className="flex flex-wrap items-center justify-between gap-1 text-[11px] num"
              style={{ color: "var(--pl-text-muted)" }}
              data-sgp-frechet-bounds=""
            >
              <span>Cotas Fréchet-Hoeffding</span>
              <strong style={{ color: "var(--pl-text-secondary)" }}>
                {(cluster.frechet.lower * 100).toFixed(1)} % –{" "}
                {(cluster.frechet.upper * 100).toFixed(1)} %
              </strong>
            </div>
          ) : null}

          {!compact && dirMeta ? (
            <p
              className="m-0 text-[11px] leading-snug"
              style={{ color: "var(--pl-text-secondary)", textWrap: "pretty" }}
            >
              {dirMeta.note}
            </p>
          ) : null}

          {audit.bookQuoteAudit && taxMeta ? (
            <div
              className="rounded-lg p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs num"
              style={{
                background: taxMeta.bg,
                border: `1px solid ${taxMeta.border}`,
              }}
              data-sgp-tax-flag={audit.bookQuoteAudit.taxFlag}
              role="status"
            >
              <div className="min-w-0">
                <strong className="block" style={{ color: taxMeta.fg }}>
                  {taxMeta.label} ({audit.bookQuoteAudit.effectiveHoldPct.toFixed(1)} % margen)
                </strong>
                <span className="text-[11px]" style={{ color: "var(--pl-text-secondary)" }}>
                  Tu casa {formatOddsValue(audit.bookQuoteAudit.offeredDecimal, oddsFormat)} vs
                  justo {formatOddsValue(audit.bookQuoteAudit.fairCombinedDecimal, oddsFormat)}
                </span>
              </div>
            </div>
          ) : null}
        </>
      ) : unavailableNote ? (
        <p className="m-0 text-[11px]" style={{ color: "var(--pl-text-muted)" }}>
          {unavailableNote}
        </p>
      ) : null}
    </section>
  );
}
