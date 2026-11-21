import type { MaestroIconName } from "../../components/MaestroPrimitives";
import type { RateRow } from "../../record-stats";
import type { JournalEntry, MatchPick, PlatformGame } from "../../types";

export type AuditPickStatus = "won" | "lost" | "push" | "pending";

export interface AuditStatusMeta {
  readonly status: AuditPickStatus;
  readonly label: string;
  readonly shortLabel: string;
  readonly pillClass: string;
  readonly histChipClass: string;
  readonly icon: MaestroIconName;
  readonly spoken: string;
}

const AUDIT_STATUS_META: Readonly<Record<AuditPickStatus, AuditStatusMeta>> = {
  won: {
    status: "won",
    label: "Ganado",
    shortLabel: "G",
    pillClass: "pl-pill pl-pill--success",
    histChipClass: "pl-hist-chip is-hit",
    icon: "check",
    spoken: "Ganado",
  },
  lost: {
    status: "lost",
    label: "Perdido",
    shortLabel: "P",
    pillClass: "pl-pill pl-pill--danger",
    histChipClass: "pl-hist-chip is-miss",
    icon: "x",
    spoken: "Perdido",
  },
  push: {
    status: "push",
    label: "Push",
    shortLabel: "—",
    pillClass: "pl-pill",
    histChipClass: "pl-hist-chip",
    icon: "minus",
    spoken: "Push",
  },
  pending: {
    status: "pending",
    label: "Pendiente",
    shortLabel: "·",
    pillClass: "pl-pill pl-pill--info",
    histChipClass: "pl-hist-chip",
    icon: "activity",
    spoken: "Pendiente",
  },
};

export function getAuditStatusMeta(status: AuditPickStatus): AuditStatusMeta {
  return AUDIT_STATUS_META[status];
}

export function auditStatusFromJournal(status: JournalEntry["status"]): AuditPickStatus {
  if (status === "won") return "won";
  if (status === "lost") return "lost";
  if (status === "void") return "push";
  return "pending";
}

export function resolveFinishedPickAuditStatus(
  pick: MatchPick | undefined,
  score: PlatformGame["score"],
): AuditPickStatus {
  if (!pick) return "pending";
  if (pick.result === "hit") return "won";
  if (pick.result === "miss") return "lost";
  if (!score) return "pending";

  const rawMarket = (pick.market ?? "").toLowerCase().trim();
  const market = `${rawMarket} ${pick.marketGroup ?? ""}`.toLowerCase();
  const sel = (pick.selectionKey ?? "").toLowerCase();
  const lbl = pick.label.toLowerCase();

  const isDoubleChance =
    rawMarket === "double_chance" ||
    market.includes("double_chance") ||
    market.includes("doble oportunidad") ||
    market.includes("doble op") ||
    sel === "1x" ||
    sel === "x2" ||
    sel === "12" ||
    sel === "home_or_draw" ||
    sel === "away_or_draw" ||
    sel === "home_or_away" ||
    lbl.includes("doble oportunidad") ||
    lbl.includes("(1x)") ||
    lbl.includes("(x2)") ||
    lbl.includes("(12)");

  const isDnb =
    !isDoubleChance &&
    (rawMarket === "dnb" ||
      rawMarket === "draw_no_bet" ||
      market.includes("dnb") ||
      market.includes("draw_no_bet") ||
      lbl.includes("empate no acción") ||
      lbl.includes("empate no accion") ||
      (lbl.includes("sin empate") && !/\s+o\s+/.test(lbl)));
  if (isDnb && score.home === score.away) {
    return "push";
  }

  if (typeof pick.line === "number" && Number.isFinite(pick.line) && Number.isInteger(pick.line)) {
    const isNonFullGameTotal =
      rawMarket.startsWith("team_") ||
      market.includes("team_total") ||
      market.includes("team_goal") ||
      market.includes("por equipo") ||
      market.includes("corner") ||
      market.includes("córner") ||
      market.includes("card") ||
      market.includes("yellow") ||
      market.includes("tarjeta") ||
      market.includes("foul") ||
      market.includes("falta") ||
      market.includes("shot") ||
      market.includes("sot") ||
      market.includes("remate") ||
      market.includes("tiro") ||
      market.includes("prop") ||
      market.includes("jugador") ||
      market.includes("f5") ||
      market.includes("ht_") ||
      market.includes("1h_") ||
      market.includes("2h_") ||
      market.includes("1p_") ||
      market.includes("first_half") ||
      market.includes("half_time") ||
      market.includes("second_half") ||
      market.includes("first_period") ||
      market.includes("combo_") ||
      sel.startsWith("home_") ||
      sel.startsWith("away_") ||
      sel.startsWith("f5_") ||
      sel.startsWith("ht_") ||
      sel.startsWith("1h_") ||
      sel.startsWith("2h_") ||
      sel.startsWith("1p_") ||
      /\b(córners|corners|tarjetas|amarillas|faltas|remates|tiros|a puerta|f5|5 entradas|1t|2t|1\.er tiempo|primer tiempo|segunda mitad|pts|reb|ast|3pm|asistencias|rebotes|triples)\b/.test(
        lbl,
      );

    const isFullGameTotalMarket =
      rawMarket === "totals" ||
      rawMarket === "nba_totals" ||
      rawMarket === "mlb_totals" ||
      rawMarket === "nhl_totals" ||
      rawMarket === "nfl_totals" ||
      rawMarket === "over_under" ||
      rawMarket === "ou" ||
      /^totals_\d/.test(rawMarket);

    const isTotal =
      !isNonFullGameTotal &&
      (isFullGameTotalMarket ||
        (!rawMarket &&
          (market.includes("total") ||
            pick.conflictGroup === "over_total" ||
            pick.conflictGroup === "under_total" ||
            lbl.includes("más de") ||
            lbl.includes("menos de"))));
    if (isTotal && score.home + score.away === pick.line) {
      return "push";
    }

    const isHandicap =
      market.includes("handicap") ||
      market.includes("spread") ||
      market.includes("run_line") ||
      market.includes("puck_line") ||
      lbl.includes("hándicap") ||
      lbl.includes("handicap");
    if (isHandicap) {
      const isAway = sel.includes("away") || pick.conflictGroup === "away_side";
      const adjusted = (isAway ? score.away - score.home : score.home - score.away) + pick.line;
      if (adjusted === 0) return "push";
    }
  }

  return "pending";
}

export interface MarketFamilyTag {
  readonly key: string;
  readonly label: string;
  readonly shortLabel: string;
}

export function classifyMarketFamily(input: {
  readonly market?: string | null;
  readonly marketGroup?: string | null;
  readonly pickLabel: string;
  readonly origin?: string | null;
  readonly isParlay?: boolean;
}): MarketFamilyTag {
  if (input.isParlay || input.origin === "Parlay Combinado") {
    return { key: "parlay", label: "Parlays", shortLabel: "Parlay" };
  }

  const m = (input.market ?? "").toLowerCase();
  const grp = (input.marketGroup ?? "").toLowerCase();
  const l = input.pickLabel.toLowerCase();

  if (
    input.origin === "Player Prop" ||
    m.includes("player_prop") ||
    grp.includes("prop")
  ) {
    return { key: "player_props", label: "Player Props", shortLabel: "Props" };
  }

  if (
    m.includes("corner") ||
    m.includes("card") ||
    m.includes("foul") ||
    m.includes("shot") ||
    grp.includes("córner") ||
    grp.includes("corner") ||
    grp.includes("conteo") ||
    grp.includes("tarjeta") ||
    /\b(córners|corners|tiros|tarjetas|faltas|remates)\b/.test(l)
  ) {
    return { key: "counts", label: "Córners, tiros y tarjetas", shortLabel: "Conteos" };
  }

  if (
    m.includes("combo_") ||
    m.includes("half_time") ||
    m.includes("second_half") ||
    m.includes("clean_sheet") ||
    m.includes("win_to_nil") ||
    m.includes("mlb_f5") ||
    grp.includes("primer tiempo") ||
    grp.includes("marcador") ||
    /\b(1t|2t|1\.er tiempo|primer tiempo|segunda mitad|f5|5 entradas|portería a cero|ganar a cero|marcador exacto)\b/.test(
      l,
    ) ||
    /^\d+\s*[–-]\s*\d+$/.test(l.trim())
  ) {
    return { key: "specials", label: "Mitades y combinadas", shortLabel: "Especiales" };
  }

  if (
    m === "btts" ||
    m.includes("btts") ||
    grp.includes("ambos") ||
    l.includes("ambos anotan") ||
    l.includes("ambos equipos")
  ) {
    return { key: "btts", label: "Ambos anotan (BTTS)", shortLabel: "BTTS" };
  }

  if (
    m.includes("double_chance") ||
    grp.includes("doble") ||
    l.includes("o empate") ||
    l.includes("doble oportunidad")
  ) {
    return { key: "double_chance", label: "Doble oportunidad", shortLabel: "Doble op." };
  }

  if (
    m === "dnb" ||
    m.includes("dnb") ||
    l.includes("sin empate") ||
    l.includes("empate no acción") ||
    l.includes("empate no accion")
  ) {
    return { key: "dnb", label: "Empate no acción (DNB)", shortLabel: "DNB" };
  }

  if (
    m.includes("handicap") ||
    m.includes("spread") ||
    m.includes("run_line") ||
    m.includes("puck_line") ||
    grp.includes("hándicap") ||
    grp.includes("handicap") ||
    grp.includes("spread") ||
    l.includes("hándicap") ||
    l.includes("cubre") ||
    /[+-]\d+(\.\d+)?\b/.test(input.pickLabel)
  ) {
    return { key: "handicap", label: "Hándicap y spread", shortLabel: "Hándicap" };
  }

  if (
    m.includes("total") ||
    grp.includes("goles") ||
    grp.includes("total") ||
    l.includes("más de") ||
    l.includes("menos de") ||
    l.startsWith("más ") ||
    l.startsWith("menos ") ||
    /\b(over|under)\b/.test(l)
  ) {
    return { key: "totals", label: "Totales (goles y puntos)", shortLabel: "Totales" };
  }

  return { key: "moneyline", label: "Resultado 1X2 / Ganador", shortLabel: "1X2 / ML" };
}

export function computePickEvPct(
  p: number | null | undefined,
  marketDecimal: number | null | undefined,
): number | null {
  if (
    typeof p !== "number" ||
    !Number.isFinite(p) ||
    p <= 0 ||
    p >= 1 ||
    typeof marketDecimal !== "number" ||
    !Number.isFinite(marketDecimal) ||
    marketDecimal <= 1
  ) {
    return null;
  }
  return Math.round((p * marketDecimal - 1) * 1000) / 10;
}

export function computeJournalEntryEvPct(
  entry: Pick<JournalEntry, "fairDecimal" | "userDecimal">,
): number | null {
  if (
    !Number.isFinite(entry.fairDecimal) ||
    entry.fairDecimal <= 1 ||
    !Number.isFinite(entry.userDecimal) ||
    entry.userDecimal <= 1
  ) {
    return null;
  }
  const impliedFairP = 1 / entry.fairDecimal;
  return computePickEvPct(impliedFairP, entry.userDecimal);
}

export function computeJournalSettlementUnits(
  entry: Pick<JournalEntry, "status" | "units" | "userDecimal">,
): number | null {
  if (entry.status === "void") return 0;
  if (entry.status !== "won" && entry.status !== "lost") return null;
  if (!Number.isFinite(entry.units) || entry.units < 0) return null;
  if (entry.status === "won") {
    if (!Number.isFinite(entry.userDecimal) || entry.userDecimal <= 1) return null;
    return Math.round(entry.units * (entry.userDecimal - 1) * 100) / 100;
  }
  if (!Number.isFinite(entry.userDecimal) || entry.userDecimal <= 1) return null;
  return entry.units === 0 ? 0 : Math.round(-entry.units * 100) / 100;
}

export function resolveCapturedBookLabel(
  pick: Pick<MatchPick, "marketDecimal" | "marketBookLabel" | "bookQuotes"> | undefined,
): string | null {
  if (!pick || pick.marketDecimal == null || !Number.isFinite(pick.marketDecimal)) {
    return null;
  }
  const direct = pick.marketBookLabel?.trim();
  if (direct) return direct;
  const best = pick.bookQuotes?.find((q) => q.isBest)?.bookLabel?.trim();
  if (best) return best;
  const first = pick.bookQuotes?.[0]?.bookLabel?.trim();
  return first || null;
}

export interface AuditMarketFamilyRow extends RateRow {
  readonly pushes: number;
  readonly pending: number;
  readonly avgEvPct: number | null;
  readonly avgClvPct: number | null;
}

export function computeJournalMarketFamilyBreakdown(
  entries: readonly JournalEntry[],
  pickById?: ReadonlyMap<string, MatchPick>,
): AuditMarketFamilyRow[] {
  const buckets = new Map<
    string,
    {
      key: string;
      label: string;
      won: number;
      total: number;
      pushes: number;
      pending: number;
      netUnits: number;
      evSum: number;
      evCount: number;
      clvSum: number;
      clvCount: number;
    }
  >();

  for (const entry of entries) {
    const isParlay =
      entry.pickKind === "parlay" ||
      entry.origin === "Parlay Combinado" ||
      (Array.isArray(entry.parlayLegs) && entry.parlayLegs.length > 0);
    const matchedPick = pickById?.get(entry.pickId);
    const family = classifyMarketFamily({
      market: matchedPick?.market ?? entry.parlayLegs?.[0]?.market,
      marketGroup: matchedPick?.marketGroup,
      pickLabel: entry.pickLabel,
      origin: entry.origin,
      isParlay,
    });

    const row = buckets.get(family.key) ?? {
      key: family.key,
      label: family.label,
      won: 0,
      total: 0,
      pushes: 0,
      pending: 0,
      netUnits: 0,
      evSum: 0,
      evCount: 0,
      clvSum: 0,
      clvCount: 0,
    };

    const validUnits = Number.isFinite(entry.units) && entry.units >= 0;
    const validOdds = Number.isFinite(entry.userDecimal) && entry.userDecimal > 1;
    if (entry.status === "won") {
      row.won += 1;
      row.total += 1;
      if (validUnits && validOdds) {
        row.netUnits += entry.units * (entry.userDecimal - 1);
      }
    } else if (entry.status === "lost") {
      row.total += 1;
      if (validUnits && validOdds) {
        row.netUnits -= entry.units;
      }
    } else if (entry.status === "void") {
      row.pushes += 1;
    } else {
      row.pending += 1;
    }

    const ev = computeJournalEntryEvPct(entry);
    if (ev !== null) {
      row.evSum += ev;
      row.evCount += 1;
    }
    if (Number.isFinite(entry.clvPct)) {
      row.clvSum += entry.clvPct;
      row.clvCount += 1;
    }

    buckets.set(family.key, row);
  }

  return Array.from(buckets.values())
    .filter((r) => r.total > 0 || r.pushes > 0)
    .map((r) => {
      const roundedNet = Math.round(r.netUnits * 100) / 100;
      return {
        key: r.key,
        label: r.label,
        won: r.won,
        total: r.total,
        pushes: r.pushes,
        pending: r.pending,
        netUnits: roundedNet === 0 ? 0 : roundedNet,
        avgEvPct: r.evCount > 0 ? Math.round((r.evSum / r.evCount) * 10) / 10 : null,
        avgClvPct: r.clvCount > 0 ? Math.round((r.clvSum / r.clvCount) * 10) / 10 : null,
      };
    })
    .sort((a, b) => b.total + b.pushes - (a.total + a.pushes));
}

export interface JournalAuditSummary {
  readonly won: number;
  readonly lost: number;
  readonly pushes: number;
  readonly pending: number;
  readonly avgEvPct: number | null;
  readonly positiveEvCount: number;
  readonly closingTrackedCount: number;
}

export function computeJournalAuditSummary(entries: readonly JournalEntry[]): JournalAuditSummary {
  let won = 0;
  let lost = 0;
  let pushes = 0;
  let pending = 0;
  let evSum = 0;
  let evCount = 0;
  let positiveEvCount = 0;
  let closingTrackedCount = 0;

  for (const e of entries) {
    if (e.status === "won") won += 1;
    else if (e.status === "lost") lost += 1;
    else if (e.status === "void") pushes += 1;
    else pending += 1;

    const ev = computeJournalEntryEvPct(e);
    if (ev !== null) {
      evSum += ev;
      evCount += 1;
      if (ev > 0) positiveEvCount += 1;
    }
    if (typeof e.closingDecimal === "number" && Number.isFinite(e.closingDecimal) && e.closingDecimal > 1) {
      closingTrackedCount += 1;
    }
  }

  return {
    won,
    lost,
    pushes,
    pending,
    avgEvPct: evCount > 0 ? Math.round((evSum / evCount) * 10) / 10 : null,
    positiveEvCount,
    closingTrackedCount,
  };
}
