"use client";

import React from "react";
import { AtmosphereStage, ClubWorkspaceShell } from "../components/ShellChrome";

/**
 * Carga entre páginas del club. El encabezado y la barra lateral se quedan donde están
 * (siguen siendo usables) y solo el contenido muestra un esqueleto con la forma de la página.
 */
export function ClubLoadingView({ activePath }: { activePath: string }): React.JSX.Element {
  const isMatch = activePath.includes("/games/");
  return (
    <AtmosphereStage activePath={activePath}>
      <ClubWorkspaceShell activePath={activePath}>
        <div className="pl-loading" role="status" aria-live="polite">
          <span className="sr-only">Cargando…</span>
          <div className="pl-loading-progress" aria-hidden="true" />

          <div className="space-y-3" aria-hidden="true">
            <div className="pl-skel h-9 w-64 max-w-full" />
            <div className="flex gap-2">
              {[88, 110, 96, 120, 90].map((w, i) => (
                <div key={i} className="pl-skel h-9 rounded-full" style={{ width: w }} />
              ))}
            </div>
          </div>

          <div className="pl-skel-card space-y-4" aria-hidden="true">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="pl-skel size-14 rounded-2xl" />
                <div className="space-y-2">
                  <div className="pl-skel h-4 w-32" />
                  <div className="pl-skel h-3 w-20" />
                </div>
              </div>
              <div className="pl-skel h-8 w-24" />
              <div className="flex items-center gap-3">
                <div className="space-y-2 flex flex-col items-end">
                  <div className="pl-skel h-4 w-32" />
                  <div className="pl-skel h-3 w-20" />
                </div>
                <div className="pl-skel size-14 rounded-2xl" />
              </div>
            </div>
            <div className="pl-skel h-12 w-full rounded-2xl" />
            <div className="flex gap-0.5">
              <div className="pl-skel h-2.5 flex-[3]" />
              <div className="pl-skel h-2.5 flex-[2]" />
              <div className="pl-skel h-2.5 flex-[4]" />
            </div>
          </div>

          <div
            className={`grid grid-cols-1 ${isMatch ? "lg:grid-cols-3" : "md:grid-cols-2"} gap-4`}
            aria-hidden="true"
          >
            {Array.from({ length: isMatch ? 3 : 4 }, (_, i) => (
              <div key={i} className="pl-skel-card space-y-3">
                <div className="pl-skel h-5 w-28 rounded-full" />
                <div className="pl-skel h-5 w-3/4" />
                <div className="flex justify-between gap-3">
                  <div className="pl-skel h-8 w-16" />
                  <div className="pl-skel h-8 w-16" />
                  <div className="pl-skel h-8 w-16" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
