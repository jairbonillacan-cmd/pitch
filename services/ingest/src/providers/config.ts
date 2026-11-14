/**
 * Configuración de los proveedores de datos deportivos (fútbol, MLB y NHL).
 *
 * Cada proveedor se enciende solo si su variable de entorno existe. Las claves nunca se
 * imprimen: `describeProviders` devuelve solo si están cargadas y los últimos 4 caracteres.
 *
 * Uso comercial (revisado el 2026-11-14):
 * - 5DollarFootballAPI: comercial permitido; en los planes de $0 hay que mostrar
 *   «Football data by 5DollarFootballAPI» con enlace. No se puede revender el dato crudo.
 * - Bzzoiro (BSD): comercial permitido para mostrar y para entrenar modelos; las salidas
 *   derivadas son nuestras. No se puede redistribuir el dato crudo. Escudos y fotos no
 *   entran en la licencia.
 * - MLB StatsAPI y NHL Web API: sin clave, pero el aviso de MLBAM limita a uso personal y
 *   no comercial. Sirven para investigar y entrenar; para mostrar en la app de pago hace
 *   falta licencia o un proveedor con licencia.
 */

export type ProviderId = "fivedollar" | "bzzoiro" | "mlb_statsapi" | "nhl_web";

export type CommercialStatus =
  | "commercial_allowed"
  | "commercial_allowed_with_attribution"
  | "research_only_until_licensed";

export interface ProviderConfig {
  readonly id: ProviderId;
  readonly displayName: string;
  readonly enabled: boolean;
  readonly baseUrl: string;
  /** Cabeceras listas para `fetch`, con la clave si aplica. Nunca se registran en logs. */
  readonly headers: Readonly<Record<string, string>>;
  readonly keyEnvVar: string | null;
  readonly commercialStatus: CommercialStatus;
  /** Ruta barata para comprobar que la clave y el servicio responden. */
  readonly healthPath: string;
}

export type ProviderEnv = Readonly<Record<string, string | undefined>>;

export const DATA_USER_AGENT_DEFAULT = "PitchLab-Bot/1.0 (+https://pitchlab.mx; data-research)";

function read(env: ProviderEnv, key: string): string {
  return env[key]?.trim() ?? "";
}

function baseUrl(env: ProviderEnv, key: string, fallback: string): string {
  return (read(env, key) || fallback).replace(/\/+$/, "");
}

export function readProviderConfigs(env: ProviderEnv = process.env): Record<ProviderId, ProviderConfig> {
  const userAgent = read(env, "PITCHLAB_DATA_USER_AGENT") || DATA_USER_AGENT_DEFAULT;
  const common = { "User-Agent": userAgent, Accept: "application/json" };

  const fivedollarKey = read(env, "FIVEDOLLAR_FOOTBALL_API_KEY");
  const fivedollarPaid = read(env, "FIVEDOLLAR_FOOTBALL_PLAN").toLowerCase();
  const bzzoiroKey = read(env, "BZZOIRO_API_KEY");

  return {
    fivedollar: {
      id: "fivedollar",
      displayName: "5DollarFootballAPI",
      enabled: fivedollarKey.length > 0,
      baseUrl: baseUrl(env, "FIVEDOLLAR_FOOTBALL_API_BASE_URL", "https://api.5dollarfootballapi.com/v1"),
      headers: fivedollarKey ? { ...common, Authorization: `Bearer ${fivedollarKey}` } : common,
      keyEnvVar: "FIVEDOLLAR_FOOTBALL_API_KEY",
      commercialStatus:
        fivedollarPaid === "pro" || fivedollarPaid === "ultra" || fivedollarPaid === "business"
          ? "commercial_allowed"
          : "commercial_allowed_with_attribution",
      healthPath: "/status",
    },
    bzzoiro: {
      id: "bzzoiro",
      displayName: "Bzzoiro Sports Data",
      enabled: bzzoiroKey.length > 0,
      baseUrl: baseUrl(env, "BZZOIRO_API_BASE_URL", "https://sports.bzzoiro.com/api/v2"),
      headers: bzzoiroKey ? { ...common, Authorization: `Token ${bzzoiroKey}` } : common,
      keyEnvVar: "BZZOIRO_API_KEY",
      commercialStatus: "commercial_allowed",
      healthPath: "/leagues/?limit=1",
    },
    mlb_statsapi: {
      id: "mlb_statsapi",
      displayName: "MLB Stats API",
      enabled: read(env, "MLB_STATSAPI_ENABLED") !== "0",
      baseUrl: baseUrl(env, "MLB_STATSAPI_BASE_URL", "https://statsapi.mlb.com/api"),
      headers: common,
      keyEnvVar: null,
      commercialStatus: "research_only_until_licensed",
      healthPath: "/v1/sports/1",
    },
    nhl_web: {
      id: "nhl_web",
      displayName: "NHL Web API",
      enabled: read(env, "NHL_API_ENABLED") !== "0",
      baseUrl: baseUrl(env, "NHL_API_BASE_URL", "https://api-web.nhle.com/v1"),
      headers: common,
      keyEnvVar: null,
      commercialStatus: "research_only_until_licensed",
      healthPath: "/standings/now",
    },
  };
}

export interface ProviderSummary {
  readonly id: ProviderId;
  readonly displayName: string;
  readonly enabled: boolean;
  readonly baseUrl: string;
  readonly key: "no_requiere" | "falta" | `cargada (…${string})`;
  readonly commercialStatus: CommercialStatus;
}

/** Resumen seguro para imprimir: nunca incluye la clave completa. */
export function describeProviders(env: ProviderEnv = process.env): ProviderSummary[] {
  return Object.values(readProviderConfigs(env)).map((cfg) => {
    let key: ProviderSummary["key"] = "no_requiere";
    if (cfg.keyEnvVar) {
      const value = read(env, cfg.keyEnvVar);
      key = value ? `cargada (…${value.slice(-4)})` : "falta";
    }
    return {
      id: cfg.id,
      displayName: cfg.displayName,
      enabled: cfg.enabled,
      baseUrl: cfg.baseUrl,
      key,
      commercialStatus: cfg.commercialStatus,
    };
  });
}
