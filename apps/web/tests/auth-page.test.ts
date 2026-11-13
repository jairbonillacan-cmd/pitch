import { describe, expect, it } from "vitest";
import { authPageRedirect } from "../src/server/auth-page";

const complete = { via: "account", signupComplete: true } as const;
const incomplete = { via: "account", signupComplete: false } as const;

describe("redirecciones de acceso", () => {
  it.each(["login", "signup"] as const)("redirige %s con una sesión de cuenta o PIN", (mode) => {
    expect(authPageRedirect(mode, undefined, "/app/social?tab=ranking", complete)).toBe("/app/social?tab=ranking");
    expect(authPageRedirect(mode, undefined, "https://example.com", { via: "beta", signupComplete: true })).toBe("/app");
    expect(authPageRedirect(mode, undefined, undefined, incomplete)).toBe("/signup?paso=2&via=cuenta");
    expect(authPageRedirect(mode, undefined, "/app/parlays", incomplete)).toBe("/signup?paso=2&via=cuenta&next=%2Fapp%2Fparlays");
    expect(authPageRedirect(mode, undefined, undefined, { via: "none", signupComplete: false })).toBeNull();
  });

  it("mantiene visibles los estados del enlace mágico y el paso 2", () => {
    for (const mode of ["login", "signup"] as const) {
      expect(authPageRedirect(mode, "confirmado", undefined, complete)).toBeNull();
      expect(authPageRedirect(mode, "vencido", undefined, complete)).toBeNull();
    }
    expect(authPageRedirect("signup", "2", undefined, incomplete)).toBeNull();
  });
});
