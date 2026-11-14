"use client";

import React, { useEffect, useRef } from "react";

const CHANNEL_NAME = "pitchlab-auth";
const CHECK_INTERVAL_MS = 4_000;
const LINK_LIFETIME_MS = 15 * 60_000;

export type EmailConfirmationStep = "sent" | "confirmed" | "expired";

export interface ConfirmedSession {
  email: string;
  completed: boolean;
}

export function emailConfirmationCallbacks(mode: "login" | "signup", next?: string) {
  const confirmed = new URLSearchParams({ paso: "confirmado" });
  const expired = new URLSearchParams({ paso: "vencido" });
  if (next) {
    confirmed.set("next", next);
    expired.set("next", next);
  }
  const callbackURL = `/${mode}?${confirmed}`;
  return { callbackURL, newUserCallbackURL: callbackURL, errorCallbackURL: `/${mode}?${expired}` };
}

/** The broadcast is only a signal. Both tabs verify the server session before continuing. */
export function useEmailConfirmation(
  step: EmailConfirmationStep | null,
  expectedEmail: string,
  enabled: boolean,
  attempt: number,
  onSession: (session: ConfirmedSession) => void,
  onInvalid: () => void,
): void {
  const callbacks = useRef({ onSession, onInvalid });
  useEffect(() => {
    callbacks.current = { onSession, onInvalid };
  }, [onSession, onInvalid]);

  useEffect(() => {
    if (!enabled || (step !== "sent" && step !== "confirmed")) return;
    const controller = new AbortController();
    const until = Date.now() + LINK_LIFETIME_MS;
    let checking = false;
    let repeatFromBroadcast = false;
    let finished = false;
    let channel: BroadcastChannel | undefined;
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
    } catch {
      // Polling also covers browsers that restrict BroadcastChannel.
    }

    const check = async (fromBroadcast = false) => {
      if (finished || controller.signal.aborted || Date.now() >= until) return;
      if (checking) {
        repeatFromBroadcast ||= fromBroadcast;
        return;
      }
      if (step === "sent" && !fromBroadcast && document.hidden) return;
      checking = true;
      try {
        const response = await fetch("/api/me/signup", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          if (step === "confirmed" && response.status === 401) callbacks.current.onInvalid();
          return;
        }
        const session = (await response.json()) as ConfirmedSession;
        if (controller.signal.aborted || Date.now() >= until) return;
        if (expectedEmail && session.email.toLowerCase() !== expectedEmail.trim().toLowerCase()) return;
        finished = true;
        if (step === "confirmed") channel?.postMessage({ type: "signed-in" });
        callbacks.current.onSession(session);
      } catch {
        // A transient network error can be retried by the next check.
      } finally {
        checking = false;
        if (repeatFromBroadcast) {
          repeatFromBroadcast = false;
          void check(true);
        }
      }
    };

    const onVisible = () => void check();
    if (channel) {
      channel.onmessage = (event) => {
        if (event.data?.type === "signed-in") void check(true);
      };
    }
    const interval = window.setInterval(onVisible, CHECK_INTERVAL_MS);
    const stop = () => {
      controller.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      channel?.close();
    };
    const timeout = window.setTimeout(stop, LINK_LIFETIME_MS);
    document.addEventListener("visibilitychange", onVisible);
    void check();
    return () => {
      window.clearTimeout(timeout);
      stop();
    };
  }, [step, expectedEmail, enabled, attempt]);
}

export function useContinueAfterConfirmation(destination: string | null): void {
  useEffect(() => {
    if (!destination) return;
    const timer = window.setTimeout(() => window.location.replace(destination), 650);
    return () => window.clearTimeout(timer);
  }, [destination]);
}

export function EmailConfirmationStatus({
  step,
  onRetry,
}: {
  step: "confirmed" | "expired";
  onRetry: () => void;
}): React.JSX.Element {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titleRef.current?.focus();
  }, [step]);

  const confirmed = step === "confirmed";
  return (
    <div className="pl-auth-sent pl-email-confirmation">
      <div aria-live="polite">
        <span className="pl-auth-sent-icon glass-card glass-ring" aria-hidden="true">
          {confirmed ? "✓" : "!"}
        </span>
        <h1 ref={titleRef} tabIndex={-1} className="pl-auth-title pl-auth-title--sent">
          {confirmed ? "Correo confirmado" : "Este enlace ya no sirve"}
        </h1>
        {confirmed ? <p className="pl-auth-sent-copy">Entrando…</p> : null}
      </div>
      {confirmed ? null : (
        <button type="button" className="pl-auth-btn pl-auth-btn-primary" onClick={onRetry}>
          Mandar otro enlace
        </button>
      )}
    </div>
  );
}
