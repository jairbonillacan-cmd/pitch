import { NextResponse } from "next/server";
import { createSanitizedErrorPayload, parseStrictFiniteNumber } from "@pitchlab/contracts";
import { createSocialPost, getSocialPostById, listSocialFeed } from "@pitchlab/db";
import { z } from "zod";
import {
  ApiGuardHttpError,
  readBoundedJson,
  withActivePaseMutation,
  withSessionRead,
} from "../../../../src/server/api-guards";
import { withAuthorBadges } from "../../../../src/server/badges";
import { hasControlOrBidiChars, sanitizeQueryText } from "../../../../src/server/query-params";
import { parseNewPost, reasonResponse } from "../../../../src/server/social";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FEED_LIMIT_MAX = 40;

const SocialPickInputSchema = z
  .object({
    pickId: z.string().trim().min(1).max(120),
    gameId: z.string().trim().min(1).max(120),
    label: z.string().trim().min(1).max(120),
    units: z.number().gt(0).max(5),
    userDecimal: z.number().gt(1).max(1000),
    fairDecimal: z.number().gt(1).max(1000),
    modelProbability: z.number().min(0).max(1),
  })
  .strict();

const CreateSocialPostSchema = z
  .object({
    body: z.string().max(1200),
    leagueLabel: z.string().max(80).nullish(),
    matchLabel: z.string().max(160).nullish(),
    pickBadge: z.string().max(160).nullish(),
    gameId: z.string().max(128).nullish(),
    originType: z.string().max(60).nullish(),
    sealedJournalEntryId: z.string().max(64).nullish(),
    pick: SocialPickInputSchema.nullish(),
  })
  .strict();

export const GET = withSessionRead(
  {
    bucket: "social-posts-read",
    limit: 60,
    windowMs: 60_000,
    requireSocialHandle: true,
    watermark: true,
    resourceKey: ({ request }) => {
      const params = new URL(request.url).searchParams;
      return (
        sanitizeQueryText(params.get("before") ?? params.get("author") ?? params.get("gameId"), 128) ||
        "feed"
      );
    },
  },
  async ({ request, user }) => {
    const url = new URL(request.url);
    const before = url.searchParams.get("before");
    let beforeDate: Date | undefined;
    if (before !== null && before.trim() !== "") {
      const parsedTs = hasControlOrBidiChars(before) ? Number.NaN : Date.parse(before.trim());
      if (!Number.isFinite(parsedTs)) {
        const err = createSanitizedErrorPayload("INVALID_CURSOR", "Cursor de fecha inválido.");
        return NextResponse.json({ ok: false, error: err.message, code: err.code }, { status: 400 });
      }
      beforeDate = new Date(parsedTs);
    }
    const sort = url.searchParams.get("sort") === "most_commented" ? "most_commented" : "recent";
    const rawLimit = url.searchParams.get("limit");
    const parsedLimit = rawLimit === null ? null : parseStrictFiniteNumber(rawLimit);
    const limit =
      parsedLimit !== null && parsedLimit >= 1
        ? Math.min(Math.trunc(parsedLimit), FEED_LIMIT_MAX)
        : undefined;
    const posts = await listSocialFeed(user.db, user.userId, {
      limit,
      before: beforeDate,
      authorHandle: sanitizeQueryText(url.searchParams.get("author"), 32) || undefined,
      following: url.searchParams.get("following") === "1",
      gameId: sanitizeQueryText(url.searchParams.get("gameId"), 128) || undefined,
      leagueLabel: sanitizeQueryText(url.searchParams.get("league"), 60) || undefined,
      openPickOnly: url.searchParams.get("openPick") === "1",
      sort,
    });
    return NextResponse.json({ posts: await withAuthorBadges(user.db, posts) });
  },
);

export const POST = withActivePaseMutation(
  {
    bucket: "social-posts-write",
    limit: 20,
    windowMs: 60_000,
    requireSocialHandle: true,
  },
  async ({ request, user }) => {
    const raw = await readBoundedJson(request, 32_768).catch((err) => {
      if (err instanceof ApiGuardHttpError) throw err;
      return null;
    });
    const schemaRes = CreateSocialPostSchema.safeParse(raw);
    if (!schemaRes.success) {
      const err = createSanitizedErrorPayload("INVALID_INPUT", "Revisa los datos de tu publicación.");
      return NextResponse.json({ ok: false, error: err.message, code: err.code }, { status: 400 });
    }
    const parsed = parseNewPost(schemaRes.data);
    if (!parsed.ok) {
      const err = createSanitizedErrorPayload("INVALID_POST", parsed.error);
      return NextResponse.json({ ok: false, error: err.message, code: err.code }, { status: 400 });
    }
    const result = await createSocialPost(user.db, user.userId, parsed.post, new Date());
    if (!result.ok) return reasonResponse(result.reason);
    const post = await getSocialPostById(user.db, user.userId, result.id);
    const withBadge = post ? (await withAuthorBadges(user.db, [post]))[0] : null;
    return NextResponse.json({ post: withBadge ?? { id: result.id } }, { status: 201 });
  },
);
