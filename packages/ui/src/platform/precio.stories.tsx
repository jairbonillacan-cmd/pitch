import React from "react";
import type { Meta } from "@storybook/react-vite";
import { PrecioPageSurface } from "./public/PublicSiteSections";

const meta = {
  title: "PitchLab v4 / Precio",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

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
  render: () => <PrecioPageSurface hasSession />,
};

export const SocioConSesionClaro = {
  globals: { theme: "light" },
  render: () => <PrecioPageSurface hasSession />,
};
