import React from "react";
import { ImageResponse } from "next/og";
import { BRAND_TOKENS } from "@pitchlab/tokens";

export const OG_CARD_SIZE = { width: 1200, height: 630 } as const;
export const OG_CARD_CONTENT_TYPE = "image/png" as const;

export interface EditorialOgStatTile {
  readonly label: string;
  readonly value: string;
  readonly tone?: "default" | "accent" | "success";
}

export interface EditorialOgCardInput {
  readonly eyebrow: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly badge?: string;
  readonly stats?: readonly EditorialOgStatTile[];
  readonly footnote?: string;
}

const INK = BRAND_TOKENS["--background-primary"];
const PANEL = BRAND_TOKENS["--background-secondary"];
const SURFACE = BRAND_TOKENS["--surface-default"];
const ACCENT = BRAND_TOKENS["--brand-primary"];
const SUCCESS = BRAND_TOKENS["--success"];
const TEXT = BRAND_TOKENS["--text-primary"];
const MUTED = BRAND_TOKENS["--text-secondary"];
const SUBTLE = BRAND_TOKENS["--text-muted"];
const RULE = BRAND_TOKENS["--border-default"];

function titleFontSize(title: string, hasSubtitle: boolean): number {
  if (title.length > 76) return 46;
  if (title.length > 56) return 52;
  if (title.length > 38) return hasSubtitle ? 56 : 62;
  return hasSubtitle ? 62 : 68;
}

function statColor(tone: EditorialOgStatTile["tone"]): string {
  if (tone === "accent") return ACCENT;
  if (tone === "success") return SUCCESS;
  return TEXT;
}

export function renderEditorialOgCard({
  eyebrow,
  title,
  subtitle,
  badge,
  stats,
  footnote = "pitchlab.mx",
}: EditorialOgCardInput): ImageResponse {
  const safeStats = (stats ?? []).slice(0, 4);
  const headingSize = titleFontSize(title, Boolean(subtitle));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "54px 68px",
          background: `linear-gradient(155deg, ${PANEL} 0%, ${INK} 74%)`,
          color: TEXT,
          fontFamily: "sans-serif",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 16 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: SURFACE,
                border: `1px solid ${RULE}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: 16,
                  height: 16,
                  background: ACCENT,
                  transform: "rotate(45deg)",
                  borderRadius: 3,
                }}
              />
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em" }}>PitchLab</div>
          </div>

          {badge ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "10px 20px",
                borderRadius: 999,
                border: `1px solid ${RULE}`,
                background: SURFACE,
                color: ACCENT,
                fontSize: 19,
                fontWeight: 700,
                letterSpacing: "0.04em",
              }}
            >
              {badge}
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            marginTop: 12,
            marginBottom: 12,
          }}
        >
          <div
            style={{
              fontSize: 21,
              fontWeight: 700,
              letterSpacing: "0.09em",
              textTransform: "uppercase",
              color: ACCENT,
            }}
          >
            {eyebrow}
          </div>

          <div
            style={{
              fontSize: headingSize,
              fontWeight: 800,
              lineHeight: 1.07,
              letterSpacing: "-0.03em",
              maxWidth: 1040,
            }}
          >
            {title}
          </div>

          {subtitle ? (
            <div
              style={{
                fontSize: 25,
                lineHeight: 1.35,
                color: MUTED,
                maxWidth: 980,
              }}
            >
              {subtitle}
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {safeStats.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "row", gap: 18 }}>
              {safeStats.map((tile) => (
                <div
                  key={tile.label}
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    padding: "16px 20px",
                    borderRadius: 14,
                    border: `1px solid ${RULE}`,
                    background: SURFACE,
                  }}
                >
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: SUBTLE,
                    }}
                  >
                    {tile.label}
                  </div>
                  <div
                    style={{
                      fontSize: 28,
                      fontWeight: 800,
                      letterSpacing: "-0.02em",
                      color: statColor(tile.tone),
                    }}
                  >
                    {tile.value}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div
            style={{
              display: "flex",
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              borderTop: `1px solid ${RULE}`,
              paddingTop: 18,
              fontSize: 20,
              color: MUTED,
            }}
          >
            <div>{footnote}</div>
            <div>Información para decidir · +18</div>
          </div>
        </div>
      </div>
    ),
    OG_CARD_SIZE,
  );
}
