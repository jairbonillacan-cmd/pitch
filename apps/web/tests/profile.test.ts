import { afterEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "../app/api/me/profile/route";
import { GET as getPublicProfile } from "../app/api/u/[handle]/route";
import { parseProfileChanges } from "../src/server/profile";

const mocks = vi.hoisted(() => ({
  requireMember: vi.fn(),
  createDb: vi.fn(),
  updateMemberProfile: vi.fn(),
  publicProfileByHandle: vi.fn(),
}));
vi.mock("../src/server/session-user", () => ({ requireMember: mocks.requireMember }));
vi.mock("@pitchlab/db", async (importOriginal) => ({
  ...await importOriginal<typeof import("@pitchlab/db")>(),
  createDb: mocks.createDb,
  updateMemberProfile: mocks.updateMemberProfile,
  publicProfileByHandle: mocks.publicProfileByHandle,
}));

const profileRequest = (body: unknown) => new Request("http://localhost:9990/api/me/profile", {
  method: "PATCH",
  body: JSON.stringify(body),
  headers: { "content-type": "application/json" },
});

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

describe("edición de perfil", () => {
  it("limpia el nombre y el usuario y permite quitar la bio", () => {
    expect(parseProfileChanges({ displayName: "  Ana   López  ", handle: " @Ana_L ", bio: "" })).toEqual({
      changes: { displayName: "Ana López", handle: "ana_l", bio: null },
    });
  });

  it.each([
    [{ displayName: "a" }, "nombre_invalido"],
    [{ handle: "2ana" }, "usuario_invalido"],
    [{ handle: "admin" }, "usuario_reservado"],
    [{ bio: "x".repeat(161) }, "bio_invalida"],
    [{ bio: "Mira https://example.com" }, "bio_con_enlace"],
    [{ bio: "Canal t.me/ejemplo" }, "bio_con_enlace"],
    [{ xUsername: "cuenta_ajena" }, "datos_invalidos"],
  ])("rechaza %o", async (body, error) => {
    mocks.requireMember.mockResolvedValue({ db: {}, userId: "socio" });
    const response = await PATCH(profileRequest(body));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error });
    expect(mocks.updateMemberProfile).not.toHaveBeenCalled();
  });

  it("responde 409 cuando el usuario ya está ocupado", async () => {
    mocks.requireMember.mockResolvedValue({ db: {}, userId: "socio" });
    mocks.updateMemberProfile.mockResolvedValue({ status: "taken" });
    const response = await PATCH(profileRequest({ handle: "@Prueba_Local" }));
    expect(response.status).toBe(409);
    expect(mocks.updateMemberProfile).toHaveBeenCalledWith({}, "socio", { handle: "prueba_local" });
  });
});

describe("perfil público", () => {
  it("devuelve solo los campos públicos y 404 para un usuario ausente", async () => {
    vi.stubEnv("DATABASE_URL", "stub");
    mocks.createDb.mockReturnValue({});
    const publicFields = {
      displayName: "Ana",
      handle: "ana_perfil",
      bio: "Liga MX",
      avatarUrl: null,
      xUsername: "ana_perfil",
      joinedAt: "2026-11-12T12:00:00.000Z",
      isTipstar: false,
    };
    mocks.publicProfileByHandle.mockResolvedValueOnce({
      ...publicFields,
      joinedAt: new Date(publicFields.joinedAt),
      email: "ana@example.com",
      birthDate: "1990-01-01",
      termsAcceptedAt: new Date(),
      analyticsConsent: true,
    }).mockResolvedValueOnce(null);
    const request = new Request("http://localhost:9990/api/u/ana_perfil");
    const response = await getPublicProfile(request, { params: Promise.resolve({ handle: "ana_perfil" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(publicFields);
    const missing = await getPublicProfile(request, { params: Promise.resolve({ handle: "anterior" }) });
    expect(missing.status).toBe(404);
  });
});
