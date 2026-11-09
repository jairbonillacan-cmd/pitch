/*
  The page stays put behind an open modal: with the pointer outside the
  dialog, a wheel or a swipe used to scroll the page underneath it. The same
  lock the search panel uses (a body class, `overflow: hidden`), plus the
  scrollbar's width given back as padding so the page does not shift
  sideways as the bar goes. Counted, so one modal closing does not free the
  page while another is still open.

    window.StatiskicksScrollLock.set('player-card', true)   // open
    window.StatiskicksScrollLock.set('player-card', false)  // close
*/
(function () {
  const CLASS = 'sk-modal-open';
  const owners = new Set();

  function apply() {
    const body = document.body;
    if (!body) return;

    if (owners.size > 0 && !body.classList.contains(CLASS)) {
      const gap = window.innerWidth - document.documentElement.clientWidth;
      body.style.setProperty('--sk-scrollbar-gap', `${Math.max(0, gap)}px`);
      body.classList.add(CLASS);
    } else if (owners.size === 0 && body.classList.contains(CLASS)) {
      body.classList.remove(CLASS);
      body.style.removeProperty('--sk-scrollbar-gap');
    }
  }

  function set(owner, locked) {
    if (locked) owners.add(owner);
    else owners.delete(owner);
    apply();
  }

  // A page left with a modal open must not take the lock with it.
  document.addEventListener('livewire:navigating', () => {
    owners.clear();
    apply();
  });

  window.StatiskicksScrollLock = { set };
})();
