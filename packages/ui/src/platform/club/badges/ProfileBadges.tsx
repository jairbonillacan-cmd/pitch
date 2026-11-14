"use client";

import React from "react";
import {
  BADGE_FAMILY_LABELS,
  BADGE_RULES,
  type BadgeFamily,
  type BadgeState,
  type BadgeView,
} from "../../badges";

/** Glifo por familia: trazo simple, hereda el color del texto. */
export function BadgeGlyph({ family, size = 16 }: { family: BadgeFamily | string; size?: number }): React.JSX.Element {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
  };
  switch (family) {
    case "precision":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="3.5" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        </svg>
      );
    case "constancy":
      return (
        <svg {...common}>
          <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
          <path d="M3.5 10h17M8 3v4M16 3v4M8.5 15l2.2 2 4.8-4.5" />
        </svg>
      );
    case "community":
      return (
        <svg {...common}>
          <circle cx="9" cy="9" r="3.2" />
          <path d="M3.5 19c.8-3 3-4.6 5.5-4.6s4.7 1.6 5.5 4.6" />
          <circle cx="17" cy="8" r="2.5" />
          <path d="M16 13.6c2.2.1 3.8 1.5 4.5 4" />
        </svg>
      );
    case "origin":
      return (
        <svg {...common}>
          <path d="M12 3l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 15.4 7.2 17.9l.9-5.4L4.2 8.7l5.4-.8L12 3Z" />
        </svg>
      );
    case "seniority":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
          <path d="M8 6H4.5a3 3 0 0 0 3.5 4M16 6h3.5a3 3 0 0 1-3.5 4M12 13v4M8.5 20h7" />
        </svg>
      );
  }
}

/** Píldora corta junto al nombre (perfil y publicaciones). */
export function BadgeChip({
  badge,
  size = "md",
  className,
}: {
  badge: { family: string; label: string; criterion: string };
  size?: "sm" | "md";
  className?: string;
}): React.JSX.Element {
  return (
    <span className={`pl-badge-chip pl-badge-chip--${size}${className ? ` ${className}` : ""}`} title={badge.criterion}>
      <BadgeGlyph family={badge.family} size={size === "sm" ? 13 : 15} />
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

  if (!isOwn || !own) {
    if (publicBadges.length === 0) return null;
    return (
      <section className="pl-badges glass-lens glass-ring" aria-labelledby={titleId}>
        <header className="pl-badges-head">
          <h2 id={titleId} className="pl-badges-title">
            Insignias <span className="pl-badges-count num">{publicBadges.length}</span>
          </h2>
        </header>
        <ul className="pl-badges-grid">
          {publicBadges.map((b) => (
            <li key={b.id} className="pl-badge-tile">
              <BadgeTileBody badge={b} />
            </li>
          ))}
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
    <section className="pl-badges glass-lens glass-ring" aria-labelledby={titleId} aria-describedby={hintId}>
      <header className="pl-badges-head">
        <h2 id={titleId} className="pl-badges-title">
          Insignias <span className="pl-badges-count num">{earned.length}</span>
        </h2>
        <p id={hintId} className="pl-badges-hint">
          {own.canFeature
            ? `Destaca hasta ${BADGE_RULES.maxFeatured}: aparecen junto a tu nombre y la primera en tus publicaciones.`
            : "Con tu cuenta podrás destacar hasta 3 junto a tu nombre."}
        </p>
      </header>

      {earned.length > 0 ? (
        <ul className="pl-badges-grid">
          {earned.map((b) => {
            const isPublic = publicSet.has(b.id);
            const isFeatured = featuredSet.has(b.id);
            const blocked = !isFeatured && (full || !isPublic);
            return (
              <li key={b.id} className="pl-badge-tile" data-featured={isFeatured ? "true" : undefined}>
                <BadgeTileBody badge={b} />
                <div className="pl-badge-tile-foot">
                  {isPublic ? (
                    <span className="pl-badge-state">Pública</span>
                  ) : (
                    <a className="pl-badge-state pl-badge-state--private" href={privacyHref} onClick={onNavigate}>
                      Privada · cambiar en Privacidad
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
        <p className="pl-badges-empty">Todavía no ganas insignias. Abajo ves lo que falta para cada una.</p>
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
            {pending.map((b) => (
              <li key={b.id} className="pl-badge-tile pl-badge-tile--locked">
                <BadgeTileBody badge={b} />
                {b.progress ? (
                  <div className="pl-badge-progress">
                    <progress max={b.progress.target} value={b.progress.current} aria-label={`Avance de ${b.label}`} />
                    <span className="num">
                      {b.progress.current} de {b.progress.target}
                    </span>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {soon.length > 0 ? (
        <p className="pl-badges-note">
          Con tu cuenta también cuentan: {soon.map((b) => b.label).join(", ")}. Salen del ranking semanal y
          mensual y de tus votos de «¿Quién gana?».
        </p>
      ) : null}
      <p className="pl-badges-foot">Nunca damos insignias por apostar más, por entrar cada día ni con premios.</p>
    </section>
  );
}

function BadgeTileBody({ badge }: { badge: Pick<BadgeView, "family" | "label" | "criterion"> }): React.JSX.Element {
  return (
    <div className="pl-badge-tile-body">
      <span className="pl-badge-tile-icon">
        <BadgeGlyph family={badge.family} size={20} />
      </span>
      <span className="pl-badge-tile-copy">
        <span className="pl-badge-tile-label">{badge.label}</span>
        <span className="pl-badge-tile-family">{BADGE_FAMILY_LABELS[badge.family as BadgeFamily] ?? ""}</span>
        <span className="pl-badge-tile-criterion">{badge.criterion}</span>
      </span>
    </div>
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
