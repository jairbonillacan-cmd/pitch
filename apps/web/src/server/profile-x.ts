import { betterAuth, type BetterAuthOptions } from "better-auth";
import { and, authAccount, eq, sql, users } from "@pitchlab/db";
import { getAuth, pitchLabAuthAdapter } from "./auth";
import { requireMember } from "./session-user";
import { parseTwitterProfile, twitterCredentials } from "./twitter";

function redirectTo(request: Request, path: string, response?: Response) {
  const headers = new Headers(response?.headers);
  headers.delete("content-length");
  headers.set("location", new URL(path, request.url).href);
  return new Response(null, { status: 303, headers });
}

export async function finishTwitterLink(request: Request): Promise<Response> {
  const auth = getAuth();
  if (!auth || !twitterCredentials()) return new Response(null, { status: 503 });
  const member = await requireMember(request);
  if ("error" in member) return redirectTo(request, "/login");
  const { db, userId, authUserId } = member;
  const invalidProfile = { error: "x_link_invalid" };

  // Keep Better Auth's account write and the public handle in the same transaction.
  return db.transaction(async (tx) => {
    const linking: { profile?: NonNullable<ReturnType<typeof parseTwitterProfile>> } = {};
    const options: BetterAuthOptions = {
      ...auth.options,
      database: pitchLabAuthAdapter(tx),
      account: {
        ...auth.options.account,
        accountLinking: { enabled: true, trustedProviders: ["twitter"], allowDifferentEmails: true },
      },
      user: {
        validateUserInfo: async ({ user, source }) => {
          if (source.method !== "oauth" || source.oauth?.providerId !== "twitter") return invalidProfile;
          if (source.action !== "link-account" || user.id !== authUserId) return invalidProfile;
          const profile = parseTwitterProfile(source.oauth.profile);
          if (!profile) return invalidProfile;

          // X account IDs cannot be linked to two members, even when callbacks race.
          await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`pitchlab:x:${profile.id}`}, 0))`);
          const [owner] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
          if (!owner) return invalidProfile;
          const accounts = await tx.select({ accountId: authAccount.accountId }).from(authAccount)
            .where(and(eq(authAccount.providerId, "twitter"), eq(authAccount.userId, authUserId)));
          if (accounts.some(({ accountId }) => accountId !== profile.id)) return invalidProfile;
          linking.profile = profile;
        },
      },
    };

    const response = await betterAuth(options).handler(request);
    const location = response.headers.get("location");
    const succeeded = location && new URL(location, request.url).searchParams.get("x") === "conectada";
    if (!succeeded || !linking.profile) {
      const [owner] = await tx.select({ handle: users.handle }).from(users).where(eq(users.id, userId));
      return redirectTo(request, owner?.handle ? `/app/u/${owner.handle}?x=error` : "/app", response);
    }

    const [account] = await tx.update(authAccount)
      .set({ accessToken: null, refreshToken: null, idToken: null, accessTokenExpiresAt: null, refreshTokenExpiresAt: null })
      .where(and(
        eq(authAccount.providerId, "twitter"),
        eq(authAccount.userId, authUserId),
        eq(authAccount.accountId, linking.profile.id),
      ))
      .returning({ id: authAccount.id });
    if (!account) throw new Error("La conexión con X no quedó registrada");

    const [updated] = await tx.update(users)
      .set({ xUsername: linking.profile.username, xLinkedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({ handle: users.handle });
    return redirectTo(request, `/app/u/${updated!.handle}?x=conectada`, response);
  });
}
