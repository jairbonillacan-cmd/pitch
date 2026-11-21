import React from "react";
import type { Meta } from "@storybook/react-vite";
import type { PublicMemberProfile } from "@pitchlab/contracts";
import { badgeFactsFromEntries, computeBadges, publicBadges } from "./badges";
import { buildPlatformDataset } from "./match-picks-engine";
import { PlatformProvider } from "./platform-provider";
import { PublicAnalystProfileSurface } from "./public/PublicAnalystProfileSurface";
import {
  computeRecordStats,
  DEFAULT_RECORD_PRIVACY,
  normalizeRecordPrivacy,
  publicRecordView,
  type RecordEntry,
} from "./record-stats";

const meta = {
  title: "PitchLab v4 / Perfil Público (/u/[handle])",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

const EMPTY_DATASET = buildPlatformDataset([]);
const NOW = new Date("2026-11-15T18:00:00Z");
const DAY = 86_400_000;

const ENTRIES: RecordEntry[] = Array.from({ length: 28 }, (_, i) => {
  const iso = new Date(NOW.getTime() - i * DAY).toISOString();
  return {
    status: i % 3 !== 0 ? "won" : "lost",
    units: 1,
    userDecimal: 1.94,
    fairDecimal: 1.87,
    clvPct: 1.6,
    leagueLabel: i % 4 === 0 ? "NBA" : "Liga MX",
    pickLabel: "América gana",
    origin: "Spacetime Suite",
    sealedAtIso: iso,
    settledAtIso: iso,
  };
});

const STATS = computeRecordStats(ENTRIES, 50);
const ALL_BADGES = computeBadges(
  badgeFactsFromEntries(ENTRIES, {
    joinedAtIso: "2026-07-10T12:00:00Z",
    isTipster: true,
    likesOnPickPosts: 18,
    paidReferrals: 3,
  }),
  NOW,
);
const PUB_BADGES = publicBadges(ALL_BADGES, {
  privacy: DEFAULT_RECORD_PRIVACY,
  recordVisible: true,
  showInRanking: true,
});

const TIPSTER_PROFILE: PublicMemberProfile = {
  displayName: "Mateo Rivera",
  handle: "mateorivera",
  bio: "Modelo cuantitativo en fútbol mexicano y basquetbol nocturno. Cierres sellados antes del arranque.",
  avatarUrl: null,
  xUsername: "mateorivera",
  joinedAt: "2026-07-10T12:00:00Z",
  isTipster: true,
  followers: 148,
  following: 29,
};

function Stage({
  theme,
  children,
}: {
  theme: "dark" | "light";
  children: React.JSX.Element;
}): React.JSX.Element {
  return (
    <div data-theme={theme} style={{ minHeight: "100vh", background: "var(--pl-stage-bg)" }}>
      <PlatformProvider dataset={EMPTY_DATASET} initialRole="visitor" accountsEnabled>
        {children}
      </PlatformProvider>
    </div>
  );
}

export const TipsterPublicoOscuro = {
  globals: { theme: "dark" },
  render: () => (
    <Stage theme="dark">
      <PublicAnalystProfileSurface
        profile={TIPSTER_PROFILE}
        publicRecord={{
          hidden: false,
          settled: STATS.settled,
          view: publicRecordView(STATS, ENTRIES, normalizeRecordPrivacy(DEFAULT_RECORD_PRIVACY)),
        }}
        badges={{ public: PUB_BADGES, featured: PUB_BADGES.slice(0, 3) }}
        signupHref="/signup?code=MATEO-7"
      />
    </Stage>
  ),
};

export const TipsterPublicoClaro = {
  globals: { theme: "light" },
  render: () => (
    <Stage theme="light">
      <PublicAnalystProfileSurface
        profile={TIPSTER_PROFILE}
        publicRecord={{
          hidden: false,
          settled: STATS.settled,
          view: publicRecordView(STATS, ENTRIES, normalizeRecordPrivacy(DEFAULT_RECORD_PRIVACY)),
        }}
        badges={{ public: PUB_BADGES, featured: PUB_BADGES.slice(0, 3) }}
      />
    </Stage>
  ),
};

export const SocioConRecordPrivado = {
  globals: { theme: "dark" },
  render: () => (
    <Stage theme="dark">
      <PublicAnalystProfileSurface
        profile={{
          ...TIPSTER_PROFILE,
          displayName: "Valeria Soto",
          handle: "valesoto",
          isTipster: false,
          xUsername: null,
        }}
        publicRecord={{ hidden: true }}
        badges={{ public: [], featured: [] }}
      />
    </Stage>
  ),
};

export const SocioConRecordPrivadoClaro = {
  globals: { theme: "light" },
  render: () => (
    <Stage theme="light">
      <PublicAnalystProfileSurface
        profile={{
          ...TIPSTER_PROFILE,
          displayName: "Valeria Soto",
          handle: "valesoto",
          isTipster: false,
          xUsername: null,
        }}
        publicRecord={{ hidden: true }}
        badges={{ public: [], featured: [] }}
      />
    </Stage>
  ),
};
