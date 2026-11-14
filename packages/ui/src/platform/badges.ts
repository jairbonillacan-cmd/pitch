/**
 * Insignias: se ganan con lo que el socio hace en PitchLab, nunca por volumen de apuestas,
 * por entrar cada día ni con premios. Módulo puro (sin "use client"): lo usan el servidor
 * (perfil, feed y `/api/me/badges`) y las vistas.
 *
 * Cada insignia que sale de Mi récord hereda la privacidad del dato que la origina: si el
 * socio oculta su porcentaje de acierto, «Ojo fino» tampoco se ve en su perfil.
 */
import {
  computeRecordStats,
  isShared,
  type RecordEntry,
  type RecordPrivacy,
  type RecordPrivacyBlock,
} from "./record-stats";

export type BadgeFamily = "precision" | "constancy" | "community" | "origin" | "seniority" | "top";

export const BADGE_FAMILY_LABELS: Record<BadgeFamily, string> = {
  precision: "Precisión",
  constancy: "Constancia",
  community: "Comunidad",
  origin: "Origen",
  seniority: "Antigüedad",
  top: "Top",
};

/** De dónde sale cada insignia, para saber si el socio la comparte. */
export type BadgePrivacySource =
  | { kind: "record"; block: RecordPrivacyBlock; field: string }
  | { kind: "ranking" }
  | { kind: "public" };

export interface BadgeState {
  /** Estable; las de liga llevan sufijo: `especialista:Liga MX`. */
  id: string;
  family: BadgeFamily;
  label: string;
  /** Qué hay que lograr, en palabras simples. */
  criterion: string;
  earned: boolean;
  /** Avance hacia la meta cuando todavía no se gana; null si no aplica. */
  progress: { current: number; target: number } | null;
  /** false cuando PitchLab aún no mide ese dato (no se muestra como pendiente del socio). */
  measured: boolean;
  privacy: BadgePrivacySource;
}

/** Lo que viaja a la pantalla de otros socios. */
export interface BadgeView {
  id: string;
  family: BadgeFamily;
  label: string;
  criterion: string;
}

export interface BadgeFacts {
  entries: ReadonlyArray<RecordEntry>;
  /** Fecha de alta (ISO). */
  joinedAtIso: string | null;
  isTipster: boolean;
  /** «Me gusta» recibidos en publicaciones con pick. */
  likesOnPickPosts: number;
  /** Amigos invitados que ya pagaron. */
  paidReferrals: number;
  /** Partidos en que acertó el pick más votado por la comunidad; null si aún no se mide. */
  pollHits: number | null;
  /** Semanas en el Top 10 del ranking; null si aún no se mide. */
  topTenWeeks: number | null;
  /** Está en el Top 10 del mes; null si aún no se mide. */
  topTenMonthly: boolean | null;
}

export const BADGE_RULES = {
  sharpEyeHitRatePct: 60,
  sharpEyeMinSettled: 30,
  clvWindowDays: 30,
  clvMinSettled: 20,
  specialistHitRatePct: 55,
  specialistMinSettled: 20,
  streakTarget: 5,
  journalWeeks: 4,
  usefulVoiceLikes: 25,
  ambassadorPaidReferrals: 5,
  maxFeatured: 3,
} as const;

/** Cuentas creadas hasta esta fecha (fin de la beta) llevan «Fundador beta». */
export const BETA_FOUNDER_UNTIL_ISO = "2026-12-31T23:59:59-06:00";

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

const SENIORITY = [
  { id: "socio-1-ano", days: 365, label: "Socio 1 año" },
  { id: "socio-90-dias", days: 90, label: "Socio 90 días" },
  { id: "socio-30-dias", days: 30, label: "Socio 30 días" },
] as const;

function settledAt(e: RecordEntry): number | null {
  const iso = e.settledAtIso ?? e.sealedAtIso;
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** Lunes 00:00 UTC de la semana de `t`, como número de semana. */
function weekIndex(t: number): number {
  // 1970-01-01 fue jueves: se corre 3 días para que la semana empiece en lunes.
  return Math.floor((t + 3 * DAY_MS) / WEEK_MS);
}

/** Semanas seguidas, hasta esta o la anterior, en que selló al menos un pick. */
export function journalWeekStreak(entries: ReadonlyArray<RecordEntry>, now: Date): number {
  const weeks = new Set<number>();
  for (const e of entries) {
    if (!e.sealedAtIso) continue;
    const t = Date.parse(e.sealedAtIso);
    if (Number.isFinite(t)) weeks.add(weekIndex(t));
  }
  let w = weekIndex(now.getTime());
  if (!weeks.has(w)) w -= 1;
  let streak = 0;
  while (weeks.has(w)) {
    streak += 1;
    w -= 1;
  }
  return streak;
}

const clamp = (current: number, target: number) => ({ current: Math.min(current, target), target });

/** Todas las insignias con su estado. Las de liga solo aparecen si ya se ganaron. */
export function computeBadges(facts: BadgeFacts, now: Date = new Date()): BadgeState[] {
  const stats = computeRecordStats(facts.entries);
  const R = BADGE_RULES;
  const out: BadgeState[] = [];

  // Precisión
  const hit = stats.hitRatePct ?? 0;
  out.push({
    id: "ojo-fino",
    family: "precision",
    label: "Ojo fino",
    criterion: `${R.sharpEyeHitRatePct} % de acierto o más en ${R.sharpEyeMinSettled} picks cerrados o más.`,
    earned: stats.settled >= R.sharpEyeMinSettled && hit >= R.sharpEyeHitRatePct,
    progress: clamp(stats.settled, R.sharpEyeMinSettled),
    measured: true,
    privacy: { kind: "record", block: "record", field: "hitRate" },
  });

  const since = now.getTime() - R.clvWindowDays * DAY_MS;
  const recent = facts.entries.filter((e) => {
    if (e.status === "pending") return false;
    const t = settledAt(e);
    return t !== null && t >= since && t <= now.getTime();
  });
  const recentClv = recent.length > 0 ? recent.reduce((s, e) => s + e.clvPct, 0) / recent.length : 0;
  out.push({
    id: "contra-el-cierre",
    family: "precision",
    label: "Contra el cierre",
    criterion: `Mejor momio que el de cierre, en promedio, con ${R.clvMinSettled} picks cerrados o más en los últimos ${R.clvWindowDays} días.`,
    earned: recent.length >= R.clvMinSettled && recentClv > 0,
    progress: clamp(recent.length, R.clvMinSettled),
    measured: true,
    privacy: { kind: "record", block: "performance", field: "clv" },
  });

  const specialists = stats.byLeague.filter(
    (row) => row.total >= R.specialistMinSettled && (row.won / row.total) * 100 >= R.specialistHitRatePct,
  );
  const specialistCriterion = (league: string) =>
    `${R.specialistHitRatePct} % de acierto o más en ${R.specialistMinSettled} picks cerrados o más de ${league}.`;
  if (specialists.length > 0) {
    for (const row of specialists) {
      out.push({
        id: `especialista:${row.label}`,
        family: "precision",
        label: `Especialista ${row.label}`,
        criterion: specialistCriterion(row.label),
        earned: true,
        progress: null,
        measured: true,
        privacy: { kind: "record", block: "record", field: "byLeague" },
      });
    }
  } else {
    const best = stats.byLeague[0];
    out.push({
      id: "especialista",
      family: "precision",
      label: "Especialista de liga",
      criterion: specialistCriterion("una misma liga"),
      earned: false,
      progress: clamp(best?.total ?? 0, R.specialistMinSettled),
      measured: true,
      privacy: { kind: "record", block: "record", field: "byLeague" },
    });
  }

  // Constancia
  out.push({
    id: "racha-5",
    family: "constancy",
    label: `Racha ${R.streakTarget}`,
    criterion: `${R.streakTarget} picks ganados seguidos.`,
    earned: stats.bestWinStreak >= R.streakTarget,
    progress: clamp(stats.bestWinStreak, R.streakTarget),
    measured: true,
    privacy: { kind: "record", block: "record", field: "streaks" },
  });

  const weeks = journalWeekStreak(facts.entries, now);
  out.push({
    id: "bitacora-al-dia",
    family: "constancy",
    label: "Récord al día",
    criterion: `Al menos un pick sellado antes del partido cada semana, ${R.journalWeeks} semanas seguidas.`,
    earned: weeks >= R.journalWeeks,
    progress: clamp(weeks, R.journalWeeks),
    measured: true,
    privacy: { kind: "record", block: "history", field: "settledPicks" },
  });

  // Comunidad
  out.push({
    id: "voz-util",
    family: "community",
    label: "Voz útil",
    criterion: `${R.usefulVoiceLikes} «me gusta» o más en tus análisis con pick.`,
    earned: facts.likesOnPickPosts >= R.usefulVoiceLikes,
    progress: clamp(facts.likesOnPickPosts, R.usefulVoiceLikes),
    measured: true,
    privacy: { kind: "public" },
  });
  out.push({
    id: "lectura-del-partido",
    family: "community",
    label: "Lectura del partido",
    criterion: "Acertar el pick más votado por la comunidad en un partido.",
    earned: (facts.pollHits ?? 0) >= 1,
    progress: null,
    measured: facts.pollHits !== null,
    privacy: { kind: "public" },
  });
  out.push({
    id: "embajador",
    family: "community",
    label: "Embajador",
    criterion: `${R.ambassadorPaidReferrals} amigos invitados que ya pagaron su pase.`,
    earned: facts.paidReferrals >= R.ambassadorPaidReferrals,
    progress: clamp(facts.paidReferrals, R.ambassadorPaidReferrals),
    measured: true,
    privacy: { kind: "public" },
  });

  // Origen
  const joined = facts.joinedAtIso ? Date.parse(facts.joinedAtIso) : NaN;
  out.push({
    id: "fundador-beta",
    family: "origin",
    label: "Fundador beta",
    criterion: "Se unió durante la beta de PitchLab.",
    earned: Number.isFinite(joined) && joined <= Date.parse(BETA_FOUNDER_UNTIL_ISO),
    progress: null,
    measured: true,
    privacy: { kind: "public" },
  });
  out.push({
    id: "tipster-verificado",
    family: "origin",
    label: "Tipster verificado",
    criterion: "Tipster oficial de PitchLab con récord sellado.",
    earned: facts.isTipster,
    progress: null,
    measured: true,
    privacy: { kind: "public" },
  });

  // Antigüedad: solo la más alta ganada (o la siguiente meta).
  const days = Number.isFinite(joined) ? Math.floor((now.getTime() - joined) / DAY_MS) : 0;
  const reached = SENIORITY.find((s) => days >= s.days);
  const next = [...SENIORITY].reverse().find((s) => days < s.days);
  const seniority = reached ?? next ?? SENIORITY[SENIORITY.length - 1];
  out.push({
    id: seniority.id,
    family: "seniority",
    label: seniority.label,
    criterion: `${seniority.days} días o más como socio.`,
    earned: Boolean(reached),
    progress: reached ? null : clamp(Math.max(0, days), seniority.days),
    measured: Number.isFinite(joined),
    privacy: { kind: "public" },
  });

  // Top
  const weeksTop = facts.topTenWeeks ?? 0;
  out.push({
    id: "top-10-semanal",
    family: "top",
    label: weeksTop > 1 ? `Top 10 semanal ×${weeksTop}` : "Top 10 semanal",
    criterion: "Terminar una semana en el Top 10 del ranking de Comunidad.",
    earned: weeksTop >= 1,
    progress: null,
    measured: facts.topTenWeeks !== null,
    privacy: { kind: "ranking" },
  });
  out.push({
    id: "top-10-mensual",
    family: "top",
    label: "Top 10 mensual",
    criterion: "Terminar un mes en el Top 10 del ranking de Comunidad.",
    earned: facts.topTenMonthly === true,
    progress: null,
    measured: facts.topTenMonthly !== null,
    privacy: { kind: "ranking" },
  });

  return out;
}

export interface BadgeVisibility {
  privacy: RecordPrivacy;
  /** «Mostrar mi récord en mi perfil público». */
  recordVisible: boolean;
  /** «Aparecer en el ranking de Comunidad». */
  showInRanking: boolean;
}

/** ¿Otros socios pueden ver esta insignia? */
export function isBadgePublic(badge: Pick<BadgeState, "privacy">, visibility: BadgeVisibility): boolean {
  const src = badge.privacy;
  if (src.kind === "public") return true;
  if (src.kind === "ranking") return visibility.showInRanking;
  return visibility.recordVisible && isShared(visibility.privacy, src.block, src.field as never);
}

export function toBadgeView(b: BadgeState): BadgeView {
  return { id: b.id, family: b.family, label: b.label, criterion: b.criterion };
}

/** Insignias ganadas que el socio comparte, en el orden del catálogo. */
export function publicBadges(badges: ReadonlyArray<BadgeState>, visibility: BadgeVisibility): BadgeView[] {
  return badges.filter((b) => b.earned && isBadgePublic(b, visibility)).map(toBadgeView);
}

/**
 * Destacadas válidas: sin repetir, como máximo 3 y solo entre las que ve el público.
 * Sirve al guardar y al leer (si el socio oculta un dato, su insignia deja de destacarse).
 */
export function sanitizeFeaturedBadges(raw: unknown, allowed: ReadonlyArray<Pick<BadgeView, "id">>): string[] {
  if (!Array.isArray(raw)) return [];
  const ok = new Set(allowed.map((b) => b.id));
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string" || !ok.has(v) || out.includes(v)) continue;
    out.push(v);
    if (out.length === BADGE_RULES.maxFeatured) break;
  }
  return out;
}

/** Destacadas en orden; si el socio no eligió ninguna, no se inventa una selección. */
export function featuredBadgeViews(publicList: ReadonlyArray<BadgeView>, featuredIds: ReadonlyArray<string>): BadgeView[] {
  const byId = new Map(publicList.map((b) => [b.id, b]));
  return featuredIds.map((id) => byId.get(id)).filter((b): b is BadgeView => Boolean(b));
}

/** Datos neutros para perfiles de ejemplo o sin servidor. */
export function badgeFactsFromEntries(
  entries: ReadonlyArray<RecordEntry>,
  extra: Partial<Omit<BadgeFacts, "entries">> = {},
): BadgeFacts {
  return {
    entries,
    joinedAtIso: null,
    isTipster: false,
    likesOnPickPosts: 0,
    paidReferrals: 0,
    pollHits: null,
    topTenWeeks: null,
    topTenMonthly: null,
    ...extra,
  };
}
