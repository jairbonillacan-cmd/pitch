(function () {
  'use strict';

  /*
    The Alpine half of "Seleccionar atributos", the player page's attribute
    modal (resources/views/livewire/partials/players-attribute-picker.blade.php):
    a search box, category boxes that select or clear a whole group, the same
    dot icons and the same two-frame open. The scope owns the selection and
    supplies pickerHas(key), pickerSet(key, on) and pickerClear(); it may
    define onPickerClosed().

    Shared by the advanced search (players.blade.php) and the league page's
    Dispersión tab (league-scatter.js), so both open the same window. Moved
    here from players.blade.php unchanged.
  */
  const PICKER_TRANSITION_MS = 220;

  window.skAttributePicker = function attributePicker(catalog) {
    return {
      pickerCatalog: catalog || [],
      pickerOpen: false,
      pickerShown: false,
      pickerSearch: '',
      pickerCloseTimer: null,

      // Accent-insensitive, so "aereo" finds "Juego Aéreo".
      foldText(value) {
        return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      },

      pickerCategories() {
        const term = this.foldText(this.pickerSearch.trim());
        if (!term) return this.pickerCatalog;

        return this.pickerCatalog
          .map((group) => ({
            ...group,
            attributes: group.attributes.filter((attribute) =>
              this.foldText(attribute.label).includes(term)
              || this.foldText(attribute.key).includes(term)
              || this.foldText(group.category).includes(term)),
          }))
          .filter((group) => group.attributes.length > 0);
      },

      pickerCategoryState(group) {
        const picked = group.attributes.filter((attribute) => this.pickerHas(attribute.key)).length;
        return picked === group.attributes.length ? 'all' : (picked === 0 ? 'none' : 'partial');
      },

      // Not fully selected yet -> select the group; fully selected -> clear it.
      togglePickerCategory(group) {
        const selectAll = this.pickerCategoryState(group) !== 'all';
        group.attributes.forEach((attribute) => this.pickerSet(attribute.key, selectAll));
      },

      pickerDotIcon(filled) {
        return filled
          ? '<svg width="14" height="14" viewBox="0 0 14 14" style="flex-shrink:0"><circle cx="7" cy="7" r="7" fill="var(--accent)" opacity="0.18"/><circle cx="7" cy="7" r="4" fill="var(--accent)"/></svg>'
          : '<svg width="14" height="14" viewBox="0 0 14 14" style="flex-shrink:0"><circle cx="7" cy="7" r="6" fill="none" stroke="#b0c4b8" stroke-width="1.5"/></svg>';
      },

      pickerCategoryIcon(state) {
        if (state === 'partial') {
          return '<svg width="14" height="14" viewBox="0 0 14 14" style="flex-shrink:0"><circle cx="7" cy="7" r="6" fill="none" stroke="var(--text-secondary)" stroke-width="1.5"/><circle cx="7" cy="7" r="3" fill="var(--text-secondary)"/></svg>';
        }
        return this.pickerDotIcon(state === 'all');
      },

      openPicker() {
        clearTimeout(this.pickerCloseTimer);
        this.pickerSearch = '';
        this.pickerOpen = true;
        document.body.style.overflow = 'hidden';

        // Two frames, as on the player page: laid out at the start
        // values first, then the class that transitions away from them.
        requestAnimationFrame(() => requestAnimationFrame(() => {
          this.pickerShown = true;
        }));
      },

      closePicker() {
        if (!this.pickerOpen) return;

        this.pickerShown = false;
        document.body.style.overflow = '';
        clearTimeout(this.pickerCloseTimer);
        this.pickerCloseTimer = setTimeout(() => {
          this.pickerOpen = false;
        }, PICKER_TRANSITION_MS);

        // At once, not after the fade: whatever the page does next
        // (the results body stepping out) overlaps the modal leaving
        // instead of queueing behind it.
        this.onPickerClosed?.();
      },
    };
  };
})();
