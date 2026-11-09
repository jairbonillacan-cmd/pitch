/*
  The paywall (layouts/partials/download-paywall), opened in place of what
  the viewer's plan does not include. Two things open it, each with its own
  copy (the partial's [data-sk-paywall-variant] blocks):

    downloads  on a plan without downloads (PlanAccess::allowsDownloads(),
               which the partial marks data-sk-paywall-downloads): a chart's
               menu (.sk-chart-download-btn, [data-sk-chart-source] —
               chart-download.js), a file the server builds
               (.sk-data-download-btn), anything marked [data-sk-download].
    charts     anything marked data-sk-paywall-trigger="charts": the Gráficas
               card's locked options (attribute-charts/chart-controls) on a
               plan without chart_customization.

  The click is caught on the way down (capture, on window), before
  chart-download.js's and attribute-charts.js's listeners and before
  Livewire's wire:click on the button itself, so none of them ever runs. The
  servers' exports refuse on their own as well; this is what the reader sees.
*/
(function () {
  'use strict';

  const DOWNLOADS = '.sk-chart-download-btn, [data-sk-chart-source], .sk-data-download-btn, [data-sk-download]';
  const TRIGGERS = '[data-sk-paywall-trigger]';
  // The longest of the closing transitions (sk.css): the fallback for a
  // transitionend that never comes (reduced motion, a hidden tab).
  const CLOSE_MS = 220;
  let opener = null;
  let closing = null;

  function paywall() {
    return document.querySelector('[data-sk-paywall]');
  }

  /*
    In: shown at its closed state, laid out once so the browser has a start
    to transition from, then .is-open — the backdrop fades and the dialog
    rises and grows into place. Out: .is-open off, so it runs back the
    other way, and hidden only once the dialog's transition is over.
  */
  // Shows the copy for what was asked for; the dialog is labelled by it.
  function showVariant(modal, variant) {
    let shown = null;
    modal.querySelectorAll('[data-sk-paywall-variant]').forEach(block => {
      const match = block.dataset.skPaywallVariant === variant;
      block.hidden = !match;
      if (match) shown = block;
    });
    if (!shown) {
      shown = modal.querySelector('[data-sk-paywall-variant="downloads"]');
      if (shown) shown.hidden = false;
    }
    const title = shown?.querySelector('.sk-paywall__title');
    if (title?.id) modal.querySelector('.sk-paywall__dialog')?.setAttribute('aria-labelledby', title.id);
  }

  function open(trigger, variant = 'downloads') {
    const modal = paywall();
    if (!modal) return;
    showVariant(modal, variant);
    if (closing) {
      clearTimeout(closing);
      closing = null;
    }
    opener = trigger || null;
    modal.classList.remove('is-closing');
    modal.hidden = false;
    document.body.classList.add('sk-paywall-open');
    void modal.offsetWidth;
    modal.classList.add('is-open');
    modal.querySelector('.sk-paywall__dialog')?.focus({ preventScroll: true });
  }

  function close() {
    const modal = paywall();
    if (!modal || modal.hidden || !modal.classList.contains('is-open')) return;
    const dialog = modal.querySelector('.sk-paywall__dialog');
    modal.classList.remove('is-open');
    modal.classList.add('is-closing');

    const done = () => {
      if (!closing) return;
      clearTimeout(closing);
      closing = null;
      dialog?.removeEventListener('transitionend', onEnd);
      modal.classList.remove('is-closing');
      modal.hidden = true;
      document.body.classList.remove('sk-paywall-open');
    };
    const onEnd = event => {
      if (event.target === dialog) done();
    };
    dialog?.addEventListener('transitionend', onEnd);
    closing = setTimeout(done, CLOSE_MS + 60);

    if (opener?.isConnected) opener.focus({ preventScroll: true });
    opener = null;
  }

  window.addEventListener('click', event => {
    if (!paywall()) return;

    if (event.target.closest('[data-sk-paywall-close]')) {
      close();
      return;
    }

    const trigger = event.target.closest(TRIGGERS);
    if (trigger && !trigger.disabled) {
      event.preventDefault();
      event.stopImmediatePropagation();
      open(trigger, trigger.dataset.skPaywallTrigger);
      return;
    }

    // Downloads only on a plan without them: the paywall can be on the page
    // for the charts alone.
    if (!paywall().hasAttribute('data-sk-paywall-downloads')) return;

    const button = event.target.closest(DOWNLOADS);
    if (!button || button.disabled) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    open(button, 'downloads');
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') close();
  });

  document.addEventListener('livewire:navigating', close);

  window.SkDownloadPaywall = { open, close };
})();
