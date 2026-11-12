import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, expect, it, vi } from "vitest";
import { applyMigrations, authAccount, authSession, disconnectX, eq, memberProfile, users, type Db } from "@pitchlab/db";
import { createAuth } from "../src/server/auth";
import { finishTwitterLink } from "../src/server/profile-x";

const mocks = vi.hoisted(() => ({ getAuth: vi.fn(), requireMember: vi.fn() }));
vi.mock("../src/server/auth", async (original) => ({
  ...await original<typeof import("../src/server/auth")>(),
  getAuth: mocks.getAuth,
}));
vi.mock("../src/server/session-user", () => ({ requireMember: mocks.requireMember }));

const base = "http://localhost:9990";
const cookiesFrom = (response: Response) => response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; ");
const authRequest = (path: string, body: unknown, cookies = "") => new Request(base + "/api/auth/" + path, {
  method: "POST",
  headers: { "content-type": "application/json", origin: base, cookie: cookies },
  body: JSON.stringify(body),
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

it("vincula el usuario confirmado por X a la sesión vigente y elimina el vínculo al desconectar", async () => {
  const client = new PGlite();
  try {
    await applyMigrations((sql) => client.exec(sql));
    const db = drizzle(client) as unknown as Db;
    const credentials = { clientId: "fixture-client", clientSecret: "fixture-secret" };
    vi.stubEnv("TWITTER_CLIENT_ID", credentials.clientId);
    vi.stubEnv("TWITTER_CLIENT_SECRET", credentials.clientSecret);
    const email = "conexion.x@example.com";
    let link = "";
    const auth = createAuth({
      db,
      baseURL: base,
      secret: "fixture-de-autenticacion-de-al-menos-32-caracteres",
      twitter: credentials,
      sendEmail: async (_to, _subject, html) => { link = html.match(/href="([^"]+)"/)?.[1] ?? ""; },
    });
    mocks.getAuth.mockReturnValue(auth);
    expect((await auth.handler(authRequest("sign-in/social", { provider: "twitter" }))).status).toBe(403);
    expect((await auth.handler(authRequest("sign-in/magic-link", { email, callbackURL: "/app" }))).status).toBe(200);
    const signedIn = await auth.handler(new Request(link));
    const sessionCookie = cookiesFrom(signedIn);
    const [member] = await db.update(users).set({ handle: "conexion_x", isAdult: true })
      .where(eq(users.email, email)).returning();
    expect(member?.authUserId).toBeTruthy();
    mocks.requireMember.mockResolvedValue({ db, userId: member!.id, authUserId: member!.authUserId, email });

    const started = await auth.api.linkSocialAccount({
      headers: new Headers({ cookie: sessionCookie, origin: base }),
      body: {
        provider: "twitter",
        callbackURL: "/app/u/conexion_x?x=conectada",
        errorCallbackURL: "/app/u/conexion_x?x=error",
        disableRedirect: true,
      },
      asResponse: true,
    });
    expect(started.status).toBe(200);
    const { url } = await started.json() as { url: string };
    const provider = new URL(url);
    expect(provider.searchParams.get("scope")?.split(" ").sort()).toEqual(["tweet.read", "users.read"]);
    const oauthCookie = [sessionCookie, cookiesFrom(started)].filter(Boolean).join("; ");

    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const target = input instanceof Request ? input.url : String(input);
      if (target === "https://api.x.com/2/oauth2/token") {
        return Response.json({ access_token: "fixture-access-token", token_type: "bearer", expires_in: 120 });
      }
      if (target === "https://api.x.com/2/users/me") {
        return Response.json({ data: { id: "12345", username: "Verificado_X", name: "Ana" } });
      }
      throw new Error("Solicitud inesperada en prueba de OAuth");
    }));
    const callback = new URL("/api/auth/callback/twitter", base);
    callback.searchParams.set("code", "fixture-code");
    callback.searchParams.set("state", provider.searchParams.get("state")!);
    const linked = await finishTwitterLink(new Request(callback, { headers: { cookie: oauthCookie } }));
    expect(linked.status).toBe(303);
    expect(linked.headers.get("location")).toBe(base + "/app/u/conexion_x?x=conectada");
    expect(await memberProfile(db, member!.id)).toMatchObject({ xUsername: "Verificado_X", xLinkedAt: expect.any(Date) });
    const rows = await db.select().from(authAccount).where(eq(authAccount.providerId, "twitter"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: member!.authUserId, accountId: "12345", accessToken: null });
    expect(await db.select().from(authSession)).toHaveLength(1);
    expect((await auth.handler(authRequest("sign-in/social", { provider: "twitter" }))).status).toBe(403);

    await disconnectX(db, member!.id);
    expect(await memberProfile(db, member!.id)).toMatchObject({ xUsername: null, xLinkedAt: null });
    expect(await db.select().from(authAccount).where(eq(authAccount.providerId, "twitter"))).toHaveLength(0);
  } finally {
    await client.close();
  }
}, 60_000);
