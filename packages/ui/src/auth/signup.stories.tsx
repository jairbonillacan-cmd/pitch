import React, { useState } from "react";
import { parseDate, today } from "@internationalized/date";
import { SignupForm, type SignupFormProps } from "./signup-form.js";
import { signupMatch } from "./preview-data.js";

export default {
  title: "PitchLab/Crear cuenta",
  id: "pitchlab-crear-cuenta",
  parameters: { layout: "fullscreen" },
};

const validExample = {
  email: "aficion@example.com",
  password: "ejemplo-2026",
  birthDate: parseDate("1995-05-12"),
  termsAccepted: true,
};

function SignupPreview(props: Pick<SignupFormProps, "initialValues" | "initialError" | "invitation">) {
  const [action, setAction] = useState("");
  return (
    <>
      <SignupForm
        {...props}
        match={signupMatch}
        loginHref="?id=pitchlab-entrar--contrasena&viewMode=story"
        onProvider={(provider) => setAction(`Registro de ejemplo con ${provider === "google" ? "Google" : "Apple"}.`)}
        onSubmit={() => { setAction("Formulario válido. En esta muestra los datos quedan en el navegador."); }}
      />
      {action && <p className="pl-preview-status" role="status">{action}</p>}
    </>
  );
}

export const Vacio = () => <SignupPreview />;
Vacio.storyName = "Vacío";
export const ContrasenaCorta = () => <SignupPreview initialValues={{ password: "clave" }} />;
ContrasenaCorta.storyName = "Contraseña corta";
export const ListaParaEnviar = () => <SignupPreview initialValues={validExample} />;
ListaParaEnviar.storyName = "Lista para enviar";
export const ConInvitacion = () => <SignupPreview invitation={{ name: "Ana", example: true }} />;
ConInvitacion.storyName = "Con invitación";
export const MenorDeEdad = () => (
  <SignupPreview initialValues={{ ...validExample, birthDate: today("America/Mexico_City").subtract({ years: 17 }) }} />
);
MenorDeEdad.storyName = "Menor de edad";
export const ErrorDelServidor = () => (
  <SignupPreview initialValues={validExample} initialError="No pudimos crear la cuenta. Intenta de nuevo." />
);
ErrorDelServidor.storyName = "Error del servidor";
