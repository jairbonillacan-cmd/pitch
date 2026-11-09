(() => {
  const controllers = new Map();

  function formatNumber(value, decimals = 1) {
    if (value === null || value === undefined || value === '') return '—';
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '—';

    return new Intl.NumberFormat('es-MX', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(numeric);
  }

  function formatMetric(metric, valueKey = 'value') {
    const value = Number(metric?.[valueKey]);
    if (!Number.isFinite(value)) return '—';

    const decimals = Number.isInteger(Number(metric.decimals)) ? Number(metric.decimals) : 1;
    return `${formatNumber(value, decimals)}${metric.unit === 'percentage' ? '%' : ''}`;
  }

  function appendTooltipLine(tooltip, text, className = '') {
    const line = document.createElement('span');
    line.textContent = text;
    if (className) line.className = className;
    tooltip.appendChild(line);
  }

  class TeamProfileController {
    constructor(root) {
      this.root = root;
      this.instanceId = root.dataset.instanceId;
      this.active = false;
      this.signature = '';
      this.profile = {};
      this.identityTooltipTrigger = null;

      this.handlePointerOver = event => {
        const trigger = event.target.closest('[data-team-identity-tooltip-index]');
        if (!trigger || !this.root.contains(trigger)) return;
        this.identityTooltipTrigger = trigger;
        this.showIdentityTooltip(trigger, event.clientX, event.clientY);
      };
      this.handlePointerMove = event => {
        if (this.identityTooltipTrigger) this.positionIdentityTooltip(event.clientX, event.clientY);
      };
      this.handlePointerOut = event => {
        if (!this.identityTooltipTrigger || this.identityTooltipTrigger.contains(event.relatedTarget)) return;
        this.identityTooltipTrigger = null;
        this.hideIdentityTooltip();
      };
      this.handleFocusIn = event => {
        const track = event.target.closest('.team-identity-track');
        const trigger = track?.closest('[data-team-identity-tooltip-index]');
        if (!trigger || !this.root.contains(trigger)) return;
        const rect = track.getBoundingClientRect();
        this.showIdentityTooltip(trigger, rect.left + rect.width / 2, rect.bottom);
      };
      this.handleFocusOut = event => {
        this.hideIdentityTooltip();
      };

      this.root.addEventListener('pointerover', this.handlePointerOver);
      this.root.addEventListener('pointermove', this.handlePointerMove);
      this.root.addEventListener('pointerout', this.handlePointerOut);
      this.root.addEventListener('focusin', this.handleFocusIn);
      this.root.addEventListener('focusout', this.handleFocusOut);
      this.sync();
    }

    readPayload() {
      const source = this.root.querySelector('[data-team-profile-payload]');
      const signature = source?.textContent?.trim() || '{}';

      try {
        return { signature, profile: JSON.parse(signature) };
      } catch (_error) {
        return { signature, profile: {} };
      }
    }

    sync() {
      const next = this.readPayload();
      if (next.signature === this.signature) return;

      this.signature = next.signature;
      this.profile = next.profile;
      this.hideIdentityTooltip();
    }

    activate() {
      this.active = true;
      this.sync();
    }

    showIdentityTooltip(trigger, clientX, clientY) {
      const tooltip = this.root.querySelector('[data-team-profile-tooltip]');
      const index = Number(trigger.dataset.teamIdentityTooltipIndex);
      // The card numbers its traits straight through the phases, in order.
      const traits = (this.profile?.identity?.phases || []).flatMap(phase => phase.traits || []);
      const trait = traits[index];
      if (!tooltip || !trait?.available) return;

      tooltip.replaceChildren();
      const title = document.createElement('strong');
      title.textContent = trait.label;
      tooltip.appendChild(title);
      appendTooltipLine(tooltip, `Valor del equipo: ${formatMetric(trait)}`);
      appendTooltipLine(tooltip, `Media de liga: ${formatMetric(trait, 'average')}`);
      appendTooltipLine(tooltip, `Percentil de liga: ${Math.round(Number(trait.percentile || 0))}`);
      appendTooltipLine(tooltip, `Posición: ${trait.rank} de ${trait.rank_total}`);
      // Left to right, as the track draws it: a reversed trait puts its high end first.
      const [leftLabel, rightLabel] = trait.reversed
        ? [trait.high_label, trait.low_label]
        : [trait.low_label, trait.high_label];
      appendTooltipLine(tooltip, `Orientación: ${leftLabel} ↔ ${rightLabel}`);
      appendTooltipLine(tooltip, 'Describe el estilo, no una valoración de calidad.', 'team-profile-tooltip__note');
      tooltip.hidden = false;
      this.positionIdentityTooltip(clientX, clientY);
    }

    positionIdentityTooltip(clientX, clientY) {
      const tooltip = this.root.querySelector('[data-team-profile-tooltip]');
      if (!tooltip || tooltip.hidden) return;

      const margin = 12;
      const rect = tooltip.getBoundingClientRect();
      const left = Math.min(window.innerWidth - rect.width - margin, Math.max(margin, clientX + margin));
      const preferredTop = clientY + margin;
      const top = preferredTop + rect.height <= window.innerHeight - margin
        ? preferredTop
        : Math.max(margin, clientY - rect.height - margin);

      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    }

    hideIdentityTooltip() {
      const tooltip = this.root.querySelector('[data-team-profile-tooltip]');
      if (tooltip) tooltip.hidden = true;
    }

    destroy() {
      this.hideIdentityTooltip();
      this.root.removeEventListener('pointerover', this.handlePointerOver);
      this.root.removeEventListener('pointermove', this.handlePointerMove);
      this.root.removeEventListener('pointerout', this.handlePointerOut);
      this.root.removeEventListener('focusin', this.handleFocusIn);
      this.root.removeEventListener('focusout', this.handleFocusOut);
      this.active = false;
    }
  }

  function boot() {
    document.querySelectorAll('[data-sk-team-profile]').forEach(root => {
      const id = root.dataset.instanceId;
      const existing = controllers.get(id);

      if (existing?.root === root) {
        existing.sync();
        return;
      }

      existing?.destroy();
      controllers.set(id, new TeamProfileController(root));
    });

    controllers.forEach((controller, id) => {
      if (!controller.root?.isConnected) {
        controller.destroy();
        controllers.delete(id);
      }
    });
  }

  window.StatiskicksTeamProfile = {
    boot,
    activate(instanceId) {
      boot();
      controllers.get(instanceId)?.activate();
    },
    destroy(instanceId) {
      controllers.get(instanceId)?.destroy();
      controllers.delete(instanceId);
    },
  };

  document.addEventListener('DOMContentLoaded', boot);
  document.addEventListener('livewire:navigated', boot);
  document.addEventListener('livewire:navigating', () => {
    controllers.forEach(controller => controller.destroy());
    controllers.clear();
  });
  document.addEventListener('livewire:init', () => {
    if (window.Livewire?.hook) {
      window.Livewire.hook('morph.updated', () => requestAnimationFrame(boot));
    }
  });

  boot();
})();
