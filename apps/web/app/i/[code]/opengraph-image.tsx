import fs from "node:fs/promises";
import path from "node:path";
import React from "react";
import { ImageResponse } from "next/og";
import { MEMBERSHIP_SPEC, normalizeReferralCode } from "@pitchlab/ui";
import {
  resolveOgDisplayHandle,
  resolveShortInviteTarget,
} from "../../../src/server/short-invite";

export const runtime = "nodejs";
export const alt = "Invitación personal a PitchLab Ultra";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

let cachedCardDataUri: string | null = null;

async function getCardFrontDataUri(): Promise<string> {
  if (cachedCardDataUri) return cachedCardDataUri;
  const candidatePaths = [
    path.join(process.cwd(), "public", "brand", "referral-card-front.png"),
    path.join(process.cwd(), "apps", "web", "public", "brand", "referral-card-front.png"),
  ];
  for (const filePath of candidatePaths) {
    try {
      const buf = await fs.readFile(filePath);
      cachedCardDataUri = `data:image/png;base64,${buf.toString("base64")}`;
      return cachedCardDataUri;
    } catch (err) {
      void err;
    }
  }
  return "";
}

export default async function InviteOpenGraphImage({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<ImageResponse> {
  const { code: rawCode } = await params;
  const accountsEnabled = Boolean(process.env.DATABASE_URL);
  const resolved = await resolveShortInviteTarget(rawCode, { accountsEnabled });
  const code = resolved.code ?? normalizeReferralCode(rawCode) ?? "ULTRA";
  const handle = resolveOgDisplayHandle({
    code,
    dbHandle: resolved.handle,
    accountsEnabled,
  });

  const cardDataUri = await getCardFrontDataUri();
  const isDefaultJairCard = code === "JAIR-2611" && (!handle || handle === "jair");
  const trialDays = MEMBERSHIP_SPEC.referralTrialDays;
  const firstMonthMxn = MEMBERSHIP_SPEC.referralFriendFirstMonthMxn;
  const bothDays = MEMBERSHIP_SPEC.referralBothRewardDays;

  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 56px 0 24px",
          backgroundColor: "rgb(7, 6, 11)",
          color: "rgb(255, 255, 255)",
          fontFamily: "Inter, system-ui, sans-serif",
          boxSizing: "border-box",
          overflow: "hidden",
        }}
      >
        {/* Columna izquierda: captura frontal integrada sin costuras (sin WebGL) */}
        <div
          style={{
            position: "relative",
            width: "620px",
            height: "458px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            overflow: "hidden",
          }}
        >
          {cardDataUri ? (
            <img
              src={cardDataUri}
              width={620}
              height={458}
              alt=""
              style={{
                width: "620px",
                height: "458px",
                objectFit: "contain",
              }}
            />
          ) : null}

          {!isDefaultJairCard ? (
            <div
              style={{
                position: "absolute",
                left: "98px",
                bottom: "103px",
                width: "432px",
                height: "44px",
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 8px",
                backgroundImage:
                  "linear-gradient(95deg, rgb(36, 38, 43) 0%, rgb(32, 34, 39) 55%, rgb(27, 29, 34) 100%)",
                color: "rgb(220, 224, 232)",
                fontSize: "17px",
                fontWeight: 700,
                transform: "rotate(3.6deg)",
              }}
            >
              <span style={{ fontWeight: 600, color: "rgb(206, 211, 221)" }}>
                {handle ? `@${handle}` : "Pase Ultra"}
              </span>
              <span style={{ letterSpacing: "0.05em", fontWeight: 700 }}>{code}</span>
            </div>
          ) : null}

          {/* Difuminado perimetral hacia rgb(7, 6, 11) idéntico al lienzo base */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "64px",
              display: "flex",
              backgroundImage:
                "linear-gradient(to bottom, rgb(7, 6, 11) 0%, rgb(7, 6, 11) 18%, rgba(7, 6, 11, 0.78) 54%, rgba(7, 6, 11, 0) 100%)",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: "92px",
              display: "flex",
              backgroundImage:
                "linear-gradient(to top, rgb(7, 6, 11) 0%, rgb(7, 6, 11) 28%, rgba(7, 6, 11, 0.80) 62%, rgba(7, 6, 11, 0) 100%)",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              width: "82px",
              display: "flex",
              backgroundImage:
                "linear-gradient(to right, rgb(7, 6, 11) 0%, rgb(7, 6, 11) 18%, rgba(7, 6, 11, 0.78) 56%, rgba(7, 6, 11, 0) 100%)",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              right: 0,
              width: "68px",
              display: "flex",
              backgroundImage:
                "linear-gradient(to left, rgb(7, 6, 11) 0%, rgb(7, 6, 11) 18%, rgba(7, 6, 11, 0.78) 56%, rgba(7, 6, 11, 0) 100%)",
            }}
          />
        </div>

        {/* Luz ambiental unificada sobre todo el lienzo (misma tinta dentro y fuera del recorte) */}
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            display: "flex",
            backgroundImage:
              "radial-gradient(circle at 24% 34%, rgba(108, 80, 224, 0.14), rgba(7, 6, 11, 0) 56%), radial-gradient(circle at 90% 42%, rgba(190, 50, 90, 0.18), rgba(7, 6, 11, 0) 62%)",
          }}
        />

        {/* Columna derecha: @usuario te invita a PitchLab + la oferta */}
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            width: "476px",
            gap: "18px",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              fontSize: "22px",
              fontWeight: 600,
              color: "rgb(212, 212, 220)",
            }}
          >
            {handle ? (
              <span style={{ color: "rgb(255, 255, 255)", fontWeight: 700 }}>
                {`@${handle} te invita a PitchLab`}
              </span>
            ) : (
              <span>Invitación personal a PitchLab</span>
            )}
          </div>

          <div
            style={{
              display: "flex",
              fontSize: "54px",
              lineHeight: 1.05,
              fontWeight: 800,
              letterSpacing: "-0.03em",
              color: "rgb(255, 255, 255)",
            }}
          >
            {`${trialDays} días de PitchLab Ultra`}
          </div>

          <div
            style={{
              display: "flex",
              fontSize: "23px",
              lineHeight: 1.38,
              fontWeight: 500,
              color: "rgb(212, 212, 220)",
            }}
          >
            {`Sin cargo hoy. Luego $${firstMonthMxn} MXN tu primer mes y +${bothDays} días cuando pagas.`}
          </div>

          <div
            style={{
              display: "flex",
              marginTop: "8px",
              fontSize: "20px",
              fontWeight: 600,
              letterSpacing: "0.01em",
              color: "rgb(161, 161, 173)",
            }}
          >
            {`pitchlab.mx/i/${code}`}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
