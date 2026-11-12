import { describe, expect, it } from "vitest";
import {
  fromServerPost,
  mergeSocialPosts,
  relativeTimeLabel,
  type ServerSocialPost,
} from "../src/platform/social-sync";
import type { SocialPost } from "../src/platform/types";

const now = new Date("2026-11-12T12:00:00Z");

function server(id: string, createdAt: string, extra: Partial<ServerSocialPost> = {}): ServerSocialPost {
  return {
    id,
    authorHandle: "ana_mx",
    authorName: "Ana López",
    authorIsTipstar: false,
    roleBadge: "Socio Pase PitchLab Ultra",
    record: "Sin picks liquidados",
    clv: "CLV —",
    leagueLabel: "Comunidad",
    matchLabel: "",
    gameId: null,
    pickBadge: "",
    originType: "Bitácora Propia",
    pick: null,
    body: `Publicación ${id}`,
    createdAt,
    likes: 0,
    likedByMe: false,
    isMine: false,
    comments: [],
    ...extra,
  };
}

const toPost = (p: ServerSocialPost): SocialPost => fromServerPost(p, [], now);

const example = { ...toPost(server("ej", "2026-11-01T00:00:00Z")), id: "ej-1", isExample: true, fromServer: false };

describe("hora relativa", () => {
  it("dice ahora, minutos, horas y días", () => {
    expect(relativeTimeLabel("2026-11-12T11:59:40Z", now)).toBe("Ahora");
    expect(relativeTimeLabel("2026-11-12T11:55:00Z", now)).toBe("Hace 5 min");
    expect(relativeTimeLabel("2026-11-12T09:00:00Z", now)).toBe("Hace 3 h");
    expect(relativeTimeLabel("2026-11-10T12:00:00Z", now)).toBe("Hace 2 d");
  });
});

describe("mezcla del feed compartido", () => {
  it("lo nuevo arriba, los ejemplos al final y lo borrado desaparece", () => {
    const a = toPost(server("a", "2026-11-12T10:00:00Z"));
    const b = toPost(server("b", "2026-11-12T11:00:00Z"));
    const borrada = toPost(server("x", "2026-11-12T10:30:00Z"));
    const current = [borrada, a, example];

    const merged = mergeSocialPosts(current, [b, a], "feed");
    expect(merged.map((p) => p.id)).toEqual(["b", "a", "ej-1"]);
  });

  it("conserva publicaciones más viejas que el feed (perfiles) y las pendientes", () => {
    const vieja = toPost(server("v", "2026-10-01T00:00:00Z"));
    const pendiente = { ...toPost(server("p", "2026-11-12T11:59:00Z")), id: "tmp-1", fromServer: false };
    const a = toPost(server("a", "2026-11-12T10:00:00Z"));

    const merged = mergeSocialPosts([pendiente, vieja, example], [a], "feed");
    expect(merged.map((p) => p.id)).toEqual(["tmp-1", "a", "v", "ej-1"]);
  });

  it("en un perfil agrega sin quitar las del feed", () => {
    const a = toPost(server("a", "2026-11-12T10:00:00Z"));
    const deOtro = toPost(server("o", "2026-11-11T10:00:00Z", { authorHandle: "beto_nfl" }));
    const merged = mergeSocialPosts([a, example], [deOtro], "extra");
    expect(merged.map((p) => p.id)).toEqual(["a", "o", "ej-1"]);
  });

  it("las publicaciones guardadas solo en el navegador no se mezclan con las del servidor", () => {
    const local = { ...toPost(server("l", "2026-11-12T09:00:00Z")), id: "sp-123", fromServer: false };
    const a = toPost(server("a", "2026-11-12T10:00:00Z"));
    expect(mergeSocialPosts([local, example], [a], "feed").map((p) => p.id)).toEqual(["a", "ej-1"]);
  });

  it("pagina más de 50 publicaciones con extra sin duplicar ni saltar y deja los ejemplos al final", () => {
    const all = Array.from({ length: 65 }, (_, i) => {
      const ts = new Date(now.getTime() - i * 60_000).toISOString();
      return toPost(server(`p-${i + 1}`, ts));
    });
    const first50 = all.slice(0, 50);
    const next15 = all.slice(50, 65);

    const stateAfterInitial = mergeSocialPosts([example], first50, "feed");
    const stateAfterLoadMore = mergeSocialPosts(stateAfterInitial, next15, "extra");

    expect(stateAfterLoadMore.map((p) => p.id)).toEqual([...all.map((p) => p.id), "ej-1"]);
  });
});
