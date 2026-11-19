import React from "react";
import type { LiveInPlayWinProb } from "@pitchlab/contracts";
import { EarlyPayoutStrip } from "./components/EarlyPayoutStrip";
import { EpistemicBandStrip } from "./components/EpistemicBandStrip";
import { SgpCopulaAuditCard } from "./components/SgpCopulaAuditCard";
import { LiveWinProbBar } from "./live/LiveWinProbBar";
import type {
  EarlyPayoutSummaryView,
  EpistemicBandView,
  SgpCopulaAuditView,
} from "./types";

const HOME_BAND: EpistemicBandView = {
  pPoint: 0.542,
  pLower90: 0.488,
  pUpper90: 0.596,
  halfWidth90: 0.054,
  conservativeFairDecimal: 2.05,
  grade: "high",
};

const DRAW_BAND: EpistemicBandView = {
  pPoint: 0.258,
  pLower90: 0.212,
  pUpper90: 0.308,
  halfWidth90: 0.048,
  conservativeFairDecimal: 4.72,
  grade: "high",
};

const AWAY_BAND: EpistemicBandView = {
  pPoint: 0.2,
  pLower90: 0.156,
  pUpper90: 0.249,
  halfWidth90: 0.047,
  conservativeFairDecimal: 6.41,
  grade: "high",
};

const VOLATILE_HOME_BAND: EpistemicBandView = {
  pPoint: 0.49,
  pLower90: 0.37,
  pUpper90: 0.61,
  halfWidth90: 0.12,
  conservativeFairDecimal: 2.7,
  grade: "elevated",
};

const EARLY_PAYOUT_SOCCER: EarlyPayoutSummaryView = {
  triggerLabel: "Ventaja de +2 goles",
  homeWinProb: 0.569,
  awayWinProb: 0.221,
  homeLiftPts: 2.7,
  awayLiftPts: 2.1,
  fairHomeDecimal: 1.76,
  fairAwayDecimal: 4.52,
  bothTriggerProb: 0.004,
  validatedOos: true,
};

const SGP_AUDIT_SEVERE: SgpCopulaAuditView = {
  sport: "soccer",
  nLegs: 2,
  independentProbability: 0.312,
  jointProbability: 0.356,
  correlationMultiplier: 1.14,
  correlationDirection: "positively_correlated",
  fairCombinedDecimal: 2.81,
  fairCombinedAmerican: 181,
  bookQuoteAudit: {
    offeredDecimal: 2.15,
    impliedBookProbability: 0.4651,
    fairCombinedDecimal: 2.81,
    effectiveHoldPct: 23.5,
    taxFlag: "severe_sgp_tax",
  },
};

const INPLAY_SAMPLE: LiveInPlayWinProb = {
  minute: 68,
  pHome: 0.742,
  pDraw: 0.196,
  pAway: 0.062,
  fairHomeDecimal: 1.35,
  fairDrawDecimal: 5.1,
  fairAwayDecimal: 16.13,
  pNextGoalHome: 0.31,
  pNextGoalAway: 0.24,
  pNoMoreGoals: 0.45,
  expectedFinalTotal: 2.88,
  redCardsHome: 0,
  redCardsAway: 1,
};

function SuiteFrame({ volatile = false }: { volatile?: boolean }): React.JSX.Element {
  return (
    <div className="space-y-4 p-4" style={{ maxWidth: 960 }}>
      <EpistemicBandStrip
        homeLabel="América"
        awayLabel="Cruz Azul"
        homeBand={volatile ? VOLATILE_HOME_BAND : HOME_BAND}
        drawBand={DRAW_BAND}
        awayBand={AWAY_BAND}
        oddsFormat="decimal"
      />
      <EarlyPayoutStrip
        homeLabel="América"
        awayLabel="Cruz Azul"
        earlyPayout={EARLY_PAYOUT_SOCCER}
        oddsFormat="decimal"
      />
      <SgpCopulaAuditCard
        legs={[]}
        oddsFormat="decimal"
        precomputedAudit={SGP_AUDIT_SEVERE}
      />
      <LiveWinProbBar
        homeLabel="América"
        awayLabel="Cruz Azul"
        inPlay={INPLAY_SAMPLE}
        oddsFormat="american"
      />
    </div>
  );
}

export default {
  title: "Platform v4 / Spacetime v5.1 (Bandas, Pago Anticipado, SGP y En Vivo)",
};

export const SuiteCompleta = { render: () => <SuiteFrame /> };
export const SuiteCompletaClaro = { ...SuiteCompleta, globals: { theme: "light" } };
export const IncertidumbreElevada = { render: () => <SuiteFrame volatile /> };
export const Movil375 = {
  render: () => <SuiteFrame />,
  parameters: { viewport: { defaultViewport: "mobile1" } },
};
export const Movil375Claro = { ...Movil375, globals: { theme: "light" } };
