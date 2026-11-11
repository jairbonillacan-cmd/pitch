import type {
  PrecisionBucket,
  SocialPost,
  SpacetimeEngineSpec,
  TipstarCreator,
} from "./types.js";

/**
 * Cifras públicas de los motores. Cada una sale del reporte A26 de la rama prediction-lab
 * (research/prediction-lab/reports/A26_web_scraping_feature_store_integration.md):
 * evaluación fuera de muestra sobre la temporada 2024–25. No agregar cifras sin fuente.
 */
export const SPACETIME_METRICS_HEADLINE = {
  suiteName: "PitchLab Spacetime Suite v3.0",
  /** Partidos de fútbol de la prueba fuera de muestra 2024–25. */
  historicalMatches: "16,126",
  /** Registros normalizados de las 28 fuentes del feature store v2.0. */
  telemetryPoints: "108,167",
  /** ROI fuera de muestra de Geodesic v2.0 (Kelly 0.25x, 3,670 apuestas). */
  closingLineBeatPct: "+1.35 %",
  /** ECE uno-contra-todos de los candidatos finales: todos por debajo de 0.02. */
  calibrationError: "< 0.02 ECE",
  retrainSchedule: "Recalibración en laboratorio con validación fuera de muestra",
  activeLeaguesCount: 7,
  picksPerMatchRange: "3 a 5",
} as const;

export const SPACETIME_ENGINES: readonly SpacetimeEngineSpec[] = [
  {
    key: "tachyon",
    name: "PitchLab Tachyon v3.0",
    version: "v3.0",
    pillar: "Data Science",
    domain: "Fútbol · 23 ligas de entrenamiento · 136 variables",
    colorVar: "var(--engine-tachyon)",
    summary:
      "Motor deportivo puro: no usa momios. Combina fuerza estructural, xG real, presión táctica, altitud del estadio y disponibilidad de la plantilla.",
    inputsLabel:
      "Liga MX 2024–25: 54.7 % de acierto contra 53.7 % del mercado (676 partidos).",
    retrainCadence: "Validado fuera de muestra en 16,126 partidos 2024–25.",
  },
  {
    key: "singularity",
    name: "PitchLab Singularity v3.0",
    version: "v3.0",
    pillar: "Machine Learning",
    domain: "Modelo + mercado · Detección de valor",
    colorVar: "var(--engine-singularity)",
    summary:
      "Mezcla la probabilidad de Tachyon con el mercado sin margen de la casa y corrige el sesgo del público en Liga MX.",
    inputsLabel:
      "Mejor log-loss que el momio de cierre en 16,126 partidos 2024–25 (IC 95 % sin cruzar cero).",
    retrainCadence: "Se recalcula con cada corte de momios.",
  },
  {
    key: "minkowski",
    name: "PitchLab Minkowski v3.0",
    version: "v3.0",
    pillar: "Data Science",
    domain: "NFL · 29 variables + capa de contexto en vivo",
    colorVar: "var(--engine-minkowski)",
    summary:
      "Eficiencia por jugada, lesiones de QB y titulares, disciplina, clima y altitud del estadio para cada juego de NFL.",
    inputsLabel: "Prueba 2020–25: 65.8 % de acierto en 1,615 juegos.",
    retrainCadence: "Contexto en vivo actualizado antes de cada semana.",
  },
  {
    key: "geodesic",
    name: "PitchLab Geodesic v2.0",
    version: "v2.0",
    pillar: "Machine Learning",
    domain: "Momio justo, ventaja y tamaño de apuesta",
    colorVar: "var(--engine-geodesic)",
    summary:
      "Quita el margen de la casa, calcula la ventaja contra el momio real y solo marca valor cuando el dinero institucional no va en contra.",
    inputsLabel: "ROI fuera de muestra de +1.35 % en 3,670 apuestas (Kelly 0.25x).",
    retrainCadence: "Se evalúa con cada momio publicado.",
  },
  {
    key: "cortex",
    name: "PitchLab Cortex IA",
    version: "v3.0",
    pillar: "Inteligencia Artificial",
    domain: "Resumen previo del partido",
    colorVar: "var(--engine-cortex)",
    summary:
      "Resume en lenguaje claro lo que dicen los motores: probabilidad, factores con más peso, mercado y bajas reportadas.",
    inputsLabel: "Solo usa números de los motores; si un dato falta, lo dice.",
    retrainCadence: "Se genera con cada corte de datos.",
  },
] as const;

/**
 * Cubos de precisión. La tasa real se publica cuando haya picks auditados de PitchLab;
 * hasta entonces los campos auditados van en null y la UI lo indica.
 */
export const PRECISION_BUCKETS: readonly PrecisionBucket[] = [
  {
    id: "shield",
    label: "Confianza Máxima · Escudo",
    rangeLabel: "Dobles oportunidades y líneas base",
    promisedMeanP: 0.82,
    actualHitRate: null,
    auditedPicksCount: null,
    closingBeatRate: null,
  },
  {
    id: "core",
    label: "Confianza Alta · Principal",
    rangeLabel: "Picks principales de Tachyon, Singularity y Minkowski",
    promisedMeanP: 0.62,
    actualHitRate: null,
    auditedPicksCount: null,
    closingBeatRate: null,
  },
  {
    id: "balanced",
    label: "Confianza Media · Balanceado",
    rangeLabel: "Totales, ambos anotan y líneas por equipo",
    promisedMeanP: 0.58,
    actualHitRate: null,
    auditedPicksCount: null,
    closingBeatRate: null,
  },
  {
    id: "value",
    label: "Alto Valor",
    rangeLabel: "Momios altos con ventaja de Geodesic contra la casa",
    promisedMeanP: 0.4,
    actualHitRate: null,
    auditedPicksCount: null,
    closingBeatRate: null,
  },
] as const;

export const MEMBERSHIP_SPEC = {
  name: "Pase Total PitchLab",
  monthlyMxn: 299,
  annualMxn: 2390,
  annualMonthlyEquivalentMxn: 199,
  annualSavingsPct: 33,
  trialMonth1Label: "7 días gratis sin tarjeta (Mes 1 de lanzamiento)",
  trialMonth2Label: "7 días gratis con verificación $0 MXN",
  referralFriendBenefit: "7 días gratis + 30 % de descuento en su primer mes ($209 MXN)",
  referralBothRewardDays: 15,
  referralAmbassadorThreshold: 5,
  referralAmbassadorBonusDays: 30,
  cfdiNote: "IVA incluido · Factura CFDI 4.0 automática en segundos",
} as const;

export const TIPSTAR_CREATORS: readonly TipstarCreator[] = [
  {
    isExample: true,
    handle: "sofia_nfl",
    name: "Sofía Méndez",
    specialty: "NFL & Totales · Tipstar Oficial",
    avatarInitials: "SM",
    avatarGradVar: "var(--avatar-grad-1)",
    promoCode: "SOFIA5",
    freeDays: 5,
    commissionPct: 25,
    verifiedUnits: "+18.4u",
    clvAvg: "+4.2 %",
    roi95Ci: "+6.8 % (±2.9 %)",
    settledCount: 142,
    activeReferrals: 38,
    monthlyCommissionMxn: 2840,
    weeklyPickOrigin: "spacetime",
    weeklyPickSlug: "sofia-sem",
    weeklyPickGameId: "",
    weeklyPickThesis:
      "PitchLab Minkowski v3.0 proyecta ventaja sostenida en eficiencia por serie y ritmo controlado en segunda mitad; Geodesic v2.0 marca +4.6 pts de ventaja sobre el momio disponible.",
  },
  {
    isExample: true,
    handle: "carlos_quant",
    name: "Carlos Vega",
    specialty: "Premier League & LaLiga · Valor Geodesic",
    avatarInitials: "CV",
    avatarGradVar: "var(--avatar-grad-2)",
    promoCode: "CARLOS5",
    freeDays: 5,
    commissionPct: 25,
    verifiedUnits: "+14.9u",
    clvAvg: "+3.9 %",
    roi95Ci: "+5.4 % (±2.6 %)",
    settledCount: 186,
    activeReferrals: 29,
    monthlyCommissionMxn: 2167,
    weeklyPickOrigin: "spacetime",
    weeklyPickSlug: "carlos-sem",
    weeklyPickGameId: "",
    weeklyPickThesis:
      "Cruce con diferencial claro en generación ofensiva local según Tachyon v3.0 y confirmación de cuadro titular en Cortex IA.",
  },
  {
    isExample: true,
    handle: "diego_tactico",
    name: "Diego Aranda",
    specialty: "Liga MX & Combinadas Conservadoras",
    avatarInitials: "DA",
    avatarGradVar: "var(--avatar-grad-3)",
    promoCode: "DIEGO5",
    freeDays: 5,
    commissionPct: 25,
    verifiedUnits: "+11.6u",
    clvAvg: "+3.1 %",
    roi95Ci: "+4.9 % (±3.0 %)",
    settledCount: 118,
    activeReferrals: 22,
    monthlyCommissionMxn: 1644,
    weeklyPickOrigin: "bitacora",
    weeklyPickSlug: "diego-sem",
    weeklyPickGameId: "",
    weeklyPickThesis:
      "Altura y rotación corta de media semana favorecen el escudo conservador local más línea de goles controlada.",
  },
] as const;

export const INITIAL_SOCIAL_POSTS: readonly SocialPost[] = [
  {
    isExample: true,
    id: "sp-1",
    authorHandle: "sofia_nfl",
    authorName: "Sofía Méndez",
    roleBadge: "Tipstar Oficial",
    avatarGradVar: "var(--avatar-grad-1)",
    verifiedRecord: "+18.4u · 142 picks",
    clvBadge: "CLV +4.2 %",
    leagueLabel: "NFL",
    matchLabel: "Radiografía estelar de la semana",
    pickBadge: "Pick Principal · 2.0u",
    originType: "Spacetime Suite",
    createdAt: "Hace 18 min",
    body: "Mi Pick Abierto de la Semana: Minkowski v3.0 detecta ventaja clara en QB titular y presión en tercer down antes de que cierre la línea. Geodesic v2.0 confirma flujo institucional temprano.",
    likes: 42,
    comments: [
      {
        id: "sc-101",
        authorHandle: "carlos_quant",
        authorName: "Carlos Vega",
        verifiedBadge: "+14.9u · CLV +3.9 %",
        createdAt: "Hace 11 min",
        body: "Totalmente alineado. Yo lo combiné en un Parlay Conservador de 2 selecciones con el escudo de Premier League.",
      },
      {
        id: "sc-101b",
        authorHandle: "diego_tactico",
        authorName: "Diego Aranda",
        verifiedBadge: "+11.6u · CLV +3.1 %",
        createdAt: "Hace 5 min",
        body: "Ya lo sellé como base en mi bitácora antes de que baje medio punto.",
      },
    ],
  },
  {
    isExample: true,
    id: "sp-2",
    authorHandle: "carlos_quant",
    authorName: "Carlos Vega",
    roleBadge: "Analista Verificado",
    avatarGradVar: "var(--avatar-grad-2)",
    verifiedRecord: "+14.9u · 186 picks",
    clvBadge: "CLV +3.9 %",
    leagueLabel: "Premier League",
    matchLabel: "Lectura de totales europeos",
    pickBadge: "Línea de Totales · 1.5u",
    originType: "Spacetime Suite",
    createdAt: "Hace 42 min",
    body: "Ojo al reporte 60m de Cortex IA: ambos laterales titulares están confirmados y Tachyon v3.0 sube la proyección combinada de goles a 2.95. Excelente ventana para sellar en bitácora.",
    likes: 27,
    comments: [
      {
        id: "sc-102",
        authorHandle: "jair_founder",
        authorName: "Jair R.",
        verifiedBadge: "+9.2u · CLV +2.8 %",
        createdAt: "Hace 20 min",
        body: "Sellado en mi bitácora a -112 antes del ajuste de línea en Geodesic v2.0.",
      },
    ],
  },
  {
    isExample: true,
    id: "sp-3",
    authorHandle: "diego_tactico",
    authorName: "Diego Aranda",
    roleBadge: "Tipstar Oficial",
    avatarGradVar: "var(--avatar-grad-3)",
    verifiedRecord: "+11.6u · 118 picks",
    clvBadge: "CLV +3.1 %",
    leagueLabel: "Liga MX",
    matchLabel: "Jornada nocturna Liga MX",
    pickBadge: "Escudo Conservador · 2.0u",
    originType: "Bitácora Propia",
    createdAt: "Hace 1 h",
    body: "En Liga MX la doble oportunidad local con más de 1.5 goles sigue pagando por encima del momio justo de Singularity v3.0 cuando el visitante acumula viaje doble.",
    likes: 19,
    comments: [],
  },
  {
    isExample: true,
    id: "sp-4",
    authorHandle: "socio_pl",
    authorName: "Rodrigo Garza",
    roleBadge: "Socio Pase Total",
    avatarGradVar: "var(--avatar-grad-5)",
    verifiedRecord: "+6.1u · 43 picks",
    clvBadge: "CLV +2.8 %",
    leagueLabel: "LaLiga",
    matchLabel: "Boleto liquidado · Jornada previa",
    pickBadge: "Pick Principal · 2.0u · CUMPLIDO",
    originType: "Spacetime Suite",
    createdAt: "Ayer · Liquidado",
    body: "Sellado 2 horas antes del silbatazo inicial siguiendo la alerta de Singularity v3.0. Cero edición post-partido y superando línea de cierre por +3.8 %.",
    likes: 31,
    comments: [
      {
        id: "sc-104",
        authorHandle: "sofia_nfl",
        authorName: "Sofía Méndez",
        verifiedBadge: "+18.4u · CLV +4.2 %",
        createdAt: "Ayer",
        body: "Cobrado limpio y con ventaja matemática verificada en bitácora.",
      },
    ],
  },
] as const;
