"use client";

import React, { useEffect } from "react";
import { getMascotPath } from "@pitchlab/sports-assets";
import {
  Button,
  FloatingNav,
  PinPad,
  Icon,
} from "@pitchlab/ui";
import { useBetaPin } from "./use-beta-pin.js";

export function LoginClient({
  nextPath,
}: {
  nextPath: string;
}): React.JSX.Element {
  const { pinOpen, openPin, closePin, submitPin } = useBetaPin(nextPath);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#beta") {
      openPin();
    }
  }, [openPin]);

  return (
    <>
      <a className="skip" href="#main">
        Saltar al contenido
      </a>

      <FloatingNav onOpenBetaPin={openPin} activeAuthRoute="login" />

      <main className="auth" id="main">
        <aside className="visual" aria-hidden="true">
          <div className="fieldgrid" />
          <div className="mascot">
            <img
              src={getMascotPath("radar")}
              alt=""
              width={380}
              height={380}
            />
          </div>
          <blockquote>
            <p>Tu código de socio abre la beta.</p>
            <span>Las cuentas llegan después. Hoy se entra con invitación.</span>
          </blockquote>
        </aside>

        <section className="panel acard" aria-labelledby="t">
          <h1 className="h2" id="t">
            Entrar
          </h1>
          <p className="secondary" style={{ margin: 0 }}>
            Bienvenido de vuelta.
          </p>
          <div className="notice">
            <Icon name="info" />
            <span>
              Las cuentas abren pronto. Mientras tanto, la beta es solo con
              código de socio.
            </span>
          </div>
          <Button
            size="tall"
            appearance="d1"
            className="w-full btn-beta"
            type="button"
            data-open-pin=""
            onClick={openPin}
          >
            Entrar a la beta con código{" "}
            <span data-icon="arrow">
              <Icon name="arrow" className="icon size-5" />
            </span>
          </Button>
          <div className="or">o con tu cuenta</div>
          <form
            className="auth-form"
            onSubmit={(e) => e.preventDefault()}
            aria-describedby="soon-login"
          >
            <fieldset disabled>
              <div className="field">
                <label htmlFor="em">Correo</label>
                <input
                  id="em"
                  type="email"
                  autoComplete="email"
                  placeholder="tu@correo.com"
                />
              </div>
              <div className="field">
                <label htmlFor="pw">Contraseña</label>
                <input
                  id="pw"
                  type="password"
                  autoComplete="current-password"
                />
              </div>
              <Button
                variant="secondary"
                appearance="d1"
                className="w-full disabled:pointer-events-auto disabled:cursor-not-allowed disabled:opacity-100"
                type="submit"
              >
                Iniciar sesión
              </Button>
            </fieldset>
            <p
              className="caption muted"
              id="soon-login"
              style={{ textAlign: "center", margin: "var(--space-2) 0 0" }}
            >
              Disponible al abrir las cuentas.
            </p>
          </form>
          <p className="switch-link">
            ¿No tienes cuenta? <a href="/signup">Crear cuenta</a>
          </p>
        </section>
      </main>

      <PinPad open={pinOpen} onClose={closePin} onSubmitPin={submitPin} />
    </>
  );
}
