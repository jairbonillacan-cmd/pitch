import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  applyMigrations,
  completeSignup,
  createSocialPost,
  funnelEvents,
  getEmailPreferences,
  grantDays,
  listScheduledEmails,
  scheduledEmails,
  sealedPicks,
  setEmailPreferences,
  SIGNUP_CONSENT_VERSION,
  userPreferences,
  users,
  watchlist,
  eq,
  type Db,
} from "@pitchlab/db";
import type { MatchPick, PlatformDataset, PlatformGame } from "@pitchlab/ui/types";
import { cancelTrialEmails, startAccountEmails } from "../src/server/account-emails";
import { resetAuthForTests, type PitchLabAuth } from "../src/server/auth";
import { firstName, formatLongDate, formatOdds, formatPoints } from "../src/server/email-format";
import { runMonthlyRecordJob, runWeeklyDigestJob } from "../src/server/lifecycle-emails";
import { consoleMailer, resendMailer, setMailerForTests, type Mailer, type OutgoingEmail } from "../src/server/mailer";
import { notifyPickGraded, settleAndNotify } from "../src/server/pick-results";
import { resetRateLimitsForTests } from "../src/server/request-security";
import { setSessionDbForTests } from "../src/server/session-user";
import { listJournal, sealPick } from "../src/server/member-data";
import { POST as postAdminModeration } from "../app/api/admin/moderation/route";
import { POST as postAdminTipsters } from "../app/api/admin/tipsters/route";
import { GET as getMonthlyRecordCron } from "../app/api/cron/monthly-record/route";
import { GET as getWeeklyDigestCron } from "../app/api/cron/weekly-digest/route";
import {
  GET as getEmailUnsubscribe,
  POST as postEmailUnsubscribe,
} from "../app/api/me/email-preferences/unsubscribe/route";
import { POST as postSignup } from "../app/api/me/signup/route";

const TIMEOUT = 60_000;
const now = new Date("2026-11-12T18:00:00Z");

let db: Db;
let counter = 0;

beforeAll(async () => {
  const client = new PGlite();
  await applyMigrations((sql) => client.exec(sql));
  await client.exec("SET pitchlab.allow_historical_seed = 'on'");
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

describe("correos de ciclo de vida, digests y baja en un clic", () => {
  it("dispara referral-signed-up en POST /api/me/signup cuando hay anfitrión y registra embudo signup_step2", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://local/test");
    vi.stubEnv("BETTER_AUTH_SECRET", "secreto-emails-test-al-menos-32-caracteres-seguro!!");
    const { mailer, sent } = fakeMailer();
    setMailerForTests(mailer);
    setSessionDbForTests(db);
    resetRateLimitsForTests();
    try {
      const [host] = await db
        .insert(users)
        .values({
          authUserId: "auth_host_ref",
          email: "anfitrion.ref@example.com",
          displayName: "Carlos Anfitrión",
          handle: "carlos_host",
          referralCode: "HOST42",
          isAdult: true,
        })
        .returning({ id: users.id });

      const [guest] = await db
        .insert(users)
        .values({
          authUserId: "auth_guest_ref",
          email: "invitado.ref@example.com",
          displayName: "Ana Invitada",
        })
        .returning({ id: users.id });

      resetAuthForTests({
        api: {
          getSession: async () => ({
            user: { id: "auth_guest_ref", email: "invitado.ref@example.com", name: "Ana Invitada", emailVerified: true },
          }),
        },
      } as unknown as PitchLabAuth);

      const res = await postSignup(
        new Request("http://localhost:3000/api/me/signup", {
          method: "POST",
          headers: { "content-type": "application/json", origin: "http://localhost:3000" },
          body: JSON.stringify({
            displayName: "Ana Invitada",
            handle: "ana_invitada_ref",
            birthDate: "1995-03-14",
            referralCode: "HOST42",
            consents: { terms: true, analytics: true, marketing: false, version: SIGNUP_CONSENT_VERSION },
          }),
        }),
      );
      expect(res.status).toBe(200);

      const refMail = sent.find((m) => m.to === "anfitrion.ref@example.com");
      expect(refMail).toBeDefined();
      expect(refMail?.tags).toEqual([{ name: "tipo", value: "referral_signed_up" }]);
      expect(refMail?.text).toContain("Ana");

      expect(host?.id).toBeTruthy();
      const funnelRows = await db.select().from(funnelEvents).where(eq(funnelEvents.userId, guest!.id));
      expect(funnelRows.some((r) => r.eventName === "signup_step2")).toBe(true);
    } finally {
      resetAuthForTests(undefined);
      setSessionDbForTests(null);
      setMailerForTests(null);
      vi.unstubAllEnvs();
    }
  });

  it("dispara tipster-activated en POST /api/admin/tipsters y content-removed en POST /api/admin/moderation", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://local/test");
    vi.stubEnv("BETTER_AUTH_SECRET", "secreto-admin-emails-32-caracteres-validos!!");
    vi.stubEnv("PITCHLAB_ADMIN_EMAILS", "admin.emails@pitchlab.mx");
    const { mailer, sent } = fakeMailer();
    setMailerForTests(mailer);
    setSessionDbForTests(db);
    resetRateLimitsForTests();
    try {
      const [adminRow] = await db
        .insert(users)
        .values({
          authUserId: "auth_admin_emails",
          email: "admin.emails@pitchlab.mx",
          displayName: "Admin",
          handle: "admin_emails",
          isAdult: true,
        })
        .returning({ id: users.id });
      await completeSignup(db, {
        userId: adminRow!.id,
        displayName: "Admin",
        handle: "admin_emails",
        birthDate: "1990-01-01",
        termsVersion: SIGNUP_CONSENT_VERSION,
        analyticsConsent: false,
        marketingConsent: false,
        referralCode: null,
        trial: null,
        now,
      });

      const [authorRow] = await db
        .insert(users)
        .values({
          authUserId: "auth_author_mod",
          email: "autor.mod@example.com",
          displayName: "Lucía Autor",
          handle: "lucia_autor",
          isAdult: true,
        })
        .returning({ id: users.id });
      await completeSignup(db, {
        userId: authorRow!.id,
        displayName: "Lucía Autor",
        handle: "lucia_autor",
        birthDate: "1992-08-20",
        termsVersion: SIGNUP_CONSENT_VERSION,
        analyticsConsent: false,
        marketingConsent: false,
        referralCode: null,
        trial: null,
        now,
      });
      await grantDays(db, {
        userId: authorRow!.id,
        sourceKind: "admin_grant",
        days: 7,
        idempotencyKey: "mod-email-test-grant",
        now,
      });
      const post = await createSocialPost(
        db,
        authorRow!.id,
        {
          body: "Comentario de prueba que será revisado por moderación",
          leagueLabel: "Liga MX",
          matchLabel: "General",
          pickBadge: "Debate",
          originType: "Spacetime Suite",
        },
        now,
      );
      expect(post.ok).toBe(true);

      resetAuthForTests({
        api: {
          getSession: async () => ({
            user: { id: "auth_admin_emails", email: "admin.emails@pitchlab.mx", name: "Admin", emailVerified: true },
          }),
        },
      } as unknown as PitchLabAuth);

      const tipRes = await postAdminTipsters(
        new Request("http://localhost:3000/api/admin/tipsters", {
          method: "POST",
          headers: { "content-type": "application/json", origin: "http://localhost:3000" },
          body: JSON.stringify({
            email: "nuevo.tipster@example.com",
            handle: "tipster_nuevo",
            displayName: "Diego Tipster",
            promoCode: "DIEGO7",
            specialty: "Liga MX",
          }),
        }),
      );
      expect(tipRes.status).toBe(201);
      const tipEmail = sent.find((m) => m.to === "nuevo.tipster@example.com");
      expect(tipEmail).toBeDefined();
      expect(tipEmail?.tags).toEqual([{ name: "tipo", value: "tipster_activated" }]);
      expect(tipEmail?.text).toContain("DIEGO7");

      if (post.ok) {
        const modRes = await postAdminModeration(
          new Request("http://localhost:3000/api/admin/moderation", {
            method: "POST",
            headers: { "content-type": "application/json", origin: "http://localhost:3000" },
            body: JSON.stringify({
              action: "hide",
              targetType: "post",
              targetId: post.id,
              reason: "Incumple reglas de comunidad.",
            }),
          }),
        );
        expect(modRes.status).toBe(200);
        const modEmail = sent.find((m) => m.to === "autor.mod@example.com");
        expect(modEmail).toBeDefined();
        expect(modEmail?.tags).toEqual([{ name: "tipo", value: "content_removed" }]);
        expect(modEmail?.html).toContain("/legal/terminos");
      }
    } finally {
      resetAuthForTests(undefined);
      setSessionDbForTests(null);
      setMailerForTests(null);
      vi.unstubAllEnvs();
    }
  });

  it("ejecuta resumen semanal, récord mensual y baja en un clic (GET/POST unsubscribe + auth de crons)", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret-lifecycle-test-123456");
    vi.stubEnv("UNSUBSCRIBE_SECRET", "unsub-secret-lifecycle-test-123456");
    setSessionDbForTests(db);
    resetRateLimitsForTests();
    try {
      const sub = await newUser("Mateo Digest");
      await db
        .update(users)
        .set({ authUserId: `auth_${sub.id}`, termsAcceptedAt: now, isAdult: true, handle: "mateo_digest" })
        .where(eq(users.id, sub.id));
      await setEmailPreferences(db, sub.id, { pickResults: false, weeklyDigest: true, monthlyRecord: true });
      await grantDays(db, {
        userId: sub.id,
        sourceKind: "admin_grant",
        days: 7,
        idempotencyKey: "digest-test-grant",
        now,
      });

      const futureKickoff = new Date(now.getTime() + 2 * 86_400_000).toISOString();
      await db.insert(watchlist).values({ userId: sub.id, gameId: "lmx-digest-1" });

      const dataset = {
        generatedAt: now.toISOString(),
        leagues: [],
        games: [
          {
            id: "lmx-digest-1",
            league: "liga-mx" as PlatformGame["league"],
            leagueLabel: "Liga MX",
            sport: "football",
            round: "J14",
            dayId: futureKickoff.slice(0, 10),
            dayLabel: "viernes",
            kickoffUtc: futureKickoff,
            kickoffLocal: "21:00",
            venue: "Azteca",
            status: "NS",
            home: { slug: "ame", name: "América", shortName: "América", code: "AME", record: "" },
            away: { slug: "chi", name: "Chivas", shortName: "Chivas", code: "CHI", record: "" },
            x12: [0.58, 0.24, 0.18],
            projection: { home: 1.9, away: 0.9, total: 2.8 },
            confidenceScore: 80,
            confidenceLevel: "alta",
            picks: [
              {
                id: "pk-dig-1",
                gameId: "lmx-digest-1",
                engineKey: "singularity",
                engineName: "Spacetime Suite",
                marketGroup: "1X2",
                selectionKey: "home",
                market: "h2h",
                line: null,
                conflictGroup: "home_side",
                label: "América gana",
                rationale: "Prueba",
                p: 0.58,
                fairDecimal: 1.72,
                fairAmerican: -139,
                marketDecimal: null,
                marketAmerican: null,
              } as MatchPick,
            ],
            preGame: {} as PlatformGame["preGame"],
            markets: [],
            factors: [],
            headToHead: [],
            updatedAtLabel: "",
            spacetime: null,
          } as PlatformGame,
        ],
        dailyPromoPickId: "",
        tipsterWeeklyPickId: "",
        tipsterWeeklySlug: "",
        isServerRedactedForVisitor: false,
      } as PlatformDataset;

      // 1) Cron auth en /api/cron/weekly-digest y /api/cron/monthly-record
      expect((await getWeeklyDigestCron(new Request("https://pitchlab.mx/api/cron/weekly-digest"))).status).toBe(401);
      expect((await getMonthlyRecordCron(new Request("https://pitchlab.mx/api/cron/monthly-record"))).status).toBe(401);

      const { mailer, sent } = fakeMailer();
      const digestRun = await runWeeklyDigestJob(db, mailer, { now, dataset });
      expect(digestRun.sent).toBe(1);
      // Reintento en la misma semana es idempotente
      const digestRetry = await runWeeklyDigestJob(db, mailer, { now, dataset });
      expect(digestRetry.sent).toBe(0);

      const weeklyMail = sent.find((m) => m.to === sub.email && m.tags?.some((t) => t.value === "weekly_digest"));
      expect(weeklyMail?.html).toContain("América vs Chivas");
      const unsubHref = weeklyMail?.html.match(/href="([^"]*\/api\/me\/email-preferences\/unsubscribe[^"]+)"/)?.[1]?.replace(
        /&amp;/g,
        "&",
      );
      expect(unsubHref).toBeTruthy();

      // 2) Récord mensual agrega octubre 2026 cuando corre en noviembre de 2026
      await db.insert(sealedPicks).values({
        userId: sub.id,
        pickId: "prev-month-1",
        gameId: "g-prev-1",
        leagueLabel: "Liga MX",
        matchLabel: "Tigres vs Rayados",
        pickLabel: "Tigres gana",
        origin: "Spacetime Suite",
        units: "2",
        userDecimal: "2.100",
        fairDecimal: "1.950",
        sealedAt: new Date("2026-10-17T20:00:00Z"),
        kickoffAt: new Date("2026-10-18T02:00:00Z"),
        sealHash: "hash-prev-month-1",
        status: "won",
        clvPct: "4.50",
        settledAt: new Date("2026-10-18T04:00:00Z"),
      });

      const monthlyRun = await runMonthlyRecordJob(db, mailer, { now });
      expect(monthlyRun.sent).toBe(1);
      const monthMail = sent.find((m) => m.to === sub.email && m.tags?.some((t) => t.value === "monthly_record"));
      expect(monthMail?.text).toContain("+2.2u");
      expect(monthMail?.text).toContain("1 de 1");
      expect(monthMail?.text).toContain("+4.5 pts");

      const monthUnsubHref = monthMail?.html.match(/href="([^"]*\/api\/me\/email-preferences\/unsubscribe[^"]+)"/)?.[1]?.replace(
        /&amp;/g,
        "&",
      );
      expect(monthUnsubHref).toBeTruthy();

      // 3) Baja en un clic por GET y POST actualiza user_preferences y rechaza tokens manipulados
      const unsubGetRes = await getEmailUnsubscribe(new Request(unsubHref!));
      expect(unsubGetRes.status).toBe(200);
      const afterWeekly = await getEmailPreferences(db, sub.id);
      expect(afterWeekly.weeklyDigest).toBe(false);
      expect(afterWeekly.monthlyRecord).toBe(true);

      const unsubPostRes = await postEmailUnsubscribe(new Request(monthUnsubHref!, { method: "POST" }));
      expect(unsubPostRes.status).toBe(200);
      const afterMonthly = await getEmailPreferences(db, sub.id);
      expect(afterMonthly.monthlyRecord).toBe(false);

      const tampered = await getEmailUnsubscribe(
        new Request("https://pitchlab.mx/api/me/email-preferences/unsubscribe?token=invalid.token"),
      );
      expect(tampered.status).toBe(400);

      const malformedPost = await postEmailUnsubscribe(
        new Request("https://pitchlab.mx/api/me/email-preferences/unsubscribe", {
          method: "POST",
          body: "{malformed-json",
        }),
      );
      expect(malformedPost.status).toBe(400);
      expect(malformedPost.headers.get("cache-control")).toBe("no-store");

      // Endpoints cron responden 200 con Bearer válido
      const cronOk = await getWeeklyDigestCron(
        new Request("https://pitchlab.mx/api/cron/weekly-digest", {
          headers: { authorization: "Bearer cron-secret-lifecycle-test-123456" },
        }),
      );
      expect(cronOk.status).toBe(200);
    } finally {
      setSessionDbForTests(null);
      vi.unstubAllEnvs();
    }
  });
});
