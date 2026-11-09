

    let barChartInstance = null;
    /*
      Comparar's own per-player identity palette: the brand's eucalyptus
      ramp (--compare-1/2/3 in sk.css). It used to borrow the rank badges'
      green / yellow / orange, which put a "middling" yellow on whoever was
      compared second. One color per player slot, used everywhere a player needs identifying (card
      border, legend, grid header ring, grid cell fill, chart lines) so the
      same player always reads the same color across the whole tab.
    */
    const COMPARISON_SERIES_TOKENS = ['--compare-1', '--compare-2', '--compare-3'];
    /*
      A grid header's surname at the largest size that fits its cell
      (comparisonPanel.watchName()): chart-download.js's fitText(), the one
      the download runs again on its copy.
    */
    function fitComparisonName(th) {
      if (!th.isConnected) {
        comparisonNameObserver?.unobserve(th);
        return;
      }
      window.SkChartDownload?.fitText(th);
    }

    // Outside Alpine's state: an observer is not data. One for every header cell.
    const comparisonNameObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(entries => entries.forEach(entry => fitComparisonName(entry.target)));
    const comparisonSeriesColors = COMPARISON_SERIES_TOKENS.map((token) => `var(${token})`);

    function comparisonSeriesColor(index) {
      return themeColor(COMPARISON_SERIES_TOKENS[index % COMPARISON_SERIES_TOKENS.length], '#3CC3B1');
    }

    // SK-05: player comparison ("Comparar" tab)
    let comparisonRadarChartInstance = null;
    let comparisonDataLoadingFlag = false;
    const comparisonSearchUrl = 'https:\/\/www.statiskicks.com\/players\/search';

    let currentUnit = 'porcentaje'; // 'porcentaje' | 'p90' | 'total'
    let showPositionAvg = false;
    let desempChartInstance = null;
    let desempChartType = 'bar';
    let desempFiltroTipo = 'partido'; // 'partido' | 'temporada'
    let activePlayerTab = 'perfil';
    const playerDetailRuntime = window.__playerDetailRuntime || {};
    window.__playerDetailRuntime = playerDetailRuntime;

    function currentPlayerDetailPage() {
      return document.querySelector('[data-player-detail-page]');
    }

    function currentPlayerDetailElement(id) {
      return currentPlayerDetailPage()?.querySelector(`#${id}`) || null;
    }

    function currentPlayerDetailPlayerId() {
      const id = Number(currentPlayerDetailPage()?.dataset.playerId || 0);
      return Number.isFinite(id) && id > 0 ? id : null;
    }

    function currentPlayerDetailComponent() {
      const page = currentPlayerDetailPage();
      if (!page || !window.Livewire || typeof window.Livewire.find !== 'function') return null;

      const componentRoot = page.closest('[wire\\:id]') || page.querySelector('[wire\\:id]');
      const componentId = componentRoot?.getAttribute('wire:id');

      return componentId ? window.Livewire.find(componentId) : null;
    }

    function callPlayerDetailMethod(methodName, ...args) {
      const component = currentPlayerDetailComponent();
      const wire = component?.$wire || component;

      if (wire && typeof wire[methodName] === 'function') {
        return wire[methodName](...args);
      }

      if (component && typeof component.call === 'function') {
        return component.call(methodName, ...args);
      }

      return null;
    }

    function isMobilePlayerView() {
      const narrowViewport = window.matchMedia('(max-width: 768px)').matches;
      const touchCapable = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;

      return narrowViewport && touchCapable;
    }

    // iOS Safari kills the tab process ("A problem repeatedly occurred") when canvas
    // memory gets too high. At devicePixelRatio 3 (retina phones) every canvas allocates
    // 9x the pixels; capping the ratio on mobile keeps the heatmap/pitch/chart buffers
    // small enough to render without crashing.
    function getCanvasDpr() {
      const raw = window.devicePixelRatio || 1;
      return isMobilePlayerView() ? Math.min(raw, 1.5) : Math.min(raw, 2);
    }

    function themeColor(name, fallback) {
      const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return value || fallback;
    }

    function runWhenBrowserIdle(callback, timeout = 700) {
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(() => callback(), { timeout });
        return;
      }

      window.setTimeout(callback, 60);
    }

    function profilePlayerClient(stage, context = {}) {
      if (!playerDetailProfileEnabled) return;

      console.info('[player-detail.profile]', {
        stage,
        player_id: playerDetailPlayerId,
        ...context,
      });
    }

    function themeColorRgba(name, alpha, fallback) {
      return hexToRgba(themeColor(name, fallback), alpha);
    }

    function setSelectValue(id, value) {
      const select = document.getElementById(id);
      if (!select) return;

      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function setToggleActive(id, isActive) {
      const button = document.getElementById(id);
      if (!button) return;
      button.classList.toggle('active', Boolean(isActive));
    }

    function syncChartControlsUI() {
      setToggleActive('btnPorcentaje', currentUnit === 'porcentaje');
      setToggleActive('btnP90', currentUnit === 'p90');
      setToggleActive('btnTotal', currentUnit === 'total');
      setToggleActive('btnSoloJugador', !showPositionAvg);
      setToggleActive('btnConMedia', showPositionAvg);
    }

    function syncSeasonRankingControlsUI() {
      const crossLeagueAvailable = Boolean(seasonRankingData?.cross_league_available);
      const crossLeagueButton = document.getElementById('btnRankingAllLeagues');
      const crossLeagueLabel = document.getElementById('rankingCrossLeagueLabel');

      if (!crossLeagueAvailable && seasonRankingLeagueScope === 'all_leagues') {
        seasonRankingLeagueScope = 'same_league';
      }

      if (crossLeagueButton) {
        crossLeagueButton.disabled = !crossLeagueAvailable;
      }

      if (crossLeagueLabel) {
        crossLeagueLabel.textContent = seasonRankingData?.cross_league_label || 'Top ligas';
      }

      setToggleActive('btnRankingSamePosition', seasonRankingPositionScope === 'same_position');
      setToggleActive('btnRankingAllPositions', seasonRankingPositionScope === 'all_positions');
      setToggleActive('btnRankingSameLeague', seasonRankingLeagueScope === 'same_league');
      setToggleActive('btnRankingAllLeagues', seasonRankingLeagueScope === 'all_leagues');
    }

    function getSeasonRankingKey() {
      const positionKey = seasonRankingPositionScope === 'same_position'
        ? 'same_position'
        : 'all_positions';
      const leagueKey = seasonRankingLeagueScope === 'same_league'
        ? 'same_league'
        : 'all_leagues';

      return `${positionKey}_${leagueKey}`;
    }

    /**
     * The worst rating in whichever ranking population is currently selected
     * (same/all positions x same/all leagues) — the floor for every Skore
     * chart's y-axis, so the visible range reflects real performances in that
     * population instead of the full 0-10 scale. Falls back to 0 until the
     * ranking data has loaded or when it is unavailable for this player.
     *
     * A single match's skore can still fall below that season-aggregate
     * floor (one bad game is more volatile than a whole season's average),
     * so pass the values a chart is about to plot: Chart.js does not clamp
     * points/bars outside `scales.y.min` to the axis edge, it clips them out
     * of the visible area entirely, so an out-of-range point is not just
     * "not exact" - it's invisible.
     *
     * @param {number[]} [plottedValues]
     */
    function getSkoreAxisFloor(plottedValues = []) {
      const options = seasonRankingData?.options || {};
      const selected = options[getSeasonRankingKey()];
      const populationFloor = Number(selected?.min_rating);
      const floor = selected?.available && Number.isFinite(populationFloor) ? populationFloor : 0;

      const finiteValues = plottedValues.filter(v => Number.isFinite(v));

      return finiteValues.length ? Math.min(floor, ...finiteValues) : floor;
    }

    /** Re-draws every Skore chart already on screen so its y-axis floor picks up the latest getSkoreAxisFloor(). */
    function refreshSkoreAxisCharts() {
      renderHeaderSkore();
      if (desempChartInstance) buildDesempChart(desempChartType);
    }

    function formatSeasonRankingScore(value) {
      return window.StatiskicksSkore.format(value, '-');
    }

    function escapeHtmlValue(value) {
      return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
      }[char]));
    }

    function renderSeasonRanking() {
      const container = document.getElementById('seasonRankingResult');
      if (!container) return;

      if (seasonRankingLoading) {
        container.innerHTML = `
          <div class="season-ranking-main">
            <span class="season-ranking-rank">Cargando ranking...</span>
            <span class="season-ranking-meta">Calculando posición en la población.</span>
          </div>
          <span class="season-ranking-score">-</span>
        `;
        return;
      }

      const options = seasonRankingData?.options || {};

      syncSeasonRankingControlsUI();

      const selected = options[getSeasonRankingKey()];

      if (!selected || !selected.available) {
        const population = escapeHtmlValue(selected?.population_label || 'la poblacion seleccionada');
        container.innerHTML = `
          <div class="season-ranking-main">
            <span class="season-ranking-rank">Ranking no disponible</span>
            <span class="season-ranking-meta">No hay SKore suficiente para ${population}.</span>
          </div>
          <span class="season-ranking-score">-</span>
        `;
        return;
      }

      const seasonLabel = seasonRankingData?.season_label ? `Temporada ${seasonRankingData.season_label}` : 'Temporada mas reciente';
      const populationLabel = escapeHtmlValue(selected.population_label);

      container.innerHTML = `
        <div class="season-ranking-main">
          <span class="season-ranking-rank">#${selected.rank} de ${selected.total}</span>
          <span class="season-ranking-meta">${populationLabel} &middot; ${escapeHtmlValue(seasonLabel)}</span>
        </div>
        <span class="season-ranking-score sk-stat-box sk-skore sk-skore--${window.StatiskicksSkore.grade(selected.rating)}">${formatSeasonRankingScore(selected.rating)}</span>
      `;
    }

    function scheduleHeaderSkoreRender() {
      if (headerSkoreRenderScheduled) return;
      headerSkoreRenderScheduled = true;

      runWhenBrowserIdle(() => {
        headerSkoreRenderScheduled = false;
        renderHeaderSkore();
      }, 900);
    }

    function setDesempLoadingVisible(isVisible) {
      const overlay = document.getElementById('desempLoadingOverlay');
      if (!overlay) return;

      overlay.style.display = isVisible ? 'flex' : 'none';
    }

    function syncDesempLoadingUI() {
      const isLoading = desempFiltroTipo === 'temporada'
        ? performanceSeasonLoading
        : performanceLatestLoading;

      setDesempLoadingVisible(activePlayerTab === 'desempeno' && isLoading);
    }

    function syncDesempChartCanvas() {
      const canvas = document.getElementById('desempChart');
      if (!canvas) return;

      if (desempChartInstance && desempChartInstance.canvas !== canvas) {
        desempChartInstance.destroy();
        desempChartInstance = null;
      }

      if (!desempChartInstance) {
        initDesempChart();
      }
    }

    function showPlayerTab(tabName, options = {}) {
      const target = tabName || 'perfil';
      const panel = document.getElementById('tab-' + target);
      if (!panel) return;

      activePlayerTab = target;

      syncPlayerTabVisibility(target);

      if (target === 'desempeno') {
        if (typeof syncDesempFiltroTipoUI === 'function') {
          syncDesempFiltroTipoUI();
        }

        syncDesempChartCanvas();
        syncDesempLoadingUI();

        if (options.triggerLoad !== false) {
          ensureDesempSelectedDataLoaded();
        }
      }

      requestAnimationFrame(() => {
        if (target === 'perfil') {
          ensureHeatmapDataLoaded();
          syncTraitsLoadingUI();
          updateChart();
          scheduleHeaderSkoreRender();
        }

        if (target === 'desempeno' && desempChartInstance) {
          buildDesempChart(desempChartType);
        }

        if (target === 'mapas') {
          window.StatiskicksEventMap?.activate('player-detail-map');
        }

        if (target === 'similares' && typeof ensureSimilarPlayersDataLoaded === 'function') {
          ensureSimilarPlayersDataLoaded();
        }

        if (target === 'comparar' && typeof ensureComparisonDataLoaded === 'function') {
          ensureComparisonDataLoaded();
        }
      });
    }

    function syncPlayerTabVisibility(target) {
      const current = target || activePlayerTab || 'perfil';

      document.querySelectorAll('.player-tab').forEach(tab => {
        const active = tab.dataset.tab === current;
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-selected', active ? 'true' : 'false');
      });

      document.querySelectorAll('.tab-panel').forEach(tabPanel => {
        tabPanel.style.display = tabPanel.id === 'tab-' + current ? 'block' : 'none';
      });
    }

    function setChartUnit(nextUnit) {
      const normalizedUnit = ['p90', 'total'].includes(nextUnit) ? nextUnit : 'porcentaje';
      const changed = currentUnit !== normalizedUnit;

      currentUnit = normalizedUnit;
      syncChartControlsUI();

      if (changed) {
        updateChart();
      }
    }

    function setPositionAverageVisibility(nextValue) {
      const normalizedValue = Boolean(nextValue);
      const changed = showPositionAvg !== normalizedValue;

      showPositionAvg = normalizedValue;
      syncChartControlsUI();

      if (changed) {
        createBarChart();
      }
    }


    const themeToggleBtn = document.getElementById('themeToggle');
    if (themeToggleBtn) {
      themeToggleBtn.addEventListener('click', function () {
        updateChartColors();
      });
    }

    
    let traitsData = [];
    let visibleTraits = getDefaultVisibleTraits(traitsData);
    let traitsLoaded = traitsData.length > 0;
    let traitsLoading = !traitsLoaded; // show placeholder immediately if data not yet ready
    let traitsFetchPending = false;
    let mainChartInteractiveReady = typeof playerDetailRuntime.mainChartInteractiveReady === 'boolean'
      ? playerDetailRuntime.mainChartInteractiveReady
      : !isMobilePlayerView();
    let mainChartAutoUnlockTimeoutId = null;

    let heatmapPoints = JSON.parse('[{\u0022x\u0022:59.7,\u0022y\u0022:93.5},{\u0022x\u0022:64.9,\u0022y\u0022:88.8},{\u0022x\u0022:63.3,\u0022y\u0022:51.1},{\u0022x\u0022:74.1,\u0022y\u0022:38.9},{\u0022x\u0022:45.5,\u0022y\u0022:79.6},{\u0022x\u0022:44,\u0022y\u0022:76.1},{\u0022x\u0022:75.1,\u0022y\u0022:64.6},{\u0022x\u0022:99.5,\u0022y\u0022:0.5},{\u0022x\u0022:45.1,\u0022y\u0022:65.6},{\u0022x\u0022:54.3,\u0022y\u0022:63.8},{\u0022x\u0022:35.1,\u0022y\u0022:67.6},{\u0022x\u0022:45.9,\u0022y\u0022:81.7},{\u0022x\u0022:44.2,\u0022y\u0022:70.8},{\u0022x\u0022:43.8,\u0022y\u0022:44.1},{\u0022x\u0022:74.3,\u0022y\u0022:52.4},{\u0022x\u0022:79.9,\u0022y\u0022:68.8},{\u0022x\u0022:54.9,\u0022y\u0022:95.9},{\u0022x\u0022:70.6,\u0022y\u0022:95.9},{\u0022x\u0022:74.7,\u0022y\u0022:57.4},{\u0022x\u0022:72.5,\u0022y\u0022:82.6},{\u0022x\u0022:81.8,\u0022y\u0022:71.3},{\u0022x\u0022:51.1,\u0022y\u0022:70.9},{\u0022x\u0022:81.9,\u0022y\u0022:51.5},{\u0022x\u0022:99.6,\u0022y\u0022:99.4},{\u0022x\u0022:76.1,\u0022y\u0022:84.9},{\u0022x\u0022:48.7,\u0022y\u0022:79},{\u0022x\u0022:62.6,\u0022y\u0022:55},{\u0022x\u0022:53.7,\u0022y\u0022:91.8},{\u0022x\u0022:63.9,\u0022y\u0022:96.7},{\u0022x\u0022:75.9,\u0022y\u0022:83.4},{\u0022x\u0022:99.5,\u0022y\u0022:99.5},{\u0022x\u0022:89,\u0022y\u0022:67},{\u0022x\u0022:36.7,\u0022y\u0022:88.2},{\u0022x\u0022:36.6,\u0022y\u0022:82},{\u0022x\u0022:49.8,\u0022y\u0022:61.5},{\u0022x\u0022:46,\u0022y\u0022:65.6},{\u0022x\u0022:47,\u0022y\u0022:65.2},{\u0022x\u0022:76.2,\u0022y\u0022:72.7},{\u0022x\u0022:74.4,\u0022y\u0022:53.6},{\u0022x\u0022:75.2,\u0022y\u0022:49.6},{\u0022x\u0022:81.6,\u0022y\u0022:86.2},{\u0022x\u0022:75.8,\u0022y\u0022:77.4},{\u0022x\u0022:39,\u0022y\u0022:86.8},{\u0022x\u0022:56.7,\u0022y\u0022:93.5},{\u0022x\u0022:65.8,\u0022y\u0022:72.4},{\u0022x\u0022:56.5,\u0022y\u0022:64.3},{\u0022x\u0022:47,\u0022y\u0022:33.8},{\u0022x\u0022:58.3,\u0022y\u0022:64.9},{\u0022x\u0022:55.3,\u0022y\u0022:54.4},{\u0022x\u0022:87,\u0022y\u0022:47.2},{\u0022x\u0022:66.2,\u0022y\u0022:50.2},{\u0022x\u0022:67,\u0022y\u0022:49.8},{\u0022x\u0022:76.5,\u0022y\u0022:60.5},{\u0022x\u0022:77.3,\u0022y\u0022:77.3},{\u0022x\u0022:78.4,\u0022y\u0022:44.2},{\u0022x\u0022:76.4,\u0022y\u0022:78.3},{\u0022x\u0022:67.8,\u0022y\u0022:86.4},{\u0022x\u0022:78.2,\u0022y\u0022:68.8},{\u0022x\u0022:73.6,\u0022y\u0022:69.3},{\u0022x\u0022:99.5,\u0022y\u0022:0.5},{\u0022x\u0022:63,\u0022y\u0022:76.5},{\u0022x\u0022:63.7,\u0022y\u0022:60.3},{\u0022x\u0022:87.5,\u0022y\u0022:38.7},{\u0022x\u0022:91.3,\u0022y\u0022:42.7},{\u0022x\u0022:36.4,\u0022y\u0022:60.9},{\u0022x\u0022:38.4,\u0022y\u0022:47.4},{\u0022x\u0022:66.8,\u0022y\u0022:84},{\u0022x\u0022:46.1,\u0022y\u0022:69.9},{\u0022x\u0022:48.7,\u0022y\u0022:53.2},{\u0022x\u0022:67.7,\u0022y\u0022:52.6},{\u0022x\u0022:66.5,\u0022y\u0022:87.4},{\u0022x\u0022:55.3,\u0022y\u0022:56.8},{\u0022x\u0022:75.7,\u0022y\u0022:46.1},{\u0022x\u0022:78.3,\u0022y\u0022:67.1},{\u0022x\u0022:67.2,\u0022y\u0022:85.9},{\u0022x\u0022:73.2,\u0022y\u0022:65.3},{\u0022x\u0022:75,\u0022y\u0022:53.8},{\u0022x\u0022:87.4,\u0022y\u0022:66.8},{\u0022x\u0022:95,\u0022y\u0022:71.4},{\u0022x\u0022:84.6,\u0022y\u0022:66.4},{\u0022x\u0022:99.5,\u0022y\u0022:99.5},{\u0022x\u0022:80,\u0022y\u0022:100},{\u0022x\u0022:69.6,\u0022y\u0022:24.4},{\u0022x\u0022:73.9,\u0022y\u0022:49.7},{\u0022x\u0022:50.1,\u0022y\u0022:50},{\u0022x\u0022:58.5,\u0022y\u0022:85.4},{\u0022x\u0022:58,\u0022y\u0022:73.3},{\u0022x\u0022:74,\u0022y\u0022:82.5},{\u0022x\u0022:33.7,\u0022y\u0022:79.4},{\u0022x\u0022:37.9,\u0022y\u0022:52.3},{\u0022x\u0022:58.6,\u0022y\u0022:16.6},{\u0022x\u0022:65.5,\u0022y\u0022:92.3},{\u0022x\u0022:60.7,\u0022y\u0022:77.5},{\u0022x\u0022:46.8,\u0022y\u0022:53.5},{\u0022x\u0022:63.5,\u0022y\u0022:72.6},{\u0022x\u0022:66.9,\u0022y\u0022:79.2},{\u0022x\u0022:72.9,\u0022y\u0022:67.4},{\u0022x\u0022:71.1,\u0022y\u0022:31.5},{\u0022x\u0022:66,\u0022y\u0022:43.5},{\u0022x\u0022:99.5,\u0022y\u0022:0.5},{\u0022x\u0022:59.4,\u0022y\u0022:27.2},{\u0022x\u0022:83,\u0022y\u0022:81.8},{\u0022x\u0022:88.7,\u0022y\u0022:86.7},{\u0022x\u0022:39.2,\u0022y\u0022:95},{\u0022x\u0022:36.5,\u0022y\u0022:92.9},{\u0022x\u0022:37.2,\u0022y\u0022:81.9},{\u0022x\u0022:75.7,\u0022y\u0022:37.4},{\u0022x\u0022:28.1,\u0022y\u0022:69.1},{\u0022x\u0022:52.7,\u0022y\u0022:57},{\u0022x\u0022:68.8,\u0022y\u0022:47.7},{\u0022x\u0022:72.1,\u0022y\u0022:40.3},{\u0022x\u0022:39,\u0022y\u0022:8.2},{\u0022x\u0022:73.8,\u0022y\u0022:50.7},{\u0022x\u0022:66.3,\u0022y\u0022:70.3},{\u0022x\u0022:74.7,\u0022y\u0022:83.8},{\u0022x\u0022:73.7,\u0022y\u0022:74.5},{\u0022x\u0022:73.7,\u0022y\u0022:59.4},{\u0022x\u0022:68.8,\u0022y\u0022:60.4},{\u0022x\u0022:72.3,\u0022y\u0022:39.6},{\u0022x\u0022:65.8,\u0022y\u0022:59.2},{\u0022x\u0022:64.8,\u0022y\u0022:57.7},{\u0022x\u0022:63.2,\u0022y\u0022:86.1},{\u0022x\u0022:77,\u0022y\u0022:73.7},{\u0022x\u0022:87.8,\u0022y\u0022:36.6},{\u0022x\u0022:54.5,\u0022y\u0022:71.1},{\u0022x\u0022:55.9,\u0022y\u0022:44.5},{\u0022x\u0022:69.4,\u0022y\u0022:54.7},{\u0022x\u0022:91.4,\u0022y\u0022:51.5},{\u0022x\u0022:91.4,\u0022y\u0022:51.5},{\u0022x\u0022:79.3,\u0022y\u0022:91.3},{\u0022x\u0022:71.8,\u0022y\u0022:79.4},{\u0022x\u0022:94.6,\u0022y\u0022:73.1},{\u0022x\u0022:89.5,\u0022y\u0022:90.4},{\u0022x\u0022:74.6,\u0022y\u0022:82.2},{\u0022x\u0022:66.2,\u0022y\u0022:84.4},{\u0022x\u0022:72.9,\u0022y\u0022:75.3},{\u0022x\u0022:84.4,\u0022y\u0022:32.7},{\u0022x\u0022:76.6,\u0022y\u0022:52.5},{\u0022x\u0022:85.3,\u0022y\u0022:42.3},{\u0022x\u0022:24.9,\u0022y\u0022:63.2},{\u0022x\u0022:46.7,\u0022y\u0022:59},{\u0022x\u0022:66.7,\u0022y\u0022:74.3},{\u0022x\u0022:36.6,\u0022y\u0022:74.1},{\u0022x\u0022:65.7,\u0022y\u0022:71.9},{\u0022x\u0022:48.2,\u0022y\u0022:77.1},{\u0022x\u0022:65.7,\u0022y\u0022:76.6},{\u0022x\u0022:59.2,\u0022y\u0022:62.7},{\u0022x\u0022:23.3,\u0022y\u0022:93.4},{\u0022x\u0022:49,\u0022y\u0022:76.6},{\u0022x\u0022:57.4,\u0022y\u0022:69.2},{\u0022x\u0022:55.9,\u0022y\u0022:71.3},{\u0022x\u0022:43.3,\u0022y\u0022:65.4},{\u0022x\u0022:42.2,\u0022y\u0022:62.3},{\u0022x\u0022:77.8,\u0022y\u0022:28.2},{\u0022x\u0022:99.5,\u0022y\u0022:0.5},{\u0022x\u0022:45.7,\u0022y\u0022:57},{\u0022x\u0022:74.4,\u0022y\u0022:44.7},{\u0022x\u0022:82.4,\u0022y\u0022:48.5},{\u0022x\u0022:89.6,\u0022y\u0022:62},{\u0022x\u0022:55.2,\u0022y\u0022:89.4},{\u0022x\u0022:74.4,\u0022y\u0022:59.7},{\u0022x\u0022:80.1,\u0022y\u0022:47.7},{\u0022x\u0022:63.7,\u0022y\u0022:79.3},{\u0022x\u0022:70.8,\u0022y\u0022:89.4},{\u0022x\u0022:81.9,\u0022y\u0022:91},{\u0022x\u0022:85.5,\u0022y\u0022:77.8},{\u0022x\u0022:72.9,\u0022y\u0022:80.2},{\u0022x\u0022:46.9,\u0022y\u0022:55.5},{\u0022x\u0022:74,\u0022y\u0022:67.7},{\u0022x\u0022:76.8,\u0022y\u0022:56},{\u0022x\u0022:83,\u0022y\u0022:41.5},{\u0022x\u0022:77.8,\u0022y\u0022:80},{\u0022x\u0022:79.9,\u0022y\u0022:51.4},{\u0022x\u0022:99.7,\u0022y\u0022:99.3},{\u0022x\u0022:67.1,\u0022y\u0022:70.9},{\u0022x\u0022:64.9,\u0022y\u0022:49.7},{\u0022x\u0022:45.5,\u0022y\u0022:65.9},{\u0022x\u0022:99.5,\u0022y\u0022:0.5},{\u0022x\u0022:79.3,\u0022y\u0022:29.8},{\u0022x\u0022:85.7,\u0022y\u0022:55.1},{\u0022x\u0022:85.4,\u0022y\u0022:58.7},{\u0022x\u0022:76.3,\u0022y\u0022:70.7},{\u0022x\u0022:92.5,\u0022y\u0022:62.5},{\u0022x\u0022:47.2,\u0022y\u0022:95.4},{\u0022x\u0022:57.2,\u0022y\u0022:86.9},{\u0022x\u0022:79.4,\u0022y\u0022:46.9},{\u0022x\u0022:50.3,\u0022y\u0022:49.7},{\u0022x\u0022:69.3,\u0022y\u0022:56.3},{\u0022x\u0022:61.7,\u0022y\u0022:39.8},{\u0022x\u0022:75.7,\u0022y\u0022:48.7},{\u0022x\u0022:74.1,\u0022y\u0022:35.5},{\u0022x\u0022:49.6,\u0022y\u0022:49.7},{\u0022x\u0022:58,\u0022y\u0022:92.8},{\u0022x\u0022:65.1,\u0022y\u0022:80.5},{\u0022x\u0022:81.6,\u0022y\u0022:32.1},{\u0022x\u0022:82.9,\u0022y\u0022:35},{\u0022x\u0022:62.7,\u0022y\u0022:76.9},{\u0022x\u0022:45,\u0022y\u0022:93.4},{\u0022x\u0022:46.8,\u0022y\u0022:78},{\u0022x\u0022:77.2,\u0022y\u0022:87.5},{\u0022x\u0022:87.9,\u0022y\u0022:73.5},{\u0022x\u0022:45.9,\u0022y\u0022:78.8},{\u0022x\u0022:42.3,\u0022y\u0022:41.8},{\u0022x\u0022:71.7,\u0022y\u0022:39.4},{\u0022x\u0022:85.8,\u0022y\u0022:87.5},{\u0022x\u0022:79.6,\u0022y\u0022:68.7},{\u0022x\u0022:99.6,\u0022y\u0022:99.7},{\u0022x\u0022:71.8,\u0022y\u0022:78.6},{\u0022x\u0022:46.5,\u0022y\u0022:86.3},{\u0022x\u0022:76.3,\u0022y\u0022:90.9},{\u0022x\u0022:55.8,\u0022y\u0022:95.5},{\u0022x\u0022:65.8,\u0022y\u0022:71.8},{\u0022x\u0022:67.2,\u0022y\u0022:79.1},{\u0022x\u0022:56.5,\u0022y\u0022:79.7},{\u0022x\u0022:61,\u0022y\u0022:79.6},{\u0022x\u0022:70.1,\u0022y\u0022:74},{\u0022x\u0022:74.7,\u0022y\u0022:80.2},{\u0022x\u0022:76.3,\u0022y\u0022:80},{\u0022x\u0022:50.9,\u0022y\u0022:82},{\u0022x\u0022:99.5,\u0022y\u0022:99.5},{\u0022x\u0022:66.2,\u0022y\u0022:94.8},{\u0022x\u0022:58.9,\u0022y\u0022:92.5},{\u0022x\u0022:45.5,\u0022y\u0022:55.7},{\u0022x\u0022:77.9,\u0022y\u0022:58.4},{\u0022x\u0022:81.8,\u0022y\u0022:43},{\u0022x\u0022:73.9,\u0022y\u0022:32.9},{\u0022x\u0022:50.7,\u0022y\u0022:80.6},{\u0022x\u0022:72.3,\u0022y\u0022:74.1},{\u0022x\u0022:47.4,\u0022y\u0022:66.8},{\u0022x\u0022:59.5,\u0022y\u0022:95.6},{\u0022x\u0022:69.3,\u0022y\u0022:85.9},{\u0022x\u0022:40.3,\u0022y\u0022:72.7},{\u0022x\u0022:28.9,\u0022y\u0022:44.4},{\u0022x\u0022:66.1,\u0022y\u0022:69.4},{\u0022x\u0022:67,\u0022y\u0022:73.7},{\u0022x\u0022:69.1,\u0022y\u0022:73.7},{\u0022x\u0022:65.6,\u0022y\u0022:57},{\u0022x\u0022:38.3,\u0022y\u0022:63},{\u0022x\u0022:41.5,\u0022y\u0022:37.1},{\u0022x\u0022:68,\u0022y\u0022:51.9},{\u0022x\u0022:39.8,\u0022y\u0022:92.4},{\u0022x\u0022:57.9,\u0022y\u0022:81.7},{\u0022x\u0022:20.2,\u0022y\u0022:91.8},{\u0022x\u0022:74.9,\u0022y\u0022:78.7},{\u0022x\u0022:79.7,\u0022y\u0022:78},{\u0022x\u0022:79.5,\u0022y\u0022:77.3},{\u0022x\u0022:90.8,\u0022y\u0022:90.4},{\u0022x\u0022:66.3,\u0022y\u0022:85.2},{\u0022x\u0022:68.3,\u0022y\u0022:67},{\u0022x\u0022:68.3,\u0022y\u0022:67},{\u0022x\u0022:29.5,\u0022y\u0022:53.2},{\u0022x\u0022:54.2,\u0022y\u0022:71.5},{\u0022x\u0022:69.3,\u0022y\u0022:80},{\u0022x\u0022:69.5,\u0022y\u0022:60.5},{\u0022x\u0022:61.3,\u0022y\u0022:91.4},{\u0022x\u0022:67.5,\u0022y\u0022:93.4},{\u0022x\u0022:69.5,\u0022y\u0022:90.8},{\u0022x\u0022:65.6,\u0022y\u0022:88.6},{\u0022x\u0022:75.1,\u0022y\u0022:71.4},{\u0022x\u0022:36.3,\u0022y\u0022:71.5},{\u0022x\u0022:30.8,\u0022y\u0022:68.3},{\u0022x\u0022:84.2,\u0022y\u0022:74.4},{\u0022x\u0022:71.5,\u0022y\u0022:63.8},{\u0022x\u0022:70.4,\u0022y\u0022:50.2},{\u0022x\u0022:86.4,\u0022y\u0022:42.7},{\u0022x\u0022:90.5,\u0022y\u0022:39.3},{\u0022x\u0022:41.7,\u0022y\u0022:93.4},{\u0022x\u0022:48.6,\u0022y\u0022:88.8},{\u0022x\u0022:48.1,\u0022y\u0022:92.3},{\u0022x\u0022:37.8,\u0022y\u0022:80.9},{\u0022x\u0022:38.7,\u0022y\u0022:67.3},{\u0022x\u0022:87.8,\u0022y\u0022:52.7},{\u0022x\u0022:88.7,\u0022y\u0022:44.7},{\u0022x\u0022:40.3,\u0022y\u0022:69},{\u0022x\u0022:64.7,\u0022y\u0022:90.3},{\u0022x\u0022:77.8,\u0022y\u0022:60.9},{\u0022x\u0022:73.5,\u0022y\u0022:66.4},{\u0022x\u0022:99.6,\u0022y\u0022:0.9},{\u0022x\u0022:63.6,\u0022y\u0022:73.2},{\u0022x\u0022:63.4,\u0022y\u0022:74.1},{\u0022x\u0022:69.9,\u0022y\u0022:73.2},{\u0022x\u0022:34.6,\u0022y\u0022:61.5},{\u0022x\u0022:99.6,\u0022y\u0022:99.6},{\u0022x\u0022:30.2,\u0022y\u0022:50.8},{\u0022x\u0022:35.7,\u0022y\u0022:78},{\u0022x\u0022:48.3,\u0022y\u0022:70.9},{\u0022x\u0022:50.1,\u0022y\u0022:70.2},{\u0022x\u0022:65.3,\u0022y\u0022:32.7},{\u0022x\u0022:84.4,\u0022y\u0022:61.2},{\u0022x\u0022:49.8,\u0022y\u0022:50.2},{\u0022x\u0022:49.4,\u0022y\u0022:94.6},{\u0022x\u0022:40.5,\u0022y\u0022:67.9},{\u0022x\u0022:70.3,\u0022y\u0022:64.8},{\u0022x\u0022:69.1,\u0022y\u0022:93.1},{\u0022x\u0022:34.4,\u0022y\u0022:69.6},{\u0022x\u0022:70.3,\u0022y\u0022:56.5},{\u0022x\u0022:54.2,\u0022y\u0022:93.9},{\u0022x\u0022:53.6,\u0022y\u0022:84.7},{\u0022x\u0022:62.5,\u0022y\u0022:73.6},{\u0022x\u0022:64.1,\u0022y\u0022:94.4},{\u0022x\u0022:69.8,\u0022y\u0022:76.5},{\u0022x\u0022:98.9,\u0022y\u0022:69.4},{\u0022x\u0022:80.3,\u0022y\u0022:62.1},{\u0022x\u0022:62.2,\u0022y\u0022:84.1},{\u0022x\u0022:67.2,\u0022y\u0022:61.3},{\u0022x\u0022:68.7,\u0022y\u0022:52.6},{\u0022x\u0022:59.4,\u0022y\u0022:70.5},{\u0022x\u0022:81.1,\u0022y\u0022:48.9},{\u0022x\u0022:99.5,\u0022y\u0022:0.5},{\u0022x\u0022:73.1,\u0022y\u0022:3.1},{\u0022x\u0022:74.5,\u0022y\u0022:89.1},{\u0022x\u0022:71.5,\u0022y\u0022:45.9},{\u0022x\u0022:77.4,\u0022y\u0022:35.8},{\u0022x\u0022:91.2,\u0022y\u0022:41.9},{\u0022x\u0022:72.7,\u0022y\u0022:71.4},{\u0022x\u0022:61.2,\u0022y\u0022:69.9},{\u0022x\u0022:71.5,\u0022y\u0022:58.6},{\u0022x\u0022:83.8,\u0022y\u0022:49},{\u0022x\u0022:78,\u0022y\u0022:66},{\u0022x\u0022:39.5,\u0022y\u0022:90.4},{\u0022x\u0022:55.7,\u0022y\u0022:86.1},{\u0022x\u0022:41.9,\u0022y\u0022:96.6},{\u0022x\u0022:36,\u0022y\u0022:46.6},{\u0022x\u0022:56.1,\u0022y\u0022:64.8},{\u0022x\u0022:47.9,\u0022y\u0022:55.6},{\u0022x\u0022:55.5,\u0022y\u0022:50.1},{\u0022x\u0022:57.7,\u0022y\u0022:88.2},{\u0022x\u0022:71.1,\u0022y\u0022:55},{\u0022x\u0022:81.3,\u0022y\u0022:33.7},{\u0022x\u0022:35.2,\u0022y\u0022:71.2},{\u0022x\u0022:49.8,\u0022y\u0022:33.7},{\u0022x\u0022:61.4,\u0022y\u0022:34.2},{\u0022x\u0022:70.6,\u0022y\u0022:58.5},{\u0022x\u0022:47.5,\u0022y\u0022:59.7},{\u0022x\u0022:66.7,\u0022y\u0022:46.8},{\u0022x\u0022:40.4,\u0022y\u0022:33.9},{\u0022x\u0022:77.3,\u0022y\u0022:47.2},{\u0022x\u0022:65.3,\u0022y\u0022:57.9},{\u0022x\u0022:74.5,\u0022y\u0022:44.5},{\u0022x\u0022:81.6,\u0022y\u0022:46.7},{\u0022x\u0022:78,\u0022y\u0022:50.7},{\u0022x\u0022:53.6,\u0022y\u0022:49},{\u0022x\u0022:40.1,\u0022y\u0022:64.8},{\u0022x\u0022:55.3,\u0022y\u0022:41.4},{\u0022x\u0022:68.3,\u0022y\u0022:52},{\u0022x\u0022:87.7,\u0022y\u0022:45.8},{\u0022x\u0022:37.8,\u0022y\u0022:76.5},{\u0022x\u0022:60.8,\u0022y\u0022:80.7},{\u0022x\u0022:70.5,\u0022y\u0022:65.7},{\u0022x\u0022:99.7,\u0022y\u0022:99.4},{\u0022x\u0022:78.7,\u0022y\u0022:49.8},{\u0022x\u0022:89.7,\u0022y\u0022:47.4},{\u0022x\u0022:88.3,\u0022y\u0022:47.4},{\u0022x\u0022:99.7,\u0022y\u0022:99.7},{\u0022x\u0022:91.4,\u0022y\u0022:84.1},{\u0022x\u0022:91.2,\u0022y\u0022:80},{\u0022x\u0022:72.8,\u0022y\u0022:69.8},{\u0022x\u0022:64.1,\u0022y\u0022:67.6},{\u0022x\u0022:78,\u0022y\u0022:69.3},{\u0022x\u0022:73.4,\u0022y\u0022:29.9},{\u0022x\u0022:99.5,\u0022y\u0022:0.5},{\u0022x\u0022:54.1,\u0022y\u0022:86.4},{\u0022x\u0022:99.4,\u0022y\u0022:99.2},{\u0022x\u0022:66,\u0022y\u0022:85.7},{\u0022x\u0022:65,\u0022y\u0022:77.6},{\u0022x\u0022:64.4,\u0022y\u0022:43.4},{\u0022x\u0022:78.1,\u0022y\u0022:35.4},{\u0022x\u0022:74.3,\u0022y\u0022:49.8},{\u0022x\u0022:61.7,\u0022y\u0022:89},{\u0022x\u0022:77.7,\u0022y\u0022:73.8},{\u0022x\u0022:84.6,\u0022y\u0022:58},{\u0022x\u0022:69.3,\u0022y\u0022:66.3},{\u0022x\u0022:73.9,\u0022y\u0022:63.3},{\u0022x\u0022:93,\u0022y\u0022:57.9},{\u0022x\u0022:46.4,\u0022y\u0022:52.9},{\u0022x\u0022:80.2,\u0022y\u0022:34.8},{\u0022x\u0022:91.4,\u0022y\u0022:4},{\u0022x\u0022:57.8,\u0022y\u0022:9.8},{\u0022x\u0022:56.2,\u0022y\u0022:10},{\u0022x\u0022:71.2,\u0022y\u0022:48.2},{\u0022x\u0022:62.2,\u0022y\u0022:42.2},{\u0022x\u0022:64,\u0022y\u0022:43.7},{\u0022x\u0022:56.8,\u0022y\u0022:59.5},{\u0022x\u0022:79.1,\u0022y\u0022:74.7},{\u0022x\u0022:92.6,\u0022y\u0022:49.2},{\u0022x\u0022:66.7,\u0022y\u0022:91},{\u0022x\u0022:64.8,\u0022y\u0022:79.5},{\u0022x\u0022:77.5,\u0022y\u0022:59.6},{\u0022x\u0022:65.3,\u0022y\u0022:77.5},{\u0022x\u0022:86.2,\u0022y\u0022:67.8},{\u0022x\u0022:84.9,\u0022y\u0022:57.5},{\u0022x\u0022:70.7,\u0022y\u0022:64.7},{\u0022x\u0022:57,\u0022y\u0022:66.3},{\u0022x\u0022:54,\u0022y\u0022:57.8},{\u0022x\u0022:91,\u0022y\u0022:48.8},{\u0022x\u0022:44.3,\u0022y\u0022:94.9},{\u0022x\u0022:66.5,\u0022y\u0022:93.6},{\u0022x\u0022:61.6,\u0022y\u0022:57.4},{\u0022x\u0022:42.4,\u0022y\u0022:43.3},{\u0022x\u0022:77.5,\u0022y\u0022:61.5},{\u0022x\u0022:48.9,\u0022y\u0022:96.8},{\u0022x\u0022:54.3,\u0022y\u0022:51.7},{\u0022x\u0022:79.9,\u0022y\u0022:56.6},{\u0022x\u0022:70.4,\u0022y\u0022:63.8},{\u0022x\u0022:72.5,\u0022y\u0022:61.4},{\u0022x\u0022:88.5,\u0022y\u0022:65.9},{\u0022x\u0022:80.5,\u0022y\u0022:46.2},{\u0022x\u0022:72.7,\u0022y\u0022:59.8},{\u0022x\u0022:72.3,\u0022y\u0022:71},{\u0022x\u0022:99.5,\u0022y\u0022:99.5},{\u0022x\u0022:80.1,\u0022y\u0022:76.8},{\u0022x\u0022:63.2,\u0022y\u0022:73.1},{\u0022x\u0022:40.8,\u0022y\u0022:67.7},{\u0022x\u0022:34,\u0022y\u0022:86.4},{\u0022x\u0022:70.4,\u0022y\u0022:47},{\u0022x\u0022:72.6,\u0022y\u0022:31.1},{\u0022x\u0022:38.7,\u0022y\u0022:10.8},{\u0022x\u0022:40,\u0022y\u0022:41.9},{\u0022x\u0022:46,\u0022y\u0022:23.5},{\u0022x\u0022:72.1,\u0022y\u0022:14.2},{\u0022x\u0022:54.4,\u0022y\u0022:56.7},{\u0022x\u0022:64,\u0022y\u0022:65.9},{\u0022x\u0022:72.3,\u0022y\u0022:49.7},{\u0022x\u0022:93.2,\u0022y\u0022:87.2},{\u0022x\u0022:59.4,\u0022y\u0022:65.9},{\u0022x\u0022:61,\u0022y\u0022:53.5},{\u0022x\u0022:59.6,\u0022y\u0022:40.4},{\u0022x\u0022:56.3,\u0022y\u0022:36},{\u0022x\u0022:69,\u0022y\u0022:76.4},{\u0022x\u0022:56.5,\u0022y\u0022:72.7},{\u0022x\u0022:53.2,\u0022y\u0022:65.1},{\u0022x\u0022:78.5,\u0022y\u0022:93},{\u0022x\u0022:27,\u0022y\u0022:55.3},{\u0022x\u0022:70.1,\u0022y\u0022:38.4},{\u0022x\u0022:23.4,\u0022y\u0022:53.8},{\u0022x\u0022:33.4,\u0022y\u0022:77.3},{\u0022x\u0022:47.1,\u0022y\u0022:92.7},{\u0022x\u0022:32.7,\u0022y\u0022:62.5},{\u0022x\u0022:32,\u0022y\u0022:70.9},{\u0022x\u0022:37.1,\u0022y\u0022:62},{\u0022x\u0022:92.3,\u0022y\u0022:40.4},{\u0022x\u0022:52,\u0022y\u0022:85.1},{\u0022x\u0022:59.2,\u0022y\u0022:73},{\u0022x\u0022:70.7,\u0022y\u0022:72.1},{\u0022x\u0022:75.8,\u0022y\u0022:61},{\u0022x\u0022:81.3,\u0022y\u0022:50.9},{\u0022x\u0022:99.7,\u0022y\u0022:0.7},{\u0022x\u0022:66.7,\u0022y\u0022:37.5},{\u0022x\u0022:18.3,\u0022y\u0022:90.4},{\u0022x\u0022:62.1,\u0022y\u0022:59.5},{\u0022x\u0022:35.8,\u0022y\u0022:54},{\u0022x\u0022:28.4,\u0022y\u0022:30.6},{\u0022x\u0022:79,\u0022y\u0022:36.3},{\u0022x\u0022:47.6,\u0022y\u0022:49.1},{\u0022x\u0022:53.8,\u0022y\u0022:49.3},{\u0022x\u0022:77.6,\u0022y\u0022:53.5},{\u0022x\u0022:31.6,\u0022y\u0022:88.3},{\u0022x\u0022:36,\u0022y\u0022:73.8},{\u0022x\u0022:49.9,\u0022y\u0022:50.2},{\u0022x\u0022:56.3,\u0022y\u0022:71.1},{\u0022x\u0022:68.2,\u0022y\u0022:47.7},{\u0022x\u0022:46.3,\u0022y\u0022:97.1},{\u0022x\u0022:40.1,\u0022y\u0022:88.2},{\u0022x\u0022:65.6,\u0022y\u0022:58.2},{\u0022x\u0022:73.6,\u0022y\u0022:64.6},{\u0022x\u0022:27.9,\u0022y\u0022:70.3},{\u0022x\u0022:27.9,\u0022y\u0022:70.3},{\u0022x\u0022:32.7,\u0022y\u0022:53},{\u0022x\u0022:59.3,\u0022y\u0022:62.9},{\u0022x\u0022:62.1,\u0022y\u0022:49.2},{\u0022x\u0022:86.2,\u0022y\u0022:68.8},{\u0022x\u0022:93.9,\u0022y\u0022:60.2},{\u0022x\u0022:72.3,\u0022y\u0022:66.3},{\u0022x\u0022:74.3,\u0022y\u0022:83.9},{\u0022x\u0022:75.5,\u0022y\u0022:79.2},{\u0022x\u0022:73.4,\u0022y\u0022:77.8},{\u0022x\u0022:77.2,\u0022y\u0022:75.3},{\u0022x\u0022:48.3,\u0022y\u0022:43.8},{\u0022x\u0022:75.8,\u0022y\u0022:70.3},{\u0022x\u0022:99.5,\u0022y\u0022:99.5},{\u0022x\u0022:47.1,\u0022y\u0022:84.2},{\u0022x\u0022:84.1,\u0022y\u0022:47.5},{\u0022x\u0022:27.7,\u0022y\u0022:61.9},{\u0022x\u0022:27.7,\u0022y\u0022:61.9},{\u0022x\u0022:40.9,\u0022y\u0022:90.1},{\u0022x\u0022:58.2,\u0022y\u0022:72.1},{\u0022x\u0022:32.4,\u0022y\u0022:92},{\u0022x\u0022:71.2,\u0022y\u0022:73.5},{\u0022x\u0022:87.6,\u0022y\u0022:64},{\u0022x\u0022:89.1,\u0022y\u0022:63.2},{\u0022x\u0022:88.9,\u0022y\u0022:37.6},{\u0022x\u0022:72.4,\u0022y\u0022:91.3},{\u0022x\u0022:71.1,\u0022y\u0022:67.4},{\u0022x\u0022:69.9,\u0022y\u0022:67.8},{\u0022x\u0022:76,\u0022y\u0022:58.9},{\u0022x\u0022:90.8,\u0022y\u0022:46.6},{\u0022x\u0022:75.8,\u0022y\u0022:46.5},{\u0022x\u0022:69,\u0022y\u0022:63.8},{\u0022x\u0022:68.1,\u0022y\u0022:69.6},{\u0022x\u0022:75.8,\u0022y\u0022:67.2},{\u0022x\u0022:73.3,\u0022y\u0022:68.6},{\u0022x\u0022:66.1,\u0022y\u0022:71.3},{\u0022x\u0022:83.8,\u0022y\u0022:70.6},{\u0022x\u0022:53.9,\u0022y\u0022:97.5},{\u0022x\u0022:65,\u0022y\u0022:69.8},{\u0022x\u0022:64,\u0022y\u0022:65.4},{\u0022x\u0022:71.3,\u0022y\u0022:41.8},{\u0022x\u0022:76,\u0022y\u0022:41.3},{\u0022x\u0022:99.5,\u0022y\u0022:0.5},{\u0022x\u0022:86.8,\u0022y\u0022:6.2},{\u0022x\u0022:77.7,\u0022y\u0022:42.3},{\u0022x\u0022:80.3,\u0022y\u0022:49.5},{\u0022x\u0022:74.4,\u0022y\u0022:53.2},{\u0022x\u0022:80.1,\u0022y\u0022:62.9},{\u0022x\u0022:46.2,\u0022y\u0022:56.7},{\u0022x\u0022:70.8,\u0022y\u0022:72.6},{\u0022x\u0022:75.9,\u0022y\u0022:41.1},{\u0022x\u0022:74.7,\u0022y\u0022:68.6},{\u0022x\u0022:86.1,\u0022y\u0022:64.8},{\u0022x\u0022:88.8,\u0022y\u0022:57.6},{\u0022x\u0022:81.3,\u0022y\u0022:49.9},{\u0022x\u0022:62.7,\u0022y\u0022:51},{\u0022x\u0022:74.9,\u0022y\u0022:54.9},{\u0022x\u0022:63.6,\u0022y\u0022:48},{\u0022x\u0022:56.4,\u0022y\u0022:39.3},{\u0022x\u0022:67.8,\u0022y\u0022:62.1},{\u0022x\u0022:66.4,\u0022y\u0022:84.4},{\u0022x\u0022:68.7,\u0022y\u0022:97.3},{\u0022x\u0022:64.8,\u0022y\u0022:76.5},{\u0022x\u0022:45.7,\u0022y\u0022:51.8},{\u0022x\u0022:73,\u0022y\u0022:59.4},{\u0022x\u0022:67.2,\u0022y\u0022:53.2},{\u0022x\u0022:67.4,\u0022y\u0022:52.9},{\u0022x\u0022:85.5,\u0022y\u0022:55},{\u0022x\u0022:99.7,\u0022y\u0022:99.5},{\u0022x\u0022:87.3,\u0022y\u0022:95},{\u0022x\u0022:84.7,\u0022y\u0022:76.2},{\u0022x\u0022:72.3,\u0022y\u0022:74},{\u0022x\u0022:84.3,\u0022y\u0022:65.3},{\u0022x\u0022:90.3,\u0022y\u0022:8.2},{\u0022x\u0022:86.6,\u0022y\u0022:33.1},{\u0022x\u0022:54.3,\u0022y\u0022:36.1},{\u0022x\u0022:49.6,\u0022y\u0022:50.4},{\u0022x\u0022:62.2,\u0022y\u0022:37.3},{\u0022x\u0022:63.6,\u0022y\u0022:52.4},{\u0022x\u0022:67,\u0022y\u0022:52.8},{\u0022x\u0022:68.2,\u0022y\u0022:51.8},{\u0022x\u0022:72.9,\u0022y\u0022:65.1},{\u0022x\u0022:83.9,\u0022y\u0022:63.6},{\u0022x\u0022:62.8,\u0022y\u0022:83.2},{\u0022x\u0022:75.5,\u0022y\u0022:60},{\u0022x\u0022:99.5,\u0022y\u0022:99.5},{\u0022x\u0022:53.3,\u0022y\u0022:95.9},{\u0022x\u0022:58,\u0022y\u0022:100},{\u0022x\u0022:71.6,\u0022y\u0022:63},{\u0022x\u0022:55.2,\u0022y\u0022:44.8},{\u0022x\u0022:77.5,\u0022y\u0022:59},{\u0022x\u0022:73.9,\u0022y\u0022:54},{\u0022x\u0022:99.5,\u0022y\u0022:99.5},{\u0022x\u0022:74.6,\u0022y\u0022:92},{\u0022x\u0022:61.5,\u0022y\u0022:91.7},{\u0022x\u0022:60.9,\u0022y\u0022:90.9},{\u0022x\u0022:90.8,\u0022y\u0022:89},{\u0022x\u0022:81.8,\u0022y\u0022:52.8},{\u0022x\u0022:99.6,\u0022y\u0022:99.5},{\u0022x\u0022:45.3,\u0022y\u0022:84.2},{\u0022x\u0022:42,\u0022y\u0022:85.6},{\u0022x\u0022:59.8,\u0022y\u0022:86.2},{\u0022x\u0022:75.2,\u0022y\u0022:84.1},{\u0022x\u0022:59.8,\u0022y\u0022:67.9},{\u0022x\u0022:66.8,\u0022y\u0022:54},{\u0022x\u0022:66.8,\u0022y\u0022:55.2},{\u0022x\u0022:71.2,\u0022y\u0022:70.2},{\u0022x\u0022:36.4,\u0022y\u0022:70},{\u0022x\u0022:77.6,\u0022y\u0022:82.2},{\u0022x\u0022:73.3,\u0022y\u0022:53.1},{\u0022x\u0022:70.5,\u0022y\u0022:60.5},{\u0022x\u0022:69,\u0022y\u0022:60.6},{\u0022x\u0022:55.2,\u0022y\u0022:91.8},{\u0022x\u0022:87.8,\u0022y\u0022:77.1},{\u0022x\u0022:71.5,\u0022y\u0022:87.1},{\u0022x\u0022:79.7,\u0022y\u0022:77.2},{\u0022x\u0022:87.1,\u0022y\u0022:60},{\u0022x\u0022:47.9,\u0022y\u0022:62.1},{\u0022x\u0022:69.9,\u0022y\u0022:66},{\u0022x\u0022:78.3,\u0022y\u0022:53.4},{\u0022x\u0022:75.8,\u0022y\u0022:79.7},{\u0022x\u0022:76.4,\u0022y\u0022:48.5},{\u0022x\u0022:72.5,\u0022y\u0022:55.2},{\u0022x\u0022:78.7,\u0022y\u0022:49.5},{\u0022x\u0022:47.1,\u0022y\u0022:90.3},{\u0022x\u0022:44.5,\u0022y\u0022:82.3},{\u0022x\u0022:86.6,\u0022y\u0022:64.6},{\u0022x\u0022:86,\u0022y\u0022:64.9},{\u0022x\u0022:83.8,\u0022y\u0022:61.4},{\u0022x\u0022:75.7,\u0022y\u0022:70.6},{\u0022x\u0022:76.8,\u0022y\u0022:64.2},{\u0022x\u0022:54.8,\u0022y\u0022:88.1},{\u0022x\u0022:55.7,\u0022y\u0022:85.9},{\u0022x\u0022:74.9,\u0022y\u0022:69.6},{\u0022x\u0022:86.2,\u0022y\u0022:48.8},{\u0022x\u0022:42.8,\u0022y\u0022:79.1},{\u0022x\u0022:40.6,\u0022y\u0022:84.2},{\u0022x\u0022:41,\u0022y\u0022:84.2},{\u0022x\u0022:40.7,\u0022y\u0022:88.3},{\u0022x\u0022:67.7,\u0022y\u0022:33.7},{\u0022x\u0022:69.9,\u0022y\u0022:80.2},{\u0022x\u0022:57.2,\u0022y\u0022:56.9},{\u0022x\u0022:71.5,\u0022y\u0022:58.4},{\u0022x\u0022:85,\u0022y\u0022:52},{\u0022x\u0022:89.9,\u0022y\u0022:64.8},{\u0022x\u0022:99.5,\u0022y\u0022:99.5},{\u0022x\u0022:53.9,\u0022y\u0022:89.4},{\u0022x\u0022:71.9,\u0022y\u0022:67.8},{\u0022x\u0022:50.4,\u0022y\u0022:50},{\u0022x\u0022:82.8,\u0022y\u0022:74.1},{\u0022x\u0022:83.4,\u0022y\u0022:65.5},{\u0022x\u0022:27.3,\u0022y\u0022:69.7},{\u0022x\u0022:31.9,\u0022y\u0022:63.8},{\u0022x\u0022:57,\u0022y\u0022:86.8},{\u0022x\u0022:64.1,\u0022y\u0022:97},{\u0022x\u0022:99.5,\u0022y\u0022:99.5},{\u0022x\u0022:86.9,\u0022y\u0022:95.5},{\u0022x\u0022:87,\u0022y\u0022:62.8},{\u0022x\u0022:88,\u0022y\u0022:67.3},{\u0022x\u0022:70.2,\u0022y\u0022:37.1},{\u0022x\u0022:73.8,\u0022y\u0022:45},{\u0022x\u0022:30.1,\u0022y\u0022:93.5},{\u0022x\u0022:62.7,\u0022y\u0022:88.4},{\u0022x\u0022:66.1,\u0022y\u0022:54.5},{\u0022x\u0022:65.3,\u0022y\u0022:50.3},{\u0022x\u0022:99.5,\u0022y\u0022:99.5},{\u0022x\u0022:72.9,\u0022y\u0022:32.5},{\u0022x\u0022:81.8,\u0022y\u0022:49},{\u0022x\u0022:70.2,\u0022y\u0022:51.1},{\u0022x\u0022:73.4,\u0022y\u0022:38.9},{\u0022x\u0022:99.5,\u0022y\u0022:99.5},{\u0022x\u0022:62.5,\u0022y\u0022:44.4},{\u0022x\u0022:88.1,\u0022y\u0022:36.4},{\u0022x\u0022:70.3,\u0022y\u0022:53},{\u0022x\u0022:46.6,\u0022y\u0022:53.6},{\u0022x\u0022:82.3,\u0022y\u0022:53.6},{\u0022x\u0022:93.3,\u0022y\u0022:34.4},{\u0022x\u0022:99.5,\u0022y\u0022:0.5},{\u0022x\u0022:68.5,\u0022y\u0022:33.1},{\u0022x\u0022:99.5,\u0022y\u0022:0.5},{\u0022x\u0022:77.5,\u0022y\u0022:52.3},{\u0022x\u0022:59.9,\u0022y\u0022:83.8},{\u0022x\u0022:59.2,\u0022y\u0022:83.4},{\u0022x\u0022:36.6,\u0022y\u0022:72.9},{\u0022x\u0022:66.5,\u0022y\u0022:30.3},{\u0022x\u0022:40.1,\u0022y\u0022:94},{\u0022x\u0022:61.6,\u0022y\u0022:43.6},{\u0022x\u0022:96,\u0022y\u0022:24.7},{\u0022x\u0022:90,\u0022y\u0022:16},{\u0022x\u0022:52.9,\u0022y\u0022:33},{\u0022x\u0022:60.4,\u0022y\u0022:20.3},{\u0022x\u0022:73.5,\u0022y\u0022:20.3},{\u0022x\u0022:65.2,\u0022y\u0022:75.3},{\u0022x\u0022:71.7,\u0022y\u0022:43},{\u0022x\u0022:66.2,\u0022y\u0022:45.9},{\u0022x\u0022:87.1,\u0022y\u0022:37.4},{\u0022x\u0022:73.2,\u0022y\u0022:44.4},{\u0022x\u0022:69,\u0022y\u0022:43},{\u0022x\u0022:71.1,\u0022y\u0022:38.3},{\u0022x\u0022:68.8,\u0022y\u0022:73.9},{\u0022x\u0022:79.6,\u0022y\u0022:89.1},{\u0022x\u0022:91.8,\u0022y\u0022:74.4},{\u0022x\u0022:99.5,\u0022y\u0022:99.5},{\u0022x\u0022:94.4,\u0022y\u0022:80.1},{\u0022x\u0022:71.7,\u0022y\u0022:56.4},{\u0022x\u0022:86.4,\u0022y\u0022:36},{\u0022x\u0022:87.2,\u0022y\u0022:36.4},{\u0022x\u0022:42,\u0022y\u0022:67.9},{\u0022x\u0022:50.5,\u0022y\u0022:49.2},{\u0022x\u0022:69.6,\u0022y\u0022:51.4},{\u0022x\u0022:90.8,\u0022y\u0022:54.2},{\u0022x\u0022:76.7,\u0022y\u0022:63.4},{\u0022x\u0022:69.6,\u0022y\u0022:58},{\u0022x\u0022:70.1,\u0022y\u0022:56.7},{\u0022x\u0022:42.7,\u0022y\u0022:45.1},{\u0022x\u0022:39,\u0022y\u0022:56.5},{\u0022x\u0022:42.9,\u0022y\u0022:40},{\u0022x\u0022:34.6,\u0022y\u0022:65.5},{\u0022x\u0022:31.4,\u0022y\u0022:72.9},{\u0022x\u0022:69.6,\u0022y\u0022:76},{\u0022x\u0022:66.9,\u0022y\u0022:86.1},{\u0022x\u0022:57,\u0022y\u0022:60.4},{\u0022x\u0022:52.8,\u0022y\u0022:59.7},{\u0022x\u0022:55,\u0022y\u0022:64.2},{\u0022x\u0022:69.6,\u0022y\u0022:39},{\u0022x\u0022:99.5,\u0022y\u0022:0.5},{\u0022x\u0022:71.5,\u0022y\u0022:46.2},{\u0022x\u0022:77.3,\u0022y\u0022:56.4},{\u0022x\u0022:76.5,\u0022y\u0022:93.1},{\u0022x\u0022:72.2,\u0022y\u0022:51.7},{\u0022x\u0022:38.5,\u0022y\u0022:36.6},{\u0022x\u0022:36.2,\u0022y\u0022:35.1},{\u0022x\u0022:55.7,\u0022y\u0022:69.1},{\u0022x\u0022:70.9,\u0022y\u0022:87.4},{\u0022x\u0022:70.1,\u0022y\u0022:75.8},{\u0022x\u0022:56,\u0022y\u0022:56.5},{\u0022x\u0022:56,\u0022y\u0022:56.5},{\u0022x\u0022:57.1,\u0022y\u0022:46.6},{\u0022x\u0022:74.8,\u0022y\u0022:69.9},{\u0022x\u0022:79.4,\u0022y\u0022:57},{\u0022x\u0022:57.6,\u0022y\u0022:64},{\u0022x\u0022:58.3,\u0022y\u0022:69},{\u0022x\u0022:68.1,\u0022y\u0022:38.2},{\u0022x\u0022:38.1,\u0022y\u0022:71.4},{\u0022x\u0022:52,\u0022y\u0022:58.6},{\u0022x\u0022:44.2,\u0022y\u0022:51.4},{\u0022x\u0022:99.5,\u0022y\u0022:0.5},{\u0022x\u0022:99.6,\u0022y\u0022:99.6},{\u0022x\u0022:45.4,\u0022y\u0022:71.1},{\u0022x\u0022:61.2,\u0022y\u0022:88.2},{\u0022x\u0022:39.1,\u0022y\u0022:41.2},{\u0022x\u0022:42.3,\u0022y\u0022:41.5},{\u0022x\u0022:85.9,\u0022y\u0022:51.9},{\u0022x\u0022:37.3,\u0022y\u0022:45.9},{\u0022x\u0022:27.4,\u0022y\u0022:87.6},{\u0022x\u0022:27.3,\u0022y\u0022:93.3},{\u0022x\u0022:77.8,\u0022y\u0022:48.6},{\u0022x\u0022:69.1,\u0022y\u0022:64.6},{\u0022x\u0022:68.8,\u0022y\u0022:72},{\u0022x\u0022:59.4,\u0022y\u0022:73.2},{\u0022x\u0022:72.4,\u0022y\u0022:61.8},{\u0022x\u0022:64.5,\u0022y\u0022:50.7},{\u0022x\u0022:72.8,\u0022y\u0022:6.6},{\u0022x\u0022:84.9,\u0022y\u0022:31.9},{\u0022x\u0022:89,\u0022y\u0022:43.8},{\u0022x\u0022:99.5,\u0022y\u0022:99.7},{\u0022x\u0022:99.7,\u0022y\u0022:99.7},{\u0022x\u0022:43.2,\u0022y\u0022:73.3},{\u0022x\u0022:54.9,\u0022y\u0022:63.7},{\u0022x\u0022:74.8,\u0022y\u0022:45.1},{\u0022x\u0022:64.5,\u0022y\u0022:35.2},{\u0022x\u0022:72.3,\u0022y\u0022:33.4},{\u0022x\u0022:80.9,\u0022y\u0022:36.6},{\u0022x\u0022:58.5,\u0022y\u0022:86.3},{\u0022x\u0022:63.1,\u0022y\u0022:88.7},{\u0022x\u0022:78.8,\u0022y\u0022:88.7},{\u0022x\u0022:62.1,\u0022y\u0022:59.2},{\u0022x\u0022:81,\u0022y\u0022:48.6},{\u0022x\u0022:73.6,\u0022y\u0022:56.6},{\u0022x\u0022:76.5,\u0022y\u0022:80.9},{\u0022x\u0022:74.2,\u0022y\u0022:31.9},{\u0022x\u0022:99.5,\u0022y\u0022:99.5},{\u0022x\u0022:61.8,\u0022y\u0022:67.4},{\u0022x\u0022:76.2,\u0022y\u0022:83.2},{\u0022x\u0022:66.2,\u0022y\u0022:63.5},{\u0022x\u0022:69.1,\u0022y\u0022:67.4},{\u0022x\u0022:82.4,\u0022y\u0022:84.8},{\u0022x\u0022:69.4,\u0022y\u0022:76.2},{\u0022x\u0022:80.2,\u0022y\u0022:37.8},{\u0022x\u0022:85.3,\u0022y\u0022:57.5},{\u0022x\u0022:99.5,\u0022y\u0022:99.5},{\u0022x\u0022:87,\u0022y\u0022:88.7},{\u0022x\u0022:56.2,\u0022y\u0022:62.7},{\u0022x\u0022:69.8,\u0022y\u0022:54.8},{\u0022x\u0022:80.2,\u0022y\u0022:48.9},{\u0022x\u0022:57.7,\u0022y\u0022:86.7},{\u0022x\u0022:67.6,\u0022y\u0022:83},{\u0022x\u0022:77.4,\u0022y\u0022:66.7},{\u0022x\u0022:69.4,\u0022y\u0022:77},{\u0022x\u0022:71.2,\u0022y\u0022:61.9},{\u0022x\u0022:78.4,\u0022y\u0022:57},{\u0022x\u0022:89,\u0022y\u0022:56.8},{\u0022x\u0022:92.6,\u0022y\u0022:59.7},{\u0022x\u0022:58.4,\u0022y\u0022:69.1},{\u0022x\u0022:65.4,\u0022y\u0022:57.4},{\u0022x\u0022:65.4,\u0022y\u0022:75.9},{\u0022x\u0022:82.3,\u0022y\u0022:60.1},{\u0022x\u0022:75.6,\u0022y\u0022:75.2},{\u0022x\u0022:35.8,\u0022y\u0022:78.3},{\u0022x\u0022:62.2,\u0022y\u0022:75.9},{\u0022x\u0022:87.8,\u0022y\u0022:35.3},{\u0022x\u0022:55.2,\u0022y\u0022:33.4},{\u0022x\u0022:53.6,\u0022y\u0022:41.1},{\u0022x\u0022:63,\u0022y\u0022:85.9},{\u0022x\u0022:88.4,\u0022y\u0022:75.9},{\u0022x\u0022:93.3,\u0022y\u0022:79.9},{\u0022x\u0022:49.4,\u0022y\u0022:80.5},{\u0022x\u0022:87.5,\u0022y\u0022:56.6},{\u0022x\u0022:58.2,\u0022y\u0022:86.4},{\u0022x\u0022:74,\u0022y\u0022:70},{\u0022x\u0022:90.1,\u0022y\u0022:65},{\u0022x\u0022:78.4,\u0022y\u0022:49.9},{\u0022x\u0022:79.1,\u0022y\u0022:46.4},{\u0022x\u0022:45.5,\u0022y\u0022:77.8},{\u0022x\u0022:53.1,\u0022y\u0022:65.1},{\u0022x\u0022:64,\u0022y\u0022:76.3},{\u0022x\u0022:68,\u0022y\u0022:89.1},{\u0022x\u0022:63.7,\u0022y\u0022:96.8},{\u0022x\u0022:54.6,\u0022y\u0022:59.1},{\u0022x\u0022:18.1,\u0022y\u0022:90},{\u0022x\u0022:55.8,\u0022y\u0022:48.2},{\u0022x\u0022:84.7,\u0022y\u0022:32.1},{\u0022x\u0022:90,\u0022y\u0022:25.4},{\u0022x\u0022:99.5,\u0022y\u0022:0.5},{\u0022x\u0022:78.9,\u0022y\u0022:3.8},{\u0022x\u0022:51.5,\u0022y\u0022:89.6},{\u0022x\u0022:49.1,\u0022y\u0022:90.8},{\u0022x\u0022:54,\u0022y\u0022:92.2},{\u0022x\u0022:51,\u0022y\u0022:89},{\u0022x\u0022:65.5,\u0022y\u0022:64.8},{\u0022x\u0022:74.4,\u0022y\u0022:82.3},{\u0022x\u0022:73.5,\u0022y\u0022:18.2},{\u0022x\u0022:52.5,\u0022y\u0022:76.3},{\u0022x\u0022:55.2,\u0022y\u0022:66.9},{\u0022x\u0022:46.2,\u0022y\u0022:56.7},{\u0022x\u0022:53.9,\u0022y\u0022:89.6},{\u0022x\u0022:75.3,\u0022y\u0022:52.4},{\u0022x\u0022:63.3,\u0022y\u0022:93.5},{\u0022x\u0022:52.3,\u0022y\u0022:93.2},{\u0022x\u0022:47.3,\u0022y\u0022:93.9},{\u0022x\u0022:61,\u0022y\u0022:91.2},{\u0022x\u0022:67.3,\u0022y\u0022:100},{\u0022x\u0022:50.1,\u0022y\u0022:50.1},{\u0022x\u0022:75.7,\u0022y\u0022:74.8},{\u0022x\u0022:70.5,\u0022y\u0022:63.1},{\u0022x\u0022:67,\u0022y\u0022:51.6},{\u0022x\u0022:67.6,\u0022y\u0022:67},{\u0022x\u0022:62.6,\u0022y\u0022:65.8},{\u0022x\u0022:58.8,\u0022y\u0022:69.3},{\u0022x\u0022:73.1,\u0022y\u0022:48.2},{\u0022x\u0022:34.5,\u0022y\u0022:84.7},{\u0022x\u0022:40.6,\u0022y\u0022:81.4},{\u0022x\u0022:50.2,\u0022y\u0022:50.4},{\u0022x\u0022:71.2,\u0022y\u0022:55},{\u0022x\u0022:50.1,\u0022y\u0022:50.1},{\u0022x\u0022:75.9,\u0022y\u0022:87.4},{\u0022x\u0022:99.5,\u0022y\u0022:99.5},{\u0022x\u0022:65.7,\u0022y\u0022:72.1},{\u0022x\u0022:38.7,\u0022y\u0022:93.3},{\u0022x\u0022:48.2,\u0022y\u0022:78.5},{\u0022x\u0022:67.3,\u0022y\u0022:49.6},{\u0022x\u0022:65.5,\u0022y\u0022:57.8},{\u0022x\u0022:55.8,\u0022y\u0022:33.4},{\u0022x\u0022:59.1,\u0022y\u0022:33},{\u0022x\u0022:85.9,\u0022y\u0022:59.9},{\u0022x\u0022:83.8,\u0022y\u0022:41.3},{\u0022x\u0022:68.1,\u0022y\u0022:85},{\u0022x\u0022:85.7,\u0022y\u0022:82.7},{\u0022x\u0022:89.9,\u0022y\u0022:82.1},{\u0022x\u0022:61.3,\u0022y\u0022:88.9},{\u0022x\u0022:63.2,\u0022y\u0022:92.3},{\u0022x\u0022:85.1,\u0022y\u0022:68.9},{\u0022x\u0022:62,\u0022y\u0022:78.2},{\u0022x\u0022:57.8,\u0022y\u0022:79.4},{\u0022x\u0022:70.9,\u0022y\u0022:56.4},{\u0022x\u0022:66.8,\u0022y\u0022:50.4},{\u0022x\u0022:43.8,\u0022y\u0022:72.9},{\u0022x\u0022:70.4,\u0022y\u0022:72.1},{\u0022x\u0022:44.8,\u0022y\u0022:42.2},{\u0022x\u0022:77.6,\u0022y\u0022:67.6},{\u0022x\u0022:57.5,\u0022y\u0022:69.4},{\u0022x\u0022:53.9,\u0022y\u0022:63.6},{\u0022x\u0022:67.9,\u0022y\u0022:95},{\u0022x\u0022:60.4,\u0022y\u0022:87.8},{\u0022x\u0022:90.3,\u0022y\u0022:63.8},{\u0022x\u0022:44.5,\u0022y\u0022:48.2},{\u0022x\u0022:36.7,\u0022y\u0022:90.8},{\u0022x\u0022:33.5,\u0022y\u0022:74.7},{\u0022x\u0022:41.1,\u0022y\u0022:93.6},{\u0022x\u0022:54.1,\u0022y\u0022:54.8},{\u0022x\u0022:58.8,\u0022y\u0022:48.1},{\u0022x\u0022:36.6,\u0022y\u0022:95.7},{\u0022x\u0022:34.6,\u0022y\u0022:96.5},{\u0022x\u0022:34.2,\u0022y\u0022:92.7},{\u0022x\u0022:99.5,\u0022y\u0022:0.5},{\u0022x\u0022:52.1,\u0022y\u0022:40.9},{\u0022x\u0022:81.8,\u0022y\u0022:56.3},{\u0022x\u0022:81.9,\u0022y\u0022:56.6},{\u0022x\u0022:55.5,\u0022y\u0022:50.7},{\u0022x\u0022:77.8,\u0022y\u0022:25.8},{\u0022x\u0022:47.5,\u0022y\u0022:66.9},{\u0022x\u0022:45,\u0022y\u0022:92.7},{\u0022x\u0022:62.4,\u0022y\u0022:87.5},{\u0022x\u0022:32.5,\u0022y\u0022:64.9},{\u0022x\u0022:69.9,\u0022y\u0022:61.3},{\u0022x\u0022:43.1,\u0022y\u0022:90.8},{\u0022x\u0022:74.2,\u0022y\u0022:100},{\u0022x\u0022:64.4,\u0022y\u0022:77.7},{\u0022x\u0022:79.7,\u0022y\u0022:54.2},{\u0022x\u0022:79.8,\u0022y\u0022:54.2},{\u0022x\u0022:78.2,\u0022y\u0022:54},{\u0022x\u0022:70.1,\u0022y\u0022:57},{\u0022x\u0022:84,\u0022y\u0022:91.2},{\u0022x\u0022:45.1,\u0022y\u0022:54},{\u0022x\u0022:72,\u0022y\u0022:59.1},{\u0022x\u0022:68.9,\u0022y\u0022:53.1},{\u0022x\u0022:35,\u0022y\u0022:50.3},{\u0022x\u0022:36.2,\u0022y\u0022:47.7},{\u0022x\u0022:65.8,\u0022y\u0022:59.4},{\u0022x\u0022:56.5,\u0022y\u0022:54.9},{\u0022x\u0022:46.5,\u0022y\u0022:67},{\u0022x\u0022:49.4,\u0022y\u0022:55.7},{\u0022x\u0022:69.3,\u0022y\u0022:92.4},{\u0022x\u0022:67.3,\u0022y\u0022:90.4},{\u0022x\u0022:88.5,\u0022y\u0022:50},{\u0022x\u0022:68.9,\u0022y\u0022:54},{\u0022x\u0022:72,\u0022y\u0022:44.4},{\u0022x\u0022:57.9,\u0022y\u0022:64},{\u0022x\u0022:65.8,\u0022y\u0022:47.5},{\u0022x\u0022:58.2,\u0022y\u0022:70.5},{\u0022x\u0022:37.2,\u0022y\u0022:64.8},{\u0022x\u0022:36.9,\u0022y\u0022:84},{\u0022x\u0022:60.8,\u0022y\u0022:72},{\u0022x\u0022:64.3,\u0022y\u0022:91.7},{\u0022x\u0022:41.4,\u0022y\u0022:83.7},{\u0022x\u0022:55.1,\u0022y\u0022:47},{\u0022x\u0022:59,\u0022y\u0022:24.9},{\u0022x\u0022:68.3,\u0022y\u0022:70.5},{\u0022x\u0022:68.5,\u0022y\u0022:70.9},{\u0022x\u0022:70.4,\u0022y\u0022:59.3},{\u0022x\u0022:75.8,\u0022y\u0022:63.6},{\u0022x\u0022:70,\u0022y\u0022:72.2},{\u0022x\u0022:71,\u0022y\u0022:72.9},{\u0022x\u0022:71.4,\u0022y\u0022:67.3},{\u0022x\u0022:85.3,\u0022y\u0022:60.8},{\u0022x\u0022:46,\u0022y\u0022:44.1},{\u0022x\u0022:38.8,\u0022y\u0022:88.7},{\u0022x\u0022:75.9,\u0022y\u0022:72.4},{\u0022x\u0022:90.8,\u0022y\u0022:43.1},{\u0022x\u0022:79.5,\u0022y\u0022:81},{\u0022x\u0022:75,\u0022y\u0022:74.9},{\u0022x\u0022:86.8,\u0022y\u0022:32.2},{\u0022x\u0022:99.5,\u0022y\u0022:0.5},{\u0022x\u0022:76.1,\u0022y\u0022:39.1},{\u0022x\u0022:54.5,\u0022y\u0022:43.9},{\u0022x\u0022:71.3,\u0022y\u0022:32.8},{\u0022x\u0022:70.5,\u0022y\u0022:83.5},{\u0022x\u0022:70.7,\u0022y\u0022:64},{\u0022x\u0022:78,\u0022y\u0022:51.4},{\u0022x\u0022:80.5,\u0022y\u0022:50.8},{\u0022x\u0022:81.1,\u0022y\u0022:50.8},{\u0022x\u0022:81,\u0022y\u0022:50.8},{\u0022x\u0022:76.6,\u0022y\u0022:68.8},{\u0022x\u0022:83.6,\u0022y\u0022:68.5},{\u0022x\u0022:84.7,\u0022y\u0022:76.1},{\u0022x\u0022:86.6,\u0022y\u0022:57.7},{\u0022x\u0022:84.7,\u0022y\u0022:55.6},{\u0022x\u0022:99.5,\u0022y\u0022:99.5},{\u0022x\u0022:78.8,\u0022y\u0022:55.4},{\u0022x\u0022:67.1,\u0022y\u0022:70.2},{\u0022x\u0022:66.7,\u0022y\u0022:72.9},{\u0022x\u0022:79.4,\u0022y\u0022:78.8},{\u0022x\u0022:75.4,\u0022y\u0022:72.4},{\u0022x\u0022:73,\u0022y\u0022:67.3},{\u0022x\u0022:71.3,\u0022y\u0022:62.5},{\u0022x\u0022:77.6,\u0022y\u0022:50.2},{\u0022x\u0022:86.3,\u0022y\u0022:40.1},{\u0022x\u0022:97.4,\u0022y\u0022:40.7},{\u0022x\u0022:80.9,\u0022y\u0022:53},{\u0022x\u0022:91.5,\u0022y\u0022:5},{\u0022x\u0022:97,\u0022y\u0022:30.5},{\u0022x\u0022:29,\u0022y\u0022:42.7},{\u0022x\u0022:90.1,\u0022y\u0022:58.9},{\u0022x\u0022:75.6,\u0022y\u0022:54.8},{\u0022x\u0022:35,\u0022y\u0022:53.6},{\u0022x\u0022:71.4,\u0022y\u0022:43},{\u0022x\u0022:48.8,\u0022y\u0022:56.6},{\u0022x\u0022:69.8,\u0022y\u0022:54.2},{\u0022x\u0022:70.9,\u0022y\u0022:85.5},{\u0022x\u0022:38.1,\u0022y\u0022:68.4},{\u0022x\u0022:39,\u0022y\u0022:65.5},{\u0022x\u0022:38.6,\u0022y\u0022:79.1},{\u0022x\u0022:56.9,\u0022y\u0022:70.6},{\u0022x\u0022:66.3,\u0022y\u0022:70.8},{\u0022x\u0022:72.7,\u0022y\u0022:57.9},{\u0022x\u0022:78.2,\u0022y\u0022:65.6},{\u0022x\u0022:50.4,\u0022y\u0022:50},{\u0022x\u0022:89.3,\u0022y\u0022:59.1},{\u0022x\u0022:99.5,\u0022y\u0022:99.5},{\u0022x\u0022:92.1,\u0022y\u0022:54.5},{\u0022x\u0022:99.9,\u0022y\u0022:0.9},{\u0022x\u0022:79.4,\u0022y\u0022:28.6},{\u0022x\u0022:86.2,\u0022y\u0022:31.7},{\u0022x\u0022:71.1,\u0022y\u0022:93.2},{\u0022x\u0022:75.6,\u0022y\u0022:70.3},{\u0022x\u0022:50,\u0022y\u0022:50},{\u0022x\u0022:50,\u0022y\u0022:50},{\u0022x\u0022:72.6,\u0022y\u0022:95},{\u0022x\u0022:71.7,\u0022y\u0022:94.4},{\u0022x\u0022:49.9,\u0022y\u0022:50},{\u0022x\u0022:58.2,\u0022y\u0022:27.8},{\u0022x\u0022:56.8,\u0022y\u0022:28.6},{\u0022x\u0022:54.6,\u0022y\u0022:24.3},{\u0022x\u0022:88.7,\u0022y\u0022:55.7},{\u0022x\u0022:64.4,\u0022y\u0022:82.6},{\u0022x\u0022:62,\u0022y\u0022:73.8},{\u0022x\u0022:64.6,\u0022y\u0022:70.4},{\u0022x\u0022:63.3,\u0022y\u0022:65.7},{\u0022x\u0022:37.2,\u0022y\u0022:65.7},{\u0022x\u0022:44.8,\u0022y\u0022:81.1},{\u0022x\u0022:75.2,\u0022y\u0022:67.3},{\u0022x\u0022:85.6,\u0022y\u0022:48.5},{\u0022x\u0022:83.3,\u0022y\u0022:43.9},{\u0022x\u0022:99.4,\u0022y\u0022:99.3},{\u0022x\u0022:79.8,\u0022y\u0022:65.8},{\u0022x\u0022:84.5,\u0022y\u0022:51.7},{\u0022x\u0022:77.3,\u0022y\u0022:72.7},{\u0022x\u0022:77.3,\u0022y\u0022:72.7},{\u0022x\u0022:74.8,\u0022y\u0022:59.4},{\u0022x\u0022:94.1,\u0022y\u0022:93.6},{\u0022x\u0022:73,\u0022y\u0022:84},{\u0022x\u0022:92.4,\u0022y\u0022:83.2},{\u0022x\u0022:58.1,\u0022y\u0022:84.2},{\u0022x\u0022:60.2,\u0022y\u0022:74.6},{\u0022x\u0022:67.1,\u0022y\u0022:65},{\u0022x\u0022:55.6,\u0022y\u0022:94.8},{\u0022x\u0022:99.5,\u0022y\u0022:99.5},{\u0022x\u0022:65.4,\u0022y\u0022:92.6},{\u0022x\u0022:93.6,\u0022y\u0022:45.4},{\u0022x\u0022:82.1,\u0022y\u0022:49},{\u0022x\u0022:84.6,\u0022y\u0022:45.1},{\u0022x\u0022:41.7,\u0022y\u0022:94.8},{\u0022x\u0022:55.6,\u0022y\u0022:95.6},{\u0022x\u0022:54.1,\u0022y\u0022:84.8},{\u0022x\u0022:66.8,\u0022y\u0022:26.1},{\u0022x\u0022:67.1,\u0022y\u0022:24.9},{\u0022x\u0022:72.4,\u0022y\u0022:58.8},{\u0022x\u0022:87.7,\u0022y\u0022:15.3},{\u0022x\u0022:56.1,\u0022y\u0022:76.5},{\u0022x\u0022:77.9,\u0022y\u0022:72.3},{\u0022x\u0022:94.3,\u0022y\u0022:53.6},{\u0022x\u0022:48.6,\u0022y\u0022:93.4},{\u0022x\u0022:44.6,\u0022y\u0022:84.9},{\u0022x\u0022:76.2,\u0022y\u0022:41.8},{\u0022x\u0022:85.3,\u0022y\u0022:45.4},{\u0022x\u0022:55.8,\u0022y\u0022:83.5},{\u0022x\u0022:33.3,\u0022y\u0022:95.5},{\u0022x\u0022:34.3,\u0022y\u0022:94.2},{\u0022x\u0022:39.8,\u0022y\u0022:72.6},{\u0022x\u0022:99.5,\u0022y\u0022:99.5},{\u0022x\u0022:87.5,\u0022y\u0022:84.3},{\u0022x\u0022:92,\u0022y\u0022:73.4},{\u0022x\u0022:83.5,\u0022y\u0022:52.6},{\u0022x\u0022:99.5,\u0022y\u0022:99.5},{\u0022x\u0022:55.5,\u0022y\u0022:81.5},{\u0022x\u0022:68.5,\u0022y\u0022:40.1},{\u0022x\u0022:86.1,\u0022y\u0022:55.2},{\u0022x\u0022:83.9,\u0022y\u0022:53},{\u0022x\u0022:55.1,\u0022y\u0022:47.4},{\u0022x\u0022:66.8,\u0022y\u0022:63.6},{\u0022x\u0022:68,\u0022y\u0022:50.2},{\u0022x\u0022:91.5,\u0022y\u0022:45.2},{\u0022x\u0022:92.7,\u0022y\u0022:60.9},{\u0022x\u0022:67.1,\u0022y\u0022:96.8},{\u0022x\u0022:71.5,\u0022y\u0022:52.4},{\u0022x\u0022:81,\u0022y\u0022:60.6},{\u0022x\u0022:86.8,\u0022y\u0022:59.9},{\u0022x\u0022:61.4,\u0022y\u0022:67.7},{\u0022x\u0022:52.5,\u0022y\u0022:73.8},{\u0022x\u0022:53.2,\u0022y\u0022:75},{\u0022x\u0022:54.3,\u0022y\u0022:74.9},{\u0022x\u0022:28.8,\u0022y\u0022:90.5},{\u0022x\u0022:95.3,\u0022y\u0022:93.7},{\u0022x\u0022:87,\u0022y\u0022:97.9},{\u0022x\u0022:76.9,\u0022y\u0022:89.4},{\u0022x\u0022:75.8,\u0022y\u0022:69.1},{\u0022x\u0022:71.3,\u0022y\u0022:27.4},{\u0022x\u0022:33.3,\u0022y\u0022:65.4},{\u0022x\u0022:89.2,\u0022y\u0022:32.3},{\u0022x\u0022:89.2,\u0022y\u0022:32.3},{\u0022x\u0022:57.4,\u0022y\u0022:67.7},{\u0022x\u0022:45.1,\u0022y\u0022:62},{\u0022x\u0022:65.5,\u0022y\u0022:50.9},{\u0022x\u0022:79,\u0022y\u0022:54.6},{\u0022x\u0022:91.5,\u0022y\u0022:35.2},{\u0022x\u0022:99.5,\u0022y\u0022:0.5},{\u0022x\u0022:91.4,\u0022y\u0022:2.7},{\u0022x\u0022:79.4,\u0022y\u0022:61.5},{\u0022x\u0022:28.6,\u0022y\u0022:76.5},{\u0022x\u0022:38.6,\u0022y\u0022:75.5},{\u0022x\u0022:78.6,\u0022y\u0022:35.1},{\u0022x\u0022:79.4,\u0022y\u0022:39.1},{\u0022x\u0022:49.4,\u0022y\u0022:47.3},{\u0022x\u0022:75.2,\u0022y\u0022:62.1},{\u0022x\u0022:63.1,\u0022y\u0022:83.4},{\u0022x\u0022:62.9,\u0022y\u0022:72.8},{\u0022x\u0022:81.4,\u0022y\u0022:95.3},{\u0022x\u0022:99.5,\u0022y\u0022:99.5},{\u0022x\u0022:77.5,\u0022y\u0022:72.1},{\u0022x\u0022:76.7,\u0022y\u0022:70.3},{\u0022x\u0022:99.5,\u0022y\u0022:99.5},{\u0022x\u0022:47.3,\u0022y\u0022:78.4},{\u0022x\u0022:69.4,\u0022y\u0022:73.2},{\u0022x\u0022:71.7,\u0022y\u0022:77.2},{\u0022x\u0022:75.6,\u0022y\u0022:39.4},{\u0022x\u0022:75.6,\u0022y\u0022:39.4},{\u0022x\u0022:63.4,\u0022y\u0022:46.2},{\u0022x\u0022:39.3,\u0022y\u0022:86.9},{\u0022x\u0022:39.8,\u0022y\u0022:84.7},{\u0022x\u0022:79,\u0022y\u0022:39.2},{\u0022x\u0022:57.8,\u0022y\u0022:86.3},{\u0022x\u0022:37.2,\u0022y\u0022:66},{\u0022x\u0022:37.6,\u0022y\u0022:88.3},{\u0022x\u0022:99.5,\u0022y\u0022:0.5},{\u0022x\u0022:71.7,\u0022y\u0022:53.9},{\u0022x\u0022:99.5,\u0022y\u0022:0.5},{\u0022x\u0022:64,\u0022y\u0022:68.7},{\u0022x\u0022:72.4,\u0022y\u0022:49.9},{\u0022x\u0022:81,\u0022y\u0022:38.2},{\u0022x\u0022:79.4,\u0022y\u0022:70},{\u0022x\u0022:88,\u0022y\u0022:69.1},{\u0022x\u0022:91,\u0022y\u0022:55.9},{\u0022x\u0022:39.5,\u0022y\u0022:69.7},{\u0022x\u0022:64.9,\u0022y\u0022:70.3},{\u0022x\u0022:60.4,\u0022y\u0022:73.8},{\u0022x\u0022:39.8,\u0022y\u0022:68.4},{\u0022x\u0022:35.6,\u0022y\u0022:70.9},{\u0022x\u0022:45.8,\u0022y\u0022:57.3},{\u0022x\u0022:57.8,\u0022y\u0022:73.3},{\u0022x\u0022:99.6,\u0022y\u0022:99.8},{\u0022x\u0022:68.4,\u0022y\u0022:83.8},{\u0022x\u0022:78.8,\u0022y\u0022:80},{\u0022x\u0022:73.3,\u0022y\u0022:67.9},{\u0022x\u0022:87,\u0022y\u0022:65.8},{\u0022x\u0022:77.1,\u0022y\u0022:78.4},{\u0022x\u0022:99.5,\u0022y\u0022:99.5},{\u0022x\u0022:49.3,\u0022y\u0022:64.5},{\u0022x\u0022:69.8,\u0022y\u0022:79.9},{\u0022x\u0022:50.9,\u0022y\u0022:32.2},{\u0022x\u0022:61.4,\u0022y\u0022:10.5},{\u0022x\u0022:65.8,\u0022y\u0022:3.1},{\u0022x\u0022:64.9,\u0022y\u0022:4},{\u0022x\u0022:72.6,\u0022y\u0022:34.2},{\u0022x\u0022:56.4,\u0022y\u0022:71.4},{\u0022x\u0022:57,\u0022y\u0022:72.1},{\u0022x\u0022:70.3,\u0022y\u0022:67},{\u0022x\u0022:73.2,\u0022y\u0022:69.2},{\u0022x\u0022:74.8,\u0022y\u0022:72.4},{\u0022x\u0022:90.3,\u0022y\u0022:47.4},{\u0022x\u0022:54.8,\u0022y\u0022:67.6},{\u0022x\u0022:54.8,\u0022y\u0022:46.6},{\u0022x\u0022:53.4,\u0022y\u0022:38.2},{\u0022x\u0022:64.2,\u0022y\u0022:31.6},{\u0022x\u0022:69.5,\u0022y\u0022:50.6},{\u0022x\u0022:69.5,\u0022y\u0022:50.6},{\u0022x\u0022:71.8,\u0022y\u0022:52.2},{\u0022x\u0022:87.4,\u0022y\u0022:31.8},{\u0022x\u0022:89.6,\u0022y\u0022:31.9},{\u0022x\u0022:99.5,\u0022y\u0022:99.5},{\u0022x\u0022:85.7,\u0022y\u0022:86.2},{\u0022x\u0022:77.6,\u0022y\u0022:36.1},{\u0022x\u0022:71.4,\u0022y\u0022:52.5},{\u0022x\u0022:69.6,\u0022y\u0022:50.3},{\u0022x\u0022:59,\u0022y\u0022:34.9},{\u0022x\u0022:88.4,\u0022y\u0022:33.3},{\u0022x\u0022:99.5,\u0022y\u0022:0.5},{\u0022x\u0022:60.6,\u0022y\u0022:41.9},{\u0022x\u0022:71.7,\u0022y\u0022:56},{\u0022x\u0022:41.4,\u0022y\u0022:61.7},{\u0022x\u0022:86.5,\u0022y\u0022:38.3},{\u0022x\u0022:60,\u0022y\u0022:65.7},{\u0022x\u0022:77.6,\u0022y\u0022:56.4},{\u0022x\u0022:80.2,\u0022y\u0022:46.1},{\u0022x\u0022:68.8,\u0022y\u0022:30.6},{\u0022x\u0022:91.1,\u0022y\u0022:50.9},{\u0022x\u0022:61.5,\u0022y\u0022:80},{\u0022x\u0022:99.5,\u0022y\u0022:99.5},{\u0022x\u0022:56.8,\u0022y\u0022:67.8},{\u0022x\u0022:50,\u0022y\u0022:50.2},{\u0022x\u0022:47.2,\u0022y\u0022:92.4},{\u0022x\u0022:28.4,\u0022y\u0022:26},{\u0022x\u0022:71.5,\u0022y\u0022:58.3},{\u0022x\u0022:53.1,\u0022y\u0022:96.2},{\u0022x\u0022:60.5,\u0022y\u0022:37.4},{\u0022x\u0022:29.5,\u0022y\u0022:62},{\u0022x\u0022:46,\u0022y\u0022:49.5},{\u0022x\u0022:47,\u0022y\u0022:54},{\u0022x\u0022:51.8,\u0022y\u0022:64.9},{\u0022x\u0022:45.9,\u0022y\u0022:76.1},{\u0022x\u0022:55,\u0022y\u0022:75.6},{\u0022x\u0022:78.2,\u0022y\u0022:40.1},{\u0022x\u0022:93.1,\u0022y\u0022:38.6},{\u0022x\u0022:71.9,\u0022y\u0022:79.1},{\u0022x\u0022:81.6,\u0022y\u0022:54.8},{\u0022x\u0022:82.6,\u0022y\u0022:47.7},{\u0022x\u0022:68.8,\u0022y\u0022:42.2},{\u0022x\u0022:77.4,\u0022y\u0022:35.6},{\u0022x\u0022:73.4,\u0022y\u0022:58.1},{\u0022x\u0022:64.9,\u0022y\u0022:40.8},{\u0022x\u0022:46.6,\u0022y\u0022:93.8},{\u0022x\u0022:59.2,\u0022y\u0022:94.3},{\u0022x\u0022:54.6,\u0022y\u0022:91.8},{\u0022x\u0022:80.1,\u0022y\u0022:61.9},{\u0022x\u0022:55.1,\u0022y\u0022:34.8},{\u0022x\u0022:58.4,\u0022y\u0022:21.1},{\u0022x\u0022:85.1,\u0022y\u0022:52.2},{\u0022x\u0022:42.9,\u0022y\u0022:67.5},{\u0022x\u0022:55.7,\u0022y\u0022:31.5},{\u0022x\u0022:66.7,\u0022y\u0022:40.9},{\u0022x\u0022:85.1,\u0022y\u0022:55.6},{\u0022x\u0022:84.9,\u0022y\u0022:62.6},{\u0022x\u0022:66.3,\u0022y\u0022:86},{\u0022x\u0022:69.3,\u0022y\u0022:78.5},{\u0022x\u0022:72.2,\u0022y\u0022:61.1},{\u0022x\u0022:77.5,\u0022y\u0022:59.5},{\u0022x\u0022:85.6,\u0022y\u0022:50.2},{\u0022x\u0022:85.3,\u0022y\u0022:45.8},{\u0022x\u0022:87,\u0022y\u0022:67.3},{\u0022x\u0022:66,\u0022y\u0022:55.6},{\u0022x\u0022:67.3,\u0022y\u0022:58.2},{\u0022x\u0022:76.5,\u0022y\u0022:62.6},{\u0022x\u0022:55.5,\u0022y\u0022:57.5},{\u0022x\u0022:70.6,\u0022y\u0022:79.8},{\u0022x\u0022:77.6,\u0022y\u0022:72.2},{\u0022x\u0022:76.1,\u0022y\u0022:86.9},{\u0022x\u0022:81.3,\u0022y\u0022:70.4},{\u0022x\u0022:81.7,\u0022y\u0022:71.7},{\u0022x\u0022:99.5,\u0022y\u0022:99.5},{\u0022x\u0022:82.8,\u0022y\u0022:95.8},{\u0022x\u0022:51.4,\u0022y\u0022:97.1},{\u0022x\u0022:44.3,\u0022y\u0022:96},{\u0022x\u0022:50.6,\u0022y\u0022:74.2},{\u0022x\u0022:57.8,\u0022y\u0022:51},{\u0022x\u0022:53.8,\u0022y\u0022:47},{\u0022x\u0022:71.5,\u0022y\u0022:52},{\u0022x\u0022:78,\u0022y\u0022:63.9},{\u0022x\u0022:88.2,\u0022y\u0022:52},{\u0022x\u0022:60.7,\u0022y\u0022:92.1},{\u0022x\u0022:80.9,\u0022y\u0022:93.3},{\u0022x\u0022:46.6,\u0022y\u0022:58.5},{\u0022x\u0022:87.1,\u0022y\u0022:66.4},{\u0022x\u0022:43.5,\u0022y\u0022:87.2},{\u0022x\u0022:38.6,\u0022y\u0022:78.4},{\u0022x\u0022:61.5,\u0022y\u0022:75.7},{\u0022x\u0022:54.3,\u0022y\u0022:96.8},{\u0022x\u0022:51,\u0022y\u0022:86.9},{\u0022x\u0022:38.9,\u0022y\u0022:70.2},{\u0022x\u0022:39.2,\u0022y\u0022:67},{\u0022x\u0022:99.5,\u0022y\u0022:99.5},{\u0022x\u0022:87,\u0022y\u0022:96.3},{\u0022x\u0022:90.5,\u0022y\u0022:51.8},{\u0022x\u0022:41.1,\u0022y\u0022:64.8},{\u0022x\u0022:55.2,\u0022y\u0022:75.7},{\u0022x\u0022:68.2,\u0022y\u0022:68.7},{\u0022x\u0022:84.8,\u0022y\u0022:71.1},{\u0022x\u0022:43.1,\u0022y\u0022:30.1},{\u0022x\u0022:39.7,\u0022y\u0022:17.9},{\u0022x\u0022:56.3,\u0022y\u0022:31.3},{\u0022x\u0022:88.8,\u0022y\u0022:34.2},{\u0022x\u0022:99.5,\u0022y\u0022:0.5},{\u0022x\u0022:87.2,\u0022y\u0022:11.4},{\u0022x\u0022:89,\u0022y\u0022:9.7},{\u0022x\u0022:71.7,\u0022y\u0022:16.2},{\u0022x\u0022:43.7,\u0022y\u0022:83.1},{\u0022x\u0022:65.6,\u0022y\u0022:43.2},{\u0022x\u0022:70.2,\u0022y\u0022:42.8},{\u0022x\u0022:75.6,\u0022y\u0022:34.2},{\u0022x\u0022:80.6,\u0022y\u0022:81.4},{\u0022x\u0022:70.4,\u0022y\u0022:67.5},{\u0022x\u0022:66.9,\u0022y\u0022:47.1},{\u0022x\u0022:74.2,\u0022y\u0022:46.4},{\u0022x\u0022:75,\u0022y\u0022:48.3},{\u0022x\u0022:99.5,\u0022y\u0022:99.5},{\u0022x\u0022:99.5,\u0022y\u0022:99.5},{\u0022x\u0022:85.8,\u0022y\u0022:88.2},{\u0022x\u0022:88.6,\u0022y\u0022:36.5},{\u0022x\u0022:69.5,\u0022y\u0022:51.4},{\u0022x\u0022:98.5,\u0022y\u0022:35.5},{\u0022x\u0022:73.9,\u0022y\u0022:94.8},{\u0022x\u0022:71.2,\u0022y\u0022:90.5},{\u0022x\u0022:74.1,\u0022y\u0022:94.2},{\u0022x\u0022:77.5,\u0022y\u0022:93.3},{\u0022x\u0022:76.3,\u0022y\u0022:85.3},{\u0022x\u0022:69.2,\u0022y\u0022:90.9},{\u0022x\u0022:73.4,\u0022y\u0022:90},{\u0022x\u0022:71.6,\u0022y\u0022:49.4},{\u0022x\u0022:73.8,\u0022y\u0022:55.8},{\u0022x\u0022:85.4,\u0022y\u0022:37.2},{\u0022x\u0022:97.8,\u0022y\u0022:25.6},{\u0022x\u0022:72.5,\u0022y\u0022:75},{\u0022x\u0022:71.5,\u0022y\u0022:71.2},{\u0022x\u0022:85.6,\u0022y\u0022:66.9},{\u0022x\u0022:79.5,\u0022y\u0022:50.8},{\u0022x\u0022:81.1,\u0022y\u0022:51},{\u0022x\u0022:41.5,\u0022y\u0022:81.9},{\u0022x\u0022:99.5,\u0022y\u0022:99.3},{\u0022x\u0022:62.1,\u0022y\u0022:75.4},{\u0022x\u0022:62,\u0022y\u0022:73.8},{\u0022x\u0022:58.8,\u0022y\u0022:62.9},{\u0022x\u0022:58.6,\u0022y\u0022:60.1},{\u0022x\u0022:99.5,\u0022y\u0022:0.5},{\u0022x\u0022:64.2,\u0022y\u0022:8},{\u0022x\u0022:60.3,\u0022y\u0022:9.4},{\u0022x\u0022:69.5,\u0022y\u0022:17.8},{\u0022x\u0022:56,\u0022y\u0022:87},{\u0022x\u0022:65.2,\u0022y\u0022:67.2},{\u0022x\u0022:66.1,\u0022y\u0022:43.5},{\u0022x\u0022:77.1,\u0022y\u0022:33},{\u0022x\u0022:81.1,\u0022y\u0022:69},{\u0022x\u0022:80.2,\u0022y\u0022:62.2},{\u0022x\u0022:70.7,\u0022y\u0022:77.1},{\u0022x\u0022:81.4,\u0022y\u0022:50.4},{\u0022x\u0022:84.5,\u0022y\u0022:55.8},{\u0022x\u0022:84.8,\u0022y\u0022:84.3},{\u0022x\u0022:86.3,\u0022y\u0022:72.6},{\u0022x\u0022:75.9,\u0022y\u0022:71.5},{\u0022x\u0022:58.5,\u0022y\u0022:89.5},{\u0022x\u0022:62.4,\u0022y\u0022:82.9},{\u0022x\u0022:76.6,\u0022y\u0022:49.4},{\u0022x\u0022:75.4,\u0022y\u0022:38.5},{\u0022x\u0022:86.8,\u0022y\u0022:42.9},{\u0022x\u0022:86.5,\u0022y\u0022:41.5},{\u0022x\u0022:85.1,\u0022y\u0022:70.3},{\u0022x\u0022:88.5,\u0022y\u0022:62.6},{\u0022x\u0022:87.2,\u0022y\u0022:53.4},{\u0022x\u0022:58.1,\u0022y\u0022:74.2},{\u0022x\u0022:71.8,\u0022y\u0022:52.9},{\u0022x\u0022:60.4,\u0022y\u0022:91.5},{\u0022x\u0022:76,\u0022y\u0022:92.2},{\u0022x\u0022:68.5,\u0022y\u0022:72},{\u0022x\u0022:71.4,\u0022y\u0022:59.1},{\u0022x\u0022:60.1,\u0022y\u0022:64.9},{\u0022x\u0022:70.3,\u0022y\u0022:55.3},{\u0022x\u0022:66.8,\u0022y\u0022:80.8},{\u0022x\u0022:74.8,\u0022y\u0022:68.5},{\u0022x\u0022:78.6,\u0022y\u0022:58.6},{\u0022x\u0022:82.3,\u0022y\u0022:53.5},{\u0022x\u0022:75.6,\u0022y\u0022:74.3},{\u0022x\u0022:39.8,\u0022y\u0022:77.7},{\u0022x\u0022:47.2,\u0022y\u0022:52.5},{\u0022x\u0022:78.7,\u0022y\u0022:27.7},{\u0022x\u0022:68.2,\u0022y\u0022:79.6},{\u0022x\u0022:90.2,\u0022y\u0022:79.3},{\u0022x\u0022:63.1,\u0022y\u0022:82.7},{\u0022x\u0022:54.8,\u0022y\u0022:91.7},{\u0022x\u0022:44.3,\u0022y\u0022:79.3},{\u0022x\u0022:45.1,\u0022y\u0022:64.9},{\u0022x\u0022:99.5,\u0022y\u0022:0.5},{\u0022x\u0022:79.9,\u0022y\u0022:21.5},{\u0022x\u0022:99.5,\u0022y\u0022:0.5},{\u0022x\u0022:70.1,\u0022y\u0022:66.7},{\u0022x\u0022:55.6,\u0022y\u0022:81.4},{\u0022x\u0022:90.7,\u0022y\u0022:46.4},{\u0022x\u0022:66,\u0022y\u0022:66.8},{\u0022x\u0022:69.7,\u0022y\u0022:61.4},{\u0022x\u0022:71.7,\u0022y\u0022:53.5},{\u0022x\u0022:75.6,\u0022y\u0022:47.2},{\u0022x\u0022:68,\u0022y\u0022:67},{\u0022x\u0022:70,\u0022y\u0022:46.4},{\u0022x\u0022:73.2,\u0022y\u0022:54.1},{\u0022x\u0022:70.6,\u0022y\u0022:45},{\u0022x\u0022:64,\u0022y\u0022:93.4},{\u0022x\u0022:58.9,\u0022y\u0022:92.3},{\u0022x\u0022:99.5,\u0022y\u0022:0.5},{\u0022x\u0022:99.5,\u0022y\u0022:99.5},{\u0022x\u0022:74.5,\u0022y\u0022:91.4},{\u0022x\u0022:38.6,\u0022y\u0022:77.4},{\u0022x\u0022:35.7,\u0022y\u0022:76.1},{\u0022x\u0022:36.8,\u0022y\u0022:73.3},{\u0022x\u0022:39.9,\u0022y\u0022:41.7},{\u0022x\u0022:70.3,\u0022y\u0022:60.3},{\u0022x\u0022:60.5,\u0022y\u0022:88.7},{\u0022x\u0022:61.8,\u0022y\u0022:69.7},{\u0022x\u0022:70.4,\u0022y\u0022:42.8},{\u0022x\u0022:74.1,\u0022y\u0022:38.5},{\u0022x\u0022:56.3,\u0022y\u0022:57.1},{\u0022x\u0022:55.8,\u0022y\u0022:51.5},{\u0022x\u0022:66.3,\u0022y\u0022:32.4},{\u0022x\u0022:43.3,\u0022y\u0022:64.6},{\u0022x\u0022:72.5,\u0022y\u0022:64.6},{\u0022x\u0022:62.5,\u0022y\u0022:78.7},{\u0022x\u0022:89.9,\u0022y\u0022:57.1},{\u0022x\u0022:72.3,\u0022y\u0022:91.8},{\u0022x\u0022:69.6,\u0022y\u0022:49.8},{\u0022x\u0022:71.6,\u0022y\u0022:33},{\u0022x\u0022:74.4,\u0022y\u0022:77.8},{\u0022x\u0022:75,\u0022y\u0022:61.7},{\u0022x\u0022:79,\u0022y\u0022:56.4},{\u0022x\u0022:81.1,\u0022y\u0022:48.2},{\u0022x\u0022:50.1,\u0022y\u0022:50.2},{\u0022x\u0022:58.8,\u0022y\u0022:67.3},{\u0022x\u0022:35,\u0022y\u0022:86.8},{\u0022x\u0022:56.1,\u0022y\u0022:80.5},{\u0022x\u0022:71.5,\u0022y\u0022:68.3},{\u0022x\u0022:67.9,\u0022y\u0022:58.2},{\u0022x\u0022:71.5,\u0022y\u0022:60.6},{\u0022x\u0022:72,\u0022y\u0022:42.4},{\u0022x\u0022:50.1,\u0022y\u0022:50.2},{\u0022x\u0022:68.6,\u0022y\u0022:79.3},{\u0022x\u0022:70.8,\u0022y\u0022:67.1},{\u0022x\u0022:76.8,\u0022y\u0022:74.1},{\u0022x\u0022:55.1,\u0022y\u0022:63.8},{\u0022x\u0022:45,\u0022y\u0022:57},{\u0022x\u0022:55.6,\u0022y\u0022:67.4},{\u0022x\u0022:68.8,\u0022y\u0022:39.5},{\u0022x\u0022:71,\u0022y\u0022:43.3},{\u0022x\u0022:48.8,\u0022y\u0022:92.1},{\u0022x\u0022:69.6,\u0022y\u0022:94.3},{\u0022x\u0022:73.1,\u0022y\u0022:61.2},{\u0022x\u0022:72.6,\u0022y\u0022:33.5},{\u0022x\u0022:67.4,\u0022y\u0022:76.2},{\u0022x\u0022:99.5,\u0022y\u0022:99.5},{\u0022x\u0022:78.6,\u0022y\u0022:89.3},{\u0022x\u0022:91.4,\u0022y\u0022:87.3},{\u0022x\u0022:59.9,\u0022y\u0022:75.2},{\u0022x\u0022:68.9,\u0022y\u0022:46.1},{\u0022x\u0022:71.7,\u0022y\u0022:52.1},{\u0022x\u0022:72.3,\u0022y\u0022:74.1},{\u0022x\u0022:80.8,\u0022y\u0022:38.3},{\u0022x\u0022:91.9,\u0022y\u0022:23.3},{\u0022x\u0022:67.4,\u0022y\u0022:41.7},{\u0022x\u0022:80.9,\u0022y\u0022:48.8},{\u0022x\u0022:73.8,\u0022y\u0022:69.6},{\u0022x\u0022:66.6,\u0022y\u0022:95},{\u0022x\u0022:74.7,\u0022y\u0022:85},{\u0022x\u0022:74.6,\u0022y\u0022:80.8},{\u0022x\u0022:59.6,\u0022y\u0022:56.5},{\u0022x\u0022:67.9,\u0022y\u0022:72},{\u0022x\u0022:78.4,\u0022y\u0022:86.4},{\u0022x\u0022:75.5,\u0022y\u0022:73.6},{\u0022x\u0022:86.3,\u0022y\u0022:67.7},{\u0022x\u0022:89,\u0022y\u0022:79.7},{\u0022x\u0022:64.4,\u0022y\u0022:65},{\u0022x\u0022:92.3,\u0022y\u0022:77.7},{\u0022x\u0022:73.4,\u0022y\u0022:89.6},{\u0022x\u0022:71.7,\u0022y\u0022:55.8},{\u0022x\u0022:75.6,\u0022y\u0022:51.7},{\u0022x\u0022:55.4,\u0022y\u0022:89.6},{\u0022x\u0022:73.9,\u0022y\u0022:70.5},{\u0022x\u0022:66.5,\u0022y\u0022:61.4},{\u0022x\u0022:69.9,\u0022y\u0022:44.8},{\u0022x\u0022:67.6,\u0022y\u0022:78.5},{\u0022x\u0022:49.9,\u0022y\u0022:50},{\u0022x\u0022:33,\u0022y\u0022:87.2},{\u0022x\u0022:25.9,\u0022y\u0022:83.9},{\u0022x\u0022:34.6,\u0022y\u0022:76.8},{\u0022x\u0022:38.9,\u0022y\u0022:79.2},{\u0022x\u0022:70.5,\u0022y\u0022:68.5},{\u0022x\u0022:66,\u0022y\u0022:74.7},{\u0022x\u0022:78.4,\u0022y\u0022:49.7},{\u0022x\u0022:75.4,\u0022y\u0022:44},{\u0022x\u0022:55.3,\u0022y\u0022:48.5},{\u0022x\u0022:90.4,\u0022y\u0022:28},{\u0022x\u0022:59.2,\u0022y\u0022:72.6},{\u0022x\u0022:63.7,\u0022y\u0022:61.3},{\u0022x\u0022:53.9,\u0022y\u0022:59.8},{\u0022x\u0022:60.5,\u0022y\u0022:43.8},{\u0022x\u0022:64.7,\u0022y\u0022:44.6},{\u0022x\u0022:62.9,\u0022y\u0022:56.6},{\u0022x\u0022:66.7,\u0022y\u0022:53.2},{\u0022x\u0022:94,\u0022y\u0022:32.8},{\u0022x\u0022:89.9,\u0022y\u0022:34.6},{\u0022x\u0022:54.6,\u0022y\u0022:78.8},{\u0022x\u0022:65.7,\u0022y\u0022:64.8},{\u0022x\u0022:67.4,\u0022y\u0022:47},{\u0022x\u0022:36.6,\u0022y\u0022:72.8},{\u0022x\u0022:33.8,\u0022y\u0022:76.7},{\u0022x\u0022:71.7,\u0022y\u0022:41.1},{\u0022x\u0022:71.5,\u0022y\u0022:69.3},{\u0022x\u0022:78.7,\u0022y\u0022:30.3},{\u0022x\u0022:75.5,\u0022y\u0022:69},{\u0022x\u0022:59,\u0022y\u0022:71.6},{\u0022x\u0022:59.4,\u0022y\u0022:80.1},{\u0022x\u0022:72.2,\u0022y\u0022:41.6},{\u0022x\u0022:74.9,\u0022y\u0022:56},{\u0022x\u0022:68,\u0022y\u0022:44.6},{\u0022x\u0022:71.8,\u0022y\u0022:72.6},{\u0022x\u0022:72.9,\u0022y\u0022:57},{\u0022x\u0022:73.6,\u0022y\u0022:58.8},{\u0022x\u0022:72.7,\u0022y\u0022:55.6},{\u0022x\u0022:70.6,\u0022y\u0022:54.7},{\u0022x\u0022:66.5,\u0022y\u0022:41.9},{\u0022x\u0022:99.5,\u0022y\u0022:0.5},{\u0022x\u0022:66.4,\u0022y\u0022:53.8},{\u0022x\u0022:70.8,\u0022y\u0022:49.2},{\u0022x\u0022:41.4,\u0022y\u0022:88.4},{\u0022x\u0022:87.5,\u0022y\u0022:52.8},{\u0022x\u0022:87.5,\u0022y\u0022:51.5},{\u0022x\u0022:41.4,\u0022y\u0022:64.3},{\u0022x\u0022:40.2,\u0022y\u0022:77.4},{\u0022x\u0022:67.4,\u0022y\u0022:75.8},{\u0022x\u0022:85.7,\u0022y\u0022:48.1},{\u0022x\u0022:38,\u0022y\u0022:68.4},{\u0022x\u0022:71.3,\u0022y\u0022:55},{\u0022x\u0022:71,\u0022y\u0022:52.2},{\u0022x\u0022:70.6,\u0022y\u0022:57.9},{\u0022x\u0022:39.6,\u0022y\u0022:77.7},{\u0022x\u0022:60,\u0022y\u0022:65.2},{\u0022x\u0022:42.4,\u0022y\u0022:63.9},{\u0022x\u0022:46.5,\u0022y\u0022:48.6},{\u0022x\u0022:62.5,\u0022y\u0022:33},{\u0022x\u0022:75.6,\u0022y\u0022:51.1},{\u0022x\u0022:69.6,\u0022y\u0022:71.2},{\u0022x\u0022:72.8,\u0022y\u0022:75.6},{\u0022x\u0022:99.5,\u0022y\u0022:99.5},{\u0022x\u0022:39.2,\u0022y\u0022:35.1},{\u0022x\u0022:38.9,\u0022y\u0022:34.6},{\u0022x\u0022:62.3,\u0022y\u0022:37.3},{\u0022x\u0022:84.9,\u0022y\u0022:62.8},{\u0022x\u0022:87.2,\u0022y\u0022:42.7},{\u0022x\u0022:78.8,\u0022y\u0022:46.5},{\u0022x\u0022:78.1,\u0022y\u0022:48.3},{\u0022x\u0022:84,\u0022y\u0022:93.4},{\u0022x\u0022:72.8,\u0022y\u0022:96.3},{\u0022x\u0022:77,\u0022y\u0022:82.8},{\u0022x\u0022:56.6,\u0022y\u0022:44.9},{\u0022x\u0022:69.1,\u0022y\u0022:47},{\u0022x\u0022:58,\u0022y\u0022:84.8},{\u0022x\u0022:56.6,\u0022y\u0022:62.2},{\u0022x\u0022:78.3,\u0022y\u0022:72},{\u0022x\u0022:62.3,\u0022y\u0022:57.7},{\u0022x\u0022:36.4,\u0022y\u0022:81},{\u0022x\u0022:88.5,\u0022y\u0022:50},{\u0022x\u0022:66.5,\u0022y\u0022:92.8},{\u0022x\u0022:78.2,\u0022y\u0022:49.8},{\u0022x\u0022:53.6,\u0022y\u0022:64},{\u0022x\u0022:55,\u0022y\u0022:53.4},{\u0022x\u0022:99.5,\u0022y\u0022:99.5},{\u0022x\u0022:65.2,\u0022y\u0022:90.4},{\u0022x\u0022:44.5,\u0022y\u0022:82.6},{\u0022x\u0022:79.8,\u0022y\u0022:88.5},{\u0022x\u0022:79.8,\u0022y\u0022:88.5},{\u0022x\u0022:76.1,\u0022y\u0022:37.6},{\u0022x\u0022:63.1,\u0022y\u0022:47.5},{\u0022x\u0022:57.2,\u0022y\u0022:60.1},{\u0022x\u0022:77.8,\u0022y\u0022:47.3},{\u0022x\u0022:71.3,\u0022y\u0022:46.9},{\u0022x\u0022:73.7,\u0022y\u0022:17.2},{\u0022x\u0022:72.5,\u0022y\u0022:3.4},{\u0022x\u0022:68.7,\u0022y\u0022:6.3},{\u0022x\u0022:68.9,\u0022y\u0022:3.9},{\u0022x\u0022:47.1,\u0022y\u0022:50.8},{\u0022x\u0022:53.6,\u0022y\u0022:42.1},{\u0022x\u0022:78.1,\u0022y\u0022:19.2},{\u0022x\u0022:92.6,\u0022y\u0022:18.6},{\u0022x\u0022:99.5,\u0022y\u0022:0.5},{\u0022x\u0022:31.7,\u0022y\u0022:16.6},{\u0022x\u0022:35.6,\u0022y\u0022:31.7},{\u0022x\u0022:70.2,\u0022y\u0022:41.7},{\u0022x\u0022:75.3,\u0022y\u0022:48},{\u0022x\u0022:86.8,\u0022y\u0022:63.4},{\u0022x\u0022:59.8,\u0022y\u0022:18},{\u0022x\u0022:34.9,\u0022y\u0022:36},{\u0022x\u0022:43.3,\u0022y\u0022:38.3},{\u0022x\u0022:39.4,\u0022y\u0022:69.5},{\u0022x\u0022:31.4,\u0022y\u0022:56.2},{\u0022x\u0022:65.3,\u0022y\u0022:90.8},{\u0022x\u0022:89.9,\u0022y\u0022:96.4},{\u0022x\u0022:91.5,\u0022y\u0022:96.2},{\u0022x\u0022:40.3,\u0022y\u0022:78.9},{\u0022x\u0022:34.7,\u0022y\u0022:77.4},{\u0022x\u0022:39,\u0022y\u0022:77.1},{\u0022x\u0022:56,\u0022y\u0022:65.7},{\u0022x\u0022:99.5,\u0022y\u0022:99.5},{\u0022x\u0022:86.1,\u0022y\u0022:91.1},{\u0022x\u0022:93.9,\u0022y\u0022:73.8},{\u0022x\u0022:64.5,\u0022y\u0022:67.5},{\u0022x\u0022:98.6,\u0022y\u0022:41.2},{\u0022x\u0022:99.5,\u0022y\u0022:0.5},{\u0022x\u0022:48.1,\u0022y\u0022:60.9},{\u0022x\u0022:46.3,\u0022y\u0022:83.4},{\u0022x\u0022:47.2,\u0022y\u0022:74.6},{\u0022x\u0022:54.5,\u0022y\u0022:79.5},{\u0022x\u0022:44.1,\u0022y\u0022:96.3},{\u0022x\u0022:35.8,\u0022y\u0022:92.7},{\u0022x\u0022:75.5,\u0022y\u0022:58.6},{\u0022x\u0022:74.5,\u0022y\u0022:53.7},{\u0022x\u0022:76.1,\u0022y\u0022:67.6},{\u0022x\u0022:44.3,\u0022y\u0022:85.3},{\u0022x\u0022:64.2,\u0022y\u0022:57},{\u0022x\u0022:80.2,\u0022y\u0022:38.4},{\u0022x\u0022:31.6,\u0022y\u0022:58.3},{\u0022x\u0022:30.3,\u0022y\u0022:49.5},{\u0022x\u0022:42,\u0022y\u0022:91.5},{\u0022x\u0022:42.3,\u0022y\u0022:88.9},{\u0022x\u0022:44.6,\u0022y\u0022:69.4},{\u0022x\u0022:56.7,\u0022y\u0022:84.6},{\u0022x\u0022:68.8,\u0022y\u0022:79.2},{\u0022x\u0022:77.3,\u0022y\u0022:66.6},{\u0022x\u0022:83.6,\u0022y\u0022:50},{\u0022x\u0022:54.7,\u0022y\u0022:63.7},{\u0022x\u0022:75.6,\u0022y\u0022:26.8},{\u0022x\u0022:62.8,\u0022y\u0022:30},{\u0022x\u0022:83.1,\u0022y\u0022:31.3},{\u0022x\u0022:38.2,\u0022y\u0022:57.1},{\u0022x\u0022:64.6,\u0022y\u0022:64},{\u0022x\u0022:70.4,\u0022y\u0022:75.9},{\u0022x\u0022:70.8,\u0022y\u0022:80.8},{\u0022x\u0022:69.5,\u0022y\u0022:62.2},{\u0022x\u0022:79,\u0022y\u0022:36.3},{\u0022x\u0022:91.4,\u0022y\u0022:57},{\u0022x\u0022:68.1,\u0022y\u0022:39.4},{\u0022x\u0022:70.5,\u0022y\u0022:37},{\u0022x\u0022:79.6,\u0022y\u0022:55},{\u0022x\u0022:61.5,\u0022y\u0022:74.8},{\u0022x\u0022:72.9,\u0022y\u0022:62.6},{\u0022x\u0022:81.1,\u0022y\u0022:48.6},{\u0022x\u0022:71.1,\u0022y\u0022:63.7},{\u0022x\u0022:73.7,\u0022y\u0022:61.2},{\u0022x\u0022:79.3,\u0022y\u0022:73.8},{\u0022x\u0022:79.2,\u0022y\u0022:68.9},{\u0022x\u0022:79.2,\u0022y\u0022:63.6},{\u0022x\u0022:96.2,\u0022y\u0022:29.5},{\u0022x\u0022:60,\u0022y\u0022:82.8},{\u0022x\u0022:54.8,\u0022y\u0022:49.4},{\u0022x\u0022:58.2,\u0022y\u0022:49.8},{\u0022x\u0022:69.4,\u0022y\u0022:57},{\u0022x\u0022:69.1,\u0022y\u0022:54.1},{\u0022x\u0022:74,\u0022y\u0022:24.9},{\u0022x\u0022:61.9,\u0022y\u0022:73.5},{\u0022x\u0022:57.1,\u0022y\u0022:23.4},{\u0022x\u0022:73.5,\u0022y\u0022:32},{\u0022x\u0022:71.6,\u0022y\u0022:39.9},{\u0022x\u0022:72,\u0022y\u0022:62.8},{\u0022x\u0022:71.2,\u0022y\u0022:63.6},{\u0022x\u0022:66.8,\u0022y\u0022:59.7},{\u0022x\u0022:69.6,\u0022y\u0022:52.3},{\u0022x\u0022:78.8,\u0022y\u0022:41.6},{\u0022x\u0022:78.7,\u0022y\u0022:38.9},{\u0022x\u0022:49.9,\u0022y\u0022:50.1},{\u0022x\u0022:49.9,\u0022y\u0022:50.1},{\u0022x\u0022:67.8,\u0022y\u0022:68.4},{\u0022x\u0022:90.9,\u0022y\u0022:50.5},{\u0022x\u0022:45.6,\u0022y\u0022:67.8},{\u0022x\u0022:45.6,\u0022y\u0022:67.8},{\u0022x\u0022:74.1,\u0022y\u0022:58},{\u0022x\u0022:77.2,\u0022y\u0022:42.7},{\u0022x\u0022:74.3,\u0022y\u0022:64.1},{\u0022x\u0022:70.1,\u0022y\u0022:68.9},{\u0022x\u0022:71.8,\u0022y\u0022:65.8},{\u0022x\u0022:73.4,\u0022y\u0022:64.2},{\u0022x\u0022:39.2,\u0022y\u0022:97.8},{\u0022x\u0022:72.7,\u0022y\u0022:76.9},{\u0022x\u0022:77.2,\u0022y\u0022:48.9},{\u0022x\u0022:73.3,\u0022y\u0022:92.5},{\u0022x\u0022:81.8,\u0022y\u0022:70.3},{\u0022x\u0022:72.8,\u0022y\u0022:84.3},{\u0022x\u0022:80.9,\u0022y\u0022:76.8},{\u0022x\u0022:62.6,\u0022y\u0022:76.3},{\u0022x\u0022:83.6,\u0022y\u0022:48},{\u0022x\u0022:80.5,\u0022y\u0022:72.2},{\u0022x\u0022:96,\u0022y\u0022:66.5},{\u0022x\u0022:97.3,\u0022y\u0022:61.1},{\u0022x\u0022:99.3,\u0022y\u0022:0.6},{\u0022x\u0022:74.6,\u0022y\u0022:85.8},{\u0022x\u0022:51.2,\u0022y\u0022:74.2},{\u0022x\u0022:39.8,\u0022y\u0022:76.3},{\u0022x\u0022:54.8,\u0022y\u0022:97},{\u0022x\u0022:63.4,\u0022y\u0022:88.8},{\u0022x\u0022:99.5,\u0022y\u0022:99.5},{\u0022x\u0022:87.4,\u0022y\u0022:54.6},{\u0022x\u0022:85.8,\u0022y\u0022:64.9},{\u0022x\u0022:76.2,\u0022y\u0022:62.2},{\u0022x\u0022:76.1,\u0022y\u0022:63.1},{\u0022x\u0022:50.2,\u0022y\u0022:50.1},{\u0022x\u0022:73.5,\u0022y\u0022:83.4},{\u0022x\u0022:80.3,\u0022y\u0022:61.7},{\u0022x\u0022:80.1,\u0022y\u0022:60.3},{\u0022x\u0022:80.2,\u0022y\u0022:58.1},{\u0022x\u0022:77,\u0022y\u0022:55.5},{\u0022x\u0022:70.4,\u0022y\u0022:93.2},{\u0022x\u0022:99.5,\u0022y\u0022:99.5},{\u0022x\u0022:84.2,\u0022y\u0022:68.1},{\u0022x\u0022:97.9,\u0022y\u0022:66.4},{\u0022x\u0022:72.6,\u0022y\u0022:56.8},{\u0022x\u0022:78.6,\u0022y\u0022:70.4},{\u0022x\u0022:76.6,\u0022y\u0022:62.2},{\u0022x\u0022:78,\u0022y\u0022:56.3},{\u0022x\u0022:90.4,\u0022y\u0022:34.3},{\u0022x\u0022:92.9,\u0022y\u0022:34.4},{\u0022x\u0022:80.8,\u0022y\u0022:50.4},{\u0022x\u0022:70.9,\u0022y\u0022:68.4},{\u0022x\u0022:84.9,\u0022y\u0022:55.2},{\u0022x\u0022:78.8,\u0022y\u0022:58.6},{\u0022x\u0022:75.8,\u0022y\u0022:58.3},{\u0022x\u0022:77.2,\u0022y\u0022:41.9},{\u0022x\u0022:59.7,\u0022y\u0022:60.5},{\u0022x\u0022:63.3,\u0022y\u0022:56.3},{\u0022x\u0022:70.6,\u0022y\u0022:56.7},{\u0022x\u0022:68.1,\u0022y\u0022:45.7},{\u0022x\u0022:81.4,\u0022y\u0022:49.8},{\u0022x\u0022:33.9,\u0022y\u0022:61.3},{\u0022x\u0022:71.8,\u0022y\u0022:68.2},{\u0022x\u0022:71.9,\u0022y\u0022:80.3},{\u0022x\u0022:79.1,\u0022y\u0022:78},{\u0022x\u0022:77.1,\u0022y\u0022:65.8},{\u0022x\u0022:79.1,\u0022y\u0022:60.3},{\u0022x\u0022:62.1,\u0022y\u0022:58},{\u0022x\u0022:68.9,\u0022y\u0022:70.3},{\u0022x\u0022:72.3,\u0022y\u0022:62.8},{\u0022x\u0022:69.4,\u0022y\u0022:63.4},{\u0022x\u0022:84.4,\u0022y\u0022:49.8},{\u0022x\u0022:86.1,\u0022y\u0022:49.1},{\u0022x\u0022:86.1,\u0022y\u0022:48.4},{\u0022x\u0022:86,\u0022y\u0022:46.2},{\u0022x\u0022:59.1,\u0022y\u0022:86.5},{\u0022x\u0022:55,\u0022y\u0022:93.9},{\u0022x\u0022:99.5,\u0022y\u0022:99.5},{\u0022x\u0022:66.7,\u0022y\u0022:45.8},{\u0022x\u0022:76.9,\u0022y\u0022:48.1},{\u0022x\u0022:85.7,\u0022y\u0022:67.9},{\u0022x\u0022:52.9,\u0022y\u0022:91.3},{\u0022x\u0022:62.2,\u0022y\u0022:87.6},{\u0022x\u0022:49.9,\u0022y\u0022:49.9},{\u0022x\u0022:61.4,\u0022y\u0022:61.4},{\u0022x\u0022:53,\u0022y\u0022:75.9},{\u0022x\u0022:63.8,\u0022y\u0022:61.6},{\u0022x\u0022:65.1,\u0022y\u0022:49.6},{\u0022x\u0022:59.6,\u0022y\u0022:92.1},{\u0022x\u0022:57.6,\u0022y\u0022:76.8},{\u0022x\u0022:76.5,\u0022y\u0022:47.1},{\u0022x\u0022:76.7,\u0022y\u0022:35.5},{\u0022x\u0022:60.6,\u0022y\u0022:82},{\u0022x\u0022:69.8,\u0022y\u0022:93.9},{\u0022x\u0022:73.8,\u0022y\u0022:82.8},{\u0022x\u0022:73.2,\u0022y\u0022:63},{\u0022x\u0022:85.8,\u0022y\u0022:53.7},{\u0022x\u0022:73.5,\u0022y\u0022:70.5},{\u0022x\u0022:75.9,\u0022y\u0022:52},{\u0022x\u0022:85.8,\u0022y\u0022:58.6},{\u0022x\u0022:86,\u0022y\u0022:56.8},{\u0022x\u0022:99.5,\u0022y\u0022:99.5},{\u0022x\u0022:94.6,\u0022y\u0022:88.2},{\u0022x\u0022:93.4,\u0022y\u0022:89.7},{\u0022x\u0022:56.8,\u0022y\u0022:84.6},{\u0022x\u0022:53.8,\u0022y\u0022:76.3},{\u0022x\u0022:58.3,\u0022y\u0022:76.5},{\u0022x\u0022:83.7,\u0022y\u0022:45.4},{\u0022x\u0022:72.6,\u0022y\u0022:55.6},{\u0022x\u0022:33,\u0022y\u0022:52.6},{\u0022x\u0022:37.1,\u0022y\u0022:34.3},{\u0022x\u0022:75.1,\u0022y\u0022:41.2},{\u0022x\u0022:79.1,\u0022y\u0022:59.1},{\u0022x\u0022:67.9,\u0022y\u0022:45.3},{\u0022x\u0022:86,\u0022y\u0022:45.9},{\u0022x\u0022:83.8,\u0022y\u0022:46.9},{\u0022x\u0022:51.8,\u0022y\u0022:64.9},{\u0022x\u0022:61.4,\u0022y\u0022:51.5},{\u0022x\u0022:49.9,\u0022y\u0022:50.2},{\u0022x\u0022:57.5,\u0022y\u0022:47.7},{\u0022x\u0022:71.8,\u0022y\u0022:44.3},{\u0022x\u0022:72.6,\u0022y\u0022:49.3},{\u0022x\u0022:42.5,\u0022y\u0022:77.7},{\u0022x\u0022:42.5,\u0022y\u0022:60},{\u0022x\u0022:60.5,\u0022y\u0022:92.7},{\u0022x\u0022:72,\u0022y\u0022:39},{\u0022x\u0022:66.6,\u0022y\u0022:39.4},{\u0022x\u0022:78.7,\u0022y\u0022:31.5},{\u0022x\u0022:80.6,\u0022y\u0022:49.6},{\u0022x\u0022:49.9,\u0022y\u0022:50.2},{\u0022x\u0022:60.3,\u0022y\u0022:34.2},{\u0022x\u0022:69.2,\u0022y\u0022:37.3},{\u0022x\u0022:71,\u0022y\u0022:37.9},{\u0022x\u0022:43.1,\u0022y\u0022:66.3},{\u0022x\u0022:55.4,\u0022y\u0022:52.3},{\u0022x\u0022:34.3,\u0022y\u0022:57.7},{\u0022x\u0022:34.3,\u0022y\u0022:57.7},{\u0022x\u0022:56,\u0022y\u0022:66.1},{\u0022x\u0022:81.4,\u0022y\u0022:46.2},{\u0022x\u0022:99.5,\u0022y\u0022:0.5},{\u0022x\u0022:87,\u0022y\u0022:9.1},{\u0022x\u0022:46.9,\u0022y\u0022:78.5},{\u0022x\u0022:71.2,\u0022y\u0022:49.5},{\u0022x\u0022:85.8,\u0022y\u0022:47.8},{\u0022x\u0022:48.9,\u0022y\u0022:71.7},{\u0022x\u0022:45.1,\u0022y\u0022:71.8},{\u0022x\u0022:39.8,\u0022y\u0022:91.6},{\u0022x\u0022:99.6,\u0022y\u0022:99.5},{\u0022x\u0022:30.9,\u0022y\u0022:76.3},{\u0022x\u0022:32,\u0022y\u0022:75.9},{\u0022x\u0022:74.2,\u0022y\u0022:65.9},{\u0022x\u0022:54.2,\u0022y\u0022:89.6},{\u0022x\u0022:71.5,\u0022y\u0022:42.7},{\u0022x\u0022:72,\u0022y\u0022:15.6},{\u0022x\u0022:72.6,\u0022y\u0022:32.1},{\u0022x\u0022:56,\u0022y\u0022:69.1},{\u0022x\u0022:57.7,\u0022y\u0022:64.6},{\u0022x\u0022:38.3,\u0022y\u0022:68.3},{\u0022x\u0022:46.4,\u0022y\u0022:43.8},{\u0022x\u0022:70.7,\u0022y\u0022:40.1},{\u0022x\u0022:53.3,\u0022y\u0022:57.5},{\u0022x\u0022:62.7,\u0022y\u0022:90.3},{\u0022x\u0022:45.9,\u0022y\u0022:85.6},{\u0022x\u0022:60.7,\u0022y\u0022:64},{\u0022x\u0022:68.9,\u0022y\u0022:67.7},{\u0022x\u0022:67.4,\u0022y\u0022:56.5},{\u0022x\u0022:62,\u0022y\u0022:63.3},{\u0022x\u0022:80.3,\u0022y\u0022:31.9},{\u0022x\u0022:40.7,\u0022y\u0022:57.8},{\u0022x\u0022:71.4,\u0022y\u0022:64.4},{\u0022x\u0022:57.6,\u0022y\u0022:64},{\u0022x\u0022:61.3,\u0022y\u0022:45},{\u0022x\u0022:66.7,\u0022y\u0022:33},{\u0022x\u0022:90.9,\u0022y\u0022:35.4},{\u0022x\u0022:58.8,\u0022y\u0022:86.4},{\u0022x\u0022:41.5,\u0022y\u0022:83.7},{\u0022x\u0022:36.4,\u0022y\u0022:73.8},{\u0022x\u0022:62.9,\u0022y\u0022:88.7},{\u0022x\u0022:72.4,\u0022y\u0022:75},{\u0022x\u0022:71.4,\u0022y\u0022:58.2},{\u0022x\u0022:74.5,\u0022y\u0022:50.9},{\u0022x\u0022:78,\u0022y\u0022:41.1},{\u0022x\u0022:61.2,\u0022y\u0022:79.6},{\u0022x\u0022:72.6,\u0022y\u0022:48.5},{\u0022x\u0022:40.6,\u0022y\u0022:88.7},{\u0022x\u0022:28.9,\u0022y\u0022:65.9},{\u0022x\u0022:35,\u0022y\u0022:42.4},{\u0022x\u0022:66.8,\u0022y\u0022:44.8},{\u0022x\u0022:97.6,\u0022y\u0022:29.5},{\u0022x\u0022:56.6,\u0022y\u0022:56.8},{\u0022x\u0022:56,\u0022y\u0022:54.1},{\u0022x\u0022:74,\u0022y\u0022:70.9},{\u0022x\u0022:44.6,\u0022y\u0022:50.3},{\u0022x\u0022:57.1,\u0022y\u0022:31.2},{\u0022x\u0022:67.7,\u0022y\u0022:31.7},{\u0022x\u0022:47,\u0022y\u0022:48.5},{\u0022x\u0022:46.4,\u0022y\u0022:56.6},{\u0022x\u0022:53.3,\u0022y\u0022:44.8},{\u0022x\u0022:53,\u0022y\u0022:60.1},{\u0022x\u0022:81.1,\u0022y\u0022:49.3},{\u0022x\u0022:37.6,\u0022y\u0022:49.6},{\u0022x\u0022:33.7,\u0022y\u0022:45.8},{\u0022x\u0022:27.6,\u0022y\u0022:61.4},{\u0022x\u0022:26.1,\u0022y\u0022:67.7},{\u0022x\u0022:35.8,\u0022y\u0022:83.4},{\u0022x\u0022:43.5,\u0022y\u0022:45.8},{\u0022x\u0022:49.4,\u0022y\u0022:36.2},{\u0022x\u0022:51.4,\u0022y\u0022:59.9},{\u0022x\u0022:36.1,\u0022y\u0022:92.2},{\u0022x\u0022:60.2,\u0022y\u0022:29.8},{\u0022x\u0022:59.4,\u0022y\u0022:84.8},{\u0022x\u0022:46.3,\u0022y\u0022:44.8},{\u0022x\u0022:62.1,\u0022y\u0022:34.8},{\u0022x\u0022:62,\u0022y\u0022:38},{\u0022x\u0022:64.1,\u0022y\u0022:60.3},{\u0022x\u0022:27.8,\u0022y\u0022:39.2},{\u0022x\u0022:29.3,\u0022y\u0022:46.8},{\u0022x\u0022:49.9,\u0022y\u0022:49.8},{\u0022x\u0022:57.6,\u0022y\u0022:89.3},{\u0022x\u0022:42.6,\u0022y\u0022:75.6},{\u0022x\u0022:46.9,\u0022y\u0022:80.1},{\u0022x\u0022:63.3,\u0022y\u0022:77.6},{\u0022x\u0022:58.3,\u0022y\u0022:79.6},{\u0022x\u0022:71.4,\u0022y\u0022:49.5},{\u0022x\u0022:84.8,\u0022y\u0022:36.5},{\u0022x\u0022:39.6,\u0022y\u0022:84.4},{\u0022x\u0022:32.6,\u0022y\u0022:77.8},{\u0022x\u0022:36.3,\u0022y\u0022:90.9},{\u0022x\u0022:66.7,\u0022y\u0022:56.4},{\u0022x\u0022:71.7,\u0022y\u0022:57.3},{\u0022x\u0022:53.8,\u0022y\u0022:75},{\u0022x\u0022:53.2,\u0022y\u0022:65.6},{\u0022x\u0022:28.7,\u0022y\u0022:30.3},{\u0022x\u0022:73.5,\u0022y\u0022:59.7},{\u0022x\u0022:72.9,\u0022y\u0022:50.1},{\u0022x\u0022:53.3,\u0022y\u0022:96.7},{\u0022x\u0022:52.6,\u0022y\u0022:88},{\u0022x\u0022:77.8,\u0022y\u0022:58.1},{\u0022x\u0022:78.7,\u0022y\u0022:56.9},{\u0022x\u0022:77.1,\u0022y\u0022:37},{\u0022x\u0022:69.4,\u0022y\u0022:66.9},{\u0022x\u0022:49.9,\u0022y\u0022:49.9},{\u0022x\u0022:58.5,\u0022y\u0022:76.1},{\u0022x\u0022:60.7,\u0022y\u0022:79.9},{\u0022x\u0022:83.1,\u0022y\u0022:84.7},{\u0022x\u0022:56.4,\u0022y\u0022:78.1},{\u0022x\u0022:64.2,\u0022y\u0022:74.2},{\u0022x\u0022:49.8,\u0022y\u0022:50},{\u0022x\u0022:75.7,\u0022y\u0022:77.5},{\u0022x\u0022:75.9,\u0022y\u0022:80.8},{\u0022x\u0022:73.4,\u0022y\u0022:24.7},{\u0022x\u0022:91.1,\u0022y\u0022:48.5},{\u0022x\u0022:76.7,\u0022y\u0022:77.1},{\u0022x\u0022:67.2,\u0022y\u0022:44.5},{\u0022x\u0022:68.9,\u0022y\u0022:46.6},{\u0022x\u0022:84,\u0022y\u0022:35.4},{\u0022x\u0022:56.5,\u0022y\u0022:69.7},{\u0022x\u0022:47.3,\u0022y\u0022:86.9},{\u0022x\u0022:59.2,\u0022y\u0022:72.7},{\u0022x\u0022:94.3,\u0022y\u0022:60},{\u0022x\u0022:99.5,\u0022y\u0022:99.5},{\u0022x\u0022:85.1,\u0022y\u0022:95.1},{\u0022x\u0022:76.5,\u0022y\u0022:54},{\u0022x\u0022:68.3,\u0022y\u0022:73},{\u0022x\u0022:99.5,\u0022y\u0022:99.5},{\u0022x\u0022:78.5,\u0022y\u0022:30.9},{\u0022x\u0022:99.5,\u0022y\u0022:0.5},{\u0022x\u0022:61,\u0022y\u0022:67},{\u0022x\u0022:65.5,\u0022y\u0022:65.2},{\u0022x\u0022:74.8,\u0022y\u0022:85},{\u0022x\u0022:72.7,\u0022y\u0022:74.1},{\u0022x\u0022:26.4,\u0022y\u0022:90.9},{\u0022x\u0022:26.4,\u0022y\u0022:90.9},{\u0022x\u0022:56.1,\u0022y\u0022:82.4},{\u0022x\u0022:99.5,\u0022y\u0022:99.5},{\u0022x\u0022:78.8,\u0022y\u0022:80.4},{\u0022x\u0022:78.5,\u0022y\u0022:67.1},{\u0022x\u0022:81.6,\u0022y\u0022:51.7},{\u0022x\u0022:82.1,\u0022y\u0022:42.5},{\u0022x\u0022:28.9,\u0022y\u0022:86.6},{\u0022x\u0022:39.9,\u0022y\u0022:59.9},{\u0022x\u0022:55.8,\u0022y\u0022:56.2},{\u0022x\u0022:66.5,\u0022y\u0022:49.3},{\u0022x\u0022:73.6,\u0022y\u0022:31.6},{\u0022x\u0022:60.1,\u0022y\u0022:35.2},{\u0022x\u0022:99.5,\u0022y\u0022:0.5},{\u0022x\u0022:86.7,\u0022y\u0022:23.1},{\u0022x\u0022:66.1,\u0022y\u0022:77},{\u0022x\u0022:73.5,\u0022y\u0022:79.7},{\u0022x\u0022:58.5,\u0022y\u0022:68.5},{\u0022x\u0022:82.6,\u0022y\u0022:64.3},{\u0022x\u0022:64.1,\u0022y\u0022:64.9},{\u0022x\u0022:68.8,\u0022y\u0022:77.5},{\u0022x\u0022:99.5,\u0022y\u0022:99.5},{\u0022x\u0022:73.9,\u0022y\u0022:54.5},{\u0022x\u0022:49.7,\u0022y\u0022:50.3},{\u0022x\u0022:74.7,\u0022y\u0022:49.7},{\u0022x\u0022:74.6,\u0022y\u0022:50.2},{\u0022x\u0022:36.1,\u0022y\u0022:45.8},{\u0022x\u0022:37.3,\u0022y\u0022:40.3},{\u0022x\u0022:44.4,\u0022y\u0022:71.1},{\u0022x\u0022:56.2,\u0022y\u0022:80.6},{\u0022x\u0022:70.1,\u0022y\u0022:75.5},{\u0022x\u0022:61.3,\u0022y\u0022:41.1},{\u0022x\u0022:63.5,\u0022y\u0022:32.6},{\u0022x\u0022:64.9,\u0022y\u0022:39.7},{\u0022x\u0022:64.4,\u0022y\u0022:33},{\u0022x\u0022:50,\u0022y\u0022:50},{\u0022x\u0022:62.5,\u0022y\u0022:94.7},{\u0022x\u0022:73.8,\u0022y\u0022:42.4},{\u0022x\u0022:74,\u0022y\u0022:40.7},{\u0022x\u0022:54.3,\u0022y\u0022:94.2},{\u0022x\u0022:58.5,\u0022y\u0022:60.2},{\u0022x\u0022:65,\u0022y\u0022:80.2},{\u0022x\u0022:78.5,\u0022y\u0022:52.6},{\u0022x\u0022:74.6,\u0022y\u0022:42.5},{\u0022x\u0022:78,\u0022y\u0022:42.2},{\u0022x\u0022:74.5,\u0022y\u0022:71.8},{\u0022x\u0022:32.3,\u0022y\u0022:87.1},{\u0022x\u0022:70.5,\u0022y\u0022:60.3},{\u0022x\u0022:63.5,\u0022y\u0022:80.8},{\u0022x\u0022:46.7,\u0022y\u0022:55.5},{\u0022x\u0022:60.9,\u0022y\u0022:63.9},{\u0022x\u0022:39,\u0022y\u0022:93.5},{\u0022x\u0022:36.2,\u0022y\u0022:48.1},{\u0022x\u0022:56,\u0022y\u0022:87.8},{\u0022x\u0022:73.9,\u0022y\u0022:75.6},{\u0022x\u0022:88.8,\u0022y\u0022:71.7},{\u0022x\u0022:99.5,\u0022y\u0022:99.5},{\u0022x\u0022:63.3,\u0022y\u0022:81.1},{\u0022x\u0022:58.3,\u0022y\u0022:23.3},{\u0022x\u0022:50.2,\u0022y\u0022:50.4},{\u0022x\u0022:72.7,\u0022y\u0022:77.5},{\u0022x\u0022:79,\u0022y\u0022:59.4},{\u0022x\u0022:81.5,\u0022y\u0022:51.9},{\u0022x\u0022:80.7,\u0022y\u0022:50.1},{\u0022x\u0022:60.2,\u0022y\u0022:87.8},{\u0022x\u0022:62.7,\u0022y\u0022:53},{\u0022x\u0022:67.1,\u0022y\u0022:87.4},{\u0022x\u0022:63,\u0022y\u0022:63.1},{\u0022x\u0022:73.2,\u0022y\u0022:52.2},{\u0022x\u0022:80.9,\u0022y\u0022:50.6},{\u0022x\u0022:73.5,\u0022y\u0022:33.4},{\u0022x\u0022:84.9,\u0022y\u0022:30.9},{\u0022x\u0022:67.1,\u0022y\u0022:77.8},{\u0022x\u0022:75.8,\u0022y\u0022:53.6},{\u0022x\u0022:71.4,\u0022y\u0022:58.7},{\u0022x\u0022:76.7,\u0022y\u0022:59.4},{\u0022x\u0022:99.5,\u0022y\u0022:99.5},{\u0022x\u0022:61.4,\u0022y\u0022:48.8},{\u0022x\u0022:62.3,\u0022y\u0022:49.9},{\u0022x\u0022:70.2,\u0022y\u0022:27.1},{\u0022x\u0022:72.7,\u0022y\u0022:48.2},{\u0022x\u0022:92.5,\u0022y\u0022:46.6},{\u0022x\u0022:76.8,\u0022y\u0022:51},{\u0022x\u0022:76.3,\u0022y\u0022:38.3},{\u0022x\u0022:75.1,\u0022y\u0022:47.2},{\u0022x\u0022:64.9,\u0022y\u0022:90},{\u0022x\u0022:70.8,\u0022y\u0022:81.8},{\u0022x\u0022:77.2,\u0022y\u0022:66.1},{\u0022x\u0022:70.9,\u0022y\u0022:56},{\u0022x\u0022:69,\u0022y\u0022:53.9},{\u0022x\u0022:45.9,\u0022y\u0022:35.1},{\u0022x\u0022:59.1,\u0022y\u0022:23.7},{\u0022x\u0022:77.5,\u0022y\u0022:41.6},{\u0022x\u0022:84.7,\u0022y\u0022:41.6},{\u0022x\u0022:89.9,\u0022y\u0022:51.6},{\u0022x\u0022:89.9,\u0022y\u0022:51.6},{\u0022x\u0022:99.5,\u0022y\u0022:99.5},{\u0022x\u0022:90.1,\u0022y\u0022:97.1},{\u0022x\u0022:49.9,\u0022y\u0022:49.7},{\u0022x\u0022:68.2,\u0022y\u0022:87.7},{\u0022x\u0022:69.9,\u0022y\u0022:51},{\u0022x\u0022:70.2,\u0022y\u0022:33.2},{\u0022x\u0022:70.7,\u0022y\u0022:37.4},{\u0022x\u0022:62.9,\u0022y\u0022:59.7},{\u0022x\u0022:62.4,\u0022y\u0022:93},{\u0022x\u0022:69.9,\u0022y\u0022:84.2},{\u0022x\u0022:47.8,\u0022y\u0022:50.3},{\u0022x\u0022:67.5,\u0022y\u0022:53.4},{\u0022x\u0022:51.5,\u0022y\u0022:91.7},{\u0022x\u0022:71.5,\u0022y\u0022:79},{\u0022x\u0022:42.1,\u0022y\u0022:56.3},{\u0022x\u0022:70.4,\u0022y\u0022:92.6}]');
    // A GK's Mapa de portería rides the heatmap's loading (beta-final-changes fase 2): null until loaded.
    let goalmouthData = null;
    let heatmapEmptyMessage = 'No hay datos de eventos disponibles.';
    let heatmapResizeObserver = null;
    let heatmapBufferCanvas = null;
    let heatmapBufferCtx = null;
    let heatmapMobileBufferCanvas = null;
    let heatmapMobileBufferCtx = null;
    let heatmapRenderIdlePending = false;
    let heatmapRequestStartedAt = null;
    const playerDetailProfileEnabled = false;
    const playerDetailPlayerId = 'c5ryhn04g9goikd0blmh83aol';
    let seasonRankingData = JSON.parse('{\u0022season_label\u0022:null,\u0022player_role\u0022:null,\u0022league_name\u0022:\u0022MLS\u0022,\u0022cross_league_available\u0022:false,\u0022cross_league_label\u0022:null,\u0022league_mean_rating\u0022:null,\u0022options\u0022:[]}');
    let seasonRankingPositionScope = 'same_position';
    let seasonRankingLeagueScope = 'same_league';
    let seasonRankingLoaded = Object.keys(seasonRankingData?.options || {}).length > 0;
    let seasonRankingLoading = false;
    // The league mean of the season the filters pick; undefined until they change.
    let filterLeagueMean = undefined;

    let heatmapLoaded = (Array.isArray(heatmapPoints) && heatmapPoints.length > 0) || goalmouthData !== null;
    // Show the heatmap overlay immediately on first load so there's a visible placeholder.
    let heatmapLoading = !heatmapLoaded;
    let heatmapFetchPending = false;

    let similarPlayersLoading = false;

    let performanceData = JSON.parse('{\u0022summaryMatches\u0022:[],\u0022latestMatches\u0022:[],\u0022competitionMatches\u0022:[],\u0022seasonRatings\u0022:[]}');
    let performanceSummaryLoaded = Array.isArray(performanceData?.summaryMatches) && performanceData.summaryMatches.length > 0;
    let performanceSummaryLoading = false;
    let performanceSummaryFallbackTimer = null;
    let headerSkoreRenderScheduled = false;
    let performanceLatestLoaded = Array.isArray(performanceData?.latestMatches) && performanceData.latestMatches.length > 0;
    let performanceLatestLoading = false;
    let performanceSeasonLoaded = Array.isArray(performanceData?.seasonRatings) && performanceData.seasonRatings.length > 0;
    let performanceSeasonLoading = false;

    /*
      Long enough to outlast the CSS transition, so the panel is not
      display:none'd out from under its own close animation. Overshooting only
      delays the `hidden` flip by a frame; undershooting cuts the fade off.
    */
    // Every modal on the page fades and lifts through the shared transition.
    function openModalBackdrop(backdrop) {
      window.StatiskicksAttributeCharts.openModalBackdrop(backdrop);
    }

    function closeModalBackdrop(backdrop) {
      window.StatiskicksAttributeCharts.closeModalBackdrop(backdrop);
    }

    function openTraitsModal() {
      const traitsModalBackdrop = currentPlayerDetailElement('traitsModalBackdrop');
      if (!traitsModalBackdrop) return;

      // A filter left over from the last visit would hide most of the list with
      // nothing on screen explaining why, so every open starts from the whole set.
      setTraitsSearchQuery('');

      openModalBackdrop(traitsModalBackdrop);
    }

    function closeTraitsModal() {
      closeModalBackdrop(currentPlayerDetailElement('traitsModalBackdrop'));
    }

    function openRankingFiltersModal() {
      const rankingFiltersModalBackdrop = currentPlayerDetailElement('rankingFiltersModalBackdrop') || document.getElementById('rankingFiltersModalBackdrop');
      if (!rankingFiltersModalBackdrop) return;
      // Move to body to escape any stacking context created by ancestor elements
      if (rankingFiltersModalBackdrop.parentElement !== document.body) {
        document.body.appendChild(rankingFiltersModalBackdrop);
      }
      openModalBackdrop(rankingFiltersModalBackdrop);
    }

    function closeRankingFiltersModal() {
      closeModalBackdrop(
        currentPlayerDetailElement('rankingFiltersModalBackdrop')
          || document.getElementById('rankingFiltersModalBackdrop')
      );
    }

    /*
      Modals that are nothing but a panel of controls: [backdrop, open button,
      close button]. The attributes and ranking modals have behaviour of their own
      and keep their own functions above.
    */
    const controlsModals = [
      ['desempFiltersModalBackdrop', 'openDesempFiltersModal', 'closeDesempFiltersModal'],
      ['desempChartOptionsModalBackdrop', 'openDesempChartOptionsModal', 'closeDesempChartOptionsModal'],
    ];

    function clearTraitsSelection() {
      visibleTraits.clear();
      renderTraits();
      updateChart();
    }

    // SK-05: the "Comparar" tab's own attribute menu — independent state from
    // the Perfil tab's traitsData/visibleTraits above, see comparisonPanel().
    function openComparisonTraitsModal() {
      const panel = comparisonPanelInstance();
      const backdrop = document.getElementById('comparisonTraitsModalBackdrop');
      if (!backdrop || !panel) return;

      setComparisonTraitsSearchQuery(panel, '');
      populateComparisonTraitsGrid(panel);
      openModalBackdrop(backdrop);
    }

    function closeComparisonTraitsModal() {
      closeModalBackdrop(document.getElementById('comparisonTraitsModalBackdrop'));
    }

    function clearComparisonTraitsSelection() {
      const panel = comparisonPanelInstance();
      if (!panel) return;

      panel.visibleTraits.clear();
      populateComparisonTraitsGrid(panel);
      panel.renderChart();
    }

    function bindPlayerDetailDomControls() {
      const bindings = [
        ['openTraitsModal', 'click', openTraitsModal],
        ['closeTraitsModal', 'click', closeTraitsModal],
        ['openRankingFiltersModal', 'click', openRankingFiltersModal],
        ['closeRankingFiltersModal', 'click', closeRankingFiltersModal],
        ['clearTraitsSelection', 'click', clearTraitsSelection],
        ['openComparisonTraitsModal', 'click', openComparisonTraitsModal],
        ['closeComparisonTraitsModal', 'click', closeComparisonTraitsModal],
        ['clearComparisonTraitsSelection', 'click', clearComparisonTraitsSelection],
        ...controlsModals.flatMap(([backdropId, openId, closeId]) => [
          [openId, 'click', () => openModalBackdrop(currentPlayerDetailElement(backdropId))],
          [closeId, 'click', () => closeModalBackdrop(currentPlayerDetailElement(backdropId))],
        ]),
      ];

      bindings.forEach(([id, eventName, handler]) => {
        const element = currentPlayerDetailElement(id);
        if (!element || element.dataset.playerDetailBound === '1') return;

        element.addEventListener(eventName, handler);
        element.dataset.playerDetailBound = '1';
      });

      const traitsSearchInput = currentPlayerDetailElement('traitsSearchInput');
      if (traitsSearchInput && traitsSearchInput.dataset.playerDetailBound !== '1') {
        traitsSearchInput.addEventListener('input', function (event) {
          setTraitsSearchQuery(event.target.value);
        });
        traitsSearchInput.dataset.playerDetailBound = '1';
      }

      const traitsModalBackdrop = currentPlayerDetailElement('traitsModalBackdrop');
      if (traitsModalBackdrop && traitsModalBackdrop.dataset.playerDetailBound !== '1') {
        traitsModalBackdrop.addEventListener('click', function (event) {
          if (event.target === traitsModalBackdrop) {
            closeTraitsModal();
          }
        });
        traitsModalBackdrop.dataset.playerDetailBound = '1';
      }

      const comparisonTraitsSearchInput = document.getElementById('comparisonTraitsSearchInput');
      if (comparisonTraitsSearchInput && comparisonTraitsSearchInput.dataset.playerDetailBound !== '1') {
        comparisonTraitsSearchInput.addEventListener('input', function (event) {
          const panel = comparisonPanelInstance();
          if (panel) setComparisonTraitsSearchQuery(panel, event.target.value);
        });
        comparisonTraitsSearchInput.dataset.playerDetailBound = '1';
      }

      const comparisonTraitsModalBackdrop = document.getElementById('comparisonTraitsModalBackdrop');
      if (comparisonTraitsModalBackdrop && comparisonTraitsModalBackdrop.dataset.playerDetailBound !== '1') {
        comparisonTraitsModalBackdrop.addEventListener('click', function (event) {
          if (event.target === comparisonTraitsModalBackdrop) {
            closeComparisonTraitsModal();
          }
        });
        comparisonTraitsModalBackdrop.dataset.playerDetailBound = '1';
      }

      const rankingFiltersModalBackdrop = currentPlayerDetailElement('rankingFiltersModalBackdrop') || document.getElementById('rankingFiltersModalBackdrop');
      if (rankingFiltersModalBackdrop && rankingFiltersModalBackdrop.dataset.playerDetailBound !== '1') {
        rankingFiltersModalBackdrop.addEventListener('click', function (event) {
          if (event.target === rankingFiltersModalBackdrop) {
            closeRankingFiltersModal();
          }
        });
        rankingFiltersModalBackdrop.dataset.playerDetailBound = '1';
      }

      controlsModals.forEach(([backdropId]) => {
        const backdrop = currentPlayerDetailElement(backdropId);
        if (!backdrop || backdrop.dataset.playerDetailBound === '1') return;

        backdrop.addEventListener('click', function (event) {
          if (event.target === backdrop) {
            closeModalBackdrop(backdrop);
          }
        });
        backdrop.dataset.playerDetailBound = '1';
      });
    }

    document.addEventListener('keydown', function (event) {
      const traitsModalBackdrop = currentPlayerDetailElement('traitsModalBackdrop');
      const rankingFiltersModalBackdrop = currentPlayerDetailElement('rankingFiltersModalBackdrop') || document.getElementById('rankingFiltersModalBackdrop');

      if (event.key === 'Escape') {
        controlsModals.forEach(([backdropId]) => {
          const backdrop = currentPlayerDetailElement(backdropId);
          if (backdrop && !backdrop.hidden) closeModalBackdrop(backdrop);
        });
      }

      if (event.key === 'Escape' && traitsModalBackdrop && !traitsModalBackdrop.hidden) {
        closeTraitsModal();
      }

      if (event.key === 'Escape' && rankingFiltersModalBackdrop && !rankingFiltersModalBackdrop.hidden) {
        closeRankingFiltersModal();
      }

      const comparisonTraitsModalBackdrop = document.getElementById('comparisonTraitsModalBackdrop');
      if (event.key === 'Escape' && comparisonTraitsModalBackdrop && !comparisonTraitsModalBackdrop.hidden) {
        closeComparisonTraitsModal();
      }
    });

    function getTraitBenchmark(trait) {
      return Number(trait.benchmark ?? 0);
    }

    function getDefaultVisibleTraits(nextTraits) {
      return window.StatiskicksAttributeCharts.defaultVisibleTraits(nextTraits);
    }

    function applyTraitsData(nextTraits) {
      traitsData = Array.isArray(nextTraits) ? nextTraits : [];
      visibleTraits = getDefaultVisibleTraits(traitsData);
      renderTraits();
      updateChart();
      syncChartControlsUI();
      traitsLoaded = true;
      traitsLoading = false;
      syncTraitsLoadingUI();
    }

    /*
      Ranking (beta-feature-2): the card's attribute-charts.js controller
      draws the table (rankingRows(), the team page's); this hands it the
      traits, and whether they are still loading, as its payload. A reload
      (a new period) keeps the picks: the same list, only its state moved.
    */
    function syncPlayerRankingTraits() {
      const payload = document.getElementById('playerRanking')?.querySelector('[data-attribute-charts-payload]');
      if (!payload) return;

      const fields = ['key', 'label', 'raw_name', 'category', 'defaultVisible', 'unit', 'total_only', 'val', 'population_average', 'rank', 'rank_total'];
      const totalFields = ['val', 'population_average', 'rank', 'rank_total'];
      const pick = (source, names) => Object.fromEntries(names.map(name => [name, source?.[name] ?? null]));
      const next = JSON.stringify({
        traits: traitsData.map(trait => ({ ...pick(trait, fields), total: trait.total ? pick(trait.total, totalFields) : null })),
        state: traitsLoading ? 'loading' : 'ready',
      });

      if (payload.textContent === next) return;

      payload.textContent = next;
      window.StatiskicksAttributeCharts?.boot();
    }

    let traitsSearchQuery = '';

    // Accent- and case-insensitive, like the picker's own search (attribute-charts.js).
    function normalizeTraitSearchText(value) {
      return window.StatiskicksAttributeCharts.normalizeTraitSearchText(value);
    }

    function setTraitsSearchQuery(value) {
      const next = String(value ?? '');
      const input = currentPlayerDetailElement('traitsSearchInput');

      if (input && input.value !== next) input.value = next;
      if (traitsSearchQuery === next) return;

      traitsSearchQuery = next;
      renderTraits();
    }

    // The attribute picker, drawn by the shared renderTraitsGrid() from this
    // page's traits and selection.
    function renderTraits() {
      window.StatiskicksAttributeCharts.renderTraitsGrid(
        document.getElementById('traitsGrid'),
        currentPlayerDetailElement('traitsSearchEmpty'),
        traitsData,
        visibleTraits,
        traitsSearchQuery,
        () => {
          renderTraits();
          updateChart();
        }
      );
    }

    window.addEventListener('traits-data-updated', event => {
      traitsFetchPending = false;
      applyTraitsData(event.detail.traitsData ?? []);
    });

    function percentileColor(p) {
      return window.StatiskicksPercentileRows?.color(p)
        || (p >= 70 ? themeColor('--accent', '#B2D98B') : (p >= 40 ? '#FFDC51' : '#FFAA60'));
    }


    // The unit the shared charts speak; this page calls them 'porcentaje', 'p90' and 'total'.
    function chartUnit() {
      const units = window.StatiskicksAttributeCharts;

      return { p90: units.UNIT_VALUE, total: units.UNIT_TOTAL }[currentUnit] || units.UNIT_PERCENTILE;
    }

    function getTraitDisplayRatio(trait) {
      return window.StatiskicksAttributeCharts.getTraitDisplayRatio(trait);
    }

    function getTraitPopulationAverageRatio(trait) {
      return window.StatiskicksAttributeCharts.getTraitPopulationAverageRatio(trait);
    }

    function getTraitChartBadgeLabel(trait) {
      return window.StatiskicksAttributeCharts.getTraitChartBadgeLabel(trait, chartUnit());
    }

    function ellipsizeCanvasText(ctx, text, maxWidth) {
      const value = String(text ?? '');

      if (ctx.measureText(value).width <= maxWidth) {
        return value;
      }

      let output = value;

      while (output.length > 0 && ctx.measureText(output + '…').width > maxWidth) {
        output = output.slice(0, -1);
      }

      return output ? output + '…' : '';
}

    function formatMetric(value) {
      return window.StatiskicksAttributeCharts.formatMetric(value);
    }

    /*
      A theme flip repaints both views. Neither regrows: Chart.js parses colours
      itself and cannot read a var(), so the bar rows have to be rebuilt to pick
      the new palette up, and a rebuild is what animates - hence the opt-out
      rather than a plain rebuild.
    */
    function updateChartColors() {
      drawPizzaChart();

      if (barChartInstance) {
        createBarChart(false);
      }
    }

    /*
      The wheel, drawn by attribute-charts.js from this page's traits and unit.
      It grows out of the hub on a rebuild (updateChart) and nowhere else: a
      theme flip or a resize repaints the same numbers on the finished frame.
    */
    function drawPizzaChart(animate = false) {
      window.StatiskicksAttributeCharts.drawPizzaChart(
        document.getElementById('chartWrapper'),
        document.getElementById('radarChart'),
        traitsData.filter(t => visibleTraits.has(t.key)),
        { unit: chartUnit(), animate }
      );
    }

    function hexToRgba(hex, alpha) {
      return window.StatiskicksAttributeCharts.hexToRgba(hex, alpha);
    }

    function createBarChart(animate = true) {
      if (!canRenderMainChart()) {
        return;
      }

      if (barChartInstance) { barChartInstance.destroy(); barChartInstance = null; }

      barChartInstance = window.StatiskicksAttributeCharts.createBarChart(
        document.getElementById('barChart'),
        document.getElementById('barChartWrapper'),
        traitsData.filter(t => visibleTraits.has(t.key)),
        {
          unit: chartUnit(),
          showAverage: showPositionAvg,
          instanceId: 'player-profile-attributes',
          animate,
          valueLabel: 'p90',
        }
      );
    }

    function updateChart() {
      if (!canRenderMainChart()) {
        return;
      }

      drawPizzaChart(true);
      createBarChart();
      renderStatsTable();
    }


    // The bands (App\Support\RankBands), as this table's class names.
    function rankColor(p) {
      if (p >= 70) return 'green';
      if (p >= 40) return 'yellow';
      return 'red';
    }

    function renderStatsTable() {
      const container = document.getElementById('statsTable');
      if (!container) return;

      const visible = traitsData.filter(t => visibleTraits.has(t.key));

      const half = Math.ceil(visible.length / 2);
      const left  = visible.slice(0, half);
      const right = visible.slice(half);
      const rows  = Math.max(left.length, right.length);

      function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, char => ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#039;',
        }[char]));
      }

      function cellHtml(t) {
        if (!t) {
          return `
            <td class="stat-name"></td>
            <td class="stat-rank-cell"></td>
          `;
        }

        // In Total the count and its own percentile (attribute-charts.js traitInUnit()).
        const shown = window.StatiskicksAttributeCharts.traitInUnit(t, chartUnit());
        const badgeVal = currentUnit === 'porcentaje'
          ? `${formatMetric(shown.percentile)}%`
          : formatMetric(shown.val);

        const badgeColor = rankColor(Number(shown.percentile ?? 0));

        return `
          <td class="stat-name" title="${escapeHtml(t.label)}">${escapeHtml(t.label)}</td>
          <td class="stat-rank-cell">
            <span class="stat-rank ${badgeColor}">${badgeVal}</span>
          </td>
        `;
      }

      let html = '<table class="stats-table"><tbody>';

      for (let i = 0; i < rows; i++) {
        html += `
          <tr>
            ${cellHtml(left[i])}
            <td class="stat-gap" aria-hidden="true"></td>
            ${cellHtml(right[i])}
          </tr>
        `;
      }

      html += '</tbody></table>';

      container.innerHTML = html;
    }

    document.addEventListener('click', function (event) {
      const button = event.target.closest(
        '#btnPorcentaje, #btnP90, #btnTotal, #btnSoloJugador, #btnConMedia'
      );

      if (!button) return;

      enableMainChartRendering();

      switch (button.id) {
        case 'btnPorcentaje':
          setChartUnit('porcentaje');
          break;

        case 'btnP90':
          setChartUnit('p90');
          break;

        case 'btnTotal':
          setChartUnit('total');
          break;

        case 'btnSoloJugador':
          setPositionAverageVisibility(false);
          break;

        case 'btnConMedia':
          setPositionAverageVisibility(true);
          break;
      }
    });

    function registerLivewireChartControlSync() {
      if (window.__chartControlMorphSyncRegistered) return;
      if (!window.Livewire || typeof window.Livewire.hook !== 'function') return;

      window.__chartControlMorphSyncRegistered = true;

      window.Livewire.hook('morph.updated', function () {
        requestAnimationFrame(() => {
          syncPlayerTabVisibility(activePlayerTab);
          syncChartControlsUI();
          renderTraits();
          syncHeatmapLoadingUI();
          syncTraitsLoadingUI();
          renderSeasonRanking();
          window.StatiskicksEventMap?.boot();
          if (activePlayerTab === 'mapas') {
            window.StatiskicksEventMap?.activate('player-detail-map');
          }

          if (activePlayerTab === 'desempeno') {
            syncDesempLoadingUI();
            syncDesempChartCanvas();
          }
        });
      });
    }

    document.addEventListener('livewire:init', registerLivewireChartControlSync);
    registerLivewireChartControlSync();


    if (!window.__playerTabsClickRegistered) {
      window.__playerTabsClickRegistered = true;
      document.addEventListener('click', function (event) {
        const tab = event.target.closest('.player-tab');
        if (!tab) return;

        event.preventDefault();
        showPlayerTab(tab.dataset.tab);
      });
    }

    document.addEventListener('click', function (event) {
      const button = event.target.closest(
        '#btnRankingSamePosition, #btnRankingAllPositions, #btnRankingSameLeague, #btnRankingAllLeagues'
      );

      if (!button) return;

      if (button.id === 'btnRankingSamePosition') {
        seasonRankingPositionScope = 'same_position';
      }

      if (button.id === 'btnRankingAllPositions') {
        seasonRankingPositionScope = 'all_positions';
      }

      if (button.id === 'btnRankingSameLeague') {
        seasonRankingLeagueScope = 'same_league';
      }

      if (button.id === 'btnRankingAllLeagues') {
        if (!seasonRankingData?.cross_league_available) {
          syncSeasonRankingControlsUI();
          renderSeasonRanking();
          return;
        }

        seasonRankingLeagueScope = 'all_leagues';
      }

      renderSeasonRanking();
      refreshSkoreAxisCharts();
    });


    /*
      Bars and radar each carry their own banner, the way the heatmap does, so a
      load reads as three cards waiting rather than one sheet drawn over two.
      They share one state - the traits fetch feeds both charts - so they are
      toggled together.
    */
    const CHART_LOADING_OVERLAYS = [
      ['barsLoadingOverlay', 'barsLoadingText'],
      ['radarLoadingOverlay', 'radarLoadingText'],
    ];

    function syncTraitsLoadingUI() {

      const waitingForInteraction = isMobilePlayerView() && traitsLoaded && !mainChartInteractiveReady;
      const showLoading = traitsLoading || waitingForInteraction;
      const loadingMessage = waitingForInteraction
        ? 'Cargando gráficas...'
        : 'Cargando estadísticas...';

      if (mainChartAutoUnlockTimeoutId !== null) {
        clearTimeout(mainChartAutoUnlockTimeoutId);
        mainChartAutoUnlockTimeoutId = null;
      }

      // Fallback for mobile: if the interaction hint persists, auto-enable chart rendering.
      if (waitingForInteraction && activePlayerTab === 'perfil') {
        mainChartAutoUnlockTimeoutId = setTimeout(() => {
          mainChartAutoUnlockTimeoutId = null;
          if (!mainChartInteractiveReady && isMobilePlayerView() && traitsLoaded && !traitsLoading) {
            enableMainChartRendering();
          }
        }, 900);
      }

      CHART_LOADING_OVERLAYS.forEach(([overlayId, textId]) => {
        const overlay = document.getElementById(overlayId);
        const text = document.getElementById(textId);

        if (overlay) {
          overlay.classList.toggle('stats-loading-overlay--show', showLoading);
          overlay.classList.toggle('stats-loading-overlay--passive', waitingForInteraction && !traitsLoading);
        }

        if (text) {
          text.textContent = loadingMessage;
        }
      });

      const graficarBtns = ['btnPorcentaje', 'btnP90', 'btnTotal', 'btnSoloJugador', 'btnConMedia'];
      graficarBtns.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.disabled = showLoading;
      });

      // The Ranking reads the same traits, and waits while they reload (a new period).
      syncPlayerRankingTraits();
    }

    function canRenderMainChart() {
      return !isMobilePlayerView() || mainChartInteractiveReady;
    }

    function enableMainChartRendering() {
      if (canRenderMainChart()) return;

      mainChartInteractiveReady = true;
      playerDetailRuntime.mainChartInteractiveReady = true;
      syncTraitsLoadingUI();

      runWhenBrowserIdle(() => {
        updateChart();
      }, 600);
    }

    function ensureTraitsDataLoaded() {
      if (traitsLoaded || traitsFetchPending) return;
      if (!window.Livewire) return;

      traitsLoading = true;
      traitsFetchPending = true;
      syncTraitsLoadingUI();
      callPlayerDetailMethod('loadTraitsData');
    }

    function ensureRankingDataLoaded() {
      if (seasonRankingLoaded || seasonRankingLoading) return;
      if (!window.Livewire) return;

      seasonRankingLoading = true;
      renderSeasonRanking();
      callPlayerDetailMethod('loadRankingData');
    }

    function syncHeatmapLoadingUI() {
      const overlay = document.getElementById('heatmapLoadingOverlay');
      if (!overlay) return;

      overlay.classList.toggle('stats-loading-overlay--show', heatmapLoading);

      const label = document.getElementById('heatmapLoadingText');
      if (label) {
        const map = document.getElementById('playerGoalmouth') ? 'mapa de portería' : 'mapa de calor';
        label.textContent = heatmapLoaded
          ? `Actualizando ${map}...`
          : `Cargando ${map}...`;
      }
    }

    function ensureHeatmapDataLoaded() {
      if (heatmapLoaded || heatmapFetchPending) return;
      if (!window.Livewire) return;

      heatmapFetchPending = true;
      heatmapRequestStartedAt = performance.now();
      // heatmapLoading already true from init or invalidate; keep overlay visible
      syncHeatmapLoadingUI();
      callPlayerDetailMethod('loadHeatmapData');
    }

    function ensureHeatmapDataLoadedWhenIdle() {
      runWhenBrowserIdle(() => {
        ensureHeatmapDataLoaded();
      }, 900);
    }

    function isSimilarPlayersLoaded() {
      const panel = document.getElementById('tab-similares');
      return panel?.dataset.similarLoaded === '1';
    }

    function ensureSimilarPlayersDataLoaded() {
      if (similarPlayersLoading || isSimilarPlayersLoaded()) {
        if (isSimilarPlayersLoaded()) {
          bootSimilarPlayersPanel();
        }
        return;
      }
      if (!window.Livewire) return;

      similarPlayersLoading = true;
      Promise.resolve(callPlayerDetailMethod('loadSimilarPlayersData'))
        .then((result) => {
          bootSimilarPlayersPanel();
          similarPlayersPanelInstance()?.setConfig(result || { status: 'error', players: [] });
        })
        .finally(() => {
          similarPlayersLoading = false;
          const panel = document.getElementById('tab-similares');
          if (panel) {
            panel.dataset.similarLoaded = '1';
          }
        });
    }

    function invalidateFilterScopedPlayerData() {
      // The header — its Ranking and last five SKores — stays on the newest
      // season. Desempeño draws the season picked, against its league's mean.
      callPlayerDetailMethod('loadFilterLeagueMean');

      traitsLoaded = false;
      traitsFetchPending = false;
      traitsLoading = true;
      syncTraitsLoadingUI();

      heatmapLoaded = false;
      heatmapFetchPending = false;
      heatmapPoints = [];
      goalmouthData = null;
      renderPlayerHeatmap();

      if (activePlayerTab === 'perfil') {
        heatmapLoading = true;
        syncHeatmapLoadingUI();
      }

      const similaresPanel = document.getElementById('tab-similares');
      if (similaresPanel) {
        similaresPanel.dataset.similarLoaded = '0';
      }

      ensureTraitsDataLoaded();

      if (activePlayerTab === 'perfil') {
        ensureHeatmapDataLoaded();
      }

      if (activePlayerTab === 'similares') {
        ensureSimilarPlayersDataLoaded();
      }

      if (activePlayerTab === 'mapas') {
        window.StatiskicksEventMap?.invalidate('player-detail-map', { filters: true });
        window.StatiskicksEventMap?.activate('player-detail-map');
      } else {
        window.StatiskicksEventMap?.invalidate('player-detail-map', { filters: true });
      }
    }

    window.addEventListener('player-filters-changed', invalidateFilterScopedPlayerData);

    window.addEventListener('filter-league-mean-updated', event => {
      filterLeagueMean = event.detail.leagueMean ?? null;
      if (desempChartInstance) buildDesempChart(desempChartType);
    });

    window.addEventListener('ranking-data-updated', event => {
      seasonRankingData = event.detail.seasonRankingData ?? {};
      seasonRankingLoaded = true;
      seasonRankingLoading = false;
      renderSeasonRanking();
      refreshSkoreAxisCharts();
      // Livewire's DOM morph restores the hardcoded overlay class; re-sync after every response.
      syncHeatmapLoadingUI();
    });

    const desempLogoCache = new Map();

    function normalizePerformanceData(nextData) {
      return {
        summaryMatches: Array.isArray(nextData?.summaryMatches) ? nextData.summaryMatches : [],
        latestMatches: Array.isArray(nextData?.latestMatches) ? nextData.latestMatches : [],
        competitionMatches: Array.isArray(nextData?.competitionMatches) ? nextData.competitionMatches : [],
        seasonRatings: Array.isArray(nextData?.seasonRatings) ? nextData.seasonRatings : [],
      };
    }

    function ensurePerformanceSummaryDataLoaded() {
      if (performanceSummaryLoaded || performanceSummaryLoading) return;
      if (!window.Livewire) return;

      performanceSummaryLoading = true;

      if (performanceSummaryFallbackTimer) {
        clearTimeout(performanceSummaryFallbackTimer);
      }

      // Failsafe: avoid infinite loading overlays if the Livewire response is dropped.
      performanceSummaryFallbackTimer = setTimeout(() => {
        if (!performanceSummaryLoading) return;

        performanceSummaryLoading = false;
        performanceSummaryLoaded = true;
        scheduleHeaderSkoreRender();
      }, 12000);

      Promise.resolve(callPlayerDetailMethod('loadPerformanceSummaryData')).finally(() => {
        if (performanceSummaryFallbackTimer) {
          clearTimeout(performanceSummaryFallbackTimer);
          performanceSummaryFallbackTimer = null;
        }

        if (performanceSummaryLoading) {
          performanceSummaryLoading = false;
          performanceSummaryLoaded = true;
          scheduleHeaderSkoreRender();
        }
      });
    }

    function ensurePerformanceLatestDataLoaded() {
      if (performanceLatestLoaded || performanceLatestLoading) return;
      if (!window.Livewire) {
        performanceLatestLoading = false;
        syncDesempLoadingUI();
        return;
      }

      performanceLatestLoading = true;
      syncDesempLoadingUI();
      callPlayerDetailMethod('loadPerformanceLatestData');
    }

    function ensurePerformanceSeasonDataLoaded() {
      if (performanceSeasonLoaded || performanceSeasonLoading) return;
      if (!window.Livewire) {
        performanceSeasonLoading = false;
        syncDesempLoadingUI();
        return;
      }

      performanceSeasonLoading = true;
      syncDesempLoadingUI();
      callPlayerDetailMethod('loadPerformanceSeasonData');
    }

    function ensureDesempSelectedDataLoaded() {
      if (desempFiltroTipo === 'temporada') {
        ensurePerformanceSeasonDataLoaded();
        return;
      }

      ensurePerformanceLatestDataLoaded();
    }

    function getDesempColors() {
      return {
        /*
          The plotted line is --chart-series, not --accent: --accent is the
          pistachio fill, which on a white card drew a 1.6:1 line and left the
          SKore trend legible only by its shaded area.
        */
        accent: themeColor('--chart-series', '#2C7A55'),
        accentDark: themeColor('--accent-dark', '#1D665D'),
        accentSoft: themeColor('--chart-series-fill', 'rgba(33,110,78,0.16)'),
        gridColor: themeColor('--chart-grid', 'rgba(16,21,17,0.14)'),
        labelColor: themeColor('--chart-tick', '#55625A'),
        titleColor: themeColor('--chart-label', '#141A15'),
        backgroundBar: themeColorRgba('--text-muted', 0.16, '#6b7d70'),
        // Same token the attributes panel's "Jugador y media de la posición"
        // dashed marker uses (percentile-rows.js), so both read as one style.
        outline: themeColor('--chart-outline', 'rgba(16,21,17,0.26)'),
      };
    }

    /**
     * League-wide mean SKore, shared by every Skore chart's dashed
     * reference line (the recent-matches line and the Desempeño bar/line) —
     * see OptaSeasonStatsService::buildSeasonRankingData()'s league_mean_rating.
     */
    function getLeagueMeanSkore() {
      const mean = Number(seasonRankingData?.league_mean_rating);

      return Number.isFinite(mean) ? mean : null;
    }

    /** Desempeño's mean: the filters' season's once they change, until then the header's. */
    function getDesempLeagueMeanSkore() {
      if (filterLeagueMean === undefined) return getLeagueMeanSkore();

      const mean = Number(filterLeagueMean);

      return filterLeagueMean !== null && Number.isFinite(mean) ? mean : null;
    }

    /** Injects the league mean as its own tick on a Skore chart's y-axis, next to the regular stepped ticks. */
    function addMeanTick(scale, meanValue) {
      if (!Number.isFinite(meanValue) || meanValue < scale.min || meanValue > scale.max) return;

      const alreadyClose = scale.ticks.some(tick => Math.abs(tick.value - meanValue) < 0.25);
      if (alreadyClose) return;

      scale.ticks.push({ value: meanValue });
      scale.ticks.sort((a, b) => a.value - b.value);
    }

    /** Colors the mean's own y-axis tick like the dashed line it marks; every other tick keeps the default color. */
    function meanAwareTickColor(defaultColor, meanColor, meanValue) {
      return (context) => Number.isFinite(meanValue) && Math.abs(context.tick.value - meanValue) < 0.005
        ? meanColor
        : defaultColor;
    }

    /** Shows/updates the "what the dashed line means" caption under a Skore chart. */
    function updateSkoreMeanLegend(legendId, textId, meanValue) {
      const legend = document.getElementById(legendId);
      const text = document.getElementById(textId);

      if (!legend || !text) return;

      if (!Number.isFinite(meanValue)) {
        legend.style.display = 'none';
        return;
      }

      text.textContent = `Línea discontinua: media de SKore en la liga (${formatDesempValue(meanValue)})`;
      legend.style.display = '';
    }

    /**
     * Draws a horizontal dashed line at the league mean SKore, styled like
     * the population-average marker on the attributes panel (same color
     * token, same dash pattern) — chart.options.plugins.meanLine carries
     * the value so both the bar and line Skore charts can reuse this plugin.
     */
    const desempMeanLinePlugin = {
      id: 'desempMeanLine',
      afterDraw(chart) {
        const config = chart.options?.plugins?.meanLine;
        const value = Number(config?.value);
        const yScale = chart.scales?.y;

        if (!config?.show || !Number.isFinite(value) || !yScale) return;

        const y = yScale.getPixelForValue(value);
        const { top, bottom, left, right } = chart.chartArea;

        if (y < top || y > bottom) return;

        const ctx = chart.ctx;
        ctx.save();
        ctx.strokeStyle = config.color || 'rgba(16,21,17,0.26)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(right, y);
        ctx.stroke();
        ctx.restore();
      }
    };

    /*
      Where Desempeño's matches cross from one season to the next (fase 8,
      J2: earlier seasons fill the matches asked for): a dashed line between
      the two bars, the earlier season's name beside it, at the top.
    */
    const desempSeasonSeparatorPlugin = {
      id: 'desempSeasonSeparator',
      afterDatasetsDraw(chart) {
        const entries = chart.$desempEntries || [];
        const meta = chart.getDatasetMeta(chart.data.datasets.length - 1);
        if (entries.length < 2 || !meta?.data?.length) return;

        const { top, bottom } = chart.chartArea;
        const c = getDesempColors();
        const ctx = chart.ctx;

        for (let i = 1; i < entries.length; i++) {
          const before = entries[i - 1];
          const after = entries[i];
          if (!before?.season_id || before.season_id === after?.season_id) continue;

          const x = (meta.data[i - 1].x + meta.data[i].x) / 2;
          ctx.save();
          ctx.strokeStyle = c.outline;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 4]);
          ctx.beginPath();
          ctx.moveTo(x, top);
          ctx.lineTo(x, bottom);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = c.labelColor;
          ctx.font = '600 10px Inter, sans-serif';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'top';
          ctx.fillText(before.season_label || 'Temporada anterior', x - 5, top + 2);
          ctx.restore();
        }
      }
    };

    /* "Incluye N partidos de la temporada …" under the chart, when earlier seasons fill it. */
    function updateDesempSeasonNote(entries) {
      const note = document.getElementById('desempSeasonNote');
      if (!note) return;

      const earlier = desempFiltroTipo === 'temporada' ? [] : entries.filter(entry => entry.earlier_season);
      if (!earlier.length) {
        note.hidden = true;
        note.textContent = '';
        return;
      }

      const seasons = [...new Set(earlier.map(entry => entry.season_label).filter(Boolean))];
      const count = earlier.length === 1 ? '1 partido' : `${earlier.length} partidos`;
      note.textContent = seasons.length === 1
        ? `Incluye ${count} de la temporada ${seasons[0]}: la actual no alcanza para los que elegiste.`
        : `Incluye ${count} de temporadas anteriores: la actual no alcanza para los que elegiste.`;
      note.hidden = false;
    }

    function getDesempLogoImage(url, chart) {
      if (!url) return null;

      if (desempLogoCache.has(url)) {
        return desempLogoCache.get(url);
      }

      const image = new Image();
      // A crest the host will not share with the canvas fails here and draws
      // as initials, rather than tainting the canvas the download reads.
      image.crossOrigin = 'anonymous';
      image.onload = () => chart?.draw();
      image.onerror = () => chart?.draw();
      image.src = url;
      desempLogoCache.set(url, image);

      return image;
    }

    const desempLogoSize = 22;
    const desempLogoBottomGap = 6;
    const desempLogoLabelLineHeight = 10;
    const desempLogoLabelTopGap = 5;
    const desempLogoPaddingWithoutLabels = 36;
    const desempLogoPaddingWithLabels = 82;
    const desempLogoMinimumLabelWidth = 72;
    const desempLineChartSidePadding = 44;

    function getDesempLogoLabelLines(entry) {
      if (entry?.league_label) {
        return [
          entry.league_label,
          entry.season_label,
        ]
          .map(value => String(value ?? '').trim())
          .filter(Boolean)
          .slice(0, 4);
      }

      return [
        entry?.opponent_name,
        entry?.match_day || entry?.match_date,
        entry?.competition_label,
        entry?.season_label,
      ]
        .map(value => String(value ?? '').trim())
        .filter(Boolean)
        .slice(0, 4);
    }

    function getDesempLogoAvailableWidth(chart, xScale, index) {
      if (!xScale || !Array.isArray(xScale.ticks) || xScale.ticks.length <= 1) {
        return chart?.chartArea?.width || chart?.width || 0;
      }

      const currentX = xScale.getPixelForTick(index);
      const previousX = index > 0 ? xScale.getPixelForTick(index - 1) : null;
      const nextX = index < xScale.ticks.length - 1 ? xScale.getPixelForTick(index + 1) : null;
      const distances = [previousX, nextX]
        .filter(value => value !== null)
        .map(value => Math.abs(currentX - value));

      return Math.max(0, Math.min(...distances) - 8);
    }

    function shouldShowDesempLogoLabels(chart, entries) {
      if (!Array.isArray(entries) || entries.length === 0) return false;

      const xScale = chart?.scales?.x;

      if (xScale && Array.isArray(xScale.ticks) && xScale.ticks.length > 1) {
        return xScale.ticks.every((_, index) => (
          getDesempLogoAvailableWidth(chart, xScale, index) >= desempLogoMinimumLabelWidth
        ));
      }

      const width = chart?.chartArea?.width || chart?.width || 0;
      return width > 0 && (width / entries.length) >= desempLogoMinimumLabelWidth;
    }

    function drawDesempLogoLabels(ctx, entry, x, y, maxWidth) {
      const lines = getDesempLogoLabelLines(entry);

      if (lines.length === 0) return;

      ctx.save();
      ctx.fillStyle = themeColor('--text-muted', '#6b7d70');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.font = '600 8px Inter, sans-serif';

      lines.forEach((line, index) => {
        ctx.fillText(
          ellipsizeCanvasText(ctx, line, maxWidth),
          x,
          y + (index * desempLogoLabelLineHeight)
        );
      });

      ctx.restore();
    }

    function drawDesempLogo(ctx, entry, x, y, size, chart) {
      const radius = size / 2;
      const centerX = x;
      const centerY = y + radius;
      const image = getDesempLogoImage(entry?.opponent_logo, chart);

      ctx.save();

      if (image && image.complete && image.naturalWidth) {
        // A crest is drawn whole, fitted into the square: a circle would cut
        // a shield's corners.
        const scale = size / Math.max(image.naturalWidth, image.naturalHeight);
        const width = image.naturalWidth * scale;
        const height = image.naturalHeight * scale;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(image, centerX - width / 2, centerY - height / 2, width, height);
      } else {
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.fillStyle = 'rgba(29, 102, 93, 0.12)';
        ctx.fillRect(x - radius, y, size, size);
        ctx.fillStyle = themeColor('--accent-dark', '#1D665D');
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '700 9px Inter, sans-serif';
        ctx.fillText((entry?.opponent_initials || '?').slice(0, 2), centerX, centerY + 0.5);
      }

      ctx.restore();
    }

    const desempLogoPlugin = {
      id: 'desempLogo',
      beforeLayout(chart) {
        const entries = Array.isArray(chart.$desempEntries) ? chart.$desempEntries : [];
        const showLabels = shouldShowDesempLogoLabels(chart, entries);
        const padding = chart.options?.layout?.padding;

        if (!padding || typeof padding !== 'object') return;

        padding.bottom = showLabels ? desempLogoPaddingWithLabels : desempLogoPaddingWithoutLabels;
      },
      afterDraw(chart) {
        const entries = Array.isArray(chart.$desempEntries) ? chart.$desempEntries : [];
        const xScale = chart.scales.x;
        const ctx2 = chart.ctx;

        if (!xScale || entries.length === 0) return;

        const showLabels = shouldShowDesempLogoLabels(chart, entries);

        ctx2.save();
        xScale.ticks.forEach((_, i) => {
          const entry = entries[i] || {};
          const x = xScale.getPixelForTick(i);
          const y = chart.chartArea.bottom + desempLogoBottomGap;
          drawDesempLogo(ctx2, entry, x, y, desempLogoSize, chart);

          if (showLabels) {
            const labelY = y + desempLogoSize + desempLogoLabelTopGap;
            const labelWidth = getDesempLogoAvailableWidth(chart, xScale, i);
            drawDesempLogoLabels(ctx2, entry, x, labelY, Math.max(0, labelWidth));
          }
        });
        ctx2.restore();
      }
    };

    const desempShadowPlugin = {
      id: 'desempShadow',
      beforeDatasetDraw(chart, args) {
        const isBarValueDataset = chart.config.type === 'bar' && args.index === 1;
        const isLineDataset = chart.config.type === 'line' && args.index === 0;

        if (!isBarValueDataset && !isLineDataset) return;

        chart.ctx.save();
        chart.ctx.shadowColor = 'rgba(29, 102, 93, 0.26)';
        chart.ctx.shadowBlur = chart.config.type === 'line' ? 12 : 16;
        chart.ctx.shadowOffsetX = 0;
        chart.ctx.shadowOffsetY = chart.config.type === 'line' ? 5 : 8;
      },
      afterDatasetDraw(chart, args) {
        const isBarValueDataset = chart.config.type === 'bar' && args.index === 1;
        const isLineDataset = chart.config.type === 'line' && args.index === 0;

        if (isBarValueDataset || isLineDataset) {
          chart.ctx.restore();
        }
      }
    };

    function hasValidSkore(entry) {
      return entry && entry.skore !== null && entry.skore !== undefined && entry.skore !== '' && Number.isFinite(Number(entry.skore));
    }

    function getSkoreSummaryEntries() {
      return [...normalizePerformanceData(performanceData).summaryMatches]
        .filter(hasValidSkore)
        .slice(0, 5)
        .reverse();
    }

    function syncSeasonPerformanceSlider(entries) {
      const range = document.getElementById('numTemporadas');
      const valueLabel = document.getElementById('numTemporadasVal');
      const total = Array.isArray(entries) ? entries.filter(hasValidSkore).length : 0;

      if (!range) return total;

      const max = Math.max(1, total);
      const previousTotal = range.dataset.seasonTotal;
      const shouldDefaultToMax = range.dataset.seasonSliderInitialized !== '1'
        || previousTotal !== String(total);

      range.max = String(max);
      range.disabled = total === 0;

      const current = parseInt(range.value, 10);
      const value = total === 0
        ? 1
        : (shouldDefaultToMax ? max : Math.min(max, Math.max(1, Number.isFinite(current) ? current : max)));
      range.value = String(value);
      range.dataset.seasonTotal = String(total);
      range.dataset.seasonSliderInitialized = total === 0 ? '0' : '1';

      if (valueLabel) {
        valueLabel.textContent = total === 0 ? '0' : String(value);
      }

      return value;
    }

    function getDesempSelectedEntries() {
      const normalizedData = normalizePerformanceData(performanceData);

      if (desempFiltroTipo === 'temporada') {
        const seasonEntries = [...normalizedData.seasonRatings].filter(hasValidSkore);
        const requestedCount = syncSeasonPerformanceSlider(seasonEntries);

        return seasonEntries
          .slice(0, requestedCount)
          .reverse();
      }

      const range = document.getElementById('numPartidos');
      const requestedCount = Math.min(30, Math.max(1, parseInt(range?.value, 10) || 15));

      return normalizedData.latestMatches
        .filter(hasValidSkore)
        .slice(0, requestedCount)
        .reverse();
    }

    function formatDesempValue(value) {
      return window.StatiskicksSkore.format(value, 'Sin dato');
    }

    function getDesempTooltipTitle(entries) {
      return function (items) {
        const item = items?.[0];
        const entry = item ? entries[item.dataIndex] : null;

        if (!entry) return 'Sin fecha';

        const titleLines = [
          entry.match_day || entry.match_date || 'Sin fecha',
        ];

        if (entry.competition_label) {
          titleLines.push(`Competición: ${entry.competition_label}`);
        }

        if (entry.season_label) {
          titleLines.push(`Temporada: ${entry.season_label}`);
        }

        return titleLines;
      };
    }

    function getDesempTooltipLabel(entries) {
      return function (item) {
        const entry = entries[item.dataIndex] || {};
        if (entry.league_label) {
          return ` SKore: ${formatDesempValue(entry.skore)} · ${entry.league_label}`;
        }

        const opponent = entry.opponent_name ? ` vs ${entry.opponent_name}` : '';

        return ` SKore: ${formatDesempValue(entry.skore)}${opponent}`;
      };
    }
    
    function initDesempChart() {
      buildDesempChart(desempChartType);
    }

    /**
     * The header's compact take on the "SKore últimos 5 partidos" chart: the same
     * entries and league mean, drawn as a small inline SVG. It takes its colours
     * from CSS variables, so a theme flip needs no redraw.
     */
    function renderHeaderSkoreCard(entries, meanValue) {
      const host = document.getElementById('headerSkoreChart');
      const legend = document.getElementById('headerSkoreLegend');
      const legendText = document.getElementById('headerSkoreLegendText');

      if (!host) return;

      if (!entries.length) {
        const message = performanceSummaryLoaded ? 'Sin SKore disponible.' : 'Cargando SKore...';
        host.innerHTML = `<p class="header-skore-empty">${message}</p>`;
        if (legend) legend.style.display = 'none';
        return;
      }

      const width = 200;
      const height = 124;
      const plotTop = 24;
      const plotBottom = 86;
      const chipY = 107;
      const edge = 16;

      const values = entries.map(entry => Number(entry.skore));
      const hasMean = Number.isFinite(meanValue);
      const extent = hasMean ? [...values, meanValue] : values;
      let low = Math.min(...extent) - 0.4;
      let high = Math.max(...extent) + 0.4;

      if (high - low < 1) {
        const middle = (high + low) / 2;
        low = middle - 0.5;
        high = middle + 0.5;
      }

      const xFor = index => (entries.length === 1
        ? width / 2
        : edge + (index * (width - edge * 2)) / (entries.length - 1));
      const yFor = value => plotBottom - ((value - low) / (high - low)) * (plotBottom - plotTop);
      const points = values.map((value, index) => ({ x: xFor(index), y: yFor(value) }));

      // Catmull-Rom through the points, written as cubic segments, to match the
      // gentle curve of the full chart.
      const smoothing = 0.18;
      let line = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
      for (let i = 0; i < points.length - 1; i++) {
        const before = points[i - 1] || points[i];
        const from = points[i];
        const to = points[i + 1];
        const after = points[i + 2] || to;
        const c1x = from.x + (to.x - before.x) * smoothing;
        const c1y = from.y + (to.y - before.y) * smoothing;
        const c2x = to.x - (after.x - from.x) * smoothing;
        const c2y = to.y - (after.y - from.y) * smoothing;
        line += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${to.x.toFixed(2)} ${to.y.toFixed(2)}`;
      }

      const last = points[points.length - 1];
      const area = `${line} L ${last.x.toFixed(2)} ${plotBottom} L ${points[0].x.toFixed(2)} ${plotBottom} Z`;
      const meanLine = hasMean
        ? `<line class="header-skore-mean" x1="4" x2="${width - 4}" y1="${yFor(meanValue).toFixed(2)}" y2="${yFor(meanValue).toFixed(2)}"/>`
        : '';

      const marks = entries.map((entry, index) => {
        const { x, y } = points[index];
        const initials = escapeHtmlValue(String(entry.opponent_initials || '?').slice(0, 2));
        const opponent = entry.opponent_name ? ` vs ${entry.opponent_name}` : '';
        const when = entry.match_day || entry.match_date || '';
        const hint = escapeHtmlValue(`SKore ${formatDesempValue(entry.skore)}${opponent}${when ? ` · ${when}` : ''}`);
        // The rival's crest where there is one, its initials in a chip where not.
        const rival = entry.opponent_logo
          ? `<image class="header-skore-crest" href="${escapeHtmlValue(entry.opponent_logo)}" x="${(x - 9).toFixed(2)}" y="${chipY - 9}" width="18" height="18" preserveAspectRatio="xMidYMid meet"/>`
          : `<circle class="header-skore-chip" cx="${x.toFixed(2)}" cy="${chipY}" r="8"/>
          <text class="header-skore-chip-text" x="${x.toFixed(2)}" y="${chipY + 2.4}">${initials}</text>`;

        return `<g>
          <title>${hint}</title>
          <circle class="header-skore-dot" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="3.4"/>
          <text class="header-skore-val" x="${x.toFixed(2)}" y="${(y - 7).toFixed(2)}">${formatDesempValue(entry.skore)}</text>
          ${rival}
        </g>`;
      }).join('');

      host.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="SKore de los últimos ${entries.length} partidos">
        ${meanLine}
        <path class="header-skore-area" d="${area}"/>
        <path class="header-skore-line" d="${line}"/>
        ${marks}
      </svg>`;

      if (legend && legendText) {
        legendText.textContent = hasMean ? `Media de la liga (${formatDesempValue(meanValue)})` : '';
        legend.style.display = hasMean ? '' : 'none';
      }
    }

    function renderHeaderSkore() {
      renderHeaderSkoreCard(getSkoreSummaryEntries(), getLeagueMeanSkore());
    }

    function buildDesempChart(type) {
      const canvas = document.getElementById('desempChart');
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      const c = getDesempColors();
      const entries = getDesempSelectedEntries();
      const labels = entries.map(() => '');
      const isLineChart = type === 'line';
      const horizontalPadding = isLineChart ? desempLineChartSidePadding : 4;
      const values = entries.map(entry => {
        const numeric = Number(entry.skore);
        return Number.isFinite(numeric) ? numeric : null;
      });

      if (desempChartInstance) {
        desempChartInstance.destroy();
        desempChartInstance = null;
      }

      const meanValue = getDesempLeagueMeanSkore();

      updateSkoreMeanLegend('desempMeanLegend', 'desempMeanLegendText', meanValue);

      const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: {
            bottom: shouldShowDesempLogoLabels(
              { width: canvas.parentElement?.clientWidth || canvas.clientWidth || 0 },
              entries
            ) ? desempLogoPaddingWithLabels : desempLogoPaddingWithoutLabels,
            top: 26,
            left: horizontalPadding,
            right: horizontalPadding
          }
        },
        plugins: {
          legend: { display: false },
          datalabels: {
            display: true,
            align: 'top',
            anchor: 'end',
            offset: 6,
            clamp: true,
            color: c.titleColor,
            font: { size: 11, weight: '700', family: 'Inter' },
            formatter: value => Number.isFinite(Number(value)) ? formatDesempValue(value) : '',
          },
          tooltip: {
            callbacks: {
              title: getDesempTooltipTitle(entries),
              label: getDesempTooltipLabel(entries),
            }
          },
          meanLine: { show: true, value: meanValue, color: c.outline },
        },
        scales: {
          x: { grid: { display: false }, ticks: { display: false }, border: { color: c.gridColor } },
          y: {
            min: getSkoreAxisFloor(values),
            max: 10,
            grid: { color: c.gridColor },
            ticks: {
              color: meanAwareTickColor(c.labelColor, c.outline, meanValue),
              font: { size: 11 },
              stepSize: 2,
              callback: value => formatDesempValue(value),
            },
            afterBuildTicks: scale => addMeanTick(scale, meanValue),
            border: { display: false },
            title: { display: true, text: 'SKore', color: c.titleColor, font: { size: 11, family: 'Inter', weight: '700' } }
          }
        }
      };

      if (type === 'bar') {
        desempChartInstance = new Chart(ctx, {
          type: 'bar',
          data: {
            labels,
            datasets: [
              {
                label: 'Resto',
                data: entries.map(() => 10),
                backgroundColor: c.backgroundBar,
                borderRadius: { topLeft: 20, topRight: 20 },
                borderSkipped: 'bottom',
                grouped: false,
                barPercentage: 0.68,
                categoryPercentage: 0.74,
                order: 2,
                datalabels: { display: false },
              },
              {
                label: 'SKore',
                data: values,
                // One colour, the chart series': a SKore is not painted by its value.
                backgroundColor: themeColor('--chart-series', '#2C7A55'),
                borderRadius: { topLeft: 20, topRight: 20 },
                borderSkipped: 'bottom',
                grouped: false,
                barPercentage: 0.68,
                categoryPercentage: 0.74,
                order: 1,
              }
            ]
          },
          plugins: [desempShadowPlugin, desempLogoPlugin, desempMeanLinePlugin, desempSeasonSeparatorPlugin],
          options: commonOptions,
        });
      } else {
        desempChartInstance = new Chart(ctx, {
          type: 'line',
          data: {
            labels,
            datasets: [{
              label: 'SKore',
              data: values,
              borderColor: c.accent,
              backgroundColor: c.accentSoft,
              borderWidth: 2.5,
              pointBackgroundColor: c.accent,
              pointBorderColor: '#ffffff',
              pointBorderWidth: 1.5,
              pointRadius: 4,
              pointHoverRadius: 6,
              fill: true,
              tension: 0.35,
            }]
          },
          plugins: [desempShadowPlugin, desempLogoPlugin, desempMeanLinePlugin, desempSeasonSeparatorPlugin],
          options: commonOptions,
        });
      }

      desempChartInstance.$desempEntries = entries;
      desempChartInstance.update();
      updateDesempSeasonNote(entries);
    }

    document.addEventListener('input', function (event) {
      const seasonRange = event.target.closest('#numTemporadas');
      if (seasonRange) {
        const max = Math.max(1, parseInt(seasonRange.max, 10) || 1);
        const value = Math.min(max, Math.max(1, parseInt(seasonRange.value, 10) || max));
        seasonRange.value = value;
        seasonRange.dataset.seasonSliderInitialized = '1';

        const valueLabel = document.getElementById('numTemporadasVal');
        if (valueLabel) valueLabel.textContent = value;

        if (desempChartInstance) buildDesempChart(desempChartType);
        return;
      }

      const range = event.target.closest('#numPartidos');
      if (!range) return;

      const value = Math.min(30, Math.max(1, parseInt(range.value, 10) || 15));
      range.value = value;

      const valueLabel = document.getElementById('numPartidosVal');
      if (valueLabel) valueLabel.textContent = value;

      if (desempChartInstance) buildDesempChart(desempChartType);
    });

    document.addEventListener('click', function (event) {
      const button = event.target.closest('#btnDesempPorPartido, #btnDesempPorTemporada, #btnLineas, #btnBarrasDesemp');
      if (!button) return;

      if (button.id === 'btnDesempPorPartido') {
        setDesempFiltroTipo('partido');
        ensurePerformanceLatestDataLoaded();
      }

      if (button.id === 'btnDesempPorTemporada') {
        setDesempFiltroTipo('temporada');
        ensurePerformanceSeasonDataLoaded();
      }

      if (button.id === 'btnLineas') {
        if (desempChartType === 'line') return;
        desempChartType = 'line';
        setToggleActive('btnLineas', true);
        setToggleActive('btnBarrasDesemp', false);
        buildDesempChart('line');
      }

      if (button.id === 'btnBarrasDesemp') {
        if (desempChartType === 'bar') return;
        desempChartType = 'bar';
        setToggleActive('btnBarrasDesemp', true);
        setToggleActive('btnLineas', false);
        buildDesempChart('bar');
      }
    });

    window.addEventListener('performance-data-updated', event => {
      const loadType = event.detail.loadType || 'unknown';
      performanceData = normalizePerformanceData(event.detail.performanceData ?? {});

      if (loadType === 'summary') {
        performanceSummaryLoaded = true;
        performanceSummaryLoading = false;
        if (performanceSummaryFallbackTimer) {
          clearTimeout(performanceSummaryFallbackTimer);
          performanceSummaryFallbackTimer = null;
        }
      } else if (performanceData.summaryMatches.length > 0) {
        performanceSummaryLoaded = true;
      }

      if (performanceSummaryLoading && Array.isArray(performanceData.summaryMatches)) {
        performanceSummaryLoading = false;
        performanceSummaryLoaded = true;
      }

      if (loadType === 'latest') {
        performanceLatestLoaded = true;
        performanceLatestLoading = false;
      } else if (loadType === 'reset') {
        performanceLatestLoaded = false;
        performanceLatestLoading = false;
      } else if (performanceData.latestMatches.length > 0) {
        performanceLatestLoaded = true;
      }

      if (loadType === 'season') {
        performanceSeasonLoaded = true;
        performanceSeasonLoading = false;
      } else if (loadType === 'reset') {
        performanceSeasonLoaded = false;
        performanceSeasonLoading = false;
      } else if (performanceData.seasonRatings.length > 0) {
        performanceSeasonLoaded = true;
      }
      syncDesempLoadingUI();

      if (activePlayerTab === 'perfil') {
        scheduleHeaderSkoreRender();
      }

      // Livewire's DOM morph may restore the hardcoded overlay class; correct it.
      syncHeatmapLoadingUI();

      if (activePlayerTab === 'desempeno') {
        if (loadType === 'reset') {
          ensureDesempSelectedDataLoaded();
        }

        if (['latest', 'season', 'reset'].includes(loadType)) {
          syncDesempChartCanvas();
          if (desempChartInstance) {
            buildDesempChart(desempChartType);
          }
        }
      }
    });

    function registerPlayerResizeHandlers() {
      if (window.__playerDetailResizeHandlersRegistered) return;
      window.__playerDetailResizeHandlersRegistered = true;

      let resizeRafId = null;
      let resizeTimeoutId = null;

      const runResizeWork = () => {
        drawPizzaChart();

        if (activePlayerTab === 'perfil') {
          renderPlayerHeatmap();
        }

      };

      window.addEventListener('resize', () => {
        if (resizeRafId !== null) {
          cancelAnimationFrame(resizeRafId);
        }

        if (resizeTimeoutId !== null) {
          clearTimeout(resizeTimeoutId);
        }

        resizeRafId = requestAnimationFrame(() => {
          resizeRafId = null;
          runResizeWork();
        });

        resizeTimeoutId = setTimeout(() => {
          resizeTimeoutId = null;
          runResizeWork();
        }, 120);
      });
    }

 
    /*
      The density model, thresholds and palettes live in heatmap.js so the
      event maps ("Mapas y gráficas") draw with the same ones. What stays here
      is this pitch's projection: vertical, own goal at the bottom, so a
      point's x (towards the opponent's goal) runs up the canvas and its y
      across it.

      `pitch` is in the unscaled canvas' pixels and `scale` maps it onto the
      image, so the mobile path can draw at reduced resolution through the
      same code.
    */
    function buildHeatmapImage(points, pitch, width, height, scale) {
      const pitchLeft = pitch.left * scale;
      const pitchTop = pitch.top * scale;
      const pitchWidth = pitch.width * scale;
      const pitchHeight = pitch.height * scale;

      return window.StatiskicksHeatmap.buildImage(points, {
        width,
        height,
        shortSide: Math.min(pitchWidth, pitchHeight),
        project: (x, y) => [pitchLeft + (y / 100) * pitchWidth, pitchTop + (1 - x / 100) * pitchHeight],
      });
    }

    function resizeHeatmapCanvas(canvas) {
      const dpr = isMobilePlayerView() ? 1 : getCanvasDpr();
      const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const height = Math.max(1, Math.round(canvas.clientHeight * dpr));

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      return { width, height };
    }

    function sampleHeatmapPoints(points, maxPoints) {
      return window.StatiskicksHeatmap.sample(points, maxPoints);
    }

    function renderPlayerHeatmapMobile(ctx, pitch, points) {
      const renderPoints = sampleHeatmapPoints(points, 2400);
      const mobileScale = 0.56;
      const width = Math.max(1, Math.round((pitch.left * 2 + pitch.width) * mobileScale));
      const height = Math.max(1, Math.round((pitch.top * 2 + pitch.height) * mobileScale));

      const image = buildHeatmapImage(renderPoints, pitch, width, height, mobileScale);

      if (!image) {
        return;
      }

      if (!heatmapMobileBufferCanvas) {
        heatmapMobileBufferCanvas = document.createElement('canvas');
      }

      if (heatmapMobileBufferCanvas.width !== width || heatmapMobileBufferCanvas.height !== height) {
        heatmapMobileBufferCanvas.width = width;
        heatmapMobileBufferCanvas.height = height;
        heatmapMobileBufferCtx = null;
      }

      if (!heatmapMobileBufferCtx) {
        heatmapMobileBufferCtx = heatmapMobileBufferCanvas.getContext('2d', { willReadFrequently: true });
      }

      heatmapMobileBufferCtx.putImageData(image, 0, 0);

      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.beginPath();
      ctx.rect(pitch.left, pitch.top, pitch.width, pitch.height);
      ctx.clip();
      ctx.drawImage(heatmapMobileBufferCanvas, 0, 0, width, height, 0, 0, pitch.left * 2 + pitch.width, pitch.top * 2 + pitch.height);
      ctx.restore();
    }

    function renderPlayerHeatmap() {
      // A GK's card is his goal instead (partials/player-detail-goalmouth).
      const goalmouth = document.getElementById('playerGoalmouth');
      if (goalmouth) {
        window.StatiskicksGoalmouth?.render(goalmouth, goalmouthData, heatmapEmptyMessage);
        return;
      }

      const wrapper = document.getElementById('playerHeatmapWrapper');
      const canvas = document.getElementById('playerHeatmapCanvas');
      const empty = document.getElementById('playerHeatmapEmpty');

      if (!wrapper || !canvas || !empty) return;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const { width, height } = resizeHeatmapCanvas(canvas);

      ctx.clearRect(0, 0, width, height);

      const pitch = {
        left: (20 / 360) * width,
        top: (20 / 560) * height,
        width: (320 / 360) * width,
        height: (520 / 560) * height,
      };

      const validPoints = (Array.isArray(heatmapPoints) ? heatmapPoints : []).filter(point =>
        Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.y))
      );

      empty.textContent = heatmapEmptyMessage || 'Sin eventos para los filtros seleccionados.';
      empty.hidden = validPoints.length > 0;

      if (!validPoints.length) return;

      if (isMobilePlayerView()) {
        renderPlayerHeatmapMobile(ctx, pitch, validPoints);
        return;
      }

      const image = buildHeatmapImage(validPoints, pitch, width, height, 1);

      if (!image) return;

      if (!heatmapBufferCanvas) {
        heatmapBufferCanvas = document.createElement('canvas');
      }

      if (heatmapBufferCanvas.width !== width || heatmapBufferCanvas.height !== height) {
        heatmapBufferCanvas.width = width;
        heatmapBufferCanvas.height = height;
        heatmapBufferCtx = null;
      }

      if (!heatmapBufferCtx) {
        heatmapBufferCtx = heatmapBufferCanvas.getContext('2d', { willReadFrequently: true });
      }

      heatmapBufferCtx.putImageData(image, 0, 0);

      ctx.save();
      ctx.beginPath();
      ctx.rect(pitch.left, pitch.top, pitch.width, pitch.height);
      ctx.clip();
      ctx.drawImage(heatmapBufferCanvas, 0, 0);
      ctx.restore();
    }

    function initHeatmapObserver() {
      const wrapper = document.getElementById('playerHeatmapWrapper');
      if (!wrapper || typeof ResizeObserver === 'undefined') return;

      if (heatmapResizeObserver) {
        heatmapResizeObserver.disconnect();
      }

      heatmapResizeObserver = new ResizeObserver(() => {
        renderPlayerHeatmap();
      });

      heatmapResizeObserver.observe(wrapper);
    }

    (function initThemeChangeObserver() {
      if (typeof MutationObserver === 'undefined') return;
      new MutationObserver(mutations => {
        const changed = mutations.some(m => m.type === 'attributes' && m.attributeName === 'data-theme');
        if (!changed) return;
        // Invalidate buffer canvases so they are rebuilt with correct palette/colors
        heatmapBufferCanvas = null;
        heatmapBufferCtx = null;
        heatmapMobileBufferCanvas = null;
        heatmapMobileBufferCtx = null;
        renderPlayerHeatmap();
        // The comparison is painted, not styled: its radar's ink and its pitches'
        // lines and heat follow the theme on a repaint (renderChart() does both).
        const comparison = comparisonPanelInstance();
        if (comparison) comparison.renderChart(); else repaintComparisonHeatmaps();
      }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    })();

    window.addEventListener('heatmap-data-updated', event => {
      heatmapPoints = Array.isArray(event.detail.heatmapPoints)
        ? event.detail.heatmapPoints
        : [];
      goalmouthData = event.detail.goalmouth ?? null;
      heatmapEmptyMessage = event.detail.emptyMessage || 'Sin eventos para los filtros seleccionados.';

      heatmapLoaded = true;
      heatmapLoading = false;
      heatmapFetchPending = false;
      syncHeatmapLoadingUI();

      const startedAt = heatmapRequestStartedAt;
      heatmapRequestStartedAt = null;

      if (!heatmapRenderIdlePending) {
        heatmapRenderIdlePending = true;

        runWhenBrowserIdle(() => {
          heatmapRenderIdlePending = false;
          renderPlayerHeatmap();
          initHeatmapObserver();

          profilePlayerClient('heatmap.data', {
            point_count: Array.isArray(heatmapPoints) ? heatmapPoints.length : 0,
            duration_ms: startedAt ? Number((performance.now() - startedAt).toFixed(2)) : null,
          });
        }, 900);
      }
    });

    registerPlayerResizeHandlers();

    function syncDesempFiltroTipoUI() {
      setToggleActive('btnDesempPorPartido', desempFiltroTipo === 'partido');
      setToggleActive('btnDesempPorTemporada', desempFiltroTipo === 'temporada');

      const partidoCtrl = document.getElementById('filtroPartidoCtrl');
      const temporadaCtrl = document.getElementById('filtroTemporadaCtrl');

      if (partidoCtrl) {
        partidoCtrl.classList.toggle('d-none', desempFiltroTipo !== 'partido');
      }

      if (temporadaCtrl) {
        temporadaCtrl.classList.toggle('d-none', desempFiltroTipo !== 'temporada');
      }
    }

    function setDesempFiltroTipo(nextTipo) {
      const normalizedTipo = nextTipo === 'temporada' ? 'temporada' : 'partido';
      const changed = desempFiltroTipo !== normalizedTipo;

      desempFiltroTipo = normalizedTipo;
      syncDesempFiltroTipoUI();

      if (changed && desempChartInstance) {
        buildDesempChart(
          desempChartType,
          parseInt(document.getElementById('numPartidos')?.value) || 15
        );
      }
    }

    /* Similar players tab */
    function registerSimilarPlayersPanel() {
      if (window.__similarPlayersPanelRegistered) {
        return;
      }

      window.__similarPlayersPanelRegistered = true;

      Alpine.data('similarPlayersPanel', (config) => ({
        config: config || null,
        expanded: false,
        loading: false,
        comparingId: null,
        openMenu: null,
        // A slider at an end is an open end: no limit sent.
        AGE_FLOOR: 15,
        AGE_CEILING: 40,
        MINUTES_FLOOR: 450,
        SKORE_FLOOR: 5,
        SKORE_CEILING: 9,
        draft: { ageLow: 15, ageHigh: 40, minutes: 450, skore: 5 },
        requestSeq: 0,
        scopeOptions: [
          { key: 'league', label: 'Misma liga' },
          { key: 'region', label: 'Misma región' },
          { key: 'all', label: 'Todas las ligas' },
        ],
        sortColumns: [
          { key: 'age', label: 'Edad' },
          { key: 'minutes', label: 'Min' },
          { key: 'similarity', label: 'Similitud' },
          { key: 'skore', label: 'SKore' },
        ],
        sortKey: 'similarity',
        sortDesc: true,

        emptyMessages: {
          not_computed: ['Los jugadores similares de esta temporada aún no están calculados.', 'Se calculan con cada actualización de datos de la liga.'],
          too_few_minutes: ['Necesita al menos 450 minutos en la temporada para compararlo por estilo.', 'Cuando los juegue, aparecerán aquí los jugadores que juegan como él.'],
          error: ['No se pudieron cargar los jugadores similares.', 'Inténtalo de nuevo en unos minutos.'],
        },

        init() {
          if (this.config) {
            this.setConfig(this.config);
          }
        },

        // A payload from loadSimilarPlayersData(): the first two results
        // drawn on the radar beside the subject.
        setConfig(payload) {
          this.config = payload || null;
          this.expanded = false;
          this.sortKey = 'similarity';
          this.sortDesc = true;
          this.syncDraft();
        },

        // The sliders where the applied filters are.
        syncDraft() {
          const filters = this.config?.filters || {};
          this.draft = {
            ageLow: filters.age_min ?? this.AGE_FLOOR,
            ageHigh: filters.age_max ?? this.AGE_CEILING,
            minutes: Math.min(filters.min_minutes ?? this.MINUTES_FLOOR, this.minutesCeiling()),
            skore: filters.min_skore ?? this.SKORE_FLOOR,
          };
        },

        rangeStyle(low, high, floor, ceiling) {
          const a = Math.min(Number(low), Number(high));
          const b = Math.max(Number(low), Number(high));
          const span = ceiling - floor || 1;
          return `--range-left:${((a - floor) / span) * 100}%;--range-width:${((b - a) / span) * 100}%;`;
        },

        keepAgeOrder(moved) {
          if (this.draft.ageLow > this.draft.ageHigh) {
            if (moved === 'low') this.draft.ageHigh = this.draft.ageLow;
            else this.draft.ageLow = this.draft.ageHigh;
          }
        },

        applyAge() {
          this.applyFilters({
            age_min: this.draft.ageLow > this.AGE_FLOOR ? this.draft.ageLow : null,
            age_max: this.draft.ageHigh < this.AGE_CEILING ? this.draft.ageHigh : null,
          });
        },

        applySkore() {
          const skore = Math.round(Number(this.draft.skore) * 10) / 10;
          this.applyFilters({ min_skore: skore > this.SKORE_FLOOR ? skore : null });
        },

        minutesCeiling() {
          return Math.max(this.MINUTES_FLOOR + 50, Number(this.config?.minutes_ceiling) || this.MINUTES_FLOOR + 50);
        },

        ageLabel() {
          const filters = this.config?.filters || {};
          const low = filters.age_min ?? null;
          const high = filters.age_max ?? null;

          if (low === null && high === null) return 'Cualquier edad';
          if (low === null) return `Hasta ${high} años`;
          if (high === null) return `${low} años o más`;

          return `${low}–${high} años`;
        },

        emptyMessage() {
          return this.emptyMessages[this.config?.status] || this.emptyMessages.error;
        },

        players() {
          return Array.isArray(this.config?.players) ? this.config.players : [];
        },

        // The twenty most similar, in the order picked: sorting reorders them,
        // it does not reach past them.
        sortedPlayers() {
          const key = this.sortKey;
          const sign = this.sortDesc ? -1 : 1;
          const value = (player) => (player[key] === null || player[key] === undefined ? null : Number(player[key]));

          return [...this.players()].sort((a, b) => {
            const x = value(a);
            const y = value(b);

            if (x === y) return b.similarity - a.similarity;
            if (x === null) return 1;
            if (y === null) return -1;

            return sign * (x - y);
          });
        },

        visiblePlayers() {
          const sorted = this.sortedPlayers();
          return this.expanded ? sorted : sorted.slice(0, this.config?.shown || 10);
        },

        sortBy(key) {
          if (this.sortKey === key) {
            this.sortDesc = !this.sortDesc;
          } else {
            this.sortKey = key;
            this.sortDesc = key !== 'age';
          }
        },

        scopeOption() {
          return this.scopeOptions.find((option) => option.key === this.config?.filters?.scope) || this.scopeOptions[0];
        },

        minutesLabel(minutes) {
          return `${Number(minutes || 450).toLocaleString('es-MX')} min`;
        },

        skoreLabel(skore) {
          return skore === null || skore === undefined ? 'Sin mínimo' : `Desde ${window.StatiskicksSkore.format(skore)}`;
        },

        // The platform's one SKore format (skore.js): two decimals, a point.
        formatSkore(value) {
          return window.StatiskicksSkore.format(value);
        },

        // The colour band of a SKore's chip (skore.js), the rank bars' three.
        skoreGrade(value) {
          return window.StatiskicksSkore.grade(value);
        },

        // Every filter asks the server again: the ranking is over the whole
        // league, so a filter must be applied before the top results are cut.
        async applyFilters(patch) {
          const filters = { ...(this.config.filters || {}), ...patch };
          // Two releases in a row: only the last one's answer is drawn.
          const request = ++this.requestSeq;
          this.loading = true;

          try {
            const result = await callPlayerDetailMethod('similarPlayers', filters);

            if (request === this.requestSeq && result && result.status === 'ready') {
              this.config = result;
              this.expanded = false;
              this.sortKey = 'similarity';
              this.sortDesc = true;
              this.syncDraft();
            }
          } finally {
            if (request === this.requestSeq) {
              this.loading = false;
            }
          }
        },

        clearFilters() {
          this.applyFilters({ scope: 'all', age_min: null, age_max: null, min_minutes: 450, min_skore: null });
        },

        // The row's player into Comparar beside this one (compareWith()
        // makes room in a full list), then that tab.
        async compareWith(playerId) {
          if (this.comparingId !== null) {
            return;
          }

          this.comparingId = playerId;

          try {
            const result = await callPlayerDetailMethod('compareWith', playerId);
            const panel = document.getElementById('tab-comparar');

            if (panel) {
              panel.dataset.comparisonLoaded = '1';
            }

            showPlayerTab('comparar');
            bootComparisonPanel();
            requestAnimationFrame(() => applyComparisonResult(result));
          } finally {
            this.comparingId = null;
          }
        },

        playerImage(player) {
          if (player?.image) {
            return player.image;
          }

          const name = encodeURIComponent(player?.name || 'Jugador');
          return `https://ui-avatars.com/api/?name=${name}&background=1D665D&color=fff&size=80`;
        },

        onPlayerImageError(event, name) {
          const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'Jugador')}&background=1D665D&color=fff&size=80`;
          if (event?.target && event.target.src !== fallback) {
            event.target.src = fallback;
          }
        },

      }));
    }

    function findSimilarPlayersPanelRoot() {
      return document.querySelector('#tab-similares [x-data*="similarPlayersPanel"]');
    }

    function similarPlayersPanelInstance() {
      const root = findSimilarPlayersPanelRoot();
      return root && root._x_dataStack?.length ? root._x_dataStack[0] : null;
    }

    function bootSimilarPlayersPanel() {
      if (typeof Alpine === 'undefined') {
        return;
      }

      registerSimilarPlayersPanel();

      const root = findSimilarPlayersPanelRoot();
      if (!root) {
        return;
      }

      if (!root._x_dataStack?.length) {
        Alpine.initTree(root);
      }
    }

    if (typeof Alpine !== 'undefined') {
      registerSimilarPlayersPanel();
    } else {
      document.addEventListener('alpine:init', registerSimilarPlayersPanel);
    }

    document.addEventListener('livewire:navigated', bootSimilarPlayersPanel);

    document.addEventListener('livewire:init', () => {
      Livewire.hook('morph.updated', ({ el }) => {
        if (!el || typeof el.querySelector !== 'function') {
          return;
        }

        const panelRoot = el.id === 'tab-similares'
          ? el.querySelector('[x-data*="similarPlayersPanel"]')
          : (el.matches?.('[x-data*="similarPlayersPanel"]') ? el : el.querySelector('[x-data*="similarPlayersPanel"]'));

        if (panelRoot && !panelRoot._x_dataStack?.length) {
          bootSimilarPlayersPanel();
        }
      });
    });

    // =========================================================================
    // SK-05: player comparison ("Comparar" tab)
    // =========================================================================

    function findComparisonPanelRoot() {
      return document.querySelector('#tab-comparar [x-data*="comparisonPanel"]');
    }

    function comparisonPanelInstance() {
      const root = findComparisonPanelRoot();
      return root && root._x_dataStack?.length ? root._x_dataStack[0] : null;
    }

    function isComparisonDataLoaded() {
      const panel = document.getElementById('tab-comparar');
      return panel?.dataset.comparisonLoaded === '1';
    }

    function bootComparisonPanel() {
      if (typeof Alpine === 'undefined') return;

      registerComparisonPanel();

      const root = findComparisonPanelRoot();
      if (!root) return;

      if (!root._x_dataStack?.length) {
        Alpine.initTree(root);
      }
    }

    function ensureComparisonDataLoaded() {
      if (comparisonDataLoadingFlag) return;

      if (isComparisonDataLoaded()) {
        bootComparisonPanel();
        return;
      }

      if (!window.Livewire) return;

      comparisonDataLoadingFlag = true;
      Promise.resolve(callPlayerDetailMethod('ensureComparisonDataLoaded'))
        .then(result => {
          const panel = document.getElementById('tab-comparar');
          if (panel) panel.dataset.comparisonLoaded = '1';
          applyComparisonResult(result);
        })
        .finally(() => {
          comparisonDataLoadingFlag = false;
        });
    }

    function applyComparisonResult(result) {
      const panel = comparisonPanelInstance();
      if (!panel || !result) return;

      panel.players = Array.isArray(result.players) ? result.players : [];
      panel.errorMessage = result.error || null;
      panel.rebuildTraitsCatalog();
      panel.$nextTick(() => panel.renderChart());
      panel.loadPendingPositions();
    }

    // Each compared player's position as its Spanish acronym, full name on hover.
    const COMPARISON_POSITION_LABELS = JSON.parse('{\u0022GK\u0022:{\u0022short\u0022:\u0022POR\u0022,\u0022name\u0022:\u0022Portero\u0022},\u0022LB\u0022:{\u0022short\u0022:\u0022LI\u0022,\u0022name\u0022:\u0022Lateral izquierdo\u0022},\u0022LCB\u0022:{\u0022short\u0022:\u0022DFCI\u0022,\u0022name\u0022:\u0022Defensa central izquierdo\u0022},\u0022CB\u0022:{\u0022short\u0022:\u0022DFC\u0022,\u0022name\u0022:\u0022Defensa central\u0022},\u0022RCB\u0022:{\u0022short\u0022:\u0022DFCD\u0022,\u0022name\u0022:\u0022Defensa central derecho\u0022},\u0022RB\u0022:{\u0022short\u0022:\u0022LD\u0022,\u0022name\u0022:\u0022Lateral derecho\u0022},\u0022LWB\u0022:{\u0022short\u0022:\u0022CAI\u0022,\u0022name\u0022:\u0022Carrilero izquierdo\u0022},\u0022RWB\u0022:{\u0022short\u0022:\u0022CAD\u0022,\u0022name\u0022:\u0022Carrilero derecho\u0022},\u0022LDMF\u0022:{\u0022short\u0022:\u0022MCDI\u0022,\u0022name\u0022:\u0022Mediocentro defensivo izquierdo\u0022},\u0022DMF\u0022:{\u0022short\u0022:\u0022MCD\u0022,\u0022name\u0022:\u0022Mediocentro defensivo\u0022},\u0022RDMF\u0022:{\u0022short\u0022:\u0022MCDD\u0022,\u0022name\u0022:\u0022Mediocentro defensivo derecho\u0022},\u0022LCMF\u0022:{\u0022short\u0022:\u0022INI\u0022,\u0022name\u0022:\u0022Interior izquierdo\u0022},\u0022CMF\u0022:{\u0022short\u0022:\u0022MC\u0022,\u0022name\u0022:\u0022Mediocentro\u0022},\u0022RCMF\u0022:{\u0022short\u0022:\u0022IND\u0022,\u0022name\u0022:\u0022Interior derecho\u0022},\u0022LW\u0022:{\u0022short\u0022:\u0022VI\u0022,\u0022name\u0022:\u0022Volante izquierdo\u0022},\u0022RW\u0022:{\u0022short\u0022:\u0022VD\u0022,\u0022name\u0022:\u0022Volante derecho\u0022},\u0022LAMF\u0022:{\u0022short\u0022:\u0022MCOI\u0022,\u0022name\u0022:\u0022Mediapunta izquierdo\u0022},\u0022AMF\u0022:{\u0022short\u0022:\u0022MCO\u0022,\u0022name\u0022:\u0022Mediapunta\u0022},\u0022RAMF\u0022:{\u0022short\u0022:\u0022MCOD\u0022,\u0022name\u0022:\u0022Mediapunta derecho\u0022},\u0022LWF\u0022:{\u0022short\u0022:\u0022EI\u0022,\u0022name\u0022:\u0022Extremo izquierdo\u0022},\u0022CF\u0022:{\u0022short\u0022:\u0022DC\u0022,\u0022name\u0022:\u0022Delantero centro\u0022},\u0022RWF\u0022:{\u0022short\u0022:\u0022ED\u0022,\u0022name\u0022:\u0022Extremo derecho\u0022},\u0022DEF\u0022:{\u0022short\u0022:\u0022DEF\u0022,\u0022name\u0022:\u0022Defensa\u0022},\u0022MID\u0022:{\u0022short\u0022:\u0022MED\u0022,\u0022name\u0022:\u0022Mediocampista\u0022},\u0022FWD\u0022:{\u0022short\u0022:\u0022DEL\u0022,\u0022name\u0022:\u0022Delantero\u0022}}');

    function registerComparisonPanel() {
      if (window.__comparisonPanelRegistered) return;
      window.__comparisonPanelRegistered = true;

      Alpine.data('comparisonPanel', (initialPlayers) => ({
        players: Array.isArray(initialPlayers) ? initialPlayers : [],
        chartMode: 'barras', // 'barras' (the default) | 'radar'
        chartUnit: 'porcentaje', // 'porcentaje' | 'p90' | 'total' — mirrors Perfil's own toggle
        traitsData: [],
        visibleTraits: new Set(),
        traitsSearchQuery: '',
        searchQuery: '',
        searchResults: [],
        searchLoading: false,
        searchTimer: null,
        searchController: null,
        addingId: null,
        errorMessage: null,
        compareColors: comparisonSeriesColors,

        /*
          The grid header's surname whole in its fixed 5.75rem column: the
          type shrinks until the cell no longer overflows (Dario, 6-nov:
          rather than a "…"), never under 7px (data-sk-fit); past that the
          column's ellipsis still cuts. Run again whenever the cell is
          resized (shown, the tab opened, the chart switched), once the fonts
          are in, and when the name or the slot changes (the th's x-effect).
        */
        watchName(th) {
          comparisonNameObserver?.observe(th);
          document.fonts?.ready.then(() => fitComparisonName(th));
          fitComparisonName(th);
        },

        fitName(th) {
          fitComparisonName(th);
        },

        positionShort(code) {
          return COMPARISON_POSITION_LABELS[code]?.short || '';
        },

        positionName(code) {
          return COMPARISON_POSITION_LABELS[code]?.name || '';
        },

        /*
          A compared player's card for the download menu (SK-18.2,
          chart-download.js): his own on his heat map, every player's on the
          radar and the grid, each ringed in his series' colour so the cards
          read as the chart's legend.
        */
        downloadCard(p, index) {
          return {
            name: p.name,
            club: p.team_name && p.team_name !== '-' ? p.team_name : null,
            league: p.league_name || null,
            season: p.season_label || null,
            age: p.age || null,
            position: this.positionShort(p.position) || null,
            photo: p.image || null,
            color: this.compareColors[index] || null,
          };
        },

        downloadCards() {
          return JSON.stringify(this.players.map((p, index) => this.downloadCard(p, index)));
        },

        init() {
          this.rebuildTraitsCatalog();
          this.$watch('searchQuery', value => this.queueSearch(value));
          this.$nextTick(() => this.renderChart());
          this.loadPendingPositions();
        },

        // The attribute catalog is the current player's own (index 0) —
        // every player's series is then read off this same key set, so a
        // stat one of them never recorded simply reads as no value.
        rebuildTraitsCatalog() {
          const primary = this.players[0];
          this.traitsData = (primary && Array.isArray(primary.traits)) ? primary.traits : [];
          this.visibleTraits = getDefaultVisibleTraits(this.traitsData);
        },

        visibleTraitEntries() {
          return this.traitsData.filter(t => this.visibleTraits.has(t.key));
        },

        setChartMode(mode) {
          if (this.chartMode === mode) return;
          this.chartMode = mode;
          this.$nextTick(() => this.renderChart());
        },

        setChartUnit(unit) {
          if (this.chartUnit === unit) return;
          this.chartUnit = unit;
          this.$nextTick(() => this.renderChart());
        },

        // Radar is the only mode still drawn imperatively (Chart.js) —
        // "Barras" is now the spectrum/dumbbell rows below, plain reactive
        // Alpine markup bound straight to players/chartUnit/visibleTraits,
        // so it needs no explicit render call of its own.
        renderChart() {
          if (this.chartMode === 'radar') {
            renderComparisonRadarChart(this.players, this.visibleTraitEntries(), this.chartUnit);
          }

          this.renderHeatmaps();
        },

        // One player's place (0-100) along a trait - his percentile, in any
        // unit (comparisonSeriesPoint()) - and the figure the unit shows.
        spectrumPoint(player, trait) {
          return comparisonSeriesPoint(player, trait, this.chartUnit);
        },

        hasTrait(player, trait) {
          return comparisonTrait(player, trait) !== null;
        },

        // The site's tooltip (data-sk-tip) on a dot or a grid cell, in Perfil's words.
        tipTitle(player, trait) {
          return comparisonTip(player, trait, this.chartUnit).title;
        },

        // An HTML tip wraps where the chart's canvas tip does not: each figure keeps to its word.
        tipBody(player, trait) {
          return comparisonTip(player, trait, this.chartUnit).lines
            .map(line => line.replace(/(percentil|media|mejor|p90|total|valor) /g, '$1 '))
            .join('\n');
        },

        /*
          The Cuadrícula in the advanced search's look (its results table):
          with two attributes or more, each value in a rounded block washed
          in its player's colour as far as the bar would reach (the
          transparency of Players::washStyle()); with
          one, a rank bar per player coloured by percentile band. The ratio is
          the chart's, so the grid and the bars agree in either unit; the band
          is always each player's percentile in his own league.
        */
        gridCellText(player, trait) {
          return this.spectrumPoint(player, trait).text;
        },

        gridWash(player, trait, index) {
          return this.hasTrait(player, trait)
            ? `--wash-alpha: ${this.spectrumPoint(player, trait).ratio.toFixed(2)}%; --compare-wash: ${this.compareColors[index]}`
            : '';
        },

        gridBand(player, trait) {
          const point = this.spectrumPoint(player, trait);
          return point.percentile === null ? 'none' : window.StatiskicksPercentileRows.band(point.percentile);
        },

        // The lazy half of each player's data — on-field position needs a
        // per-match feed call resolve() deliberately skips (see
        // OptaPlayerComparisonService::resolvePosition()). Runs one player at
        // a time, not all at once, and patches each player in place by id, so
        // a slow response can never land on the wrong (or a since-removed)
        // player.
        async loadPendingPositions() {
          for (const player of this.players) {
            if (!player.needs_position) continue;

            try {
              const result = await callPlayerDetailMethod('loadComparisonPlayerDetail', player.id);
              this.applyPlayerPatch(result?.player);
            } catch (error) {
              // Position is decorative — a failed lazy load just leaves the
              // spinner off and the badge blank, never an error banner.
              this.applyPlayerPatch({ id: player.id, needs_position: false });
            }
          }
        },

        applyPlayerPatch(patch) {
          if (!patch || !patch.id) return;

          const index = this.players.findIndex(p => p.id === patch.id);
          if (index === -1) return; // removed while the request was in flight

          this.players[index] = { ...this.players[index], ...patch };
        },

        renderHeatmaps() {
          this.$nextTick(() => {
            const root = findComparisonPanelRoot();
            root?.querySelectorAll('[data-comparison-heatmap]').forEach(wrapper => {
              const playerId = wrapper.dataset.comparisonHeatmap;
              const player = this.players.find(p => p.id === playerId);
              renderComparisonHeatmapInto(wrapper, player?.heatmap || []);
              observeComparisonHeatmapWrapper(wrapper, () => {
                const current = this.players.find(p => p.id === playerId);
                renderComparisonHeatmapInto(wrapper, current?.heatmap || []);
              });
            });
          });
        },

        queueSearch(value) {
          this.abortSearch();
          clearTimeout(this.searchTimer);

          const term = String(value || '').trim();
          if (term.length < 2 || this.players.length >= 3) {
            this.searchResults = [];
            this.searchLoading = false;
            return;
          }

          this.searchLoading = true;
          this.searchTimer = setTimeout(() => this.runSearch(term), 350);
        },

        abortSearch() {
          if (this.searchController) {
            this.searchController.abort();
            this.searchController = null;
          }
        },

        async runSearch(term) {
          this.abortSearch();
          this.searchController = new AbortController();
          this.searchLoading = true;

          try {
            const response = await fetch(`${comparisonSearchUrl}?q=${encodeURIComponent(term)}`, {
              headers: { Accept: 'application/json' },
              signal: this.searchController.signal,
            });

            if (!response.ok) {
              throw new Error('Search failed');
            }

            const payload = await response.json();

            if (String(this.searchQuery || '').trim() === term) {
              const takenIds = new Set(this.players.map(p => p.id));
              this.searchResults = (Array.isArray(payload.results) ? payload.results : [])
                .filter(result => !takenIds.has(result.id));
            }
          } catch (error) {
            if (error?.name !== 'AbortError') {
              this.searchResults = [];
            }
          } finally {
            this.searchController = null;
            if (String(this.searchQuery || '').trim() === term) {
              this.searchLoading = false;
            }
          }
        },

        async addPlayer(playerId) {
          if (this.addingId) return; // one add in flight at a time

          this.addingId = playerId;
          this.searchQuery = '';
          this.searchResults = [];

          try {
            const result = await callPlayerDetailMethod('addComparisonPlayer', playerId);
            this.players = Array.isArray(result?.players) ? result.players : this.players;
            this.errorMessage = result?.error || null;
            if (result?.locked) window.SkDownloadPaywall?.open(null, 'compare');
            this.rebuildTraitsCatalog();
            this.$nextTick(() => this.renderChart());
            this.loadPendingPositions();
          } finally {
            this.addingId = null;
          }
        },

        async removePlayer(playerId) {
          const result = await callPlayerDetailMethod('removeComparisonPlayer', playerId);
          this.players = Array.isArray(result?.players) ? result.players : this.players;
          this.rebuildTraitsCatalog();
          this.$nextTick(() => this.renderChart());
        },

        playerImage(player) {
          if (player?.image) {
            return player.image;
          }

          const name = encodeURIComponent(player?.name || 'Jugador');
          return `https://ui-avatars.com/api/?name=${name}&background=1D665D&color=fff&size=80`;
        },
      }));
    }

    if (typeof Alpine !== 'undefined') {
      registerComparisonPanel();
    } else {
      document.addEventListener('alpine:init', registerComparisonPanel);
    }

    document.addEventListener('livewire:navigated', bootComparisonPanel);

    /**
     * Every unit fills to the percentile, as Perfil does (attribute-charts.js
     * getTraitDisplayRatio()): each player's place among his own
     * competition's peers, so the bars, the dots, the radar and the grid's
     * wash read the same in Percentil, p90 and Total, and only the figure
     * changes (beta-final-changes fase 5, X1). A percentile already counts
     * lower-is-better the right way round.
     *
     * p90 and Total used to fill to the value over one axis every compared
     * player shared, 0 to the highest among the page player's peers, with
     * both ends labelled under the track; a unit switch then moved every bar.
     */
    // A player's trait as the unit shows it: in Total, its `total` view's
    // figures under the same names (attribute-charts.js traitInUnit()).
    function comparisonTrait(player, trait, unit) {
      const match = (player?.traits || []).find(item => item.key === trait.key) || null;

      return match && unit === 'total' ? window.StatiskicksAttributeCharts.traitInUnit(match, 'total') : match;
    }

    // A p90 value as Perfil's badges write it: a success rate as a percentage.
    function comparisonValueText(value, trait) {
      return trait?.unit === 'percentage'
        ? `${window.StatiskicksAttributeCharts.formatSpanish(Number(value), 1)}%`
        : formatMetric(value);
    }

    function comparisonSeriesPoint(player, trait, unit) {
      const match = comparisonTrait(player, trait, unit);

      if (!match) {
        return { ratio: 0, text: '—', percentile: null };
      }

      const percentile = Number(match.percentile ?? 0);
      const ratio = Number.isFinite(percentile) ? Math.min(100, Math.max(0, percentile)) : 0;
      const text = unit === 'p90' || unit === 'total'
        ? comparisonValueText(Number(match.val ?? 0), trait)
        : `${Math.round(percentile)}%`;

      return { ratio, text, percentile };
    }

    /*
      A compared player's tooltip, in Perfil's words (attribute-charts.js
      valueTooltipLine() / percentileTooltipLine()): the player and the
      attribute, then where he stands in his own competition - the
      percentile line and the p90 line in Percentil, the p90 line alone in
      p90 (the total line alone in Total), as Perfil's bars do - and which
      competition that is.
    */
    function comparisonTip(player, trait, unit) {
      const match = comparisonTrait(player, trait, unit);
      const title = `${player?.name || ''} · ${trait.label}`;

      if (!match) return { title, lines: ['Sin dato en su competición'] };

      const charts = window.StatiskicksAttributeCharts;
      const valueLine = charts.valueTooltipLine(match, unit === 'total' ? 'total' : 'p90');
      const lines = unit === 'porcentaje' ? [charts.percentileTooltipLine(match), valueLine] : [valueLine];

      if (player?.league_name) lines.push(`frente a ${player.league_name}`);

      return { title, lines };
    }

    function renderComparisonRadarChart(players, traitEntries, unit) {
      const canvas = document.getElementById('comparisonRadarChart');
      if (!canvas || typeof Chart === 'undefined') return;

      if (comparisonRadarChartInstance) {
        comparisonRadarChartInstance.destroy();
        comparisonRadarChartInstance = null;
      }

      const comparePlayers = Array.isArray(players) ? players : [];
      const entries = traitEntries || [];
      const labels = entries.map(t => t.label);

      if (labels.length === 0 || comparePlayers.length === 0) return;

      const pointsByPlayer = comparePlayers.map(player => entries.map(trait =>
        comparisonSeriesPoint(player, trait, unit)
      ));

      const gridColor = themeColor('--chart-grid', 'rgba(16,21,17,0.14)');
      const tickColor = themeColor('--chart-tick', '#55625A');
      const labelInk = themeColor('--chart-label', '#141A15');

      /*
        The attribute names follow the circle, as Perfil's wheel writes them
        (attribute-charts.js drawRotatedLabel(): tangential, never upside
        down, wrapped at 14 characters) - beta-final-changes fase 6. Chart.js's
        own point labels are off; the plot keeps a band around it as deep as
        the most lines any name wraps to, and a plugin writes them there. A
        plugin of the chart's own config, so the download's copy (chart-
        download.js chartInto()) writes them too.
      */
      const charts = window.StatiskicksAttributeCharts;
      const labelFont = 10.5;
      const labelGap = 6;
      const labelLines = Math.max(1, ...labels.map(label => charts.rotatedLabelLines(label).length));
      const labelBand = Math.ceil(labelGap + labelLines * labelFont * 1.15 + labelFont * 0.5);
      const rotatedLabels = {
        id: 'skComparisonRadarLabels',
        afterDraw(chart) {
          const scale = chart.scales.r;
          if (!scale) return;
          labels.forEach((label, index) => {
            charts.drawRotatedLabel(
              chart.ctx, label, scale.xCenter, scale.yCenter,
              scale.getIndexAngle(index) - Math.PI / 2,
              scale.drawingArea, labelGap, labelFont, labelInk,
            );
          });
        },
      };

      comparisonRadarChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'radar',
        plugins: [rotatedLabels],
        data: {
          labels,
          datasets: comparePlayers.map((player, index) => ({
            label: player.name,
            data: pointsByPlayer[index].map(point => point.ratio),
            borderColor: comparisonSeriesColor(index),
            backgroundColor: hexToRgba(comparisonSeriesColor(index), 0.2),
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 4,
          })),
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          // The band the rotated names are written in, the same on every side.
          layout: { padding: labelBand },
          plugins: {
            legend: { display: false },
            datalabels: { display: false },
            // Perfil's tooltip lines, a block per player (comparisonTip()).
            tooltip: {
              callbacks: {
                title: items => entries[items[0]?.dataIndex]?.label || '',
                label: item => [
                  item.dataset.label,
                  ...comparisonTip(comparePlayers[item.datasetIndex], entries[item.dataIndex], unit).lines,
                ],
              },
            },
          },
          scales: {
            r: {
              min: 0,
              max: 100,
              ticks: { stepSize: 25, color: tickColor, backdropColor: 'transparent' },
              // Rings, not polygons, in hairlines: the grid reads as a
              // backdrop and the players' shapes carry the chart.
              grid: { circular: true, color: gridColor, lineWidth: 0.75 },
              angleLines: { color: gridColor, lineWidth: 0.75 },
              // Written along the circle by the rotatedLabels plugin instead.
              pointLabels: { display: false },
            },
          },
        },
      });

      // The wrapper is sized via an explicit height (not aspect-ratio), so
      // when this runs on tab-open its parent can still be mid-layout (a
      // freshly-unhidden flex/grid ancestor hasn't settled to its final box
      // yet). Chart.js reads the container synchronously at construction
      // time, sees 0x0, and the canvas never recovers on its own. Forcing a
      // resize on the next frame — after layout has definitely settled —
      // fixes that without touching the working top/bottom padding.
      requestAnimationFrame(() => comparisonRadarChartInstance?.resize());
    }

    /*
      Reuses buildHeatmapImage()/resizeHeatmapCanvas() — the same density and
      palette logic the Perfil tab's single heatmap draws with — rather than
      Perfil's own renderPlayerHeatmap(), which owns a buffer-canvas cache
      keyed to one canvas. These panels are smaller, few, and repainted only
      when their player set changes, so a direct putImageData() per canvas is
      simpler and leaves Perfil's render path untouched.
    */
    /*
      Each compared player's heatmap, horizontal with the attack to the right
      as the event maps draw it: their pitch (event-map.js paint.pitch), then
      heatmap.js's density over it, blended in on the one canvas as the event
      map's heat view does, so the download keeps both. "ATAQUE →" in the
      band above the pitch says which way. The points are kept on the wrapper
      so a theme flip can repaint without the panel.
    */
    function renderComparisonHeatmapInto(wrapper, points) {
      // The "sin eventos" message is declarative (x-show="!p.heatmap...")
      // on the same data this reads, so this function only ever draws.
      const canvas = wrapper?.querySelector('canvas');
      const paint = window.StatiskicksEventMap?.paint;
      if (!canvas || !paint || !window.StatiskicksHeatmap) return;

      wrapper.comparisonHeatPoints = points;

      const rect = canvas.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      const ctx = canvas.getContext('2d');
      const metrics = paint.pitch(ctx, width, height);

      ctx.save();
      ctx.fillStyle = metrics.ink.tick;
      ctx.font = `700 ${9 * dpr}px Inter, sans-serif`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText('ATAQUE →', metrics.px(100), metrics.py(0) / 2);
      ctx.restore();

      const validPoints = (Array.isArray(points) ? points : []).filter(point =>
        Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.y))
      );

      if (!validPoints.length) return;

      // Built at CSS-pixel resolution and scaled up, as the event map's is.
      const scale = 1 / dpr;
      const image = window.StatiskicksHeatmap.buildImage(validPoints, {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
        shortSide: Math.min(metrics.pw, metrics.ph) * scale,
        project: (x, y) => [metrics.px(x) * scale, metrics.py(y) * scale],
      });
      if (!image) return;

      const buffer = document.createElement('canvas');
      buffer.width = image.width;
      buffer.height = image.height;
      buffer.getContext('2d').putImageData(image, 0, 0);

      const dark = window.StatiskicksHeatmap.isDark();
      ctx.save();
      ctx.beginPath();
      ctx.rect(metrics.px(0), metrics.py(0), metrics.pw, metrics.ph);
      ctx.clip();
      ctx.globalCompositeOperation = dark ? 'screen' : 'multiply';
      ctx.globalAlpha = dark ? .95 : 1;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(buffer, 0, 0, width, height);
      ctx.restore();
    }

    function repaintComparisonHeatmaps() {
      document.querySelectorAll('[data-comparison-heatmap]').forEach(wrapper => {
        renderComparisonHeatmapInto(wrapper, wrapper.comparisonHeatPoints || []);
      });
    }

    /*
      Perfil's own heatmap gets a ResizeObserver via initHeatmapObserver() so
      a layout change (tab becoming visible, theme flip, window resize) always
      gets a redraw at the *current* size — these mini heatmaps had none, so
      a wrong first-paint size (0 while the panel was still display:none, a
      squashed card before CSS settled) could render once and never recover.
      One observer per wrapper, guarded by a dataset flag so repeated
      renderHeatmaps() calls don't stack observers.
    */
    function observeComparisonHeatmapWrapper(wrapper, redraw) {
      if (!wrapper || wrapper.dataset.heatmapObserved === '1' || typeof ResizeObserver === 'undefined') {
        return;
      }

      wrapper.dataset.heatmapObserved = '1';
      new ResizeObserver(() => redraw()).observe(wrapper);
    }

    /*
      Own attribute-selection state (traitsData/visibleTraits live on the
      Alpine comparisonPanel instance, not the module-level ones above) so a
      change here never touches the Perfil tab's selection, and vice versa.
      Draws its picker with the shared renderTraitsGrid() (attribute-charts.js),
      which reads no state of its own.
    */
    function setComparisonTraitsSearchQuery(panel, value) {
      const next = String(value || '');
      const input = document.getElementById('comparisonTraitsSearchInput');

      if (input && input.value !== next) input.value = next;

      panel.traitsSearchQuery = next;
      populateComparisonTraitsGrid(panel);
    }

    function populateComparisonTraitsGrid(panel) {
      if (!panel) return;

      window.StatiskicksAttributeCharts.renderTraitsGrid(
        document.getElementById('comparisonTraitsGrid'),
        document.getElementById('comparisonTraitsSearchEmpty'),
        panel.traitsData,
        panel.visibleTraits,
        panel.traitsSearchQuery,
        () => {
          populateComparisonTraitsGrid(panel);
          panel.renderChart();
        }
      );
    }

    function clearCanvasElement(id) {
      const canvas = document.getElementById(id);
      const ctx = canvas?.getContext?.('2d');
      if (!canvas || !ctx) return;

      ctx.clearRect(0, 0, canvas.width || canvas.clientWidth || 0, canvas.height || canvas.clientHeight || 0);
    }

    function destroyChartInstance(instance) {
      if (instance && typeof instance.destroy === 'function') {
        instance.destroy();
      }
    }

    function resetPlayerScopedRuntimeStateForNavigation() {
      traitsData = [];
      visibleTraits = getDefaultVisibleTraits(traitsData);
      traitsLoaded = false;
      traitsLoading = true;
      traitsFetchPending = false;

      heatmapPoints = [];
      goalmouthData = null;
      heatmapLoaded = false;
      heatmapLoading = true;
      heatmapFetchPending = false;
      heatmapRenderIdlePending = false;
      heatmapRequestStartedAt = null;
      heatmapBufferCanvas = null;
      heatmapBufferCtx = null;
      heatmapMobileBufferCanvas = null;
      heatmapMobileBufferCtx = null;
      clearCanvasElement('playerHeatmapCanvas');

      seasonRankingData = {};
      seasonRankingPositionScope = 'same_position';
      seasonRankingLeagueScope = 'same_league';
      seasonRankingLoaded = false;
      seasonRankingLoading = false;
      filterLeagueMean = undefined;

      performanceData = { summaryMatches: [], latestMatches: [], competitionMatches: [], seasonRatings: [] };
      performanceSummaryLoaded = false;
      performanceSummaryLoading = false;
      performanceLatestLoaded = false;
      performanceLatestLoading = false;
      performanceSeasonLoaded = false;
      performanceSeasonLoading = false;

      similarPlayersLoading = false;

      window.StatiskicksEventMap?.destroy('player-detail-map');

      destroyChartInstance(barChartInstance);
      destroyChartInstance(desempChartInstance);
      destroyChartInstance(comparisonRadarChartInstance);
      barChartInstance = null;
      desempChartInstance = null;
      comparisonRadarChartInstance = null;
      comparisonDataLoadingFlag = false;

      activePlayerTab = 'perfil';
      currentUnit = 'porcentaje';
      showPositionAvg = false;
      playerDetailRuntime.mainChartInteractiveReady = !isMobilePlayerView();
      mainChartInteractiveReady = playerDetailRuntime.mainChartInteractiveReady;

      const similaresPanel = document.getElementById('tab-similares');
      if (similaresPanel) {
        similaresPanel.dataset.similarLoaded = '0';
      }

      const compararPanel = document.getElementById('tab-comparar');
      if (compararPanel) {
        compararPanel.dataset.comparisonLoaded = '0';
      }
    }

    syncChartControlsUI();
    syncHeatmapLoadingUI();   // show heatmap placeholder immediately
    window.StatiskicksEventMap?.boot();
    syncTraitsLoadingUI();    // show stats/traits placeholder immediately if data not ready
    initHeatmapObserver();
    syncDesempFiltroTipoUI();
    renderHeaderSkore(); // shows the header card's loading placeholder

    // All Livewire calls require Livewire to be fully initialized AND the component mounted.
    // livewire:init fires when Livewire boots but before components are registered, so
    // deferring one animation frame ensures both window.Livewire.find('aDsvPhrEkBaO3h7EAtIj') and canvas layout are ready.
    function bootDeferredLoads() {
      requestAnimationFrame(() => {
        // Fire above-the-fold data immediately.
        if (traitsLoaded) {
          applyTraitsData(traitsData);
        } else {
          ensureTraitsDataLoaded();
        }
        ensureRankingDataLoaded();

        // Defer below-the-fold sections until they are near the viewport.
        // This reduces the simultaneous AJAX burst on page load from 4 to 2,
        // which is critical when the server handles requests serially (php artisan serve).
        observeWhenNear(
          document.getElementById('heatmapLoadingOverlay') || document.getElementById('playerHeatmapCanvas'),
          ensureHeatmapDataLoadedWhenIdle,
          { rootMargin: '300px' }
        );

        // The SKore card sits in the header, so it is never below the fold.
        ensurePerformanceSummaryDataLoaded();
      });
    }

    function bootPlayerDetailPage({ reset = false } = {}) {
      if (!currentPlayerDetailPage()) return;

      if (reset) {
        resetPlayerScopedRuntimeStateForNavigation();
      }

      playerDetailRuntime.activePlayerId = currentPlayerDetailPlayerId();

      syncPlayerTabVisibility(activePlayerTab);
      syncChartControlsUI();
      syncHeatmapLoadingUI();
      window.StatiskicksEventMap?.boot();
      if (activePlayerTab === 'mapas') {
        window.StatiskicksEventMap?.activate('player-detail-map');
      }
      syncTraitsLoadingUI();
      bindPlayerDetailDomControls();
      initHeatmapObserver();
      syncDesempFiltroTipoUI();
      renderSeasonRanking();
      renderPlayerHeatmap();
      renderHeaderSkore();
      bootDeferredLoads();
    }

    function registerPlayerDetailNavigationBoot() {
      if (window.__playerDetailNavigationBootRegistered) return;

      window.__playerDetailNavigationBootRegistered = true;
      document.addEventListener('livewire:navigated', function () {
        if (!currentPlayerDetailPage()) return;

        bootPlayerDetailPage({ reset: true });
      });
    }

    /**
     * Call `callback` once when `el` comes within `rootMargin` of the viewport.
     * Falls back to calling immediately if IntersectionObserver is unavailable.
     */
    function observeWhenNear(el, callback, { rootMargin = '200px' } = {}) {
      if (!el) { callback(); return; }
      if (!('IntersectionObserver' in window)) { callback(); return; }
      const obs = new IntersectionObserver((entries, observer) => {
        if (entries.some(e => e.isIntersecting)) {
          observer.disconnect();
          callback();
        }
      }, { rootMargin });
      obs.observe(el);
    }

    registerPlayerDetailNavigationBoot();

    if (window.Livewire) {
      // Already initialized (e.g. Livewire navigate between pages)
      bootPlayerDetailPage();
    } else {
      document.addEventListener('livewire:init', () => bootPlayerDetailPage(), { once: true });
    }

  