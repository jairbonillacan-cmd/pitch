import React from "react";

export default function RefereeDetailLoading(): React.JSX.Element {
  return (
    <div
      className="pl-route-skel space-y-5"
      role="status"
      aria-busy="true"
      aria-label="Cargando ficha de árbitro"
    >
      <span className="sr-only">Cargando ficha de árbitro</span>
      <div className="flex items-center gap-3">
        <div className="pl-skel-bar h-11 w-24 rounded-full" />
      </div>

      <div className="pl-skel-card rounded-3xl p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <div className="pl-skel-bar h-14 w-14 rounded-full shrink-0" />
          <div className="space-y-2 flex-1 min-w-0">
            <div className="pl-skel-bar h-6 w-48 max-w-full rounded-lg" />
            <div className="pl-skel-bar h-4 w-36 max-w-full rounded" />
          </div>
        </div>
        <div className="pl-skel-bar h-9 w-28 rounded-full" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((idx) => (
          <div key={idx} className="pl-skel-card rounded-2xl p-4 space-y-2">
            <div className="pl-skel-bar h-3 w-20 rounded" />
            <div className="pl-skel-bar h-6 w-16 rounded-md" />
          </div>
        ))}
      </div>

      <div className="pl-skel-card rounded-2xl p-5 space-y-3">
        {[0, 1, 2, 3].map((idx) => (
          <div key={idx} className="pl-skel-bar h-12 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
