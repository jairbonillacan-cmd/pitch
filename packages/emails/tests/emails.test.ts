import { describe, expect, it } from "vitest";

import { EMAIL_TEMPLATES, EMAIL_WIRING, renderEmail, type EmailTemplateId } from "../src";

const ids = Object.keys(EMAIL_TEMPLATES) as EmailTemplateId[];

describe("correos de PitchLab", () => {
  it("hay 27 plantillas", () => {
    expect(ids).toHaveLength(27);
  });

  it.each(ids)("%s: genera asunto, HTML con marca y texto plano", async (id) => {
    const { subject, html, text } = await renderEmail(id, EMAIL_TEMPLATES[id].sample as never);
    expect(subject.length).toBeGreaterThan(5);
    expect(html).toContain('lang="es-MX"');
    expect(html).toContain("/brand/email/pitchlab-horizontal.png");
    expect(html).toContain("PitchLab no acepta apuestas");
    expect(text).toContain("Solo mayores de 18");
    expect(text).not.toMatch(/<[a-z]+/i);
    expect(text).not.toContain("&nbsp;");
  });

  it.each(ids)("%s: cumple contrato editorial 27/27 (rutas canónicas, preheader, alt, sin bitácora ni FD-16)", async (id) => {
    const { html, text } = await renderEmail(id, EMAIL_TEMPLATES[id].sample as never);
    const previewMatch = html.match(/id="__react-email-preview"[^>]*>([\s\S]*?)<\/div>/)
      ?? html.match(/display:none;overflow:hidden;line-height:1px;opacity:0[^>]*>([\s\S]*?)<\/div>/);
    const previewText = (previewMatch?.[1] ?? "")
      .replace(/<[^>]+>/g, "")
      .replace(/&\w+;|&#\d+;/g, "")
      .replace(/\u00a0/g, "")
      .trim();
    expect(previewText.length).toBeGreaterThanOrEqual(12);

    const imgTags = Array.from(html.matchAll(/<img\b[^>]*>/gi), (m) => m[0]);
    expect(imgTags.length).toBeGreaterThanOrEqual(1);
    for (const imgTag of imgTags) {
      expect(imgTag).toMatch(/\balt="[^"]+"/i);
    }

    const obsoleteRouteRe =
      /\/pricing\b|\/plans\b|\/tipstar\b|\/app\/bitacora\b|\/app\/cuenta\b|\/metodologia\b|\/estadisticas\/|\/partidos\//i;
    expect(html).not.toMatch(obsoleteRouteRe);
    expect(text).not.toMatch(obsoleteRouteRe);

    const visible = html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ");
    expect(visible).not.toMatch(/\bbit[aá]cora\b|del Club\b|\bConfianza\s+\d/i);
    expect(text).not.toMatch(/\bbit[aá]cora\b|del Club\b|\bConfianza\s+\d/i);
    expect(visible).not.toMatch(
      /\b(sofascore|bzzoiro|sportmonks|api-football|understat|polymarket|kalshi|fr[eé]chet|hoeffding|student-t|geodesic)\b/i,
    );
  });

  it("las muestras de invitación y tipster usan la ruta canónica corta /i/ y los CTAs usan Ver mi récord", async () => {
    const invite = await renderEmail("invite", EMAIL_TEMPLATES.invite.sample);
    expect(invite.html).toContain("https://pitchlab.mx/i/SOFIA5");
    expect(invite.text).toContain("https://pitchlab.mx/i/SOFIA5");

    const tipster = await renderEmail("tipster-activated", EMAIL_TEMPLATES["tipster-activated"].sample);
    expect(tipster.html).toContain("pitchlab.mx/i/SOFIA5");

    const graded = await renderEmail("pick-graded", EMAIL_TEMPLATES["pick-graded"].sample);
    expect(graded.html).toContain("Ver mi récord");

    const monthly = await renderEmail("monthly-record", EMAIL_TEMPLATES["monthly-record"].sample);
    expect(monthly.html).toContain("Ver mi récord");
  });

  it.each(ids)("%s: no usa lenguaje prohibido (seguro, fijo, candado, garantizado)", async (id) => {
    const { html } = await renderEmail(id, EMAIL_TEMPLATES[id].sample as never);
    const visible = html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ");
    expect(visible).not.toMatch(/\b(seguro|segura|fijo|candado|garantizad[oa])\b/i);
  });

  it("el enlace de acceso es la primera URL del HTML (la lee la prueba de auth)", async () => {
    const url = "https://pitchlab.mx/api/auth/magic-link/verify?token=abc&callbackURL=%2Fapp";
    const { html, subject } = await renderEmail("magic-link", { url });
    expect(subject).toBe("Tu acceso a PitchLab");
    expect(html.match(/href="([^"]+)"/)![1]!.replace(/&amp;/g, "&")).toBe(url);
  });

  it("el resumen semanal siempre trae el enlace para darse de baja", async () => {
    const { html } = await renderEmail("weekly-digest", {
      ...EMAIL_TEMPLATES["weekly-digest"].sample,
      unsubscribeUrl: "https://pitchlab.mx/baja?t=1",
    });
    expect(html).toContain("https://pitchlab.mx/baja?t=1");
    expect(html).toContain("Darme de baja");
  });

  it("los avisos no llevan barra de color a la izquierda", async () => {
    for (const id of ids) {
      const { html } = await renderEmail(id, EMAIL_TEMPLATES[id].sample as never);
      expect(html).not.toMatch(/border-left:3px/);
    }
  });

  it("el pick calificado y el resumen mensual traen cómo cambiar los avisos", async () => {
    const pick = await renderEmail("pick-graded", EMAIL_TEMPLATES["pick-graded"].sample);
    expect(pick.html).toContain("Cambiar avisos");
    const month = await renderEmail("monthly-record", EMAIL_TEMPLATES["monthly-record"].sample);
    expect(month.html).toContain("Darme de baja");
  });

  it("cada correo tiene su estado de conexión, y los que no están conectados dicen qué falta", () => {
    expect(Object.keys(EMAIL_WIRING).sort()).toEqual([...ids].sort());
    for (const id of ids) {
      const w = EMAIL_WIRING[id] as { state: string; trigger: string; needs?: string };
      expect(w.trigger.length).toBeGreaterThan(10);
      if (w.state === "blocked") expect(w.needs?.length ?? 0).toBeGreaterThan(20);
    }
    const live = ids.filter((id) => EMAIL_WIRING[id].state === "live");
    expect(live.sort()).toEqual([
      "access-expired",
      "content-removed",
      "data-health-alert",
      "magic-link",
      "monthly-record",
      "payment-receipt",
      "pick-graded",
      "referral-ambassador",
      "referral-rewarded",
      "referral-signed-up",
      "renewal-reminder",
      "tipster-activated",
      "tipster-new-subscriber",
      "tipster-payout",
      "transfer-coupon",
      "transfer-rejected",
      "trial-ended",
      "trial-ending",
      "weekly-digest",
      "welcome",
    ]);
  });

  it("recordatorio y pausa de acceso en modo transferencia no mencionan cargos automáticos", async () => {
    const reminder = await renderEmail("renewal-reminder", {
      ...EMAIL_TEMPLATES["renewal-reminder"].sample,
      paymentMode: "transfer",
      cardLast4: undefined,
    });
    expect(reminder.text).toContain("No hacemos cobros automáticos");
    const expired = await renderEmail("access-expired", {
      ...EMAIL_TEMPLATES["access-expired"].sample,
      paymentMode: "transfer",
    });
    expect(expired.text).toContain("transferencia SPEI");
  });

  it("la bienvenida no habla de prueba si la persona no la recibió", async () => {
    const withTrial = await renderEmail("welcome", { name: "Sofía", trialDays: 7 });
    expect(withTrial.text).toContain("7 días de prueba");
    const without = await renderEmail("welcome", { name: "Sofía", trialDays: null });
    expect(without.text).not.toContain("prueba");
  });

  it("la prueba sin tarjeta dice que no se cobra nada", async () => {
    const { text } = await renderEmail("trial-ending", {
      ...EMAIL_TEMPLATES["trial-ending"].sample,
      hasCard: false,
    });
    expect(text).toContain("No se te cobra nada");
  });
});
