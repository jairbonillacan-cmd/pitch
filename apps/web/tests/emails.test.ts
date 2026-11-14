import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { applyMigrations, listScheduledEmails, scheduledEmails, setEmailPreferences, userPreferences, users, eq, type Db } from "@pitchlab/db";
import { cancelTrialEmails, startAccountEmails } from "../src/server/account-emails";
import { firstName, formatLongDate, formatOdds, formatPoints } from "../src/server/email-format";
import { consoleMailer, resendMailer, type Mailer, type OutgoingEmail } from "../src/server/mailer";
import { notifyPickGraded, settleAndNotify } from "../src/server/pick-results";
import { listJournal, sealPick } from "../src/server/member-data";

const TIMEOUT = 60_000;
const now = new Date("2026-11-12T18:00:00Z");

let db: Db;
let counter = 0;

beforeAll(async () => {
  const client = new PGlite();
  await applyMigrations((sql) => client.exec(sql));
  db = drizzle(client) as unknown as Db;
}, TIMEOUT);

async function newUser(displayName = "Sofía López"): Promise<{ id: string; email: string }> {
  counter += 1;
  const email = `socio${counter}@example.com`;
  const [u] = await db.insert(users).values({ email, displayName }).returning();
  return { id: u!.id, email };
}

function fakeMailer(opts: { failSend?: boolean } = {}) {
  const sent: OutgoingEmail[] = [];
  const canceled: string[] = [];
  const mailer: Mailer = {
    async send(email) {
      if (opts.failSend) throw new Error("Resend respondió 500");
      sent.push(email);
      return { id: `re_${sent.length}_${email.idempotencyKey ?? ""}` };
    },
    async cancel(id) {
      canceled.push(id);
    },
  };
  return { mailer, sent, canceled };
}

describe("bienvenida y avisos de la prueba", () => {
  it("manda la bienvenida ya y programa en Resend el día 5 y el día 7", async () => {
    const u = await newUser();
    const { mailer, sent } = fakeMailer();
    await startAccountEmails(db, mailer, { userId: u.id, email: u.email, displayName: "Sofía López", trialGranted: true, now });

    expect(sent).toHaveLength(3);
    const [welcome, ending, ended] = sent as [OutgoingEmail, OutgoingEmail, OutgoingEmail];
    expect(welcome.to).toBe(u.email);
    expect(welcome.scheduledAt).toBeUndefined();
    expect(welcome.subject).toBe("Bienvenido a PitchLab");
    expect(welcome.text).toContain("Hola, Sofía.");
    expect(welcome.text).toContain("7 días de prueba");

    expect(ending.scheduledAt?.toISOString()).toBe("2026-11-17T18:00:00.000Z");
    expect(ending.subject).toBe("Tu prueba de PitchLab termina en 2 días");
    expect(ending.text).toContain("19 de noviembre");
    expect(ending.text).toContain("No se te cobra nada");

    expect(ended.scheduledAt?.toISOString()).toBe("2026-11-19T18:00:00.000Z");
    expect(ended.subject).toBe("Tu prueba de PitchLab terminó");

    const rows = await db.select().from(scheduledEmails).where(eq(scheduledEmails.userId, u.id));
    expect(Object.fromEntries(rows.map((r) => [r.kind, r.status]))).toEqual({
      welcome: "sent",
      trial_ending: "scheduled",
      trial_ended: "scheduled",
    });
  }, TIMEOUT);

  it("repetir el registro no manda nada dos veces", async () => {
    const u = await newUser();
    const { mailer, sent } = fakeMailer();
    const input = { userId: u.id, email: u.email, displayName: "Ana", trialGranted: true, now };
    await startAccountEmails(db, mailer, input);
    await startAccountEmails(db, mailer, input);
    expect(sent).toHaveLength(3);
  }, TIMEOUT);

  it("sin prueba (ya la usó) solo manda la bienvenida y no habla de prueba", async () => {
    const u = await newUser();
    const { mailer, sent } = fakeMailer();
    await startAccountEmails(db, mailer, { userId: u.id, email: u.email, displayName: "Ana", trialGranted: false, now });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).not.toContain("prueba");
  }, TIMEOUT);

  it("un fallo de Resend no rompe el registro y se reintenta después", async () => {
    const u = await newUser();
    const broken = fakeMailer({ failSend: true });
    const input = { userId: u.id, email: u.email, displayName: "Ana", trialGranted: true, now };
    await expect(startAccountEmails(db, broken.mailer, input)).resolves.toBeUndefined();
    expect(await db.select().from(scheduledEmails).where(eq(scheduledEmails.userId, u.id))).toHaveLength(0);

    const ok = fakeMailer();
    await startAccountEmails(db, ok.mailer, input);
    expect(ok.sent).toHaveLength(3);
  }, TIMEOUT);

  it("cancelTrialEmails cancela en Resend lo que sigue programado, una sola vez", async () => {
    const u = await newUser();
    const { mailer, canceled } = fakeMailer();
    await startAccountEmails(db, mailer, { userId: u.id, email: u.email, displayName: "Ana", trialGranted: true, now });
    expect(await cancelTrialEmails(db, mailer, u.id)).toBe(2);
    expect(canceled).toHaveLength(2);
    expect(canceled.every((id) => id.startsWith("re_"))).toBe(true);
    expect(await listScheduledEmails(db, u.id)).toHaveLength(0);
    expect(await cancelTrialEmails(db, mailer, u.id)).toBe(0);
    // La bienvenida ya salió: no se toca.
    const rows = await db.select().from(scheduledEmails).where(eq(scheduledEmails.userId, u.id));
    expect(rows.find((r) => r.kind === "welcome")?.status).toBe("sent");
  }, TIMEOUT);
});

describe("pick calificado", () => {
  const kickoffAt = new Date("2026-11-21T20:00:00Z");
  const pick = {
    pickId: "pl-1__p1",
    gameId: "pl-1",
    leagueLabel: "Liga MX",
    matchLabel: "Cruz Azul vs Pumas",
    pickLabel: "Gana Cruz Azul",
    origin: "Spacetime Suite",
    units: 1,
    userDecimal: 1.82,
    fairDecimal: 1.74,
    kickoffAt,
  };

  async function sealed(userId: string) {
    const r = await sealPick(db, userId, pick, now);
    expect(r.ok).toBe(true);
  }

  it("lo califica y no avisa si la persona no lo activó (apagado por defecto)", async () => {
    const u = await newUser();
    await sealed(u.id);
    const { mailer, sent } = fakeMailer();
    const out = await settleAndNotify(db, mailer, { userId: u.id, pickId: pick.pickId, result: "won", now });
    expect(out).toEqual({ settled: true, notice: "sin_aviso" });
    expect(sent).toHaveLength(0);
  }, TIMEOUT);

  it("con el aviso activado manda el correo con momios en su formato y el cierre", async () => {
    const u = await newUser();
    await sealed(u.id);
    await setEmailPreferences(db, u.id, { pickResults: true });
    const { mailer, sent } = fakeMailer();
    const out = await settleAndNotify(db, mailer, { userId: u.id, pickId: pick.pickId, result: "won", clvPct: 3.24, now });
    expect(out).toEqual({ settled: true, notice: "enviado" });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toBe("Tu pick se cumplió: Cruz Azul vs Pumas");
    expect(sent[0]!.text).toContain("-122"); // 1.82 en formato americano (el de por defecto)
    expect(sent[0]!.text).toContain("-135");
    expect(sent[0]!.text).toContain("+3.2 pts");
    expect(sent[0]!.text).toContain("Cambiar avisos");
  }, TIMEOUT);

  it("respeta el formato decimal de la persona", async () => {
    const u = await newUser();
    await sealed(u.id);
    await setEmailPreferences(db, u.id, { pickResults: true });
    await db.update(userPreferences).set({ oddsFormat: "decimal" }).where(eq(userPreferences.userId, u.id));
    const { mailer, sent } = fakeMailer();
    await settleAndNotify(db, mailer, { userId: u.id, pickId: pick.pickId, result: "lost", now });
    expect(sent[0]!.subject).toBe("Tu pick no se cumplió: Cruz Azul vs Pumas");
    expect(sent[0]!.text).toContain("1.82");
  }, TIMEOUT);

  it("un pick se califica y se avisa una sola vez", async () => {
    const u = await newUser();
    await sealed(u.id);
    await setEmailPreferences(db, u.id, { pickResults: true });
    const { mailer, sent } = fakeMailer();
    await settleAndNotify(db, mailer, { userId: u.id, pickId: pick.pickId, result: "won", now });
    const again = await settleAndNotify(db, mailer, { userId: u.id, pickId: pick.pickId, result: "lost", now });
    expect(again.settled).toBe(false);
    expect(sent).toHaveLength(1);
  }, TIMEOUT);

  it("si Resend falla, el pick queda calificado de todos modos", async () => {
    const u = await newUser();
    await sealed(u.id);
    await setEmailPreferences(db, u.id, { pickResults: true });
    const { mailer } = fakeMailer({ failSend: true });
    const out = await settleAndNotify(db, mailer, { userId: u.id, pickId: pick.pickId, result: "void", now });
    expect(out).toEqual({ settled: true, notice: "error" });
  }, TIMEOUT);

  it("no avisa de un pick que sigue pendiente", async () => {
    const u = await newUser();
    await sealed(u.id);
    await setEmailPreferences(db, u.id, { pickResults: true });
    const { mailer, sent } = fakeMailer();
    const [stillPending] = await listJournal(db, u.id);
    expect(stillPending!.status).toBe("pending");
    expect(await notifyPickGraded(db, mailer, stillPending!)).toBe("sin_aviso");
    expect(sent).toHaveLength(0);
  }, TIMEOUT);
});

describe("Resend", () => {
  function fakeFetch(status = 200, body: unknown = { id: "re_abc" }) {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const impl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(body), { status });
    }) as unknown as typeof fetch;
    return { impl, calls };
  }

  it("manda con clave de idempotencia, programación y responder a soporte", async () => {
    const { impl, calls } = fakeFetch();
    const mailer = resendMailer("re_key", "PitchLab <hola@pitchlab.mx>", impl);
    const out = await mailer.send({
      to: "a@b.mx",
      subject: "Hola",
      html: "<p>x</p>",
      text: "x",
      scheduledAt: new Date("2026-11-17T18:00:00Z"),
      idempotencyKey: "welcome:u1",
      tags: [{ name: "tipo", value: "welcome" }],
    });
    expect(out.id).toBe("re_abc");
    expect(calls[0]!.url).toBe("https://api.resend.com/emails");
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer re_key");
    expect(headers["Idempotency-Key"]).toBe("welcome:u1");
    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body).toMatchObject({
      from: "PitchLab <hola@pitchlab.mx>",
      to: "a@b.mx",
      scheduled_at: "2026-11-17T18:00:00.000Z",
      reply_to: "soporte@pitchlab.mx",
    });
  });

  it("un error de Resend se propaga; cancelar algo que ya salió no es error", async () => {
    const failing = resendMailer("k", "x", fakeFetch(500).impl);
    await expect(failing.send({ to: "a@b.mx", subject: "s", html: "h" })).rejects.toThrow("Resend respondió 500");

    const gone = fakeFetch(404);
    await expect(resendMailer("k", "x", gone.impl).cancel("re_1")).resolves.toBeUndefined();
    expect(gone.calls[0]!.url).toBe("https://api.resend.com/emails/re_1/cancel");
    await expect(resendMailer("k", "x", fakeFetch(500).impl).cancel("re_1")).rejects.toThrow();
  });

  it("sin clave solo imprime", async () => {
    const lines: string[] = [];
    const out = await consoleMailer((l) => lines.push(l)).send({ to: "a@b.mx", subject: "Hola", html: "h" });
    expect(out.id).toBeNull();
    expect(lines[0]).toContain("Hola");
  });
});

describe("formato para correos", () => {
  it("fechas en español y hora de México", () => {
    expect(formatLongDate(new Date("2026-11-19T04:00:00Z"))).toBe("18 de noviembre"); // 22:00 en CDMX
    expect(formatLongDate(new Date("2026-11-19T18:00:00Z"), true)).toBe("19 de noviembre de 2026");
  });
  it("primer nombre", () => {
    expect(firstName("Sofía López")).toBe("Sofía");
    expect(firstName("  ")).toBeUndefined();
    expect(firstName(null)).toBeUndefined();
  });
  it("momios americano y decimal", () => {
    expect(formatOdds(1.82, "american")).toBe("-122");
    expect(formatOdds(2.5, "american")).toBe("+150");
    expect(formatOdds(1.82, "decimal")).toBe("1.82");
  });
  it("puntos con signo", () => {
    expect(formatPoints(3.24)).toBe("+3.2 pts");
    expect(formatPoints(-1.4)).toBe("−1.4 pts");
    expect(formatPoints(0)).toBe("0.0 pts");
  });
});
