(function () {
  function readPayload(root) {
    const source = root.querySelector('[data-team-formation-profile-payload]');
    if (!source) return {};

    try {
      return JSON.parse(source.textContent || '{}');
    } catch (error) {
      return {};
    }
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[char]));
  }

  function formatShare(value) {
    const number = Number(value);
    return Number.isFinite(number)
      ? number.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      : '—';
  }

  function renderContent(contentEl, payload) {
    if (payload?.available) {
      const mostUsed = payload.most_used || {};
      let html = '<div class="team-formation-mvp"><div class="team-formation-primary">'
        + `<strong data-team-formation-profile-formation>${escapeHtml(mostUsed.formation || '—')}</strong>`
        + `<span data-team-formation-profile-share>${formatShare(mostUsed.share)}% de los partidos</span>`
        + '</div>';

      if (payload.budget_truncated) {
        const analysed = Number(payload.coverage?.analysed_matches || 0);
        html += `<p class="team-formation-note">Muestra parcial: se analizaron los primeros ${analysed} partidos por límite de tiempo.</p>`;
      }

      html += '</div>';
      contentEl.innerHTML = html;
    } else {
      contentEl.innerHTML = `<div class="team-empty">${escapeHtml(payload?.empty_message || 'No hay datos de formación disponibles.')}</div>`;
    }
  }

  function applyResult(root, formationProfile) {
    const contentEl = root.querySelector('[data-team-formation-profile-content]');
    const overlay = root.querySelector('[data-team-formation-profile-loading]');

    if (contentEl) renderContent(contentEl, formationProfile);
    if (overlay) overlay.classList.remove('stats-loading-overlay--show');

    root.dataset.formationProfileState = 'done';
  }

  window.addEventListener('team-formation-profile-updated', event => {
    const { formationProfile, requestId } = event.detail || {};

    document.querySelectorAll('[data-team-formation-profile]').forEach(root => {
      if (root.dataset.formationProfileRequestId !== String(requestId)) return;

      applyResult(root, formationProfile || {});
    });
  });

  window.StatiskicksTeamFormationProfile = {
    boot() {
      document.querySelectorAll('[data-team-formation-profile]').forEach(root => {
        const payload = readPayload(root);

        if (payload?.loading !== true || root.dataset.formationProfileState === 'pending') return;

        const wireRoot = root.closest('[wire\\:id]');
        const wireId = wireRoot?.getAttribute('wire:id');
        const component = wireId && window.Livewire ? window.Livewire.find(wireId) : null;

        if (!component) return;

        const requestId = `formation-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        root.dataset.formationProfileState = 'pending';
        root.dataset.formationProfileRequestId = requestId;

        Promise.resolve(component.call('loadTeamFormationProfile', requestId)).catch(() => {
          root.dataset.formationProfileState = 'idle';
        });
      });
    },
  };
})();
