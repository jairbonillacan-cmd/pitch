"use client";

import React, { useState } from "react";
import { Button, Input, Label, TextField } from "@heroui/react";
import { I18nProvider } from "react-aria-components";
import { BrandLogo, ThemeToggle } from "../primitives.js";

export type AuthProvider = "google" | "apple";
export type AuthResult = { error?: string } | void;

export function AuthFrame({ visual, children, signup = false }: {
  visual: React.ReactNode;
  children: React.ReactNode;
  signup?: boolean;
}) {
  return (
    <I18nProvider locale="es-MX">
      <main className="pl-auth" data-signup={signup || undefined}>
        <div className="pl-auth-main">
          <div className="pl-auth-brand">
            <a href="/" aria-label="PitchLab, inicio">
              <span className="pl-auth-brand-wide"><BrandLogo width={148} height={29} /></span>
              <span className="pl-auth-brand-compact"><BrandLogo variant="compact" width={124} height={28} /></span>
            </a>
            <ThemeToggle />
          </div>
          {children}
        </div>
        {visual}
      </main>
    </I18nProvider>
  );
}

export function ProviderButtons({ onProvider }: { onProvider: (provider: AuthProvider) => void }) {
  return (
    <div className="pl-auth-providers">
      <Button variant="secondary" onPress={() => onProvider("google")} aria-label="Continuar con Google">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" />
          <path d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" />
          <path d="M6.4 14a6 6 0 0 1 0-4V7.4H3.1a10 10 0 0 0 0 9.2z" />
          <path d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10c.8-2.3 3-4.1 5.6-4.1z" />
        </svg>
        <span><span className="pl-provider-prefix">Continuar con </span>Google</span>
      </Button>
      <Button variant="secondary" onPress={() => onProvider("apple")} aria-label="Continuar con Apple">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M16.4 12.6c0-2.4 2-3.5 2.1-3.6-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.8-3.2-.8A4.7 4.7 0 0 0 4.2 9.6c-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.2-.8s1.9.8 3.2.8c1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8 0 0-2.6-1-2.7-4zM14 5.4c.7-.8 1.1-1.9 1-3-1 0-2.1.7-2.8 1.5-.6.7-1.2 1.8-1 2.9 1.1.1 2.1-.6 2.8-1.4z" />
        </svg>
        <span><span className="pl-provider-prefix">Continuar con </span>Apple</span>
      </Button>
    </div>
  );
}

export function EmailField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <TextField name="email" type="email" value={value} onChange={onChange} isRequired fullWidth>
      <Label>Correo</Label>
      <Input autoComplete="email" placeholder="tu@correo.com" />
    </TextField>
  );
}

export function PasswordField({ value, onChange, signup = false, help }: {
  value: string;
  onChange: (value: string) => void;
  signup?: boolean;
  help?: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField name="password" type={visible ? "text" : "password"} value={value} onChange={onChange} isRequired fullWidth>
      <Label>Contraseña</Label>
      <div className="pl-password-control">
        <Input autoComplete={signup ? "new-password" : "current-password"} />
        <Button
          type="button"
          variant="ghost"
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          onPress={() => setVisible(!visible)}
        >{visible ? "Ocultar" : "Mostrar"}</Button>
      </div>
      {help}
    </TextField>
  );
}
