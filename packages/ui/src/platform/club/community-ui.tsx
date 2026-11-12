"use client";

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { LeagueId } from "@pitchlab/contracts";
import { exampleLeaderboardRows, getExampleAnalystSpec, getExampleGameMeta } from "../community-examples";
import { MaestroIcon } from "../components/MaestroPrimitives";
import { TopLayerModalDialog } from "../components/PlatformOverlays";
import { usePlatform, type ViewerIdentity } from "../platform-provider";
import type { LeaderboardAnalyst } from "../profile-stats";
import type { JournalEntry, PlatformDataset, SocialReportReason, ViewerRole } from "../types";

/* ---------------------------------------------------------------------------
   Identidad propia
   ------------------------------------------------------------------------- */

export interface OwnIdentity {
  handle: string;
  name: string;
  avatarInitials: string;
  avatarGradVar: string;
  avatarUrl?: string | null;
}

/**
 * Quién eres en Comunidad. Con cuenta, tu nombre y @usuario; con el PIN de la beta,
 * los socios publican como `socio_pl` y el tipstar simulado como `sofia_nfl`.
 */
export function ownIdentityFor(
  role: ViewerRole,
  identity: ViewerIdentity | null = null,
): OwnIdentity | null {
  if (role === "visitor") return null;
  if (identity) {
    return {
      handle: identity.handle,
      name: identity.displayName,
      avatarInitials: identity.initials,
      avatarGradVar: "var(--avatar-grad-4)",
      avatarUrl: identity.avatarUrl ?? null,
    };
  }
  if (role === "tipstar") {
    return {
      handle: "sofia_nfl",
      name: "Sofía Méndez",
      avatarInitials: "SM",
      avatarGradVar: "var(--avatar-grad-1)",
    };
  }
  return {
    handle: "socio_pl",
    name: "Socio PitchLab",
    avatarInitials: "SP",
    avatarGradVar: "var(--avatar-grad-4)",
  };
}

/** Alias de la beta con PIN que también apuntan a tu perfil (con cuenta no hay alias). */
export const OWN_PROFILE_ALIASES = ["jair", "jair_founder", "socio_pl"] as const;

/** ¿Este @usuario de la URL es tu perfil? */
export function isOwnProfileHandle(handle: string, own: OwnIdentity | null, hasAccount: boolean): boolean {
  if (!own) return false;
  if (handle === own.handle) return true;
  return !hasAccount && (OWN_PROFILE_ALIASES as readonly string[]).includes(handle);
}

/** Filas del leaderboard: perfiles de ejemplo + tu bitácora real. */
export function useLeaderboardRows(): {
  rows: LeaderboardAnalyst[];
  own: OwnIdentity | null;
  today: Date;
} {
  const { journal, viewerRole, viewerIdentity } = usePlatform();
  const today = useMemo(() => new Date(), []);
  const own = useMemo(() => ownIdentityFor(viewerRole, viewerIdentity), [viewerRole, viewerIdentity]);
  const rows = useMemo(() => {
    const examples = exampleLeaderboardRows(today);
    if (!own || examples.some((r) => r.handle === own.handle)) return examples;
    return [
      ...examples,
      {
        handle: own.handle,
        name: own.name,
        roleLabel: "Socio" as const,
        specialty: "Varias ligas",
        avatarInitials: own.avatarInitials,
        avatarGradVar: own.avatarGradVar,
        isTipstar: false,
        isVerified: false,
        isExample: false,
        journal,
      },
    ];
  }, [journal, own, today]);
  return { rows, own, today };
}

/* ---------------------------------------------------------------------------
   Partido de un pick
   ------------------------------------------------------------------------- */

export interface EntryGameMeta {
  league: LeagueId;
  leagueLabel: string;
  home: { slug: string; name: string };
  away: { slug: string; name: string };
  score?: { home: number; away: number };
  kickoffIso?: string;
}

export function resolveEntryGame(
  gameId: string,
  dataset: PlatformDataset,
): EntryGameMeta | null {
  const example = getExampleGameMeta(gameId);
  if (example) return example;
  const game = dataset.games.find((g) => g.id === gameId);
  if (!game) return null;
  return {
    league: game.league,
    leagueLabel: game.leagueLabel,
    home: { slug: game.home.slug, name: game.home.shortName || game.home.name },
    away: { slug: game.away.slug, name: game.away.shortName || game.away.name },
    score: game.status === "FT" ? game.score : undefined,
    kickoffIso: game.kickoffUtc,
  };
}

/** «registrado 2 días antes» / «registrado 5 horas antes». */
export function registeredBeforeLabel(entry: JournalEntry, kickoffIso?: string): string | null {
  if (!entry.sealedAtIso || !kickoffIso) return null;
  const diffMs = new Date(kickoffIso).getTime() - new Date(entry.sealedAtIso).getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return null;
  const hours = Math.round(diffMs / 3_600_000);
  if (hours < 1) return "registrado minutos antes";
  if (hours < 24) return `registrado ${hours} ${hours === 1 ? "hora" : "horas"} antes`;
  const days = Math.round(hours / 24);
  return `registrado ${days} ${days === 1 ? "día" : "días"} antes`;
}

const SHORT_DATE = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" });

export function shortDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : SHORT_DATE.format(d).replace(".", "");
}

/** «hace 18 min», «hace 3 h», «ayer», «8 nov». */
export function relativeTime(iso: string | undefined, now: Date = new Date()): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const mins = Math.round((now.getTime() - d.getTime()) / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  if (hours < 48) return "ayer";
  return shortDate(iso);
}

/* ---------------------------------------------------------------------------
   Piezas visuales
   ------------------------------------------------------------------------- */

export function Avatar({
  initials,
  gradVar,
  avatarUrl,
  size = 40,
  loading,
  fetchPriority,
  className,
}: {
  initials: string;
  gradVar: string;
  avatarUrl?: string | null;
  size?: number;
  loading?: "lazy" | "eager";
  fetchPriority?: "high" | "low" | "auto";
  className?: string;
}): React.JSX.Element {
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const showImage = Boolean(avatarUrl && brokenUrl !== avatarUrl);
  return (
    <span
      className={["pl-avatar", className].filter(Boolean).join(" ")}
      style={{ width: size, height: size, background: gradVar, fontSize: Math.round(size * 0.34) }}
      aria-hidden="true"
    >
      {showImage ? (
        <img
          src={avatarUrl!}
          alt=""
          width={size}
          height={size}
          loading={loading}
          fetchPriority={fetchPriority}
          decoding="async"
          className="pl-avatar-img"
          onError={() => setBrokenUrl(avatarUrl ?? null)}
        />
      ) : (
        initials
      )}
    </span>
  );
}

export type PickOutcome = "open" | "won" | "lost";

export function outcomeOf(status: JournalEntry["status"] | PickOutcome): PickOutcome {
  if (status === "pending" || status === "open") return "open";
  return status;
}

/** Estado del pick, siempre con texto. */
export function PickStatus({
  status,
  detail,
  className,
}: {
  status: PickOutcome;
  detail?: string;
  className?: string;
}): React.JSX.Element {
  const label = status === "won" ? "Cumplido" : status === "lost" ? "No se cumplió" : "Abierto";
  return (
    <span className={["pl-pick-status", `pl-pick-status--${status}`, className].filter(Boolean).join(" ")}>
      {label}
      {detail ? <span className="num"> · {detail}</span> : null}
    </span>
  );
}

export function HeartIcon({ filled = false, size = 16 }: { filled?: boolean; size?: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 0 0 0-7.8z" />
    </svg>
  );
}

export function CommentIcon({ size = 16 }: { size?: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
    </svg>
  );
}

export function ShareIcon({ size = 18 }: { size?: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13" />
    </svg>
  );
}

export function ChevronRightIcon({ size = 18 }: { size?: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

export function GiftIcon({ size = 20 }: { size?: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="3" y="8" width="18" height="13" rx="2" />
      <path d="M12 8v13M3 12h18M12 8c-2-3-6-3-6 0 0 1.5 2 2 6 0zM12 8c2-3 6-3 6 0 0 1.5-2 2-6 0z" />
    </svg>
  );
}

/** Comparte una URL con la hoja nativa o la copia al portapapeles. */
export async function shareUrl(
  url: string,
  title: string,
  onCopied: () => void,
  onError: () => void,
): Promise<void> {
  const absolute = typeof window !== "undefined" ? new URL(url, window.location.origin).toString() : url;
  try {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      await navigator.share({ title, url: absolute });
      return;
    }
    await navigator.clipboard.writeText(absolute);
    onCopied();
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return;
    onError();
  }
}

/* ---------------------------------------------------------------------------
   Pestañas subrayadas (WAI-ARIA) con la activa en ?tab=
   ------------------------------------------------------------------------- */

export interface TabDef<K extends string> {
  key: K;
  label: string;
  shortLabel?: string;
}

/** Lee y escribe la pestaña activa en `?tab=` sin recargar. */
export function useUrlTab<K extends string>(
  keys: readonly K[],
  fallback: K,
): [K, (next: K) => void] {
  const [tab, setTabState] = useState<K>(fallback);
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("tab");
    if (param && (keys as readonly string[]).includes(param)) setTabState(param as K);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setTab = useCallback(
    (next: K) => {
      setTabState(next);
      const url = new URL(window.location.href);
      if (next === fallback) url.searchParams.delete("tab");
      else url.searchParams.set("tab", next);
      window.history.replaceState(window.history.state, "", url.toString());
    },
    [fallback],
  );
  return [tab, setTab];
}

export function UnderlineTabs<K extends string>({
  tabs,
  active,
  onChange,
  label,
  idPrefix,
  className,
}: {
  tabs: readonly TabDef<K>[];
  active: K;
  onChange: (key: K) => void;
  label: string;
  idPrefix: string;
  className?: string;
}): React.JSX.Element {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number): void => {
    let next = -1;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    if (next < 0) return;
    event.preventDefault();
    onChange(tabs[next]!.key);
    refs.current[next]?.focus();
  };
  return (
    <div className={["pl-utabs", className].filter(Boolean).join(" ")} role="tablist" aria-label={label}>
      {tabs.map((t, i) => {
        const selected = t.key === active;
        return (
          <button
            key={t.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={`${idPrefix}-tab-${t.key}`}
            type="button"
            role="tab"
            className="pl-utab"
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${t.key}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.key)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {t.shortLabel ? (
              <>
                <span className="pl-utab-long">{t.label}</span>
                <span className="pl-utab-short" aria-hidden="true">
                  {t.shortLabel}
                </span>
              </>
            ) : (
              t.label
            )}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel<K extends string>({
  tabKey,
  idPrefix,
  children,
  className,
}: {
  tabKey: K;
  idPrefix: string;
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <div
      key={tabKey}
      id={`${idPrefix}-panel-${tabKey}`}
      role="tabpanel"
      aria-labelledby={`${idPrefix}-tab-${tabKey}`}
      tabIndex={0}
      className={["pl-tabpanel pl-auth-fade", className].filter(Boolean).join(" ")}
    >
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Seguidos
   - Socios reales: en el servidor (`/api/social/follows`), los ve en cualquier dispositivo.
   - Perfiles de ejemplo, o sin cuenta (PIN de beta): en este navegador.
   ------------------------------------------------------------------------- */

const FOLLOWING_KEY = "pitchlab.community.following";
const FOLLOWING_EVENT = "pitchlab:following";

function readFollowing(): string[] {
  try {
    const raw = window.localStorage.getItem(FOLLOWING_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((h): h is string => typeof h === "string") : [];
  } catch (err) {
    void err;
    return [];
  }
}

function writeFollowing(next: readonly string[]): void {
  try {
    window.localStorage.setItem(FOLLOWING_KEY, JSON.stringify(next));
  } catch (err) {
    void err;
  }
}

/** Seguidos en el servidor, compartidos entre Comunidad y Perfil. null = sin servidor. */
let serverFollowing: string[] | null = null;
let serverFollowingRequest: Promise<void> | null = null;
/** De quién es el caché: si cambia la cuenta en la misma pestaña, se vuelve a pedir. */
let serverFollowingOwner: string | null = null;

function loadServerFollowing(owner: string): Promise<void> {
  if (serverFollowingOwner !== owner) {
    serverFollowingOwner = owner;
    serverFollowing = null;
    serverFollowingRequest = null;
  }
  serverFollowingRequest ??= (async () => {
    try {
      const res = await fetch("/api/social/follows", { credentials: "same-origin" });
      const data = res.ok ? ((await res.json()) as { handles?: unknown }) : null;
      if (Array.isArray(data?.handles)) {
        serverFollowing = data.handles.filter((h): h is string => typeof h === "string");
        window.dispatchEvent(new Event(FOLLOWING_EVENT));
      }
    } catch (err) {
      void err;
    }
  })();
  return serverFollowingRequest;
}

function currentFollowing(): string[] {
  const local = readFollowing();
  if (!serverFollowing) return local;
  // Con servidor, del navegador solo cuentan los perfiles de ejemplo.
  const examples = local.filter((h) => getExampleAnalystSpec(h));
  return [...new Set([...serverFollowing, ...examples])];
}

export function useFollowing(): {
  following: readonly string[];
  isFollowing: (handle: string) => boolean;
  toggle: (handle: string) => boolean;
} {
  const { accountsEnabled, viewerIdentity, pushToast } = usePlatform();
  const owner = viewerIdentity?.handle ?? null;
  const [following, setFollowing] = useState<string[]>([]);
  useEffect(() => {
    const sync = (): void => setFollowing(currentFollowing());
    sync();
    if (accountsEnabled && owner) void loadServerFollowing(owner);
    window.addEventListener(FOLLOWING_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(FOLLOWING_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [accountsEnabled, owner]);
  const toggle = useCallback(
    (handle: string): boolean => {
      const willFollow = !currentFollowing().includes(handle);
      if (serverFollowing && !getExampleAnalystSpec(handle)) {
        const before = serverFollowing;
        serverFollowing = willFollow ? [...before, handle] : before.filter((h) => h !== handle);
        window.dispatchEvent(new Event(FOLLOWING_EVENT));
        void (async () => {
          try {
            const res = await fetch("/api/social/follows", {
              method: "POST",
              credentials: "same-origin",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ handle, follow: willFollow }),
            });
            if (!res.ok) throw new Error(String(res.status));
          } catch (err) {
            void err;
            serverFollowing = before;
            window.dispatchEvent(new Event(FOLLOWING_EVENT));
            pushToast("No pudimos guardar a quién sigues. Inténtalo de nuevo.", "danger");
          }
        })();
        return willFollow;
      }
      const local = readFollowing();
      writeFollowing(willFollow ? [...local, handle] : local.filter((h) => h !== handle));
      window.dispatchEvent(new Event(FOLLOWING_EVENT));
      return willFollow;
    },
    [pushToast],
  );
  const isFollowing = useCallback((handle: string) => following.includes(handle), [following]);
  return { following, isFollowing, toggle };
}

/* ---------------------------------------------------------------------------
   Menú y diálogo de reporte (publicaciones y comentarios ajenos)
   ------------------------------------------------------------------------- */

export const SOCIAL_REPORT_REASON_OPTIONS: ReadonlyArray<{
  value: SocialReportReason;
  label: string;
}> = [
  { value: "spam_enlaces", label: "Spam o enlaces" },
  { value: "ofensivo", label: "Ofensivo" },
  { value: "apuesta_riesgosa", label: "Apuesta riesgosa o promesa de ganancias" },
  { value: "otro", label: "Otro" },
];

export interface SocialReportTarget {
  kind: "post" | "comment";
  postId?: string;
  commentId?: string;
  authorHandle: string;
}

export function SocialReportMenu({
  triggerLabel,
  onReport,
  compact = false,
}: {
  triggerLabel: string;
  onReport: () => void;
  compact?: boolean;
}): React.JSX.Element {
  const rawId = useId();
  const menuId = `pl-com-menu-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const openingDialogRef = useRef(false);

  useEffect(() => {
    const menuEl = menuRef.current;
    const triggerEl = triggerRef.current;
    if (!menuEl || !triggerEl || typeof menuEl.showPopover !== "function") return;

    const hasFocusGroup = typeof HTMLElement !== "undefined" && "focusGroup" in HTMLElement.prototype;
    const hasAnchor = typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("position-area", "block-end");

    const getItems = (): HTMLButtonElement[] =>
      [...menuEl.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];

    if (!hasFocusGroup) {
      menuEl.setAttribute("role", "menu");
      getItems().forEach((item, idx) => {
        item.setAttribute("role", "menuitem");
        item.tabIndex = idx === 0 ? 0 : -1;
      });
    }

    const onToggle = (): void => {
      const isOpen = menuEl.matches(":popover-open");
      setOpen(isOpen);
      if (isOpen) {
        if (!hasAnchor) {
          const rect = triggerEl.getBoundingClientRect();
          const menuRect = menuEl.getBoundingClientRect();
          const pad = 8;
          const left = Math.min(
            Math.max(pad, rect.right - menuRect.width),
            Math.max(pad, window.innerWidth - menuRect.width - pad),
          );
          const below = rect.bottom + 6 + menuRect.height <= window.innerHeight - pad;
          const top = below ? rect.bottom + 6 : Math.max(pad, rect.top - menuRect.height - 6);
          menuEl.style.position = "fixed";
          menuEl.style.margin = "0";
          menuEl.style.inset = "auto";
          menuEl.style.left = `${left}px`;
          menuEl.style.top = `${top}px`;
        }
        const items = getItems();
        if (!hasFocusGroup) {
          items.forEach((item, idx) => {
            item.tabIndex = idx === 0 ? 0 : -1;
          });
        }
        items[0]?.focus();
      } else {
        if (!openingDialogRef.current && menuEl.contains(document.activeElement)) {
          triggerEl.focus();
        }
        openingDialogRef.current = false;
      }
    };

    const onKeyDown = (e: KeyboardEvent): void => {
      if (hasFocusGroup) return;
      const items = getItems();
      if (items.length === 0) return;
      const idx = items.indexOf(document.activeElement as HTMLButtonElement);
      let next = -1;
      if (e.key === "ArrowDown") next = (idx + 1) % items.length;
      else if (e.key === "ArrowUp") next = (idx - 1 + items.length) % items.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = items.length - 1;
      if (next < 0) return;
      e.preventDefault();
      items.forEach((el, j) => {
        el.tabIndex = j === next ? 0 : -1;
      });
      items[next]?.focus();
    };

    menuEl.addEventListener("toggle", onToggle);
    menuEl.addEventListener("keydown", onKeyDown);
    return () => {
      menuEl.removeEventListener("toggle", onToggle);
      menuEl.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <span className="pl-com-more-wrap">
      <button
        ref={triggerRef}
        type="button"
        popoverTarget={menuId}
        className={`pl-com-more-btn ${compact ? "pl-com-more-btn--sm" : ""}`}
        aria-expanded={open}
        aria-label={triggerLabel}
        onClick={() => {
          if (typeof menuRef.current?.showPopover !== "function") {
            setOpen((v) => !v);
          }
        }}
      >
        <MaestroIcon name="dots" size={compact ? 14 : 16} />
      </button>
      <div
        ref={menuRef}
        id={menuId}
        popover="auto"
        data-fallback-open={open ? "true" : undefined}
        className="pl-com-menu glass-lens glass-ring"
        {...({ focusgroup: "menu nomemory" } as React.HTMLAttributes<HTMLDivElement>)}
      >
        <button
          type="button"
          className="pl-com-menu-item"
          onClick={() => {
            openingDialogRef.current = true;
            if (typeof menuRef.current?.hidePopover === "function" && menuRef.current.matches(":popover-open")) {
              menuRef.current.hidePopover();
            } else {
              setOpen(false);
            }
            onReport();
          }}
        >
          <MaestroIcon name="flag" size={14} />
          <span>Reportar</span>
        </button>
      </div>
    </span>
  );
}

export function SocialReportDialog({
  target,
  onClose,
}: {
  target: SocialReportTarget | null;
  onClose: () => void;
}): React.JSX.Element | null {
  const uid = useId();
  const { reportSocialContent } = usePlatform();
  const [reason, setReason] = useState<SocialReportReason>("spam_enlaces");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (target) {
      setReason("spam_enlaces");
      setSubmitting(false);
      setError("");
    }
  }, [target]);

  if (!target) return null;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");
    const res = await reportSocialContent({
      postId: target.postId,
      commentId: target.commentId,
      reason,
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error ?? "No se pudo enviar el reporte.");
      return;
    }
    onClose();
  };

  return (
    <TopLayerModalDialog open onClose={onClose} ariaLabelledBy={`${uid}-title`} maxWidth="26rem">
      <form className="pl-com-report-dialog glass-lens glass-ring" onSubmit={handleSubmit} noValidate>
        <div className="pl-com-sheet-head">
          <h2 id={`${uid}-title`} className="pl-com-sheet-title">
            {target.kind === "post" ? "Reportar publicación" : "Reportar comentario"}
          </h2>
          <button type="button" className="pl-com-icon-btn" aria-label="Cerrar" onClick={onClose}>
            <MaestroIcon name="x" size={16} />
          </button>
        </div>
        <p className="pl-com-report-sub">
          De <strong>@{target.authorHandle}</strong>. Tu reporte es confidencial y ayuda a mantener Comunidad limpia.
        </p>
        <fieldset className="pl-com-report-fieldset">
          <legend className="pl-com-report-legend">Motivo del reporte</legend>
          <div className="pl-com-report-options">
            {SOCIAL_REPORT_REASON_OPTIONS.map((opt) => (
              <label key={opt.value} className="pl-com-report-option">
                <input
                  type="radio"
                  name={`${uid}-reason`}
                  value={opt.value}
                  checked={reason === opt.value}
                  onChange={() => {
                    setReason(opt.value);
                    if (error) setError("");
                  }}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div aria-live="polite" className="pl-com-error-slot">
          {error ? (
            <p className="pl-com-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className="pl-com-report-actions">
          <button type="button" className="pl-prof-btn pl-prof-btn--ghost pl-prof-btn--sm" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            className="pl-prof-btn pl-prof-btn--primary pl-prof-btn--sm"
            disabled={submitting}
          >
            {submitting ? "Enviando…" : "Enviar reporte"}
          </button>
        </div>
      </form>
    </TopLayerModalDialog>
  );
}
