import common from "./en/common.js";
import footer from "./en/footer.js";
import home from "./en/home.js";
import picks from "./en/picks.js";
import trends from "./en/trends.js";
import stats from "./en/stats.js";
import workstation from "./en/workstation.js";
import opponentRank from "./en/opponent-rank.js";
import gameSummary from "./en/game-summary.js";
import profile from "./en/profile.js";
import pages from "./en/pages.js";
import pricing from "./en/pricing.js";
import mobileLanding from "./en/mobile-landing.js";

export default {
  web: {
    ...(common.web || {}),
    ...(footer.web || {}),
    ...(pages.web || {}),
  },
  home: {
    ...(home.home || {}),
  },
  picks: {
    ...(picks.picks || {}),
  },
  trends: {
    ...(trends.trends || {}),
  },
  stats: {
    ...(stats.stats || {}),
  },
  workstation: {
    ...(workstation.workstation || {}),
  },
  opponentRank: {
    ...(opponentRank.opponentRank || {}),
  },
  gameSummary: {
    ...(gameSummary.gameSummary || {}),
  },
  userProfile: {
    ...(profile.userProfile || {}),
  },
  pricing: {
    ...(pricing.pricing || {}),
  },
  mobileLanding: {
    ...(mobileLanding.mobileLanding || {}),
  },
};