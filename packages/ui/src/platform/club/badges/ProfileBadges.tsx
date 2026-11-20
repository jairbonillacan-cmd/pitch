"use client";

import React from "react";
import { usePackIconBase } from "../../../pack-icon-theme";
import {
  BADGE_FAMILY_LABELS,
  BADGE_RULES,
  type BadgeFamily,
  type BadgeState,
  type BadgeView,
} from "../../badges";

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

function resolveBadgePackSlug(badgeId: string | undefined, family: BadgeFamily | string): string {
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

/** Glifo por insignia o familia del paquete oficial de iconos PitchLab. */
export function BadgeGlyph({
  family,
  badgeId,
  size = 16,
}: {
  family: BadgeFamily | string;
  badgeId?: string;
  size?: number;
}): React.JSX.Element {
  const slug = resolveBadgePackSlug(badgeId, family);
  const iconBase = usePackIconBase();
  return (
    <img
      src={`${iconBase}/32/insignias/${slug}.webp`}
      srcSet={`${iconBase}/32/insignias/${slug}.webp 1x, ${iconBase}/64/insignias/${slug}.webp 2x`}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      draggable={false}
      className="pl-maestro-icon inline-block shrink-0"
    />
  );
}

/** Píldora corta junto al nombre (perfil y publicaciones). */
export function BadgeChip({
  badge,
  size = "md",
  className,
}: {
  badge: { id?: string; family: string; label: string; criterion: string };
  size?: "sm" | "md";
  className?: string;
}): React.JSX.Element {
  return (
    <span className={`pl-badge-chip pl-badge-chip--${size}${className ? ` ${className}` : ""}`} title={badge.criterion}>
      <BadgeGlyph family={badge.family} badgeId={badge.id} size={size === "sm" ? 14 : 16} />
      <span>
        <span className="sr-only">Insignia: </span>
        {badge.label}
      </span>
    </span>
  );
}

/** Insignias destacadas junto al nombre del perfil. */
export function FeaturedBadgeRow({ badges }: { badges: readonly BadgeView[] }): React.JSX.Element | null {
  if (badges.length === 0) return null;
  return (
    <ul className="pl-badge-row" aria-label="Insignias destacadas">
      {badges.map((b) => (
        <li key={b.id}>
          <BadgeChip badge={b} />
        </li>
      ))}
    </ul>
  );
}

export interface OwnBadgesState {
  all: readonly BadgeState[];
  publicIds: readonly string[];
  featuredIds: readonly string[];
  /** false sin cuenta real (modo PIN o ejemplo): no se puede guardar la selección. */
  canFeature: boolean;
  saving: boolean;
}

/**
 * Sección «Insignias» del perfil.
 * - Visitante: solo las ganadas que el socio comparte.
 * - Propio: ganadas (con «Destacar», máximo 3) y las que faltan con su avance.
 */
export function ProfileBadgesSection({
  isOwn,
  publicBadges,
  own,
  onToggleFeatured,
  privacyHref = "/app/lab?tab=privacidad",
  onNavigate,
}: {
  isOwn: boolean;
  publicBadges: readonly BadgeView[];
  own?: OwnBadgesState | null;
  onToggleFeatured?: (id: string) => void;
  privacyHref?: string;
  onNavigate?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}): React.JSX.Element | null {
  const titleId = React.useId();
  const hintId = React.useId();
  const sectionScopeId = React.useId();
  const sectionRef = React.useRef<HTMLElement | null>(null);
  const [openTipId, setOpenTipId] = React.useState<string | null>(null);
  const [dismissedTipId, setDismissedTipId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenTipId(null);
        const hoveredOrFocused = sectionRef.current?.querySelector<HTMLElement>(
          ".pl-badge-tile:hover, .pl-badge-tile:focus-within",
        );
        const activeBadgeId = hoveredOrFocused?.dataset.badgeKey ?? null;
        if (activeBadgeId) {
          setDismissedTipId(activeBadgeId);
        }
      }
    };
    const handlePointerDown = (e: MouseEvent) => {
      if (!openTipId) return;
      const target = e.target as Node | null;
      if (target && sectionRef.current && !sectionRef.current.contains(target)) {
        setOpenTipId(null);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [openTipId]);

  const toggleBadgeTip = (id: string) => {
    setDismissedTipId(null);
    setOpenTipId((prev) => (prev === id ? null : id));
  };

  const clearDismissed = (id: string) => {
    setDismissedTipId((prev) => (prev === id ? null : prev));
  };

  if (!isOwn || !own) {
    if (publicBadges.length === 0) return null;
    return (
      <section ref={sectionRef} className="pl-badges glass-lens glass-ring" aria-labelledby={titleId}>
        <header className="pl-badges-head">
          <h2 id={titleId} className="pl-badges-title">
            Insignias <span className="pl-badges-count num">{publicBadges.length}</span>
          </h2>
        </header>
        <ul className="pl-badges-grid">
          {publicBadges.map((b) => {
            const tipId = `${sectionScopeId}-pub-${b.id}`;
            return (
              <li
                key={b.id}
                className="pl-badge-tile"
                data-badge-key={b.id}
                data-tip-open={openTipId === b.id ? "true" : undefined}
                data-dismissed={dismissedTipId === b.id ? "true" : undefined}
                onMouseLeave={() => clearDismissed(b.id)}
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                    clearDismissed(b.id);
                    if (openTipId === b.id) setOpenTipId(null);
                  }
                }}
              >
                <BadgeTileBody
                  badge={b}
                  tooltipId={tipId}
                  isTipOpen={openTipId === b.id}
                  onToggleTip={() => toggleBadgeTip(b.id)}
                />
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  const earned = own.all.filter((b) => b.earned);
  const pending = own.all.filter((b) => !b.earned && b.measured);
  const soon = own.all.filter((b) => !b.earned && !b.measured);
  const publicSet = new Set(own.publicIds);
  const featuredSet = new Set(own.featuredIds);
  const full = own.featuredIds.length >= BADGE_RULES.maxFeatured;

  return (
    <section
      ref={sectionRef}
      className="pl-badges glass-lens glass-ring"
      aria-labelledby={titleId}
      aria-describedby={hintId}
    >
      <header className="pl-badges-head">
        <h2 id={titleId} className="pl-badges-title">
          Insignias <span className="pl-badges-count num">{earned.length}</span>
        </h2>
        <p id={hintId} className="pl-badges-hint">
          {own.canFeature
            ? `Destaca hasta ${BADGE_RULES.maxFeatured}: aparecen junto a tu nombre y la primera en tus publicaciones.`
            : "Pasa el cursor o toca una insignia para consultar cómo se desbloquea."}
        </p>
      </header>

      {earned.length > 0 ? (
        <ul className="pl-badges-grid">
          {earned.map((b) => {
            const isPublic = publicSet.has(b.id);
            const isFeatured = featuredSet.has(b.id);
            const blocked = !isFeatured && (full || !isPublic);
            const tipId = `${sectionScopeId}-earned-${b.id}`;
            return (
              <li
                key={b.id}
                className="pl-badge-tile"
                data-badge-key={b.id}
                data-featured={isFeatured ? "true" : undefined}
                data-tip-open={openTipId === b.id ? "true" : undefined}
                data-dismissed={dismissedTipId === b.id ? "true" : undefined}
                onMouseLeave={() => clearDismissed(b.id)}
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                    clearDismissed(b.id);
                    if (openTipId === b.id) setOpenTipId(null);
                  }
                }}
              >
                <BadgeTileBody
                  badge={b}
                  tooltipId={tipId}
                  isTipOpen={openTipId === b.id}
                  onToggleTip={() => toggleBadgeTip(b.id)}
                />
                <div className="pl-badge-tile-foot">
                  {isPublic ? (
                    <span className="pl-badge-state">Pública</span>
                  ) : (
                    <a className="pl-badge-state pl-badge-state--private" href={privacyHref} onClick={onNavigate}>
                      Privada
                    </a>
                  )}
                  {own.canFeature ? (
                    <button
                      type="button"
                      className="pl-badge-feature"
                      aria-pressed={isFeatured}
                      aria-disabled={blocked || own.saving ? true : undefined}
                      aria-label={`${isFeatured ? "Quitar de destacadas" : "Destacar"}: ${b.label}`}
                      onClick={() => {
                        if (blocked || own.saving) return;
                        onToggleFeatured?.(b.id);
                      }}
                    >
                      {isFeatured ? "Destacada" : "Destacar"}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="pl-badges-empty">Todavía no tienes insignias desbloqueadas.</p>
      )}
      {own.canFeature && full ? (
        <p className="pl-badges-note" role="status">
          Ya tienes {BADGE_RULES.maxFeatured} destacadas. Quita una para elegir otra.
        </p>
      ) : null}

      {pending.length > 0 ? (
        <>
          <h3 className="pl-badges-subtitle">Por ganar</h3>
          <ul className="pl-badges-grid pl-badges-grid--pending">
            {pending.map((b) => {
              const tipId = `${sectionScopeId}-pending-${b.id}`;
              return (
                <li
                  key={b.id}
                  className="pl-badge-tile pl-badge-tile--locked"
                  data-badge-key={b.id}
                  data-tip-open={openTipId === b.id ? "true" : undefined}
                  data-dismissed={dismissedTipId === b.id ? "true" : undefined}
                  onMouseLeave={() => clearDismissed(b.id)}
                  onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                      clearDismissed(b.id);
                      if (openTipId === b.id) setOpenTipId(null);
                    }
                  }}
                >
                  <BadgeTileBody
                    badge={b}
                    tooltipId={tipId}
                    isTipOpen={openTipId === b.id}
                    progress={b.progress ?? null}
                    onToggleTip={() => toggleBadgeTip(b.id)}
                  />
                  {b.progress ? (
                    <div className="pl-badge-progress">
                      <progress max={b.progress.target} value={b.progress.current} aria-label={`Avance de ${b.label}`} />
                      <span className="num">
                        {b.progress.current}/{b.progress.target}
                      </span>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      {soon.length > 0 ? (
        <p className="pl-badges-note">
          Con tu cuenta también cuentan: {soon.map((b) => b.label).join(", ")}.
        </p>
      ) : null}
      <p className="pl-badges-foot">Nunca damos insignias por volumen de apuesta ni por rachas de conexión.</p>
    </section>
  );
}

function BadgeTileBody({
  badge,
  tooltipId,
  isTipOpen,
  progress,
  onToggleTip,
}: {
  badge: Pick<BadgeView, "family" | "label" | "criterion"> & { id?: string };
  tooltipId: string;
  isTipOpen: boolean;
  progress?: { current: number; target: number } | null;
  onToggleTip: () => void;
}): React.JSX.Element {
  const familyLabel = BADGE_FAMILY_LABELS[badge.family as BadgeFamily] ?? "";
  return (
    <>
      <button
        type="button"
        className="pl-badge-tile-trigger"
        aria-describedby={tooltipId}
        aria-expanded={isTipOpen}
        onClick={onToggleTip}
      >
        <span className="pl-badge-tile-icon">
          <BadgeGlyph family={badge.family} badgeId={badge.id} size={28} />
        </span>
        <span className="pl-badge-tile-copy">
          <span className="pl-badge-tile-label">{badge.label}</span>
          <span className="pl-badge-tile-family">{familyLabel}</span>
        </span>
      </button>
      <div id={tooltipId} role="tooltip" className="pl-badge-tooltip">
        <strong className="pl-badge-tooltip-title">{badge.label}</strong>
        <span className="pl-badge-tooltip-desc">{badge.criterion}</span>
        {progress ? (
          <span className="pl-badge-tooltip-meta num">
            Avance: {progress.current} de {progress.target}
          </span>
        ) : null}
      </div>
    </>
  );
}

/**
 * Tus insignias desde el servidor (`/api/me/badges`) y el guardado de destacadas.
 * Sin cuenta real (o si la API falla) se calculan con tu récord local, sin poder destacar.
 */
export function useOwnBadges({
  enabled,
  serverBacked,
  localBadges,
  onError,
}: {
  enabled: boolean;
  serverBacked: boolean;
  localBadges: readonly BadgeState[];
  onError: (message: string) => void;
}): { own: OwnBadgesState | null; featured: BadgeView[]; toggle: (id: string) => void } {
  const [server, setServer] = React.useState<{ all: BadgeState[]; publicIds: string[]; featuredIds: string[] } | null>(
    null,
  );
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!enabled || !serverBacked) return;
    let cancelled = false;
    void fetch("/api/me/badges", { credentials: "same-origin", cache: "no-store" })
      .then(async (res) => (res.ok ? ((await res.json().catch(() => null)) as Record<string, unknown> | null) : null))
      .then((data) => {
        if (cancelled || !data || !Array.isArray(data.badges)) return;
        setServer({
          all: data.badges as BadgeState[],
          publicIds: (data.publicIds as string[]) ?? [],
          featuredIds: (data.featuredIds as string[]) ?? [],
        });
      })
      .catch((err: unknown) => {
        void err;
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, serverBacked]);

  const toggle = React.useCallback(
    (id: string) => {
      if (!server || saving) return;
      const prev = server.featuredIds;
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(0, BADGE_RULES.maxFeatured);
      setServer({ ...server, featuredIds: next });
      setSaving(true);
      void fetch("/api/me/preferences", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ featuredBadges: next }),
      })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        })
        .catch((err: unknown) => {
          void err;
          setServer((s) => (s ? { ...s, featuredIds: prev } : s));
          onError("No se pudo guardar tu selección de insignias.");
        })
        .finally(() => setSaving(false));
    },
    [onError, saving, server],
  );

  if (!enabled) return { own: null, featured: [], toggle };
  if (server) {
    const byId = new Map(server.all.map((b) => [b.id, b]));
    const featured = server.featuredIds
      .map((fid) => byId.get(fid))
      .filter((b): b is BadgeState => Boolean(b))
      .map(({ id, family, label, criterion }) => ({ id, family, label, criterion }));
    return { own: { ...server, canFeature: true, saving }, featured, toggle };
  }
  return {
    own: {
      all: localBadges,
      publicIds: localBadges.filter((b) => b.earned).map((b) => b.id),
      featuredIds: [],
      canFeature: false,
      saving: false,
    },
    featured: [],
    toggle,
  };
}
