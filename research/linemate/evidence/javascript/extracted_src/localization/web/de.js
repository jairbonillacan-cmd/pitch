import common from "./de/common.js";
import footer from "./de/footer.js";
import home from "./de/home.js";
import picks from "./de/picks.js";
import trends from "./de/trends.js";
import stats from "./de/stats.js";
import workstation from "./de/workstation.js";
import opponentRank from "./de/opponent-rank.js";
import gameSummary from "./de/game-summary.js";
import profile from "./de/profile.js";
import pages from "./de/pages.js";
import pricing from "./de/pricing.js";
import mobileLanding from "./de/mobile-landing.js";

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
