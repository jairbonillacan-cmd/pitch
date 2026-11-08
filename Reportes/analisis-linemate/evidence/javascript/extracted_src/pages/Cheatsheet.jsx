import React from "react";

import "./Cheatsheet.scss";
import "./Trends.scss";
import "./Props.scss";
import "../components/App.scss";
import "./GameSummary.scss";

import GlobalContext from "../components/GlobalContext";
import {
  buildQueryParams,
  filtersToQueryParamsDict,
  getBetTypeOptionsForAPI,
  getBookEntryBasedOnBestOdds,
  getGamesFilterForAPI,
  getGameTitle,
  getLineTypeFilterForAPI,
  getMultipleBetTypeFilterForAPI,
  getSignalsFilterForAPI,
  getSingleOverUnderFilter,
  getStraightTrendTypeFilterForAPI,
  hasPremiumAccess,
  jsonOrDefault,
  parseDateFromString,
  getPlayerId
} from "../linemate-react-common/src/util";
import { API_HOST } from "../react-web-constants";
import {
  getCardKey,
  getMainLineBasedOnOccurrences,
  supportedTrendFilter,
} from "../linemate-react-common/src/betting-utils";
import _ from "lodash";
import { Buffer } from "buffer";
import TrendDetails from "../components/TrendDetails";
import { withRouter } from "react-router-dom/cjs/react-router-dom.min";
import { withTranslation } from "react-i18next";
import { getCheatsheetConfigForType } from "./cheatsheetConfig";
import HitRateEntry from "../components/HitRateEntry";
import Loader from "../components/Loader";
import ListComponent from "../components/ListComponent";
import { FILTER_KEYS, FILTER_LABELS } from "../linemate-react-common/src/filter-config";

const FILTER_KEY_BY_LABEL = Object.fromEntries(
  Object.entries(FILTER_LABELS).map(([key, label]) => [label, key])
);

function getPath() {
  // Trim leading and trailing forward slash
  return window.location.pathname.replace(/^\//g, "").replace(/\/$/g, "");
}

// In case user goes directly to cheatsheet
function determineCheatsheetType() {
  let type = null;
  const path = getPath();
  if (path.length > 0) {
    type = path.split("/")[2].toLowerCase();
  }
  return type;
}

// Only available in react native utils
export function getOverUnderFilterForAPI() {
  return {
    ...getSingleOverUnderFilter(),
    queryParamField: "outcomes",
  };
}

const getTrendHitRecord = (trend, signalTypes) => {
  return trend.signals.find((signal) => signalTypes.includes(signal.type))?.hitRecord || null;
};

const dataLimitIncrement = 50;

class CheatSheet extends React.Component {
  static contextType = GlobalContext;

  constructor(props, context) {
    // https://github.com/facebook/react/issues/13944
    // Looks like this API is being deprecated but it doesn't look like there is any official way of doing it in the new API
    super(props, context);
    this.cardSelected = this.cardSelected.bind(this);

    this.listRef = React.createRef();

    this.workstationResizeObserver = null;

    const searchParams = new URLSearchParams(window.location.search);
    this.customFeed = searchParams.has("feed")
      ? JSON.parse(
          Buffer.from(searchParams.get("feed"), "base64").toString("utf-8")
        )
      : null;
    if (
      !hasPremiumAccess(context.userAttributes) &&
      this.customFeed &&
      this.customFeed.without
    ) {
      // If it's a free user but has somehow gotten a link for without
      this.customFeed = null;
    }

    this.profile =
      searchParams.has("profile") && Boolean(searchParams.get("profile"));

    let listFilters = {};

    // This is where defaults are determined
    this.metadata = getCheatsheetConfigForType(determineCheatsheetType(), context.league);

    this.type = this.metadata.type;
    this.endpoint = `${API_HOST}/api/${context.league}/v1/trends/straights`;

    const gameTitleToGameIdDict = Object.fromEntries(
      this.context.currentGames.map((x) => [
        getGameTitle(context.league, x),
        x.id,
      ])
    );
    const gameTitleToAnnotationDict = Object.fromEntries(
      this.context.currentGames.map((x) => {
        const parsedDate = parseDateFromString(x.timestamp);
        return [
          getGameTitle(context.league, x),
          `${parsedDate.dayOfWeekShort} ${parsedDate.formattedTime}`,
        ];
      })
    );
    listFilters[FILTER_KEYS.LINE_TYPE] = getLineTypeFilterForAPI();
    listFilters[FILTER_KEYS.GAMES] = getGamesFilterForAPI(
      gameTitleToGameIdDict,
      gameTitleToAnnotationDict
    );
    listFilters[FILTER_KEYS.OVER_UNDER] = getOverUnderFilterForAPI();
    listFilters[FILTER_KEYS.BET_TYPE] = getMultipleBetTypeFilterForAPI(
      getBetTypeOptionsForAPI(context.league, this.type)
    );
    listFilters[FILTER_KEYS.SIGNALS] = getSignalsFilterForAPI(context.league);
    listFilters[FILTER_KEYS.TREND_TYPE] = getStraightTrendTypeFilterForAPI(this.type);

    this.metadata.filtersToExclude.forEach((filter) => {
      const normalizedFilter = FILTER_KEY_BY_LABEL[filter] || filter;
      if (normalizedFilter in listFilters) {
        listFilters[normalizedFilter].hidden = true;
      }
    });

    Object.keys(this.metadata.initialFilters || {}).forEach((filter) => {
      const normalizedFilter = FILTER_KEY_BY_LABEL[filter] || filter;
      const selection = this.metadata.initialFilters[filter];

      if (!(normalizedFilter in listFilters)) {
        return;
      }

      const filterConfig = listFilters[normalizedFilter];
      const options = filterConfig.options;
      const optionLabels = filterConfig.optionLabels || null;

      if ("selectedValue" in filterConfig) {
        const normalizedSelection =
          optionLabels
            ? Object.keys(optionLabels).find((key) => optionLabels[key] === selection) || selection
            : (!Array.isArray(options)
                ? Object.keys(options).find((key) => options[key] === selection) || selection
                : selection);

        if (
          (Array.isArray(options) && options.includes(normalizedSelection)) ||
          (!Array.isArray(options) && normalizedSelection in options)
        ) {
          filterConfig.selectedValue = normalizedSelection;
        }
      } else if ("selectedValues" in filterConfig) {
        const normalizedSelections = (selection || []).map((entry) =>
          optionLabels
            ? Object.keys(optionLabels).find((key) => optionLabels[key] === entry) || entry
            : (!Array.isArray(options)
                ? Object.keys(options).find((key) => options[key] === entry) || entry
                : entry)
        );

        if (Array.isArray(options)) {
          filterConfig.selectedValues = normalizedSelections.filter((x) => options.includes(x));
        } else {
          filterConfig.selectedValues = normalizedSelections.filter((x) => x in options);
        }
      }
    });

    if (
      !this.metadata.initialFilters?.[FILTER_KEYS.SIGNALS] &&
      !this.metadata.initialFilters?.Signals &&
      !this.metadata.initialFilters?.signals &&
      FILTER_KEYS.SIGNALS in listFilters
    ) {
      const signalOptions = Object.keys(listFilters[FILTER_KEYS.SIGNALS].options).filter((key) => key !== "allSignals");
      if (signalOptions.length > 0) {
        listFilters[FILTER_KEYS.SIGNALS].selectedValue = signalOptions[0];
      }
    }

    this.defaultListFilters = _.cloneDeep(listFilters);

    this.startingIndex = searchParams.get('index') || 0;

    this.state = {
      cards: [],
      filteredCards: [],
      freePreviewCards: [],
      cardSelectionLoading: false,
      selectedCard: null,
      selectedCardMarkets: null,
      listFiltersModalOpen: false,
      listFilters: _.cloneDeep(listFilters),
      // Dictates if we need to show the details view if set to true, otherwise show the list view
      mobileCardSelected: false,
      initialCardSelection: true,
      offset: 0,
      loadingBatch: false,
      initialLoading: true,
      endReached: false,
      lastFetchTime: 0
    };
  }

  componentDidMount() {
    document.title = `${this.props.t('trends.cheatsheet.title')} - Linemate`;

    this.workstationResizeObserver = new ResizeObserver((entries) => {
      // This solution is not ideal, I would have preferred to have this done via css but couldn't figure out how to do it
      // The screen width check is so that it doesn't happen on mobile
      // This was previously in componentDidUpdate when the workstation was here,
      //  but since it's now a separate component this is the easiest way to watch for a layout change
      if (this.listRef.current && window.screen.width >= 1024) {
        this.listRef.current.style.height = `${entries[0].contentRect.height}px`;
      }
    });
    this.workstationResizeObserver.observe(
      document.getElementsByClassName("trends-page-details")[0]
    );
  }

  componentDidUpdate(prevProps, prevState) {
    const games = this.context.currentGames;
    if (!games?.length || !this.state.listFilters[FILTER_KEYS.GAMES]) return;

    const gameOptions = Object.keys(this.state.listFilters[FILTER_KEYS.GAMES].options || {}).filter((k) => k !== "all");
    if (gameOptions.length === games.length) return;

    const gameTitleToGameIdDict = Object.fromEntries(
      games.map((x) => [getGameTitle(this.context.league, x), x.id])
    );
    const gameTitleToAnnotationDict = Object.fromEntries(
      games.map((x) => {
        const parsedDate = parseDateFromString(x.timestamp);
        return [
          getGameTitle(this.context.league, x),
          `${parsedDate.dayOfWeekShort} ${parsedDate.formattedTime}`,
        ];
      })
    );

    const newGamesFilter = getGamesFilterForAPI(
      gameTitleToGameIdDict,
      gameTitleToAnnotationDict
    );

    const prevSelected = this.state.listFilters[FILTER_KEYS.GAMES].selectedValues || [];
    newGamesFilter.selectedValues = prevSelected.filter((v) => v in newGamesFilter.options);
    if (newGamesFilter.selectedValues.length === 0) {
      newGamesFilter.selectedValues = ["all"];
    }

    this.setState({
      listFilters: {
        ...this.state.listFilters,
        [FILTER_KEYS.GAMES]: newGamesFilter,
      },
    });
  }

  componentWillUnmount() {
    if (this.workstationResizeObserver) {
      this.workstationResizeObserver.disconnect();
    }
  }

  resolveFilterSignals() {
    return this.state.listFilters[FILTER_KEYS.SIGNALS].options[
      this.state.listFilters[FILTER_KEYS.SIGNALS].selectedValue
    ]?.split(",");
  }

    fetchBatch(tab, offset, reset, initialLoad, filtersOverride) {
    const currentCardsLength = reset ? 0 : this.state.cards.length;
    const filtersToUse =
      (filtersOverride && (filtersOverride.straight || filtersOverride[tab])) ||
      this.state.listFilters;

    const selectedSignalValue = filtersToUse[FILTER_KEYS.SIGNALS]?.options?.[
      filtersToUse[FILTER_KEYS.SIGNALS]?.selectedValue
    ];

    const apiFilters = {
      offset: offset,
      limit: dataLimitIncrement,
      preferredProviders: this.context.resolvedPreferredProviders,
      ...filtersToQueryParamsDict(filtersToUse),
      sortBySignals: selectedSignalValue,
    };

    const queryParams = buildQueryParams(apiFilters);
    const signalTypes = selectedSignalValue?.split(",") || [];

    fetch(`${this.endpoint}?${queryParams}`)
      .then((response) => jsonOrDefault(response, []))
      .then((response) => {
        const filteredTrends = response.filter((trend) =>
          supportedTrendFilter(this.context.league, trend)
        );

        const allCards = reset ? filteredTrends : this.state.cards.concat(filteredTrends);
        const cards = [];
        let previousHitRecord = null;
        let separatorAdded = false;

        for (let index = 0; index < allCards.length; index++) {
          const trend = allCards[index];
          const hitRecord = getTrendHitRecord(trend, signalTypes);

          if (!hitRecord) {
            continue;
          }

          let mainLine = 0;
          let mainBook = "";

          if (trend.market) {
            mainLine = getMainLineBasedOnOccurrences(
              trend.market,
              this.context.resolvedPreferredProviders
            );
            mainBook = getBookEntryBasedOnBestOdds(
              trend.market.books,
              trend.outcome,
              mainLine,
              this.context.resolvedPreferredProviders
            );
          }

          if (
            previousHitRecord?.hitRate === 100 &&
            hitRecord?.hitRate < 100 &&
            !separatorAdded
          ) {
            cards.push({ type: "separator" });
            separatorAdded = true;
            cards[index - 1].includeBottomBorder = false;
          }

          previousHitRecord = hitRecord;

          cards.push({
            ...trend,
            hitRecord,
            includeBottomBorder: true,
            odds: trend.market?.books?.[mainBook]?.[trend.outcome]?.current?.odds,
            marketId: trend.market?.name,
            bookId: mainBook,
          });
        }

        const state = {
          cards,
          offset: offset + dataLimitIncrement,
          loadingBatch: false,
          initialLoading: false,
          endReached: response.length < dataLimitIncrement,
          lastFetchTime: new Date().getTime(),
        };

        if (initialLoad) {
          let selectedCard = null;
          if (offset === 0) {
            selectedCard = cards[0];
          }
          let presetIndex = this.startingIndex || 0;
          if (presetIndex >= cards.length) {
            presetIndex = 0;
          }
          selectedCard = cards.length > presetIndex ? cards[presetIndex] : null;
          this.setState(state, () => this.cardSelected(selectedCard, true, this.context.currentGames));
        } else if (!reset) {
          this.setState(state, () => {
            const items = document.getElementsByClassName("trends-page-list-items-item");
            if (currentCardsLength > 0) {
              const previousLastItem = items[currentCardsLength - 1];
              if (previousLastItem) {
                previousLastItem.scrollIntoView(false, { behavior: "auto", block: "end" });
              }
            }
          });
        } else {
          this.setState(state);
        }
      })
      .catch(console.error);
  }

  cardSelected(card, initialLoad, games) {
    if (!initialLoad) {
      // Scroll to top of page for mobile, otherwise the user ends up at the bottom of the workstation
      window.scrollTo(0, 0);
    }
    if (
      card &&
      this.state.selectedCard &&
      getCardKey(card) === getCardKey(this.state.selectedCard)
    ) {
      return this.setState({
        mobileCardSelected: !initialLoad,
        initialCardSelection: initialLoad,
      });
    }
    if (!card) {
      return this.setState({ mobileCardSelected: true });
    }
    // This is to make sure you can't start spam clicking cards while a card is loading which would trigger a bunch of fetches
    if (this.state.cardSelectionLoading) {
      return;
    }

    var selectedCardMarkets = {};
    var cardGame;
    if (games) {
      cardGame = games.find((x) => x.id === card.gameId);
    } else {
      cardGame = this.state.games.find((x) => x.id === card.gameId);
    }
    if (cardGame) {
      var teamPath = "";
      if (cardGame.awayTeamData.info.code === card.team.code) {
        teamPath = "awayTeamData";
      } else {
        teamPath = "homeTeamData";
      }

      if (card.type === "team") {
        selectedCardMarkets = Object.assign(
          {},
          cardGame.markets,
          cardGame[teamPath].markets
        );
      } else if (card.type === "player" && cardGame[teamPath].players) {
        const playerRecord = cardGame[teamPath].players.find(
          (x) => getPlayerId(x.info) === getPlayerId(card.player)
        );
        selectedCardMarkets = playerRecord.props;
      }
    }

    this.setState({
      cardSelectionLoading: false,
      selectedCard: card,
      mobileCardSelected: !initialLoad,
      initialCardSelection: initialLoad,
      selectedCardMarkets: selectedCardMarkets,
    });
  }

  render() {
    const { t } = this.props;
    const title = this.customFeed ? this.customFeed.title : t("trends.title");
    const subtitle = this.customFeed ? this.customFeed.subtitle : null;
    const annotation = this.customFeed ? this.customFeed.annotation : null;
    const without = this.customFeed ? this.customFeed.without : null;
    var selectedCard = this.state.selectedCard;
    // TODO: we have no parlay cheatsheet, can possibly clean some of this up to assume it's straight only
    var cardType = "straight";
    if (selectedCard && !("type" in selectedCard)) {
      cardType = "parlay";
    }

    const haveCards = this.state.cards.length > 0;

    const cheatsheetTabs = {
      straight: {
        trends: this.state.cards,
        offset: this.state.offset,
        loadingBatch: this.state.loadingBatch,
        initialLoadInProgress: this.state.initialLoading,
        endReached: this.state.endReached,
        lastFetchTime: this.state.lastFetchTime || 0,
      },
    };

    return (
      <div className={`trends-page-container${!haveCards && !this.profile ? " trends-page-container--no-plays" : ""}`}>
        <div className={`trends-page-main-page${this.state.mobileCardSelected ? " trends-page-main-page-mobile-detail-active" : ""}`}>
          <div className="game-summary-list-column trends-page-list-column cheatsheet-list-component" style={{borderLeft: '1px solid var(--color-border-default)'}}>
          <ListComponent
            title={this.metadata.title}
            subtitle={t('trends.cheatsheet.title')}
            annotation={annotation || undefined}
            emptyStateMode='props'
            onBackClick={this.customFeed ? () => ("returnUrl" in this.customFeed ? (window.location.href = this.customFeed.returnUrl) : window.history.back()) : undefined}
            showGamesFilter={true}
            fetchBatch={(tab, offset, reset, initialLoad, filtersOverride) => this.fetchBatch(tab, offset, reset, initialLoad, filtersOverride)}
            setListFilters={(next) => this.setState({ listFilters: next.straight })}
            customFeed={null}
            profile={this.profile}
            pickerOptions={{ straight: t('trends.title') }}
            tabs={cheatsheetTabs}
            pickerSelection="straight"
            setPickerSelection={() => {}}
            haveCards={haveCards}
            listFilters={{ straight: this.state.listFilters }}
            listRef={this.listRef}
            listWrapperClassName={this.state.mobileCardSelected ? "" : "trends-page-list-mobile-active"}
            cardSelected={this.cardSelected}
            renderList={(state) => {
              const tab = state.tabs.straight;
              return (
                <>
                  <div key={`straight-${tab.lastFetchTime}`} className="trends-page-list-items cheatsheet-page-list-items">
                    {(tab.trends || []).map((card) => {
                      if (card.type === "separator") {
                        return (
                          <div key="separator" className="separator">
                            <span className="separator-label text-style-caption-uppercase-medium">
                              {t('trends.cheatsheet.separator.noLongerHundredPercent')}
                            </span>
                          </div>
                        );
                      }
                      const item = card;
                      const cardKey = getCardKey(item);
                      const userHasPremiumAccess = hasPremiumAccess(this.context.userAttributes);
                      return (
                        <div
                          key={`${cardKey}-${card.freePreview && !userHasPremiumAccess ? item.iteration : ""}`}
                          className={this.state.selectedCard && cardKey === getCardKey(this.state.selectedCard) ? "trends-page-list-items-item-selected" : "trends-page-list-items-item"}
                          data-initialSelection={this.state.initialCardSelection}
                          data-freePreview={item.freePreview && !userHasPremiumAccess}
                          onClick={() =>
                            item.freePreview && !userHasPremiumAccess
                              ? (window.location.href = "/pricing")
                              : this.cardSelected(card, false, this.context.currentGames)
                          }
                        >
                          {item.freePreview && !userHasPremiumAccess && (
                            <div className="trends-page-list-items-item-free-preview">
                              <div className="trends-page-list-items-item-free-preview-left">
                                <p className="text-style-caption-semibold">{t('trends.list.preview.comboTrendPreview')}</p>
                              </div>
                              <div className="trends-page-list-items-item-free-preview-right">
                                <div>
                                  <img src="assets/lock-open.svg" alt="unlocked" />
                                </div>
                                <p className="text-style-caption-semibold">{t('trends.list.preview.tryLinematePlus')}</p>
                              </div>
                            </div>
                          )}
                          <HitRateEntry entry={card} selected={this.state.selectedCard && cardKey === getCardKey(this.state.selectedCard)} />
                        </div>
                      );
                    })}
                  </div>
                  {!tab.endReached && (
                    <div className="trends-page-list-items-loader">
                      <Loader />
                    </div>
                  )}
                </>
              );
            }}
          />
          </div>
          <div
            className={`trends-page-details ${
              this.state.mobileCardSelected
                ? "trends-page-details-mobile-active"
                : ""
            }`}
          >
            {(selectedCard || this.profile) && (
              <TrendDetails
                key={getCardKey(selectedCard)}
                trend={selectedCard}
                source={"trends"}
                type={cardType}
                without={without}
                customFeed={this.customFeed}
                crossGame={this.state.pickerSelection === "crossGameParlay"}
                onMobileClose={() => this.setState({ mobileCardSelected: false })}
              />
            )}
          </div>
        </div>
      </div>
    );
  }
}

export default withRouter(withTranslation()(CheatSheet));
