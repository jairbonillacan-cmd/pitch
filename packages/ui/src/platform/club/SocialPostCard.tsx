"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { canonicalGameHref, LEAGUE_CATALOG, type LeagueId } from "@pitchlab/contracts";
import { LeagueBadge, TeamBadge } from "../../sports";
import { formatOddsValue } from "../access-guard";
import { getExampleAnalystSpec } from "../community-examples";
import { ExampleBadge, MaestroIcon, VerifiedSeal } from "../components/MaestroPrimitives";
import { ConfirmActionDialog } from "../components/PlatformOverlays";
import type { RankedAnalyst } from "../profile-stats";
import { formatUnits } from "../profile-stats";
import type { JournalEntry, MatchPick, OddsFormat, PlatformDataset, SocialComment, SocialPost } from "../types";
import { BadgeChip } from "./badges/ProfileBadges";
import { buildCommentTree, type CommentTreeNode } from "./comment-tree";
import {
  Avatar,
  CommentIcon,
  HeartIcon,
  PickStatus,
  ShareIcon,
  SocialReportMenu,
  resolveEntryGame,
  shareUrl,
  type EntryGameMeta,
  type OwnIdentity,
  type SocialReportTarget,
} from "./community-ui";

export const SOCIAL_POST_MAX_CHARS = 600;
export const SOCIAL_COMMENT_MAX_CHARS = 400;

export interface SocialPostAuthor {
  handle: string;
  name: string;
  initials: string;
  gradVar: string;
  avatarUrl?: string | null;
  isTipster: boolean;
  saldo: string | null;
}

export function isPlainClick(e: React.MouseEvent<HTMLAnchorElement>): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

function kickoffShortLabel(iso?: string, timeZone?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  });
  return `${d.toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    ...(timeZone ? { timeZone } : {}),
  })} ${time}`;
}

const LEAGUE_ID_BY_LABEL: Record<string, LeagueId> = Object.fromEntries(
  LEAGUE_CATALOG.flatMap((c) => [
    [c.name.toLowerCase(), c.id] as const,
    [c.shortName.toLowerCase(), c.id] as const,
  ]),
);

export function resolveLeagueIdFromLabel(leagueLabel: string): LeagueId | null {
  const key = leagueLabel.trim().toLowerCase();
  return LEAGUE_ID_BY_LABEL[key] ?? null;
}

export function resolvePostAuthor(
  post: SocialPost,
  own: OwnIdentity | null,
  seasonRanked: readonly RankedAnalyst[],
): SocialPostAuthor {
  const spec = getExampleAnalystSpec(post.authorHandle);
  const isOwnPost = own?.handle === post.authorHandle;
  const avatarUrl = spec
    ? null
    : ((isOwnPost ? (own?.avatarUrl ?? post.authorAvatarUrl) : post.authorAvatarUrl) ?? null);
  const ranked = seasonRanked.find((r) => r.handle === post.authorHandle);

  let saldo: string | null = null;
  if (ranked && ranked.record.settled > 0) {
    saldo = formatUnits(ranked.record.netUnits);
  } else if (post.verifiedRecord && post.verifiedRecord !== "Sin picks liquidados") {
    const showClv = post.clvBadge && !post.clvBadge.endsWith("—");
    saldo = showClv ? `${post.verifiedRecord} · ${post.clvBadge}` : post.verifiedRecord;
  } else if (post.verifiedRecord === "Sin picks liquidados") {
    saldo = "Sin picks liquidados";
  }

  return {
    handle: post.authorHandle,
    name: isOwnPost && !spec ? own!.name : post.authorName,
    initials:
      spec?.avatarInitials ??
      (isOwnPost ? own!.avatarInitials : post.authorName.split(/\s+/).map((w) => w[0]).join("").slice(0, 2)),
    gradVar: spec?.avatarGradVar ?? post.avatarGradVar,
    avatarUrl,
    isTipster: spec?.isTipster ?? Boolean(post.authorIsTipster || post.roleBadge === "Tipster Oficial"),
    saldo,
  };
}

export interface SocialPostCardProps {
  post: SocialPost;
  author: SocialPostAuthor;
  own: OwnIdentity | null;
  dataset: PlatformDataset;
  journal?: readonly JournalEntry[];
  oddsFormat: OddsFormat;
  variant?: "feed" | "profile" | "compact";
  following?: boolean;
  onToggleFollow?: (handle: string) => void;
  onCopy?: (post: SocialPost) => void;
  onCopyToParlay?: (post: SocialPost) => void;
  onShare: (post: SocialPost) => void;
  toggleSocialLike: (postId: string) => void;
  addSocialComment: (
    postId: string,
    body: string,
    parentCommentId?: string | null,
  ) => { ok: boolean; error?: string; pending?: boolean };
  onDeleteComment?: (postId: string, commentId: string) => void;
  onToggleCommentHelpful?: (postId: string, commentId: string) => void;
  onLoadAllComments?: (postId: string) => Promise<void>;
  onDeletePost?: (postId: string) => void;
  onOpenReport?: (target: SocialReportTarget) => void;
  onNavigate?: (href: string) => void;
  goProfile: (handle: string) => (e: React.MouseEvent<HTMLAnchorElement>) => void;
  highlighted?: boolean;
}

function resolveEffectivePickStatus(
  post: SocialPost,
  journal: readonly JournalEntry[],
): NonNullable<SocialPost["pick"]>["status"] | null {
  if (!post.pick) return null;
  if (post.pick.status !== "open") return post.pick.status;
  const localMatch = journal.find((j) => j.pickId === post.pick!.pickId);
  if (localMatch && localMatch.status !== "pending") return localMatch.status;
  return "open";
}

function commentAvatarFor(comment: SocialComment, own: OwnIdentity | null): string | null | undefined {
  return own?.handle === comment.authorHandle
    ? (own.avatarUrl ?? comment.authorAvatarUrl)
    : comment.authorAvatarUrl;
}

function commentInitialsFor(comment: SocialComment): string {
  return comment.authorName
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function shareSocialPost(
  post: SocialPost,
  pushToast: (text: string, tone?: "default" | "success" | "warning" | "danger") => void,
): void {
  void shareUrl(
    `/app/social?post=${encodeURIComponent(post.id)}`,
    `${post.authorName} en PitchLab`,
    () => pushToast("Copiamos el enlace.", "success"),
    () => pushToast("No pudimos compartir.", "warning"),
  );
}

export function copyPostPickToJournal(
  post: SocialPost,
  deps: {
    dataset: PlatformDataset;
    sealPickToJournal: (pick: MatchPick, units: number, userDecimal: number) => void;
    recordSocialPostCopy: (postId: string) => void;
    pushToast: (text: string, tone?: "default" | "success" | "warning" | "danger") => void;
  },
): void {
  if (!post.pick) return;
  const game = deps.dataset.games.find((g) => g.id === post.pick!.gameId);
  const pick = game?.picks.find((p) => p.id === post.pick!.pickId);
  if (!pick) {
    deps.pushToast("Ese partido ya no está disponible para registrar.", "warning");
    return;
  }
  deps.sealPickToJournal(pick, post.pick.units, post.pick.userDecimal);
  deps.recordSocialPostCopy(post.id);
}

export function copyPostPickToParlay(
  post: SocialPost,
  deps: {
    dataset: PlatformDataset;
    addPickToParlay: (pick: MatchPick) => boolean;
    pushToast: (text: string, tone?: "default" | "success" | "warning" | "danger") => void;
  },
): void {
  if (!post.pick) return;
  const game = deps.dataset.games.find((g) => g.id === post.pick!.gameId);
  const pick = game?.picks.find((p) => p.id === post.pick!.pickId);
  if (!pick || game?.status !== "NS") {
    deps.pushToast("Ese partido ya no está disponible para tu parlay.", "warning");
    return;
  }
  if (deps.addPickToParlay(pick)) deps.pushToast(`Agregamos «${pick.label}» a tu parlay.`, "success");
}

export const SocialPostCard = React.memo(function SocialPostCard({
  post,
  author,
  own,
  dataset,
  journal = [],
  oddsFormat,
  variant = "feed",
  following = false,
  onToggleFollow,
  onCopy,
  onCopyToParlay,
  onShare,
  toggleSocialLike,
  addSocialComment,
  onDeleteComment,
  onToggleCommentHelpful,
  onLoadAllComments,
  onDeletePost,
  onOpenReport,
  onNavigate,
  goProfile,
  highlighted = false,
}: SocialPostCardProps): React.JSX.Element {
  const uid = useId();
  const cardRef = useRef<HTMLElement>(null);
  const inlineReplyInputRef = useRef<HTMLInputElement>(null);
  const replyTriggerRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());

  const [threadOpen, setThreadOpen] = useState(highlighted);
  const [confirmDeletePost, setConfirmDeletePost] = useState(false);
  const [confirmDeleteCommentId, setConfirmDeleteCommentId] = useState<string | null>(null);
  const [inlineReplyTarget, setInlineReplyTarget] = useState<{ commentId: string; handle: string } | null>(null);
  const [inlineReply, setInlineReply] = useState("");
  const [inlineReplyError, setInlineReplyError] = useState("");
  const [collapsedThreads, setCollapsedThreads] = useState<Set<string>>(() => new Set());
  const [reply, setReply] = useState("");
  const [replyError, setReplyError] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  useEffect(() => {
    if (!highlighted) return;
    setThreadOpen(true);
    cardRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }, [highlighted]);

  useEffect(() => {
    if (!shareCopied) return;
    const t = window.setTimeout(() => setShareCopied(false), 1800);
    return () => window.clearTimeout(t);
  }, [shareCopied]);

  const isMine = Boolean(post.isMine || own?.handle === post.authorHandle);
  const canDeletePost = Boolean(post.fromServer && isMine && onDeletePost);
  const canReportPost = Boolean(!isMine && !post.isExample && onOpenReport);

  const pick = post.pick;
  const pickStatus = resolveEffectivePickStatus(post, journal);
  const targetGameId = pick?.gameId ?? post.gameId;
  const meta: EntryGameMeta | null = targetGameId ? resolveEntryGame(targetGameId, dataset) : null;
  const resolvedLeague = meta?.league ?? resolveLeagueIdFromLabel(post.leagueLabel);
  const matchedGame = targetGameId ? dataset.games.find((g) => g.id === targetGameId) : null;
  const gameHref = matchedGame
    ? canonicalGameHref(matchedGame.league, matchedGame)
    : targetGameId && resolvedLeague
      ? `/app/${resolvedLeague}/g/${encodeURIComponent(targetGameId)}`
      : null;

  const units =
    pick && pickStatus
      ? pickStatus === "won"
        ? pick.units * (pick.userDecimal - 1)
        : pickStatus === "lost"
          ? -pick.units
          : null
      : null;

  const pickMeta =
    pick && pickStatus
      ? pickStatus === "open"
        ? [
            meta?.leagueLabel ?? post.leagueLabel,
            kickoffShortLabel(meta?.kickoffIso),
            formatOddsValue(pick.userDecimal, oddsFormat),
            `justo ${formatOddsValue(pick.fairDecimal, oddsFormat)}`,
            `modelo ${(pick.modelProbability * 100).toFixed(1)} %`,
          ]
        : [
            meta?.leagueLabel ?? post.leagueLabel,
            meta?.score ? `${meta.home.name} ${meta.score.home}–${meta.score.away} ${meta.away.name}` : post.matchLabel,
            formatOddsValue(pick.userDecimal, oddsFormat),
          ]
      : [];

  const totalComments = Math.max(post.commentsCount ?? 0, post.comments.length);
  const authorLatestReply = [...post.comments].reverse().find((c) => c.authorHandle === post.authorHandle);
  const previewComment = authorLatestReply ?? post.comments.at(-1);
  const commentTree = buildCommentTree(post.comments);

  const handleLinkClick = (href: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!onNavigate || !isPlainClick(e)) return;
    e.preventDefault();
    onNavigate(href);
  };

  const closeInlineReply = (restoreFocusForId?: string): void => {
    setInlineReplyTarget(null);
    setInlineReply("");
    setInlineReplyError("");
    if (restoreFocusForId) {
      window.requestAnimationFrame(() => replyTriggerRefs.current.get(restoreFocusForId)?.focus());
    }
  };

  const startReplyTo = (comment: SocialComment): void => {
    if (comment.pending) return;
    setThreadOpen(true);
    if (inlineReplyTarget?.commentId === comment.id) {
      closeInlineReply(comment.id);
      return;
    }
    setInlineReplyTarget({ commentId: comment.id, handle: comment.authorHandle });
    setInlineReply("");
    setInlineReplyError("");
    window.requestAnimationFrame(() => inlineReplyInputRef.current?.focus());
  };

  const toggleBranchCollapsed = (commentId: string): void => {
    setCollapsedThreads((prev) => {
      const next = new Set(prev);
      if (next.has(commentId)) {
        next.delete(commentId);
      } else {
        next.add(commentId);
      }
      return next;
    });
  };

  const handleLoadMoreComments = (): void => {
    if (!onLoadAllComments || loadingComments) return;
    setLoadingComments(true);
    void onLoadAllComments(post.id).finally(() => setLoadingComments(false));
  };

  const renderCommentNode = (node: CommentTreeNode, depth: number): React.JSX.Element => {
    const { comment, children, descendantCount } = node;
    const isReply = depth > 0;
    const isCommentMine = Boolean(comment.isMine || own?.handle === comment.authorHandle);
    const isPending = Boolean(comment.pending);
    const canDeleteComment = Boolean(isCommentMine && onDeleteComment && !isPending);
    const canToggleHelpful = Boolean(onToggleCommentHelpful && !isPending);
    const showReportComment = Boolean(
      !isCommentMine && !post.isExample && onOpenReport && comment.fromServer && !isPending,
    );
    const helpfulCount = comment.helpfulCount ?? 0;
    const isReplyingHere = inlineReplyTarget?.commentId === comment.id;
    const isBranchCollapsed = collapsedThreads.has(comment.id);
    const inlineFormId = `${uid}-inline-form-${comment.id}`;
    const inlineInputId = `${uid}-inline-input-${comment.id}`;
    const inlineErrId = `${uid}-inline-err-${comment.id}`;
    const branchListId = `${uid}-branch-${comment.id}`;
    const nextDepthAttr = depth >= 3 ? "max" : String(depth + 1);

    return (
      <li key={comment.id} className={`pl-com-comment-item${isReply ? " is-reply-node" : ""}`}>
        <div className="pl-com-comment-row">
          <a
            href={`/app/u/${comment.authorHandle}`}
            onClick={goProfile(comment.authorHandle)}
            className="pl-com-comment-avatar-link"
            tabIndex={-1}
            aria-hidden="true"
          >
            <Avatar
              initials={commentInitialsFor(comment)}
              avatarUrl={commentAvatarFor(comment, own)}
              gradVar={getExampleAnalystSpec(comment.authorHandle)?.avatarGradVar ?? "var(--avatar-grad-3)"}
              size={isReply ? 22 : 26}
              loading="lazy"
            />
          </a>
          <div className="pl-com-comment-body">
            <div className="pl-com-comment-head">
              <p className="pl-com-comment-meta">
                <a
                  href={`/app/u/${comment.authorHandle}`}
                  onClick={goProfile(comment.authorHandle)}
                  className="pl-com-comment-author"
                >
                  <strong>{comment.authorName}</strong>{" "}
                  <span className="pl-prof-muted">@{comment.authorHandle}</span>
                </a>
                {comment.verifiedBadge && comment.verifiedBadge !== "Sin picks liquidados" ? (
                  <span className="pl-com-comment-record num">· {comment.verifiedBadge}</span>
                ) : null}
                <span className="pl-prof-muted">
                  · {isPending ? "Enviando…" : comment.createdAt.toLowerCase()}
                </span>
              </p>
              {showReportComment ? (
                <SocialReportMenu
                  compact
                  triggerLabel={`Más opciones del comentario de ${comment.authorName}`}
                  onReport={() =>
                    onOpenReport!({
                      kind: "comment",
                      commentId: comment.id,
                      authorHandle: comment.authorHandle,
                    })
                  }
                />
              ) : null}
            </div>
            {comment.replyToHandle ? (
              <p className="pl-com-replying-tag">En respuesta a @{comment.replyToHandle}</p>
            ) : null}
            <p className="pl-com-comment-text">{comment.body}</p>
            <div className="pl-com-comment-actions num">
              {canToggleHelpful ? (
                <button
                  type="button"
                  className={`pl-com-comment-act min-h-11 sm:min-h-7${comment.helpfulByMe ? " is-on" : ""}`}
                  aria-pressed={Boolean(comment.helpfulByMe)}
                  aria-label={`Útil al comentario de ${comment.authorName}${helpfulCount > 0 ? `, ${helpfulCount}` : ""}`}
                  onClick={() => onToggleCommentHelpful!(post.id, comment.id)}
                >
                  <HeartIcon filled={Boolean(comment.helpfulByMe)} size={12} />
                  <span>Útil</span>
                  {helpfulCount > 0 ? <span>({helpfulCount})</span> : null}
                </button>
              ) : null}
              <button
                ref={(el) => {
                  if (el) replyTriggerRefs.current.set(comment.id, el);
                  else replyTriggerRefs.current.delete(comment.id);
                }}
                type="button"
                className={`pl-com-comment-act min-h-11 sm:min-h-7${isReplyingHere ? " is-on" : ""}`}
                disabled={isPending}
                aria-expanded={isReplyingHere}
                aria-controls={isReplyingHere ? inlineFormId : undefined}
                aria-label={`Responder a ${comment.authorName}`}
                onClick={() => startReplyTo(comment)}
              >
                Responder
              </button>
              {descendantCount > 0 ? (
                <button
                  type="button"
                  className="pl-com-comment-act min-h-11 sm:min-h-7"
                  aria-expanded={!isBranchCollapsed}
                  aria-controls={branchListId}
                  aria-label={`${isBranchCollapsed ? "Ver" : "Ocultar"} ${descendantCount} ${descendantCount === 1 ? "respuesta" : "respuestas"} al comentario de ${comment.authorName}`}
                  onClick={() => toggleBranchCollapsed(comment.id)}
                >
                  {isBranchCollapsed
                    ? `Ver ${descendantCount} ${descendantCount === 1 ? "respuesta" : "respuestas"}`
                    : `Ocultar ${descendantCount === 1 ? "respuesta" : `respuestas (${descendantCount})`}`}
                </button>
              ) : null}
              {canDeleteComment ? (
                <button
                  type="button"
                  className="pl-com-comment-act min-h-11 sm:min-h-7"
                  aria-label={`Borrar comentario de ${comment.authorName}`}
                  onClick={() => setConfirmDeleteCommentId(comment.id)}
                >
                  Borrar
                </button>
              ) : null}
            </div>

            {isReplyingHere ? (
              <div className="pl-com-inline-reply-wrap">
                <div className="pl-com-reply-banner">
                  <span>
                    Respondiendo a <strong>@{comment.authorHandle}</strong>
                  </span>
                  <button
                    type="button"
                    className="pl-com-comment-act min-h-11 sm:min-h-7"
                    onClick={() => closeInlineReply(comment.id)}
                  >
                    Cancelar
                  </button>
                </div>
                <form
                  id={inlineFormId}
                  className="pl-com-reply pl-com-reply--inline"
                  noValidate
                  onSubmit={(e) => {
                    e.preventDefault();
                    const res = addSocialComment(post.id, inlineReply, comment.id);
                    if (!res.ok) {
                      setInlineReplyError(res.error ?? "No pudimos enviar tu respuesta.");
                      inlineReplyInputRef.current?.focus();
                      return;
                    }
                    setCollapsedThreads((prev) => {
                      if (!prev.has(comment.id)) return prev;
                      const next = new Set(prev);
                      next.delete(comment.id);
                      return next;
                    });
                    closeInlineReply();
                  }}
                >
                  <label className="sr-only" htmlFor={inlineInputId}>
                    Respuesta a @{comment.authorHandle}
                  </label>
                  <input
                    ref={inlineReplyInputRef}
                    id={inlineInputId}
                    name="inlineReply"
                    value={inlineReply}
                    maxLength={SOCIAL_COMMENT_MAX_CHARS}
                    enterKeyHint="send"
                    placeholder={`Responde a @${comment.authorHandle}…`}
                    className="min-h-11 sm:min-h-10 text-base sm:text-sm min-w-0"
                    aria-invalid={inlineReplyError ? true : undefined}
                    aria-describedby={inlineReplyError ? inlineErrId : undefined}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        e.preventDefault();
                        closeInlineReply(comment.id);
                      }
                    }}
                    onChange={(e) => {
                      setInlineReply(e.target.value);
                      if (inlineReplyError) setInlineReplyError("");
                    }}
                  />
                  {inlineReply.length >= Math.round(SOCIAL_COMMENT_MAX_CHARS * 0.7) ? (
                    <span className="pl-com-char-count num">
                      {inlineReply.length}/{SOCIAL_COMMENT_MAX_CHARS}
                    </span>
                  ) : null}
                  <button
                    type="submit"
                    className="pl-prof-btn pl-prof-btn--primary pl-prof-btn--sm min-h-11 sm:min-h-9"
                  >
                    Responder
                  </button>
                </form>
                <div id={inlineErrId} aria-live="polite">
                  {inlineReplyError ? (
                    <p className="pl-com-error" role="alert">
                      {inlineReplyError}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {children.length > 0 && !isBranchCollapsed ? (
          <ul id={branchListId} className="pl-com-thread-children" data-depth={nextDepthAttr}>
            {children.map((child) => renderCommentNode(child, depth + 1))}
          </ul>
        ) : null}
      </li>
    );
  };

  const articleClasses = [
    "pl-com-post",
    "glass-lens",
    "glass-ring",
    variant === "profile" ? "pl-prof-post" : "",
    variant === "compact" ? "pl-com-post--compact" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const copiesCount = post.copiesCount ?? 0;

  return (
    <article
      ref={cardRef}
      id={`post-${post.id}`}
      data-highlighted={highlighted ? "true" : undefined}
      className={articleClasses}
      aria-labelledby={`${uid}-author`}
    >
      {variant === "profile" ? (
        <div className="pl-prof-post-meta">
          <span className="pl-prof-post-league">
            {resolvedLeague ? <LeagueBadge league={resolvedLeague} size={16} /> : null}
            <span>{post.leagueLabel}</span>
            {post.isExample ? <ExampleBadge className="pl-com-example" /> : null}
          </span>
          <span className="pl-com-meta-end">
            <a
              id={`${uid}-author`}
              href={`/app/u/${post.authorHandle}`}
              onClick={goProfile(post.authorHandle)}
              className="pl-prof-muted"
            >
              @{post.authorHandle}
            </a>
            <span>· {post.createdAt.toLowerCase()}</span>
            {canReportPost ? (
              <SocialReportMenu
                compact
                triggerLabel={`Más opciones de la publicación de @${post.authorHandle}`}
                onReport={() =>
                  onOpenReport!({
                    kind: "post",
                    postId: post.id,
                    authorHandle: post.authorHandle,
                  })
                }
              />
            ) : null}
          </span>
        </div>
      ) : (
        <header className="pl-com-post-head">
          <a
            href={`/app/u/${post.authorHandle}`}
            onClick={goProfile(post.authorHandle)}
            className="pl-com-post-avatar"
            tabIndex={-1}
            aria-hidden="true"
          >
            <Avatar
              initials={author.initials}
              avatarUrl={author.avatarUrl}
              gradVar={author.gradVar}
              size={variant === "compact" ? 34 : 42}
              loading="lazy"
            />
          </a>
          <div className="pl-com-post-who">
            <p className="pl-com-post-name flex-wrap">
              <a id={`${uid}-author`} href={`/app/u/${post.authorHandle}`} onClick={goProfile(post.authorHandle)}>
                {author.name}
              </a>
              {author.isTipster ? <VerifiedSeal size={16} /> : null}
              {post.authorBadge ? <BadgeChip badge={post.authorBadge} size="sm" className="pl-com-post-badge" /> : null}
              {post.isExample ? <ExampleBadge className="pl-com-example" /> : null}
            </p>
            <p className="pl-com-post-sub num">
              @{post.authorHandle}
              {author.saldo ? ` · ${author.saldo}` : ""} · {post.createdAt.toLowerCase()}
            </p>
          </div>
          {!isMine && onToggleFollow ? (
            <button
              type="button"
              className={`pl-prof-btn pl-prof-btn--sm min-h-11 sm:min-h-9 shrink-0 ${following ? "pl-prof-btn--ghost" : "pl-prof-btn--primary"} pl-com-follow`}
              aria-pressed={following}
              aria-label={`${following ? "Siguiendo" : "Seguir"} a ${author.name}`}
              onClick={() => onToggleFollow(post.authorHandle)}
            >
              {following ? "Siguiendo" : "Seguir"}
            </button>
          ) : null}
          {canReportPost ? (
            <SocialReportMenu
              compact={variant === "compact"}
              triggerLabel={`Más opciones de la publicación de ${author.name}`}
              onReport={() =>
                onOpenReport!({
                  kind: "post",
                  postId: post.id,
                  authorHandle: post.authorHandle,
                })
              }
            />
          ) : null}
        </header>
      )}

      <p className="pl-com-post-body">{post.body}</p>

      {pick && pickStatus ? (
        gameHref ? (
          <a
            href={gameHref}
            onClick={handleLinkClick(gameHref)}
            className="pl-com-pick pl-com-pick--link"
            style={{
              background: "var(--pl-surface-elevated)",
              border: "1px solid var(--pl-border)",
            }}
          >
            {meta ? (
              <span className="pl-prof-teams" aria-hidden="true">
                <TeamBadge league={meta.league} slug={meta.home.slug} name={meta.home.name} size={28} decorative />
                <span className="pl-prof-teams-away">
                  <TeamBadge league={meta.league} slug={meta.away.slug} name={meta.away.name} size={28} decorative />
                </span>
              </span>
            ) : null}
            <div className="pl-com-pick-copy">
              <p className="pl-prof-row-title">
                {pick.label} · <span className="num">{pick.units.toFixed(1)}u</span>
              </p>
              <p className="pl-prof-row-sub num">{pickMeta.filter(Boolean).join(" · ")}</p>
            </div>
            <PickStatus status={pickStatus} detail={units === null ? undefined : formatUnits(units)} />
          </a>
        ) : (
          <div
            className="pl-com-pick"
            style={{
              background: "var(--pl-surface-elevated)",
              border: "1px solid var(--pl-border)",
            }}
          >
            {meta ? (
              <span className="pl-prof-teams" aria-hidden="true">
                <TeamBadge league={meta.league} slug={meta.home.slug} name={meta.home.name} size={28} decorative />
                <span className="pl-prof-teams-away">
                  <TeamBadge league={meta.league} slug={meta.away.slug} name={meta.away.name} size={28} decorative />
                </span>
              </span>
            ) : null}
            <div className="pl-com-pick-copy">
              <p className="pl-prof-row-title">
                {pick.label} · <span className="num">{pick.units.toFixed(1)}u</span>
              </p>
              <p className="pl-prof-row-sub num">{pickMeta.filter(Boolean).join(" · ")}</p>
            </div>
            <PickStatus status={pickStatus} detail={units === null ? undefined : formatUnits(units)} />
          </div>
        )
      ) : gameHref && post.matchLabel && variant !== "compact" ? (
        <a
          href={gameHref}
          onClick={handleLinkClick(gameHref)}
          className="pl-com-match-chip min-h-11 sm:min-h-8 min-w-0"
          style={{
            background: "var(--pl-surface-elevated)",
            border: "1px solid var(--pl-border)",
          }}
        >
          {resolvedLeague ? <LeagueBadge league={resolvedLeague} size={15} /> : null}
          <span className="truncate">{post.matchLabel}</span>
          {post.pickBadge ? <span className="pl-prof-muted truncate">· {post.pickBadge}</span> : null}
        </a>
      ) : null}

      {copiesCount > 0 && pick ? (
        <p className="pl-com-copies-note num">
          {copiesCount} {copiesCount === 1 ? "socio lo siguió" : "socios lo siguieron"}
        </p>
      ) : null}

      <div className="pl-com-actions num">
        <button
          type="button"
          className={`pl-com-act min-h-11 sm:min-h-9 ${post.likedByMe ? "is-on" : ""}`}
          aria-pressed={Boolean(post.likedByMe)}
          aria-label={`Me gusta, ${post.likes}`}
          onClick={() => toggleSocialLike(post.id)}
        >
          <HeartIcon filled={Boolean(post.likedByMe)} />
          <span>{post.likes}</span>
        </button>
        <button
          type="button"
          className="pl-com-act min-h-11 sm:min-h-9"
          aria-expanded={threadOpen}
          aria-controls={`${uid}-thread`}
          aria-label={`Comentarios, ${totalComments}`}
          onClick={() => setThreadOpen((v) => !v)}
        >
          <CommentIcon />
          <span>{totalComments}</span>
        </button>
        {pick && !isMine && onCopy ? (
          <button
            type="button"
            className="pl-com-act min-h-11 sm:min-h-9"
            aria-label="Copiar a mi récord"
            onClick={() => onCopy(post)}
          >
            <MaestroIcon name="copy" size={15} />
            A mi récord
          </button>
        ) : null}
        {pick && pickStatus === "open" && onCopyToParlay ? (
          <button
            type="button"
            className="pl-com-act min-h-11 sm:min-h-9"
            aria-label="Copiar a mi parlay"
            onClick={() => onCopyToParlay(post)}
          >
            <MaestroIcon name="layers" size={15} />
            A mi parlay
          </button>
        ) : null}
        {canDeletePost ? (
          <button
            type="button"
            className="pl-com-act pl-com-act--end min-h-11 sm:min-h-9"
            aria-label="Borrar publicación"
            onClick={() => setConfirmDeletePost(true)}
          >
            <MaestroIcon name="trash" size={15} />
          </button>
        ) : null}
        <button
          type="button"
          className={`pl-com-act min-h-11 sm:min-h-9 ${canDeletePost ? "" : "pl-com-act--end"}`}
          aria-label={shareCopied ? "Compartir, enlace copiado" : "Compartir"}
          onClick={() => {
            setShareCopied(true);
            onShare(post);
          }}
        >
          {shareCopied ? <MaestroIcon name="check" size={15} /> : <ShareIcon size={16} />}
        </button>
      </div>

      <div id={`${uid}-thread`}>
        {!threadOpen && previewComment ? (
          <div className="pl-com-comment-preview">
            <a
              href={`/app/u/${previewComment.authorHandle}`}
              onClick={goProfile(previewComment.authorHandle)}
              className="pl-com-comment-avatar-link"
              tabIndex={-1}
              aria-hidden="true"
            >
              <Avatar
                initials={commentInitialsFor(previewComment)}
                avatarUrl={commentAvatarFor(previewComment, own)}
                gradVar={getExampleAnalystSpec(previewComment.authorHandle)?.avatarGradVar ?? "var(--avatar-grad-3)"}
                size={28}
                loading="lazy"
              />
            </a>
            <div className="pl-com-comment-preview-body">
              <div className="pl-com-comment-head">
                <p className="pl-com-comment-meta">
                  <a
                    href={`/app/u/${previewComment.authorHandle}`}
                    onClick={goProfile(previewComment.authorHandle)}
                    className="pl-com-comment-author"
                  >
                    <strong>{previewComment.authorName}</strong>{" "}
                    <span className="pl-prof-muted">@{previewComment.authorHandle}</span>
                  </a>
                  {previewComment.verifiedBadge && previewComment.verifiedBadge !== "Sin picks liquidados" ? (
                    <span className="pl-com-comment-record num">· {previewComment.verifiedBadge}</span>
                  ) : null}
                </p>
                {!(previewComment.isMine || own?.handle === previewComment.authorHandle) &&
                !post.isExample &&
                onOpenReport &&
                !previewComment.id.startsWith("sc-") ? (
                  <SocialReportMenu
                    compact
                    triggerLabel={`Más opciones del comentario de ${previewComment.authorName}`}
                    onReport={() =>
                      onOpenReport({
                        kind: "comment",
                        commentId: previewComment.id,
                        authorHandle: previewComment.authorHandle,
                      })
                    }
                  />
                ) : null}
              </div>
              <button
                type="button"
                className="pl-com-preview-btn min-h-11 sm:min-h-8"
                onClick={() => setThreadOpen(true)}
                aria-label={`Abrir conversación con ${previewComment.authorName}`}
              >
                {previewComment.replyToHandle ? (
                  <span className="pl-com-replying-tag">En respuesta a @{previewComment.replyToHandle}</span>
                ) : null}
                <span>{previewComment.body}</span>
                {totalComments > 1 ? (
                  <span className="pl-com-more-comments">Ver los {totalComments} comentarios</span>
                ) : null}
              </button>
            </div>
          </div>
        ) : null}

        {threadOpen ? (
          <div className="pl-com-thread">
            {totalComments > post.comments.length && onLoadAllComments ? (
              <div className="pl-com-thread-more">
                <button
                  type="button"
                  className="pl-com-more-comments min-h-11 sm:min-h-9"
                  disabled={loadingComments}
                  onClick={handleLoadMoreComments}
                >
                  {loadingComments
                    ? "Cargando comentarios…"
                    : `Ver ${totalComments - post.comments.length} comentarios anteriores`}
                </button>
              </div>
            ) : null}
            {commentTree.length > 0 ? (
              <ul className="pl-com-thread-list">
                {commentTree.map((rootNode) => renderCommentNode(rootNode, 0))}
              </ul>
            ) : null}
            <form
              className="pl-com-reply"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                const res = addSocialComment(post.id, reply, null);
                if (!res.ok) {
                  setReplyError(res.error ?? "No pudimos comentar.");
                  return;
                }
                setReply("");
                setReplyError("");
              }}
            >
              <label className="sr-only" htmlFor={`${uid}-reply`}>
                Comentar en la publicación
              </label>
              <input
                id={`${uid}-reply`}
                name="comment"
                value={reply}
                maxLength={SOCIAL_COMMENT_MAX_CHARS}
                enterKeyHint="send"
                placeholder="Escribe un comentario…"
                className="min-h-11 sm:min-h-10 text-base sm:text-sm min-w-0"
                aria-invalid={replyError ? true : undefined}
                aria-describedby={replyError ? `${uid}-reply-err` : undefined}
                onChange={(e) => {
                  setReply(e.target.value);
                  if (replyError) setReplyError("");
                }}
              />
              {reply.length >= Math.round(SOCIAL_COMMENT_MAX_CHARS * 0.7) ? (
                <span className="pl-com-char-count num">
                  {reply.length}/{SOCIAL_COMMENT_MAX_CHARS}
                </span>
              ) : null}
              <button
                type="submit"
                className="pl-prof-btn pl-prof-btn--ghost pl-prof-btn--sm min-h-11 sm:min-h-9"
              >
                Comentar
              </button>
            </form>
            <div id={`${uid}-reply-err`} aria-live="polite">
              {replyError ? (
                <p className="pl-com-error" role="alert">
                  {replyError}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {canDeletePost ? (
        <ConfirmActionDialog
          open={confirmDeletePost}
          title="¿Borrar esta publicación?"
          description="La publicación y sus comentarios se eliminarán permanentemente de Comunidad."
          confirmLabel="Borrar publicación"
          onConfirm={() => onDeletePost!(post.id)}
          onCancel={() => setConfirmDeletePost(false)}
        />
      ) : null}

      {onDeleteComment ? (
        <ConfirmActionDialog
          open={confirmDeleteCommentId !== null}
          title="¿Borrar este comentario?"
          description="El comentario se eliminará permanentemente de esta conversación."
          confirmLabel="Borrar comentario"
          onConfirm={() => {
            if (!confirmDeleteCommentId) return;
            if (inlineReplyTarget?.commentId === confirmDeleteCommentId) {
              closeInlineReply();
            }
            onDeleteComment(post.id, confirmDeleteCommentId);
          }}
          onCancel={() => setConfirmDeleteCommentId(null)}
        />
      ) : null}
    </article>
  );
});
