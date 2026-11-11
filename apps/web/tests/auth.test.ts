import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";
import { applyMigrations, authSession, users, type Db } from "@pitchlab/db";
import { createAuth, linkProfile } from "../src/server/auth";

async function freshDb(): Promise<Db> {
  const client = new PGlite();
  await applyMigrations((sql) => client.exec(sql));
  return drizzle(client) as unknown as Db;
}

describe("autenticación (Better Auth)", () => {
  it("enlace mágico: crea la cuenta, la sesión y el perfil de PitchLab", async () => {
    const db = await freshDb();
    const sent: Array<{ to: string; html: string }> = [];
    const auth = createAuth({
      db,
      secret: "secreto-de-prueba-de-al-menos-32-caracteres!!",
      baseURL: "http://localhost:3000",
      sendEmail: async (to, _subject, html) => {
        sent.push({ to, html });
      },
    });

    const res = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-in/magic-link", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ email: "Socio@Example.com", callbackURL: "/app" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
    const link = sent[0]!.html.match(/href="([^"]+)"/)![1]!.replace(/&amp;/g, "&");

    const verify = await auth.handler(new Request(link, { headers: { origin: "http://localhost:3000" } }));
    expect([200, 302]).toContain(verify.status);
    expect(verify.headers.get("set-cookie") ?? "").toContain("session_token");

    const sessions = await db.select().from(authSession);
    expect(sessions).toHaveLength(1);
    const profiles = await db.select().from(users);
    expect(profiles).toHaveLength(1);
    expect(profiles[0]!.email).toBe("socio@example.com");
    expect(profiles[0]!.authUserId).toBe(sessions[0]!.userId);
    expect(profiles[0]!.referralCode).toMatch(/^SOCIO-[0-9A-F]{6}$/);
  });

  it("liga un perfil existente por correo sin duplicarlo", async () => {
    const db = await freshDb();
    await db.insert(users).values({ email: "ya@example.com" });
    await linkProfile(db, { id: "auth_1", email: "YA@example.com", name: "Ya" });
    await linkProfile(db, { id: "auth_1", email: "ya@example.com", name: "Ya" });
    const rows = await db.select().from(users);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.authUserId).toBe("auth_1");
  });
});
