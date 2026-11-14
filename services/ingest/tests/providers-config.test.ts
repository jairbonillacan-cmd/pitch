import { describe, expect, it } from "vitest";
import { describeProviders, readProviderConfigs } from "../src/providers/config.js";

describe("configuración de proveedores de datos", () => {
  it("sin claves deja apagados 5Dollar y Bzzoiro, y encendidos MLB y NHL", () => {
    const cfg = readProviderConfigs({});
    expect(cfg.fivedollar.enabled).toBe(false);
    expect(cfg.bzzoiro.enabled).toBe(false);
    expect(cfg.mlb_statsapi.enabled).toBe(true);
    expect(cfg.nhl_web.enabled).toBe(true);
    expect(cfg.fivedollar.headers.Authorization).toBeUndefined();
  });

  it("arma la cabecera correcta de cada proveedor", () => {
    const cfg = readProviderConfigs({
      FIVEDOLLAR_FOOTBALL_API_KEY: " fb_live_abc123 ",
      BZZOIRO_API_KEY: "bz_secret_9876",
    });
    expect(cfg.fivedollar.headers.Authorization).toBe("Bearer fb_live_abc123");
    expect(cfg.bzzoiro.headers.Authorization).toBe("Token bz_secret_9876");
    expect(cfg.fivedollar.baseUrl).toBe("https://api.5dollarfootballapi.com/v1");
  });

  it("pide atribución en el plan gratuito de 5Dollar y no en Pro", () => {
    const key = { FIVEDOLLAR_FOOTBALL_API_KEY: "k" };
    expect(readProviderConfigs(key).fivedollar.commercialStatus).toBe(
      "commercial_allowed_with_attribution",
    );
    expect(
      readProviderConfigs({ ...key, FIVEDOLLAR_FOOTBALL_PLAN: "Pro" }).fivedollar.commercialStatus,
    ).toBe("commercial_allowed");
  });

  it("MLB y NHL quedan solo para investigación hasta tener licencia", () => {
    const cfg = readProviderConfigs({});
    expect(cfg.mlb_statsapi.commercialStatus).toBe("research_only_until_licensed");
    expect(cfg.nhl_web.commercialStatus).toBe("research_only_until_licensed");
  });

  it("el resumen nunca muestra la clave completa", () => {
    const text = JSON.stringify(
      describeProviders({ BZZOIRO_API_KEY: "bz_secret_9876", MLB_STATSAPI_ENABLED: "0" }),
    );
    expect(text).not.toContain("bz_secret");
    expect(text).toContain("…9876");
    expect(text).toContain('"key":"falta"');
  });
});
