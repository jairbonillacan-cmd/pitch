import common from "./fr/common.js";
import footer from "./fr/footer.js";
import home from "./fr/home.js";
import picks from "./fr/picks.js";
import trends from "./fr/trends.js";
import stats from "./fr/stats.js";
import workstation from "./fr/workstation.js";
import opponentRank from "./fr/opponent-rank.js";
import gameSummary from "./fr/game-summary.js";
import profile from "./fr/profile.js";
import pages from "./fr/pages.js";
import pricing from "./fr/pricing.js";
import mobileLanding from "./fr/mobile-landing.js";

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
