import "../../../../alerts-referees.css";
import React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLeagueCapability, parseCanonicalPublicSlug } from "@pitchlab/contracts";
import { RefereeProfileClubView } from "@pitchlab/ui/referees";
import { loadRefereeProfile } from "../../../../../src/server/referees";
import { PRODUCT_LEAGUES, type ProductLeague } from "../../../../../src/server/snapshots";

export const dynamic = "force-dynamic";

function isProductLeague(value: string): value is ProductLeague {
  return PRODUCT_LEAGUES.some((item) => item === value);
}

function isSupportedRefereeLeague(league: string): league is ProductLeague {
  if (!isProductLeague(league)) return false;
  const capability = getLeagueCapability(league);
  return capability?.sport === "football" && capability.providers.referees === true;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ league: string; refereeSlug: string }>;
}): Promise<Metadata> {
  const { league, refereeSlug } = await params;
  const normalizedLeague = league.trim().toLowerCase();
  const normalizedSlug = refereeSlug.trim().toLowerCase();
  if (
    !isSupportedRefereeLeague(normalizedLeague) ||
    parseCanonicalPublicSlug(normalizedSlug) === null
  ) {
    return { title: "Árbitro no encontrado | PitchLab" };
  }
  const profile = loadRefereeProfile(normalizedSlug, normalizedLeague);
  if (!profile || profile.primaryLeague !== normalizedLeague) {
    return { title: "Árbitro no encontrado | PitchLab" };
  }
  return {
    title: `${profile.name} · Árbitro ${profile.primaryLeagueLabel} | PitchLab`,
    description: `Perfil disciplinario de ${profile.name} en ${profile.primaryLeagueLabel}: tarjetas ajustadas, rigor, partidos recientes y jugadores propensos a amonestación.`,
  };
}

export default async function RefereeDetailProfilePage({
  params,
}: {
  params: Promise<{ league: string; refereeSlug: string }>;
}): Promise<React.JSX.Element> {
  const { league, refereeSlug } = await params;
  const normalizedLeague = league.trim().toLowerCase();
  const normalizedSlug = refereeSlug.trim().toLowerCase();

  if (
    !isSupportedRefereeLeague(normalizedLeague) ||
    parseCanonicalPublicSlug(normalizedSlug) === null
  ) {
    notFound();
  }

  const profile = loadRefereeProfile(normalizedSlug, normalizedLeague);
  if (!profile || profile.primaryLeague !== normalizedLeague) {
    notFound();
  }

  return <RefereeProfileClubView profile={profile} />;
}
