import React from "react";

/**
 * Datos estructurados (schema.org) y sanitización canónica FD-16 para buscadores.
 * Escapa `<` y separadores de línea Unicode para impedir romper el bloque `<script>`.
 */
export function JsonLd({
  data,
}: {
  data: Record<string, unknown> | ReadonlyArray<Record<string, unknown>>;
}): React.JSX.Element {
  const serialized = JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serialized }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Limpieza de URLs canónicas y activos (regla FD-16)                  */
/* ------------------------------------------------------------------ */

const FORBIDDEN_PROVIDER_RE =
  /(?:sportmonks|api-sports|api-football|bzzoiro|sofascore|flagcdn|understat|polymarket|kalshi|espn|nflverse|openfootball)/i;

/**
 * Detecta colas numéricas largas (>= 5 dígitos) típicas de IDs crudos de proveedor
 * (p. ej. `-69552`, `-37250424` o `/19621792`), sin rechazar años (`2026`) ni fechas `YYYY-MM-DD`.
 */
const PROVIDER_NUMERIC_ID_RE = /(?:^|\/|[-_])\d{5,}(?=\/|\.|$)/;

const PROVIDER_QUERY_KEY_RE =
  /(?:bzzoiro|sofascore|sportmonks|apiFootball|provider|external|fixture|event)_?id/i;

const PRIVATE_OR_NON_INDEXABLE_PREFIXES = [
  "/app/",
  "/api/",
  "/i/",
  "/p/",
  "/login",
  "/signup",
  "/onboarding",
  "/baja",
  "/canjear",
  "/offline",
] as const;

function normalizeSiteOrigin(siteUrl: string): string {
  return siteUrl.trim().replace(/\/+$/, "");
}

/**
 * Valida que una ruta pública sea canónica, limpia y libre de IDs o referencias de proveedor (`FD-16`).
 */
export function isCleanPublicCanonicalPath(rawPath: string): boolean {
  const trimmed = rawPath.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return false;
  if (trimmed.includes("?") || trimmed.includes("#")) return false;
  if (FORBIDDEN_PROVIDER_RE.test(trimmed)) return false;
  if (PROVIDER_NUMERIC_ID_RE.test(trimmed)) return false;

  const lower = trimmed.toLowerCase();
  if (
    PRIVATE_OR_NON_INDEXABLE_PREFIXES.some(
      (prefix) => lower === prefix.replace(/\/$/, "") || lower.startsWith(prefix),
    )
  ) {
    return false;
  }

  return true;
}

/**
 * Normaliza una ruta o URL del sitio hacia una URL canónica limpia bajo `siteUrl`.
 * Descarta query strings, hashes, orígenes externos no propios y cualquier rastro `FD-16`.
 */
export function sanitizeCanonicalPublicUrl(
  pathOrUrl: string | null | undefined,
  siteUrl: string,
): string | null {
  if (!pathOrUrl || typeof pathOrUrl !== "string") return null;
  const origin = normalizeSiteOrigin(siteUrl);
  if (!origin) return null;

  let pathname: string;
  if (/^https?:\/\//i.test(pathOrUrl.trim())) {
    try {
      const parsed = new URL(pathOrUrl.trim());
      const siteParsed = new URL(origin);
      if (parsed.origin !== siteParsed.origin) return null;
      for (const key of parsed.searchParams.keys()) {
        if (PROVIDER_QUERY_KEY_RE.test(key)) return null;
      }
      pathname = parsed.pathname;
    } catch {
      return null;
    }
  } else {
    const rawRelative = pathOrUrl.trim();
    const queryPart = rawRelative.split("?", 2)[1]?.split("#", 1)[0] ?? "";
    if (queryPart) {
      const params = new URLSearchParams(queryPart);
      for (const key of params.keys()) {
        if (PROVIDER_QUERY_KEY_RE.test(key)) return null;
      }
    }
    pathname = rawRelative.split(/[?#]/, 1)[0] ?? "";
  }

  const collapsed = pathname.replace(/\/{2,}/g, "/");
  const cleanPath = collapsed.length > 1 ? collapsed.replace(/\/+$/, "") : collapsed || "/";

  if (!isCleanPublicCanonicalPath(cleanPath)) return null;
  return cleanPath === "/" ? `${origin}/` : `${origin}${cleanPath}`;
}

/**
 * Permite únicamente rutas propias de imagen/escudo bajo `siteUrl` (o rutas relativas `/brand/...`),
 * bloqueando hotlinks a CDNs de terceros (`FD-16`).
 */
export function sanitizeFirstPartyAssetUrl(
  assetPathOrUrl: string | null | undefined,
  siteUrl: string,
): string | null {
  if (!assetPathOrUrl || typeof assetPathOrUrl !== "string") return null;
  const raw = assetPathOrUrl.trim();
  if (!raw || FORBIDDEN_PROVIDER_RE.test(raw) || PROVIDER_NUMERIC_ID_RE.test(raw)) {
    return null;
  }

  const origin = normalizeSiteOrigin(siteUrl);
  if (raw.startsWith("/") && !raw.startsWith("//")) {
    const clean = raw.split(/[?#]/, 1)[0]?.replace(/\/{2,}/g, "/") ?? "";
    if (!clean || FORBIDDEN_PROVIDER_RE.test(clean) || PROVIDER_NUMERIC_ID_RE.test(clean)) {
      return null;
    }
    return `${origin}${clean}`;
  }

  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      const siteParsed = new URL(origin);
      if (parsed.origin !== siteParsed.origin) return null;
      if (FORBIDDEN_PROVIDER_RE.test(parsed.pathname) || PROVIDER_NUMERIC_ID_RE.test(parsed.pathname)) {
        return null;
      }
      return `${parsed.origin}${parsed.pathname.replace(/\/{2,}/g, "/")}`;
    } catch {
      return null;
    }
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* SportsEvent JSON-LD (NS / LIVE / FT / Postponed / Cancelled)        */
/* ------------------------------------------------------------------ */

export type SportsEventMatchStatus =
  | "NS"
  | "LIVE"
  | "FT"
  | "scheduled"
  | "in_progress"
  | "final"
  | "postponed"
  | "cancelled";

export interface SportsEventTeamInput {
  name: string;
  canonicalPath?: string | null;
  logoPath?: string | null;
}

export interface SportsEventScoreInput {
  home: number;
  away: number;
}

export interface SportsEventJsonLdInput {
  name?: string;
  sport?: string;
  leagueName?: string;
  canonicalPath?: string | null;
  kickoffUtc: string;
  endDateUtc?: string | null;
  status: SportsEventMatchStatus;
  homeTeam: SportsEventTeamInput;
  awayTeam: SportsEventTeamInput;
  score?: SportsEventScoreInput | null;
  venueName?: string | null;
  refereeName?: string | null;
  description?: string | null;
}

export type SportsEventLifecyclePhase =
  | "scheduled"
  | "in_progress"
  | "completed"
  | "postponed"
  | "cancelled";

export interface SportsEventStatusResolution {
  phase: SportsEventLifecyclePhase;
  /**
   * Valor oficial de `schema.org/EventStatusType` cuando aplica.
   *
   * Nota Schema.org / Google Rich Results: `EventStatusType` solo define
   * `EventScheduled`, `EventPostponed`, `EventCancelled`, `EventRescheduled` y
   * `EventMovedOnline` (no existe `EventCompleted` en el enum oficial). Por eso
   * los partidos finalizados (`FT`/`final`) **nunca** emiten `EventScheduled`:
   * omiten `eventStatus` y declaran `endDate`, marcador oficial y
   * `additionalProperty` con `EventCompleted`.
   */
  schemaEventStatus:
    | "https://schema.org/EventScheduled"
    | "https://schema.org/EventPostponed"
    | "https://schema.org/EventCancelled"
    | null;
  completionLabel: "EventScheduled" | "EventInProgress" | "EventCompleted" | "EventPostponed" | "EventCancelled";
}

export function resolveSportsEventStatus(
  status: SportsEventMatchStatus,
): SportsEventStatusResolution {
  switch (status) {
    case "NS":
    case "scheduled":
      return {
        phase: "scheduled",
        schemaEventStatus: "https://schema.org/EventScheduled",
        completionLabel: "EventScheduled",
      };
    case "LIVE":
    case "in_progress":
      return {
        phase: "in_progress",
        schemaEventStatus: "https://schema.org/EventScheduled",
        completionLabel: "EventInProgress",
      };
    case "FT":
    case "final":
      return {
        phase: "completed",
        schemaEventStatus: null,
        completionLabel: "EventCompleted",
      };
    case "postponed":
      return {
        phase: "postponed",
        schemaEventStatus: "https://schema.org/EventPostponed",
        completionLabel: "EventPostponed",
      };
    case "cancelled":
      return {
        phase: "cancelled",
        schemaEventStatus: "https://schema.org/EventCancelled",
        completionLabel: "EventCancelled",
      };
  }
}

function defaultMatchDurationMs(sport?: string): number {
  const normalized = (sport ?? "").toLowerCase();
  if (
    normalized.includes("american") ||
    normalized.includes("nfl") ||
    normalized.includes("baseball") ||
    normalized.includes("mlb")
  ) {
    return 3 * 60 * 60 * 1000;
  }
  if (
    normalized.includes("basketball") ||
    normalized.includes("nba") ||
    normalized.includes("hockey") ||
    normalized.includes("nhl")
  ) {
    return 150 * 60 * 1000;
  }
  return 2 * 60 * 60 * 1000;
}

function normalizeIsoTimestamp(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

function buildSportsTeamJsonLd(
  team: SportsEventTeamInput,
  siteUrl: string,
): Record<string, unknown> {
  const node: Record<string, unknown> = {
    "@type": "SportsTeam",
    name: team.name.trim(),
  };

  const url = sanitizeCanonicalPublicUrl(team.canonicalPath, siteUrl);
  if (url) node.url = url;

  const logo = sanitizeFirstPartyAssetUrl(team.logoPath, siteUrl);
  if (logo) node.logo = logo;

  return node;
}

/**
 * Genera datos estructurados `SportsEvent` (schema.org) diferenciando explícitamente:
 * - Partidos próximos (`NS` / `scheduled`): `eventStatus: "https://schema.org/EventScheduled"`.
 * - Partidos en curso (`LIVE` / `in_progress`): `eventStatus: "https://schema.org/EventScheduled"` + señal `EventInProgress`.
 * - Partidos finalizados (`FT` / `final`): sin `EventScheduled`, con `endDate`, marcador oficial, `winner` (si hubo ganador) y `EventCompleted`.
 * - URLs canónicas y escudos estrictamente propios sin IDs de proveedor (`FD-16`).
 */
export function buildSportsEventJsonLd(
  input: SportsEventJsonLdInput,
  siteUrl: string,
): Record<string, unknown> {
  const origin = normalizeSiteOrigin(siteUrl);
  const statusInfo = resolveSportsEventStatus(input.status);
  const homeNode = buildSportsTeamJsonLd(input.homeTeam, origin);
  const awayNode = buildSportsTeamJsonLd(input.awayTeam, origin);
  const startDate = normalizeIsoTimestamp(input.kickoffUtc);
  const explicitEndDate = normalizeIsoTimestamp(input.endDateUtc);

  const hasValidScore =
    input.score != null &&
    Number.isFinite(input.score.home) &&
    Number.isFinite(input.score.away);

  const defaultName =
    statusInfo.phase === "completed" && hasValidScore
      ? `${input.homeTeam.name.trim()} ${input.score!.home}\u2013${input.score!.away} ${input.awayTeam.name.trim()}`
      : `${input.homeTeam.name.trim()} vs ${input.awayTeam.name.trim()}`;

  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: input.name?.trim() || defaultName,
    homeTeam: homeNode,
    awayTeam: awayNode,
    competitor: [homeNode, awayNode],
  };

  if (input.sport?.trim()) {
    node.sport = input.sport.trim();
  }

  const canonicalUrl = sanitizeCanonicalPublicUrl(input.canonicalPath, origin);
  if (canonicalUrl) {
    node.url = canonicalUrl;
    node.mainEntityOfPage = { "@type": "WebPage", "@id": canonicalUrl };
  }

  if (startDate) {
    node.startDate = startDate;
  }

  if (statusInfo.schemaEventStatus) {
    node.eventStatus = statusInfo.schemaEventStatus;
  }

  if (statusInfo.phase === "completed") {
    const derivedEndDate =
      explicitEndDate ??
      (startDate
        ? new Date(Date.parse(startDate) + defaultMatchDurationMs(input.sport)).toISOString()
        : null);
    if (derivedEndDate) {
      node.endDate = derivedEndDate;
    }
  } else if (explicitEndDate) {
    node.endDate = explicitEndDate;
  }

  const leagueLabel = input.leagueName?.trim();
  if (leagueLabel) {
    node.superEvent = {
      "@type": "SportsEvent",
      name: leagueLabel,
    };
    node.organizer = {
      "@type": "Organization",
      name: leagueLabel,
    };
  }

  if (input.venueName?.trim()) {
    node.location = {
      "@type": "Place",
      name: input.venueName.trim(),
    };
  }

  const additionalProperties: Array<Record<string, unknown>> = [
    {
      "@type": "PropertyValue",
      name: "eventCompletionStatus",
      value: statusInfo.completionLabel,
    },
  ];

  if (input.refereeName?.trim()) {
    additionalProperties.push({
      "@type": "PropertyValue",
      name: "referee",
      value: input.refereeName.trim(),
    });
  }

  if (hasValidScore) {
    additionalProperties.push({
      "@type": "PropertyValue",
      name: statusInfo.phase === "completed" ? "finalScore" : "liveScore",
      value: `${input.score!.home}-${input.score!.away}`,
    });
  }

  node.additionalProperty = additionalProperties;

  if (input.description?.trim()) {
    node.description = input.description.trim();
  } else if (statusInfo.phase === "completed" && hasValidScore) {
    const suffix = leagueLabel ? ` · ${leagueLabel}` : "";
    node.description = `Marcador final: ${input.homeTeam.name.trim()} ${input.score!.home}\u2013${input.score!.away} ${input.awayTeam.name.trim()}${suffix}.`;
  }

  if (statusInfo.phase === "completed" && hasValidScore) {
    if (input.score!.home > input.score!.away) {
      node.winner = homeNode;
    } else if (input.score!.away > input.score!.home) {
      node.winner = awayNode;
    }
  }

  return node;
}

/**
 * Envuelve una lista de partidos en un `ItemList` de `SportsEvent` para superficies públicas
 * (p. ej. calendario o historial de resultados).
 */
export function buildSportsEventListJsonLd(
  events: ReadonlyArray<SportsEventJsonLdInput>,
  siteUrl: string,
  listName = "Partidos en PitchLab",
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: listName,
    numberOfItems: events.length,
    itemListElement: events.map((event, index) => {
      const eventNode = buildSportsEventJsonLd(event, siteUrl);
      const { "@context": _ctx, ...itemWithoutContext } = eventNode;
      void _ctx;
      return {
        "@type": "ListItem",
        position: index + 1,
        item: itemWithoutContext,
      };
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Datos estructurados públicos para `/precio`                         */
/* ------------------------------------------------------------------ */

export interface PricingJsonLdSpec {
  readonly name: string;
  readonly monthlyMxn: number;
  readonly annualMxn: number;
  readonly cfdiNote?: string;
}

export interface PricingFaqItem {
  readonly question: string;
  readonly answer: string;
}

/**
 * Genera el grafo JSON-LD público de `/precio` (`SoftwareApplication` con ofertas en MXN,
 * `BreadcrumbList` y `FAQPage`). Nunca incluye datos de sesión, CLABE ni referencias SPEI.
 */
export function buildPricingPageJsonLd(
  siteUrl: string,
  spec: PricingJsonLdSpec,
  faqs: ReadonlyArray<PricingFaqItem> = [],
): ReadonlyArray<Record<string, unknown>> {
  const origin = normalizeSiteOrigin(siteUrl);
  const pricingUrl = `${origin}/precio`;

  const productNode: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: spec.name,
    applicationCategory: "SportsApplication",
    operatingSystem: "Web, iOS, Android",
    url: pricingUrl,
    inLanguage: "es-MX",
    description:
      "Probabilidad calibrada por partido, momio justo sin margen, mercados avanzados, armador de parlays y bitácora verificable. No somos casa de apuestas.",
    publisher: {
      "@type": "Organization",
      name: "PitchLab",
      url: origin,
    },
    offers: [
      {
        "@type": "Offer",
        name: `${spec.name} · Mensual`,
        price: spec.monthlyMxn,
        priceCurrency: "MXN",
        availability: "https://schema.org/InStock",
        url: pricingUrl,
        description: "Acceso mensual completo con IVA incluido y 7 días de prueba sin tarjeta.",
      },
      {
        "@type": "Offer",
        name: `${spec.name} · Anual`,
        price: spec.annualMxn,
        priceCurrency: "MXN",
        availability: "https://schema.org/InStock",
        url: pricingUrl,
        description: "Acceso anual completo con IVA incluido y factura CFDI disponible.",
      },
    ],
  };

  const breadcrumbNode: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: `${origin}/` },
      { "@type": "ListItem", position: 2, name: "Precio", item: pricingUrl },
    ],
  };

  if (faqs.length === 0) {
    return [productNode, breadcrumbNode];
  }

  const faqNode: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };

  return [productNode, breadcrumbNode, faqNode];
}
