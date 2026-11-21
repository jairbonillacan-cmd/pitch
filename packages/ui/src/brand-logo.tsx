import React from "react";
import { getLogoPath } from "@pitchlab/sports-assets/brand";

/**
 * Marca PitchLab pura (compatible con React Server Components — 0 JS cliente y sin arrastrar
 * el registro de emblemas de equipos).
 */
export function BrandLogo({
  variant = "horizontal",
  width = 133,
  height = 26,
  alt = "",
  lazy = false,
}: {
  variant?: "horizontal" | "compact" | "isologo" | "isotype" | "stacked" | "wordmark";
  width?: number;
  height?: number;
  alt?: string;
  lazy?: boolean;
}): React.JSX.Element {
  return (
    <>
      <img
        className="only-dark"
        src={getLogoPath(variant, "dark")}
        alt={alt}
        width={width}
        height={height}
        loading={lazy ? "lazy" : undefined}
        decoding="async"
      />
      <img
        className="only-light"
        src={getLogoPath(variant, "light")}
        alt={alt}
        width={width}
        height={height}
        loading={lazy ? "lazy" : undefined}
        decoding="async"
      />
    </>
  );
}
