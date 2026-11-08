/* PitchLab · D1 · PIN de la beta (PROTOTIPO).
   La comparación en el navegador NO es seguridad: solo sirve para la vitrina.
   En el pre-MVP el código se valida en el servidor (PREVIEW_ACCESS_CODE, cookie HttpOnly). */
(function () {
  const HASH = "048f3a500f566c7c29cbfee2982f4b1252c4676f04dd8c6d36949251c54bf41d"; // sha-256 del código
  const LEN = 4, MAX_TRIES = 5, LOCK_MS = 30000;
  const params = new URLSearchParams(location.search);
  const next = params.get("next") && /^panel\.html/.test(params.get("next")) ? params.get("next") : "panel.html";
  let code = "", busy = false, tries = 0, lockedUntil = 0, lastTrigger = null;

  function mount() {
    const d = document.createElement("dialog");
    d.className = "pin"; d.id = "pin"; d.setAttribute("aria-labelledby", "pin-title");
    d.innerHTML = `
      <div class="pin-frame"><div class="pin-win" tabindex="-1">
        <button class="btn btn-ghost btn-icon pin-close" type="button" data-pin-close aria-label="Cerrar">${PL.icon("close")}</button>
        <div class="pin-avatar" aria-hidden="true"><img src="${PL.mascot("radar")}" alt=""></div>
        <p class="eyebrow" style="color:var(--brand-primary)">Beta privada</p>
        <h2 id="pin-title">Código de acceso</h2>
        <p class="pin-msg" id="pin-msg" role="status" aria-live="polite">Escribe el código de 4 dígitos.</p>
        <div class="slots" id="slots" aria-hidden="true">${Array.from({ length: LEN }, () => '<span class="slot"><i></i></span>').join("")}</div>
        <div class="pad" role="group" aria-label="Teclado numérico">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button class="key" type="button" data-k="${n}">${n}</button>`).join("")}
          <button class="key ghost" type="button" data-clear aria-label="Borrar todo">${PL.icon("close")}</button>
          <button class="key" type="button" data-k="0">0</button>
          <button class="key ghost" type="button" data-del aria-label="Borrar un dígito"><svg class="icon-24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1Z"/><path d="m12 9 6 6m0-6-6 6"/></svg></button>
        </div>
        <p class="pin-foot">TAMBIÉN PUEDES USAR TU TECLADO</p>
        <span class="pin-progress" aria-hidden="true"></span>
      </div></div>`;
    document.body.appendChild(d);
    d.addEventListener("click", (e) => {
      const k = e.target.closest("[data-k]");
      if (k) return press(k.dataset.k, k);
      if (e.target.closest("[data-del]")) return del();
      if (e.target.closest("[data-clear]")) return clear();
      if (e.target.closest("[data-pin-close]") || e.target.classList.contains("pin-frame")) close();
    });
    d.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
    d.addEventListener("keydown", (e) => {
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); press(e.key, d.querySelector(`[data-k="${e.key}"]`)); }
      else if (e.key === "Backspace") { e.preventDefault(); del(); }
    });
    return d;
  }
  const dlg = () => document.getElementById("pin") || mount();
  const msg = (t) => { document.getElementById("pin-msg").textContent = t; };

  function paint() {
    dlg().querySelectorAll(".slot").forEach((s, i) => { s.classList.toggle("on", i < code.length); s.classList.toggle("cur", i === code.length && !busy); });
  }
  function press(n, btn) {
    if (busy || Date.now() < lockedUntil || code.length >= LEN) return;
    if (btn) { btn.classList.add("press"); setTimeout(() => btn.classList.remove("press"), 120); }
    code += n; paint();
    msg(`${code.length} de ${LEN} dígitos`);
    if (code.length === LEN) setTimeout(check, 160);
  }
  function del() { if (busy || !code) return; code = code.slice(0, -1); paint(); msg(`${code.length} de ${LEN} dígitos`); }
  function clear() { if (busy) return; code = ""; paint(); msg("Escribe el código de 4 dígitos."); }

  async function sha(t) {
    if (!(window.crypto && crypto.subtle)) return null;
    const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
    return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
  }
  async function check() {
    busy = true; paint();
    const d = dlg(), h = await sha(code);
    if (h === null) { msg("Abre la página desde el servidor (https) para entrar."); busy = false; code = ""; paint(); return; }
    if (h === HASH) {
      d.classList.add("ok"); msg("Listo. Bienvenido a PitchLab.");
      try { localStorage.setItem("pl-beta", "1"); } catch (e) {}
      setTimeout(() => { location.href = next; }, PL.reduced() ? 150 : 950);
      return;
    }
    tries++;
    d.classList.add("err");
    if (tries >= MAX_TRIES) {
      lockedUntil = Date.now() + LOCK_MS; tries = 0;
      msg("Demasiados intentos. Espera 30 segundos.");
      d.querySelectorAll(".key").forEach((k) => (k.disabled = true));
      setTimeout(() => { d.querySelectorAll(".key").forEach((k) => (k.disabled = false)); msg("Escribe el código de 4 dígitos."); }, LOCK_MS);
    } else msg("Ese código no es. Revisa con quien te invitó.");
    setTimeout(() => { d.classList.remove("err"); code = ""; busy = false; paint(); }, 650);
  }

  function open(trigger) {
    lastTrigger = trigger || document.activeElement;
    const d = dlg();
    code = ""; busy = false; d.classList.remove("ok", "err"); paint();
    msg("Escribe el código de 4 dígitos.");
    if (!d.open) { d.showModal(); requestAnimationFrame(() => d.classList.add("show")); }
    setTimeout(() => d.querySelector(".pin-win").focus(), 50);
  }
  function close() {
    const d = dlg(); if (!d.open) return;
    d.classList.remove("show");
    setTimeout(() => { d.close(); if (location.hash === "#beta") history.replaceState(null, "", location.pathname + location.search); lastTrigger?.focus?.(); }, PL.reduced() ? 0 : 200);
  }

  document.addEventListener("click", (e) => { const t = e.target.closest("[data-open-pin]"); if (t) { e.preventDefault(); open(t); } });
  document.addEventListener("DOMContentLoaded", () => { if (location.hash === "#beta") open(); });
  window.PLPin = { open };
})();
