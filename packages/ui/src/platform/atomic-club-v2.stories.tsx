import React, { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { asLeagueId, COMPETITION_CATALOG, type LeagueId } from "@pitchlab/contracts";
import { badgeFactsFromEntries, computeBadges, publicBadges } from "./badges";
import type { OwnBadgesState } from "./club/badges/ProfileBadges";
import { BadgePickerDialog } from "./components/BadgePickerDialog";
import { FeedbackSupportDialog, type AccountSupportModalKind } from "./components/FeedbackSupportDialog";
import { FormSquares } from "./components/FormSquares";
import { LeagueCategorySheet, type LeaguePickerEntry } from "./components/LeagueCategorySheet";
import { SettingsGroup, SettingsRow } from "./components/SettingsGroup";
import { DEFAULT_RECORD_PRIVACY } from "./record-stats";

const meta: Meta = {
  title: "PitchLab v4 / Componentes Atómicos v2",
  parameters: { layout: "fullscreen" },
};

export default meta;

function DualThemeShowcase({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", minHeight: "100vh" }}>
      {(["dark", "light"] as const).map((theme) => (
        <div
          key={theme}
          data-theme={theme}
          style={{
            padding: 24,
            background: "var(--pl-stage-bg, var(--pl-bg))",
            color: "var(--pl-text)",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <strong style={{ fontSize: 13 }}>{title}</strong>
            <span className="pl-pill text-xs">{theme === "dark" ? "Tema oscuro" : "Tema claro"}</span>
          </div>
          {children}
        </div>
      ))}
    </div>
  );
}

export const RachaFormSquares: StoryObj = {
  render: () => (
    <DualThemeShowcase title="FormSquares · Últimas 5">
      <div className="glass-card glass-ring rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold">Tamaño sm (Tabla de clasificación)</span>
          <FormSquares form={["G", "E", "G", "G", "P"]} size="sm" />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold">Tamaño md (Ficha de partido)</span>
          <FormSquares form={["P", "E", "G", "G", "G"]} size="md" />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold">Desde cadena API (W/D/L)</span>
          <FormSquares form="WWDLW" size="sm" />
        </div>
      </div>
    </DualThemeShowcase>
  ),
};

export const PreferenciasSettingsGroup: StoryObj = {
  render: () => (
    <DualThemeShowcase title="SettingsGroup & SettingsRow">
      <div className="space-y-4">
        <SettingsGroup title="Preferencias generales">
          <SettingsRow icon="globe" title="Idioma" value="Español (MX)" showChevron={false} />
          <SettingsRow icon="activity" title="Formato de cuotas" value="Decimal" onClick={() => {}} />
          <SettingsRow icon="ticket" title="Casas de apuestas" value="3 seleccionadas" onClick={() => {}} />
          <SettingsRow icon="bell" title="Notificaciones" value="4 activas" onClick={() => {}} />
        </SettingsGroup>
        <SettingsGroup title="Soporte">
          <SettingsRow
            icon="sparkles"
            title="Feedback e ideas"
            subtitle="Ayúdanos a decidir qué construir después"
            onClick={() => {}}
          />
          <SettingsRow
            icon="message"
            title="Contactar con soporte"
            subtitle="Recibe ayuda del equipo de PitchLab."
            onClick={() => {}}
          />
        </SettingsGroup>
        <SettingsGroup title="Zona de peligro">
          <SettingsRow icon="logout" title="Cerrar sesión" tone="danger" showChevron={false} onClick={() => {}} />
          <SettingsRow
            icon="trash"
            title="Eliminar cuenta"
            subtitle="Solicita la baja definitiva y borrado de tus datos"
            tone="danger"
            showChevron={false}
            onClick={() => {}}
          />
        </SettingsGroup>
      </div>
    </DualThemeShowcase>
  ),
};

const NOW = new Date("2026-11-19T18:00:00Z");
const SAMPLE_ALL_BADGES = computeBadges(
  badgeFactsFromEntries(
    Array.from({ length: 24 }, (_, idx) => ({
      status: idx % 3 === 0 ? "lost" : "won",
      units: 1,
      userDecimal: 1.95,
      fairDecimal: 1.86,
      clvPct: 1.5,
      leagueLabel: "Liga MX",
      pickLabel: "Local gana",
      origin: "Spacetime Suite",
      sealedAtIso: new Date(NOW.getTime() - idx * 86_400_000).toISOString(),
      settledAtIso: new Date(NOW.getTime() - idx * 86_400_000).toISOString(),
    })),
    { joinedAtIso: "2026-08-01T00:00:00Z", likesOnPickPosts: 10, paidReferrals: 2 },
  ),
  NOW,
);
const SAMPLE_PUBLIC_BADGES = publicBadges(SAMPLE_ALL_BADGES, {
  privacy: DEFAULT_RECORD_PRIVACY,
  recordVisible: true,
  showInRanking: true,
});

function BadgeModalDemo(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [featuredIds, setFeaturedIds] = useState<string[]>(SAMPLE_PUBLIC_BADGES.slice(0, 2).map((b) => b.id));
  const own: OwnBadgesState = {
    all: SAMPLE_ALL_BADGES,
    publicIds: SAMPLE_PUBLIC_BADGES.map((b) => b.id),
    featuredIds,
    canFeature: true,
    saving: false,
  };
  return (
    <div>
      <button type="button" className="pl-prof-badges-btn" onClick={() => setOpen(true)}>
        Abrir selector de Insignias ({featuredIds.length}/3)
      </button>
      <BadgePickerDialog
        open={open}
        onClose={() => setOpen(false)}
        isOwn
        memberName="Socio PitchLab"
        own={own}
        publicBadges={SAMPLE_PUBLIC_BADGES}
        onToggleFeatured={(id) =>
          setFeaturedIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 3 ? [...prev, id] : prev,
          )
        }
      />
    </div>
  );
}

export const ModalInsignias: StoryObj = {
  render: () => (
    <DualThemeShowcase title="BadgePickerDialog">
      <BadgeModalDemo />
    </DualThemeShowcase>
  ),
};

const SAMPLE_SHEET_ITEMS: LeaguePickerEntry[] = COMPETITION_CATALOG.slice(0, 24).map((c, idx) => ({
  league: c.id,
  label: c.label,
  activeCount: idx < 16 ? (idx % 5) + 1 : 0,
  dayCount: idx < 10 ? (idx % 3) + 1 : 0,
  isActive: idx < 18,
}));

function SheetDemo(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<LeagueId | "all">(asLeagueId("liga-mx"));
  return (
    <div className="space-y-2">
      <button type="button" className="pl-btn-primary min-h-11 px-4 text-xs" onClick={() => setOpen(true)}>
        Explorar ligas por región (actual: {selected})
      </button>
      <LeagueCategorySheet
        open={open}
        onClose={() => setOpen(false)}
        leagues={SAMPLE_SHEET_ITEMS}
        selectedLeague={selected}
        onSelect={setSelected}
        includeAllOption
        allCount={42}
        allowShowInactive
      />
    </div>
  );
}

export const SelectorLigasPorRegion: StoryObj = {
  render: () => (
    <DualThemeShowcase title="LeagueCategorySheet">
      <SheetDemo />
    </DualThemeShowcase>
  ),
};

function SupportDemo(): React.JSX.Element {
  const [kind, setKind] = useState<AccountSupportModalKind>(null);
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className="pl-btn-glass glass-ring min-h-10 px-3 text-xs" onClick={() => setKind("feedback")}>
        Feedback e ideas
      </button>
      <button type="button" className="pl-btn-glass glass-ring min-h-10 px-3 text-xs" onClick={() => setKind("support")}>
        Contactar soporte
      </button>
      <button type="button" className="pl-btn-glass glass-ring min-h-10 px-3 text-xs" onClick={() => setKind("telegram")}>
        Comunidad Telegram
      </button>
      <button type="button" className="pl-btn-glass glass-ring min-h-10 px-3 text-xs" onClick={() => setKind("delete")}>
        Eliminar cuenta
      </button>
      <FeedbackSupportDialog kind={kind} onClose={() => setKind(null)} accountsEnabled={false} />
    </div>
  );
}

export const ModalSoporteYFeedback: StoryObj = {
  render: () => (
    <DualThemeShowcase title="FeedbackSupportDialog">
      <SupportDemo />
    </DualThemeShowcase>
  ),
};
