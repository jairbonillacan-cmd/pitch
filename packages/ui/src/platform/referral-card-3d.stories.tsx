import React from "react";
import { ReferralCard3D } from "./public/ReferralCard3D";
import { ReferralInviteSurface } from "./public/ReferralInviteSurface";

export default {
  title: "Platform v4 / Referral Invite 3D",
  parameters: {
    layout: "fullscreen",
  },
};

export const SocioMensual = {
  render: () => (
    <ReferralInviteSurface
      code="75Z5-FY0D-DWJR-WM59"
      interval="MONTHLY"
      senderHandle="socio_pl"
    />
  ),
};

export const SocioAnual = {
  render: () => (
    <ReferralInviteSurface
      code="75Z5-FY0D-DWJR-WM59"
      interval="ANNUAL"
      senderHandle="socio_pl"
    />
  ),
};

export const TipstarVerificada = {
  render: () => (
    <ReferralInviteSurface
      code="SOFIA5"
      interval="MONTHLY"
      accountsEnabled
    />
  ),
};

export const CodigoUrlSinHandle = {
  render: () => (
    <ReferralInviteSurface
      sku="sku_iFHd43ge7daR"
      interval="MONTHLY"
      code="75Z5-FY0D-DWJR-WM59"
    />
  ),
};

export const CodigoVencido = {
  render: () => (
    <ReferralInviteSurface
      code="VENCIDO-2024"
      expired
    />
  ),
};

export const ReversoDeTitanioGris = {
  render: () => (
    <ReferralInviteSurface
      code="75Z5-FY0D-DWJR-WM59"
      interval="MONTHLY"
      senderHandle="socio_pl"
      initialFlipped
    />
  ),
};

export const TemaClaro = {
  render: () => (
    <ReferralInviteSurface
      code="75Z5-FY0D-DWJR-WM59"
      interval="MONTHLY"
      senderHandle="socio_pl"
      themeOverride="light"
    />
  ),
};

export const TarjetaAislada = {
  render: () => (
    <div className="pl-referral-stage">
      <ReferralCard3D
        code="75Z5-FY0D-DWJR-WM59"
        tierLabel="ULTRA"
        bottomLeftLabel="@socio_pl"
      />
    </div>
  ),
};
