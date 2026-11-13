import React from "react";
import { ImageResponse } from "next/og";
import { BRAND_TOKENS } from "@pitchlab/tokens";

export const BLOG_OG_SIZE = { width: 1200, height: 630 } as const;

const ink = BRAND_TOKENS["--background-primary"];
const panel = BRAND_TOKENS["--background-secondary"];
const pulse = BRAND_TOKENS["--brand-primary"];
const text = BRAND_TOKENS["--text-primary"];
const muted = BRAND_TOKENS["--text-secondary"];
const rule = BRAND_TOKENS["--border-default"];

/** Tarjeta para redes sociales (1200×630) de las páginas del blog. */
export function renderBlogOgImage({
  eyebrow,
  title,
  footnote = "pitchlab.mx/blog",
}: {
  eyebrow: string;
  title: string;
  footnote?: string;
}): ImageResponse {
  const fontSize = title.length > 70 ? 56 : title.length > 45 ? 64 : 72;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: `linear-gradient(160deg, ${panel} 0%, ${ink} 70%)`,
          color: text,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 18,
              height: 18,
              background: pulse,
              transform: "rotate(45deg)",
              borderRadius: 3,
            }}
          />
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em" }}>PitchLab</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: pulse,
            }}
          >
            {eyebrow}
          </div>
          <div style={{ fontSize, fontWeight: 800, lineHeight: 1.05, letterSpacing: "-0.03em", maxWidth: 1000 }}>
            {title}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            borderTop: `1px solid ${rule}`,
            paddingTop: 24,
            fontSize: 22,
            color: muted,
          }}
        >
          <div>{footnote}</div>
          <div>Información para decidir · +18</div>
        </div>
      </div>
    ),
    BLOG_OG_SIZE,
  );
}
