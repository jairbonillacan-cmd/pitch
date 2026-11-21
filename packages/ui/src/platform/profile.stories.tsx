import React from "react";
import type { Meta } from "@storybook/react-vite";
import type { PublicMemberProfile } from "@pitchlab/contracts";
import { badgeFactsFromEntries, computeBadges, publicBadges } from "./badges";
import { AnalystProfileClubView } from "./club/AnalystProfileClubView";
import { EditProfileDialog } from "./club/EditProfileDialog";
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
  title: "PitchLab v4 / Perfil de socio",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

const SAMPLE_AVATAR_URI = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" fill="rgb(24,58,132)"/><circle cx="64" cy="48" r="22" fill="rgb(235,242,255)"/><path d="M26 116c6-22 22-34 38-34s32 12 38 34" fill="rgb(235,242,255)"/></svg>',
)}`;

const NOW = new Date("2026-11-15T18:00:00Z");
const DAY_MS = 86_400_000;

const SAMPLE_ENTRIES: RecordEntry[] = Array.from({ length: 24 }, (_, idx) => {
  const iso = new Date(NOW.getTime() - idx * DAY_MS).toISOString();
  return {
    status: idx % 3 !== 0 ? "won" : "lost",
    units: 1,
    userDecimal: 1.94,
    fairDecimal: 1.86,
    clvPct: 1.8,
    leagueLabel: idx % 4 === 0 ? "Premier League" : "Liga MX",
    pickLabel: "Más de 2.5 goles",
    origin: "Spacetime Suite",
    sealedAtIso: iso,
    settledAtIso: iso,
  };
});

const SAMPLE_STATS = computeRecordStats(SAMPLE_ENTRIES, 50);
const SAMPLE_ALL_BADGES = computeBadges(
  badgeFactsFromEntries(SAMPLE_ENTRIES, {
    joinedAtIso: "2026-07-10T12:00:00Z",
    isTipster: false,
    likesOnPickPosts: 16,
    paidReferrals: 2,
  }),
  NOW,
);
const SAMPLE_PUBLIC_BADGES = publicBadges(SAMPLE_ALL_BADGES, {
  privacy: DEFAULT_RECORD_PRIVACY,
  recordVisible: true,
  showInRanking: true,
});

const member: PublicMemberProfile = {
  displayName: "Ana López",
  handle: "ana_analiza",
  bio: "Analizo Liga MX y fútbol inglés con foco en totales y cierres.",
  avatarUrl: null,
  xUsername: "ana_analiza",
  joinedAt: "2026-10-10T12:00:00Z",
  isTipster: false,
  followers: 64,
  following: 18,
};

const dataset = buildPlatformDataset([]);

function EditorStory({ linked, withAvatar = false }: { linked: boolean; withAvatar?: boolean }) {
  return (
    <EditProfileDialog
      profile={{
        ...member,
        avatarUrl: withAvatar ? SAMPLE_AVATAR_URI : null,
        xUsername: linked ? member.xUsername : null,
      }}
      avatarEnabled={withAvatar}
      xEnabled={linked}
      initialOpen
      checkHandle={false}
      onChange={() => undefined}
    />
  );
}

function PublicProfileStory({ withAvatar = false }: { withAvatar?: boolean }) {
  return (
    <PlatformProvider dataset={dataset} initialRole="member">
      <div style={{ padding: 20, background: "var(--pl-stage-bg)", minHeight: "100vh" }}>
        <AnalystProfileClubView
          handle={member.handle}
          memberProfile={{ ...member, avatarUrl: withAvatar ? SAMPLE_AVATAR_URI : null }}
          avatarEnabled={withAvatar}
          publicRecord={{
            hidden: false,
            settled: SAMPLE_STATS.settled,
            view: publicRecordView(
              SAMPLE_STATS,
              SAMPLE_ENTRIES,
              normalizeRecordPrivacy(DEFAULT_RECORD_PRIVACY),
            ),
          }}
          badges={{
            public: SAMPLE_PUBLIC_BADGES,
            featured: SAMPLE_PUBLIC_BADGES.slice(0, 3),
          }}
        />
      </div>
    </PlatformProvider>
  );
}

function TipsterExampleStory() {
  return (
    <PlatformProvider dataset={dataset} initialRole="member">
      <div style={{ padding: 20, background: "var(--pl-stage-bg)", minHeight: "100vh" }}>
        <AnalystProfileClubView handle="sofia_nfl" />
      </div>
    </PlatformProvider>
  );
}

export const EditarPerfilOscuro = { globals: { theme: "dark" }, render: () => <EditorStory linked={false} /> };
export const EditarPerfilClaro = { globals: { theme: "light" }, render: () => <EditorStory linked={false} /> };
export const EditarPerfilConFotoOscuro = { globals: { theme: "dark" }, render: () => <EditorStory linked={false} withAvatar /> };
export const EditarPerfilConFotoClaro = { globals: { theme: "light" }, render: () => <EditorStory linked={false} withAvatar /> };
export const CuentaConectadaOscuro = { globals: { theme: "dark" }, render: () => <EditorStory linked /> };
export const CuentaConectadaClaro = { globals: { theme: "light" }, render: () => <EditorStory linked /> };
export const PerfilPublicoOscuro = { globals: { theme: "dark" }, render: () => <PublicProfileStory /> };
export const PerfilPublicoClaro = { globals: { theme: "light" }, render: () => <PublicProfileStory /> };
export const PerfilPublicoConFotoOscuro = { globals: { theme: "dark" }, render: () => <PublicProfileStory withAvatar /> };
export const PerfilPublicoConFotoClaro = { globals: { theme: "light" }, render: () => <PublicProfileStory withAvatar /> };
export const PerfilTipsterConReciboOscuro = { globals: { theme: "dark" }, render: () => <TipsterExampleStory /> };
export const PerfilTipsterConReciboClaro = { globals: { theme: "light" }, render: () => <TipsterExampleStory /> };
