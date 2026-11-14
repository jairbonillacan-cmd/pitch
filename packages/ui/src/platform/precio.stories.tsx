import React from "react";
import type { Meta } from "@storybook/react-vite";
import { PrecioPageSurface, type PrecioTransferContext } from "./public/PublicSiteSections";

const meta = {
  title: "PitchLab v4 / Precio",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

const STORY_TRANSFER_CONTEXT: PrecioTransferContext = {
  paymentMode: "transfer",
  accountsEnabled: true,
  viewerState: "member",
  memberHandle: "jair_mx",
  speiReferenceCode: "PL-JAIRMX-4821",
  bank: {
    configured: true,
    bank: "Banco Ejemplo (Storybook)",
    beneficiary: "PitchLab Ejemplo S.A. de C.V.",
    clabe: "000000000000000000",
    clabeMasked: "•••• •••• •••• ••0000",
    instructions: "Usa tu referencia única como concepto para conciliar tu pago.",
    supportEmail: "soporte@pitchlab.mx",
  },
  quotes: {
    monthlyCentavos: 29_900,
    annualCentavos: 239_000,
    referralDiscountApplied: false,
  },
  activePending: null,
  latestApproved: null,
  latestRejected: null,
  activePass: false,
};

export const VisitanteOscuro = {
  globals: { theme: "dark" },
  render: () => <PrecioPageSurface hasSession={false} />,
};

export const VisitanteClaro = {
  globals: { theme: "light" },
  render: () => <PrecioPageSurface hasSession={false} />,
};

export const SocioConSesionOscuro = {
  globals: { theme: "dark" },
  render: () => <PrecioPageSurface hasSession transferContext={STORY_TRANSFER_CONTEXT} />,
};

export const SocioConSesionClaro = {
  globals: { theme: "light" },
  render: () => <PrecioPageSurface hasSession transferContext={STORY_TRANSFER_CONTEXT} />,
};
