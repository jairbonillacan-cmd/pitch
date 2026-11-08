import common from "./pt/common.js";
import footer from "./pt/footer.js";
import home from "./pt/home.js";
import picks from "./pt/picks.js";
import trends from "./pt/trends.js";
import stats from "./pt/stats.js";
import workstation from "./pt/workstation.js";
import opponentRank from "./pt/opponent-rank.js";
import gameSummary from "./pt/game-summary.js";
import profile from "./pt/profile.js";
import pages from "./pt/pages.js";
import pricing from "./pt/pricing.js";
import mobileLanding from "./pt/mobile-landing.js";

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
