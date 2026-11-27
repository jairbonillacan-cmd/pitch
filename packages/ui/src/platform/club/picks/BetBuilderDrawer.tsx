"use client";

import React, { useId, useMemo, useRef, useState } from "react";
import { Button, SofascoreKpiStrip } from "../../../components/ui/primitives";
import { PBar } from "../../../sports";
import { formatOddsValue, isPickUnlocked } from "../../access-guard";
import { resolvePreferredBookQuote } from "../../bookmakers";
import { DrawerErrorBoundary } from "../../components/DrawerErrorBoundary";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import { SgpCopulaAuditCard } from "../../components/SgpCopulaAuditCard";
import { useSheetSwipeDismiss } from "../../components/use-sheet-swipe-dismiss";
import { useMediaQuery, useSafeEffect } from "../../hooks";
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
import type { MatchPick, PlatformGame, SgpCopulaAuditView } from "../../types";
import { BookmakerComparePill } from "./BookmakerComparePill";
import { EvidenceWindowPills, extractEvidenceWindows } from "./EvidenceWindowPills";

const MAX_PARLAY_LEGS = 6;

export interface BetBuilderQuickButtonProps {
  readonly pick: MatchPick;
  readonly onInspect: (pick: MatchPick) => void;
  readonly compact?: boolean;
}

export function BetBuilderQuickButton({
  pick,
  onInspect,
  compact = false,
}: BetBuilderQuickButtonProps): React.JSX.Element {
  const inParlay = useIsPickInParlay(pick.id);
  return (
    <Button
      variant={inParlay ? "secondary" : "ghost"}
      size="sm"
      className={`pl-scr-builder-btn min-w-11 ${compact ? "is-compact" : ""} ${inParlay ? "is-in-slip" : ""}`.trim()}
      data-open-bet-builder={pick.id}
      aria-label={`Abrir Bet Builder para ${pick.label}`}
      onClick={() => onInspect(pick)}
    >
      <MaestroIcon name="layers" size={13} />
      <span>{inParlay ? "En boleto" : "Builder"}</span>
    </Button>
  );
}

export interface BetBuilderDrawerProps {
  readonly open: boolean;
  readonly pick: MatchPick | null;
  readonly game?: PlatformGame | null;
  readonly onClose: () => void;
}

function computeDrawerFrechetBounds(
  legs: readonly { readonly pick: { readonly gameId: string; readonly p: number } }[],
): { readonly lower: number; readonly upper: number } {
  if (legs.length === 0) return { lower: 0, upper: 0 };
  const byGame = new Map<string, number[]>();
  for (const leg of legs) {
    const p = Math.min(0.99, Math.max(0.01, leg.pick.p));
    const list = byGame.get(leg.pick.gameId) ?? [];
    list.push(p);
    byGame.set(leg.pick.gameId, list);
  }
  let lower = 1;
  let upper = 1;
  for (const probs of byGame.values()) {
    if (probs.length === 1) {
      lower *= probs[0] ?? 0.5;
      upper *= probs[0] ?? 0.5;
    } else {
      const sumP = probs.reduce((acc, v) => acc + v, 0);
      const minP = probs.reduce((acc, v) => Math.min(acc, v), 1);
      const lo = Math.max(0.0001, sumP - (probs.length - 1));
      lower *= lo;
      upper *= Math.max(lo, minP);
    }
  }
  return {
    lower: Math.max(0.0001, Math.min(0.99, lower)),
    upper: Math.max(0.0001, Math.min(0.99, upper)),
  };
}

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

  const isMobileViewport = useMediaQuery("(max-width: 767px)", false);
  const [resolvedAudit, setResolvedAudit] = useState<SgpCopulaAuditView | null>(null);
  const [inlineNotice, setInlineNotice] = useState<string | null>(null);

  const swipe = useSheetSwipeDismiss({
    onDismiss: () => onCloseRef.current(),
    disabled: !open || !isMobileViewport,
    scrollContainerRef: bodyScrollRef,
    dragHandleSelector: ".pl-sheet-drag-zone",
  });

  const pickId = pick?.id ?? null;

  useSafeEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    const closeDialogSafely = () => {
      if (typeof dialog.close === "function" && dialog.open) {
        try {
          dialog.returnValue = "";
          dialog.close();
          return;
        } catch (err) {
          void err;
        }
      }
      if (dialog.hasAttribute("open")) {
        dialog.removeAttribute("open");
      }
    };

    if (!open || !pickId) {
      closeDialogSafely();
      return undefined;
    }

    if (!dialog.open) {
      if (typeof dialog.showModal === "function") {
        try {
          dialog.showModal();
        } catch (err) {
          void err;
          dialog.setAttribute("open", "");
        }
      } else if (typeof dialog.show === "function") {
        try {
          dialog.show();
        } catch (err) {
          void err;
          dialog.setAttribute("open", "");
        }
      } else {
        dialog.setAttribute("open", "");
      }
    }

    const handleCancel = (event: Event) => {
      event.preventDefault();
      onCloseRef.current();
    };

    const handleClose = () => {
      if (dialog.open) return;
      dialog.returnValue = "";
      onCloseRef.current();
    };
    dialog.addEventListener("cancel", handleCancel);
    dialog.addEventListener("close", handleClose);

    const handleEscape = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.key !== "Escape") return;
      if (!dialog.open && !dialog.hasAttribute("open")) return;
      e.preventDefault();
      onCloseRef.current();
    };
    window.addEventListener("keydown", handleEscape);

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
          if (typeof dialog.close === "function" && dialog.open) {
            try {
              dialog.returnValue = "";
              dialog.close();
              return;
            } catch (err) {
              void err;
            }
          }
          dialog.removeAttribute("open");
          onCloseRef.current();
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
      window.removeEventListener("keydown", handleEscape);
      dialog.removeEventListener("cancel", handleCancel);
      dialog.removeEventListener("close", handleClose);
      cleanupLightDismiss?.();
      closeDialogSafely();
    };
  }, [open, pickId]);

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
      .sort(
        (a, b) =>
          (b.check.allowed ? 1 : 0) - (a.check.allowed ? 1 : 0) || b.candidate.p - a.candidate.p,
      )
      .slice(0, 5);
  }, [inParlay, parlayLegs, pick, resolvedGame, viewerRole]);

  const evidenceWindows = useMemo(() => {
    if (!pick || !resolvedGame) return [];
    return extractEvidenceWindows({ game: resolvedGame, pick });
  }, [pick, resolvedGame]);

  const frechetBounds = useMemo(() => computeDrawerFrechetBounds(parlayLegs), [parlayLegs]);

  const effectiveJointProb = useMemo(() => {
    if (parlayLegs.length === 0) return 0;
    const raw =
      parlaySummary.hasSgpCorrelation &&
      resolvedAudit &&
      resolvedAudit.nLegs === parlayLegs.length
        ? resolvedAudit.jointProbability
        : parlaySummary.combinedProbability;
    return Math.min(frechetBounds.upper, Math.max(frechetBounds.lower, raw));
  }, [frechetBounds.lower, frechetBounds.upper, parlayLegs.length, parlaySummary, resolvedAudit]);

  const effectiveFairDecimal = useMemo(() => {
    if (parlayLegs.length === 0) return 1;
    if (
      parlaySummary.hasSgpCorrelation &&
      resolvedAudit &&
      resolvedAudit.nLegs === parlayLegs.length &&
      resolvedAudit.fairCombinedDecimal > 1
    ) {
      return resolvedAudit.fairCombinedDecimal;
    }
    return Math.max(1.01, Math.round((1 / Math.max(effectiveJointProb, 0.0001)) * 100) / 100);
  }, [effectiveJointProb, parlayLegs.length, parlaySummary.hasSgpCorrelation, resolvedAudit]);

  if (!open || !pick) return null;

  const prefQuote = resolvePreferredBookQuote(pick.bookQuotes, preferredBooks);
  const houseDecimal = prefQuote?.decimal ?? pick.marketDecimal;
  const houseBookLabel = prefQuote?.bookLabel ?? pick.marketBookLabel ?? null;
  const risk = assessParlayRisk({ ...parlaySummary, combinedProbability: effectiveJointProb });
  const isFinished = pick.gameStatus === "FT";
  const isLive = pick.gameStatus === "LIVE";
  const exceedsMaxLegs = parlayLegs.length > MAX_PARLAY_LEGS;
  const atMaxLegs = parlayLegs.length >= MAX_PARLAY_LEGS;
  const canSealSlip = parlayLegs.length >= 2 && parlayLegs.length <= MAX_PARLAY_LEGS;

  const handleEnableSgpAndAdd = () => {
    if (parlayLegs.length >= MAX_PARLAY_LEGS) {
      setInlineNotice(
        `El máximo por parlay es de ${MAX_PARLAY_LEGS} selecciones. Quita una para agregar esta.`,
      );
      return;
    }
    setInlineNotice(null);
    setAllowSgp(true);
    loadParlayPicks([...parlayLegs.map((l) => l.pick), pick], {
      allowSgp: true,
      label: pick.label,
    });
  };

  const handleToggleSuggestion = (
    candidate: MatchPick,
    inSlip: boolean,
    check: ParlayCompatibilityResult,
  ) => {
    if (inSlip) {
      setInlineNotice(null);
      removePickFromParlay(candidate.id);
      return;
    }
    if (parlayLegs.length >= MAX_PARLAY_LEGS) {
      setInlineNotice(
        `El máximo por parlay es de ${MAX_PARLAY_LEGS} selecciones. Quita una para agregar esta.`,
      );
      return;
    }
    if (!allowSgp) {
      setInlineNotice("Activa el interruptor SGP para combinar mercados del mismo partido.");
      return;
    }
    if (!check.allowed) {
      setInlineNotice(check.reason ?? "Selección incompatible con tu boleto actual.");
      return;
    }
    setInlineNotice(null);
    addPickToParlay(candidate);
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
        <DrawerErrorBoundary title="Bet Builder temporalmente no disponible" onClose={onClose}>
        <div
          className="pl-bb-drag-zone pl-sheet-drag-zone"
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
            <Button
              variant="ghost"
              size="icon"
              aria-label="Cerrar Bet Builder"
              autoFocus={!isMobileViewport}
              onClick={onClose}
            >
              <MaestroIcon name="x" size={16} />
            </Button>
          </header>
        </div>

        <div ref={bodyScrollRef} className="pl-bb-body">
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

            {inParlay ? (
              <div className="pl-bb-compat is-ok" role="status" data-builder-compat="in_parlay">
                <MaestroIcon name="check" size={14} />
                <span>Esta selección ya forma parte de tu boleto combinado.</span>
              </div>
            ) : atMaxLegs ? (
              <div className="pl-bb-compat is-warn" role="alert" data-builder-compat="max_legs">
                <MaestroIcon name="shield" size={14} />
                <div className="pl-bb-compat-copy">
                  <strong>Límite de {MAX_PARLAY_LEGS} selecciones alcanzado</strong>
                  <p>
                    Los parlays aceptan hasta {MAX_PARLAY_LEGS} selecciones. Quita una del boleto
                    para agregar otra.
                  </p>
                </div>
              </div>
            ) : !compat.allowed && compat.reason ? (
              <div
                className={`pl-bb-compat ${compat.code === "same_game_disabled" ? "is-warn" : "is-conflict"}`}
                role="alert"
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
                  Compatible con tu boleto actual ({parlayLegs.length}/{MAX_PARLAY_LEGS}{" "}
                  {parlayLegs.length === 1 ? "selección" : "selecciones"}).
                </span>
              </div>
            )}

            <div className="pl-bb-focal-actions">
              {inParlay ? (
                <Button
                  variant="secondary"
                  size="default"
                  className="pl-bb-action-main"
                  onClick={() => {
                    setInlineNotice(null);
                    removePickFromParlay(pick.id);
                  }}
                >
                  <MaestroIcon name="minus" size={14} />
                  <span>Quitar del boleto</span>
                </Button>
              ) : atMaxLegs ? (
                <Button
                  variant="secondary"
                  size="default"
                  className="pl-bb-action-main"
                  disabled
                >
                  <span>Máximo {MAX_PARLAY_LEGS} picks</span>
                </Button>
              ) : compat.allowed ? (
                <Button
                  variant={canSealSlip ? "secondary" : "primary"}
                  size="default"
                  className="pl-bb-action-main"
                  data-builder-add-primary=""
                  onClick={() => {
                    setInlineNotice(null);
                    addPickToParlay(pick);
                  }}
                >
                  <MaestroIcon name="plus" size={14} />
                  <span>Agregar al boleto</span>
                </Button>
              ) : compat.code === "same_game_disabled" && compatWithSgp?.allowed ? (
                <Button
                  variant={canSealSlip ? "secondary" : "primary"}
                  size="default"
                  className="pl-bb-action-main"
                  onClick={handleEnableSgpAndAdd}
                >
                  <MaestroIcon name="layers" size={14} />
                  <span>Activar SGP y agregar</span>
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="default"
                  className="pl-bb-action-main"
                  disabled
                >
                  <span>No combinable</span>
                </Button>
              )}

              {!isFinished && !isLive ? (
                <Button
                  variant="secondary"
                  size="default"
                  onClick={() => {
                    onClose();
                    openComposer(pick);
                  }}
                >
                  Sellar simple
                </Button>
              ) : null}
            </div>
          </section>

          {sgpSuggestions.length > 0 ? (
            <section className="pl-bb-section" aria-label="Otros mercados de este partido">
              <div className="pl-bb-section-head">
                <h3 className="pl-bb-section-title">Combinar del mismo partido (SGP)</h3>
                <label className="pl-bb-sgp-toggle">
                  <input
                    type="checkbox"
                    checked={allowSgp}
                    onChange={(e) => {
                      setInlineNotice(null);
                      setAllowSgp(e.target.checked);
                    }}
                  />
                  <span>SGP {allowSgp ? "activo" : "desactivado"}</span>
                </label>
              </div>

              {inlineNotice ? (
                <div className="pl-bb-compat is-warn" role="alert">
                  <MaestroIcon name="shield" size={14} />
                  <span>{inlineNotice}</span>
                </div>
              ) : null}

              <ul className="pl-bb-sgp-list">
                {sgpSuggestions.map(({ candidate, inSlip, check }) => {
                  const canAdd = inSlip || (allowSgp && check.allowed && !atMaxLegs);
                  return (
                    <li key={candidate.id} className="pl-bb-sgp-row">
                      <div className="min-w-0">
                        <strong className="pl-bb-sgp-label">{candidate.label}</strong>
                        <span className="pl-bb-sgp-meta num">
                          {(candidate.p * 100).toFixed(1)} % · Justo{" "}
                          {formatOddsValue(candidate.fairDecimal, oddsFormat)}
                          {!inSlip && atMaxLegs
                            ? ` · Máx. ${MAX_PARLAY_LEGS} picks`
                            : !check.allowed && !inSlip
                              ? check.code === "sgp_limit"
                                ? " · Máx. 2 SGP"
                                : " · Conflicto de eje"
                              : ""}
                        </span>
                      </div>
                      <Button
                        variant={inSlip ? "secondary" : "ghost"}
                        size="sm"
                        className="min-w-11"
                        disabled={!canAdd && (allowSgp || atMaxLegs)}
                        title={
                          !inSlip && atMaxLegs
                            ? `Máximo ${MAX_PARLAY_LEGS} selecciones por parlay`
                            : !allowSgp && !inSlip
                              ? "Activa SGP para combinar del mismo partido"
                              : check.reason
                        }
                        onClick={() => handleToggleSuggestion(candidate, inSlip, check)}
                      >
                        <MaestroIcon name={inSlip ? "check" : "plus"} size={13} />
                        <span>
                          {inSlip
                            ? "En boleto"
                            : atMaxLegs
                              ? "Límite"
                              : check.allowed
                                ? "Unir"
                                : check.code === "sgp_limit"
                                  ? "Límite"
                                  : "Choca"}
                        </span>
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <section className="pl-bb-section" aria-label="Resumen de tu boleto actual">
            <div className="pl-bb-section-head">
              <h3 className="pl-bb-section-title">
                Tu boleto ({parlayLegs.length}{" "}
                {parlayLegs.length === 1 ? "selección" : "selecciones"})
              </h3>
              {parlayLegs.length > 0 ? (
                <span className={`pl-sf-signal-pill is-compact num pl-bb-risk--${risk.tone}`}>
                  {risk.shortLabel}
                </span>
              ) : null}
            </div>

            {parlayLegs.length === 0 ? (
              <p className="pl-bb-empty">
                Aún no tienes selecciones en tu boleto. Agrega 2 o más picks compatibles para armar
                tu combinada.
              </p>
            ) : (
              <>
                <SofascoreKpiStrip
                  items={[
                    {
                      id: "prob",
                      label: "Prob. conjunta",
                      value: `${(effectiveJointProb * 100).toFixed(1)} %`,
                      tone: "brand",
                    },
                    {
                      id: "fair",
                      label: "Momio justo",
                      value: formatOddsValue(effectiveFairDecimal, oddsFormat),
                    },
                    {
                      id: "book",
                      label: "Cuota ref.",
                      value: formatOddsValue(parlaySummary.bookDecimal, oddsFormat),
                    },
                  ]}
                />

                {exceedsMaxLegs ? (
                  <div
                    className="pl-bb-compat is-conflict"
                    role="alert"
                    data-builder-max-legs-alert=""
                  >
                    <MaestroIcon name="shield" size={14} />
                    <div className="pl-bb-compat-copy">
                      <strong>Máximo {MAX_PARLAY_LEGS} selecciones por parlay</strong>
                      <p>
                        Tienes {parlayLegs.length} selecciones en tu boleto. Quita{" "}
                        {parlayLegs.length - MAX_PARLAY_LEGS} para poder sellarlo.
                      </p>
                    </div>
                  </div>
                ) : null}

                {parlaySummary.hasSgpCorrelation ? (
                  <SgpCopulaAuditCard
                    legs={parlayLegs}
                    oddsFormat={oddsFormat}
                    onAuditResolved={setResolvedAudit}
                    compact
                  />
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
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Quitar ${leg.label} del boleto`}
                        onClick={() => removePickFromParlay(leg.id)}
                      >
                        <MaestroIcon name="x" size={14} />
                      </Button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>

        <footer className="pl-bb-footer">
          <Button
            variant="secondary"
            size="default"
            className="pl-bb-footer-btn"
            onClick={() => {
              onClose();
              navigateTo("/app/parlays");
            }}
          >
            Abrir Parlays
          </Button>
          <Button
            variant={canSealSlip ? "primary" : "secondary"}
            size="default"
            className="pl-bb-footer-btn num"
            disabled={!canSealSlip}
            onClick={() => {
              if (!canSealSlip) {
                setInlineNotice(
                  exceedsMaxLegs
                    ? `Reduce tu boleto a máximo ${MAX_PARLAY_LEGS} selecciones para sellar.`
                    : "Agrega al menos 2 selecciones compatibles para sellar.",
                );
                return;
              }
              sealParlayToJournal();
              onClose();
            }}
          >
            <MaestroIcon name="check" size={14} />
            <span>
              {exceedsMaxLegs
                ? `Máx. ${MAX_PARLAY_LEGS} (${parlayLegs.length})`
                : canSealSlip
                  ? `Sellar (${parlayLegs.length})`
                  : "Agrega 2+ picks"}
            </span>
          </Button>
        </footer>
        </DrawerErrorBoundary>
      </div>
    </dialog>
  );
}
