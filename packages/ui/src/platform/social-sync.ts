/**
 * Comunidad compartida: traduce el feed del servidor (`/api/social/posts`) al `SocialPost`
 * que dibuja la app y mezcla lo que llega con lo que ya hay en pantalla.
 * Funciones puras: `now` y los partidos entran como argumento.
 */
import type { PlatformGame, SocialComment, SocialPost, SocialPostPick } from "./types";

export interface ServerSocialPick {
  pickId: string;
  gameId: string;
  label: string;
  units: number;
  userDecimal: number;
  fairDecimal: number;
  modelProbability: number;
}

export interface ServerSocialComment {
  id: string;
  parentCommentId?: string | null;
  replyToHandle?: string | null;
  authorHandle: string;
  authorName: string;
  authorAvatarUrl?: string | null;
  record: string;
  body: string;
  createdAt: string;
  isMine?: boolean;
  helpfulCount?: number;
  helpfulByMe?: boolean;
}

export interface ServerSocialPost {
  id: string;
  authorHandle: string;
  authorName: string;
  authorAvatarUrl?: string | null;
  authorIsTipster: boolean;
  roleBadge: string;
  record: string;
  clv: string;
  leagueLabel: string;
  matchLabel: string;
  gameId: string | null;
  pickBadge: string;
  originType: string;
  pick: ServerSocialPick | null;
  pickStatus?: SocialPostPick["status"];
  body: string;
  createdAt: string;
  likes: number;
  likedByMe: boolean;
  isMine: boolean;
  commentsCount?: number;
  copiesCount?: number;
  comments: ServerSocialComment[];
  authorBadge?: { id: string; family: string; label: string; criterion: string } | null;
}

/** «Ahora», «Hace 5 min», «Hace 3 h», «Hace 2 d» o la fecha corta. */
export function relativeTimeLabel(iso: string, now: Date): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Math.max(0, now.getTime() - t);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "Ahora";
  if (min < 60) return `Hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `Hace ${d} d`;
  return new Date(t).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

/** Estado del pick adjunto según liquidación del servidor o partido activo. */
export function pickStatusFor(
  pick: ServerSocialPick,
  games: readonly PlatformGame[],
  serverPickStatus?: SocialPostPick["status"],
): SocialPostPick["status"] {
  if (serverPickStatus && serverPickStatus !== "open") return serverPickStatus;
  const game = games.find((g) => g.id === pick.gameId);
  const matchPick = game?.picks.find((p) => p.id === pick.pickId);
  if (!matchPick || matchPick.gameStatus !== "FT") return "open";
  return matchPick.result === "miss" ? "lost" : "won";
}

const ROLE_BADGES: readonly SocialPost["roleBadge"][] = [
  "Tipster Oficial",
  "Analista Verificado",
  "Socio Pase PitchLab Ultra",
];

export function fromServerComment(c: ServerSocialComment, now: Date): SocialComment {
  return {
    id: c.id,
    parentCommentId: c.parentCommentId ?? null,
    replyToHandle: c.replyToHandle ?? null,
    authorHandle: c.authorHandle,
    authorName: c.authorName,
    authorAvatarUrl: c.authorAvatarUrl ?? null,
    verifiedBadge: c.record,
    createdAt: relativeTimeLabel(c.createdAt, now),
    body: c.body,
    fromServer: true,
    isMine: Boolean(c.isMine),
    helpfulCount: typeof c.helpfulCount === "number" ? c.helpfulCount : 0,
    helpfulByMe: Boolean(c.helpfulByMe),
  };
}

export function fromServerPost(p: ServerSocialPost, games: readonly PlatformGame[], now: Date): SocialPost {
  const roleBadge = ROLE_BADGES.includes(p.roleBadge as SocialPost["roleBadge"])
    ? (p.roleBadge as SocialPost["roleBadge"])
    : "Socio Pase PitchLab Ultra";
  const mappedComments = p.comments.map((c) => fromServerComment(c, now));
  return {
    id: p.id,
    authorHandle: p.authorHandle,
    authorName: p.authorName,
    authorAvatarUrl: p.authorAvatarUrl ?? null,
    authorIsTipster: Boolean(p.authorIsTipster),
    roleBadge,
    avatarGradVar: p.authorIsTipster ? "var(--avatar-grad-1)" : "var(--avatar-grad-4)",
    verifiedRecord: p.record,
    clvBadge: p.clv,
    leagueLabel: p.leagueLabel,
    gameId: p.gameId ?? undefined,
    matchLabel: p.matchLabel,
    pickBadge: p.pickBadge,
    originType: p.originType === "Spacetime Suite" ? "Spacetime Suite" : "Bitácora Propia",
    createdAt: relativeTimeLabel(p.createdAt, now),
    createdAtIso: p.createdAt,
    body: p.body,
    likes: p.likes,
    likedByMe: p.likedByMe,
    isMine: p.isMine,
    authorBadge: p.authorBadge ?? null,
    fromServer: true,
    comments: mappedComments,
    commentsCount: typeof p.commentsCount === "number" ? Math.max(p.commentsCount, mappedComments.length) : mappedComments.length,
    copiesCount: typeof p.copiesCount === "number" ? p.copiesCount : 0,
    pick: p.pick
      ? {
          pickId: p.pick.pickId,
          gameId: p.pick.gameId,
          label: p.pick.label,
          units: p.pick.units,
          userDecimal: p.pick.userDecimal,
          fairDecimal: p.pick.fairDecimal,
          modelProbability: p.pick.modelProbability,
          status: pickStatusFor(p.pick, games, p.pickStatus),
        }
      : undefined,
  };
}

/** Publicación aún en camino al servidor (id temporal). */
export function isPendingPost(post: SocialPost): boolean {
  return post.id.startsWith("tmp-");
}

/**
 * Mezcla publicaciones del servidor con las que hay en pantalla.
 * - `feed`: lo que llega es el feed más reciente; reemplaza a las del servidor que caen en su
 *   rango (así desaparecen las borradas) y conserva las más viejas (perfiles, páginas previas).
 * - `extra`: agrega o actualiza sin quitar nada (publicaciones de un perfil).
 * Las de ejemplo siempre van al final; las pendientes, arriba.
 */
export function mergeSocialPosts(
  current: readonly SocialPost[],
  incoming: readonly SocialPost[],
  mode: "feed" | "extra",
): SocialPost[] {
  const currentById = new Map(current.map((p) => [p.id, p]));
  const normalizedIncoming = incoming.map((inc) => {
    const prev = currentById.get(inc.id);
    if (
      prev &&
      prev.comments.length > inc.comments.length &&
      (prev.commentsCount ?? prev.comments.length) === (inc.commentsCount ?? inc.comments.length)
    ) {
      return { ...inc, comments: prev.comments };
    }
    return inc;
  });
  const incomingIds = new Set(normalizedIncoming.map((p) => p.id));
  const oldest = normalizedIncoming.reduce<string | null>(
    (min, p) => (p.createdAtIso && (!min || p.createdAtIso < min) ? p.createdAtIso : min),
    null,
  );
  const keptServer = current.filter((p) => {
    if (!p.fromServer || incomingIds.has(p.id)) return false;
    if (mode === "extra") return true;
    // En modo feed, lo que cae dentro del rango del feed y no vino ya no existe.
    return Boolean(oldest && p.createdAtIso && p.createdAtIso < oldest);
  });
  const real = [...normalizedIncoming, ...keptServer].sort((a, b) =>
    (b.createdAtIso ?? "").localeCompare(a.createdAtIso ?? ""),
  );
  const pending = current.filter(isPendingPost);
  const examples = current.filter((p) => p.isExample);
  return [...pending, ...real, ...examples];
}
