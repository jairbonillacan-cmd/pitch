
  document.addEventListener('click', function (event) {
    const button = event.target.closest('[data-toggle-password]');
    if (!button) return;

    const field = button.closest('[data-password-field]');
    const input = field?.querySelector('input');
    if (!input) return;

    const revealed = input.type === 'text';
    input.type = revealed ? 'password' : 'text';
    button.setAttribute('aria-label', revealed ? 'Mostrar contraseña' : 'Ocultar contraseña');

    const icon = button.querySelector('i');
    if (icon) icon.className = revealed ? 'bi bi-eye' : 'bi bi-eye-slash';
  });
