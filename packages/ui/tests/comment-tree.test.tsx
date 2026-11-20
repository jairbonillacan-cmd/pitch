import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildCommentTree, reparentDeletedComment } from "../src/platform/club/comment-tree";
import { SocialPostCard, resolvePostAuthor } from "../src/platform/club/SocialPostCard";
import { buildPlatformDataset } from "../src/platform/match-picks-engine";
import type { SocialComment, SocialPost } from "../src/platform/types";

function makeComment(
  id: string,
  authorHandle: string,
  parentCommentId: string | null = null,
  replyToHandle: string | null = null,
): SocialComment {
  return {
    id,
    parentCommentId,
    replyToHandle,
    authorHandle,
    authorName: authorHandle,
    verifiedBadge: "+2.0u",
    createdAt: "Ahora",
    body: `Mensaje ${id}`,
  };
}

describe("hilos de comentarios multinivel (comment-tree + SocialPostCard)", () => {
  it("construye árbol multinivel con conteo de descendientes y protege contra huérfanos/ciclos", () => {
    const comments: SocialComment[] = [
      makeComment("c1", "ana"),
      makeComment("c2", "beto", "c1", "ana"),
      makeComment("c3", "carla", "c2", "beto"),
      makeComment("c4", "diego", "c3", "carla"),
      makeComment("c5", "elena", "missing-parent", "otro"),
    ];

    const tree = buildCommentTree(comments);
    expect(tree).toHaveLength(2);
    expect(tree[0]?.comment.id).toBe("c1");
    expect(tree[0]?.descendantCount).toBe(3);
    expect(tree[0]?.children[0]?.comment.id).toBe("c2");
    expect(tree[0]?.children[0]?.descendantCount).toBe(2);
    expect(tree[0]?.children[0]?.children[0]?.comment.id).toBe("c3");
    expect(tree[0]?.children[0]?.children[0]?.children[0]?.comment.id).toBe("c4");

    // Respuesta huérfana por corte del feed se promueve a raíz conservando replyToHandle.
    expect(tree[1]?.comment.id).toBe("c5");
    expect(tree[1]?.comment.replyToHandle).toBe("otro");

    // Protección ante ciclos sin colgarse.
    const cyclic = [
      makeComment("x1", "ana", "x2", "beto"),
      makeComment("x2", "beto", "x1", "ana"),
    ];
    expect(buildCommentTree(cyclic)).toHaveLength(1);
  });

  it("reparentDeletedComment sube las respuestas hijas al padre anterior o a raíz", () => {
    const list = [
      makeComment("r1", "ana"),
      makeComment("r2", "beto", "r1", "ana"),
      makeComment("r3", "carla", "r2", "beto"),
    ];
    const afterMiddle = reparentDeletedComment(list, "r2");
    expect(afterMiddle.map((c) => c.id)).toEqual(["r1", "r3"]);
    expect(afterMiddle[1]).toMatchObject({ parentCommentId: "r1", replyToHandle: "ana" });

    const afterRoot = reparentDeletedComment(afterMiddle, "r1");
    expect(afterRoot).toHaveLength(1);
    expect(afterRoot[0]).toMatchObject({ id: "r3", parentCommentId: null, replyToHandle: null });
  });

  it("renderiza listas anidadas, tope visual en profundidad 4 y botones accesibles por autor", () => {
    const dataset = buildPlatformDataset([]);
    const post: SocialPost = {
      id: "post-thread-1",
      authorHandle: "sofia_nfl",
      authorName: "Sofía Méndez",
      roleBadge: "Tipster Oficial",
      avatarGradVar: "var(--avatar-grad-1)",
      verifiedRecord: "+18.4u",
      clvBadge: "Ventaja +4.2 %",
      leagueLabel: "Liga MX",
      matchLabel: "América vs Chivas",
      pickBadge: "Over 2.5",
      originType: "Bitácora Propia",
      createdAt: "Hace 10 min",
      body: "Lectura del partido.",
      likes: 5,
      commentsCount: 5,
      comments: [
        makeComment("n0", "ana", null, null),
        makeComment("n1", "beto", "n0", "ana"),
        makeComment("n2", "carla", "n1", "beto"),
        makeComment("n3", "diego", "n2", "carla"),
        makeComment("n4", "elena", "n3", "diego"),
      ],
    };

    const html = renderToStaticMarkup(
      <SocialPostCard
        post={post}
        author={resolvePostAuthor(post, null, [])}
        own={{ handle: "ana", name: "ana", avatarInitials: "AN", avatarGradVar: "var(--avatar-grad-4)" }}
        dataset={dataset}
        oddsFormat="decimal"
        highlighted
        onShare={() => {}}
        goProfile={() => () => {}}
        toggleSocialLike={() => {}}
        addSocialComment={() => ({ ok: true })}
        onToggleCommentHelpful={() => {}}
        onDeleteComment={() => {}}
      />,
    );

    expect(html).toContain('class="pl-com-thread-list"');
    expect(html).toContain('class="pl-com-thread-children" data-depth="1"');
    expect(html).toContain('class="pl-com-thread-children" data-depth="2"');
    expect(html).toContain('class="pl-com-thread-children" data-depth="3"');
    expect(html).toContain('class="pl-com-thread-children" data-depth="max"');
    expect(html).toContain("En respuesta a @diego");
    expect(html).toContain("Ocultar respuestas (4)");
    expect(html).toContain('aria-label="Responder a carla"');
  });
});
