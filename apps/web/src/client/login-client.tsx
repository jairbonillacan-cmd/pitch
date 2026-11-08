"use client";

import React, { useEffect, useState } from "react";
import { getMascotPath } from "@pitchlab/sports-assets";
import {
  FloatingNav,
  PublicFooter,
  PinPad,
  Notice,
  Field,
  Icon,
} from "@pitchlab/ui";
import { useBetaPin } from "./use-beta-pin.js";

export function LoginClient({
  nextPath,
}: {
  nextPath: string;
}): React.JSX.Element {
  const { pinOpen, openPin, closePin, submitPin } = useBetaPin(nextPath);
  const [lockedNotice, setLockedNotice] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#beta") {
      openPin();
    }
  }, [openPin]);

  return (
    <>
      <a className="skip-link" href="#main">
        Saltar al contenido
      </a>

      <FloatingNav onOpenBetaPin={openPin} activeAuthRoute="login" />

      <main id="main" className="auth-page">
        <div className="container">
          <div className="auth-shell">
            <section className="panel auth-card" aria-labelledby="login-title">
              <div className="auth-head">
                <span
                  className="tag tag-info"
                  style={{ justifySelf: "start" }}
                >
                  <span className="dot" />
                  Beta por invitación
                </span>
                <h1 id="login-title">Iniciar sesión</h1>
                <p>
                  Las cuentas por correo se activan en la siguiente ola. Si
                  tienes invitación, entra con tu código.
                </p>
              </div>

              <form
                className="auth-form"
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  setLockedNotice(true);
                }}
              >
                <Field
                  id="login-email"
                  label="Correo electrónico"
                  type="email"
                  placeholder="tu@correo.com"
                  autoComplete="email"
                />
                <Field
                  id="login-pass"
                  label="Contraseña"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button
                  className="btn btn-secondary btn-block"
                  type="submit"
                >
                  Continuar con correo
                </button>
              </form>

              {lockedNotice ? (
                <Notice>
                  El acceso por correo aún no está activo. Usa el código de tu
                  invitación.
                </Notice>
              ) : null}

              <div className="auth-divider">acceso inmediato</div>

              <button
                className="btn btn-beta"
                type="button"
                data-open-pin=""
                onClick={openPin}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "10px",
                  }}
                >
                  <Icon name="shield" />
                  <span>Entrar a la beta con código</span>
                </span>
                <Icon name="arrow" />
              </button>

              <div className="auth-foot">
                ¿Aún no tienes cuenta?{" "}
                <a href="/signup">Solicitar lugar</a>
              </div>
            </section>

            <aside className="panel auth-aside" aria-label="Qué incluye la beta">
              <div>
                <p className="eyebrow">Dentro del panel</p>
                <h2 className="text-h2" style={{ marginTop: "6px" }}>
                  Tres ligas listas para analizar hoy.
                </h2>
              </div>

              <div className="mascot" aria-hidden="true">
                <img
                  src={getMascotPath("tactico")}
                  alt=""
                  width={230}
                  height={230}
                  loading="lazy"
                />
              </div>

              <ul className="auth-bullets">
                <li>
                  <Icon name="check" />
                  <span>
                    Liga MX, Premier League y NFL con probabilidades y momio
                    justo.
                  </span>
                </li>
                <li>
                  <Icon name="check" />
                  <span>
                    Factores explicados y traza del cálculo en cada partido.
                  </span>
                </li>
                <li>
                  <Icon name="check" />
                  <span>
                    Sin anuncios de casas de apuestas ni venta de picks.
                  </span>
                </li>
              </ul>
            </aside>
          </div>
        </div>
      </main>

      <PublicFooter onOpenBetaPin={openPin} />
      <PinPad open={pinOpen} onClose={closePin} onSubmitPin={submitPin} />
    </>
  );
}
