"use client";

import React, { useId, useRef, useState } from "react";
import { buildPackIconSources, usePackIconBase } from "../../pack-icon-theme";
import { BADGE_FAMILY_LABELS, type BadgeFamily } from "../badges";
import { useSafeEffect } from "../hooks";

const VALID_BADGE_SLUGS = new Set([
  "ojo-fino",
  "contra-el-cierre",
  "especialista",
  "racha-5",
  "bitacora-al-dia",
  "voz-util",
  "lectura-del-partido",
  "embajador",
  "fundador-beta",
  "tipster-verificado",
  "socio-30-dias",
  "socio-90-dias",
  "socio-1-ano",
  "top-10-semanal",
  "top-10-mensual",
]);

export function resolveBadgeIconSlug(
  badgeId: string | undefined,
  family: BadgeFamily | string,
): string {
  if (badgeId) {
    if (badgeId.startsWith("especialista")) return "especialista";
    if (VALID_BADGE_SLUGS.has(badgeId)) return badgeId;
  }
  switch (family) {
    case "precision":
      return "ojo-fino";
    case "constancy":
      return "bitacora-al-dia";
    case "community":
      return "voz-util";
    case "origin":
      return "fundador-beta";
    case "seniority":
      return "socio-30-dias";
    default:
      return "top-10-mensual";
  }
}

function resolveBadgeExtendedNote(badgeId: string | undefined, family: string): string {
  if (badgeId === "tipster-verificado") {
    return "Los tipsters verificados publican pronósticos auditados y sellados antes del inicio de cada encuentro, con historial íntegro e inmutable.";
  }
  if (badgeId === "fundador-beta") {
    return "Reconocimiento permanente para quienes formaron parte de la etapa beta fundacional de PitchLab.";
  }
  switch (family) {
    case "precision":
      return "Se calcula automáticamente sobre picks cerrados y sellados antes del partido en tu récord verificado.";
    case "constancy":
      return "Premia la disciplina sostenida en tu récord sin incentivar volumen innecesario.";
    case "community":
      return "Refleja aportaciones útiles dentro de Comunidad PitchLab.";
    case "seniority":
      return "Reconoce tu permanencia como socio activo dentro del club.";
    case "top":
      return "Se otorga a los perfiles con mejor desempeño verificado dentro del periodo.";
    default:
      return "Insignia oficial del ecosistema PitchLab verificada automáticamente por el sistema.";
  }
}

export interface BadgeInfoTriggerProps {
  readonly badgeId?: string;
  readonly family: BadgeFamily | string;
  readonly label: string;
  readonly criterion: string;
  readonly size?: number;
  readonly className?: string;
  readonly iconClassName?: string;
}

export function BadgeInfoTrigger({
  badgeId,
  family,
  label,
  criterion,
  size = 18,
  className,
  iconClassName,
}: BadgeInfoTriggerProps): React.JSX.Element {
  const uid = useId();
  const tooltipId = `pl-badge-tip-${uid}`;
  const titleId = `pl-badge-title-${uid}`;
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const pressedOutsideRef = useRef<boolean>(false);
  const [open, setOpen] = useState<boolean>(false);
  const [tipDismissed, setTipDismissed] = useState<boolean>(false);

  const iconBase = usePackIconBase();
  const slug = resolveBadgeIconSlug(badgeId, family);
  const sources = buildPackIconSources(iconBase, `insignias/${slug}`);
  const familyLabel =
    BADGE_FAMILY_LABELS[family as BadgeFamily] ?? "Insignia";
  const extendedNote = resolveBadgeExtendedNote(badgeId, family);

  useSafeEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) {
        if (typeof dialog.showModal === "function") {
          dialog.showModal();
        } else {
          dialog.setAttribute("open", "");
        }
      }
      return;
    }
    if (dialog.open) {
      dialog.close();
    }
  }, [open]);

  const isPointerOutside = (e: React.PointerEvent<HTMLDialogElement>, dialog: HTMLDialogElement): boolean => {
    const rect = dialog.getBoundingClientRect();
    return (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    );
  };

  return (
    <span
      className={["pl-badge-icon-wrap", className].filter(Boolean).join(" ")}
      data-badge-icon={badgeId ?? slug}
      data-tip-dismissed={tipDismissed ? "true" : undefined}
      onMouseLeave={() => setTipDismissed(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !open) {
          setTipDismissed(true);
        }
      }}
    >
      <button
        type="button"
        className="pl-badge-icon-btn"
        aria-describedby={tooltipId}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen(true);
        }}
      >
        <img
          src={sources.src}
          srcSet={sources.srcSet}
          width={size}
          height={size}
          alt=""
          aria-hidden="true"
          decoding="async"
          draggable={false}
          className={["pl-maestro-icon", "pl-pack-icon", "inline-block", "shrink-0", iconClassName]
            .filter(Boolean)
            .join(" ")}
        />
        <span className="sr-only">{label}</span>
      </button>

      <span id={tooltipId} role="tooltip" className="pl-badge-icon-tip">
        {label}
      </span>

      {open ? (
        <dialog
          ref={dialogRef}
          aria-labelledby={titleId}
          className="pl-badge-info-dialog"
          {...({ closedby: "any" } as React.DialogHTMLAttributes<HTMLDialogElement>)}
          onClose={() => setOpen(false)}
          onCancel={() => setOpen(false)}
          onPointerDown={(e) => {
            const dialog = dialogRef.current;
            if (!dialog) return;
            pressedOutsideRef.current = isPointerOutside(e, dialog);
          }}
          onPointerUp={(e) => {
            const dialog = dialogRef.current;
            if (!dialog) return;
            if (pressedOutsideRef.current && isPointerOutside(e, dialog)) {
              setOpen(false);
            }
            pressedOutsideRef.current = false;
          }}
        >
          <div className="pl-badge-info-body">
            <div className="pl-badge-info-head">
              <span className="pl-badge-info-family">{familyLabel}</span>
              <button
                type="button"
                className="pl-badge-info-close"
                aria-label="Cerrar explicación de insignia"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="pl-badge-info-hero">
              <span className="pl-badge-info-pedestal" aria-hidden="true">
                <img
                  src={`${iconBase}/64/insignias/${slug}.webp`}
                  width={52}
                  height={52}
                  alt=""
                  decoding="async"
                  draggable={false}
                  className="pl-maestro-icon pl-pack-icon"
                />
              </span>
              <div className="pl-badge-info-copy">
                <h2 id={titleId} className="pl-badge-info-title">
                  {label}
                </h2>
                <p className="pl-badge-info-criterion">{criterion}</p>
              </div>
            </div>
            <p className="pl-badge-info-note">{extendedNote}</p>
            <div className="pl-badge-info-foot">
              <button
                type="button"
                autoFocus
                className="pl-badge-info-ok"
                onClick={() => setOpen(false)}
              >
                Entendido
              </button>
            </div>
          </div>
        </dialog>
      ) : null}
    </span>
  );
}
