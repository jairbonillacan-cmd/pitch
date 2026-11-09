/*
  The site's own tooltip, in place of the browser's `title`: anything with
  `data-sk-tip` shows it on hover, on focus and on a tap. It looks like the
  charts' tooltips (Chart.js's own, .sk-tip in sk.css), so a bar segment and
  a chart point read alike.

    data-sk-tip-title  the bold first line (optional)
    data-sk-tip        the body; one line per "\n"

  One element for the page, fixed to the viewport and appended to <body>, so
  no container's overflow clips it: the win / draw / loss bar hides its own.
  Above the element when there is room, below it otherwise, never off the
  screen. Recreated after a wire:navigate replaces <body>.

  It moves as Chart.js's tooltip does: it fades in and out, and going from
  one element to the next while shown it glides there rather than blinking
  (.is-visible, .is-gliding; the timings are in sk.css).
*/
(function () {
  if (window.StatiskicksTooltip) return;

  const GAP = 8;
  const EDGE = 8;
  const LEAVE_GRACE = 100;
  let tip = null;
  let current = null;
  let leaving = null;

  function element() {
    if (!tip || !tip.isConnected) {
      tip = document.createElement('div');
      tip.className = 'sk-tip';
      tip.setAttribute('role', 'tooltip');
      document.body.appendChild(tip);
    }

    return tip;
  }

  function show(target) {
    const body = target.getAttribute('data-sk-tip') || '';
    const title = target.getAttribute('data-sk-tip-title') || '';

    if (!body && !title) return;

    clearTimeout(leaving);
    const box = element();
    box.replaceChildren();

    if (title) {
      const strong = document.createElement('strong');
      strong.textContent = title;
      box.appendChild(strong);
    }

    body.split('\n').filter(Boolean).forEach(text => {
      const line = document.createElement('span');
      line.textContent = text;
      box.appendChild(line);
    });

    // Already showing for another element: glide from there. Appearing:
    // take the new place first, then fade in on it.
    box.classList.toggle('is-gliding', visible());
    current = target;
    place(target, box);
    box.classList.add('is-visible');
  }

  function visible() {
    return !!tip && tip.classList.contains('is-visible');
  }

  function place(target, box) {
    const anchor = target.getBoundingClientRect();
    const size = box.getBoundingClientRect();
    const centre = anchor.left + anchor.width / 2;
    const left = Math.min(window.innerWidth - size.width - EDGE, Math.max(EDGE, centre - size.width / 2));
    const above = anchor.top - size.height - GAP;
    const below = above < EDGE;

    box.classList.toggle('sk-tip--below', below);
    box.style.left = `${left}px`;
    box.style.top = `${below ? anchor.bottom + GAP : above}px`;
    // The caret points at the element's centre even when the box is pushed off it.
    box.style.setProperty('--sk-tip-caret', `${Math.min(size.width - 10, Math.max(10, centre - left))}px`);
  }

  function hide() {
    clearTimeout(leaving);
    current = null;

    if (tip) tip.classList.remove('is-visible', 'is-gliding');
  }

  function targetOf(event) {
    return event.target instanceof Element ? event.target.closest('[data-sk-tip], [data-sk-tip-title]') : null;
  }

  document.addEventListener('pointerover', event => {
    const target = targetOf(event);

    if (target && target !== current) {
      show(target);
    } else if (target) {
      clearTimeout(leaving);
    }
  });

  document.addEventListener('pointerout', event => {
    if (!current) return;

    const next = event.relatedTarget instanceof Element ? event.relatedTarget.closest('[data-sk-tip], [data-sk-tip-title]') : null;

    // Straight onto another element with a tooltip: pointerover moves it
    // there, gliding. Off them, a moment's grace first, so crossing the 2px
    // between a bar's segments glides too instead of fading out and in.
    if (next === null) {
      clearTimeout(leaving);
      leaving = setTimeout(hide, LEAVE_GRACE);
    }
  });

  // A tap elsewhere closes it; on a touch screen there is no pointer to leave.
  document.addEventListener('pointerdown', event => {
    if (current && targetOf(event) !== current) hide();
  });

  document.addEventListener('focusin', event => {
    const target = targetOf(event);

    target ? show(target) : hide();
  });

  document.addEventListener('focusout', hide);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') hide();
  });
  // A scroll carries the element away: the tooltip follows it while it is on
  // screen. Hiding instead lost it to the page's smooth scroll and to a
  // trackpad's momentum, both still running after the pointer has arrived.
  function follow() {
    if (!current || !visible()) return;

    const anchor = current.getBoundingClientRect();

    if (!current.isConnected || anchor.bottom < 0 || anchor.top > window.innerHeight) {
      hide();

      return;
    }

    // Kept with its element, not trailing behind it.
    tip.classList.remove('is-gliding');
    place(current, tip);
  }

  window.addEventListener('scroll', follow, { passive: true, capture: true });
  window.addEventListener('resize', hide);
  document.addEventListener('livewire:navigated', hide);

  window.StatiskicksTooltip = { show, hide };
})();
