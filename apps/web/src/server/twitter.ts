export function twitterCredentials() {
  const { TWITTER_CLIENT_ID: clientId, TWITTER_CLIENT_SECRET: clientSecret } = process.env;
  return clientId && clientSecret ? { clientId, clientSecret } : undefined;
}

export function parseTwitterProfile(raw: unknown): { id: string; username: string; name: string } | null {
  if (!raw || typeof raw !== "object" || !("data" in raw)) return null;
  const data = raw.data;
  if (!data || typeof data !== "object" || !("id" in data) || !("username" in data)) return null;
  if (typeof data.id !== "string" || !/^\d+$/.test(data.id)) return null;
  if (typeof data.username !== "string" || !/^[a-z0-9_]{1,15}$/i.test(data.username)) return null;
  return {
    id: data.id,
    username: data.username,
    name: "name" in data && typeof data.name === "string" ? data.name : data.username,
  };
}

export async function twitterUserInfo(tokens: { accessToken?: string | null }) {
  if (!tokens.accessToken) return null;
  try {
    const response = await fetch("https://api.x.com/2/users/me", {
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const raw: unknown = await response.json();
    const profile = parseTwitterProfile(raw);
    if (!profile) return null;
    return {
      // Better Auth's linking branch can verify the provider account without an email.
      user: { name: profile.name, emailVerified: false },
      data: { data: profile },
    };
  } catch {
    return null;
  }
}
