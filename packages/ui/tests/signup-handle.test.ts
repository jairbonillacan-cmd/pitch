import { describe, expect, it } from "vitest";
import { ownHandleFor } from "../src/platform/platform-provider";
import {
  normalizeSignupHandle,
  SIGNUP_HANDLE_PATTERN,
  suggestSignupHandle,
} from "../src/platform/public/SignupSurfaceV4";

describe("usuario en el registro", () => {
  it("sugiere desde el nombre o el correo, sin acentos", () => {
    expect(suggestSignupHandle("José Pérez")).toBe("jose_perez");
    expect(suggestSignupHandle("ana.lopez+1@gmail.com")).toBe("ana_lopez_1");
    expect(suggestSignupHandle("42")).toBe("");
  });

  it("normaliza lo que se escribe y valida el formato", () => {
    expect(normalizeSignupHandle("  @Ana_Lopez ")).toBe("ana_lopez");
    expect(SIGNUP_HANDLE_PATTERN.test("ana_lopez")).toBe(true);
    expect(SIGNUP_HANDLE_PATTERN.test("1ana")).toBe(false);
    expect(SIGNUP_HANDLE_PATTERN.test("ab")).toBe(false);
  });

  it("con cuenta usa el usuario real; con PIN, el de ejemplo", () => {
    const identity = { handle: "ana_lopez", displayName: "Ana López", initials: "AL", referralCode: "SOCIO-AB12CD" };
    expect(ownHandleFor(identity, "member")).toBe("ana_lopez");
    expect(ownHandleFor(null, "member")).toBe("socio_pl");
    expect(ownHandleFor(null, "tipstar")).toBe("sofia_nfl");
  });
});
