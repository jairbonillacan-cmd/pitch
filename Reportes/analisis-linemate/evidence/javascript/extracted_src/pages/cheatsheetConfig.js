import { PLAYER_BET_TYPE_ID_TO_NAME } from "../linemate-react-common/src/constants";
import {
  FILTER_KEYS,
  LINE_TYPE_OPTION_KEYS,
  OUTCOME_OPTION_KEYS,
  SIGNAL_OPTION_KEYS,
} from "../linemate-react-common/src/filter-config";

/**
 * config object
 * {
 *    path: config
 * }
 */
export const CHEATSHEET_CONFIG = {
  "recent-form": {
    hitRecordKeyPrefixes: ["CUSTOM_RECENT_FORM"],
    title: "Recent Games",
    subtitle: "100% Club",
    filtersToExclude: [FILTER_KEYS.SIGNALS, FILTER_KEYS.OVER_UNDER],
    type: "player",
  },
  "versus-opponent": {
    hitRecordKeyPrefixes: ["CUSTOM_HEAD_TO_HEAD"],
    title: "Versus Opponent",
    subtitle: "100% Hit Rates",
    filtersToExclude: [FILTER_KEYS.SIGNALS, FILTER_KEYS.OVER_UNDER],
    type: "player",
  },
  "alternate-lines": {
    title: "Alternate Lines",
    subtitle: "100% Hit Rates",
    filtersToExclude: [FILTER_KEYS.LINE_TYPE, FILTER_KEYS.OVER_UNDER],
    primaryLineType: LINE_TYPE_OPTION_KEYS.ALTERNATE,
    type: "player",
  },
  "first-quarter": {
    title: "1st Quarter",
    subtitle: "1st Quarter",
    filtersToExclude: [FILTER_KEYS.BET_TYPE, FILTER_KEYS.OVER_UNDER],
    type: "player",
  },
  "first-half": {
    title: "1st Half",
    subtitle: "1st Half",
    filtersToExclude: [FILTER_KEYS.BET_TYPE, FILTER_KEYS.OVER_UNDER],
    type: "player",
  },
  "home-away-games": {
    hitRecordKeyPrefixes: ["CUSTOM_HOME", "CUSTOM_AWAY"],
    title: "Home/Away Games",
    subtitle: "100% Hit Rates",
    filtersToExclude: [FILTER_KEYS.SIGNALS, FILTER_KEYS.OVER_UNDER],
    type: "player",
  },
  "team-form": {
    title: "Team Form",
    subtitle: "100% Hit Rates",
    filtersToExclude: [FILTER_KEYS.OVER_UNDER],
    type: "team",
  },
  "unders-only": {
    title: "Unders Only",
    subtitle: "100% Hit Rates",
    filtersToExclude: [FILTER_KEYS.OVER_UNDER, FILTER_KEYS.LINE_TYPE],
    type: "player",
  },
};

const getInitialFilterForType = (type, league) => {
  switch (type) {
    case "first-half":
      return {
        [FILTER_KEYS.OVER_UNDER]: OUTCOME_OPTION_KEYS.OVER,
        [FILTER_KEYS.BET_TYPE]: Object.keys(PLAYER_BET_TYPE_ID_TO_NAME[league]).filter((x) =>
          x.endsWith("_1H")
        ),
      };

    case "first-quarter":
      return {
        [FILTER_KEYS.OVER_UNDER]: OUTCOME_OPTION_KEYS.OVER,
        [FILTER_KEYS.BET_TYPE]: Object.keys(PLAYER_BET_TYPE_ID_TO_NAME[league]).filter((x) =>
          x.endsWith("_1Q")
        ),
      };

    case "recent-form":
      return {
        [FILTER_KEYS.OVER_UNDER]: OUTCOME_OPTION_KEYS.OVER,
        [FILTER_KEYS.SIGNALS]: SIGNAL_OPTION_KEYS.RECENT_FORM,
      };

    case "versus-opponent":
      return {
        [FILTER_KEYS.OVER_UNDER]: OUTCOME_OPTION_KEYS.OVER,
        [FILTER_KEYS.SIGNALS]: SIGNAL_OPTION_KEYS.HEAD_TO_HEAD,
      };

    case "alternate-lines":
      return {
        [FILTER_KEYS.OVER_UNDER]: OUTCOME_OPTION_KEYS.OVER,
        [FILTER_KEYS.LINE_TYPE]: LINE_TYPE_OPTION_KEYS.ALTERNATE,
        [FILTER_KEYS.SIGNALS]: SIGNAL_OPTION_KEYS.RECENT_FORM,
      };

    case "home-away-games":
      return {
        [FILTER_KEYS.OVER_UNDER]: OUTCOME_OPTION_KEYS.OVER,
        [FILTER_KEYS.SIGNALS]: SIGNAL_OPTION_KEYS.HOME_AWAY_SPLIT,
      };

    case "team-form":
      return {
        [FILTER_KEYS.OVER_UNDER]: OUTCOME_OPTION_KEYS.ALL,
        [FILTER_KEYS.SIGNALS]: SIGNAL_OPTION_KEYS.RECENT_FORM,
      };

    case "unders-only":
      return {
        [FILTER_KEYS.OVER_UNDER]: OUTCOME_OPTION_KEYS.UNDER,
        [FILTER_KEYS.LINE_TYPE]: LINE_TYPE_OPTION_KEYS.MAIN,
      };

    default:
      return {
        [FILTER_KEYS.OVER_UNDER]: OUTCOME_OPTION_KEYS.OVER,
      };
  }
};

export const getCheatsheetConfigForType = (type, league) => {
  return {
    ...CHEATSHEET_CONFIG[type],
    initialFilters: getInitialFilterForType(type, league),
  };
};