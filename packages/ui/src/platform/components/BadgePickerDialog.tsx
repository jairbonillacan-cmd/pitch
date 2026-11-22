"use client";

import React, { useEffect, useId, useRef } from "react";
import { BADGE_FAMILY_LABELS, BADGE_RULES, type BadgeView } from "../badges";
import { BadgeGlyph, type OwnBadgesState } from "../club/badges/ProfileBadges";
import { MaestroIcon } from "./MaestroPrimitives";
import { useSheetSwipeDismiss } from "./use-sheet-swipe-dismiss";

export interface BadgePickerDialogProps {
  open: boolean;
  onClose: () => void;
  isOwn: boolean;
  memberName: string;
  publicBadges: readonly BadgeView[];
  own?: OwnBadgesState | null;
  onToggleFeatured?: (id: string) => void;
  excludeBadgeIds?: readonly string[];
}

export function BadgePickerDialog({
  open,
  onClose,
  isOwn,
  memberName,
  publicBadges,
  own,
  onToggleFeatured,
  excludeBadgeIds,
}: BadgePickerDialogProps): React.JSX.Element | null {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const sheetSwipe = useSheetSwipeDismiss({
    onDismiss: () => {
      dialogRef.current?.close();
    },
    disabled: !open,
    scrollContainerRef: bodyRef,
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      try {
        dialog.showModal();
      } catch (err) {
        void err;
      }
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      dialog.returnValue = "";
      onCloseRef.current();
    };
    dialog.addEventListener("close", handleClose);

    const needsFallback =
      typeof HTMLDialogElement !== "undefined" && !("closedBy" in HTMLDialogElement.prototype);
    let pressedOutside = false;
    const isOutside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    const onPointerDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e)) dialog.close();
      pressedOutside = false;
    };

    if (needsFallback) {
      dialog.addEventListener("pointerdown", onPointerDown);
      dialog.addEventListener("pointerup", onPointerUp);
    }

    return () => {
      dialog.removeEventListener("close", handleClose);
      if (needsFallback) {
        dialog.removeEventListener("pointerdown", onPointerDown);
        dialog.removeEventListener("pointerup", onPointerUp);
      }
    };
  }, [open]);

  if (!open) return null;

  const excludedSet = new Set(excludeBadgeIds ?? []);
  const visiblePublicBadges = publicBadges.filter((b) => !excludedSet.has(b.id));
  const earned = isOwn && own ? own.all.filter((b) => b.earned && !excludedSet.has(b.id)) : [];
  const pending = isOwn && own ? own.all.filter((b) => !b.earned && b.measured && !excludedSet.has(b.id)) : [];
  const soon = isOwn && own ? own.all.filter((b) => !b.earned && !b.measured && !excludedSet.has(b.id)) : [];
  const featuredIdsClean = (own?.featuredIds ?? []).filter((id) => !excludedSet.has(id));
  const featuredSet = new Set(featuredIdsClean);
  const publicSet = new Set(own?.publicIds ?? []);
  const maxFeatured = BADGE_RULES.maxFeatured;
  const full = featuredIdsClean.length >= maxFeatured;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="pl-native-modal pl-badge-modal"
      data-badge-picker-dialog=""
      style={sheetSwipe.sheetStyle}
      {...({ closedby: "any" } as Record<string, string>)}
    >
      <div className="pl-sheet-drag-zone" {...sheetSwipe.handleProps}>
        <div className="pl-sheet-grab sm:hidden" aria-hidden="true" />
        <div className="pl-native-modal-head">
          <div>
            <h2 id={titleId} className="pl-native-modal-title">
              {isOwn ? "Tus insignias" : `Insignias de ${memberName}`}
            </h2>
            <p className="pl-native-modal-sub num">
              {isOwn
                ? `Elige hasta ${maxFeatured} para mostrarlas junto a tu nombre (${featuredIdsClean.length}/${maxFeatured}).`
                : `${visiblePublicBadges.length} ${visiblePublicBadges.length === 1 ? "insignia desbloqueada" : "insignias desbloqueadas"}`}
            </p>
          </div>
          <button
            type="button"
            className="pl-native-modal-close"
            aria-label="Cerrar insignias"
            onClick={() => dialogRef.current?.close()}
          >
            <MaestroIcon name="x" size={16} />
          </button>
        </div>
      </div>

      <div ref={bodyRef} tabIndex={0} className="pl-native-modal-body" aria-label="Lista de insignias">
        {isOwn && own ? (
          <>
            <div className="pl-bm-section">
              <div className="pl-bm-section-head">
                <h3>Desbloqueadas ({earned.length})</h3>
                {own.saving ? <span className="pl-bm-saving">Guardando…</span> : null}
              </div>

              {earned.length === 0 ? (
                <p className="pl-bm-empty">
                  Todavía no desbloqueas insignias. Sella picks en tu bitácora o participa en Comunidad para ganar la primera.
                </p>
              ) : (
                <ul className="pl-bm-grid">
                  {earned.map((b) => {
                    const isFeatured = featuredSet.has(b.id);
                    const isPublic = publicSet.has(b.id);
                    const blocked = !isFeatured && (full || !isPublic);
                    const fam = BADGE_FAMILY_LABELS[b.family] ?? "Logro";
                    return (
                      <li key={b.id} className={`pl-bm-card ${isFeatured ? "is-featured" : ""}`.trim()}>
                        <div className="pl-bm-card-top">
                          <span className="pl-bm-glyph">
                            <BadgeGlyph family={b.family} badgeId={b.id} size={22} />
                          </span>
                          <div className="pl-bm-card-meta">
                            <strong>{b.label}</strong>
                            <span>{fam}</span>
                          </div>
                        </div>
                        <p className="pl-bm-crit">{b.criterion}</p>
                        {own.canFeature && onToggleFeatured ? (
                          <button
                            type="button"
                            className={`pl-bm-toggle ${isFeatured ? "is-on" : ""}`.trim()}
                            aria-pressed={isFeatured}
                            disabled={blocked}
                            onClick={() => onToggleFeatured(b.id)}
                          >
                            <MaestroIcon name={isFeatured ? "check" : "star"} size={13} />
                            <span>
                              {isFeatured
                                ? "Destacada"
                                : !isPublic
                                  ? "Oculta en privacidad"
                                  : full
                                    ? `Límite ${maxFeatured}/${maxFeatured}`
                                    : "Mostrar en perfil"}
                            </span>
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {pending.length > 0 ? (
              <div className="pl-bm-section">
                <div className="pl-bm-section-head">
                  <h3>Por ganar ({pending.length})</h3>
                </div>
                <ul className="pl-bm-grid">
                  {pending.map((b) => {
                    const fam = BADGE_FAMILY_LABELS[b.family] ?? "Logro";
                    const pct =
                      b.progress && b.progress.target > 0
                        ? Math.min(100, Math.round((b.progress.current / b.progress.target) * 100))
                        : 0;
                    return (
                      <li key={b.id} className="pl-bm-card is-locked">
                        <div className="pl-bm-card-top">
                          <span className="pl-bm-glyph is-muted">
                            <BadgeGlyph family={b.family} badgeId={b.id} size={22} />
                          </span>
                          <div className="pl-bm-card-meta">
                            <strong>{b.label}</strong>
                            <span>{fam}</span>
                          </div>
                        </div>
                        <p className="pl-bm-crit">{b.criterion}</p>
                        {b.progress ? (
                          <div className="pl-bm-prog">
                            <span className="pl-bm-prog-track" aria-hidden="true">
                              <span style={{ width: `${pct}%` }} />
                            </span>
                            <span className="pl-bm-prog-num num">
                              {b.progress.current}/{b.progress.target}
                            </span>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {soon.length > 0 ? (
              <p className="pl-bm-footnote">
                También cuentan con tu actividad: {soon.map((b) => b.label).join(", ")}.
              </p>
            ) : null}
            <p className="pl-bm-footnote">
              Nunca damos insignias por volumen de apuesta ni por rachas de conexión.
            </p>
          </>
        ) : visiblePublicBadges.length > 0 ? (
          <ul className="pl-bm-grid">
            {visiblePublicBadges.map((b) => (
              <li key={b.id} className="pl-bm-card">
                <div className="pl-bm-card-top">
                  <span className="pl-bm-glyph">
                    <BadgeGlyph family={b.family} badgeId={b.id} size={22} />
                  </span>
                  <div className="pl-bm-card-meta">
                    <strong>{b.label}</strong>
                    <span>{BADGE_FAMILY_LABELS[b.family] ?? "Logro"}</span>
                  </div>
                </div>
                <p className="pl-bm-crit">{b.criterion}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pl-bm-empty">Este perfil todavía no tiene insignias públicas.</p>
        )}
      </div>

      <div className="pl-native-modal-foot">
        <button
          type="button"
          className="pl-btn-primary min-h-11 px-5 text-sm"
          onClick={() => dialogRef.current?.close()}
        >
          Listo
        </button>
      </div>
    </dialog>
  );
}
