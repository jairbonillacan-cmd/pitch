/*
  Home page motion: sections rise into place as they are scrolled to, and the
  headline figures count up the first time each one is seen.

  Everything here is an enhancement over a page that is already complete. It
  no-ops on every other page, and on this one when the browser has no
  IntersectionObserver or the visitor asked for reduced motion - in which case
  the sections are simply shown and the figures keep the numbers the server
  rendered. Nothing is ever hidden that this script is not there to un-hide:
  the start state hangs off a class only the page's own head script adds.
*/
(function () {
  'use strict';

  var REVEAL = '[data-sk-reveal]';
  var COUNT = '[data-sk-count]';

  /*
    Long enough to read as counting rather than flickering, short enough that a
    figure scrolled past at speed has still settled by the time it is looked at.
  */
  var COUNT_MS = 1100;

  function prefersReducedMotion() {
    return typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /*
    number_format($n, 0, ',', '.') - the grouping the page is rendered with, so
    the count reads in the same shape as the number it lands on.
  */
  function group(value) {
    return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function countUp(el) {
    var target = Number(el.dataset.skCount);

    if (!isFinite(target)) return;

    /*
      The server's own string is what it settles on, rather than a formatting
      of the target worked out here. The animated value leads up to the
      rendered page and cannot end up disagreeing with it.
    */
    var settled = el.textContent.trim();
    var startedAt = performance.now();

    var step = function (now) {
      var t = Math.min(1, (now - startedAt) / COUNT_MS);

      if (t < 1) {
        // easeOutQuart, the curve the charts animate on.
        el.textContent = group(target * (1 - Math.pow(1 - t, 4)));
        requestAnimationFrame(step);
        return;
      }

      el.textContent = settled;
    };

    requestAnimationFrame(step);
  }

  function init() {
    var targets = Array.prototype.slice.call(
      document.querySelectorAll(REVEAL + ',' + COUNT)
    ).filter(function (el) {
      // A second init - a wire:navigate back to this page - must not re-observe
      // and re-count what is already settled.
      if (el.dataset.skMotionBound === '1') return false;
      el.dataset.skMotionBound = '1';
      return true;
    });

    if (!targets.length) return;

    /*
      Also set in <head> on a full load, where it has to land before the body
      paints. Repeated here for a wire:navigate into this page, which swaps the
      body in without re-running that.
    */
    document.documentElement.classList.add('sk-home-motion');

    if (prefersReducedMotion() || typeof IntersectionObserver !== 'function') {
      targets.forEach(function (el) {
        el.classList.add('is-visible');
      });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;

        var el = entry.target;

        // Once each: these are entrances, not something to replay on every pass.
        observer.unobserve(el);
        el.classList.add('is-visible');

        if (el.dataset.skCount !== undefined) countUp(el);
      });
    }, {
      /*
        A shallow threshold with a bottom inset, so a section starts moving as
        it comes over the fold rather than once it is already well up the
        screen - and so a section taller than the viewport still fires.
      */
      threshold: 0.12,
      rootMargin: '0px 0px -8% 0px',
    });

    targets.forEach(function (el) {
      observer.observe(el);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  document.addEventListener('livewire:navigated', init);
})();
