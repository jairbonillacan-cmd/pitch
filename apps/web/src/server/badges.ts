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

export function badgesFromFacts(facts: BadgeUserFacts, now: Date = new Date()): MemberBadges {
  const all = computeBadges(
    {
      entries: facts.picks,
      joinedAtIso: facts.joinedAtIso,
      isTipster: facts.isTipster,
      likesOnPickPosts: facts.likesOnPickPosts,
      paidReferrals: facts.paidReferrals,
      // Se miden en los puntos 3 (ranking) y de consenso del partido; hasta entonces no se otorgan.
      pollHits: null,
      topTenWeeks: null,
      topTenMonthly: null,
    },
    now,
  );
  const pub = publicBadges(all, visibilityOf(facts));
  const featuredIds = sanitizeFeaturedBadges(facts.preferences.featuredBadges, pub);
  return { all, public: pub, featured: featuredBadgeViews(pub, featuredIds) };
}

/** Insignias de un socio por id (Mi cuenta / `/api/me/badges`). */
export async function loadMemberBadges(db: Db, userId: string, now = new Date()): Promise<MemberBadges | null> {
  const facts = (await loadBadgeFacts(db, { userIds: [userId] })).get(userId);
  return facts ? badgesFromFacts(facts, now) : null;
}

/** Lo que ve cualquiera en el perfil: solo insignias públicas. Perfil privado → nada. */
export async function loadProfileBadges(
  handle: string,
  customDb?: Db,
): Promise<{ public: BadgeView[]; featured: BadgeView[] } | null> {
  const db = customDb ?? serverDb();
  if (!db) return null;
  const facts = [...(await loadBadgeFacts(db, { handles: [handle] })).values()][0];
  if (!facts) return null;
  if (!facts.publicProfile) return { public: [], featured: [] };
  const { public: pub, featured } = badgesFromFacts(facts);
  return { public: pub, featured };
}

/** Primera destacada de cada autor del feed (perfiles privados no muestran ninguna). */
export async function featuredBadgeByHandle(db: Db, handles: readonly string[]): Promise<Map<string, BadgeView>> {
  const out = new Map<string, BadgeView>();
  if (handles.length === 0) return out;
  const now = new Date();
  for (const facts of (await loadBadgeFacts(db, { handles })).values()) {
    if (!facts.publicProfile) continue;
    const first = badgesFromFacts(facts, now).featured[0];
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
