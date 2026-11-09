/*
  SKore as every page writes it: two decimals with a point (7.26), a dash (or
  the caller's placeholder) without one; and the colour band of its pill -
  green from 7, yellow from 6.5, orange below, the rank bars' colours
  (--rank-high / mid / low). The PHP twin is
  App\Services\Opta\OptaMatchRatingService::format() and ::grade(); a test
  holds the two thresholds below to its constants.
*/
(() => {
  const HIGH = 7.0;
  const MID = 6.5;

  function format(rating, empty = '—') {
    if (rating === null || rating === undefined || rating === '') return empty;
    const numeric = Number(rating);
    return Number.isFinite(numeric) ? numeric.toFixed(2) : empty;
  }

  function grade(rating) {
    if (rating === null || rating === undefined || rating === '') return 'none';
    const numeric = Number(rating);
    if (!Number.isFinite(numeric)) return 'none';
    if (numeric >= HIGH) return 'high';
    return numeric >= MID ? 'mid' : 'low';
  }

  window.StatiskicksSkore = { format, grade, HIGH, MID };
})();
