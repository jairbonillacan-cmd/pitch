
    // ── Hamburger nav toggle ──────────────────────────────────
    (function () {
      const toggle = document.getElementById('navToggle');
      const drawer = document.getElementById('navDrawer');
      const icon   = document.getElementById('navToggleIcon');
      if (!toggle || !drawer) return;

      if (toggle.dataset.skBound !== '1') {
        toggle.dataset.skBound = '1';

        toggle.addEventListener('click', () => {
          const open = drawer.classList.toggle('open');
          toggle.setAttribute('aria-expanded', open);
          icon.className = open ? 'bi bi-x-lg' : 'bi bi-list';
        });

        // Delegated from the drawer so links added later still close it, and so
        // there is one listener to guard rather than one per link.
        drawer.addEventListener('click', (event) => {
          if (!event.target.closest('a, button.btn-iniciar')) return;

          drawer.classList.remove('open');
          toggle.setAttribute('aria-expanded', 'false');
          icon.className = 'bi bi-list';
        });
      }

      // Sync mobile theme toggle with main toggle
      const mainToggle   = document.getElementById('themeToggle');
      const mobileToggle = document.getElementById('themeToggleMobile');
      const mobileIcon   = document.getElementById('themeIconMobile');

      if (mobileToggle && mainToggle && mobileToggle.dataset.skBound !== '1') {
        mobileToggle.dataset.skBound = '1';
        mobileToggle.addEventListener('click', () => mainToggle.click());

        new MutationObserver(() => {
          const mainIcon = document.getElementById('themeIcon');
          if (mobileIcon && mainIcon) mobileIcon.className = mainIcon.className;
        }).observe(document.getElementById('themeIcon'), { attributes: true, attributeFilter: ['class'] });
      }
    })();

    // ── Theme toggle ─────────────────────────────────────────
    (function () {
      const root = document.documentElement;
      const btn  = document.getElementById('themeToggle');
      const icon = document.getElementById('themeIcon');
      if (!btn) return;

      const stored = localStorage.getItem('sk-theme');
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const isDark = stored ? stored === 'dark' : prefersDark;

      function applyTheme(dark) {
        root.setAttribute('data-theme', dark ? 'dark' : 'light');
        if (icon) icon.className = dark ? 'bi bi-sun-fill' : 'bi bi-moon-fill';
        localStorage.setItem('sk-theme', dark ? 'dark' : 'light');
      }

      // Applying on every execution is harmless and keeps the icon in step
      // after a navigation; only the binding must not repeat.
      applyTheme(isDark);

      if (btn.dataset.skBound === '1') return;
      btn.dataset.skBound = '1';

      btn.addEventListener('click', function () {
        applyTheme(root.getAttribute('data-theme') !== 'dark');
      });
    })();
  