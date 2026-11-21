import "../../../alerts-referees.css";
import React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { COMPETITION_BY_ID, getLeagueCapability } from "@pitchlab/contracts";
import {
  RefereesDirectoryClubView,
  type RefereeLeagueLinkOption,
} from "@pitchlab/ui/referees";
import { loadLeagueRefereeRanking } from "../../../../src/server/referees";
import { PRODUCT_LEAGUES, type ProductLeague } from "../../../../src/server/snapshots";

export const dynamic = "force-dynamic";

function isProductLeague(value: string): value is ProductLeague {
  return PRODUCT_LEAGUES.some((item) => item === value);
}

function isSupportedRefereeLeague(league: string): league is ProductLeague {
  if (!isProductLeague(league)) return false;
  const capability = getLeagueCapability(league);
  return capability?.sport === "football" && capability.providers.referees === true;
}

function loadAvailableRefereeLeagues(): RefereeLeagueLinkOption[] {
  const options: RefereeLeagueLinkOption[] = [];
  for (const league of PRODUCT_LEAGUES) {
    if (!isSupportedRefereeLeague(league)) continue;
    const ranking = loadLeagueRefereeRanking(league);
    if (!ranking || ranking.referees.length === 0) continue;
    options.push({
      id: league,
      label: COMPETITION_BY_ID[league]?.label ?? ranking.leagueLabel,
      href: `/app/${encodeURIComponent(league)}/arbitros`,
    });
  }
  return options;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ league: string }>;
}): Promise<Metadata> {
  const { league } = await params;
  const normalized = league.trim().toLowerCase();
  if (!isSupportedRefereeLeague(normalized)) {
    return { title: "Árbitros no disponibles | PitchLab" };
  }
  const ranking = loadLeagueRefereeRanking(normalized);
  if (!ranking) {
    return { title: "Árbitros no disponibles | PitchLab" };
  }
  return {
    title: `Árbitros · ${ranking.leagueLabel} | PitchLab`,
    description: `Ranking arbitral de ${ranking.leagueLabel}: tasas suavizadas de tarjetas amarillas, rojas, penales, faltas y perfil de rigor.`,
  };
}

export default async function LeagueRefereesDirectoryPage({
  params,
}: {
  params: Promise<{ league: string }>;
}): Promise<React.JSX.Element> {
  const { league } = await params;
  const normalized = league.trim().toLowerCase();
  if (!isSupportedRefereeLeague(normalized)) {
    notFound();
  }

  const ranking = loadLeagueRefereeRanking(normalized);
  if (!ranking) {
    notFound();
  }

  const availableLeagues = loadAvailableRefereeLeagues();

  return (
    <RefereesDirectoryClubView
      ranking={ranking}
      availableLeagues={availableLeagues}
    />
  );
}
