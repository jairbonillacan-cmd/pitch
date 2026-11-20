"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { PBar } from "../../../sports";
import { formatOddsValue, isPickUnlocked } from "../../access-guard";
import { resolvePreferredBookQuote } from "../../bookmakers";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import { useSheetSwipeDismiss } from "../../components/use-sheet-swipe-dismiss";
import {
  assessParlayRisk,
  checkParlayCompatibility,
  type ParlayCompatibilityResult,
} from "../../parlay-engine";
import {
  useIsPickInParlay,
  useParlayState,
  usePlatformActions,
  usePlatformCore,
} from "../../platform-provider";
import type { MatchPick, PlatformGame } from "../../types";
import { BookmakerComparePill } from "./BookmakerComparePill";
import { EvidenceWindowPills, extractEvidenceWindows } from "./EvidenceWindowPills";

export interface BetBuilderQuickButtonProps {
  readonly pick: MatchPick;
  readonly onInspect: (pick: MatchPick) => void;
  readonly compact?: boolean;
}

/**
 * Botón táctil 1-clic (`>= 44 px` en móvil) para abrir el inspector rápido
 * de Bet Builder / Combinadas sobre un pick concreto.
 */
export function BetBuilderQuickButton({
  pick,
  onInspect,
  compact = false,
}: BetBuilderQuickButtonProps): React.JSX.Element {
  const inParlay = useIsPickInParlay(pick.id);
  return (
    <button
      type="button"
      className={`pl-scr-builder-btn ${compact ? "is-compact" : ""} ${inParlay ? "is-in-slip" : ""}`.trim()}
      data-open-bet-builder={pick.id}
      aria-label={`Abrir Bet Builder para ${pick.label}`}
      onClick={() => onInspect(pick)}
    >
      <MaestroIcon name="layers" size={13} />
      <span>{inParlay ? "En boleto" : "Builder"}</span>
    </button>
  );
}

export interface BetBuilderDrawerProps {
  readonly open: boolean;
  readonly pick: MatchPick | null;
  readonly game?: PlatformGame | null;
  readonly onClose: () => void;
}

/**
 * Hoja / cajón nativo `<dialog>` para inspeccionar un pick y armar combinadas (Parlay / SGP)
 * en 1 clic directo al boleto (`useParlayState` / `usePlatformActions`), con diagnóstico real
 * de compatibilidad e incompatibilidad (`checkParlayCompatibility`), sugerencias del mismo
 * partido y física táctil *swipe-to-dismiss* en móvil (`useSheetSwipeDismiss`).
 */
export function BetBuilderDrawer({
  open,
  pick,
  game = null,
  onClose,
}: BetBuilderDrawerProps): React.JSX.Element | null {
  const { oddsFormat, viewerRole, preferredBooks, dataset } = usePlatformCore();
  const {
    addPickToParlay,
    removePickFromParlay,
    setAllowSgp,
    loadParlayPicks,
    sealParlayToJournal,
    openComposer,
    navigateTo,
  } = usePlatformActions();
  const { parlayLegs, allowSgp, parlaySummary } = useParlayState();

  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const bodyScrollRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [isMobileViewport, setIsMobileViewport] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobileViewport(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const swipe = useSheetSwipeDismiss({
    onDismiss: () => onCloseRef.current(),
    disabled: !open || !isMobileViewport,
    scrollContainerRef: bodyScrollRef,
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (!open || !pick) {
      if (dialog.open) dialog.close();
      return;
    }

    if (!dialog.open) {
      dialog.showModal();
    }

    const handleClose = () => {
      if (dialog.open) return;
      dialog.returnValue = "";
      onCloseRef.current();
    };
    dialog.addEventListener("close", handleClose);

    // Respaldo de light-dismiss cuando <dialog closedby="any"> no existe (Safari)
    let cleanupLightDismiss: (() => void) | undefined;
    if (
      typeof HTMLDialogElement !== "undefined" &&
      !("closedBy" in HTMLDialogElement.prototype)
    ) {
      const isOutside = (e: PointerEvent) => {
        if (e.target !== dialog) return false;
        const r = dialog.getBoundingClientRect();
        return (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        );
      };
      let pressedOutside = false;
      const onPointerDown = (e: PointerEvent) => {
        pressedOutside = isOutside(e);
      };
      const onPointerUp = (e: PointerEvent) => {
        if (pressedOutside && isOutside(e)) {
          dialog.close();
        }
      };
      dialog.addEventListener("pointerdown", onPointerDown);
      dialog.addEventListener("pointerup", onPointerUp);
      cleanupLightDismiss = () => {
        dialog.removeEventListener("pointerdown", onPointerDown);
        dialog.removeEventListener("pointerup", onPointerUp);
      };
    }

    return () => {
      dialog.removeEventListener("close", handleClose);
      cleanupLightDismiss?.();
      if (dialog.open) dialog.close();
    };
  }, [open, pick]);

  const resolvedGame = useMemo(() => {
    if (game) return game;
    if (!pick) return null;
    return dataset.games.find((g) => g.id === pick.gameId) ?? null;
  }, [dataset.games, game, pick]);

  const inParlay = useMemo(
    () => (pick ? parlayLegs.some((leg) => leg.pick.id === pick.id) : false),
    [parlayLegs, pick],
  );

  const compat: ParlayCompatibilityResult = useMemo(() => {
    if (!pick) return { allowed: false, code: "invalid_odds" };
    return checkParlayCompatibility(parlayLegs, pick, allowSgp);
  }, [allowSgp, parlayLegs, pick]);

  const compatWithSgp = useMemo(() => {
    if (!pick || allowSgp || compat.code !== "same_game_disabled") return null;
    return checkParlayCompatibility(parlayLegs, pick, true);
  }, [allowSgp, compat.code, parlayLegs, pick]);

  const sgpSuggestions = useMemo(() => {
    if (!pick || !resolvedGame || resolvedGame.status !== "NS") return [];
    const seen = new Set<string>([pick.id]);
    const pool: MatchPick[] = [];
    for (const candidate of [...resolvedGame.picks, ...(resolvedGame.parlayCandidates ?? [])]) {
      if (seen.has(candidate.id)) continue;
      if (!isPickUnlocked(candidate, resolvedGame.status, viewerRole)) continue;
      seen.add(candidate.id);
      pool.push(candidate);
    }
    const simulatedLegs = inParlay ? parlayLegs : [...parlayLegs, { pick }];
    return pool
      .map((candidate) => ({
        candidate,
        inSlip: parlayLegs.some((l) => l.pick.id === candidate.id),
        check: checkParlayCompatibility(simulatedLegs, candidate, true),
      }))
      .sort((a, b) => Number(b.check.allowed) - Number(a.check.allowed) || b.candidate.p - a.candidate.p)
      .slice(0, 5);
  }, [inParlay, parlayLegs, pick, resolvedGame, viewerRole]);

  const evidenceWindows = useMemo(() => {
    if (!pick || !resolvedGame) return [];
    return extractEvidenceWindows({ game: resolvedGame, pick });
  }, [pick, resolvedGame]);

  if (!open || !pick) return null;

  const prefQuote = resolvePreferredBookQuote(pick.bookQuotes, preferredBooks);
  const houseDecimal = prefQuote?.decimal ?? pick.marketDecimal;
  const houseBookLabel = prefQuote?.bookLabel ?? pick.marketBookLabel ?? null;
  const risk = assessParlayRisk(parlaySummary);
  const isFinished = pick.gameStatus === "FT";
  const isLive = pick.gameStatus === "LIVE";

  const handleEnableSgpAndAdd = () => {
    setAllowSgp(true);
    loadParlayPicks([...parlayLegs.map((l) => l.pick), pick], {
      allowSgp: true,
      label: pick.label,
    });
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      {...({ closedby: "any" } as React.DialogHTMLAttributes<HTMLDialogElement>)}
      className="pl-bb-dialog"
      data-bet-builder-drawer=""
      style={isMobileViewport ? swipe.sheetStyle : undefined}
    >
      <div className="pl-bb-shell">
        <div
          className="pl-bb-drag-zone"
          {...(isMobileViewport ? swipe.handleProps : {})}
        >
          <span className="pl-bottom-sheet-handle" aria-hidden="true" />
          <header className="pl-bb-header">
            <div className="min-w-0">
              <span className="pl-bb-eyebrow">Bet Builder · Combinada rápida</span>
              <h2 id={titleId} className="pl-bb-title">
                {pick.label}
              </h2>
              <p className="pl-bb-subtitle">
                {pick.leagueLabel} · {pick.matchLabel} · {pick.kickoffLocal}
              </p>
            </div>
            <button
              type="button"
              className="pl-btn-glass pl-bb-close-btn"
              aria-label="Cerrar Bet Builder"
              autoFocus
              onClick={onClose}
            >
              <MaestroIcon name="x" size={16} />
            </button>
          </header>
        </div>

        <div ref={bodyScrollRef} className="pl-bb-body">
          {/* Bloque 1: Inspección del pick seleccionado */}
          <section className="pl-bb-focal" aria-label="Detalle del pick seleccionado">
            <div className="pl-bb-focal-top">
              <div className="pl-bb-prob-block num">
                <span className="pl-bb-metric-label">Probabilidad Spacetime</span>
                <strong className="pl-bb-prob-val">{(pick.p * 100).toFixed(1)} %</strong>
                <PBar p={pick.p} lead={pick.p >= 0.65} />
              </div>

              <BookmakerComparePill
                probability={pick.p}
                fairDecimal={pick.fairDecimal}
                houseDecimal={houseDecimal}
                houseBookLabel={houseBookLabel}
                openingDecimal={prefQuote?.openingDecimal ?? null}
                movementDirection={prefQuote?.movementDirection ?? null}
                capturedAtUtc={prefQuote?.capturedAtUtc ?? pick.marketCapturedAtUtc ?? null}
                bookQuotes={pick.bookQuotes}
                oddsFormat={oddsFormat}
                variant="box"
                showMultiBookQuotes
                showCaptureStamp
              />
            </div>

            {evidenceWindows.length > 0 ? (
              <EvidenceWindowPills windows={evidenceWindows} size="sm" />
            ) : null}

            {/* Estado de compatibilidad / aviso de incompatibilidad */}
            {inParlay ? (
              <div className="pl-bb-compat is-ok" role="status" data-builder-compat="in_parlay">
                <MaestroIcon name="check" size={14} />
                <span>Esta selección ya forma parte de tu boleto combinado.</span>
              </div>
            ) : !compat.allowed && compat.reason ? (
              <div
                className={`pl-bb-compat ${compat.code === "same_game_disabled" ? "is-warn" : "is-conflict"}`}
                role="status"
                data-builder-compat={compat.code ?? "conflict"}
              >
                <MaestroIcon name="shield" size={14} />
                <div className="pl-bb-compat-copy">
                  <strong>Incompatibilidad detectada</strong>
                  <p>{compat.reason}</p>
                </div>
              </div>
            ) : (
              <div className="pl-bb-compat is-ready" role="status" data-builder-compat="allowed">
                <MaestroIcon name="layers" size={14} />
                <span>
                  Compatible con tu boleto actual ({parlayLegs.length}{" "}
                  {parlayLegs.length === 1 ? "selección" : "selecciones"}).
                </span>
              </div>
            )}

            <div className="pl-bb-focal-actions">
              {inParlay ? (
                <button
                  type="button"
                  className="pl-btn-glass pl-bb-action-main"
                  onClick={() => removePickFromParlay(pick.id)}
                >
                  <MaestroIcon name="minus" size={14} />
                  <span>Quitar del boleto</span>
                </button>
              ) : compat.allowed ? (
                <button
                  type="button"
                  className="pl-btn-primary pl-bb-action-main"
                  data-builder-add-primary=""
                  onClick={() => addPickToParlay(pick)}
                >
                  <MaestroIcon name="plus" size={14} />
                  <span>Agregar al boleto</span>
                </button>
              ) : compat.code === "same_game_disabled" && compatWithSgp?.allowed ? (
                <button
                  type="button"
                  className="pl-btn-primary pl-bb-action-main"
                  onClick={handleEnableSgpAndAdd}
                >
                  <MaestroIcon name="layers" size={14} />
                  <span>Activar SGP y agregar</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="pl-btn-glass pl-bb-action-main"
                  disabled
                >
                  <span>No combinable</span>
                </button>
              )}

              {!isFinished && !isLive ? (
                <button
                  type="button"
                  className="pl-btn-glass pl-bb-action-sec"
                  onClick={() => {
                    onClose();
                    openComposer(pick);
                  }}
                >
                  Sellar simple
                </button>
              ) : null}
            </div>
          </section>

          {/* Bloque 2: Combinar en el mismo partido (SGP) */}
          {sgpSuggestions.length > 0 ? (
            <section className="pl-bb-section" aria-label="Otros mercados de este partido">
              <div className="pl-bb-section-head">
                <h3 className="pl-bb-section-title">Combinar del mismo partido (SGP)</h3>
                <label className="pl-bb-sgp-toggle">
                  <input
                    type="checkbox"
                    checked={allowSgp}
                    onChange={(e) => setAllowSgp(e.target.checked)}
                  />
                  <span>SGP {allowSgp ? "activo" : "desactivado"}</span>
                </label>
              </div>
              <ul className="pl-bb-sgp-list">
                {sgpSuggestions.map(({ candidate, inSlip, check }) => {
                  const canAdd = inSlip || (allowSgp && check.allowed);
                  return (
                    <li key={candidate.id} className="pl-bb-sgp-row">
                      <div className="min-w-0">
                        <strong className="pl-bb-sgp-label">{candidate.label}</strong>
                        <span className="pl-bb-sgp-meta num">
                          {(candidate.p * 100).toFixed(1)} % · Justo{" "}
                          {formatOddsValue(candidate.fairDecimal, oddsFormat)}
                          {!check.allowed && !inSlip ? " · Conflicto de eje" : ""}
                        </span>
                      </div>
                      <button
                        type="button"
                        className={`pl-home-parlay-btn is-sm min-h-11 ${inSlip ? "is-on" : ""}`.trim()}
                        disabled={!canAdd}
                        title={
                          !allowSgp && !inSlip
                            ? "Activa SGP para combinar del mismo partido"
                            : check.reason
                        }
                        onClick={() => {
                          if (inSlip) {
                            removePickFromParlay(candidate.id);
                          } else {
                            addPickToParlay(candidate);
                          }
                        }}
                      >
                        <MaestroIcon name={inSlip ? "check" : "plus"} size={13} />
                        <span>{inSlip ? "En boleto" : check.allowed ? "Unir" : "Choca"}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {/* Bloque 3: Resumen del boleto combinado actual */}
          <section className="pl-bb-section" aria-label="Resumen de tu boleto actual">
            <div className="pl-bb-section-head">
              <h3 className="pl-bb-section-title">
                Tu boleto ({parlayLegs.length}{" "}
                {parlayLegs.length === 1 ? "selección" : "selecciones"})
              </h3>
              {parlayLegs.length > 0 ? (
                <span className={`pl-pill text-[11px] num pl-bb-risk--${risk.tone}`}>
                  {risk.shortLabel}
                </span>
              ) : null}
            </div>

            {parlayLegs.length === 0 ? (
              <p className="pl-bb-empty">
                Aún no tienes selecciones en tu boleto. Agrega 2 o más picks compatibles para armar tu combinada.
              </p>
            ) : (
              <>
                <div className="pl-bb-summary-grid num">
                  <div className="pl-bb-stat-cell">
                    <span>Prob. conjunta</span>
                    <strong>{(parlaySummary.combinedProbability * 100).toFixed(1)} %</strong>
                  </div>
                  <div className="pl-bb-stat-cell">
                    <span>Momio justo</span>
                    <strong>{formatOddsValue(parlaySummary.fairDecimal, oddsFormat)}</strong>
                  </div>
                  <div className="pl-bb-stat-cell">
                    <span>Cuota ref.</span>
                    <strong>{formatOddsValue(parlaySummary.bookDecimal, oddsFormat)}</strong>
                  </div>
                </div>

                {parlaySummary.hasSgpCorrelation ? (
                  <p className="pl-bb-sgp-note">
                    Incluye correlación de mismo partido (SGP): probabilidad ajustada automáticamente.
                  </p>
                ) : null}

                <ul className="pl-bb-legs-list">
                  {parlayLegs.map(({ pick: leg }) => (
                    <li key={leg.id} className="pl-bb-leg-row">
                      <div className="min-w-0">
                        <strong className="pl-bb-leg-label">{leg.label}</strong>
                        <span className="pl-bb-leg-sub num">
                          {leg.matchLabel} · {(leg.p * 100).toFixed(1)} %
                        </span>
                      </div>
                      <button
                        type="button"
                        className="pl-bb-leg-remove"
                        aria-label={`Quitar ${leg.label} del boleto`}
                        onClick={() => removePickFromParlay(leg.id)}
                      >
                        <MaestroIcon name="x" size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>

        <footer className="pl-bb-footer">
          <button
            type="button"
            className="pl-btn-glass pl-bb-footer-btn"
            onClick={() => {
              onClose();
              navigateTo("/app/parlays");
            }}
          >
            Abrir Parlays
          </button>
          <button
            type="button"
            className="pl-btn-primary pl-bb-footer-btn num"
            disabled={parlayLegs.length < 2}
            onClick={() => {
              sealParlayToJournal();
              onClose();
            }}
          >
            <MaestroIcon name="check" size={14} />
            <span>
              {parlayLegs.length >= 2
                ? `Sellar (${parlayLegs.length})`
                : "Agrega 2+ picks"}
            </span>
          </button>
        </footer>
      </div>
    </dialog>
  );
}
