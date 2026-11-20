import React from "react";

/**
 * Skeletons contextuales ultraligeros por ruta (ADR-053).
 * 100 % tokens `--pl-*` (oscuro y claro), cero `backdrop-filter`, cero dependencias JS cliente.
 */

function SkelBlock({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}): React.JSX.Element {
  return <div aria-hidden="true" className={`pl-skel-bar ${className}`.trim()} style={style} />;
}

/** Silueta de ficha de partido (`/app/[league]/g/[gameSlug]`). */
export function MatchDetailSkeleton(): React.JSX.Element {
  return (
    <div
      className="pl-route-skel space-y-4"
      role="status"
      aria-label="Cargando ficha del partido"
      aria-busy="true"
    >
      {/* Breadcrumb + botón Atrás */}
      <div className="flex items-center gap-2">
        <SkelBlock style={{ width: 88, height: 36, borderRadius: 999 }} />
        <SkelBlock style={{ width: 180, height: 18, borderRadius: 8 }} />
      </div>

      {/* Hero del partido */}
      <div className="pl-skel-card glass-ring rounded-2xl p-4 sm:p-6 space-y-5">
        <div className="flex items-center justify-between gap-2">
          <SkelBlock style={{ width: 140, height: 22, borderRadius: 999 }} />
          <SkelBlock style={{ width: 112, height: 28, borderRadius: 999 }} />
        </div>
        <div className="grid grid-cols-3 items-center gap-3">
          <div className="flex flex-col items-center gap-2">
            <SkelBlock style={{ width: 52, height: 52, borderRadius: 16 }} />
            <SkelBlock style={{ width: "75%", height: 16, borderRadius: 8 }} />
          </div>
          <div className="flex flex-col items-center gap-2">
            <SkelBlock style={{ width: 96, height: 32, borderRadius: 12 }} />
            <SkelBlock style={{ width: 72, height: 14, borderRadius: 8 }} />
          </div>
          <div className="flex flex-col items-center gap-2">
            <SkelBlock style={{ width: 52, height: 52, borderRadius: 16 }} />
            <SkelBlock style={{ width: "75%", height: 16, borderRadius: 8 }} />
          </div>
        </div>
        <SkelBlock style={{ width: "100%", height: 10, borderRadius: 999 }} />
      </div>

      {/* Barra de 5 pestañas */}
      <div className="flex items-center gap-2 overflow-hidden">
        {[92, 98, 96, 132, 86].map((w, idx) => (
          <SkelBlock key={idx} style={{ width: w, height: 38, borderRadius: 999, flexShrink: 0 }} />
        ))}
      </div>

      {/* Dos tarjetas de picks / factores */}
      <div className="grid gap-3 md:grid-cols-2">
        {[0, 1].map((idx) => (
          <div key={idx} className="pl-skel-card glass-ring rounded-2xl p-4 space-y-3">
            <SkelBlock style={{ width: "58%", height: 18, borderRadius: 8 }} />
            <SkelBlock style={{ width: "86%", height: 14, borderRadius: 8 }} />
            <SkelBlock style={{ width: "100%", height: 8, borderRadius: 999 }} />
            <div className="flex items-center justify-between pt-1">
              <SkelBlock style={{ width: 84, height: 28, borderRadius: 999 }} />
              <SkelBlock style={{ width: 96, height: 34, borderRadius: 999 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Silueta de hub de liga (`/app/[league]`). */
export function LeagueHubSkeleton(): React.JSX.Element {
  return (
    <div
      className="pl-route-skel space-y-4"
      role="status"
      aria-label="Cargando liga"
      aria-busy="true"
    >
      <div className="pl-skel-card glass-ring rounded-2xl p-4 sm:p-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <SkelBlock style={{ width: 44, height: 44, borderRadius: 12 }} />
          <div className="space-y-2">
            <SkelBlock style={{ width: 164, height: 22, borderRadius: 8 }} />
            <SkelBlock style={{ width: 112, height: 14, borderRadius: 8 }} />
          </div>
        </div>
        <SkelBlock style={{ width: 108, height: 36, borderRadius: 999 }} />
      </div>

      <div className="flex items-center gap-2 overflow-hidden">
        {[104, 118, 92].map((w, idx) => (
          <SkelBlock key={idx} style={{ width: w, height: 38, borderRadius: 999, flexShrink: 0 }} />
        ))}
      </div>

      <div className="space-y-2.5">
        {[0, 1, 2, 3].map((idx) => (
          <div key={idx} className="pl-skel-card glass-ring rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <SkelBlock style={{ width: 128, height: 14, borderRadius: 6 }} />
              <SkelBlock style={{ width: 72, height: 22, borderRadius: 999 }} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <SkelBlock style={{ width: "44%", height: 18, borderRadius: 8 }} />
              <SkelBlock style={{ width: 52, height: 18, borderRadius: 8 }} />
              <SkelBlock style={{ width: "36%", height: 18, borderRadius: 8 }} />
            </div>
            <SkelBlock style={{ width: "100%", height: 8, borderRadius: 999 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Silueta de perfil de equipo (`/app/[league]/t/[teamSlug]`). */
export function TeamProfileSkeleton(): React.JSX.Element {
  return (
    <div
      className="pl-route-skel space-y-4"
      role="status"
      aria-label="Cargando perfil del equipo"
      aria-busy="true"
    >
      <div className="flex items-center gap-2">
        <SkelBlock style={{ width: 88, height: 36, borderRadius: 999 }} />
        <SkelBlock style={{ width: 160, height: 18, borderRadius: 8 }} />
      </div>

      <div className="pl-skel-card glass-ring rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <SkelBlock style={{ width: 56, height: 56, borderRadius: 16 }} />
          <div className="space-y-2">
            <SkelBlock style={{ width: 180, height: 24, borderRadius: 8 }} />
            <SkelBlock style={{ width: 130, height: 14, borderRadius: 8 }} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SkelBlock style={{ width: 94, height: 38, borderRadius: 999 }} />
          <SkelBlock style={{ width: 94, height: 38, borderRadius: 999 }} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {[0, 1, 2, 3].map((idx) => (
          <div key={idx} className="pl-skel-card glass-ring rounded-2xl p-3.5 space-y-2">
            <SkelBlock style={{ width: "62%", height: 12, borderRadius: 6 }} />
            <SkelBlock style={{ width: "48%", height: 24, borderRadius: 8 }} />
          </div>
        ))}
      </div>

      <div className="pl-skel-card glass-ring rounded-2xl p-4 space-y-3">
        <SkelBlock style={{ width: 160, height: 18, borderRadius: 8 }} />
        {[0, 1, 2].map((idx) => (
          <SkelBlock key={idx} style={{ width: "100%", height: 42, borderRadius: 12 }} />
        ))}
      </div>
    </div>
  );
}

/** Silueta del armador de parlays (`/app/parlays`). */
export function ParlaysSkeleton(): React.JSX.Element {
  return (
    <div
      className="pl-route-skel grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]"
      role="status"
      aria-label="Cargando armador de parlays"
      aria-busy="true"
    >
      <div className="space-y-3">
        <div className="pl-skel-card glass-ring rounded-2xl p-4 sm:p-5 space-y-3">
          <SkelBlock style={{ width: 210, height: 24, borderRadius: 8 }} />
          <SkelBlock style={{ width: "75%", height: 14, borderRadius: 8 }} />
          <div className="flex flex-wrap gap-2 pt-1">
            {[96, 108, 92, 114].map((w, idx) => (
              <SkelBlock key={idx} style={{ width: w, height: 36, borderRadius: 999 }} />
            ))}
          </div>
        </div>
        {[0, 1, 2].map((idx) => (
          <div key={idx} className="pl-skel-card glass-ring rounded-2xl p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <SkelBlock style={{ width: "52%", height: 16, borderRadius: 8 }} />
              <SkelBlock style={{ width: 76, height: 32, borderRadius: 999 }} />
            </div>
            <SkelBlock style={{ width: "80%", height: 13, borderRadius: 6 }} />
          </div>
        ))}
      </div>

      <div className="pl-skel-card glass-ring rounded-2xl p-4 sm:p-5 space-y-3 self-start">
        <div className="flex items-center justify-between">
          <SkelBlock style={{ width: 136, height: 20, borderRadius: 8 }} />
          <SkelBlock style={{ width: 64, height: 24, borderRadius: 999 }} />
        </div>
        <SkelBlock style={{ width: "100%", height: 84, borderRadius: 14 }} />
        <SkelBlock style={{ width: "100%", height: 44, borderRadius: 999 }} />
      </div>
    </div>
  );
}

/** Silueta del comparador H2H (`/app/comparar`). */
export function CompareHubSkeleton(): React.JSX.Element {
  return (
    <div
      className="pl-route-skel space-y-4"
      role="status"
      aria-label="Cargando comparador cara a cara"
      aria-busy="true"
    >
      <div className="pl-skel-card glass-ring rounded-2xl p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <SkelBlock style={{ width: 200, height: 24, borderRadius: 8 }} />
          <SkelBlock style={{ width: 112, height: 36, borderRadius: 999 }} />
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] items-center">
          <SkelBlock style={{ width: "100%", height: 44, borderRadius: 12 }} />
          <SkelBlock style={{ width: 44, height: 44, borderRadius: 999 }} />
          <SkelBlock style={{ width: "100%", height: 44, borderRadius: 12 }} />
        </div>
      </div>

      <div className="pl-skel-card glass-ring rounded-2xl p-4 space-y-3">
        {[0, 1, 2, 3, 4].map((idx) => (
          <div key={idx} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <SkelBlock style={{ width: 48, height: 14, borderRadius: 6 }} />
              <SkelBlock style={{ width: 110, height: 14, borderRadius: 6 }} />
              <SkelBlock style={{ width: 48, height: 14, borderRadius: 6 }} />
            </div>
            <SkelBlock style={{ width: "100%", height: 8, borderRadius: 999 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Silueta de explorador de picks / comparador de momios (`/app/picks`, `/app/momios`). */
export function PicksSkeleton(): React.JSX.Element {
  return (
    <div className="pl-route-skel space-y-4" role="status" aria-label="Cargando picks" aria-busy="true">
      <div className="pl-skel-card glass-ring rounded-2xl p-4 sm:p-5 space-y-3">
        <SkelBlock style={{ width: 190, height: 24, borderRadius: 8 }} />
        <div className="flex flex-wrap gap-2">
          {[88, 118, 102, 94, 110].map((w, idx) => (
            <SkelBlock key={idx} style={{ width: w, height: 36, borderRadius: 10 }} />
          ))}
        </div>
      </div>
      <div className="space-y-2.5">
        {[0, 1, 2, 3, 4].map((idx) => (
          <div key={idx} className="pl-skel-card glass-ring rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-2 flex-1 min-w-[200px]">
              <SkelBlock style={{ width: "48%", height: 13, borderRadius: 6 }} />
              <SkelBlock style={{ width: "68%", height: 18, borderRadius: 8 }} />
            </div>
            <SkelBlock style={{ width: 88, height: 32, borderRadius: 10 }} />
            <SkelBlock style={{ width: 96, height: 38, borderRadius: 10 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Silueta de Comunidad (`/app/social`). */
export function SocialSkeleton(): React.JSX.Element {
  return (
    <div className="pl-route-skel space-y-4" role="status" aria-label="Cargando comunidad" aria-busy="true">
      <div className="flex items-center gap-2 overflow-hidden">
        {[84, 96, 94, 88].map((w, idx) => (
          <SkelBlock key={idx} style={{ width: w, height: 38, borderRadius: 10, flexShrink: 0 }} />
        ))}
      </div>
      {[0, 1, 2].map((idx) => (
        <div key={idx} className="pl-skel-card glass-ring rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-3">
            <SkelBlock style={{ width: 38, height: 38, borderRadius: 999 }} />
            <div className="space-y-1.5 flex-1">
              <SkelBlock style={{ width: 140, height: 15, borderRadius: 6 }} />
              <SkelBlock style={{ width: 96, height: 12, borderRadius: 6 }} />
            </div>
          </div>
          <SkelBlock style={{ width: "92%", height: 15, borderRadius: 6 }} />
          <SkelBlock style={{ width: "74%", height: 15, borderRadius: 6 }} />
          <SkelBlock style={{ width: "100%", height: 52, borderRadius: 12 }} />
        </div>
      ))}
    </div>
  );
}

/** Silueta de Player Props (`/app/props`). */
export function PropsSkeleton(): React.JSX.Element {
  return (
    <div className="pl-route-skel space-y-4" role="status" aria-label="Cargando props de jugadores" aria-busy="true">
      <div className="pl-skel-card glass-ring rounded-2xl p-4 space-y-3">
        <SkelBlock style={{ width: 180, height: 22, borderRadius: 8 }} />
        <div className="flex gap-2 overflow-hidden">
          {[112, 112, 112].map((w, idx) => (
            <SkelBlock key={idx} style={{ width: w, height: 36, borderRadius: 10, flexShrink: 0 }} />
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((idx) => (
          <div key={idx} className="pl-skel-card glass-ring rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2.5">
              <SkelBlock style={{ width: 40, height: 40, borderRadius: 999 }} />
              <div className="space-y-1.5 flex-1">
                <SkelBlock style={{ width: "70%", height: 15, borderRadius: 6 }} />
                <SkelBlock style={{ width: "45%", height: 12, borderRadius: 6 }} />
              </div>
            </div>
            <SkelBlock style={{ width: "100%", height: 44, borderRadius: 10 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Silueta de Mi récord (`/app/lab`). */
export function RecordSkeleton(): React.JSX.Element {
  return (
    <div className="pl-route-skel space-y-4" role="status" aria-label="Cargando Mi récord" aria-busy="true">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {[0, 1, 2, 3].map((idx) => (
          <div key={idx} className="pl-skel-card glass-ring rounded-2xl p-4 space-y-2">
            <SkelBlock style={{ width: "58%", height: 12, borderRadius: 6 }} />
            <SkelBlock style={{ width: "46%", height: 26, borderRadius: 8 }} />
          </div>
        ))}
      </div>
      <div className="pl-skel-card glass-ring rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <SkelBlock style={{ width: 160, height: 20, borderRadius: 8 }} />
          <SkelBlock style={{ width: 120, height: 34, borderRadius: 10 }} />
        </div>
        {[0, 1, 2, 3].map((idx) => (
          <SkelBlock key={idx} style={{ width: "100%", height: 52, borderRadius: 12 }} />
        ))}
      </div>
    </div>
  );
}

/** Silueta de Mi cuenta (`/app/account`) y perfil de socio (`/app/u/[handle]`). */
export function AccountSkeleton(): React.JSX.Element {
  return (
    <div className="pl-route-skel space-y-4" role="status" aria-label="Cargando perfil y cuenta" aria-busy="true">
      <div className="pl-skel-card glass-ring rounded-2xl p-5 flex flex-wrap items-center gap-4">
        <SkelBlock style={{ width: 64, height: 64, borderRadius: 999 }} />
        <div className="space-y-2 flex-1 min-w-[180px]">
          <SkelBlock style={{ width: 180, height: 22, borderRadius: 8 }} />
          <SkelBlock style={{ width: 120, height: 14, borderRadius: 6 }} />
        </div>
      </div>
      <div className="flex items-center gap-2 overflow-hidden">
        {[92, 114, 108].map((w, idx) => (
          <SkelBlock key={idx} style={{ width: w, height: 38, borderRadius: 10, flexShrink: 0 }} />
        ))}
      </div>
      <div className="pl-skel-card glass-ring rounded-2xl p-5 space-y-3">
        {[0, 1, 2].map((idx) => (
          <SkelBlock key={idx} style={{ width: "100%", height: 48, borderRadius: 12 }} />
        ))}
      </div>
    </div>
  );
}

/** Silueta de perfil de jugador (`/app/[league]/t/[teamSlug]/p/[playerSlug]`). */
export function PlayerProfileSkeleton(): React.JSX.Element {
  return (
    <div className="pl-route-skel space-y-4" role="status" aria-label="Cargando perfil del jugador" aria-busy="true">
      <div className="flex items-center gap-2">
        <SkelBlock style={{ width: 88, height: 36, borderRadius: 999 }} />
        <SkelBlock style={{ width: 160, height: 16, borderRadius: 8 }} />
      </div>
      <div className="pl-skel-card glass-ring rounded-2xl p-5 flex items-center gap-4">
        <SkelBlock style={{ width: 84, height: 84, borderRadius: 999 }} />
        <div className="space-y-2 flex-1">
          <SkelBlock style={{ width: 190, height: 24, borderRadius: 8 }} />
          <SkelBlock style={{ width: 140, height: 14, borderRadius: 6 }} />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {[0, 1, 2, 3].map((idx) => (
          <div key={idx} className="pl-skel-card glass-ring rounded-2xl p-3.5 space-y-2">
            <SkelBlock style={{ width: "55%", height: 12, borderRadius: 6 }} />
            <SkelBlock style={{ width: "42%", height: 22, borderRadius: 8 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Silueta genérica para historial, tipster, admin y canje (`/app/historial`, `/app/tipster`, `/app/admin`, `/app/canjear`). */
export function GenericSubpageSkeleton(): React.JSX.Element {
  return (
    <div className="pl-route-skel space-y-4" role="status" aria-label="Cargando sección" aria-busy="true">
      <div className="pl-skel-card glass-ring rounded-2xl p-5 space-y-2.5">
        <SkelBlock style={{ width: 210, height: 24, borderRadius: 8 }} />
        <SkelBlock style={{ width: "70%", height: 14, borderRadius: 6 }} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {[0, 1, 2, 3].map((idx) => (
          <div key={idx} className="pl-skel-card glass-ring rounded-2xl p-4 space-y-2.5">
            <SkelBlock style={{ width: "62%", height: 16, borderRadius: 8 }} />
            <SkelBlock style={{ width: "90%", height: 13, borderRadius: 6 }} />
            <SkelBlock style={{ width: "100%", height: 36, borderRadius: 10 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
