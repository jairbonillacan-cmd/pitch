"use client";

import React, { useEffect, useRef, useState } from "react";

export interface ProgressiveImageProps
  extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "onLoad" | "onError"> {
  readonly onLoad?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  readonly onError?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
}

/**
 * Imagen con placeholder suave y transición blur-up sobre la propia `<img>` (Regla 9 · ADR-054).
 * - Cero `backdrop-filter` (cumple ADR-035).
 * - Detecta `img.complete && img.naturalWidth > 0` tras hidratación SSR / caché sin parpadeo.
 * - Conserva dimensiones intrínsecas (`CLS = 0`) y desactiva desenfoque en `prefers-reduced-motion`.
 */
export function ProgressiveImage({
  className,
  src,
  onLoad,
  onError,
  ...rest
}: ProgressiveImageProps): React.JSX.Element {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const srcKey = typeof src === "string" ? src : "";
  const isLoaded = loadedSrc === srcKey && srcKey.length > 0;

  useEffect(() => {
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth > 0 && srcKey) {
      setLoadedSrc(srcKey);
    }
  }, [srcKey]);

  return (
    <img
      ref={imgRef}
      src={src}
      {...rest}
      data-loaded={isLoaded ? "true" : "false"}
      className={`pl-prog-img${className ? ` ${className}` : ""}`}
      onLoad={(e) => {
        if (srcKey) setLoadedSrc(srcKey);
        onLoad?.(e);
      }}
      onError={(e) => {
        if (srcKey) setLoadedSrc(srcKey);
        onError?.(e);
      }}
    />
  );
}
