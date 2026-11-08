/* PitchLab · D1 · barra flotante y footer compartidos del sitio público */
(function () {
  const here = location.pathname.split("/").pop() || "landing.html";
  const onLanding = here === "landing.html";
  const link = (hash) => (onLanding ? hash : `landing.html${hash}`);

  const nav = document.querySelector("[data-nav]");
  if (nav) {
    nav.outerHTML = `
      <header class="fnav" id="fnav">
        <div class="bar">
          <a class="logo" href="landing.html" aria-label="PitchLab · Inicio"><img data-logo="horizontal" src="${PL.BRAND}/logos/pitchlab-horizontal-dark.svg" alt="" width="133" height="26"></a>
          <nav class="links" aria-label="Principal">
            <a href="${link("#como")}" data-sec="como">Cómo funciona</a>
            <a href="${link("#ligas")}" data-sec="ligas">Ligas</a>
            <a href="${link("#modelo")}" data-sec="modelo">El modelo</a>
            <a href="${link("#reglas")}" data-sec="reglas">Compromiso</a>
          </nav>
          <div class="right">
            <span data-theme-slot></span>
            <a class="btn btn-ghost" href="login.html">Entrar</a>
            <a class="btn btn-primary signup" href="signup.html">Crear cuenta</a>
          </div>
        </div>
      </header>`;
    const f = document.getElementById("fnav");
    const onScroll = () => f.classList.toggle("scrolled", scrollY > 24);
    addEventListener("scroll", onScroll, { passive: true }); onScroll();
    if (onLanding && "IntersectionObserver" in window) {
      const links = [...f.querySelectorAll("[data-sec]")];
      const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) links.forEach((a) => a.classList.toggle("active", a.dataset.sec === e.target.id)); }), { rootMargin: "-45% 0px -50% 0px" });
      document.addEventListener("DOMContentLoaded", () => links.forEach((a) => { const s = document.getElementById(a.dataset.sec); if (s) io.observe(s); }));
    }
  }

  const foot = document.querySelector("[data-footer]");
  if (foot) {
    const social = [["X", "https://x.com/pitchlabmx"], ["Instagram", "https://instagram.com/pitchlab.mx"], ["TikTok", "https://tiktok.com/@pitchlabmx"], ["YouTube", "https://youtube.com/@pitchlabmx"], ["Threads", "https://threads.net/@pitchlab.mx"], ["Facebook", "https://facebook.com/pitchlabmx"], ["LinkedIn", "https://linkedin.com/company/pitchlabmx"]];
    foot.outerHTML = `
      <footer class="site-foot">
        <div class="wrap">
          <div class="fgrid">
            <div><img data-logo="horizontal" src="${PL.BRAND}/logos/pitchlab-horizontal-dark.svg" alt="PitchLab" width="148" height="29"><p class="small secondary" style="margin:var(--space-4) 0 0">Lee el juego con datos.</p></div>
            <div><h3>Producto</h3><ul><li><a href="login.html#beta">Entrar a la beta</a></li><li><a href="${link("#como")}">Cómo funciona</a></li><li><a href="${link("#ligas")}">Ligas</a></li></ul></div>
            <div><h3>Legal</h3><ul><li><a href="#">Aviso de privacidad</a></li><li><a href="#">Términos</a></li><li><a href="#">Juego responsable</a></li><li><a href="#">Créditos y licencias</a></li></ul></div>
            <div><h3>Redes</h3><ul>${social.map(([n, u]) => `<li><a href="${u}" rel="noopener">${n}</a></li>`).join("")}</ul></div>
          </div>
          <p class="legal">PitchLab no acepta apuestas ni administra fondos. Solo mayores de 18 años. Las probabilidades son estimaciones y no garantizan resultados. Emblemas y mascota: ilustraciones de PitchLab.</p>
        </div>
      </footer>`;
  }
})();
