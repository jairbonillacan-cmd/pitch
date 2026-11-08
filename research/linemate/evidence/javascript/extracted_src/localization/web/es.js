import common from "./es/common.js";
import footer from "./es/footer.js";
import home from "./es/home.js";
import picks from "./es/picks.js";
import trends from "./es/trends.js";
import stats from "./es/stats.js";
import workstation from "./es/workstation.js";
import opponentRank from "./es/opponent-rank.js";
import gameSummary from "./es/game-summary.js";
import profile from "./es/profile.js";
import pages from "./es/pages.js";
import pricing from "./es/pricing.js";
import mobileLanding from "./es/mobile-landing.js";

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