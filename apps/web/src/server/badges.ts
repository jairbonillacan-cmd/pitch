import { loadBadgeFacts, type BadgeUserFacts, type Db } from "@pitchlab/db";
import {
  computeBadges,
  featuredBadgeViews,
  publicBadges,
  sanitizeFeaturedBadges,
  type BadgeState,
  type BadgeView,
  type BadgeVisibility,
} from "@pitchlab/ui/badges";
import { normalizeRecordPrivacy } from "@pitchlab/ui/record-stats";
import { loadCommunityBadgeExtras, type CommunityBadgeExtras } from "./ranking";
import { serverDb } from "./session-user";

export interface MemberBadges {
  /** Todas, con avance (solo para el propio socio). */
  all: BadgeState[];
  /** Ganadas que otros pueden ver. */
  public: BadgeView[];
  /** Destacadas vigentes, en el orden que eligió el socio. */
  featured: BadgeView[];
}

export function visibilityOf(facts: BadgeUserFacts): BadgeVisibility {
  return {
    privacy: normalizeRecordPrivacy(facts.preferences.recordPrivacy),
    recordVisible: facts.publicProfile && facts.preferences.publicRecordVisible,
    showInRanking: facts.preferences.showInRanking,
  };
}

export function badgesFromFacts(
  facts: BadgeUserFacts,
  now: Date = new Date(),
  extras?: CommunityBadgeExtras | null,
): MemberBadges {
  const topTen = extras?.topTen.get(facts.userId);
  const all = computeBadges(
    {
      entries: facts.picks,
      joinedAtIso: facts.joinedAtIso,
      isTipster: facts.isTipster,
      likesOnPickPosts: facts.likesOnPickPosts,
      paidReferrals: facts.paidReferrals,
      // Sin datos de Comunidad (p. ej. si falló su carga) quedan como «aún no se mide».
      pollHits: extras ? (extras.pollHits.get(facts.userId) ?? 0) : null,
      topTenWeeks: extras ? (topTen?.weeks ?? 0) : null,
      topTenMonthly: extras ? Boolean(topTen?.monthly) : null,
    },
    now,
  );
  const pub = publicBadges(all, visibilityOf(facts));
  const featuredIds = sanitizeFeaturedBadges(facts.preferences.featuredBadges, pub);
  return { all, public: pub, featured: featuredBadgeViews(pub, featuredIds) };
}

/** Insignias de un socio por id (Mi cuenta / `/api/me/badges`). */
export async function loadMemberBadges(db: Db, userId: string, now = new Date()): Promise<MemberBadges | null> {
  const [factsById, extras] = await Promise.all([
    loadBadgeFacts(db, { userIds: [userId] }),
    safeExtras(db, now),
  ]);
  const facts = factsById.get(userId);
  return facts ? badgesFromFacts(facts, now, extras) : null;
}

/** Lo que ve cualquiera en el perfil: solo insignias públicas. Perfil privado → nada. */
export async function loadProfileBadges(
  handle: string,
  customDb?: Db,
): Promise<{ public: BadgeView[]; featured: BadgeView[] } | null> {
  const db = customDb ?? serverDb();
  if (!db) return null;
  const now = new Date();
  const [factsByHandle, extras] = await Promise.all([loadBadgeFacts(db, { handles: [handle] }), safeExtras(db, now)]);
  const facts = [...factsByHandle.values()][0];
  if (!facts) return null;
  if (!facts.publicProfile) return { public: [], featured: [] };
  const { public: pub, featured } = badgesFromFacts(facts, now, extras);
  return { public: pub, featured };
}

/** Primera destacada de cada autor del feed (perfiles privados no muestran ninguna). */
export async function featuredBadgeByHandle(db: Db, handles: readonly string[]): Promise<Map<string, BadgeView>> {
  const out = new Map<string, BadgeView>();
  if (handles.length === 0) return out;
  const now = new Date();
  const [factsByHandle, extras] = await Promise.all([loadBadgeFacts(db, { handles }), safeExtras(db, now)]);
  for (const facts of factsByHandle.values()) {
    if (!facts.publicProfile) continue;
    const first = badgesFromFacts(facts, now, extras).featured[0];
    if (first) out.set(facts.handle, first);
  }
  return out;
}

/** Agrega `authorBadge` a publicaciones del feed. */
export async function withAuthorBadges<T extends { authorHandle: string }>(
  db: Db,
  posts: T[],
): Promise<Array<T & { authorBadge: BadgeView | null }>> {
  const badges = await featuredBadgeByHandle(db, [...new Set(posts.map((p) => p.authorHandle))]);
  return posts.map((p) => ({ ...p, authorBadge: badges.get(p.authorHandle.toLowerCase()) ?? null }));
}

/** Las insignias de Comunidad nunca deben tumbar el perfil ni el feed. */
async function safeExtras(db: Db, now: Date): Promise<CommunityBadgeExtras | null> {
  try {
    return await loadCommunityBadgeExtras(db, now);
  } catch (err) {
    console.error("[insignias] no se pudieron calcular Top 10 y votos", err);
    return null;
  }
}
