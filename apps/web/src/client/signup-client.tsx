"use client";

import React, { useState } from "react";
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

export function SignupClient(): React.JSX.Element {
  const { pinOpen, openPin, closePin, submitPin } = useBetaPin("/app");
  const [lockedNotice, setLockedNotice] = useState(false);

  return (
    <>
      <a className="skip-link" href="#main">
        Saltar al contenido
      </a>

      <FloatingNav onOpenBetaPin={openPin} activeAuthRoute="signup" />

      <main id="main" className="auth-page">
        <div className="container">
          <div className="auth-shell">
            <section className="panel auth-card" aria-labelledby="signup-title">
              <div className="auth-head">
                <span
                  className="tag tag-info"
                  style={{ justifySelf: "start" }}
                >
                  <span className="dot" />
                  Registro por olas
                </span>
                <h1 id="signup-title">Crear cuenta</h1>
                <p>
                  Estamos abriendo lugares por invitación para cuidar la
                  calibración de cada liga.
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
                <div className="field-row">
                  <Field
                    id="su-name"
                    label="Nombre"
                    type="text"
                    placeholder="Alex"
                    autoComplete="given-name"
                  />
                  <Field
                    id="su-handle"
                    label="Alias"
                    type="text"
                    placeholder="@alex"
                    autoComplete="username"
                  />
                </div>
                <Field
                  id="su-email"
                  label="Correo electrónico"
                  type="email"
                  placeholder="tu@correo.com"
                  autoComplete="email"
                />
                <Field
                  id="su-pass"
                  label="Contraseña"
                  type="password"
                  placeholder="Mínimo 8 caracteres"
                  autoComplete="new-password"
                />
                <button
                  className="btn btn-secondary btn-block"
                  type="submit"
                >
                  Solicitar acceso
                </button>
              </form>

              {lockedNotice ? (
                <Notice>
                  El registro público se abre pronto. Si tienes invitación,
                  entra con tu código.
                </Notice>
              ) : null}

              <div className="auth-divider">¿ya tienes código?</div>

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
                  <span>Tengo código de invitación</span>
                </span>
                <Icon name="arrow" />
              </button>

              <div className="auth-foot">
                ¿Ya tienes cuenta? <a href="/login">Iniciar sesión</a>
              </div>
            </section>

            <aside className="panel auth-aside" aria-label="Cómo funciona la beta">
              <div>
                <p className="eyebrow">Por qué es cerrada</p>
                <h2 className="text-h2" style={{ marginTop: "6px" }}>
                  Preferimos precisión antes que ruido.
                </h2>
              </div>

              <div className="mascot" aria-hidden="true">
                <img
                  src={getMascotPath("celebrando")}
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
                    Validamos cada liga con snapshots reales antes de sumar más
                    mercados.
                  </span>
                </li>
                <li>
                  <Icon name="check" />
                  <span>
                    Sin spam, sin grupos VIP, sin promesas de ganancias.
                  </span>
                </li>
                <li>
                  <Icon name="check" />
                  <span>
                    Uso exclusivo para mayores de 18 años con enfoque
                    informativo.
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
