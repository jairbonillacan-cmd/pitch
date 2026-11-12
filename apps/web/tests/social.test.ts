import { describe, expect, it } from "vitest";
import { checkSocialText, parseNewPost, parseSocialPick } from "../src/server/social";

describe("comunidad: texto que llega del navegador", () => {
  it("exige una frase, respeta el máximo y bloquea enlaces externos", () => {
    expect(checkSocialText("corto", "post")).toMatchObject({ ok: false });
    expect(checkSocialText("x".repeat(601), "post")).toMatchObject({ ok: false, error: "Máximo 600 caracteres." });
    expect(checkSocialText("Únete a t.me/picksgratis hoy mismo", "post")).toMatchObject({ ok: false });
    expect(checkSocialText("  Monterrey o empate, me gusta.  ", "post")).toEqual({
      ok: true,
      text: "Monterrey o empate, me gusta.",
    });
    expect(checkSocialText("Sí", "comment")).toEqual({ ok: true, text: "Sí" });
    expect(checkSocialText(42, "comment")).toMatchObject({ ok: false });
  });

  it("el pick adjunto solo pasa con cifras razonables", () => {
    const good = {
      pickId: "pk1",
      gameId: "g1",
      label: "Gana Monterrey",
      units: 1,
      userDecimal: 2.1,
      fairDecimal: 1.9,
      modelProbability: 0.52,
    };
    expect(parseSocialPick(good)).toEqual(good);
    expect(parseSocialPick({ ...good, units: 50 })).toBeNull();
    expect(parseSocialPick({ ...good, modelProbability: 3 })).toBeNull();
    expect(parseSocialPick({ ...good, userDecimal: "2.1" })).toBeNull();
  });

  it("no deja que el navegador elija el origen ni el récord", () => {
    const parsed = parseNewPost({
      body: "Lectura del partido de hoy.",
      originType: "Algo inventado",
      verifiedRecord: "+999u · 1000 picks",
    });
    expect(parsed).toMatchObject({ ok: true, post: { originType: "Bitácora Propia", leagueLabel: "Comunidad" } });
    expect(JSON.stringify(parsed)).not.toContain("999");
  });
});
