import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { asLeagueId } from "@pitchlab/contracts";
import {
  AuthSurfaceV4,
  LoginPreviewPanel,
  LoginSurfaceV4,
  PlatformProvider,
  buildPlatformDataset,
  type LandingHeroLeagueCard,
} from "../src/index";

const EMPTY_DATASET = buildPlatformDataset([]);

const PRIMARY_CARD: LandingHeroLeagueCard = {
  league: asLeagueId("liga-mx"),
  leagueShort: "Liga MX",
  leagueLabel: "Liga MX",
  roundLabel: "Liga MX · J17",
  whenLabel: "Sáb 14 nov · 17:00",
  home: { slug: "queretaro", name: "Querétaro", note: "Local" },
  away: { slug: "monterrey", name: "Monterrey", note: "Visitante" },
  splitProbabilities: [0.28, 0.25, 0.47],
  splitLabels: ["Local", "Empate", "Visita"],
  mostProbable: {
    label: "Monterrey o empate",
    p: 0.723,
    fairAmerican: "\u2212261",
    fairDecimal: "1.38",
  },
  otherMarkets: [],
};

const SECONDARY_CARD: LandingHeroLeagueCard = {
  league: asLeagueId("nfl"),
  leagueShort: "NFL",
  leagueLabel: "NFL",
  roundLabel: "NFL · Semana 10",
  whenLabel: "Dom 15 nov · 12:00",
  home: { slug: "new-york-giants", name: "Giants", note: "Local" },
  away: { slug: "washington-commanders", name: "Washington", note: "Visitante" },
  splitProbabilities: [0.361, 0.639],
  splitLabels: ["Giants", "Washington"],
  mostProbable: {
    label: "Washington +7.5",
    p: 0.639,
    fairAmerican: "\u2212177",
    fairDecimal: "1.56",
  },
  otherMarkets: [],
};

describe("LoginSurfaceV4 & LoginPreviewPanel (LOGIN-2)", () => {
  it("renderiza el estado Correo por defecto con copy exacto, un solo h1, un solo .btn-beta y sin mascota", () => {
    const html = renderToStaticMarkup(
      <PlatformProvider dataset={EMPTY_DATASET} initialRole="visitor">
        <AuthSurfaceV4
          mode="login"
          nextPath="/app/premier-league"
          previewSlot={
            <LoginPreviewPanel
              primaryCard={PRIMARY_CARD}
              secondaryCard={SECONDARY_CARD}
            />
          }
        />
      </PlatformProvider>,
    );

    expect(html).toContain("Entra a PitchLab");
    expect(html).toContain(
      "Lo más probable de cada partido, con su momio justo.",
    );
    expect(html).toContain("Volver al inicio");
    expect(html).toContain("o con tu correo");
    expect(html).toContain("Enviarme el enlace");
    expect(html).toContain(
      "Te mandamos un enlace para entrar sin contraseña. Vence en 15 minutos.",
    );
    expect(html).toContain("¿No tienes cuenta?");
    expect(html).toContain("Crear cuenta");
    expect(html).toContain("7 días gratis, sin tarjeta");
    expect(html).toContain("¿Eres socio? Entra con tu PIN");
    expect(html).toContain(
      "Solo mayores de 18. PitchLab no acepta apuestas.",
    );

    // Vista previa del servidor con partido principal, ProbSplit y segundo partido de otra liga
    expect(html).toContain("Hoy en PitchLab");
    expect(html).toContain("Querétaro");
    expect(html).toContain("Monterrey");
    expect(html).toContain("−261");
    expect(html).toContain("Washington +7.5");
    expect(html).toContain("psplit");
    expect(html).toContain(
      "Probabilidades de los motores de PitchLab. Tú comparas con el momio de tu casa y decides.",
    );

    // Un único h1 y un único .btn-beta en el DOM
    expect((html.match(/<h1[\s>]/g) ?? []).length).toBe(1);
    expect((html.match(/\bbtn-beta\b/g) ?? []).length).toBe(1);

    // Atributos de autocompletado y teclado móvil en correo
    expect(html).toContain('type="email"');
    expect(html.toLowerCase()).toContain('autocomplete="email"');
    expect(html.toLowerCase()).toContain('inputmode="email"');

    // Fuera de /login: sin mascota, sin pestañas viejas, sin casilla de edad ni contraseña apagada
    expect(html).not.toContain("mascot");
    expect(html).not.toContain("Prueba / Código");
    expect(html).not.toContain("PIN Socio");
    expect(html).not.toContain("Mostrar contraseña");
  });

  it("oculta la vista previa si no hay datos del servidor y muestra el aviso de referido sin campo vacío", () => {
    const html = renderToStaticMarkup(
      <PlatformProvider dataset={EMPTY_DATASET} initialRole="visitor">
        <AuthSurfaceV4
          mode="login"
          initialPromoCode="sofia5"
          previewSlot={null}
        />
      </PlatformProvider>,
    );

    expect(html).toContain("pl-auth-sheet--single");
    expect(html).not.toContain("Hoy en PitchLab");
    expect(html).toContain("SOFIA5");
    expect(html).toContain("aplicado: 7 días gratis, sin tarjeta");
    expect(html).toContain('href="/signup?code=SOFIA5"');
    expect((html.match(/<input\b/g) ?? []).length).toBe(1);
  });

  it("renderiza el estado Revisa tu correo y mantiene Contraseña detrás de passwordSignInEnabled", () => {
    const sentHtml = renderToStaticMarkup(
      <PlatformProvider
        dataset={EMPTY_DATASET}
        initialRole="visitor"
        accountsEnabled
      >
        <LoginSurfaceV4
          initialStep="sent"
          initialEmail="persona@pitchlab.mx"
        />
      </PlatformProvider>,
    );

    expect((sentHtml.match(/<h1[\s>]/g) ?? []).length).toBe(1);
    expect(sentHtml).toContain("Revisa tu correo");
    expect(sentHtml).toContain("persona@pitchlab.mx");
    expect(sentHtml).toContain("Reenviar");
    expect(sentHtml).toContain("Usar otro correo");

    const pwHtml = renderToStaticMarkup(
      <PlatformProvider
        dataset={EMPTY_DATASET}
        initialRole="visitor"
        accountsEnabled
      >
        <LoginSurfaceV4 passwordSignInEnabled initialStep="password" />
      </PlatformProvider>,
    );

    expect(pwHtml).toContain("Contraseña");
    expect(pwHtml).toContain("¿La olvidaste?");
    expect(pwHtml).toContain('aria-label="Mostrar contraseña"');
    expect(pwHtml).toContain("Entrar sin contraseña");
  });

  it("AuthSurfaceV4 con mode=signup delega en el registro en dos pasos (SIGNUP-2)", () => {
    const signupHtml = renderToStaticMarkup(
      <PlatformProvider dataset={EMPTY_DATASET} initialRole="visitor">
        <AuthSurfaceV4 mode="signup" initialPromoCode="SOFIA5" />
      </PlatformProvider>,
    );

    expect(signupHtml).toContain("Crea tu cuenta");
    expect(signupHtml).toContain("Paso 1 de 2");
    expect(signupHtml).not.toContain('id="auth-promo"');
    expect(signupHtml).toContain('id="auth-email"');
  });
});
