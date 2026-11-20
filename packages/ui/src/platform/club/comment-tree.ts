import type { SocialComment } from "../types";

export interface CommentTreeNode {
  comment: SocialComment;
  children: CommentTreeNode[];
  descendantCount: number;
}

/**
 * Construye el árbol de hilos multinivel respetando el orden de llegada.
 * Si el padre no está en el corte actual (p. ej. últimos 30), promueve la respuesta a raíz
 * manteniendo su `replyToHandle` para conservar el contexto.
 */
export function buildCommentTree(comments: readonly SocialComment[]): CommentTreeNode[] {
  const nodesById = new Map<string, CommentTreeNode>();
  for (const comment of comments) {
    if (!nodesById.has(comment.id)) {
      nodesById.set(comment.id, { comment, children: [], descendantCount: 0 });
    }
  }

  const attachedParent = new Map<string, string>();
  const createsCycle = (nodeId: string, parentId: string): boolean => {
    let cursor: string | undefined = parentId;
    const seen = new Set<string>([nodeId]);
    while (cursor) {
      if (seen.has(cursor)) return true;
      seen.add(cursor);
      cursor = attachedParent.get(cursor);
    }
    return false;
  };

  const roots: CommentTreeNode[] = [];
  for (const comment of comments) {
    const node = nodesById.get(comment.id);
    if (!node) continue;
    const parentId = comment.parentCommentId ?? null;
    const parentNode = parentId ? nodesById.get(parentId) : undefined;
    if (parentNode && !createsCycle(comment.id, parentId!)) {
      attachedParent.set(comment.id, parentId!);
      parentNode.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const countDescendants = (node: CommentTreeNode): number => {
    let total = 0;
    for (const child of node.children) {
      total += 1 + countDescendants(child);
    }
    node.descendantCount = total;
    return total;
  };
  for (const root of roots) {
    countDescendants(root);
  }

  return roots;
}

/**
 * Elimina un comentario y sube sus respuestas directas al padre anterior
 * para mantener intacto el resto del hilo.
 */
export function reparentDeletedComment(
  comments: readonly SocialComment[],
  commentId: string,
): SocialComment[] {
  const target = comments.find((c) => c.id === commentId);
  if (!target) return [...comments];
  const nextParentId = target.parentCommentId ?? null;
  const nextParentHandle = nextParentId
    ? (comments.find((c) => c.id === nextParentId)?.authorHandle ?? null)
    : null;

  return comments
    .filter((c) => c.id !== commentId)
    .map((c) =>
      c.parentCommentId === commentId
        ? { ...c, parentCommentId: nextParentId, replyToHandle: nextParentHandle }
        : c,
    );
}
