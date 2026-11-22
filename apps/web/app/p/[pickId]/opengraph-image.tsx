import { decimalToAmericanInt, isPickUnlocked } from "@pitchlab/ui/access-guard";
import { TIPSTER_CREATORS } from "@pitchlab/ui/spacetime-catalog";
import {
  OG_CARD_CONTENT_TYPE,
  OG_CARD_SIZE,
  renderEditorialOgCard,
} from "../../../src/server/og-card-kit";
import { loadPublicPlatformState } from "../../../src/server/platform-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "Boleto compartido en PitchLab";
export const size = OG_CARD_SIZE;
export const contentType = OG_CARD_CONTENT_TYPE;

function renderFallbackPickCard() {
  return renderEditorialOgCard({
    eyebrow: "Boleto compartido",
    badge: "ANTES DEL SAQUE",
    title: "Probabilidad estimada y momio justo antes del partido.",
    subtitle:
      "Consulta la lectura completa del encuentro y explora 7 días gratis sin tarjeta en PitchLab.",
    stats: [
      { label: "Modelo", value: "Calibrado", tone: "accent" },
      { label: "Cobertura", value: "5 deportes" },
      { label: "Prueba", value: "7 días gratis", tone: "success" },
    ],
    footnote: "pitchlab.mx",
  });
}

function formatAmericanSigned(decimalOdds: number): string {
  const american = decimalToAmericanInt(decimalOdds);
  return american > 0 ? `+${american}` : `${american}`;
}

export default async function PublicPickOpenGraphImage({
  params,
}: {
  params: Promise<{ pickId: string }>;
}) {
  const { pickId } = await params;
  const cleanId = pickId.trim();
  if (!cleanId || cleanId.includes("__")) {
    return renderFallbackPickCard();
  }

  const state = await loadPublicPlatformState(cleanId);
  if (!state.publicPickResolved || state.dataset.games.length === 0) {
    return renderFallbackPickCard();
  }

  const game = state.dataset.games[0];
  if (!game) {
    return renderFallbackPickCard();
  }

  const openPick =
    game.picks.find(
      (p) =>
        (p.tipsterSlug === cleanId || Boolean(p.isTipsterWeeklyOpen)) &&
        isPickUnlocked(p, game.status, "visitor"),
    ) ?? game.picks.find((p) => isPickUnlocked(p, game.status, "visitor"));

  if (!openPick || openPick.isRedacted || openPick.p <= 0 || openPick.fairDecimal <= 1) {
    return renderFallbackPickCard();
  }

  const creator = TIPSTER_CREATORS.find((c) => c.weeklyPickSlug === cleanId);
  const probPct = `${(openPick.p * 100).toFixed(1)} %`;
  const fairValue = `${formatAmericanSigned(openPick.fairDecimal)} · ${openPick.fairDecimal.toFixed(2)}`;
  const statusLabel =
    game.status === "FT"
      ? openPick.result === "hit"
        ? "Acertado"
        : openPick.result === "miss"
          ? "Fallado"
          : "Liquidado"
      : "Abierto · +7d";

  return renderEditorialOgCard({
    eyebrow: creator ? `${game.leagueLabel} · @${creator.handle}` : game.leagueLabel,
    badge: creator ? "BOLETO SEMANAL" : "BOLETO ABIERTO",
    title: openPick.label,
    subtitle: `${game.home.name} vs ${game.away.name}`,
    stats: [
      { label: "Prob. estimada", value: probPct, tone: "accent" },
      { label: "Momio justo", value: fairValue },
      {
        label: "Estado",
        value: statusLabel,
        tone: game.status === "FT" && openPick.result === "hit" ? "success" : "default",
      },
    ],
    footnote: `pitchlab.mx/p/${encodeURIComponent(cleanId)}`,
  });
}
