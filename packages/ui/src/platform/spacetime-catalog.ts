import type {
  LandingFaqItem,
  PrecisionBucket,
  SocialPost,
  SpacetimeEngineSpec,
  SpacetimeVsTipsterRow,
  TipstarCreator,
} from "./types";

/**
 * Cifras públicas de los motores. Cada una sale del reporte A26 de la rama prediction-lab
 * (research/prediction-lab/reports/A26_web_scraping_feature_store_integration.md):
 * evaluación fuera de muestra sobre la temporada 2024–25. No agregar cifras sin fuente.
 */
export const SPACETIME_METRICS_HEADLINE = {
  suiteName: "PitchLab Spacetime Suite v3.0",
  /** Partidos históricos en los motores entrenados: 98,102 fútbol (Tachyon v3.0) + 6,218 NFL (Minkowski v3.0) = 104,320. */
  historicalMatches: "+100,000",
  /** Partidos de fútbol de la prueba fuera de muestra 2024–25 (reporte A26). */
  holdoutTestMatches: "16,126",
  /** Variables evaluadas por partido en el motor de fútbol. */
  variablesPerMatch: "136",
  /** Datos posteriores al partido incluidos al entrenar o evaluar. */
  postMatchData: "Cero",
  /** Registros normalizados de las 28 fuentes del feature store v2.0. */
  telemetryPoints: "108,167",
  /** Diferencial fuera de muestra de Geodesic v2.0 sobre 3,670 momios evaluados. */
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
    mono: "T",
    shortName: "Tachyon",
    name: "PitchLab Tachyon v3.0",
    version: "v3.0",
    pillar: "Data Science",
    domain: "Fútbol · 23 ligas de entrenamiento · 136 variables",
    roleLabel: "Fútbol · fuerza de cada equipo",
    colorVar: "var(--engine-tachyon)",
    readsText:
      "Fuerza estructural, xG real, presión táctica, altitud del estadio y bajas de la plantilla. No usa momios.",
    summary:
      "Motor deportivo puro: no usa momios. Combina fuerza estructural, xG real, presión táctica, altitud del estadio y disponibilidad de la plantilla.",
    inputsLabel:
      "Liga MX 2024–25: 54.7 % de acierto contra 53.7 % del mercado (676 partidos).",
    proofFigure: "54.7 %",
    proofTone: "ok",
    proofContext: "acierto en Liga MX · mercado 53.7 % · 676 partidos",
    retrainCadence: "Validado fuera de muestra en 16,126 partidos 2024–25.",
  },
  {
    key: "singularity",
    mono: "S",
    shortName: "Singularity",
    name: "PitchLab Singularity v3.0",
    version: "v3.0",
    pillar: "Machine Learning",
    domain: "Modelo + mercado · Detección de valor",
    roleLabel: "Modelo + mercado",
    colorVar: "var(--engine-singularity)",
    readsText:
      "Mezcla a Tachyon con el mercado sin el margen de la casa y corrige el sesgo del público en Liga MX.",
    summary:
      "Mezcla la probabilidad de Tachyon con el mercado sin margen de la casa y corrige el sesgo del público en Liga MX.",
    inputsLabel:
      "Mejor log-loss que el momio de cierre en 16,126 partidos 2024–25 (IC 95 % sin cruzar cero).",
    proofFigure: "16,126",
    proofTone: "neutral",
    proofContext: "partidos donde pronosticó mejor que el momio de cierre",
    retrainCadence: "Se recalcula con cada corte de momios.",
  },
  {
    key: "minkowski",
    mono: "M",
    shortName: "Minkowski",
    name: "PitchLab Minkowski v3.0",
    version: "v3.0",
    pillar: "Data Science",
    domain: "NFL · 29 variables + capa de contexto en vivo",
    roleLabel: "NFL",
    colorVar: "var(--engine-minkowski)",
    readsText:
      "Eficiencia por jugada, lesiones de QB y titulares, disciplina, clima y altitud de cada juego.",
    summary:
      "Eficiencia por jugada, lesiones de QB y titulares, disciplina, clima y altitud del estadio para cada juego de NFL.",
    inputsLabel: "Prueba 2020–25: 65.8 % de acierto en 1,615 juegos.",
    proofFigure: "65.8 %",
    proofTone: "ok",
    proofContext: "acierto en 1,615 juegos · 2020–25",
    retrainCadence: "Contexto en vivo actualizado antes de cada semana.",
  },
  {
    key: "geodesic",
    mono: "G",
    shortName: "Geodesic",
    name: "PitchLab Geodesic v2.0",
    version: "v2.0",
    pillar: "Machine Learning",
    domain: "Momio justo, ventaja y confirmación de mercado",
    roleLabel: "Momio justo y ventaja",
    colorVar: "var(--engine-geodesic)",
    readsText:
      "Quita el margen de la casa, calcula la ventaja contra el momio real y solo la marca si el dinero grande no va en contra.",
    summary:
      "Quita el margen de la casa, calcula la ventaja contra el momio real y solo marca valor cuando el dinero institucional no va en contra.",
    inputsLabel: "3,670 momios evaluados fuera de muestra.",
    proofFigure: "3,670",
    proofTone: "neutral",
    proofContext: "momios evaluados fuera de muestra",
    retrainCadence: "Se evalúa con cada momio publicado.",
  },
  {
    key: "cortex",
    mono: "C",
    shortName: "Cortex IA",
    name: "PitchLab Cortex IA",
    version: "v3.0",
    pillar: "Inteligencia Artificial",
    domain: "Resumen previo del partido",
    roleLabel: "Resumen en lenguaje claro",
    colorVar: "var(--engine-cortex)",
    readsText:
      "Explica lo que dicen los otros cuatro: probabilidad, factores con más peso, mercado y bajas reportadas.",
    summary:
      "Resume en lenguaje claro lo que dicen los motores: probabilidad, factores con más peso, mercado y bajas reportadas.",
    inputsLabel: "Solo usa números de los motores; si un dato falta, lo dice.",
    proofFigure: "0",
    proofTone: "neutral",
    proofContext: "datos inventados: si falta uno, lo dice",
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
    shortLabel: "Muy probable",
    label: "Confianza máxima · muy probable",
    rangeLabel: "Dobles oportunidades y líneas base",
    promisedMeanP: 0.82,
    actualHitRate: null,
    auditedPicksCount: null,
    closingBeatRate: null,
  },
  {
    id: "core",
    shortLabel: "Probable",
    label: "Confianza alta · principal",
    rangeLabel: "Picks principales de cada partido",
    promisedMeanP: 0.62,
    actualHitRate: null,
    auditedPicksCount: null,
    closingBeatRate: null,
  },
  {
    id: "balanced",
    shortLabel: "Parejo",
    label: "Confianza media · balanceado",
    rangeLabel: "Totales, ambos anotan y líneas por equipo",
    promisedMeanP: 0.58,
    actualHitRate: null,
    auditedPicksCount: null,
    closingBeatRate: null,
  },
  {
    id: "value",
    shortLabel: "Momio alto",
    label: "Alto valor",
    rangeLabel: "Momios altos con ventaja contra la casa",
    promisedMeanP: 0.4,
    actualHitRate: null,
    auditedPicksCount: null,
    closingBeatRate: null,
  },
] as const;

export const MEMBERSHIP_SPEC = {
  name: "Pase PitchLab Ultra",
  monthlyMxn: 299,
  annualMxn: 2390,
  annualMonthlyEquivalentMxn: 199,
  annualSavingsPct: 33,
  trialMonth1Label: "7 días gratis sin tarjeta (Mes 1 de lanzamiento)",
  trialMonth2Label: "7 días gratis con verificación $0 MXN",
  referralTrialDays: 7,
  referralFriendFirstMonthMxn: 209,
  referralFriendBenefit: "7 días gratis + 30 % de descuento en su primer mes ($209 MXN)",
  referralBothRewardDays: 15,
  referralAmbassadorThreshold: 5,
  referralAmbassadorBonusDays: 30,
  cfdiNote: "IVA incluido · Factura CFDI 4.0 automática en segundos",
} as const;

/** Días acumulados por invitar amigos que pagaron su primer mes. */
export function referralEarnedDays(paidFriends: number): number {
  const count = Math.max(0, Math.floor(Number.isFinite(paidFriends) ? paidFriends : 0));
  const base = count * MEMBERSHIP_SPEC.referralBothRewardDays;
  const bonus =
    count >= MEMBERSHIP_SPEC.referralAmbassadorThreshold
      ? MEMBERSHIP_SPEC.referralAmbassadorBonusDays
      : 0;
  return base + bonus;
}

/** Ahorro anual en pesos al elegir el ciclo anual frente a 12 meses sueltos. */
export function annualSavingsMxn(): number {
  return MEMBERSHIP_SPEC.monthlyMxn * 12 - MEMBERSHIP_SPEC.annualMxn;
}

export const SPACETIME_VS_TIPSTER_ROWS: readonly SpacetimeVsTipsterRow[] = [
  {
    criterion: "De dónde sale el pick",
    pitchlab: "5 motores probados fuera de muestra",
    tipster: "Opinión o corazonada",
  },
  {
    criterion: "Picks por partido",
    pitchlab: "Hasta 5, con su probabilidad y momio justo",
    tipster: "Uno, sin probabilidad",
  },
  {
    criterion: "Historial",
    pitchlab: "Inmutable desde antes del partido, con fallos",
    tipster: "Difícil de verificar",
  },
  {
    criterion: "Parlays",
    pitchlab: "Sin selecciones que se contradigan",
    tipster: "Combinadas a mano",
  },
  {
    criterion: "Precio",
    pitchlab: `$${MEMBERSHIP_SPEC.monthlyMxn} al mes, todo incluido`,
    tipster: "Por pick o grupo VIP",
  },
] as const;

export const CORTEX_SAMPLE_QUOTE =
  "«Monterrey llega con mejor ataque (1.7 goles por partido) y Querétaro sin su central titular. Por eso el modelo inclina el partido hacia Monterrey o empate.»";

export const ULTRA_LANDING_FEATURES = [
  "Lo más probable y el momio justo de cada partido, en todas las ligas",
  "Todos los mercados del partido: resultado, totales, ambos anotan y hándicap",
  "Armador de parlays de 2 a 6 selecciones, sin choques lógicos",
  "Comunidad de socios y récord verificado de tipstars",
] as const;

export const LANDING_FAQS: readonly LandingFaqItem[] = [
  {
    question: "¿PitchLab me dice a qué apostar?",
    answer:
      "No. Te muestra lo más probable según los datos y su momio justo. La decisión y el monto son tuyos.",
    defaultOpen: true,
  },
  {
    question: "¿PitchLab acepta apuestas?",
    answer: "No. No somos casa de apuestas ni recibimos depósitos.",
  },
  {
    question: "¿Qué pasa al terminar los 7 días?",
    answer:
      "No se te hace ningún cargo automático sin tarjeta. Conservas el acceso a tu cuenta y tu bitácora, y puedes activar el Pase PitchLab Ultra cuando quieras.",
  },
  {
    question: "¿Puedo facturar?",
    answer: "Sí. El precio incluye IVA y puedes pedir tu CFDI desde tu cuenta.",
  },
] as const;

export const TIPSTAR_CREATORS: readonly TipstarCreator[] = [
  {
    isExample: true,
    handle: "sofia_nfl",
    name: "Sofía Méndez",
    specialty: "NFL y totales",
    avatarInitials: "SM",
    avatarGradVar: "var(--avatar-grad-1)",
    promoCode: "SOFIA5",
    freeDays: 5,
    commissionPct: 25,
    verifiedUnits: "+18.4u",
    clvAvg: "+4.2 %",
    roi95Ci: "+6.8 % (±2.9 %)",
    settledCount: 142,
    wonCount: 84,
    joinedAt: "2026-03-04",
    bio: "Busco ventaja en eficiencia por serie y ritmo de la segunda mitad. Registro cada pick antes del partido, se cumpla o no.",
    activeReferrals: 38,
    monthlyCommissionMxn: 2840,
    weeklyPickOrigin: "spacetime",
    weeklyPickSlug: "sofia-sem",
    weeklyPickGameId: "",
    weeklyPickThesis:
      "El modelo ve ventaja sostenida en eficiencia por serie y ritmo controlado en la segunda mitad, con +4.6 pts de ventaja sobre el momio disponible.",
  },
  {
    isExample: true,
    handle: "carlos_quant",
    name: "Carlos Vega",
    specialty: "Premier League y LaLiga",
    avatarInitials: "CV",
    avatarGradVar: "var(--avatar-grad-2)",
    promoCode: "CARLOS5",
    freeDays: 5,
    commissionPct: 25,
    verifiedUnits: "+14.9u",
    clvAvg: "+3.9 %",
    roi95Ci: "+5.4 % (±2.6 %)",
    settledCount: 186,
    wonCount: 104,
    joinedAt: "2026-02-10",
    bio: "Premier League y LaLiga. Comparo el momio justo contra el de la casa antes de cada jornada.",
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
    specialty: "Liga MX y combinadas",
    avatarInitials: "DA",
    avatarGradVar: "var(--avatar-grad-3)",
    promoCode: "DIEGO5",
    freeDays: 5,
    commissionPct: 25,
    verifiedUnits: "+11.6u",
    clvAvg: "+3.1 %",
    roi95Ci: "+4.9 % (±3.0 %)",
    settledCount: 118,
    wonCount: 66,
    joinedAt: "2026-04-18",
    bio: "Liga MX y combinadas cortas. Pocas piernas, sin choques lógicos.",
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
    pickBadge: "Pick principal · 2.0u",
    originType: "Spacetime Suite",
    createdAt: "Hace 18 min",
    body: "Mi pick abierto de la semana: el modelo ve ventaja clara por el QB titular y la presión en tercer down antes de que cierre la línea. El dinero grande entró temprano del mismo lado.",
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
        body: "Ya lo registré en mi bitácora como base antes de que baje medio punto.",
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
    body: "Ojo al reporte 60m de Cortex IA: ambos laterales titulares están confirmados y Tachyon v3.0 sube la proyección combinada de goles a 2.95. Buena ventana para registrar en mi bitácora.",
    likes: 27,
    comments: [
      {
        id: "sc-102",
        authorHandle: "jair_founder",
        authorName: "Jair R.",
        verifiedBadge: "+9.2u · CLV +2.8 %",
        createdAt: "Hace 20 min",
        body: "Registrado en mi bitácora a −112 antes del ajuste de línea en Geodesic v2.0.",
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
    authorHandle: "rodrigo_p",
    authorName: "Rodrigo P.",
    roleBadge: "Socio Pase PitchLab Ultra",
    avatarGradVar: "var(--avatar-grad-5)",
    verifiedRecord: "+6.1u · 43 picks",
    clvBadge: "CLV +2.8 %",
    leagueLabel: "LaLiga",
    matchLabel: "Boleto evaluado · Jornada previa",
    pickBadge: "Pick principal · 2.0u · Cumplido",
    originType: "Spacetime Suite",
    createdAt: "Ayer · Cumplido",
    body: "Registrado 2 horas antes del silbatazo inicial siguiendo la señal de Singularity v3.0. Cero edición posterior al partido y superando el momio de cierre por +3.8 %.",
    likes: 31,
    comments: [
      {
        id: "sc-104",
        authorHandle: "sofia_nfl",
        authorName: "Sofía Méndez",
        verifiedBadge: "+18.4u · CLV +4.2 %",
        createdAt: "Ayer",
        body: "Cumplido y con ventaja frente al momio de cierre verificada en bitácora.",
      },
    ],
  },
  {
    isExample: true,
    id: "sp-5",
    authorHandle: "mariana_t",
    authorName: "Mariana T.",
    roleBadge: "Socio Pase PitchLab Ultra",
    avatarGradVar: "var(--avatar-grad-3)",
    verifiedRecord: "+9.8u · 74 picks",
    clvBadge: "CLV +3.4 %",
    leagueLabel: "Liga MX",
    matchLabel: "Liga MX",
    pickBadge: "1.0u",
    originType: "Spacetime Suite",
    createdAt: "Ayer",
    body: "Liga MX el sábado.",
    likes: 23,
    comments: [],
  },
] as const;
