"use client";

import React, { useState } from "react";
import { Button } from "@heroui/react";
import type { HomeMatch } from "../app/data.js";
import { AuthFrame, EmailField, PasswordField, ProviderButtons, type AuthProvider, type AuthResult } from "./auth-frame.js";
import { LoginForecast } from "./auth-forecast.js";

type LoginMode = "password" | "link";
type LoginFeedback = { kind: "error" | "sent"; text: string };

export interface LoginFormProps {
  ranked: readonly HomeMatch[];
  signupHref: string;
  recoveryHref: string;
  onProvider: (provider: AuthProvider) => void;
  onPassword: (credentials: { email: string; password: string }) => AuthResult | Promise<AuthResult>;
  onMagicLink: (email: string) => AuthResult | Promise<AuthResult>;
  initialMode?: LoginMode;
  initialFeedback?: LoginFeedback;
}

export function LoginForm({
  ranked, signupHref, recoveryHref, onProvider, onPassword, onMagicLink,
  initialMode = "password", initialFeedback,
}: LoginFormProps) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [feedback, setFeedback] = useState(initialFeedback);
  const [pending, setPending] = useState(false);
  const isLink = mode === "link";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setFeedback(undefined);
    try {
      const result = isLink ? await onMagicLink(email.trim()) : await onPassword({ email: email.trim(), password });
      if (result?.error) setFeedback({ kind: "error", text: result.error });
      else if (isLink) setFeedback({ kind: "sent", text: "Revisa tu correo. El enlace para entrar vence en 15 minutos." });
    } catch {
      setFeedback({ kind: "error", text: "No pudimos completar la solicitud. Intenta de nuevo." });
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthFrame visual={<LoginForecast ranked={ranked} />}>
      <div className="pl-auth-form-area">
        <header><h1>Entra a PitchLab</h1><p>Lo más probable de cada partido, con su cuota justa.</p></header>
        <ProviderButtons onProvider={onProvider} />
        <p className="pl-auth-divider">o con tu correo</p>
        <form onSubmit={submit} className="pl-auth-form">
          <EmailField value={email} onChange={setEmail} />
          {isLink ? <p className="pl-auth-help">Te mandamos un enlace para entrar sin contraseña. Vence en 15 minutos.</p> : (
            <>
              <PasswordField value={password} onChange={setPassword} />
              <a className="pl-auth-recovery" href={recoveryHref}>¿La olvidaste?</a>
            </>
          )}
          {feedback && <p className="pl-auth-feedback" data-kind={feedback.kind} role={feedback.kind === "error" ? "alert" : "status"}>{feedback.text}</p>}
          <Button type="submit" isDisabled={pending}>{isLink ? "Enviarme el enlace" : "Entrar"}</Button>
        </form>
        <Button className="pl-auth-mode" variant="ghost" isDisabled={pending} onPress={() => {
          setMode(isLink ? "password" : "link");
          setFeedback(undefined);
          setPassword("");
        }}>{isLink ? "Entrar con contraseña" : "Entrar con un enlace por correo"}</Button>
        <p className="pl-auth-foot">¿No tienes cuenta? <a href={signupHref}>Crear cuenta</a></p>
        <p className="pl-auth-legal">Solo mayores de 18. PitchLab no acepta apuestas.</p>
      </div>
    </AuthFrame>
  );
}
