import common from "./it/common.js";
import footer from "./it/footer.js";
import home from "./it/home.js";
import picks from "./it/picks.js";
import trends from "./it/trends.js";
import stats from "./it/stats.js";
import workstation from "./it/workstation.js";
import opponentRank from "./it/opponent-rank.js";
import gameSummary from "./it/game-summary.js";
import profile from "./it/profile.js";
import pages from "./it/pages.js";
import pricing from "./it/pricing.js";
import mobileLanding from "./it/mobile-landing.js";

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
