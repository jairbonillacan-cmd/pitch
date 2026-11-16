import React from "react";
import { notFound } from "next/navigation";
import { ImageResponse } from "next/og";
import { BRAND_TOKENS } from "@pitchlab/tokens";
import { loadPublicShareProfile } from "../../../src/server/public-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "Récord verificado en PitchLab";
export const size = { width: 1200, height: 630 } as const;
export const contentType = "image/png";

const bg = BRAND_TOKENS["--background-primary"];
const cardBg = BRAND_TOKENS["--background-secondary"];
const accent = BRAND_TOKENS["--brand-primary"];
const text = BRAND_TOKENS["--text-primary"];
const muted = BRAND_TOKENS["--text-secondary"];
const rule = BRAND_TOKENS["--border-default"];

export default async function PublicProfileOpenGraphImage({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<ImageResponse> {
  const { handle } = await params;
  const data = await loadPublicShareProfile(handle);
  if (!data) {
    notFound();
  }

  const { profile, publicRecord, badges } = data;
  const metrics: Array<{ label: string; value: string }> = [];

  if (publicRecord && !publicRecord.hidden && publicRecord.settled > 0) {
    const view = publicRecord.view;
    if (view.wonLost) {
      metrics.push({
        label: "Cerrados",
        value: `${view.wonLost.won}G – ${view.wonLost.lost}P`,
      });
    }
    if (view.hitRatePct !== null) {
      metrics.push({
        label: "Acierto",
        value: `${view.hitRatePct.toFixed(1)} %`,
      });
    }
    if (view.yieldPct !== null) {
      const sign = view.yieldPct > 0 ? "+" : "";
      metrics.push({
        label: "Rendimiento",
        value: `${sign}${view.yieldPct.toFixed(1)} %`,
      });
    } else if (view.avgClvPct !== null) {
      const sign = view.avgClvPct > 0 ? "+" : "";
      metrics.push({
        label: "Ventaja",
        value: `${sign}${view.avgClvPct.toFixed(1)} %`,
      });
    }
  }

  const initials =
    profile.displayName
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || profile.handle.slice(0, 2).toUpperCase();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: `linear-gradient(155deg, ${cardBg} 0%, ${bg} 72%)`,
          color: text,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 16,
                height: 16,
                background: accent,
                transform: "rotate(45deg)",
                borderRadius: 3,
              }}
            />
            <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em" }}>
              PitchLab · Perfil verificado
            </div>
          </div>
          {profile.isTipster ? (
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: bg,
                background: accent,
                padding: "8px 18px",
                borderRadius: 999,
              }}
            >
              Tipster Oficial
            </div>
          ) : (
            <div style={{ fontSize: 20, fontWeight: 600, color: muted }}>Socio</div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
          <div
            style={{
              width: 112,
              height: 112,
              borderRadius: 56,
              background: cardBg,
              border: `2px solid ${accent}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 40,
              fontWeight: 800,
              color: accent,
            }}
          >
            {initials}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 58, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.05 }}>
              {profile.displayName}
            </div>
            <div style={{ fontSize: 28, color: accent, fontWeight: 600 }}>@{profile.handle}</div>
            {badges?.featured.length ? (
              <div style={{ fontSize: 22, color: muted }}>
                {badges.featured.map((b) => b.label).join(" · ")}
              </div>
            ) : null}
          </div>
        </div>

        {metrics.length > 0 ? (
          <div
            style={{
              display: "flex",
              gap: 28,
              borderTop: `1px solid ${rule}`,
              paddingTop: 28,
            }}
          >
            {metrics.map((m) => (
              <div
                key={m.label}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  padding: "16px 24px",
                  borderRadius: 16,
                  border: `1px solid ${rule}`,
                  background: cardBg,
                  minWidth: 220,
                }}
              >
                <div style={{ fontSize: 18, color: muted, textTransform: "uppercase" }}>
                  {m.label}
                </div>
                <div style={{ fontSize: 36, fontWeight: 800 }}>{m.value}</div>
              </div>
            ))}
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              borderTop: `1px solid ${rule}`,
              paddingTop: 24,
              fontSize: 24,
              color: muted,
            }}
          >
            <div>
              {publicRecord?.hidden
                ? "Récord mantenido en privado por el socio"
                : "Picks sellados antes del inicio del partido"}
            </div>
            <div>pitchlab.mx/u/{profile.handle}</div>
          </div>
        )}
      </div>
    ),
    size,
  );
}
