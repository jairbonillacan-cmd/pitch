import React from "react";
import type { Meta } from "@storybook/react-vite";
import type { PublicMemberProfile } from "@pitchlab/contracts";
import { AnalystProfileClubView } from "./club/AnalystProfileClubView";
import {
  BadgeChip,
  ProfileBadgesSection,
  type OwnBadgesState,
} from "./club/badges/ProfileBadges";
import {
  badgeFactsFromEntries,
  computeBadges,
  publicBadges,
  toBadgeView,
  type BadgeState,
} from "./badges";
import { buildPlatformDataset } from "./match-picks-engine";
import { PlatformProvider } from "./platform-provider";
import {
  computeRecordStats,
  DEFAULT_RECORD_PRIVACY,
  normalizeRecordPrivacy,
  publicRecordView,
  type RecordEntry,
} from "./record-stats";

const meta = {
  title: "PitchLab v4 / Insignias",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

const NOW = new Date("2026-11-13T18:00:00Z");
const DAY = 86_400_000;

/** 34 picks en 5 semanas: 22 ganados, racha de 6, todos en Liga MX. */
const ENTRIES: RecordEntry[] = Array.from({ length: 34 }, (_, i) => {
  const t = new Date(NOW.getTime() - i * DAY).toISOString();
  return {
    status: i < 6 || i % 3 !== 0 ? "won" : "lost",
    units: 1,
    userDecimal: 1.95,
    fairDecimal: 1.88,
    clvPct: 1.4,
    leagueLabel: i % 5 === 0 ? "NFL" : "Liga MX",
    pickLabel: "América gana",
    origin: "Spacetime Suite",
    sealedAtIso: t,
    settledAtIso: t,
  };
});

const ALL: BadgeState[] = computeBadges(
  badgeFactsFromEntries(ENTRIES, { joinedAtIso: "2026-07-20T12:00:00Z", likesOnPickPosts: 12, paidReferrals: 2 }),
  NOW,
);
const HIDDEN_HIT = normalizeRecordPrivacy({ record: { fields: { hitRate: false } } });
const PUBLIC = publicBadges(ALL, { privacy: HIDDEN_HIT, recordVisible: true, showInRanking: true });
const FEATURED = PUBLIC.slice(0, 2).map((b) => b.id);

const ownState = (over: Partial<OwnBadgesState> = {}): OwnBadgesState => ({
  all: ALL,
  publicIds: PUBLIC.map((b) => b.id),
  featuredIds: FEATURED,
  canFeature: true,
  saving: false,
  ...over,
});

function Stage({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ padding: 24, maxWidth: 1040, margin: "0 auto", background: "var(--pl-stage-bg)", minHeight: "100vh" }}>
      {children}
    </div>
  );
}

function OwnInteractive({ initial }: { initial: OwnBadgesState }): React.JSX.Element {
  const [state, setState] = React.useState(initial);
  return (
    <ProfileBadgesSection
      isOwn
      publicBadges={[]}
      own={state}
      onToggleFeatured={(id) =>
        setState((s) => ({
          ...s,
          featuredIds: s.featuredIds.includes(id) ? s.featuredIds.filter((x) => x !== id) : [...s.featuredIds, id],
        }))
      }
    />
  );
}

const ownStory = (theme: "dark" | "light", over?: Partial<OwnBadgesState>) => ({
  globals: { theme },
  render: () => (
    <Stage>
      <OwnInteractive initial={ownState(over)} />
    </Stage>
  ),
});

/** Tus insignias: ganadas (una privada), destacadas y lo que falta. */
export const PropiasOscuro = ownStory("dark");
export const PropiasClaro = ownStory("light");

/** Con 3 destacadas el resto queda bloqueado hasta quitar una. */
export const TresDestacadasOscuro = ownStory("dark", { featuredIds: PUBLIC.slice(0, 3).map((b) => b.id) });
export const TresDestacadasClaro = ownStory("light", { featuredIds: PUBLIC.slice(0, 3).map((b) => b.id) });

/** Sin cuenta real: se ven, pero no se pueden destacar. */
export const SinCuentaOscuro = ownStory("dark", { canFeature: false, featuredIds: [] });
export const SinCuentaClaro = ownStory("light", { canFeature: false, featuredIds: [] });

const FRESH = computeBadges(badgeFactsFromEntries(ENTRIES.slice(0, 4), { joinedAtIso: "2026-11-01T12:00:00Z" }), NOW);
/** Socio nuevo: casi todo por ganar. */
export const SocioNuevoOscuro = ownStory("dark", { all: FRESH, publicIds: [], featuredIds: [] });
export const SocioNuevoClaro = ownStory("light", { all: FRESH, publicIds: [], featuredIds: [] });

const visitorStory = (theme: "dark" | "light") => ({
  globals: { theme },
  render: () => (
    <Stage>
      <ProfileBadgesSection isOwn={false} publicBadges={PUBLIC} />
    </Stage>
  ),
});

/** Lo que ve otro socio: solo las ganadas que compartes. */
export const VisitanteOscuro = visitorStory("dark");
export const VisitanteClaro = visitorStory("light");

const chipsStory = (theme: "dark" | "light") => ({
  globals: { theme },
  render: () => (
    <Stage>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {ALL.filter((b) => b.earned).map((b) => (
          <BadgeChip key={b.id} badge={toBadgeView(b)} />
        ))}
        {ALL.filter((b) => b.earned).map((b) => (
          <BadgeChip key={`sm-${b.id}`} badge={toBadgeView(b)} size="sm" />
        ))}
      </div>
    </Stage>
  ),
});

/** Píldoras junto al nombre (perfil) y en publicaciones (pequeña). */
export const PildorasOscuro = chipsStory("dark");
export const PildorasClaro = chipsStory("light");

const dataset = buildPlatformDataset([]);
const member: PublicMemberProfile = {
  displayName: "Ana López",
  handle: "ana_analiza",
  bio: "Registro todos mis picks antes del arranque.",
  avatarUrl: null,
  xUsername: null,
  joinedAt: "2026-07-20T12:00:00Z",
  isTipster: false,
};
const profilePublic = publicBadges(ALL, { privacy: DEFAULT_RECORD_PRIVACY, recordVisible: true, showInRanking: true });
const profileStats = computeRecordStats(ENTRIES);
const profileRecord = {
  hidden: false as const,
  settled: profileStats.settled,
  view: publicRecordView(profileStats, [...ENTRIES].reverse(), DEFAULT_RECORD_PRIVACY),
};

const profileStory = (theme: "dark" | "light") => ({
  globals: { theme },
  render: () => (
    <PlatformProvider dataset={dataset} initialRole="member">
      <AnalystProfileClubView
        handle={member.handle}
        memberProfile={member}
        publicRecord={profileRecord}
        badges={{ public: profilePublic, featured: profilePublic.slice(0, 3) }}
      />
    </PlatformProvider>
  ),
});

/** Perfil ajeno con 3 destacadas junto al nombre y la sección completa. */
export const PerfilConInsigniasOscuro = profileStory("dark");
export const PerfilConInsigniasClaro = profileStory("light");

const exampleStory = (theme: "dark" | "light") => ({
  globals: { theme },
  render: () => (
    <PlatformProvider dataset={dataset} initialRole="member">
      <AnalystProfileClubView handle="mariana_t" />
    </PlatformProvider>
  ),
});

/** Perfil de ejemplo: las insignias salen de su récord de ejemplo, calculadas en el navegador. */
export const PerfilDeEjemploOscuro = exampleStory("dark");
export const PerfilDeEjemploClaro = exampleStory("light");
