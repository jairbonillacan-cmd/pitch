"use client";

import React, { useId, useState } from "react";
import type { PlatformGame } from "../types";
import { MaestroIcon } from "./MaestroPrimitives";
import { TopLayerModalDialog } from "./PlatformOverlays";

export function confidenceTone(score: number): string {
  if (score >= 62) return "var(--pl-success)";
  if (score >= 45) return "var(--pl-brand)";
  return "var(--pl-warning)";
}

const LEVEL_COPY: Record<PlatformGame["confidenceLevel"], { word: string; meaning: string }> = {
  alta: {
    word: "alta",
    meaning: "El modelo tiene buenos datos y el partido tiene un favorito claro. Sus porcentajes suelen ser estables.",
  },
  media: {
    word: "media",
    meaning: "Hay un favorito, pero faltan datos o el partido está más parejo. Toma los porcentajes como una guía.",
  },
  baja: {
    word: "baja",
    meaning: "Partido parejo o con pocos datos. Los porcentajes pueden moverse mucho; compara con calma antes de decidir.",
  },
};

/**
 * Chip «Conf. N» que abre la explicación del índice: qué significa, por qué tiene ese valor
 * y cuánto aporta cada factor. La confianza no dice si el pick se dará: dice qué tan
 * firme es la probabilidad.
 */
export function ConfidenceChip({
  game,
  size = "sm",
}: {
  game: Pick<PlatformGame, "confidenceScore" | "confidenceLevel" | "confidenceDetail" | "home" | "away">;
  size?: "sm" | "lg";
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const titleId = `pl-conf-title${useId().replace(/:/g, "")}`;
  const score = game.confidenceScore;
  const tone = confidenceTone(score);
  const copy = LEVEL_COPY[game.confidenceLevel];
  const factors = game.confidenceDetail?.factors ?? [];
  const reasons = game.confidenceDetail?.reasons ?? [];

  return (
    <>
      <button
        type="button"
        className={`pl-conf-chip ${size === "lg" ? "is-lg" : ""}`.trim()}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Confianza ${copy.word}, ${score} de 100. Ver qué significa`}
        data-confidence-chip=""
      >
        <span className="pl-home-meter" aria-hidden="true">
          <span style={{ width: `${score}%`, background: tone }} />
        </span>
        <span className="num">{size === "lg" ? `Confianza ${score}/100` : `Conf. ${score}`}</span>
        <MaestroIcon name="chevronRight" size={12} className="pl-conf-chip-icon" />
      </button>

      <TopLayerModalDialog open={open} onClose={() => setOpen(false)} ariaLabelledBy={titleId} maxWidth="28rem">
        <div className="pl-conf-sheet">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="m-0 text-xs font-semibold" style={{ color: "var(--pl-text-muted)" }}>
                {game.home.shortName} vs {game.away.shortName}
              </p>
              <h2 id={titleId} className="m-0 text-xl font-extrabold">
                Confianza {copy.word}
              </h2>
            </div>
            <strong className="num text-3xl" style={{ color: tone }}>
              {score}
              <span className="text-sm" style={{ color: "var(--pl-text-muted)" }}>
                /100
              </span>
            </strong>
          </div>

          <p className="m-0 text-sm leading-relaxed" style={{ color: "var(--pl-text-secondary)" }}>
            {copy.meaning}
          </p>
          <p className="m-0 text-xs leading-relaxed" style={{ color: "var(--pl-text-muted)" }}>
            La confianza no dice si el pick se va a dar: dice qué tan firme es la probabilidad
            que ves.
          </p>

          {factors.length > 0 ? (
            <ul className="pl-conf-factors" aria-label="De dónde sale la confianza">
              {factors.map((f) => (
                <li key={f.key}>
                  <div className="flex items-baseline justify-between gap-3">
                    <strong className="text-sm">{f.label}</strong>
                    <span className="text-xs num" style={{ color: "var(--pl-text-muted)" }}>
                      aporta {Math.round(f.value * f.weight * 100)} de {Math.round(f.weight * 100)}
                    </span>
                  </div>
                  <span className="pl-conf-bar" aria-hidden="true">
                    <span style={{ width: `${Math.round(f.value * 100)}%`, background: tone }} />
                  </span>
                  <p className="m-0 text-xs leading-relaxed" style={{ color: "var(--pl-text-secondary)" }}>
                    {f.detail}
                  </p>
                </li>
              ))}
            </ul>
          ) : reasons.length > 0 ? (
            <ul className="m-0 pl-4 text-sm space-y-1" style={{ color: "var(--pl-text-secondary)" }}>
              {reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          ) : null}

          <div className="flex justify-end">
            <button type="button" className="pl-btn-primary text-sm min-h-10 px-4" onClick={() => setOpen(false)}>
              Entendido
            </button>
          </div>
        </div>
      </TopLayerModalDialog>
    </>
  );
}
