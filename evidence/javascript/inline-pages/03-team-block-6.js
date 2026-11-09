
  (function () {
    const validTabs = ["overview","squad","stats","results","maps","compare","set-pieces","rival-analysis","autoreport"];
    let activeTeamTab = validTabs.includes(new URLSearchParams(window.location.search).get('tab'))
      ? new URLSearchParams(window.location.search).get('tab')
      : 'overview';

    function currentTeamPage() {
      return document.querySelector('[data-team-detail-page]');
    }

    function syncTeamTabVisibility(target) {
      const page = currentTeamPage();
      if (!page) return;

      const initial = page.dataset.initialTeamTab;
      const current = validTabs.includes(target)
        ? target
        : (validTabs.includes(initial) ? initial : activeTeamTab);

      activeTeamTab = current;
      page.dataset.activeTeamTab = current;

      page.querySelectorAll('.team-tab').forEach(tab => {
        const active = tab.dataset.teamTab === current;
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-selected', active ? 'true' : 'false');
      });

      page.querySelectorAll('.team-tab-panel').forEach(panel => {
        panel.classList.toggle('is-active', panel.id === 'team-tab-' + current);
      });

      if (current === 'maps') {
        window.StatiskicksEventMap?.activate('team-detail-map');
        window.StatiskicksTeamPassNetwork?.boot();
      }

      if (current === 'overview') {
        window.StatiskicksTeamProfile?.activate('team-detail-profile');
        window.StatiskicksAttributeCharts?.activate('team-detail-attributes');
        window.StatiskicksTeamAgeProfile?.boot();
        window.StatiskicksTeamXgRolling?.boot();
      }
    }

    function replaceLegacyTeamUrl() {
      const page = currentTeamPage();
      if (!page || !page.dataset.canonicalUrl || !window.history?.replaceState) return;

      if (window.location.search || window.location.hash) {
        window.history.replaceState(window.history.state, '', page.dataset.canonicalUrl);
      }
    }

    function bootTeamDetail() {
      replaceLegacyTeamUrl();
      window.StatiskicksEventMap?.boot();
      window.StatiskicksTeamProfile?.boot();
      window.StatiskicksAttributeCharts?.boot();
      window.StatiskicksTeamAgeProfile?.boot();
      window.StatiskicksTeamXgRolling?.boot();
      window.StatiskicksTeamFormationProfile?.boot();
      syncTeamTabVisibility(activeTeamTab);
    }

    if (!window.__teamTabsClickRegistered) {
      window.__teamTabsClickRegistered = true;
      document.addEventListener('click', function (event) {
        const tab = event.target.closest('.team-tab');
        if (!tab || !tab.dataset.teamTab) return;

        event.preventDefault();
        syncTeamTabVisibility(tab.dataset.teamTab);
      });

      document.addEventListener('team-filters-changed', function () {
        window.StatiskicksEventMap?.invalidate('team-detail-map', { filters: true });

        if (activeTeamTab === 'maps') {
          window.StatiskicksEventMap?.activate('team-detail-map');
          window.StatiskicksTeamPassNetwork?.boot();
        }

        requestAnimationFrame(() => {
          window.StatiskicksTeamFormationProfile?.boot();

          if (activeTeamTab === 'overview') {
            window.StatiskicksTeamProfile?.activate('team-detail-profile');
            window.StatiskicksAttributeCharts?.activate('team-detail-attributes');
            window.StatiskicksTeamAgeProfile?.boot();
            window.StatiskicksTeamXgRolling?.boot();
          }
        });
      });
    }

    document.addEventListener('DOMContentLoaded', bootTeamDetail);
    // Livewire fires this on the first load too, after DOMContentLoaded has
    // already replaced the url with its canonical, query-less form: the tab
    // the server rendered then stands for the ?tab= it was asked for.
    document.addEventListener('livewire:navigated', function () {
      const requested = new URLSearchParams(window.location.search).get('tab');
      const rendered = currentTeamPage()?.dataset.initialTeamTab;

      activeTeamTab = validTabs.includes(requested)
        ? requested
        : (validTabs.includes(rendered) ? rendered : 'overview');
      bootTeamDetail();
    });

    document.addEventListener('livewire:init', function () {
      if (!window.Livewire || typeof window.Livewire.hook !== 'function') return;

      window.Livewire.hook('morph.updated', function () {
        requestAnimationFrame(bootTeamDetail);
      });
    });
  })();
