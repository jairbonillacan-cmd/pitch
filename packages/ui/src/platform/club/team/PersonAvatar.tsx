"use client";

import React, { useEffect, useState } from "react";
import { resolvePersonPhotoUrl } from "@pitchlab/sports-assets";
import { usePackIconBase } from "../../../pack-icon-theme";
import { useEmblemSurface } from "../../../sports";
import { ProgressiveImage } from "../../components/ProgressiveImage";

const EXTERNAL_BZZOIRO_IMG_RE = /^https:\/\/sports\.bzzoiro\.com\/img\//i;

function resolveSurfacePersonPhotoUrl(
  photoKey: string | null | undefined,
  surface: "public" | "app",
): string | null {
  const url = resolvePersonPhotoUrl(photoKey);
  if (!url) return null;
  if (surface !== "app" && EXTERNAL_BZZOIRO_IMG_RE.test(url)) {
    return null;
  }
  return url;
}

export interface PersonAvatarProps {
  photoKey?: string | null;
  fallbackPhotoKey?: string | null;
  role?: "player" | "coach";
  size?: number;
  priority?: boolean;
  className?: string;
}

/**
 * Retrato circular verificado para jugador o entrenador.
 * Prueba la URL primaria (`resolvePersonPhotoUrl`), detecta marcadores de posición 1×1
 * o errores de red, intenta la URL secundaria si existe y cae con elegancia al glifo
 * temático de PitchLab (`user` o `coach`).
 */
export function PersonAvatar({
  photoKey,
  fallbackPhotoKey,
  role = "player",
  size = 40,
  priority = false,
  className,
}: PersonAvatarProps): React.JSX.Element {
  const iconBase = usePackIconBase();
  const surface = useEmblemSurface();
  const primaryUrl = resolveSurfacePersonPhotoUrl(photoKey, surface);
  const secondaryUrl = resolveSurfacePersonPhotoUrl(fallbackPhotoKey, surface);

  const [stage, setStage] = useState<"primary" | "secondary" | "icon">(() =>
    primaryUrl ? "primary" : secondaryUrl ? "secondary" : "icon",
  );

  useEffect(() => {
    setStage(primaryUrl ? "primary" : secondaryUrl ? "secondary" : "icon");
  }, [primaryUrl, secondaryUrl]);

  const activeUrl =
    stage === "primary" ? primaryUrl : stage === "secondary" ? secondaryUrl : null;

  const advanceFallback = () => {
    setStage((prev) => {
      if (prev === "primary" && secondaryUrl && secondaryUrl !== primaryUrl) {
        return "secondary";
      }
      return "icon";
    });
  };

  const glyphSlug = role === "coach" ? "coach" : "user";
  const glyphSize = Math.max(15, Math.round(size * 0.54));

  return (
    <span
      className={`pl-person-avatar ${activeUrl ? "has-photo" : "is-fallback"} ${className ?? ""}`.trim()}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {activeUrl ? (
        <ProgressiveImage
          src={activeUrl}
          alt=""
          width={size}
          height={size}
          {...(priority ? { fetchPriority: "high" as const } : { loading: "lazy" as const })}
          decoding="async"
          draggable={false}
          referrerPolicy="no-referrer"
          className="pl-person-avatar-img"
          onLoad={(e) => {
            const el = e.currentTarget;
            if (el.naturalWidth > 0 && (el.naturalWidth <= 2 || el.naturalHeight <= 2)) {
              advanceFallback();
            }
          }}
          onError={advanceFallback}
        />
      ) : (
        <img
          src={`${iconBase}/32/interfaz/${glyphSlug}.webp`}
          srcSet={`${iconBase}/32/interfaz/${glyphSlug}.webp 1x, ${iconBase}/64/interfaz/${glyphSlug}.webp 2x`}
          alt=""
          width={glyphSize}
          height={glyphSize}
          {...(priority ? {} : { loading: "lazy" as const })}
          decoding="async"
          draggable={false}
          className="pl-person-avatar-glyph"
        />
      )}
    </span>
  );
}
