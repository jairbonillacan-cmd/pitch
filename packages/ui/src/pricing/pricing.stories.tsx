import React, { useState } from "react";
import { LANDING_PLANS } from "../landing/content.js";
import { Pricing } from "./pricing.js";

export default {
  title: "PitchLab/Planes",
  id: "pitchlab-planes",
  parameters: { layout: "fullscreen" },
};

export function Comparativa() {
  const [selection, setSelection] = useState("");
  return (
    <>
      <Pricing
        loginHref="?id=pitchlab-entrar--contrasena&viewMode=story"
        signupHref="?id=pitchlab-crear-cuenta--vacio&viewMode=story"
        onSelectPlan={(id) => setSelection(LANDING_PLANS.find((plan) => plan.id === id)?.name ?? "")}
      />
      {selection && <p className="pl-preview-status" role="status">Selección de ejemplo · {selection}</p>}
    </>
  );
}
