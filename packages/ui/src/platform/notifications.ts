/**
 * Avisos de la campana (Fase 1, sin backend).
 *
 * Se derivan de lo que el shell ya tiene cargado: partidos con su señal, la watchlist y la
 * bitácora. Cada aviso tiene un id estable para que «leído» sobreviva a recargas aunque el
 * contenido se recalcule. Funciones puras: `now` entra como argumento.
 */
import { formatOddsValue } from "./access-guard";
import type { LeagueId } from "@pitchlab/contracts";
import type { JournalEntry, OddsFormat, PlatformGame } from "./types";

export type NotificationKind = "partidos" | "cuotas" | "picks" | "resumen";
/** `urgent` interrumpe (icono ámbar), `normal` suma al contador, `digest` no suma. */
export type NotificationPriority = "urgent" | "normal" | "digest";

export interface PlatformNotification {
  id: string;
  kind: NotificationKind;
  priority: NotificationPriority;
  /** El dato: qué cambió, con cifras. */
  title: string;
  /** Contexto en una línea; `lead` es la cifra líder (va en Pulso). */
  context: { lead?: string; text: string };
  /** Momento del aviso (ISO). Nunca en el futuro. */
  atIso: string;
  /** Casa o fuente de la cifra, si aplica. */
  source?: string;
  actionLabel: string;
  href: string;
}

export interface BuildNotificationsInput {
  games: readonly PlatformGame[];
  watchlistGameIds: readonly string[];
  journal: readonly JournalEntry[];
  /** Ligas para el resumen de cierre, además de las de los partidos vigilados. */
  favoriteLeagues?: readonly LeagueId[];
  oddsFormat: OddsFormat;
  now: Date;
  /** Hora de los datos; se usa cuando el mercado no trae la suya. */
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
  return g.sport === "american-football" ? 3.5 * HOUR : 2 * HOUR;
}

/** Lo más probable del 1X2: etiqueta y probabilidad. */
export function mostLikelyOutcome(g: PlatformGame): { side: 0 | 1 | 2; label: string; p: number } {
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
  return `/app/${g.league}/games/${g.id}`;
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
    const favLine = { lead: `${fav.label} ${formatPctEs(fav.p)}`, text: ` · cuota justa ${fairOdds(fav.p, fmt)}` };

    // Partidos: aviso previo e inicio.
    if (g.status !== "FT" && now >= kickoff - KICKOFF_NOTICE_MS) {
      const started = g.status === "LIVE" || now >= kickoff;
      const mins = Math.max(1, Math.round((kickoff - now) / MIN));
      out.push({
        id: `kickoff:${g.id}`,
        kind: "partidos",
        priority: "urgent",
        title: started ? `${matchTitle(g)} ya empezó` : `${matchTitle(g)} empieza en ${mins} min`,
        context: { lead: `Lo más probable: ${favLine.lead}`, text: favLine.text },
        atIso: clampToNow(kickoff - KICKOFF_NOTICE_MS, now),
        actionLabel: "Abrir partido",
        href: gameHref(g),
      });
    }

    // Partidos: resultado final.
    if (g.status === "FT" && g.score) {
      const happened = outcomeFromScore(g.score) === fav.side;
      out.push({
        id: `final:${g.id}`,
        kind: "partidos",
        priority: "normal",
        title: `Final: ${g.home.shortName} ${g.score.home}–${g.score.away} ${g.away.shortName}`,
        context: {
          lead: `Lo más probable era ${fav.label} (${formatPctEs(fav.p)})`,
          text: happened ? " y ocurrió." : " y no ocurrió.",
        },
        atIso: clampToNow(kickoff + gameDurationMs(g), now),
        actionLabel: "Ver resumen",
        href: gameHref(g),
      });
    }

    // Cuotas: la casa paga más que la cuota justa (Geodesic contra momio vigente).
    if (g.status === "NS") {
      const pick = g.picks.find(
        (p) => p.category === "valor" && p.marketDecimal !== null && (p.edgePts ?? 0) > 0,
      );
      if (pick && pick.marketDecimal !== null) {
        const market = g.spacetime?.market ?? null;
        const asOf = market?.asOfUtc ?? input.generatedAtIso ?? g.kickoffUtc;
        const asOfMs = Date.parse(asOf);
        const label = pick.isRedacted ? `Selección para socios en ${matchTitle(g)}` : pick.label;
        out.push({
          id: `value:${pick.id}`,
          kind: "cuotas",
          priority: kickoff - now <= URGENT_VALUE_MS ? "urgent" : "normal",
          title: `${label}: la casa paga ${formatOddsValue(pick.marketDecimal, fmt)}, la cuota justa es ${formatOddsValue(pick.fairDecimal, fmt)}`,
          context: {
            lead: `${pick.engineName} estima ${formatPctEs(pick.p)}`,
            text: `; el momio de la casa implica ${formatPctEs(1 / pick.marketDecimal)}.`,
          },
          atIso: clampToNow(Number.isNaN(asOfMs) ? now : asOfMs, now),
          source: market?.bookLabel,
          actionLabel: "Ver cuotas",
          href: gameHref(g),
        });
      }
    }
  }

  // Tus picks: bloqueo al iniciar y calificación.
  for (const e of input.journal) {
    const g = byId.get(e.gameId);
    const sealedMs = e.sealedAtIso ? Date.parse(e.sealedAtIso) : NaN;
    if (e.status !== "pending") {
      const settledMs = g ? Date.parse(g.kickoffUtc) + gameDurationMs(g) : sealedMs;
      const at = Math.max(Number.isNaN(settledMs) ? 0 : settledMs, Number.isNaN(sealedMs) ? 0 : sealedMs);
      if (!at) continue;
      const clv = `${e.clvPct >= 0 ? "+" : ""}${e.clvPct.toFixed(1)} pts`;
      out.push({
        id: `graded:${e.id}`,
        kind: "picks",
        priority: "normal",
        title: `Pick calificado: ${e.pickLabel}`,
        context: {
          lead: e.status === "won" ? "Cumplido" : "No cumplido",
          text: ` · ${clv} frente a la cuota justa. Registraste ${formatOddsValue(e.userDecimal, fmt)}.`,
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

  // Resumen: cierre de la última jornada terminada de cada liga que te interesa.
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
    const hits = best.games.filter((g) => outcomeFromScore(g.score!) === mostLikelyOutcome(g).side).length;
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

/** No leídas que cuentan para la campana (los resúmenes no suman). */
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

/** «hace 4 min», «hace 2 h» o «10 nov». */
export function formatNotificationTime(atIso: string, now: Date): string {
  const diff = Math.max(0, now.getTime() - Date.parse(atIso));
  if (diff < MIN) return "ahora";
  if (diff < HOUR) return `hace ${Math.floor(diff / MIN)} min`;
  if (diff < 24 * HOUR) return `hace ${Math.floor(diff / HOUR)} h`;
  return SHORT_DATE.format(new Date(atIso)).replace(".", "");
}
