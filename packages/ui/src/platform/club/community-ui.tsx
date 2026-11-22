"use client";

import React, { useCallback, useId, useMemo, useRef, useState } from "react";
import { LEAGUE_CATALOG, type LeagueId } from "@pitchlab/contracts";
import { Button, SofascoreCard } from "../../components/ui/primitives";
import {
  exampleLeaderboardRows,
  getExampleAnalystSpec,
  getExampleGameMeta,
  OWN_PROFILE_ALIASES,
} from "../community-examples";
import { MaestroIcon } from "../components/MaestroPrimitives";
import { TopLayerModalDialog } from "../components/PlatformOverlays";
import { ProgressiveImage } from "../components/ProgressiveImage";
import { useAbortableJson, useSafeEffect } from "../hooks";
import {
  type ViewerIdentity,
  useJournalEntries,
  useOptionalPlatformCore,
  usePlatformActions,
  usePlatformCore,
} from "../platform-provider";
import type { LeaderboardAnalyst } from "../profile-stats";
import type { PublicRecordPayload } from "../record-stats";
import type {
  JournalEntry,
  PlatformDataset,
  SocialPost,
  SocialReportReason,
  ViewerRole,
} from "../types";

export interface OwnIdentity {
  handle: string;
  name: string;
  avatarInitials: string;
  avatarGradVar: string;
  avatarUrl?: string | null;
}

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
  if (role === "tipster") {
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

export { OWN_PROFILE_ALIASES };

export function isOwnProfileHandle(
  handle: string,
  own: OwnIdentity | null,
  hasAccount: boolean,
): boolean {
  if (!own) return false;
  if (handle === own.handle) return true;
  return !hasAccount && (OWN_PROFILE_ALIASES as readonly string[]).includes(handle);
}

export interface ServerRankingRow {
  handle: string;
  name: string;
  avatarUrl: string | null;
  isTipster: boolean;
  windows: NonNullable<LeaderboardAnalyst["windows"]>;
}

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((w) => w[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "PL"
  );
}

export function rowsFromServer(rows: readonly ServerRankingRow[]): LeaderboardAnalyst[] {
  return rows.map((r) => ({
    handle: r.handle,
    name: r.name,
    roleLabel: r.isTipster ? "Tipster" : "Socio",
    specialty: "Socio verificado",
    avatarInitials: initialsOf(r.name),
    avatarGradVar: r.isTipster ? "var(--avatar-grad-1)" : "var(--avatar-grad-4)",
    avatarUrl: r.avatarUrl,
    isTipster: r.isTipster,
    isVerified: r.isTipster,
    isExample: false,
    journal: [],
    windows: r.windows,
  }));
}

export function useLeaderboardRows(): {
  rows: LeaderboardAnalyst[];
  own: OwnIdentity | null;
  today: Date;
  source: "server" | "examples";
  ownJournal: readonly JournalEntry[];
} {
  const { viewerRole, viewerIdentity, hasAccountSessionAuth } = usePlatformCore();
  const journal = useJournalEntries();
  const today = useMemo(() => new Date(), []);
  const own = useMemo(() => ownIdentityFor(viewerRole, viewerIdentity), [viewerRole, viewerIdentity]);

  const rankingQuery = useAbortableJson<{ rows?: ServerRankingRow[] }>(
    "/api/social/ranking",
    { enabled: hasAccountSessionAuth },
  );

  const serverRows = Array.isArray(rankingQuery.data?.rows) ? rankingQuery.data.rows : null;
  const fromServer = useMemo(() => (serverRows ? rowsFromServer(serverRows) : null), [serverRows]);
  const rows = useMemo(() => {
    if (fromServer && fromServer.length > 0) return fromServer;
    const examples = exampleLeaderboardRows(today);
    if (!own || fromServer || examples.some((r) => r.handle === own.handle)) return examples;
    return [
      ...examples,
      {
        handle: own.handle,
        name: own.name,
        roleLabel: "Socio" as const,
        specialty: "Varias ligas",
        avatarInitials: own.avatarInitials,
        avatarGradVar: own.avatarGradVar,
        isTipster: false,
        isVerified: false,
        isExample: false,
        journal,
      },
    ];
  }, [fromServer, journal, own, today]);
  const source = fromServer && fromServer.length > 0 ? "server" : "examples";
  return { rows, own, today, source, ownJournal: journal };
}

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
      style={{
        width: size,
        height: size,
        background: gradVar,
        fontSize: Math.round(size * 0.34),
      }}
      aria-hidden="true"
    >
      {showImage ? (
        <ProgressiveImage
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

export type PickOutcome = "open" | "won" | "lost" | "void";

export function outcomeOf(status: JournalEntry["status"] | PickOutcome): PickOutcome {
  if (status === "pending" || status === "open") return "open";
  return status;
}

export function PickStatus({
  status,
  detail,
  className,
}: {
  status: PickOutcome;
  detail?: string;
  className?: string;
}): React.JSX.Element {
  const label =
    status === "won"
      ? "Cumplido"
      : status === "lost"
        ? "No se cumplió"
        : status === "void"
          ? "Nulo"
          : "Abierto";
  return (
    <span
      className={["pl-pick-status", `pl-pick-status--${status}`, className]
        .filter(Boolean)
        .join(" ")}
    >
      {label}
      {detail ? <span className="num"> · {detail}</span> : null}
    </span>
  );
}

export function HeartIcon({
  filled = false,
  size = 16,
}: {
  filled?: boolean;
  size?: number;
}): React.JSX.Element {
  return (
    <MaestroIcon
      name="heart"
      size={size}
      className={filled ? "pl-heart-filled" : undefined}
    />
  );
}

export function CommentIcon({ size = 16 }: { size?: number }): React.JSX.Element {
  return <MaestroIcon name="message" size={size} />;
}

export function ShareIcon({ size = 18 }: { size?: number }): React.JSX.Element {
  return <MaestroIcon name="share" size={size} />;
}

export function ChevronRightIcon({ size = 18 }: { size?: number }): React.JSX.Element {
  return <MaestroIcon name="chevronRight" size={size} />;
}

export function GiftIcon({ size = 20 }: { size?: number }): React.JSX.Element {
  return <MaestroIcon name="gift" size={size} />;
}

export async function shareUrl(
  url: string,
  title: string,
  onCopied: () => void,
  onError: () => void,
): Promise<void> {
  const absolute =
    typeof window !== "undefined" ? new URL(url, window.location.origin).toString() : url;
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

const SHA256_K: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
  0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
  0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
  0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
  0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
  0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
];

function rotr32(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

function encodeUtf8Bytes(input: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i += 1) {
    let code = input.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      if (i + 1 < input.length) {
        const low = input.charCodeAt(i + 1);
        if (low >= 0xdc00 && low <= 0xdfff) {
          code = ((code - 0xd800) << 10) + (low - 0xdc00) + 0x10000;
          i += 1;
        } else {
          code = 0xfffd;
        }
      } else {
        code = 0xfffd;
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      code = 0xfffd;
    }
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return bytes;
}

export function computeSha256Hex(message: string): string {
  const bytes = encodeUtf8Bytes(message);
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) {
    bytes.push(0);
  }
  const highBits = Math.floor(bitLen / 0x100000000);
  const lowBits = bitLen >>> 0;
  bytes.push(
    (highBits >>> 24) & 0xff,
    (highBits >>> 16) & 0xff,
    (highBits >>> 8) & 0xff,
    highBits & 0xff,
    (lowBits >>> 24) & 0xff,
    (lowBits >>> 16) & 0xff,
    (lowBits >>> 8) & 0xff,
    lowBits & 0xff,
  );

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Array<number>(64).fill(0);
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      const idx = offset + i * 4;
      w[i] =
        (((bytes[idx] ?? 0) << 24) |
          ((bytes[idx + 1] ?? 0) << 16) |
          ((bytes[idx + 2] ?? 0) << 8) |
          (bytes[idx + 3] ?? 0)) >>>
        0;
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr32(w[i - 15]!, 7) ^ rotr32(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 = rotr32(w[i - 2]!, 17) ^ rotr32(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i]! + w[i]!) >>> 0;
      const S0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((word) => word.toString(16).padStart(8, "0"))
    .join("");
}

export type ProfileReceiptPayloadObject = Readonly<Record<string, string | number>>;

export interface ProfileReceiptSummary {
  readonly payload: ProfileReceiptPayloadObject | null;
  readonly settled: number;
  readonly isPrivate: boolean;
}

export interface LocalProfileReceiptMetrics {
  readonly settled: number;
  readonly won: number;
  readonly netUnits: number;
  readonly avgClvPct: number | null;
}

const MAX_RECEIPT_CANONICAL_DEPTH = 32;

function isReceiptPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalizeReceiptNode(value: unknown, depth: number): unknown {
  if (depth > MAX_RECEIPT_CANONICAL_DEPTH) {
    throw new Error("RECEIPT_DEPTH_EXCEEDED");
  }
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeReceiptNode(item, depth + 1));
  }
  if (isReceiptPlainRecord(value)) {
    const sortedKeys = Object.keys(value).sort();
    const out: Record<string, unknown> = Object.create(null);
    for (const key of sortedKeys) {
      if (key === "__proto__" || !Object.prototype.hasOwnProperty.call(value, key)) {
        continue;
      }
      const entry = value[key];
      if (entry !== undefined) {
        Object.defineProperty(out, key, {
          value: canonicalizeReceiptNode(entry, depth + 1),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
    }
    return out;
  }
  return value;
}

export function sortReceiptPayloadKeys(
  record: Readonly<Record<string, string | number>>,
): ProfileReceiptPayloadObject;
export function sortReceiptPayloadKeys(
  record: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>>;
export function sortReceiptPayloadKeys(
  record: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const result = canonicalizeReceiptNode(record, 0);
  const empty: Record<string, unknown> = Object.create(null);
  return isReceiptPlainRecord(result) ? result : empty;
}

export function buildPublicProfileReceipt(
  handle: string,
  publicRecord: PublicRecordPayload | null | undefined,
): ProfileReceiptSummary {
  if (!publicRecord) return { payload: null, settled: 0, isPrivate: false };
  if (publicRecord.hidden) return { payload: null, settled: 0, isPrivate: true };
  if (publicRecord.settled <= 0) return { payload: null, settled: 0, isPrivate: false };
  const raw: Record<string, string | number> = {
    version: "pitchlab-profile-receipt-v1",
    handle,
    settled: publicRecord.settled,
  };
  const view = publicRecord.view;
  if (view.wonLost) {
    raw.won = view.wonLost.won;
    raw.lost = view.wonLost.lost;
  }
  if (view.hitRatePct !== null) raw.hitRatePct = view.hitRatePct.toFixed(1);
  if (view.yieldPct !== null) raw.yieldPct = view.yieldPct.toFixed(1);
  if (view.avgClvPct !== null) raw.avgClvPct = view.avgClvPct.toFixed(1);
  if (view.netUnits !== null) raw.netUnits = view.netUnits.toFixed(2);
  return {
    payload: sortReceiptPayloadKeys(raw),
    settled: publicRecord.settled,
    isPrivate: false,
  };
}

export function buildLocalProfileReceipt(
  handle: string,
  record: LocalProfileReceiptMetrics,
): ProfileReceiptSummary {
  if (record.settled <= 0) return { payload: null, settled: 0, isPrivate: false };
  const raw: Record<string, string | number> = {
    version: "pitchlab-profile-receipt-v1",
    handle,
    settled: record.settled,
    won: record.won,
    lost: Math.max(0, record.settled - record.won),
    netUnits: record.netUnits.toFixed(2),
  };
  if (record.avgClvPct !== null) raw.avgClvPct = record.avgClvPct.toFixed(1);
  return {
    payload: sortReceiptPayloadKeys(raw),
    settled: record.settled,
    isPrivate: false,
  };
}

export interface ProfileVerificationReceiptProps {
  readonly handle: string;
  readonly receiptPayload: ProfileReceiptPayloadObject | null;
  readonly settledCount: number;
  readonly isPrivate?: boolean;
  readonly onNavigate?: (href: string) => void;
  readonly onNotify?: (message: string, tone?: "default" | "success" | "warning") => void;
}

export function ProfileVerificationReceipt({
  handle,
  receiptPayload,
  settledCount,
  isPrivate = false,
  onNavigate,
  onNotify,
}: ProfileVerificationReceiptProps): React.JSX.Element {
  const [copied, setCopied] = useState(false);

  useSafeEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const sortedPayload = useMemo(
    () => (receiptPayload ? sortReceiptPayloadKeys(receiptPayload) : null),
    [receiptPayload],
  );

  const canonicalJson = useMemo(
    () => (sortedPayload ? JSON.stringify(sortedPayload) : null),
    [sortedPayload],
  );

  const digest = useMemo(
    () => (canonicalJson ? computeSha256Hex(canonicalJson) : null),
    [canonicalJson],
  );

  const verifiableJson = useMemo(
    () =>
      sortedPayload && digest
        ? JSON.stringify({ payload: sortedPayload, sha256: digest }, null, 2)
        : null,
    [digest, sortedPayload],
  );

  const handleCopy = (): void => {
    if (!verifiableJson) return;
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      onNotify?.("No pudimos copiar el recibo en este navegador.", "warning");
      return;
    }
    void navigator.clipboard
      .writeText(verifiableJson)
      .then(() => {
        setCopied(true);
        onNotify?.("Recibo JSON + SHA-256 copiado para auditar en /verificacion.", "success");
      })
      .catch((err: unknown) => {
        void err;
        onNotify?.("No pudimos copiar el recibo.", "warning");
      });
  };

  return (
    <SofascoreCard
      as="section"
      density="compact"
      title="Recibo criptográfico"
      meta={
        <span className="pl-prof-receipt-badge num">
          <MaestroIcon name="shield" size={12} />
          SHA-256
        </span>
      }
      className="pl-prof-receipt-card"
    >
      <div className="pl-prof-receipt" data-profile-verification-receipt={handle}>
        <div className="pl-prof-receipt-copy">
          {isPrivate ? (
            <p className="pl-prof-receipt-desc">
              El récord de @{handle} está en privado. Todos los picks cerrados en PitchLab se
              sellan antes del inicio del partido con huella verificable SHA-256.
            </p>
          ) : digest && verifiableJson ? (
            <>
              <p className="pl-prof-receipt-desc">
                Huella verificable del corte público ({settledCount}{" "}
                {settledCount === 1 ? "pick cerrado" : "picks cerrados"} · sin montos en pesos).
              </p>
              <div className="pl-prof-receipt-hash-box">
                <span className="pl-prof-receipt-hash-label">SHA-256</span>
                <code className="pl-prof-receipt-hash num" title={digest}>
                  {digest}
                </code>
              </div>
              <details className="pl-prof-receipt-details">
                <summary className="pl-prof-receipt-summary">Ver JSON verificable</summary>
                <pre className="pl-prof-receipt-payload num">{verifiableJson}</pre>
              </details>
            </>
          ) : (
            <p className="pl-prof-receipt-desc">
              Cuando @{handle} liquide su primer pick aparecerá aquí su recibo SHA-256 auditable.
            </p>
          )}
        </div>

        <div className="pl-prof-receipt-actions">
          {digest && !isPrivate ? (
            <Button variant="secondary" size="sm" onClick={handleCopy}>
              <MaestroIcon name={copied ? "check" : "copy"} size={14} />
              <span>{copied ? "Copiado" : "Copiar recibo"}</span>
            </Button>
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            render={
              <a
                href="/verificacion"
                onClick={(event) => {
                  if (
                    !onNavigate ||
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  ) {
                    return;
                  }
                  event.preventDefault();
                  onNavigate("/verificacion");
                }}
              />
            }
          >
            <MaestroIcon name="shield" size={14} />
            <span>Verificar</span>
          </Button>
        </div>
      </div>
    </SofascoreCard>
  );
}

export interface TabDef<K extends string> {
  key: K;
  label: string;
  shortLabel?: string;
}

export function useUrlTab<K extends string>(
  keys: readonly K[],
  fallback: K,
): [K, (next: K) => void] {
  const keysRef = useRef<readonly K[]>(keys);
  keysRef.current = keys;
  const [tab, setTabState] = useState<K>(fallback);

  useSafeEffect(() => {
    if (typeof window === "undefined") return;
    const param = new URLSearchParams(window.location.search).get("tab");
    if (param && (keysRef.current as readonly string[]).includes(param)) {
      setTabState(param as K);
    }
  }, []);

  const setTab = useCallback(
    (next: K) => {
      setTabState(next);
      if (typeof window === "undefined") return;
      const url = new URL(window.location.href);
      if (next === fallback) url.searchParams.delete("tab");
      else url.searchParams.set("tab", next);
      window.history.replaceState(window.history.state, "", url.toString());
    },
    [fallback],
  );
  return [tab, setTab];
}

type NearestScrollOptions = ScrollIntoViewOptions & {
  readonly container?: "all" | "nearest";
};

function scrollUnderlineTabIntoView(element: HTMLButtonElement | null): void {
  if (!element || typeof element.scrollIntoView !== "function") return;
  const opts: NearestScrollOptions = {
    block: "nearest",
    inline: "nearest",
    container: "nearest",
  };
  try {
    element.scrollIntoView(opts);
  } catch (err) {
    void err;
    element.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
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
  const didMountRef = useRef(false);

  useSafeEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    const activeIndex = tabs.findIndex((t) => t.key === active);
    if (activeIndex >= 0) {
      scrollUnderlineTabIntoView(refs.current[activeIndex] ?? null);
    }
  }, [active, tabs]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const listEl = event.currentTarget.closest<HTMLElement>('[role="tablist"]');
    const isRtl =
      listEl !== null &&
      typeof window !== "undefined" &&
      window.getComputedStyle(listEl).direction === "rtl";
    const nextKey = isRtl ? "ArrowLeft" : "ArrowRight";
    const prevKey = isRtl ? "ArrowRight" : "ArrowLeft";

    let next = -1;
    if (event.key === nextKey) next = (index + 1) % tabs.length;
    else if (event.key === prevKey) next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    if (next < 0) return;
    event.preventDefault();
    onChange(tabs[next]!.key);
    refs.current[next]?.focus();
  };

  return (
    <div
      className={["pl-utabs", className].filter(Boolean).join(" ")}
      role="tablist"
      aria-label={label}
      aria-orientation="horizontal"
    >
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
            onClick={(event) => {
              scrollUnderlineTabIntoView(event.currentTarget);
              onChange(t.key);
            }}
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
  active,
  children,
  className,
}: {
  tabKey: K;
  idPrefix: string;
  active?: K;
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element | null {
  if (active !== undefined && active !== tabKey) return null;
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

let serverFollowing: string[] | null = null;
let serverFollowingRequest: Promise<void> | null = null;
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
  const examples = local.filter((h) => getExampleAnalystSpec(h));
  return [...new Set([...serverFollowing, ...examples])];
}

export function useFollowing(): {
  following: readonly string[];
  isFollowing: (handle: string) => boolean;
  toggle: (handle: string) => boolean;
} {
  const { hasAccountSessionAuth, viewerIdentity } = usePlatformCore();
  const { pushToast } = usePlatformActions();
  const owner = viewerIdentity?.handle ?? null;
  const [following, setFollowing] = useState<string[]>([]);

  useSafeEffect(() => {
    const sync = (): void => setFollowing(currentFollowing());
    sync();
    if (hasAccountSessionAuth && owner) void loadServerFollowing(owner);
    window.addEventListener(FOLLOWING_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(FOLLOWING_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [hasAccountSessionAuth, owner]);

  const toggle = useCallback(
    (handle: string): boolean => {
      const willFollow = !currentFollowing().includes(handle);
      if (hasAccountSessionAuth && serverFollowing && !getExampleAnalystSpec(handle)) {
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
    [hasAccountSessionAuth, pushToast],
  );
  const isFollowing = useCallback((handle: string) => following.includes(handle), [following]);
  return useMemo(() => ({ following, isFollowing, toggle }), [following, isFollowing, toggle]);
}

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

  useSafeEffect(() => {
    const menuEl = menuRef.current;
    const triggerEl = triggerRef.current;
    if (!menuEl || !triggerEl || typeof menuEl.showPopover !== "function") return;

    const hasFocusGroup =
      typeof HTMLElement !== "undefined" && "focusGroup" in HTMLElement.prototype;
    const hasAnchor =
      typeof CSS !== "undefined" &&
      typeof CSS.supports === "function" &&
      CSS.supports("position-area", "block-end");

    const getItems = (): HTMLButtonElement[] => [
      ...menuEl.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
    ];

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
        className={`pl-com-more-btn${compact ? " pl-com-more-btn--sm" : ""}`}
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
        className="pl-com-menu"
        {...({ focusgroup: "menu nomemory" } as React.HTMLAttributes<HTMLDivElement>)}
      >
        <button
          type="button"
          className="pl-com-menu-item"
          onClick={() => {
            openingDialogRef.current = true;
            if (
              typeof menuRef.current?.hidePopover === "function" &&
              menuRef.current.matches(":popover-open")
            ) {
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

function SocialReportDialogBody({
  target,
  onClose,
}: {
  target: SocialReportTarget;
  onClose: () => void;
}): React.JSX.Element {
  const uid = useId();
  const { reportSocialContent } = usePlatformActions();
  const [reason, setReason] = useState<SocialReportReason>("spam_enlaces");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

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
      <form className="pl-com-report-dialog" onSubmit={handleSubmit} noValidate>
        <div className="pl-com-sheet-head">
          <h2 id={`${uid}-title`} className="pl-com-sheet-title">
            {target.kind === "post" ? "Reportar publicación" : "Reportar comentario"}
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Cerrar"
            onClick={onClose}
          >
            <MaestroIcon name="x" size={16} />
          </Button>
        </div>
        <p className="pl-com-report-sub">
          De <strong>@{target.authorHandle}</strong>. Tu reporte es confidencial y ayuda a mantener
          Comunidad limpia.
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
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={submitting}>
            {submitting ? "Enviando…" : "Enviar reporte"}
          </Button>
        </div>
      </form>
    </TopLayerModalDialog>
  );
}

export function SocialReportDialog({
  target,
  onClose,
}: {
  target: SocialReportTarget | null;
  onClose: () => void;
}): React.JSX.Element | null {
  if (!target) return null;
  const targetKey = `${target.kind}:${target.postId ?? ""}:${target.commentId ?? ""}:${target.authorHandle}`;
  return <SocialReportDialogBody key={targetKey} target={target} onClose={onClose} />;
}

export interface FollowedTopics {
  leagues: string[];
  teams: string[];
}

const TOPICS_KEY = "pl-follow-topics-v1";
const TOPICS_EVENT = "pl:follow-topics";
const TOPICS_MAX = 40;

function sanitizeTopicList(v: unknown): string[] {
  return Array.isArray(v)
    ? Array.from(
        new Set(
          v.filter(
            (x): x is string => typeof x === "string" && x.trim().length > 0 && x.length <= 80,
          ),
        ),
      ).slice(0, TOPICS_MAX)
    : [];
}

function readTopics(): FollowedTopics {
  try {
    const raw = JSON.parse(
      window.localStorage.getItem(TOPICS_KEY) ?? "null",
    ) as Partial<FollowedTopics> | null;
    return {
      leagues: sanitizeTopicList(raw?.leagues),
      teams: sanitizeTopicList(raw?.teams),
    };
  } catch (err) {
    void err;
    return { leagues: [], teams: [] };
  }
}

function cacheTopicsLocally(next: FollowedTopics): void {
  try {
    window.localStorage.setItem(TOPICS_KEY, JSON.stringify(next));
  } catch (err) {
    void err;
  }
  window.dispatchEvent(new Event(TOPICS_EVENT));
}

export const teamTopicKey = (league: string, slug: string): string => `${league}:${slug}`;

export function useFollowedTopics(): {
  topics: FollowedTopics;
  toggleLeague: (league: string) => void;
  toggleTeam: (key: string) => void;
} {
  const core = useOptionalPlatformCore();
  const hasAccountSessionAuth = Boolean(core?.hasAccountSessionAuth);
  const [topics, setTopics] = useState<FollowedTopics>({ leagues: [], teams: [] });

  useSafeEffect(() => {
    const sync = (): void => setTopics(readTopics());
    sync();
    window.addEventListener(TOPICS_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(TOPICS_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const remotePrefsQuery = useAbortableJson<{
    preferences?: { followedTopics?: Partial<FollowedTopics> | null };
  }>("/api/me/preferences", { enabled: hasAccountSessionAuth });

  useSafeEffect(() => {
    const remoteRaw = remotePrefsQuery.data?.preferences?.followedTopics;
    if (!remoteRaw) return;
    const remote: FollowedTopics = {
      leagues: sanitizeTopicList(remoteRaw.leagues),
      teams: sanitizeTopicList(remoteRaw.teams),
    };
    setTopics(remote);
    cacheTopicsLocally(remote);
  }, [remotePrefsQuery.data]);

  const write = useCallback(
    (next: FollowedTopics) => {
      const prev = readTopics();
      setTopics(next);
      cacheTopicsLocally(next);
      if (!hasAccountSessionAuth) return;
      void (async () => {
        try {
          const res = await fetch("/api/me/preferences", {
            method: "PUT",
            credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ followedTopics: next }),
          });
          if (!res.ok) throw new Error(String(res.status));
        } catch (err) {
          void err;
          setTopics(prev);
          cacheTopicsLocally(prev);
        }
      })();
    },
    [hasAccountSessionAuth],
  );

  const toggleLeague = useCallback(
    (league: string) => {
      const cur = readTopics();
      const nextLeagues = cur.leagues.includes(league)
        ? cur.leagues.filter((v) => v !== league)
        : [...cur.leagues, league].slice(0, TOPICS_MAX);
      write({ ...cur, leagues: nextLeagues });
    },
    [write],
  );

  const toggleTeam = useCallback(
    (key: string) => {
      const cur = readTopics();
      const nextTeams = cur.teams.includes(key)
        ? cur.teams.filter((v) => v !== key)
        : [...cur.teams, key].slice(0, TOPICS_MAX);
      write({ ...cur, teams: nextTeams });
    },
    [write],
  );

  return useMemo(
    () => ({
      topics,
      toggleLeague,
      toggleTeam,
    }),
    [toggleLeague, toggleTeam, topics],
  );
}

function normalizeTopicText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function leagueLabelsFor(id: string): string[] {
  const entry = LEAGUE_CATALOG.find((c) => c.id === id);
  if (!entry) return [id.toLowerCase()];
  return [entry.name.toLowerCase(), entry.shortName.toLowerCase()];
}

export function postMatchesTopics(
  post: Pick<SocialPost, "gameId" | "pick"> &
    Partial<Pick<SocialPost, "leagueLabel" | "matchLabel">>,
  topics: FollowedTopics,
  dataset: PlatformDataset,
): boolean {
  if (topics.leagues.length === 0 && topics.teams.length === 0) return false;
  const gameId = post.pick?.gameId ?? post.gameId;
  if (gameId) {
    const meta = resolveEntryGame(gameId, dataset);
    if (meta) {
      return (
        topics.leagues.includes(meta.league) ||
        topics.teams.includes(teamTopicKey(meta.league, meta.home.slug)) ||
        topics.teams.includes(teamTopicKey(meta.league, meta.away.slug))
      );
    }
  }
  const postLeagueLower = post.leagueLabel?.trim().toLowerCase() ?? "";
  if (
    postLeagueLower &&
    topics.leagues.some((l) => leagueLabelsFor(l).includes(postLeagueLower))
  ) {
    return true;
  }
  const matchNorm = normalizeTopicText(post.matchLabel ?? "");
  const gameNorm = (gameId ?? "").toLowerCase();
  for (const key of topics.teams) {
    const sep = key.indexOf(":");
    if (sep <= 0) continue;
    const leagueId = key.slice(0, sep) as LeagueId;
    const slug = key.slice(sep + 1).toLowerCase();
    if (postLeagueLower && !leagueLabelsFor(leagueId).includes(postLeagueLower)) continue;
    if (gameNorm && gameNorm.includes(slug)) return true;
    const token = slug.replace(/[^a-z0-9]+/g, " ").trim();
    if (token.length >= 2 && matchNorm.includes(token)) return true;
  }
  return false;
}
