import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations, checkHandleFormat, users, type Db } from "@pitchlab/db";
import { GET } from "../app/api/handles/suggest/route";
import { resetAuthForTests, type PitchLabAuth } from "../src/server/auth";
import { resetRateLimitsForTests } from "../src/server/request-security";
import { setSessionDbForTests } from "../src/server/session-user";

let client: PGlite;
let db: Db;

beforeAll(async () => {
  client = new PGlite();
  await applyMigrations((sql) => client.exec(sql));
  db = drizzle(client) as unknown as Db;
});

beforeEach(async () => {
  await client.exec("TRUNCATE TABLE users CASCADE;");
  setSessionDbForTests(db);
  resetAuthForTests(null);
  resetRateLimitsForTests();
});

afterEach(() => {
  resetAuthForTests(undefined);
  setSessionDbForTests(null);
  resetRateLimitsForTests();
});

afterAll(async () => {
  await client?.close();
});

describe("GET /api/handles/suggest", () => {
  it("devuelve 3 sugerencias libres a partir de ?name= y salta usuarios tomados", async () => {
    await db.insert(users).values({
      email: "ocupado@example.com",
      authUserId: "auth_ocupado",
      handle: "jose_perez",
      displayName: "Otro José",
      isAdult: true,
    });

    const res = await GET(
      new Request("http://localhost:9998/api/handles/suggest?name=Jos%C3%A9+P%C3%A9rez"),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const data = (await res.json()) as { suggestions: string[] };
    expect(data.suggestions).toHaveLength(3);
    expect(data.suggestions).not.toContain("jose_perez");
    for (const h of data.suggestions) {
      expect(checkHandleFormat(h).ok).toBe(true);
    }
  });

  it("ignora ?email= en la URL cuando no hay sesión y toma el correo solo de la sesión", async () => {
    const anonRes = await GET(
      new Request("http://localhost:9998/api/handles/suggest?email=filtrado_url@example.com"),
    );
    expect(anonRes.status).toBe(200);
    const anonBody = (await anonRes.json()) as { suggestions: string[] };
    expect(anonBody.suggestions.join(",")).not.toContain("filtrado_url");
    expect(anonBody.suggestions[0]).toBe("socio");

    const sessionStub = {
      api: {
        getSession: async () => ({
          user: {
            id: "auth_sesion_1",
            email: "maria.tejada@club.mx",
            name: "",
            emailVerified: true,
          },
        }),
      },
    } as unknown as PitchLabAuth;
    resetAuthForTests(sessionStub);

    const authRes = await GET(new Request("http://localhost:9998/api/handles/suggest"));
    expect(authRes.status).toBe(200);
    const authBody = (await authRes.json()) as { suggestions: string[] };
    expect(authBody.suggestions).toEqual(["maria_tejada", "maria", "m_tejada"]);
    expect(JSON.stringify(authBody)).not.toContain("club.mx");
    expect(JSON.stringify(authBody)).not.toContain("auth_sesion_1");
  });

  it("permite al socio reutilizar su propio usuario actual en las sugerencias", async () => {
    await db.insert(users).values({
      email: "ana.pro@example.com",
      authUserId: "auth_ana_propia",
      handle: "ana_pro",
      displayName: "Ana Pro",
      isAdult: true,
    });
    const sessionStub = {
      api: {
        getSession: async () => ({
          user: {
            id: "auth_ana_propia",
            email: "ana.pro@example.com",
            name: "Ana Pro",
            emailVerified: true,
          },
        }),
      },
    } as unknown as PitchLabAuth;
    resetAuthForTests(sessionStub);

    const res = await GET(new Request("http://localhost:9998/api/handles/suggest?name=Ana+Pro"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { suggestions: string[] };
    expect(body.suggestions[0]).toBe("ana_pro");
  });

  it("limita a 20 consultas por minuto por usuario e IP", async () => {
    for (let i = 0; i < 20; i += 1) {
      const okRes = await GET(
        new Request("http://localhost:9998/api/handles/suggest?name=Carlos", {
          headers: { "x-real-ip": "198.51.100.77" },
        }),
      );
      expect(okRes.status).toBe(200);
    }

    const blocked = await GET(
      new Request("http://localhost:9998/api/handles/suggest?name=Carlos", {
        headers: { "x-real-ip": "198.51.100.77" },
      }),
    );
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
  });
});
