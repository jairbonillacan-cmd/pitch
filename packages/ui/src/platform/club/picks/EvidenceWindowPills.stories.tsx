import React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { asLeagueId } from "@pitchlab/contracts";
import { PBar } from "../../../sports";
import type { MatchIntelligenceV5View, PlatformGame } from "../../types";
import {
  EvidenceWindowPills,
  extractEvidenceWindows,
  type EvidenceWindowItem,
} from "./EvidenceWindowPills";

const meta = {
  title: "Platform v4 / Picks / EvidenceWindowPills",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const FULL_WINDOWS: readonly EvidenceWindowItem[] = [
  {
    key: "l5",
    label: "L5",
    value: "80 %",
    ratePct: 80,
    tone: "high",
    detail: "4/5 últimos partidos cumplidos por América",
  },
  {
    key: "l10",
    label: "L10",
    value: "70 %",
    ratePct: 70,
    tone: "high",
    detail: "7/10 en los diez partidos más recientes",
  },
  {
    key: "l20",
    label: "L20",
    value: "65 %",
    ratePct: 65,
    tone: "mid",
    detail: "13/20 en ventana amplia de temporada",
  },
  {
    key: "custom",
    label: "Local",
    value: "83 %",
    ratePct: 83,
    tone: "high",
    detail: "5/6 partidos jugando como local en el Azteca",
  },
  {
    key: "custom",
    label: "Visita",
    value: "50 %",
    ratePct: 50,
    tone: "mid",
    detail: "3/6 partidos de Tigres en condición de visitante",
  },
  {
    key: "h2h",
    label: "H2H",
    value: "75 %",
    ratePct: 75,
    tone: "high",
    detail: "3/4 enfrentamientos directos recientes",
  },
  {
    key: "xg",
    label: "xG",
    value: "3.06",
    tone: "info",
    detail: "América 1.92 · Tigres 1.14",
  },
];

const RATE_BAR_WINDOWS = FULL_WINDOWS.filter(
  (w): w is EvidenceWindowItem & { readonly ratePct: number } =>
    typeof w.ratePct === "number" && Number.isFinite(w.ratePct),
);

const TONE_HIGH_WINDOWS: readonly EvidenceWindowItem[] = [
  { key: "l5", label: "L5", value: "100 %", ratePct: 100, tone: "high", detail: "5/5 recientes" },
  { key: "l10", label: "L10", value: "80 %", ratePct: 80, tone: "high", detail: "8/10 recientes" },
  { key: "custom", label: "Local", value: "88 %", ratePct: 88, tone: "high", detail: "7/8 en casa" },
  { key: "h2h", label: "H2H", value: "75 %", ratePct: 75, tone: "high", detail: "3/4 directos" },
];

const TONE_MIXED_WINDOWS: readonly EvidenceWindowItem[] = [
  { key: "l5", label: "L5", value: "60 %", ratePct: 60, tone: "mid", detail: "3/5 recientes" },
  { key: "l10", label: "L10", value: "50 %", ratePct: 50, tone: "mid", detail: "5/10 recientes" },
  { key: "custom", label: "Visita", value: "50 %", ratePct: 50, tone: "mid", detail: "3/6 fuera" },
  { key: "h2h", label: "H2H", value: "40 %", ratePct: 40, tone: "low", detail: "2/5 directos" },
];

const TONE_LOW_WINDOWS: readonly EvidenceWindowItem[] = [
  { key: "l5", label: "L5", value: "20 %", ratePct: 20, tone: "low", detail: "1/5 recientes" },
  { key: "l20", label: "L20", value: "35 %", ratePct: 35, tone: "low", detail: "7/20 temporada" },
  { key: "custom", label: "Visita", value: "33 %", ratePct: 33, tone: "low", detail: "2/6 fuera" },
  { key: "xg", label: "xG", value: "1.94", tone: "info", detail: "Ritmo proyectado contenido" },
];

const CARDS_REF_WINDOWS: readonly EvidenceWindowItem[] = [
  { key: "l5", label: "L5", value: "80 %", ratePct: 80, tone: "high", detail: "4/5 partidos con 5+ amarillas" },
  { key: "h2h", label: "H2H", value: "75 %", ratePct: 75, tone: "high", detail: "3/4 cruces con alta fricción" },
  { key: "ref", label: "Árb.", value: "×1.21", tone: "high", detail: "Árbitro Luis Santander (38 PJ)" },
  { key: "custom", label: "Faltas", value: "23.5", tone: "neutral", detail: "Media combinada proyectada" },
];

const SAMPLE_GAME: PlatformGame = {
  id: "lmx-ev-ame-tig",
  league: asLeagueId("liga-mx"),
  leagueLabel: "Liga MX",
  sport: "football",
  round: "Jornada 16",
  dayId: "2026-11-21",
  dayLabel: "sábado, 21 de noviembre",
  kickoffUtc: "2026-11-22T03:00:00Z",
  kickoffLocal: "21:00",
  venue: "Estadio Azteca",
  referee: "Luis Santander",
  status: "NS",
  home: {
    slug: "club-america",
    name: "Club América",
    shortName: "América",
    code: "AME",
    record: "14G-4E-3P",
  },
  away: {
    slug: "tigres-uanl",
    name: "Tigres UANL",
    shortName: "Tigres",
    code: "TIG",
    record: "11G-5E-5P",
  },
  hasForecast: true,
  x12: [0.584, 0.236, 0.18],
  projection: { home: 1.92, away: 1.14, total: 3.06 },
  goalLine: { line: 2.5, pOver: 0.575 },
  confidenceScore: null,
  confidenceLevel: null,
  picks: [],
  preGame: {
    cortexSynthesis:
      "América llega con solidez en casa y ventaja territorial frente a Tigres en el cierre de fase regular.",
    tacticalKeys: ["Presión alta en primeros 30 minutos", "Ritmo elevado por bandas"],
    lineupStatusLabel: "Once probable disponible",
    lineupsConfirmed60m: false,
    absences: [],
    moneyFlow: null,
  },
  markets: [],
  factors: [
    { label: "Forma local", value: "G-G-E-G-G · 4-1-0", sub: "11 goles a favor · 4 en contra" },
    { label: "Forma visitante", value: "G-P-G-E-G · 3-1-1", sub: "8 goles a favor · 6 en contra" },
  ],
  headToHead: [
    { date: "2026-04-18", home: "América", away: "Tigres", homeGoals: 2, awayGoals: 1 },
    { date: "2025-10-25", home: "Tigres", away: "América", homeGoals: 1, awayGoals: 2 },
    { date: "2025-03-15", home: "América", away: "Tigres", homeGoals: 3, awayGoals: 1 },
    { date: "2024-09-21", home: "Tigres", away: "América", homeGoals: 1, awayGoals: 1 },
  ],
  counts: {
    corners: { home: 5.8, away: 4.6, total: 10.4, line: 9.5, pOver: 0.59, sample: { home: 15, away: 15 } },
    fouls: { home: 11.4, away: 12.1, total: 23.5, line: 22.5, pOver: 0.56, sample: { home: 15, away: 15 } },
    yellow: { home: 2.3, away: 2.7, total: 5.0, line: 4.5, pOver: 0.61, sample: { home: 15, away: 15 } },
  },
  updatedAtLabel: "Actualizado hace 8 min",
  spacetime: null,
};

const SAMPLE_V5: MatchIntelligenceV5View = {
  epistemic: {
    home: {
      pPoint: 0.584,
      pLower90: 0.531,
      pUpper90: 0.635,
      halfWidth90: 0.052,
      conservativeFairDecimal: 1.88,
      grade: "high",
    },
    draw: {
      pPoint: 0.236,
      pLower90: 0.194,
      pUpper90: 0.281,
      halfWidth90: 0.044,
      conservativeFairDecimal: 5.15,
      grade: "high",
    },
    away: {
      pPoint: 0.18,
      pLower90: 0.141,
      pUpper90: 0.224,
      halfWidth90: 0.042,
      conservativeFairDecimal: 7.09,
      grade: "high",
    },
  },
  microCounts: {
    refereeProfile: {
      name: "Luis Santander",
      games: 38,
      cardsMultiplier: 1.21,
      foulsMultiplier: 1.14,
      redsMultiplier: 1.32,
    },
  },
  verifiedSummaryEs:
    "América suma 4 victorias en sus últimos 5 partidos y el árbitro designado promedia 21 % más tarjetas que la media de liga.",
  guardrailPassed: true,
};

export const VentanasCompletasYTasasOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <div style={{ display: "grid", gap: 16, maxWidth: 720 }}>
      <section className="glass-card glass-ring rounded-2xl p-4" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gap: 4 }}>
          <strong className="text-sm">Tamaño estándar · Todas las ventanas</strong>
          <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
            L5, L10, L20, Local/Visita, H2H y proyección xG sobre tokens planos.
          </span>
        </div>
        <EvidenceWindowPills
          windows={FULL_WINDOWS}
          size="md"
          ariaLabel="Ventanas de evidencia completas"
        />

        <div style={{ display: "grid", gap: 4, paddingTop: 4 }}>
          <strong className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
            Densidad compacta · Filas del tablero
          </strong>
          <EvidenceWindowPills
            windows={FULL_WINDOWS}
            size="sm"
            ariaLabel="Ventanas de evidencia compactas"
          />
        </div>
      </section>

      <section className="glass-card glass-ring rounded-2xl p-4" style={{ display: "grid", gap: 10 }}>
        <strong className="text-sm">Tasas de acierto por ventana con barras planas</strong>
        <div style={{ display: "grid", gap: 10 }}>
          {RATE_BAR_WINDOWS.map((win) => (
            <div
              key={`${win.key}-${win.label}`}
              style={{
                display: "grid",
                gridTemplateColumns: "68px minmax(0, 1fr) 54px",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span className="text-xs font-bold" style={{ color: "var(--pl-text-secondary)" }}>
                {win.label}
              </span>
              <div style={{ display: "grid", gap: 3 }}>
                <PBar p={win.ratePct / 100} lead={win.ratePct >= 70} grow />
                {win.detail ? (
                  <span className="text-[11px]" style={{ color: "var(--pl-text-muted)" }}>
                    {win.detail}
                  </span>
                ) : null}
              </div>
              <strong
                className="text-xs num text-right"
                style={{
                  color:
                    win.ratePct >= 70
                      ? "var(--pl-success)"
                      : win.ratePct >= 45
                        ? "var(--pl-warning)"
                        : "var(--pl-danger)",
                }}
              >
                {win.value}
              </strong>
            </div>
          ))}
        </div>
      </section>
    </div>
  ),
};

export const VentanasCompletasYTasasClaro: Story = {
  globals: { theme: "light" },
  render: VentanasCompletasYTasasOscuro.render,
};

export const EscalaDeTonosYArbitrajeOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <div className="glass-card glass-ring rounded-2xl p-4" style={{ display: "grid", gap: 14, maxWidth: 640 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <span className="text-xs font-bold" style={{ color: "var(--pl-text-muted)" }}>
          Tendencia alta (tasa ≥ 70 %)
        </span>
        <EvidenceWindowPills windows={TONE_HIGH_WINDOWS} size="md" />
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        <span className="text-xs font-bold" style={{ color: "var(--pl-text-muted)" }}>
          Tendencia mixta (45–69 %)
        </span>
        <EvidenceWindowPills windows={TONE_MIXED_WINDOWS} size="md" />
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        <span className="text-xs font-bold" style={{ color: "var(--pl-text-muted)" }}>
          Tendencia fría (&lt; 45 %) + referencia xG
        </span>
        <EvidenceWindowPills windows={TONE_LOW_WINDOWS} size="md" />
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        <span className="text-xs font-bold" style={{ color: "var(--pl-text-muted)" }}>
          Disciplina y rigor arbitral
        </span>
        <EvidenceWindowPills windows={CARDS_REF_WINDOWS} size="md" />
      </div>
    </div>
  ),
};

export const EscalaDeTonosYArbitrajeClaro: Story = {
  globals: { theme: "light" },
  render: EscalaDeTonosYArbitrajeOscuro.render,
};

export const ExtraccionDesdePartidoRealOscuro: Story = {
  globals: { theme: "dark" },
  render: () => {
    const winResult = extractEvidenceWindows({
      game: SAMPLE_GAME,
      pick: {
        label: "América gana",
        selectionKey: "home",
        market: "h2h",
        marketGroup: "Resultado",
      },
      v5: SAMPLE_V5,
    });
    const winTotals = extractEvidenceWindows({
      game: SAMPLE_GAME,
      pick: {
        label: "Más de 2.5 goles",
        selectionKey: "over_2.5",
        market: "totals",
        marketGroup: "Goles totales",
        line: 2.5,
      },
      v5: SAMPLE_V5,
    });
    const winCards = extractEvidenceWindows({
      game: SAMPLE_GAME,
      pick: {
        label: "Más de 4.5 tarjetas amarillas",
        selectionKey: "over_4.5",
        market: "yellow_total",
        marketGroup: "Tarjetas amarillas",
        line: 4.5,
      },
      v5: SAMPLE_V5,
    });

    return (
      <div className="glass-card glass-ring rounded-2xl p-4" style={{ display: "grid", gap: 14, maxWidth: 640 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <strong className="text-xs">América gana · extracción automática (L5 / L20 / H2H / xG)</strong>
          <EvidenceWindowPills windows={winResult} size="sm" />
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          <strong className="text-xs">Más de 2.5 goles · extracción automática (H2H / xG)</strong>
          <EvidenceWindowPills windows={winTotals} size="sm" />
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          <strong className="text-xs">Más de 4.5 tarjetas amarillas · extracción automática (xG / Árb.)</strong>
          <EvidenceWindowPills windows={winCards} size="sm" />
        </div>
      </div>
    );
  },
};

export const ExtraccionDesdePartidoRealClaro: Story = {
  globals: { theme: "light" },
  render: ExtraccionDesdePartidoRealOscuro.render,
};
