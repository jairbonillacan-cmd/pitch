"use client";

import React from "react";
import { FloatingNav, PublicFooter, PinPad } from "@pitchlab/ui";
import { useBetaPin } from "./use-beta-pin";

export function LegalShell({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const { pinOpen, openPin, closePin, submitPin } = useBetaPin("/app");

  return (
    <>
      <a className="skip-link" href="#main">
        Saltar al contenido
      </a>
      <FloatingNav onOpenBetaPin={openPin} activeAuthRoute="legal" />
      <main id="main" className="legal-page">
        <div className="container">
          <article className="panel legal-doc">
            <div>
              <p className="eyebrow">{eyebrow}</p>
              <h1>{title}</h1>
            </div>
            {children}
          </article>
        </div>
      </main>
      <PublicFooter onOpenBetaPin={openPin} />
      <PinPad open={pinOpen} onClose={closePin} onSubmitPin={submitPin} />
    </>
  );
}
