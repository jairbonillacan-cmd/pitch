
    // Applied before first paint so the card never flashes light on a dark
    // theme. The toggle in the navbar keeps this in sync afterwards.
    (function () {
      const stored = localStorage.getItem('sk-theme');
      const dark = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    })();
  