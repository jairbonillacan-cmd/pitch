import { describe, expect, it } from "vitest";
import { clientIp, ipSubnet, parseSignupBody, trialHashes } from "../src/server/signup";

const valid = {
  displayName: "Ana López",
  handle: "ana_lopez",
  birthDate: "1990-05-20",
  consents: { terms: true, analytics: false, marketing: true, version: "2026-11-11" },
  referralCode: " socio-ab12cd ",
};

describe("paso 2 del registro en el servidor", () => {
  it("acepta el cuerpo válido y normaliza el código", () => {
    expect(parseSignupBody(valid)).toEqual({
      displayName: "Ana López",
      handle: "ana_lopez",
      birthDate: "1990-05-20",
      termsVersion: "2026-11-11",
      analyticsConsent: false,
      marketingConsent: true,
      referralCode: "SOCIO-AB12CD",
    });
  });

  it("rechaza sin términos, sin fecha o con forma rara", () => {
    expect(parseSignupBody({ ...valid, consents: { ...valid.consents, terms: false } })).toBeNull();
    expect(parseSignupBody({ ...valid, birthDate: "20/05/1990" })).toBeNull();
    expect(parseSignupBody(null)).toBeNull();
    expect(parseSignupBody({ ...valid, handle: undefined })).toBeNull();
    expect(parseSignupBody({ ...valid, referralCode: undefined })).toMatchObject({ referralCode: null });
  });

  it("toma la subred y no guarda la IP en claro", () => {
    const h = new Headers({ "x-forwarded-for": "187.190.4.25, 10.0.0.1", "user-agent": "UA" });
    expect(clientIp(h)).toBe("187.190.4.25");
    expect(ipSubnet("187.190.4.25")).toBe("187.190.4.0/24");
    expect(ipSubnet("2806:10a6:2:9::1")).toBe("2806:10a6:2::/48");
    const a = trialHashes(h, "sal");
    const b = trialHashes(new Headers({ "x-forwarded-for": "187.190.4.99", "user-agent": "UA" }), "sal");
    expect(a.ipSubnetHash).toBe(b.ipSubnetHash);
    expect(a.ipSubnetHash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.ipSubnetHash).not.toContain("187");
  });
});

describe("correo de acceso en tu PC", () => {
  it("solo http://localhost o 127.0.0.1 cuentan como locales", async () => {
    const { isLocalBaseURL } = await import("../src/server/auth");
    expect(isLocalBaseURL("http://localhost:9990")).toBe(true);
    expect(isLocalBaseURL("http://127.0.0.1:3000/")).toBe(true);
    expect(isLocalBaseURL("https://pitchlab.mx")).toBe(false);
    expect(isLocalBaseURL("http://localhost.evil.com")).toBe(false);
    expect(isLocalBaseURL("https://localhost:9990")).toBe(false);
  }, 30_000);
});
