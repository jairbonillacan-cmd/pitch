import { describe, expect, it } from "vitest";
import {
  badgeFactsFromEntries,
  computeBadges,
  featuredBadgeViews,
  journalWeekStreak,
  publicBadges,
  sanitizeFeaturedBadges,
  type BadgeVisibility,
} from "../src/platform/badges";
import { DEFAULT_RECORD_PRIVACY, normalizeRecordPrivacy, type RecordEntry } from "../src/platform/record-stats";

const NOW = new Date("2026-11-13T18:00:00Z");
const DAY = 86_400_000;

function picks(n: number, opts: { won: number; league?: string; clv?: number; daysAgo?: number }): RecordEntry[] {
  return Array.from({ length: n }, (_, i) => {
    const t = new Date(NOW.getTime() - (opts.daysAgo ?? 1) * DAY - i * 3_600_000).toISOString();
    return {
      status: i < opts.won ? "won" : "lost",
      units: 1,
      userDecimal: 1.9,
      fairDecimal: 1.85,
      clvPct: opts.clv ?? 1,
      leagueLabel: opts.league ?? "Liga MX",
      pickLabel: "América gana",
      origin: "Spacetime Suite",
      sealedAtIso: t,
      settledAtIso: t,
    } satisfies RecordEntry;
  });
}

const VISIBLE: BadgeVisibility = { privacy: DEFAULT_RECORD_PRIVACY, recordVisible: true, showInRanking: true };
const byId = (list: ReturnType<typeof computeBadges>, id: string) => list.find((b) => b.id === id);

describe("computeBadges", () => {
  it("da Ojo fino, Especialista y Contra el cierre con la muestra mínima", () => {
    const badges = computeBadges(badgeFactsFromEntries(picks(30, { won: 19 })), NOW);
    expect(byId(badges, "ojo-fino")?.earned).toBe(true);
    expect(byId(badges, "especialista:Liga MX")?.earned).toBe(true);
    expect(byId(badges, "contra-el-cierre")?.earned).toBe(true);
  });

  it("no da Ojo fino con menos de 30 picks aunque acierte todo", () => {
    const badges = computeBadges(badgeFactsFromEntries(picks(29, { won: 29 })), NOW);
    expect(byId(badges, "ojo-fino")).toMatchObject({ earned: false, progress: { current: 29, target: 30 } });
  });

  it("Contra el cierre solo cuenta los últimos 30 días y un CLV positivo", () => {
    const old = computeBadges(badgeFactsFromEntries(picks(25, { won: 10, daysAgo: 40 })), NOW);
    expect(byId(old, "contra-el-cierre")?.earned).toBe(false);
    const negative = computeBadges(badgeFactsFromEntries(picks(25, { won: 10, clv: -0.5 })), NOW);
    expect(byId(negative, "contra-el-cierre")?.earned).toBe(false);
  });

  it("muestra una sola meta de Especialista mientras no gana ninguna liga", () => {
    const badges = computeBadges(badgeFactsFromEntries(picks(12, { won: 3 })), NOW);
    const specialist = badges.filter((b) => b.id.startsWith("especialista"));
    expect(specialist).toHaveLength(1);
    expect(specialist[0]).toMatchObject({ id: "especialista", earned: false, progress: { current: 12, target: 20 } });
  });

  it("Racha 5 usa la mejor racha ganadora", () => {
    const entries = picks(6, { won: 5 }).reverse(); // 1 perdido y 5 ganados en orden de cierre
    expect(byId(computeBadges(badgeFactsFromEntries(entries), NOW), "racha-5")?.earned).toBe(true);
  });

  it("antigüedad: solo la más alta ganada, o la siguiente meta", () => {
    const at = (days: number) =>
      computeBadges(badgeFactsFromEntries([], { joinedAtIso: new Date(NOW.getTime() - days * DAY).toISOString() }), NOW).filter(
        (b) => b.family === "seniority",
      );
    expect(at(10)).toEqual([expect.objectContaining({ id: "socio-30-dias", earned: false, progress: { current: 10, target: 30 } })]);
    expect(at(100)).toEqual([expect.objectContaining({ id: "socio-90-dias", earned: true })]);
    expect(at(400)).toEqual([expect.objectContaining({ id: "socio-1-ano", earned: true })]);
  });

  it("comunidad y origen salen de los datos del servidor", () => {
    const badges = computeBadges(
      badgeFactsFromEntries([], {
        likesOnPickPosts: 25,
        paidReferrals: 5,
        isTipster: true,
        joinedAtIso: "2026-11-01T12:00:00Z",
      }),
      NOW,
    );
    for (const id of ["voz-util", "embajador", "tipster-verificado", "fundador-beta"]) {
      expect(byId(badges, id)?.earned, id).toBe(true);
    }
    expect(byId(badges, "lectura-del-partido")).toMatchObject({ earned: false, measured: false });
    expect(byId(badges, "top-10-semanal")).toMatchObject({ earned: false, measured: false });
  });

  it("nunca premia volumen: 500 picks perdidos no dan nada de precisión ni constancia de racha", () => {
    const badges = computeBadges(badgeFactsFromEntries(picks(500, { won: 0, clv: -1 })), NOW);
    expect(badges.filter((b) => b.earned && (b.family === "precision" || b.id === "racha-5"))).toEqual([]);
  });
});

describe("journalWeekStreak", () => {
  const sealedAt = (iso: string): RecordEntry => ({ ...picks(1, { won: 1 })[0]!, sealedAtIso: iso, status: "pending" });

  it("cuenta semanas seguidas hasta esta o la anterior", () => {
    const entries = ["2026-11-12", "2026-11-04", "2026-10-28", "2026-10-21"].map((d) => sealedAt(`${d}T12:00:00Z`));
    expect(journalWeekStreak(entries, NOW)).toBe(4);
  });

  it("si falta esta semana arranca en la anterior; un hueco corta la racha", () => {
    const entries = ["2026-11-04", "2026-10-28", "2026-10-14"].map((d) => sealedAt(`${d}T12:00:00Z`));
    expect(journalWeekStreak(entries, NOW)).toBe(2);
  });
});

describe("privacidad y destacadas", () => {
  const badges = computeBadges(
    badgeFactsFromEntries(picks(30, { won: 20 }), { joinedAtIso: "2026-01-01T12:00:00Z", isTipster: true }),
    NOW,
  );

  it("una insignia de récord se oculta si su dato está oculto", () => {
    const privacy = normalizeRecordPrivacy({ record: { fields: { hitRate: false } } });
    const ids = publicBadges(badges, { ...VISIBLE, privacy }).map((b) => b.id);
    expect(ids).not.toContain("ojo-fino");
    expect(ids).toContain("racha-5");
    expect(ids).toContain("tipster-verificado");
  });

  it("con el récord privado solo quedan las que no salen del récord", () => {
    const ids = publicBadges(badges, { ...VISIBLE, recordVisible: false }).map((b) => b.id);
    expect(ids.every((id) => !["ojo-fino", "racha-5", "contra-el-cierre"].includes(id) && !id.startsWith("especialista"))).toBe(true);
    expect(ids).toContain("fundador-beta");
  });

  it("destacadas: máximo 3, sin repetir y solo entre las públicas", () => {
    const pub = publicBadges(badges, VISIBLE);
    const featured = sanitizeFeaturedBadges(
      ["ojo-fino", "ojo-fino", "inventada", "racha-5", "tipster-verificado", "fundador-beta"],
      pub,
    );
    expect(featured).toEqual(["ojo-fino", "racha-5", "tipster-verificado"]);
    expect(sanitizeFeaturedBadges("ojo-fino", pub)).toEqual([]);
    expect(featuredBadgeViews(pub, ["racha-5", "oculta"]).map((b) => b.id)).toEqual(["racha-5"]);
  });
});
