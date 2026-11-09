"use client";

import React, { useState } from "react";
import { Button, Checkbox, DateField, Description, FieldError, Label } from "@heroui/react";
import { today, type CalendarDate } from "@internationalized/date";
import { Mascot } from "../primitives.js";
import type { LvMatch } from "../landing/data.js";
import { AuthFrame, EmailField, PasswordField, ProviderButtons, type AuthProvider, type AuthResult } from "./auth-frame.js";
import { SignupForecast } from "./auth-forecast.js";

const minimumPasswordLength = 10;

export interface SignupInput {
  email: string;
  password: string;
  birthDate: string;
  termsAccepted: true;
  analytics: boolean;
  updates: boolean;
}

export interface SignupFormProps {
  match?: LvMatch;
  loginHref: string;
  invitation?: { name: string; example?: boolean };
  onProvider: (provider: AuthProvider) => void;
  onSubmit: (input: SignupInput) => AuthResult | Promise<AuthResult>;
  initialValues?: { email?: string; password?: string; birthDate?: CalendarDate; termsAccepted?: boolean };
  initialError?: string;
}

function Consent({ children, name, selected, onChange, required = false }: {
  children: React.ReactNode;
  name: string;
  selected: boolean;
  onChange: (checked: boolean) => void;
  required?: boolean;
}) {
  return (
    <Checkbox name={name} isSelected={selected} onChange={onChange} isRequired={required}>
      <Checkbox.Content>
        <Checkbox.Control><Checkbox.Indicator /></Checkbox.Control>
        <Label>{children}</Label>
      </Checkbox.Content>
    </Checkbox>
  );
}

export function SignupForm({
  match, loginHref, invitation, onProvider, onSubmit, initialValues, initialError,
}: SignupFormProps) {
  const [email, setEmail] = useState(initialValues?.email ?? "");
  const [password, setPassword] = useState(initialValues?.password ?? "");
  const [birthDate, setBirthDate] = useState<CalendarDate | null>(initialValues?.birthDate ?? null);
  const [terms, setTerms] = useState(initialValues?.termsAccepted ?? false);
  const [analytics, setAnalytics] = useState(false);
  const [updates, setUpdates] = useState(false);
  const [error, setError] = useState(initialError);
  const [pending, setPending] = useState(false);
  const currentDate = today("America/Mexico_City");
  const isAdult = birthDate != null && birthDate.compare(currentDate.subtract({ years: 18 })) <= 0;
  const remaining = Math.max(0, minimumPasswordLength - Array.from(password).length);
  const ready = Boolean(email.trim() && !remaining && isAdult && terms);
  let passwordHint = "Mínimo 10 caracteres";
  if (password) {
    if (remaining === 0) passwordHint = "Contraseña lista.";
    else passwordHint = remaining === 1 ? "Falta 1 carácter" : `Faltan ${remaining} caracteres`;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || !birthDate || pending) return;
    setPending(true);
    setError(undefined);
    try {
      const result = await onSubmit({
        email: email.trim(), password, birthDate: birthDate.toString(), termsAccepted: true, analytics, updates,
      });
      setError(result?.error);
    } catch {
      setError("No pudimos crear la cuenta. Intenta de nuevo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthFrame signup visual={<SignupForecast match={match} />}>
      <div className="pl-auth-form-area">
        {invitation && (
          <div className="pl-auth-invite">
            <Mascot size={44} />
            <div>
              {invitation.example && <p className="pl-account-eyebrow">Invitación de ejemplo</p>}
              <p><strong>{invitation.name} te invitó</strong>. Al crear tu cuenta tienes 7 días de Pro.</p>
            </div>
          </div>
        )}
        <header><h1>Crea tu cuenta</h1><p>Consulta lo más probable y compáralo con tu cuota.</p></header>
        <ProviderButtons onProvider={onProvider} />
        <p className="pl-auth-divider">o con tu correo</p>
        <form onSubmit={submit} className="pl-auth-form">
          <EmailField value={email} onChange={setEmail} />
          <PasswordField
            value={password}
            onChange={setPassword}
            signup
            help={<Description className="pl-password-help" data-ready={remaining === 0 || undefined} aria-live="polite">
              {remaining === 0 && <span aria-hidden="true">✓ </span>}{passwordHint}
            </Description>}
          />
          <DateField name="birthDate" isRequired fullWidth value={birthDate} onChange={setBirthDate}
            maxValue={currentDate} isInvalid={birthDate !== null && !isAdult}>
            <Label>Fecha de nacimiento</Label>
            <DateField.Group fullWidth>
              <DateField.Input>{(segment) => <DateField.Segment segment={segment} />}</DateField.Input>
            </DateField.Group>
            <Description className="pl-auth-help">
              Solo mayores de 18. Si no cumples la edad, no creamos la cuenta ni guardamos tus datos.
            </Description>
            {birthDate && !isAdult && <FieldError>Debes tener al menos 18 años para crear tu cuenta.</FieldError>}
          </DateField>
          <fieldset className="pl-auth-consent">
            <legend>Consentimientos</legend>
            <Consent name="terms" required selected={terms} onChange={setTerms}>Acepto los Términos y el Aviso de privacidad <small>(obligatorio)</small></Consent>
            <div className="pl-auth-policies"><a href="/legal/terminos">Leer Términos</a><a href="/legal/privacidad">Leer Aviso de privacidad</a></div>
            <Consent name="analytics" selected={analytics} onChange={setAnalytics}>Usar analítica para mejorar PitchLab <small>(opcional)</small></Consent>
            <Consent name="updates" selected={updates} onChange={setUpdates}>Recibir novedades por correo <small>(opcional)</small></Consent>
          </fieldset>
          {error && <p className="pl-auth-feedback" data-kind="error" role="alert">{error}</p>}
          <Button type="submit" isDisabled={!ready || pending}>Crear cuenta</Button>
        </form>
        <p className="pl-auth-foot">¿Ya tienes cuenta? <a href={loginHref}>Entrar</a></p>
      </div>
    </AuthFrame>
  );
}
