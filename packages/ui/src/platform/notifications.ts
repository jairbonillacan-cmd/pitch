import { formatOddsValue } from "./access-guard";
import { canonicalGameHref, type LeagueId, type LiveScoreboardEntry } from "@pitchlab/contracts";
import { isCredibleClvPct, isParlayClvEntry } from "./record-stats";
import type { JournalEntry, OddsFormat, PlatformGame } from "./types";

export type NotificationKind = "partidos" | "cuotas" | "picks" | "comunidad" | "resumen";
export type NotificationPriority = "urgent" | "normal" | "digest";

export type SocialNotificationIcon = "message" | "users-plus" | "heart";

export interface PlatformNotification {
  id: string;
  kind: NotificationKind;
  priority: NotificationPriority;
  title: string;
  context: { lead?: string; text: string };
  atIso: string;
  source?: string;
  actionLabel: string;
  href: string;
  icon?: SocialNotificationIcon;
  serverId?: string;
}

export interface ServerSocialNotification {
  id: string;
  kind: "comment" | "comment_reply" | "mention" | "follow" | "like";
  actorHandle: string;
  actorName: string;
  postId: string | null;
  commentId?: string | null;
  postExcerpt: string | null;
  likeCount: number;
  createdAt: string;
  readAt: string | null;
}

export interface BuildNotificationsInput {
  games: readonly PlatformGame[];
  watchlistGameIds: readonly string[];
  journal: readonly JournalEntry[];
  favoriteLeagues?: readonly LeagueId[];
  oddsFormat: OddsFormat;
  now: Date;
  generatedAtIso?: string;
}

export const NOTIFICATION_LIMIT = 30;
const MIN = 60_000;
const HOUR = 60 * MIN;
const KICKOFF_NOTICE_MS = 60 * MIN;
const URGENT_VALUE_MS = 3 * HOUR;
const DIGEST_MAX_AGE_MS = 72 * HOUR;
const DIGEST_MIN_GAMES = 3;

export function formatPctEs(p: number): string {
  return `${(p * 100).toFixed(1)} %`;
}

function matchTitle(g: PlatformGame): string {
  return `${g.home.shortName} vs ${g.away.shortName}`;
}

function gameDurationMs(g: PlatformGame): number {
  if (g.sport === "american-football") return 3.5 * HOUR;
  if (g.sport === "basketball" || g.sport === "ice-hockey") return 2.5 * HOUR;
  return 2 * HOUR;
}

export function mostLikelyOutcome(
  g: PlatformGame,
): { side: 0 | 1 | 2; label: string; p: number } | null {
  if (!g.x12) return null;
  const [h, d, a] = g.x12;
  if (h >= a && h >= d) return { side: 0, label: g.home.shortName, p: h };
  if (a >= d) return { side: 2, label: g.away.shortName, p: a };
  return { side: 1, label: "Empate", p: d };
}

function outcomeFromScore(score: { home: number; away: number }): 0 | 1 | 2 {
  if (score.home > score.away) return 0;
  if (score.home < score.away) return 2;
  return 1;
}

function fairOdds(p: number, fmt: OddsFormat): string {
  return formatOddsValue(1 / Math.min(0.99, Math.max(0.01, p)), fmt);
}

function clampToNow(ms: number, now: number): string {
  return new Date(Math.min(ms, now)).toISOString();
}

function gameHref(g: PlatformGame): string {
  return canonicalGameHref(g.league, g);
}

export function buildNotifications(input: BuildNotificationsInput): PlatformNotification[] {
  const now = input.now.getTime();
  const fmt = input.oddsFormat;
  const watched = new Set(input.watchlistGameIds);
  const byId = new Map(input.games.map((g) => [g.id, g]));
  const out: PlatformNotification[] = [];

  for (const g of input.games) {
    if (!watched.has(g.id)) continue;
    const kickoff = Date.parse(g.kickoffUtc);
    if (Number.isNaN(kickoff)) continue;
    const fav = mostLikelyOutcome(g);
    const favLine = fav
      ? { lead: `${fav.label} ${formatPctEs(fav.p)}`, text: ` · cuota justa ${fairOdds(fav.p, fmt)}` }
      : null;

    if (g.status !== "FT" && now >= kickoff - KICKOFF_NOTICE_MS) {
      const started = g.status === "LIVE" || now >= kickoff;
      const mins = Math.max(1, Math.round((kickoff - now) / MIN));
      out.push({
        id: `kickoff:${g.id}`,
        kind: "partidos",
        priority: "urgent",
        title: started ? `${matchTitle(g)} ya empezó` : `${matchTitle(g)} empieza en ${mins} min`,
        context: favLine
          ? { lead: `Lo más probable: ${favLine.lead}`, text: favLine.text }
          : { lead: "Seguimiento activo", text: " · sin pronóstico publicado aún." },
        atIso: clampToNow(kickoff - KICKOFF_NOTICE_MS, now),
        actionLabel: "Abrir partido",
        href: gameHref(g),
      });
    }

    if (g.status === "FT" && g.score) {
      const happened = fav !== null && outcomeFromScore(g.score) === fav.side;
      out.push({
        id: `final:${g.id}`,
        kind: "partidos",
        priority: "normal",
        title: `Final: ${g.home.shortName} ${g.score.home}–${g.score.away} ${g.away.shortName}`,
        context: fav
          ? {
              lead: `Lo más probable era ${fav.label} (${formatPctEs(fav.p)})`,
              text: happened ? " y ocurrió." : " y no ocurrió.",
            }
          : {
              lead: "Resultado registrado",
              text: " · sin pronóstico previo publicado.",
            },
        atIso: clampToNow(kickoff + gameDurationMs(g), now),
        actionLabel: "Ver resumen",
        href: gameHref(g),
      });
    }

    if (g.status === "NS") {
      const market = g.spacetime?.market ?? null;
      const asOf = market?.asOfUtc ?? input.generatedAtIso ?? g.kickoffUtc;
      const asOfMs = Date.parse(asOf);

      const pick = g.picks.find(
        (p) => p.category === "valor" && p.marketDecimal !== null && (p.edgePts ?? 0) > 0,
      );
      if (pick && pick.marketDecimal !== null) {
        const label = pick.isRedacted ? `Selección para socios en ${matchTitle(g)}` : pick.label;
        const displayEngine = /geodesic/i.test(pick.engineName)
          ? "Motor Spacetime"
          : pick.engineName;
        out.push({
          id: `value:${pick.id}`,
          kind: "cuotas",
          priority: kickoff - now <= URGENT_VALUE_MS ? "urgent" : "normal",
          title: `${label}: la casa paga ${formatOddsValue(pick.marketDecimal, fmt)}, la cuota justa es ${formatOddsValue(pick.fairDecimal, fmt)}`,
          context: {
            lead: `${displayEngine} estima ${formatPctEs(pick.p)}`,
            text: `; el momio de la casa implica ${formatPctEs(1 / pick.marketDecimal)}.`,
          },
          atIso: clampToNow(Number.isNaN(asOfMs) ? now : asOfMs, now),
          source: market?.bookLabel,
          actionLabel: "Ver cuotas",
          href: gameHref(g),
        });
      }

      for (const pk of g.picks) {
        const quote = pk.bookQuotes?.find(
          (q) =>
            q.openingDecimal != null &&
            q.openingDecimal > 1.01 &&
            Math.abs(q.decimal - q.openingDecimal) >= 0.08,
        );
        if (!quote || quote.openingDecimal == null) continue;
        const delta = quote.decimal - quote.openingDecimal;
        const drifting = delta > 0;
        const label = pk.isRedacted ? `Línea seguida en ${matchTitle(g)}` : pk.label;
        const beatsFair = !pk.isRedacted && quote.decimal > pk.fairDecimal;
        out.push({
          id: `line-move:${pk.id}`,
          kind: "cuotas",
          priority: drifting && beatsFair ? "urgent" : "normal",
          title: drifting
            ? `Línea al alza en ${label}: ${formatOddsValue(quote.openingDecimal, fmt)} → ${formatOddsValue(quote.decimal, fmt)}`
            : `Línea a la baja en ${label}: ${formatOddsValue(quote.openingDecimal, fmt)} → ${formatOddsValue(quote.decimal, fmt)}`,
          context: beatsFair
            ? {
                lead: `${quote.bookLabel} superó la cuota justa`,
                text: ` (${formatOddsValue(pk.fairDecimal, fmt)}).`,
              }
            : {
                lead: drifting ? "Mejoró el pago en casas" : "Dinero concentrado en esta selección",
                text: ` · corte ${quote.bookLabel}.`,
              },
          atIso: clampToNow(Number.isNaN(asOfMs) ? now : asOfMs, now),
          source: quote.bookLabel,
          actionLabel: "Ver movimiento",
          href: `${gameHref(g)}?tab=dinero`,
        });
        break;
      }
    }
  }

  for (const e of input.journal) {
    const g = byId.get(e.gameId);
    const sealedMs = e.sealedAtIso ? Date.parse(e.sealedAtIso) : NaN;
    if (e.status !== "pending") {
      const settledMs = g ? Date.parse(g.kickoffUtc) + gameDurationMs(g) : sealedMs;
      const at = Math.max(Number.isNaN(settledMs) ? 0 : settledMs, Number.isNaN(sealedMs) ? 0 : sealedMs);
      if (!at) continue;
      const rawClv = e.clvPct;
      const clv = isCredibleClvPct(rawClv, isParlayClvEntry(e))
        ? `${rawClv >= 0 ? "+" : ""}${rawClv.toFixed(1)} pts`
        : null;
      out.push({
        id: `graded:${e.id}`,
        kind: "picks",
        priority: "normal",
        title: `Pick calificado: ${e.pickLabel}`,
        context: {
          lead: e.status === "won" ? "Cumplido" : "No cumplido",
          text: clv
            ? ` · ${clv} frente a la cuota justa. Registraste ${formatOddsValue(e.userDecimal, fmt)}.`
            : ` · Registraste ${formatOddsValue(e.userDecimal, fmt)}.`,
        },
        atIso: clampToNow(at, now),
        actionLabel: "Ver bitácora",
        href: "/app/lab",
      });
      continue;
    }
    if (!g) continue;
    const kickoff = Date.parse(g.kickoffUtc);
    const started = g.status !== "NS" || now >= kickoff;
    if (!started || (!Number.isNaN(sealedMs) && sealedMs >= kickoff)) continue;
    out.push({
      id: `locked:${e.id}`,
      kind: "picks",
      priority: "normal",
      title: "Tu pick quedó bloqueado",
      context: {
        text: `${e.pickLabel} · ${formatOddsValue(e.userDecimal, fmt)} · ${e.units} u. Empezó ${e.matchLabel} y ya no se puede editar.`,
      },
      atIso: clampToNow(kickoff, now),
      actionLabel: "Ver bitácora",
      href: "/app/lab",
    });
  }

  const digestLeagues = new Set<LeagueId>(input.favoriteLeagues ?? []);
  for (const id of watched) {
    const g = byId.get(id);
    if (g) digestLeagues.add(g.league);
  }
  for (const league of digestLeagues) {
    const rounds = new Map<string, PlatformGame[]>();
    for (const g of input.games) {
      if (g.league !== league) continue;
      const list = rounds.get(g.round) ?? [];
      list.push(g);
      rounds.set(g.round, list);
    }
    let best: { round: string; games: PlatformGame[]; endMs: number } | null = null;
    for (const [round, games] of rounds) {
      if (games.length < DIGEST_MIN_GAMES) continue;
      if (!games.every((g) => g.status === "FT" && g.score)) continue;
      const endMs = Math.max(...games.map((g) => Date.parse(g.kickoffUtc) + gameDurationMs(g)));
      if (!best || endMs > best.endMs) best = { round, games, endMs };
    }
    if (!best || now - best.endMs > DIGEST_MAX_AGE_MS || best.endMs > now) continue;
    const hits = best.games.filter((g) => {
      const fav = mostLikelyOutcome(g);
      return fav !== null && outcomeFromScore(g.score!) === fav.side;
    }).length;
    const first = best.games[0]!;
    out.push({
      id: `digest:${league}:${best.round}`,
      kind: "resumen",
      priority: "digest",
      title: `Cierre de ${first.leagueLabel} · ${best.round}`,
      context: { text: " partidos terminaron con lo más probable.", lead: `${hits} de ${best.games.length}` },
      atIso: new Date(best.endMs).toISOString(),
      actionLabel: "Ver liga",
      href: `/app/${league}`,
    });
  }

  return out
    .filter((n) => Date.parse(n.atIso) <= now)
    .sort((a, b) => Date.parse(b.atIso) - Date.parse(a.atIso))
    .slice(0, NOTIFICATION_LIMIT);
}

export function unreadCount(
  items: readonly PlatformNotification[],
  readIds: ReadonlySet<string>,
): number {
  return items.filter((n) => n.priority !== "digest" && !readIds.has(n.id)).length;
}

export function formatBadgeCount(n: number): string {
  return n > 9 ? "9+" : String(n);
}

export type NotificationGroup = "Ahora" | "Hoy" | "Antes";

export function notificationGroup(atIso: string, now: Date): NotificationGroup {
  const at = new Date(atIso);
  if (now.getTime() - at.getTime() < HOUR) return "Ahora";
  return at.toDateString() === now.toDateString() ? "Hoy" : "Antes";
}

const SHORT_DATE = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" });

export function formatNotificationTime(atIso: string, now: Date): string {
  const diff = Math.max(0, now.getTime() - Date.parse(atIso));
  if (diff < MIN) return "ahora";
  if (diff < HOUR) return `hace ${Math.floor(diff / MIN)} min`;
  if (diff < 24 * HOUR) return `hace ${Math.floor(diff / HOUR)} h`;
  return SHORT_DATE.format(new Date(atIso)).replace(".", "");
}

export function fromServerSocialNotification(
  row: ServerSocialNotification,
  now: Date,
): PlatformNotification {
  const parsedMs = Date.parse(row.createdAt);
  const atIso = clampToNow(Number.isNaN(parsedMs) ? now.getTime() : parsedMs, now.getTime());
  const source = row.actorName && row.actorName !== row.actorHandle ? row.actorName : undefined;
  const postHref = row.postId ? `/app/social?post=${encodeURIComponent(row.postId)}` : "/app/social";

  if (row.kind === "follow") {
    return {
      id: `social:${row.id}`,
      serverId: row.id,
      kind: "comunidad",
      icon: "users-plus",
      priority: "normal",
      title: `@${row.actorHandle} empezó a seguirte`,
      context: { text: `${row.actorName} te sigue en Comunidad.` },
      atIso,
      actionLabel: "Ver perfil",
      href: `/app/u/${encodeURIComponent(row.actorHandle)}`,
    };
  }

  if (row.kind === "like") {
    const others = Math.max(0, (row.likeCount || 1) - 1);
    const title =
      others > 0
        ? `A @${row.actorHandle} y ${others} más les gustó tu publicación`
        : `A @${row.actorHandle} le gustó tu publicación`;
    return {
      id: `social:${row.id}`,
      serverId: row.id,
      kind: "comunidad",
      icon: "heart",
      priority: "normal",
      title,
      context: { text: row.postExcerpt ? `«${row.postExcerpt}»` : "Tu publicación en Comunidad." },
      source,
      atIso,
      actionLabel: "Ver publicación",
      href: postHref,
    };
  }

  const title =
    row.kind === "comment_reply"
      ? `@${row.actorHandle} respondió tu comentario`
      : row.kind === "mention"
        ? `@${row.actorHandle} te mencionó en un comentario`
        : `@${row.actorHandle} comentó tu publicación`;
  const contextText =
    row.postExcerpt
      ? `«${row.postExcerpt}»`
      : row.kind === "mention"
        ? `${row.actorName} te mencionó en un hilo.`
        : `${row.actorName} dejó un comentario.`;

  return {
    id: `social:${row.id}`,
    serverId: row.id,
    kind: "comunidad",
    icon: "message",
    priority: "normal",
    title,
    context: { text: contextText },
    source,
    atIso,
    actionLabel: row.kind === "comment_reply" || row.kind === "mention" ? "Ver hilo" : "Ver publicación",
    href: postHref,
  };
}

export function mergePlatformNotifications(
  derived: readonly PlatformNotification[],
  social: readonly ServerSocialNotification[],
  now: Date,
  limit = 50,
): { items: PlatformNotification[]; serverReadIds: Set<string> } {
  const serverReadIds = new Set<string>();
  const mappedSocial = social.map((row) => {
    const item = fromServerSocialNotification(row, now);
    if (row.readAt !== null) serverReadIds.add(item.id);
    return item;
  });
  const items = [...mappedSocial, ...derived]
    .sort((a, b) => Date.parse(b.atIso) - Date.parse(a.atIso))
    .slice(0, limit);
  return { items, serverReadIds };
}

export interface LiveAlertRow {
  id: string;
  gameId: string;
  kind: "kickoff" | "goal" | "halftime" | "final";
  side: "home" | "away" | null;
  minute: number | null;
  homeScore: number;
  awayScore: number;
  occurredAtIso: string;
}

export interface LiveAlertPrefs {
  kickoff: boolean;
  goals: boolean;
  final: boolean;
}

export interface BuildLiveNotificationsInput {
  alerts: readonly LiveAlertRow[] | null;
  entries: readonly LiveScoreboardEntry[];
  games: readonly PlatformGame[];
  watchlistGameIds: readonly string[];
  followAlerts: Readonly<Record<string, LiveAlertPrefs>>;
  now: Date;
  observedAtIso?: string | null;
}

function liveTitle(row: Pick<LiveAlertRow, "kind" | "side" | "homeScore" | "awayScore">, g: PlatformGame): string {
  const line = `${g.home.shortName} ${row.homeScore}–${row.awayScore} ${g.away.shortName}`;
  switch (row.kind) {
    case "kickoff":
      return `Empezó ${matchTitle(g)}`;
    case "goal":
      return `Gol de ${row.side === "away" ? g.away.shortName : g.home.shortName} · ${line}`;
    case "halftime":
      return `Medio tiempo · ${line}`;
    case "final":
      return `Final · ${line}`;
  }
}

function allowed(kind: LiveAlertRow["kind"], prefs: LiveAlertPrefs): boolean {
  if (kind === "kickoff") return prefs.kickoff;
  if (kind === "final") return prefs.final;
  return prefs.goals;
}

export function buildLiveNotifications(input: BuildLiveNotificationsInput): PlatformNotification[] {
  const now = input.now.getTime();
  const byId = new Map(input.games.map((g) => [g.id, g]));
  const watched = new Set(input.watchlistGameIds);
  const prefsFor = (gameId: string): LiveAlertPrefs =>
    input.followAlerts[gameId] ?? { kickoff: true, goals: true, final: true };

  const rows: LiveAlertRow[] = [];
  if (input.alerts) {
    rows.push(...input.alerts);
  } else {
    const at = input.observedAtIso ?? input.now.toISOString();
    for (const e of input.entries) {
      if (!watched.has(e.gameId) || e.phase === "scheduled" || e.phase === "unknown") continue;
      const s = e.score ?? { home: 0, away: 0 };
      const base = { gameId: e.gameId, minute: e.minute, homeScore: s.home, awayScore: s.away };
      rows.push({ ...base, id: "", kind: "kickoff", side: null, homeScore: 0, awayScore: 0, occurredAtIso: e.kickoffUtc });
      if (s.home + s.away > 0) rows.push({ ...base, id: "", kind: "goal", side: null, occurredAtIso: at });
      if (e.phase === "halftime") rows.push({ ...base, id: "", kind: "halftime", side: null, occurredAtIso: at });
      if (e.phase === "final") rows.push({ ...base, id: "", kind: "final", side: null, occurredAtIso: at });
    }
  }

  const out: PlatformNotification[] = [];
  for (const row of rows) {
    const g = byId.get(row.gameId);
    if (!g || !watched.has(row.gameId) || !allowed(row.kind, prefsFor(row.gameId))) continue;
    const atMs = Date.parse(row.occurredAtIso);
    const title =
      row.kind === "goal" && row.side === null
        ? `Gol · ${g.home.shortName} ${row.homeScore}–${row.awayScore} ${g.away.shortName}`
        : liveTitle(row, g);
    out.push({
      id: `live:${row.gameId}:${row.kind}:${row.homeScore}-${row.awayScore}`,
      kind: "partidos",
      priority: row.kind === "goal" || row.kind === "final" ? "urgent" : "normal",
      title,
      context: {
        text: `${row.minute !== null && row.kind === "goal" ? `Minuto ${row.minute} · ` : ""}${g.leagueLabel} · Siguiendo`,
      },
      atIso: clampToNow(Number.isNaN(atMs) ? now : atMs, now),
      actionLabel: "Ver en vivo",
      href: gameHref(g),
    });
  }
  return out.sort((a, b) => Date.parse(b.atIso) - Date.parse(a.atIso));
}
