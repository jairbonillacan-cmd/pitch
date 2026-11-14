"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { decimalToAmericanInt } from "../access-guard";
import { ownHandleFor, usePlatformCore } from "../platform-provider";
import type { JournalEntry } from "../types";
import { MaestroIcon } from "./MaestroPrimitives";
import { TopLayerModalDialog } from "./PlatformOverlays";
import { renderWinningTicketPng, type WinningAspect, type WinningTicketContent } from "./winning-ticket";

function americanLabel(decimal: number): string {
  const a = decimalToAmericanInt(decimal);
  return a > 0 ? `+${a}` : `−${Math.abs(a)}`;
}

/** Contenido del boleto a partir de una entrada ganada de la bitácora. */
export function winningContentFromEntry(
  entry: JournalEntry,
  aspect: WinningAspect,
  handle: string,
  referralCode: string | null,
): WinningTicketContent {
  const isParlay = entry.origin === "Parlay Combinado";
  return {
    aspect,
    kind: isParlay ? "parlay" : "pick",
    leagueLabel: isParlay ? "Parlay" : entry.leagueLabel,
    matchLabel: entry.matchLabel,
    legs: isParlay ? entry.pickLabel.split(" + ").filter(Boolean) : [entry.pickLabel],
    decimal: entry.userDecimal,
    american: americanLabel(entry.userDecimal),
    units: entry.units,
    profitUnits: entry.units * (entry.userDecimal - 1),
    sealedLabel: entry.sealedAtIso
      ? new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric" }).format(new Date(entry.sealedAtIso))
      : entry.sealedAt,
    handle: `@${handle}`,
    link: referralCode ? `pitchlab.mx/i/${referralCode}` : "pitchlab.mx",
  };
}

/**
 * Comparte un pick o parlay ganado como boleto PNG. La vista previa es el mismo PNG que se
 * descarga o comparte (no una aproximación en HTML).
 */
export function WinningTicketDialog({
  entry,
  onClose,
}: {
  entry: JournalEntry | null;
  onClose: () => void;
}): React.JSX.Element | null {
  const { viewerIdentity, viewerRole } = usePlatformCore();
  const [aspect, setAspect] = useState<WinningAspect>("4:5");
  const [url, setUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState("");
  const colorRef = useRef<HTMLDivElement>(null);
  const titleId = `pl-win-title${useId().replace(/:/g, "")}`;
  const handle = ownHandleFor(viewerIdentity, viewerRole);

  useEffect(() => {
    if (!entry || !colorRef.current) return;
    let alive = true;
    let objectUrl: string | null = null;
    setError("");
    renderWinningTicketPng(
      winningContentFromEntry(entry, aspect, handle, viewerIdentity?.referralCode ?? null),
      colorRef.current,
    )
      .then((b) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(b);
        setBlob(b);
        setUrl(objectUrl);
      })
      .catch(() => alive && setError("No se pudo crear la imagen en este navegador."));
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [entry, aspect, handle, viewerIdentity?.referralCode]);

  if (!entry) return null;
  const fileName = `pitchlab-${entry.origin === "Parlay Combinado" ? "parlay" : "pick"}-ganado.png`;
  const file = blob ? new File([blob], fileName, { type: "image/png" }) : null;
  const canShareFile =
    typeof navigator !== "undefined" && Boolean(file && navigator.canShare?.({ files: [file] }));

  const download = () => {
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const share = async () => {
    if (!file) return;
    try {
      await navigator.share({ files: [file], text: "Lo vi primero en PitchLab" });
    } catch (err) {
      if ((err as DOMException)?.name !== "AbortError") download();
    }
  };

  return (
    <TopLayerModalDialog open onClose={onClose} ariaLabelledBy={titleId} maxWidth="34rem">
      <div ref={colorRef} className="pl-win-dialog">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="m-0 text-lg font-extrabold">
              Comparte tu boleto ganador
            </h2>
            <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
              Una imagen lista para Instagram, X o WhatsApp.
            </p>
          </div>
          <button type="button" className="pl-btn-glass min-h-9 px-2.5" onClick={onClose} aria-label="Cerrar">
            <MaestroIcon name="x" size={14} />
          </button>
        </div>

        <div className="seg-well" role="group" aria-label="Formato de la imagen">
          {(
            [
              { id: "4:5", label: "Publicación" },
              { id: "9:16", label: "Historia" },
            ] as const
          ).map((o) => (
            <button
              key={o.id}
              type="button"
              className="seg-btn text-xs"
              aria-pressed={aspect === o.id}
              onClick={() => setAspect(o.id)}
            >
              {o.label}
            </button>
          ))}
        </div>

        <div className={`pl-win-preview ${aspect === "9:16" ? "is-tall" : ""}`.trim()}>
          {url ? (
            <img src={url} alt={`Boleto ganador: ${entry.pickLabel}`} />
          ) : error ? (
            <p className="m-0 text-sm" role="alert">
              {error}
            </p>
          ) : (
            <span className="pl-cortex-skeleton w-full" aria-label="Creando imagen">
              <span style={{ width: "100%", height: "100%" }} />
            </span>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="pl-btn-glass text-sm min-h-10 px-4 inline-flex items-center gap-1.5" onClick={download} disabled={!url}>
            <MaestroIcon name="download" size={14} />
            <span>Descargar PNG</span>
          </button>
          {canShareFile ? (
            <button type="button" className="pl-btn-primary text-sm min-h-10 px-4 inline-flex items-center gap-1.5" onClick={share}>
              <MaestroIcon name="share" size={14} />
              <span>Compartir</span>
            </button>
          ) : null}
        </div>
      </div>
    </TopLayerModalDialog>
  );
}
