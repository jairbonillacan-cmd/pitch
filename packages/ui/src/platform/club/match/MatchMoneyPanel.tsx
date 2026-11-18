"use client";

import React, { useMemo, useState } from "react";
import { formatOddsCaptureEs, sportHasDraw } from "@pitchlab/contracts";
import { PBar, TeamBadge } from "../../../sports";
import { formatOddsValue } from "../../access-guard";
import {
  DEFAULT_PREFERRED_BOOKS,
  parseManualOddsInput,
  resolvePreferredBookQuote,
} from "../../bookmakers";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import { useOptionalPlatformCore } from "../../platform-provider";
import type {
  BookQuoteItem,
  MatchPick,
  OddsFormat,
  PlatformGame,
  PlatformMarketRow,
} from "../../types";

export interface MatchMoneyPanelProps {
  readonly game: PlatformGame;
  readonly markets: readonly PlatformMarketRow[];
  readonly oddsFormat: OddsFormat;
  readonly unlocked: boolean;
  readonly isFinished: boolean;
  readonly onOpenNumbers: () => void;
  readonly onAddPickToParlay?: (pick: MatchPick) => void;
  readonly inParlayPickIds?: ReadonlySet<string>;
}

interface ComparisonRow {
  readonly id: string;
  readonly label: string;
  readonly group: string;
  readonly p: number;
  readonly fairDecimal: number;
  readonly houseDecimal: number | null;
  readonly houseBookLabel: string | null;
  readonly bookQuotes?: readonly BookQuoteItem[];
  readonly edgePts: number | null;
  readonly pick?: MatchPick;
}

function deltaLabel(moneyPct: number, modelPct: number): { text: string; lead: boolean } {
  const diff = Math.round(moneyPct - modelPct);
  if (Math.abs(diff) <= 1) return { text: "En línea con el modelo", lead: false };
  return diff > 0
    ? { text: `+${diff} pts más dinero`, lead: true }
    : { text: `${diff} pts vs modelo`, lead: false };
}

/**
 * Pestaña «¿Dónde está el dinero?» en la ficha del partido:
 * muestra la comparativa entre flujo de dinero en casas (cuando existe corte verificado)
 * y la probabilidad justa del modelo, junto con una tabla ordenada de cuotas y valor.
 */
export function MatchMoneyPanel({
  game,
  markets,
  oddsFormat,
  unlocked,
  isFinished,
  onOpenNumbers,
  onAddPickToParlay,
  inParlayPickIds,
}: MatchMoneyPanelProps): React.JSX.Element {
  const optCore = useOptionalPlatformCore();
  const preferredBooks = optCore?.preferredBooks ?? DEFAULT_PREFERRED_BOOKS;
  const [manualByRowId, setManualByRowId] = useState<Record<string, string>>({});
  const hasDraw = sportHasDraw(game.sport);
  const flow = game.preGame.moneyFlow;
  const canReadDetails = unlocked || isFinished;

  const flowSides = useMemo(() => {
    if (!flow) return [];
    const list: Array<{
      key: string;
      label: string;
      moneyShare: number;
      modelPct: number | null;
    }> = [
      {
        key: "home",
        label: game.home.shortName,
        moneyShare: flow.homeShare,
        modelPct: game.x12 ? Math.round(game.x12[0] * 100) : null,
      },
    ];
    if (hasDraw && flow.drawShare !== undefined) {
      list.push({
        key: "draw",
        label: "Empate",
        moneyShare: flow.drawShare,
        modelPct: game.x12 ? Math.round(game.x12[1] * 100) : null,
      });
    }
    list.push({
      key: "away",
      label: game.away.shortName,
      moneyShare: flow.awayShare,
      modelPct: game.x12 ? Math.round(game.x12[2] * 100) : null,
    });
    return list;
  }, [flow, game.away.shortName, game.home.shortName, game.x12, hasDraw]);

  const comparisonRows = useMemo<ComparisonRow[]>(() => {
    const out: ComparisonRow[] = [];
    const seen = new Set<string>();

    for (const pk of game.picks) {
      if (pk.isRedacted) continue;
      seen.add(pk.label.trim().toLowerCase());
      const prefQuote = resolvePreferredBookQuote(pk.bookQuotes, preferredBooks);
      const houseDecimal = prefQuote?.decimal ?? pk.marketDecimal;
      const houseBookLabel = prefQuote?.bookLabel ?? pk.marketBookLabel ?? null;
      const edgePts =
        houseDecimal !== null && houseDecimal > 1
          ? Math.round((pk.p - 1 / houseDecimal) * 1000) / 10
          : pk.edgePts;
      out.push({
        id: pk.id,
        label: pk.label,
        group: pk.categoryLabel,
        p: pk.p,
        fairDecimal: pk.fairDecimal,
        houseDecimal,
        houseBookLabel,
        bookQuotes: pk.bookQuotes,
        edgePts,
        pick: pk,
      });
    }

    if (canReadDetails) {
      for (const m of markets) {
        if (out.length >= 6) break;
        const norm = m.label.trim().toLowerCase();
        if (seen.has(norm)) continue;
        seen.add(norm);
        const prefQuote = resolvePreferredBookQuote(m.bookQuotes, preferredBooks);
        const houseDecimal = prefQuote?.decimal ?? m.currentDecimal;
        const houseBookLabel = prefQuote?.bookLabel ?? m.quoteBookLabel ?? null;
        const edgePts =
          houseDecimal !== null && houseDecimal > 1
            ? Math.round((m.p - 1 / houseDecimal) * 1000) / 10
            : m.edgePts;
        out.push({
          id: `${m.market}-${m.selection}`,
          label: m.label,
          group: m.group,
          p: m.p,
          fairDecimal: m.fairDecimal,
          houseDecimal,
          houseBookLabel,
          bookQuotes: m.bookQuotes,
          edgePts,
        });
      }
    }

    return out;
  }, [canReadDetails, game.picks, markets, preferredBooks]);

  const modelOutcomes = useMemo(() => {
    if (!game.x12) return [];
    const list = [
      { key: "home", label: game.home.shortName, p: game.x12[0] },
      ...(hasDraw ? [{ key: "draw", label: "Empate", p: game.x12[1] }] : []),
      { key: "away", label: game.away.shortName, p: game.x12[2] },
    ];
    return list;
  }, [game.away.shortName, game.home.shortName, game.x12, hasDraw]);

  return (
    <div className="pl-dinero-grid">
      {/* Izquierda: lectura principal de dónde está el dinero vs. modelo */}
      <section
        className="glass-card glass-ring rounded-2xl p-5 space-y-4 min-w-0"
        data-market-pulse=""
        aria-labelledby="dinero-pulse-heading"
      >
        <div className="flex flex-wrap items-start justify-between gap-2.5">
          <div className="min-w-0">
            <h2 id="dinero-pulse-heading" className="m-0 text-lg font-extrabold">
              ¿Dónde está el dinero?
            </h2>
            <p className="m-0 text-xs mt-0.5" style={{ color: "var(--pl-text-muted)" }}>
              Contraste entre el dinero estimado en mercado y la probabilidad real del modelo.
            </p>
          </div>
          <span className="pl-pill pl-pill--brand text-[11px] num shrink-0">
            {flow && game.spacetime?.market?.asOfUtc ? (
              <>
                {game.spacetime.market.bookLabel.split(" · ")[0] ?? "Mercado"} ·{" "}
                <time dateTime={game.spacetime.market.asOfUtc}>
                  {formatOddsCaptureEs(game.spacetime.market.asOfUtc)}
                </time>
              </>
            ) : flow ? (
              game.spacetime?.market?.bookLabel ?? "Mercado"
            ) : (
              "Sin corte de casa"
            )}
          </span>
        </div>

        {!flow ? (
          <div className="space-y-4">
            <div className="pl-prematch-empty" data-no-market="">
              Este partido todavía no tiene momios verificados ni reparto de dinero capturado en casas. Mostramos solo la referencia estadística del modelo.
            </div>

            {modelOutcomes.length > 0 ? (
              <div className="pl-dinero-sides">
                {modelOutcomes.map((item) => (
                  <div key={item.key} className="pl-dinero-side-tile">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold">{item.label}</span>
                      <strong className="num text-sm">
                        {(item.p * 100).toFixed(1)} % ·{" "}
                        {formatOddsValue(1 / Math.max(item.p, 0.01), oddsFormat)}
                      </strong>
                    </div>
                    <PBar p={item.p} lead={item.p >= 0.48} />
                  </div>
                ))}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 hairline-t">
              <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
                Puedes ingresar manualmente el momio de tu casa en Números para calcular ventaja.
              </span>
              <button
                type="button"
                className="pl-btn-glass text-xs min-h-10 px-3.5 shrink-0"
                onClick={onOpenNumbers}
              >
                Probar momio en Números
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3.5">
            <div className="pl-dinero-sides">
              {flowSides.map((item) => {
                const delta =
                  item.modelPct !== null
                    ? deltaLabel(item.moneyShare, item.modelPct)
                    : null;
                return (
                  <div key={item.key} className="pl-dinero-side-tile num">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {item.key !== "draw" ? (
                          <TeamBadge
                            league={game.league}
                            slug={item.key === "home" ? game.home.slug : game.away.slug}
                            name={item.key === "home" ? game.home.name : game.away.name}
                            logoUrl={item.key === "home" ? game.home.logoUrl : game.away.logoUrl}
                            size={18}
                          />
                        ) : null}
                        <strong className="text-sm font-extrabold truncate">{item.label}</strong>
                      </div>
                      {delta ? (
                        <span
                          className={`pl-pill text-[11px] ${delta.lead ? "pl-pill--brand" : ""}`.trim()}
                        >
                          {delta.text}
                        </span>
                      ) : null}
                    </div>

                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span style={{ color: "var(--pl-text-muted)" }}>
                        Dinero en mercado: <strong style={{ color: "var(--pl-text)" }}>{item.moneyShare} %</strong>
                      </span>
                      {item.modelPct !== null ? (
                        <span style={{ color: "var(--pl-text-muted)" }}>
                          Modelo PitchLab: <strong style={{ color: "var(--pl-text)" }}>{item.modelPct} %</strong>
                        </span>
                      ) : null}
                    </div>

                    <PBar p={item.moneyShare / 100} lead={item.moneyShare >= 50} />
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 hairline-t">
              <p className="m-0 text-xs flex-1 min-w-[200px]" style={{ color: "var(--pl-text-secondary)" }}>
                {flow.sharpNote}
              </p>
              <button
                type="button"
                className="pl-btn-glass text-xs min-h-10 px-3.5 shrink-0 inline-flex items-center gap-1.5"
                onClick={onOpenNumbers}
              >
                <span>Ver todos los mercados</span>
                <MaestroIcon name="arrowRight" size={12} />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Derecha: tabla comparativa compacta entre momio justo del modelo y cuota capturada */}
      <section
        className="glass-card glass-ring rounded-2xl p-5 space-y-4 min-w-0"
        aria-labelledby="dinero-lines-heading"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 id="dinero-lines-heading" className="m-0 text-lg font-extrabold">
              Comparativa de cuotas y valor
            </h2>
            <p className="m-0 text-xs mt-0.5" style={{ color: "var(--pl-text-muted)" }}>
              Momio justo calculado por el modelo frente a la referencia de mercado disponible.
            </p>
          </div>
          <span className="pl-pill text-[11px] num shrink-0">
            {comparisonRows.length} {comparisonRows.length === 1 ? "selección" : "selecciones"}
          </span>
        </div>

        {comparisonRows.length === 0 ? (
          <div className="pl-num-locked">
            <MaestroIcon name="lock" size={16} />
            <div>
              <p className="m-0 text-sm font-bold">
                Comparativa detallada disponible con Pase PitchLab Ultra
              </p>
              <p className="m-0 text-xs mt-0.5" style={{ color: "var(--pl-text-muted)" }}>
                Desbloquea las selecciones del encuentro, sus momios justos y la ventaja contra casas.
              </p>
            </div>
          </div>
        ) : (
          <div
            className="pl-table-region pl-dinero-table-wrap"
            tabIndex={0}
            role="region"
            aria-label="Tabla comparativa de probabilidades y momios"
          >
            <table className="pl-dinero-table w-full text-left border-collapse text-xs">
              <thead>
                <tr className="hairline-b" style={{ color: "var(--pl-text-muted)" }}>
                  <th scope="col" className="py-2 pr-3">Selección</th>
                  <th scope="col" className="py-2 px-2 text-right">Modelo</th>
                  <th scope="col" className="py-2 px-2 text-right">Justo</th>
                  <th scope="col" className="py-2 px-2 text-right">Casa</th>
                  <th scope="col" className="py-2 pl-2 text-right">Ventaja</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((r) => {
                  const inParlay = r.pick ? inParlayPickIds?.has(r.pick.id) : false;
                  const manualRaw = manualByRowId[r.id] ?? "";
                  const manualDec = parseManualOddsInput(manualRaw);
                  const effectiveHouseDec = manualDec ?? r.houseDecimal;
                  const effectiveEdgePts =
                    effectiveHouseDec !== null && effectiveHouseDec > 1
                      ? Math.round((r.p - 1 / effectiveHouseDec) * 1000) / 10
                      : r.edgePts;
                  return (
                    <tr key={r.id} className="hairline-b">
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center justify-between gap-2 min-w-0">
                          <div className="min-w-0">
                            <strong className="block text-[13px] font-bold truncate" style={{ color: "var(--pl-text)" }}>
                              {r.label}
                            </strong>
                            <span className="text-[11px]" style={{ color: "var(--pl-text-muted)" }}>
                              {r.group}
                              {r.houseBookLabel && manualDec === null ? ` · ${r.houseBookLabel}` : ""}
                            </span>
                          </div>
                          {r.pick && onAddPickToParlay && !isFinished && game.status === "NS" ? (
                            <button
                              type="button"
                              className="pl-btn-glass text-[11px] min-h-7 px-2 shrink-0"
                              aria-pressed={Boolean(inParlay)}
                              onClick={() => onAddPickToParlay(r.pick!)}
                            >
                              {inParlay ? "En parlay" : "+ Parlay"}
                            </button>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-right num font-bold" style={{ color: "var(--pl-text)" }}>
                        {(r.p * 100).toFixed(1)} %
                      </td>
                      <td className="py-2.5 px-2 text-right num font-bold" style={{ color: "var(--pl-brand)" }}>
                        {formatOddsValue(r.fairDecimal, oddsFormat)}
                      </td>
                      <td className="py-2.5 px-2 text-right num" style={{ color: "var(--pl-text-secondary)" }}>
                        {isFinished ? (
                          r.houseDecimal !== null
                            ? formatOddsValue(r.houseDecimal, oddsFormat)
                            : "—"
                        ) : r.houseDecimal !== null && manualRaw === "" ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 underline decoration-dotted underline-offset-2 text-right"
                            title="Clic para escribir el momio de tu casa"
                            onClick={() =>
                              setManualByRowId((prev) => ({
                                ...prev,
                                [r.id]: r.houseDecimal!.toFixed(2),
                              }))
                            }
                          >
                            {formatOddsValue(r.houseDecimal, oddsFormat)}
                          </button>
                        ) : (
                          <input
                            type="text"
                            inputMode="decimal"
                            aria-label={`Tu momio para ${r.label}`}
                            placeholder={oddsFormat === "american" ? "-110" : "1.91"}
                            value={manualRaw}
                            onChange={(e) =>
                              setManualByRowId((prev) => ({
                                ...prev,
                                [r.id]: e.target.value,
                              }))
                            }
                            className="glass-input num text-[11px] text-right px-1.5 py-1 w-16 rounded-md"
                          />
                        )}
                      </td>
                      <td className="py-2.5 pl-2 text-right num">
                        {effectiveEdgePts !== null ? (
                          <span
                            className={`pl-pill text-[11px] ${effectiveEdgePts > 0 ? "pl-pill--success" : ""}`.trim()}
                          >
                            {effectiveEdgePts > 0 ? `+${effectiveEdgePts.toFixed(1)}` : effectiveEdgePts.toFixed(1)} pts
                          </span>
                        ) : (
                          <span style={{ color: "var(--pl-text-muted)" }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-[11px]" style={{ color: "var(--pl-text-muted)" }}>
            ¿Quieres comparar otro momio o sellar en bitácora?
          </span>
          <button
            type="button"
            className="pl-btn-glass text-xs min-h-9 px-3 shrink-0"
            onClick={onOpenNumbers}
          >
            Abrir calculadora en Números
          </button>
        </div>
      </section>
    </div>
  );
}
