"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LeagueId } from "@pitchlab/contracts";
import { exampleLeaderboardRows, getExampleGameMeta } from "../community-examples";
import { usePlatform } from "../platform-provider";
import type { LeaderboardAnalyst } from "../profile-stats";
import type { JournalEntry, PlatformDataset, ViewerRole } from "../types";

/* ---------------------------------------------------------------------------
   Identidad propia
   ------------------------------------------------------------------------- */

export interface OwnIdentity {
  handle: string;
  name: string;
  avatarInitials: string;
  avatarGradVar: string;
}

/** Quién eres en Comunidad. Los socios publican como `socio_pl` en la beta. */
export function ownIdentityFor(role: ViewerRole): OwnIdentity | null {
  if (role === "visitor") return null;
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

/** Alias del menú de cuenta que también apuntan a tu perfil. */
export const OWN_PROFILE_ALIASES = ["jair", "jair_founder", "socio_pl"] as const;

/** Filas del leaderboard: perfiles de ejemplo + tu bitácora real. */
export function useLeaderboardRows(): {
  rows: LeaderboardAnalyst[];
  own: OwnIdentity | null;
  today: Date;
} {
  const { journal, viewerRole } = usePlatform();
  const today = useMemo(() => new Date(), []);
  const own = useMemo(() => ownIdentityFor(viewerRole), [viewerRole]);
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
  size = 40,
  className,
}: {
  initials: string;
  gradVar: string;
  size?: number;
  className?: string;
}): React.JSX.Element {
  return (
    <span
      className={["pl-avatar", className].filter(Boolean).join(" ")}
      style={{ width: size, height: size, background: gradVar, fontSize: Math.round(size * 0.34) }}
      aria-hidden="true"
    >
      {initials}
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
   Seguidos (en este navegador hasta que exista el servidor)
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

/**
 * A quién sigues. TODO(F4): guardar en el servidor; hoy vive en este navegador
 * y se comparte entre Comunidad y Perfil.
 */
export function useFollowing(): {
  following: readonly string[];
  isFollowing: (handle: string) => boolean;
  toggle: (handle: string) => boolean;
} {
  const [following, setFollowing] = useState<string[]>([]);
  useEffect(() => {
    setFollowing(readFollowing());
    const sync = (): void => setFollowing(readFollowing());
    window.addEventListener(FOLLOWING_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(FOLLOWING_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const toggle = useCallback((handle: string): boolean => {
    const current = readFollowing();
    const next = current.includes(handle) ? current.filter((h) => h !== handle) : [...current, handle];
    try {
      window.localStorage.setItem(FOLLOWING_KEY, JSON.stringify(next));
    } catch (err) {
      void err;
    }
    setFollowing(next);
    window.dispatchEvent(new Event(FOLLOWING_EVENT));
    return next.includes(handle);
  }, []);
  const isFollowing = useCallback((handle: string) => following.includes(handle), [following]);
  return { following, isFollowing, toggle };
}
