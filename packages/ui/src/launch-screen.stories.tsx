import React from "react";
import { LaunchScreen } from "./launch-screen";

export default {
  title: "PitchLab/Arranque",
  parameters: { layout: "fullscreen" },
};

const Inline = (props: React.ComponentProps<typeof LaunchScreen>) => (
  <div style={{ minHeight: "100vh", background: "var(--pl-stage-bg)", display: "grid", placeItems: "center" }}>
    <div style={{ width: "min(960px, 100%)", border: "1px dashed var(--pl-border)", borderRadius: 16 }}>
      <LaunchScreen {...props} variant="inline" />
    </div>
  </div>
);

export const Arranque = { render: () => <LaunchScreen variant="full" /> };
export const ArranqueClaro = { ...Arranque, globals: { theme: "light" } };

export const AccesoConfirmado = { render: () => <LaunchScreen variant="full" confirmed /> };
export const AccesoConfirmadoClaro = { ...AccesoConfirmado, globals: { theme: "light" } };

export const CargaLenta = { render: () => <LaunchScreen variant="full" forceSlow onRetry={() => undefined} /> };
export const CargaLentaClaro = { ...CargaLenta, globals: { theme: "light" } };

export const DentroDelClub = { render: () => <Inline /> };
export const DentroDelClubClaro = { ...DentroDelClub, globals: { theme: "light" } };
