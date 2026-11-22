"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { MaestroIcon } from "./MaestroPrimitives";

export type AccountSupportModalKind = "feedback" | "support" | "delete" | "telegram" | null;

const FEEDBACK_CATEGORIES = [
  "Nueva liga o mercado",
  "Mejora visual / móvil",
  "Reportar un error",
  "Idea de herramienta",
] as const;

export interface FeedbackSupportDialogProps {
  kind: AccountSupportModalKind;
  onClose: () => void;
  accountsEnabled: boolean;
  onSuccessToast?: (message: string) => void;
  onErrorToast?: (message: string) => void;
}

export function FeedbackSupportDialog({
  kind,
  onClose,
  accountsEnabled,
  onSuccessToast,
  onErrorToast,
}: FeedbackSupportDialogProps): React.JSX.Element | null {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [category, setCategory] = useState<string>(FEEDBACK_CATEGORIES[0]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [confirmWord, setConfirmWord] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (kind && !dialog.open) {
      setErrorText(null);
      setDoneMessage(null);
      setSubject("");
      setMessage("");
      setConfirmWord("");
      try {
        dialog.showModal();
      } catch (err) {
        void err;
      }
    } else if (!kind && dialog.open) {
      dialog.close();
    }
  }, [kind]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => {
      dialog.returnValue = "";
      onCloseRef.current();
    };
    dialog.addEventListener("close", handleClose);

    const needsFallback =
      typeof HTMLDialogElement !== "undefined" && !("closedBy" in HTMLDialogElement.prototype);
    let pressedOutside = false;
    const isOutside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    const onPointerDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e)) dialog.close();
      pressedOutside = false;
    };
    if (needsFallback) {
      dialog.addEventListener("pointerdown", onPointerDown);
      dialog.addEventListener("pointerup", onPointerUp);
    }
    return () => {
      dialog.removeEventListener("close", handleClose);
      if (needsFallback) {
        dialog.removeEventListener("pointerdown", onPointerDown);
        dialog.removeEventListener("pointerup", onPointerUp);
      }
    };
  }, [kind]);

  if (!kind) return null;

  const isDelete = kind === "delete";
  const isFeedback = kind === "feedback";
  const isSupport = kind === "support";
  const isTelegram = kind === "telegram";

  const title = isFeedback
    ? "Feedback e ideas"
    : isSupport
      ? "Contactar con soporte"
      : isTelegram
        ? "Comunidad oficial en Telegram"
        : "Solicitar eliminación de cuenta";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorText(null);

    if (isDelete) {
      if (confirmWord.trim().toUpperCase() !== "ELIMINAR") {
        setErrorText("Escribe ELIMINAR para confirmar tu solicitud.");
        return;
      }
      if (!accountsEnabled) {
        const msg = "En modo de prueba con PIN no hay cuenta guardada en el servidor.";
        setDoneMessage(msg);
        onSuccessToast?.(msg);
        return;
      }
      setBusy(true);
      try {
        const res = await fetch("/api/me/deletion-request", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason: message.trim() }),
        });
        const data = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
        if (!res.ok) {
          const err = data?.error ?? "No se pudo registrar la solicitud.";
          setErrorText(err);
          onErrorToast?.(err);
          return;
        }
        const okMsg =
          data?.message ??
          "Solicitud registrada. Procesamos la baja y borrado en un máximo de 72 horas hábiles.";
        setDoneMessage(okMsg);
        onSuccessToast?.(okMsg);
      } catch (err) {
        void err;
        setErrorText("Error de conexión. Intenta de nuevo.");
      } finally {
        setBusy(false);
      }
      return;
    }

    if (message.trim().length < 6) {
      setErrorText("Cuéntanos con al menos 6 caracteres para poder ayudarte.");
      return;
    }

    if (!accountsEnabled) {
      const msg = isFeedback
        ? "Tu sugerencia se guardó localmente en modo prueba."
        : "En modo prueba escribe directo a soporte@pitchlab.mx.";
      setDoneMessage(msg);
      onSuccessToast?.(msg);
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/me/feedback", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: isSupport ? "support" : "feedback",
          category: isFeedback ? category : "Soporte",
          subject: subject.trim() || undefined,
          message: message.trim(),
        }),
      });
      const data = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!res.ok) {
        const err = data?.error ?? "No se pudo enviar tu mensaje.";
        setErrorText(err);
        onErrorToast?.(err);
        return;
      }
      const okMsg = data?.message ?? "Mensaje enviado al equipo de PitchLab.";
      setDoneMessage(okMsg);
      onSuccessToast?.(okMsg);
    } catch (err) {
      void err;
      setErrorText("Error de conexión. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="pl-native-modal pl-support-modal"
      data-support-dialog={kind}
      {...({ closedby: "any" } as Record<string, string>)}
    >
      <div className="pl-native-modal-head">
        <div>
          <h2 id={titleId} className="pl-native-modal-title">
            {title}
          </h2>
          <p className="pl-native-modal-sub">
            {isFeedback
              ? "Ayúdanos a decidir qué construir después en PitchLab."
              : isSupport
                ? "Recibe ayuda directa del equipo de PitchLab (soporte@pitchlab.mx)."
                : isTelegram
                  ? "Canal oficial de avisos, nuevas ligas y novedades de PitchLab."
                  : "Eliminaremos tu perfil, bitácora y preferencias en un máximo de 72 horas hábiles."}
          </p>
        </div>
        <button
          type="button"
          className="pl-native-modal-close"
          aria-label="Cerrar ventana"
          onClick={() => dialogRef.current?.close()}
        >
          <MaestroIcon name="x" size={16} />
        </button>
      </div>

      {isTelegram ? (
        <>
          <div className="pl-native-modal-body" tabIndex={0}>
            <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
              Nuestro canal oficial de Telegram estará disponible muy pronto para socios de PitchLab. Mientras tanto,
              puedes participar en <strong>Comunidad</strong> dentro de la app o escribirnos por{" "}
              <strong>Feedback e ideas</strong>.
            </p>
          </div>
          <div className="pl-native-modal-foot">
            <button
              type="button"
              className="pl-btn-primary min-h-11 px-5 text-sm"
              onClick={() => dialogRef.current?.close()}
            >
              Entendido
            </button>
          </div>
        </>
      ) : doneMessage ? (
        <>
          <div className="pl-native-modal-body" tabIndex={0}>
            <p className="pl-support-done" role="status">
              <MaestroIcon name="check" size={16} />
              <span>{doneMessage}</span>
            </p>
          </div>
          <div className="pl-native-modal-foot">
            <button
              type="button"
              className="pl-btn-primary min-h-11 px-5 text-sm"
              onClick={() => dialogRef.current?.close()}
            >
              Cerrar
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={handleSubmit} className="pl-support-form">
          <div className="pl-native-modal-body" tabIndex={0}>
            {isFeedback ? (
              <div className="pl-support-field">
                <span className="pl-support-label">Tipo de idea</span>
                <div className="pl-support-chips" role="group" aria-label="Tipo de feedback">
                  {FEEDBACK_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      aria-pressed={category === cat}
                      className={`pl-support-chip ${category === cat ? "is-on" : ""}`.trim()}
                      onClick={() => setCategory(cat)}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {isSupport ? (
              <label className="pl-support-field">
                <span className="pl-support-label">Asunto</span>
                <input
                  type="text"
                  maxLength={120}
                  className="glass-input min-h-11 px-3 text-base sm:text-sm w-full"
                  placeholder="Ej. Problema con mi cupón o pago SPEI"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </label>
            ) : null}

            <label className="pl-support-field">
              <span className="pl-support-label">
                {isDelete ? "Motivo (opcional)" : isFeedback ? "Tu sugerencia" : "¿En qué te ayudamos?"}
              </span>
              <textarea
                rows={4}
                maxLength={1500}
                className="glass-input p-3 text-base sm:text-sm w-full"
                placeholder={
                  isDelete
                    ? "Cuéntanos si algo no funcionó como esperabas…"
                    : isFeedback
                      ? "Describe qué liga, estadística o mejora te gustaría ver…"
                      : "Detalla lo que ocurrió y revisaremos tu cuenta de inmediato."
                }
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </label>

            {isDelete ? (
              <label className="pl-support-field">
                <span className="pl-support-label">
                  Escribe <strong>ELIMINAR</strong> para confirmar
                </span>
                <input
                  type="text"
                  autoComplete="off"
                  className="glass-input min-h-11 px-3 text-base sm:text-sm w-full"
                  placeholder="ELIMINAR"
                  value={confirmWord}
                  onChange={(e) => setConfirmWord(e.target.value)}
                />
              </label>
            ) : null}

            {errorText ? (
              <p className="m-0 text-xs font-semibold" role="alert" style={{ color: "var(--pl-danger)" }}>
                {errorText}
              </p>
            ) : null}
          </div>

          <div className="pl-native-modal-foot">
            <button
              type="button"
              autoFocus={isDelete}
              className="pl-btn-glass min-h-11 px-4 text-sm"
              onClick={() => dialogRef.current?.close()}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={busy}
              className={
                isDelete
                  ? "pl-btn-danger min-h-11 px-5 text-sm"
                  : "pl-btn-primary min-h-11 px-5 text-sm"
              }
            >
              {busy
                ? "Enviando…"
                : isDelete
                  ? "Solicitar eliminación"
                  : isFeedback
                    ? "Enviar idea"
                    : "Enviar a soporte"}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
