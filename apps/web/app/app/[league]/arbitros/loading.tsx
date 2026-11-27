import React from "react";

export default function ArbitrosLoading(): React.JSX.Element {
  return (
    <div
      className="pl-route-skel space-y-5"
      role="status"
      aria-busy="true"
      aria-label="Cargando árbitros de la liga"
    >
      <span className="sr-only">Cargando árbitros de la liga</span>
      <div className="pl-skel-card rounded-2xl p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2 flex-1 min-w-[200px]">
          <div className="pl-skel-bar h-6 w-56 rounded-lg" />
          <div className="pl-skel-bar h-4 w-72 max-w-full rounded" />
        </div>
        <div className="pl-skel-bar h-11 w-32 rounded-xl" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((idx) => (
          <div key={idx} className="pl-skel-card rounded-2xl p-4 space-y-2">
            <div className="pl-skel-bar h-3 w-20 rounded" />
            <div className="pl-skel-bar h-6 w-14 rounded-md" />
          </div>
        ))}
      </div>

      <div className="pl-skel-card rounded-2xl p-5 space-y-3">
        {[0, 1, 2, 3, 4].map((idx) => (
          <div key={idx} className="flex items-center justify-between gap-3 rounded-xl py-2">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="pl-skel-bar h-9 w-9 rounded-full shrink-0" />
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="pl-skel-bar h-4 w-40 max-w-full rounded" />
                <div className="pl-skel-bar h-3 w-28 max-w-full rounded" />
              </div>
            </div>
            <div className="pl-skel-bar h-7 w-16 rounded-full shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
