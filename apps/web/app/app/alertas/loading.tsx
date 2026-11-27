import React from "react";

export default function AlertasLoading(): React.JSX.Element {
  return (
    <div
      className="pl-route-skel space-y-5"
      role="status"
      aria-busy="true"
      aria-label="Cargando alertas de mercado"
    >
      <span className="sr-only">Cargando alertas de mercado</span>
      <div className="pl-skel-card rounded-2xl p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2 flex-1 min-w-[200px]">
          <div className="pl-skel-bar h-6 w-52 rounded-lg" />
          <div className="pl-skel-bar h-4 w-80 max-w-full rounded" />
        </div>
        <div className="flex items-center gap-2">
          <div className="pl-skel-bar h-11 w-28 rounded-xl" />
          <div className="pl-skel-bar h-11 w-28 rounded-xl" />
        </div>
      </div>

      <div className="pl-skel-card rounded-2xl p-4 space-y-3">
        <div className="pl-skel-bar h-11 w-full rounded-xl" />
        <div className="flex flex-wrap gap-2">
          <div className="pl-skel-bar h-8 w-28 rounded-full" />
          <div className="pl-skel-bar h-8 w-32 rounded-full" />
          <div className="pl-skel-bar h-8 w-24 rounded-full" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[0, 1, 2, 3].map((idx) => (
          <div key={idx} className="pl-skel-card rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="pl-skel-bar h-4 w-44 rounded" />
              <div className="pl-skel-bar h-6 w-16 rounded-full" />
            </div>
            <div className="pl-skel-bar h-3.5 w-full rounded" />
            <div className="pl-skel-bar h-3.5 w-3/4 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
