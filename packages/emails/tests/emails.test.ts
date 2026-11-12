import { describe, expect, it } from "vitest";

import { EMAIL_TEMPLATES, renderEmail, type EmailTemplateId } from "../src";

const ids = Object.keys(EMAIL_TEMPLATES) as EmailTemplateId[];

describe("correos de PitchLab", () => {
  it("hay 15 plantillas", () => {
    expect(ids).toHaveLength(15);
  });

  it.each(ids)("%s: genera asunto, HTML con marca y texto plano", async (id) => {
    const { subject, html, text } = await renderEmail(id, EMAIL_TEMPLATES[id].sample as never);
    expect(subject.length).toBeGreaterThan(5);
    expect(html).toContain('lang="es-MX"');
    expect(html).toContain("/brand/email/pitchlab-horizontal.png");
    expect(html).toContain("PitchLab no acepta apuestas");
    expect(text).toContain("Solo mayores de 18");
    expect(text).not.toMatch(/<[a-z]+/i);
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

  it("la prueba sin tarjeta dice que no se cobra nada", async () => {
    const { text } = await renderEmail("trial-ending", {
      ...EMAIL_TEMPLATES["trial-ending"].sample,
      hasCard: false,
    });
    expect(text).toContain("No se te cobra nada");
  });
});
