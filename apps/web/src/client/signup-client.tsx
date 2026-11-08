"use client";

import React from "react";
import { getMascotPath } from "@pitchlab/sports-assets";
import {
  FloatingNav,
  PinPad,
  Icon,
} from "@pitchlab/ui";
import { useBetaPin } from "./use-beta-pin.js";

export function SignupClient(): React.JSX.Element {
  const { pinOpen, openPin, closePin, submitPin } = useBetaPin("/app");

  return (
    <>
      <a className="skip" href="#main">
        Saltar al contenido
      </a>

      <FloatingNav onOpenBetaPin={openPin} activeAuthRoute="signup" />

      <main className="auth" id="main">
        <aside className="visual" aria-hidden="true">
          <div className="fieldgrid" />
          <div className="mascot">
            <img
              src={getMascotPath("futbol")}
              alt=""
              width={380}
              height={380}
            />
          </div>
          <blockquote>
            <p>Muy pronto, tu propio lab.</p>
            <span>
              Perfil, historial de análisis y alertas. Abrimos registros al
              cerrar la beta.
            </span>
          </blockquote>
        </aside>

        <section className="panel acard" aria-labelledby="t">
          <h1 className="h2" id="t">
            Crear cuenta
          </h1>
          <p className="secondary" style={{ margin: 0 }}>
            Gratis durante la beta.
          </p>
          <div className="notice">
            <Icon name="info" />
            <span>
              Los registros abren al terminar la beta privada. Si tienes código
              de socio, ya puedes entrar.
            </span>
          </div>
          <form
            className="auth-form"
            onSubmit={(e) => e.preventDefault()}
            aria-describedby="soon-signup"
          >
            <fieldset disabled>
              <div className="field">
                <label htmlFor="nm">Nombre</label>
                <input id="nm" autoComplete="name" />
              </div>
              <div className="field">
                <label htmlFor="em2">Correo</label>
                <input
                  id="em2"
                  type="email"
                  autoComplete="email"
                  placeholder="tu@correo.com"
                />
              </div>
              <div className="row2">
                <div className="field">
                  <label htmlFor="bd">Fecha de nacimiento</label>
                  <input id="bd" type="date" />
                </div>
                <div className="field">
                  <label htmlFor="pw2">Contraseña</label>
                  <input
                    id="pw2"
                    type="password"
                    autoComplete="new-password"
                  />
                </div>
              </div>
              <label
                className="small secondary"
                style={{
                  display: "flex",
                  gap: "8px",
                  alignItems: "flex-start",
                  marginBottom: "var(--space-4)",
                }}
              >
                <input type="checkbox" /> Tengo 18 años o más y acepto los
                términos y el aviso de privacidad.
              </label>
              <button className="btn btn-secondary btn-block" type="submit">
                Crear cuenta
              </button>
            </fieldset>
            <p
              className="caption muted"
              id="soon-signup"
              style={{ textAlign: "center", margin: "var(--space-2) 0 0" }}
            >
              Registro cerrado por ahora.
            </p>
          </form>
          <div className="or">¿tienes código?</div>
          <button
            className="btn btn-primary btn-block btn-beta"
            type="button"
            data-open-pin=""
            onClick={openPin}
          >
            Entrar a la beta <Icon name="arrow" />
          </button>
          <p className="switch-link">
            ¿Ya tienes cuenta? <a href="/login">Entrar</a>
          </p>
        </section>
      </main>

      <PinPad open={pinOpen} onClose={closePin} onSubmitPin={submitPin} />
    </>
  );
}
