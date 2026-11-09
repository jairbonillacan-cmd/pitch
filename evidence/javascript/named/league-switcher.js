/*
  What the league page's tabs keep in the browser only, carried to the next
  league picked in the sidebar's league menu: each of its links dispatches
  'sk:league-switch' on click, league-maps.js and league-scatter.js put
  their settings in sessionStorage then, and read them back once on the
  next league's page.
*/
(function () {
  'use strict';

  /* What a tab keeps in the browser, carried to the next league's page once. */
  window.SkLeagueCarry = {
    save(kind, state) {
      try {
        window.sessionStorage.setItem(`sk-league-carry:${kind}`, JSON.stringify(state));
      } catch (_error) { /* Storage off: the next page opens on its defaults. */ }
    },
    take(kind) {
      try {
        const key = `sk-league-carry:${kind}`;
        const raw = window.sessionStorage.getItem(key);
        window.sessionStorage.removeItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch (_error) {
        return null;
      }
    },
  };
})();
