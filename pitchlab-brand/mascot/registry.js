(() => {
  const sports = [
    { id: "general", label: "General", asset: "radar", icon: "radar", accent: "#B49AFF" },
    { id: "soccer", label: "Fútbol", asset: "soccer", icon: "soccer", accent: "#A9BFFF" },
    { id: "american-football", label: "Fútbol americano", asset: "american-football", icon: "american-football", accent: "#B49AFF" },
    { id: "baseball", label: "Béisbol", asset: "mlb", icon: "baseball", accent: "#D9DFFF" },
    { id: "hockey", label: "Hockey sobre hielo", asset: "nhl", icon: "hockey", accent: "#71C9F1" },
  ];

  const leagues = [
    {
      id: "soccer.liga-mx", sport: "soccer", label: "Liga MX", asset: "liga-mx", accent: "#66D9AE",
      badge: "football/liga-mx-apertura-2026/svg/liga-mx.svg",
      kit: "Verde jade, franja marfil y balón al pie",
    },
    {
      id: "soccer.premier-league", sport: "soccer", label: "Premier League", asset: "premier-league", accent: "#C1A7FF",
      badge: "football/premier-league-2026-27/svg/premier-league.svg",
      kit: "Camiseta ciruela a rayas y balón bajo el brazo",
    },
    {
      id: "soccer.laliga", sport: "soccer", label: "LaLiga", asset: "laliga", accent: "#FFA88F",
      badge: "football/laliga-2026-27/svg/laliga.svg",
      kit: "Camiseta coral y detalle dorado",
    },
    {
      id: "soccer.champions-league", sport: "soccer", label: "Champions League", asset: "champions-league", accent: "#A9BFFF",
      badge: "football/champions-league-2026-27/svg/champions-league.svg",
      kit: "Azul cobalto, detalles plata y balón claro",
    },
    {
      id: "soccer.europa-league", sport: "soccer", label: "Europa League", asset: "europa-league", accent: "#FFC473",
      badge: "football/europa-league-2026-27/svg/europa-league.svg",
      kit: "Uniforme grafito con hombros ámbar",
    },
    {
      id: "american-football.nfl", sport: "american-football", label: "NFL", asset: "nfl", accent: "#88BBFF",
      badge: "american-football/nfl-2026/svg/nfl.svg",
      kit: "Hombreras en azul eléctrico y balón ovoide",
    },
    {
      id: "american-football.ncaa-fbs", sport: "american-football", label: "NCAA Football · FBS", asset: "ncaa-fbs", accent: "#FF9BAA",
      badge: "american-football/ncaa-fbs-2026/svg/ncaa-fbs.svg",
      kit: "Uniforme universitario en burdeos y crema",
    },
    {
      id: "baseball.mlb", sport: "baseball", label: "MLB", asset: "mlb", accent: "#D9DFFF",
      kit: "Uniforme marfil a rayas, guante y pelota",
    },
    {
      id: "hockey.nhl", sport: "hockey", label: "NHL", asset: "nhl", accent: "#71C9F1",
      kit: "Suéter azul hielo, patines y stick",
    },
  ];

  const contexts = [
    { id: "home", label: "Inicio", icon: "radar", copy: "Presenta a Radar y las ediciones de PitchLab." },
    { id: "games", label: "Partidos", icon: "games", copy: "Acompaña el encabezado de la liga o la selección de jornada." },
    { id: "analysis", label: "Análisis", icon: "model", copy: "Introduce la lectura de probabilidades y factores del modelo." },
    { id: "simulation", label: "Simulador", icon: "simulation", copy: "Acompaña la explicación inicial de los escenarios." },
    { id: "assistant", label: "Asistente", icon: "radar", copy: "El retrato SVG identifica a Radar en la conversación." },
  ];

  const icons = [
    ["radar", "Radar"], ["soccer", "Fútbol"], ["american-football", "Fútbol americano"],
    ["baseball", "Béisbol"], ["hockey", "Hockey"], ["competition", "Competición"],
    ["teams", "Equipos"], ["model", "Modelo"], ["simulation", "Simulador"],
    ["probability", "Probabilidad"], ["compare", "Comparar"], ["sources", "Fuentes"],
    ["games", "Partidos"], ["historical", "Histórico"], ["trend", "Tendencia"],
    ["filters", "Filtros"], ["panel", "Panel"], ["info", "Información"],
    ["assistant", "Asistente"], ["close", "Cerrar"],
  ];

  const iconPath = (id) => `visuals/icons/${id}.svg`;

  function resolve({ sport, league, context } = {}) {
    const competition = leagues.find(({ id }) => id === league);
    const discipline = sports.find(({ id }) => id === (competition?.sport ?? sport)) ?? sports[0];
    const placement = contexts.find(({ id }) => id === context) ?? contexts[0];
    const look = competition ?? discipline;

    return {
      sport: discipline,
      league: competition ?? null,
      context: placement,
      label: look.label,
      accent: look.accent,
      image: `mascot/web/${look.asset}.webp`,
      badge: competition?.badge ?? iconPath(discipline.icon),
      badgeIsEmblem: Boolean(competition?.badge),
      icon: iconPath(placement.icon),
      avatar: iconPath("radar"),
    };
  }

  globalThis.PitchLabRadar = { sports, leagues, contexts, icons, iconPath, resolve };
})();
