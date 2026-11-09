import React, { useState } from "react";
import { LoginForm, type LoginFormProps } from "./login-form.js";
import { loginRanking } from "./preview-data.js";

export default {
  title: "PitchLab/Entrar",
  id: "pitchlab-entrar",
  parameters: { layout: "fullscreen" },
};

function LoginPreview(props: Pick<LoginFormProps, "initialMode" | "initialFeedback">) {
  const [action, setAction] = useState("");
  return (
    <>
      <LoginForm
        {...props}
        ranked={loginRanking}
        signupHref="?id=pitchlab-crear-cuenta--vacio&viewMode=story"
        recoveryHref="?id=pitchlab-entrar--enlace-magico&viewMode=story"
        onProvider={(provider) => setAction(`Acceso de ejemplo con ${provider === "google" ? "Google" : "Apple"}.`)}
        onPassword={() => ({ error: "Credenciales incorrectas. Revisa tu correo y contraseña." })}
        onMagicLink={() => { setAction("Acción de ejemplo. No se envió un correo."); }}
      />
      {action && <p className="pl-preview-status" role="status">{action}</p>}
    </>
  );
}

export const Contrasena = () => <LoginPreview />;
Contrasena.storyName = "Contraseña";
export const EnlaceMagico = () => <LoginPreview initialMode="link" />;
EnlaceMagico.storyName = "Enlace mágico";
export const EnlaceEnviado = () => (
  <LoginPreview initialMode="link" initialFeedback={{ kind: "sent", text: "Ejemplo de confirmación: el enlace para entrar vence en 15 minutos." }} />
);
EnlaceEnviado.storyName = "Enlace enviado";
export const CredencialesIncorrectas = () => (
  <LoginPreview initialFeedback={{ kind: "error", text: "Credenciales incorrectas. Revisa tu correo y contraseña." }} />
);
CredencialesIncorrectas.storyName = "Credenciales incorrectas";
