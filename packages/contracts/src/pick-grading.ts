/** Calificación de selecciones con el marcador final (compartida por modelo y UI). */

/**
 * ¿Se cumple la selección con este marcador? Sirve para calificar picks y para
 * comprobar que dos selecciones pueden darse a la vez.
 */
export function selectionHolds(
  pick: { market: string; selection: string; line?: number },
  home: number,
  away: number,
): boolean | null {
  const { market, selection } = pick;
  const line = pick.line ?? 0;
  const total = home + away;
  switch (market) {
    case "h2h":
      if (selection === "home") return home > away;
      if (selection === "away") return away > home;
      if (selection === "draw") return home === away;
      return null;
    case "double_chance":
      if (selection === "1x") return home >= away;
      if (selection === "x2") return away >= home;
      if (selection === "12") return home !== away;
      return null;
    case "totals":
      if (selection.startsWith("over")) return total > line;
      if (selection.startsWith("under")) return total < line;
      return null;
    case "btts":
      if (selection === "yes") return home > 0 && away > 0;
      if (selection === "no") return home === 0 || away === 0;
      return null;
    case "team_totals":
      if (selection === "home_over") return home > line;
      if (selection === "home_under") return home < line;
      if (selection === "away_over") return away > line;
      if (selection === "away_under") return away < line;
      return null;
    case "spreads":
      // `line` es el hándicap aplicado al equipo de la selección.
      if (selection.startsWith("home")) return home + line > away;
      if (selection.startsWith("away")) return away + line > home;
      return null;
    case "correct_score": {
      const [h, a] = selection.split("-").map(Number);
      return home === h && away === a;
    }
    default:
      return null;
  }
}
