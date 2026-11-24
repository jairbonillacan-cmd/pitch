import React from "react";

function SkeletonWrapper({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="pl-route-skel space-y-5" role="status" aria-busy="true" aria-label={label}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

export function HomeClubSkeleton(): React.JSX.Element {
  return (
    <SkeletonWrapper label="Cargando jornada del día">
      <div className="pl-astro-topbar space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="pl-skel-bar h-9 w-20 rounded-full shrink-0" />
            <div className="pl-skel-bar h-9 w-24 rounded-full shrink-0" />
            <div className="pl-skel-bar h-9 w-24 rounded-full shrink-0" />
            <div className="pl-skel-bar h-9 w-24 rounded-full shrink-0" />
            <div className="pl-skel-bar hidden sm:block h-9 w-24 rounded-full shrink-0" />
          </div>
          <div className="flex items-center gap-2">
            <div className="pl-skel-bar h-9 w-28 rounded-xl" />
            <div className="pl-skel-bar h-9 w-24 rounded-xl" />
          </div>
        </div>
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="pl-skel-bar h-8 w-24 rounded-lg shrink-0" />
          <div className="pl-skel-bar h-8 w-36 rounded-lg shrink-0" />
          <div className="pl-skel-bar h-8 w-36 rounded-lg shrink-0" />
          <div className="pl-skel-bar hidden sm:block h-8 w-36 rounded-lg shrink-0" />
        </div>
      </div>

      <div className="pl-astro-workspace pl-home-md-workspace">
        <div className="pl-home-md-master space-y-3">
          <div className="pl-skel-card rounded-2xl p-3.5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="pl-skel-bar h-8 w-16 rounded-lg" />
                <div className="pl-skel-bar h-8 w-16 rounded-lg" />
                <div className="pl-skel-bar h-8 w-20 rounded-lg" />
              </div>
              <div className="pl-skel-bar h-7 w-20 rounded-full" />
            </div>
            <div className="flex items-center gap-2">
              <div className="pl-skel-bar h-7 w-24 rounded-full" />
              <div className="pl-skel-bar h-7 w-28 rounded-full" />
              <div className="pl-skel-bar h-7 w-24 rounded-full" />
            </div>
          </div>

          <div className="pl-skel-card rounded-2xl p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 pb-1">
              <div className="flex items-center gap-2">
                <div className="pl-skel-bar h-6 w-6 rounded-full" />
                <div className="pl-skel-bar h-4 w-32 rounded" />
              </div>
              <div className="pl-skel-bar h-4 w-12 rounded" />
            </div>
            {[0, 1, 2, 3].map((row) => (
              <div
                key={`h1-${row}`}
                className="flex items-center justify-between gap-3 rounded-xl px-2 py-2"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className="pl-skel-bar h-4 w-10 rounded shrink-0" />
                  <div className="space-y-1.5 flex-1">
                    <div className="pl-skel-bar h-3.5 w-36 max-w-full rounded" />
                    <div className="pl-skel-bar h-3.5 w-32 max-w-full rounded" />
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="pl-skel-bar h-6 w-14 rounded-lg" />
                  <div className="pl-skel-bar h-6 w-6 rounded-full" />
                </div>
              </div>
            ))}
          </div>

          <div className="pl-skel-card rounded-2xl p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 pb-1">
              <div className="flex items-center gap-2">
                <div className="pl-skel-bar h-6 w-6 rounded-full" />
                <div className="pl-skel-bar h-4 w-28 rounded" />
              </div>
              <div className="pl-skel-bar h-4 w-12 rounded" />
            </div>
            {[0, 1, 2].map((row) => (
              <div
                key={`h2-${row}`}
                className="flex items-center justify-between gap-3 rounded-xl px-2 py-2"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className="pl-skel-bar h-4 w-10 rounded shrink-0" />
                  <div className="space-y-1.5 flex-1">
                    <div className="pl-skel-bar h-3.5 w-40 max-w-full rounded" />
                    <div className="pl-skel-bar h-3.5 w-28 max-w-full rounded" />
                  </div>
                </div>
                <div className="pl-skel-bar h-6 w-14 rounded-lg shrink-0" />
              </div>
            ))}
          </div>
        </div>

        <aside className="pl-home-md-detail-pane">
          <div className="pl-skel-card rounded-2xl p-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="pl-skel-bar h-8 w-20 rounded-full" />
              <div className="pl-skel-bar h-8 w-24 rounded-full" />
            </div>
            <div className="pl-skel-bar h-8 w-28 rounded-xl" />
          </div>

          <div className="pl-skel-card rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="pl-skel-bar h-4 w-28 rounded" />
              <div className="pl-skel-bar h-5 w-20 rounded-full" />
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
              <div className="flex flex-col items-center gap-2">
                <div className="pl-skel-bar h-11 w-11 rounded-full" />
                <div className="pl-skel-bar h-4 w-24 rounded" />
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <div className="pl-skel-bar h-7 w-16 rounded-lg" />
                <div className="pl-skel-bar h-3.5 w-20 rounded" />
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="pl-skel-bar h-11 w-11 rounded-full" />
                <div className="pl-skel-bar h-4 w-24 rounded" />
              </div>
            </div>
          </div>

          <div className="pl-skel-card rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2 overflow-hidden">
              {[0, 1, 2, 3, 4].map((tab) => (
                <div key={`ht-${tab}`} className="pl-skel-bar h-8 w-20 rounded-full shrink-0" />
              ))}
            </div>
            {[0, 1, 2].map((card) => (
              <div
                key={`hp-${card}`}
                className="rounded-xl p-3.5 space-y-2 border border-transparent"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="pl-skel-bar h-4 w-44 rounded" />
                  <div className="pl-skel-bar h-6 w-16 rounded-full" />
                </div>
                <div className="pl-skel-bar h-3 w-3/4 rounded" />
                <div className="pl-skel-bar h-2.5 w-full rounded-full" />
              </div>
            ))}
          </div>
        </aside>
      </div>
    </SkeletonWrapper>
  );
}

export function MatchDetailSkeleton(): React.JSX.Element {
  return (
    <SkeletonWrapper label="Cargando ficha del partido">
      <div className="flex items-center justify-between gap-3">
        <div className="pl-skel-bar h-11 w-32 rounded-full" />
        <div className="pl-skel-bar h-5 w-44 rounded-lg" />
      </div>

      <div className="pl-skel-card rounded-3xl p-5 sm:p-6 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="pl-skel-bar h-4 w-36 rounded-md" />
          <div className="pl-skel-bar h-6 w-24 rounded-full" />
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 py-1">
          <div className="flex flex-col items-center gap-2.5">
            <div className="pl-skel-bar h-14 w-14 rounded-full" />
            <div className="pl-skel-bar h-4 w-28 rounded-md" />
            <div className="pl-skel-bar h-3 w-16 rounded" />
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="pl-skel-bar h-9 w-24 rounded-xl" />
            <div className="pl-skel-bar h-3.5 w-28 rounded" />
          </div>
          <div className="flex flex-col items-center gap-2.5">
            <div className="pl-skel-bar h-14 w-14 rounded-full" />
            <div className="pl-skel-bar h-4 w-28 rounded-md" />
            <div className="pl-skel-bar h-3 w-16 rounded" />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <div className="pl-skel-bar h-10 w-36 rounded-full" />
          <div className="pl-skel-bar h-10 w-36 rounded-full" />
        </div>
      </div>

      <div className="grid grid-cols-1 min-[1080px]:grid-cols-[minmax(300px,344px)_minmax(0,1fr)] gap-[18px] items-start">
        <aside className="space-y-4">
          <div className="pl-skel-card rounded-2xl p-4 space-y-3">
            <div className="pl-skel-bar h-4 w-32 rounded" />
            <div className="space-y-2">
              <div className="pl-skel-bar h-9 w-full rounded-xl" />
              <div className="pl-skel-bar h-9 w-full rounded-xl" />
              <div className="pl-skel-bar h-9 w-full rounded-xl" />
            </div>
          </div>
          <div className="pl-skel-card rounded-2xl p-4 space-y-3">
            <div className="pl-skel-bar h-4 w-28 rounded" />
            <div className="grid grid-cols-3 gap-2">
              <div className="pl-skel-bar h-14 rounded-xl" />
              <div className="pl-skel-bar h-14 rounded-xl" />
              <div className="pl-skel-bar h-14 rounded-xl" />
            </div>
          </div>
        </aside>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {[0, 1, 2, 3, 4].map((idx) => (
              <div key={idx} className="pl-skel-bar h-10 w-24 rounded-full" />
            ))}
          </div>
          <div className="pl-skel-card rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="pl-skel-bar h-8 w-44 rounded-full" />
              <div className="pl-skel-bar h-5 w-20 rounded" />
            </div>
            {[0, 1, 2].map((idx) => (
              <div key={`mp-${idx}`} className="rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="pl-skel-bar h-4 w-48 rounded" />
                  <div className="pl-skel-bar h-6 w-16 rounded-full" />
                </div>
                <div className="pl-skel-bar h-3.5 w-3/4 rounded" />
                <div className="pl-skel-bar h-2.5 w-full rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </SkeletonWrapper>
  );
}

export function LeagueHubSkeleton(): React.JSX.Element {
  return (
    <SkeletonWrapper label="Cargando resumen de liga">
      <div className="pl-skel-card rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="pl-skel-bar h-12 w-12 rounded-2xl shrink-0" />
            <div className="space-y-2">
              <div className="pl-skel-bar h-6 w-48 rounded-lg" />
              <div className="pl-skel-bar h-3.5 w-36 rounded" />
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="pl-skel-bar h-10 w-28 rounded-xl" />
            <div className="pl-skel-bar h-10 w-32 rounded-xl" />
          </div>
        </div>
        <div className="pl-skel-bar h-2.5 w-full rounded-full" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(320px,372px)_minmax(0,1fr)] gap-4 lg:gap-5 items-start">
        <aside className="space-y-4">
          <div className="pl-skel-card rounded-2xl p-4 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="pl-skel-bar h-4 w-28 rounded" />
              <div className="pl-skel-bar h-5 w-16 rounded-full" />
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-2">
              <div className="flex flex-col items-center gap-1.5">
                <div className="pl-skel-bar h-10 w-10 rounded-full" />
                <div className="pl-skel-bar h-3.5 w-20 rounded" />
              </div>
              <div className="pl-skel-bar h-6 w-12 rounded-lg" />
              <div className="flex flex-col items-center gap-1.5">
                <div className="pl-skel-bar h-10 w-10 rounded-full" />
                <div className="pl-skel-bar h-3.5 w-20 rounded" />
              </div>
            </div>
            <div className="pl-skel-bar h-9 w-full rounded-xl" />
          </div>

          <div className="pl-skel-card rounded-2xl p-4 space-y-2.5">
            <div className="pl-skel-bar h-4 w-36 rounded mb-1" />
            {[0, 1, 2, 3, 4].map((idx) => (
              <div key={`lh-m-${idx}`} className="flex items-center justify-between gap-2 py-1.5">
                <div className="space-y-1 flex-1">
                  <div className="pl-skel-bar h-3.5 w-36 rounded" />
                  <div className="pl-skel-bar h-3.5 w-32 rounded" />
                </div>
                <div className="pl-skel-bar h-6 w-14 rounded-lg" />
              </div>
            ))}
          </div>
        </aside>

        <div className="space-y-4">
          <div className="flex items-center gap-2 overflow-hidden">
            {[0, 1, 2, 3, 4].map((idx) => (
              <div key={`lh-t-${idx}`} className="pl-skel-bar h-10 w-24 rounded-full shrink-0" />
            ))}
          </div>
          <div className="pl-skel-card rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="pl-skel-bar h-5 w-40 rounded" />
              <div className="pl-skel-bar h-8 w-36 rounded-xl" />
            </div>
            <div className="space-y-2 pt-1">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((idx) => (
                <div key={`lh-r-${idx}`} className="flex items-center justify-between gap-3 py-1.5">
                  <div className="flex items-center gap-2.5">
                    <div className="pl-skel-bar h-4 w-5 rounded" />
                    <div className="pl-skel-bar h-6 w-6 rounded-full" />
                    <div className="pl-skel-bar h-4 w-32 rounded" />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="pl-skel-bar h-4 w-8 rounded" />
                    <div className="pl-skel-bar h-4 w-8 rounded" />
                    <div className="pl-skel-bar h-4 w-8 rounded" />
                    <div className="pl-skel-bar h-4 w-10 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </SkeletonWrapper>
  );
}

export function TeamProfileSkeleton(): React.JSX.Element {
  return (
    <SkeletonWrapper label="Cargando perfil del equipo">
      <div className="pl-skel-card rounded-3xl p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="pl-skel-bar h-16 w-16 rounded-2xl" />
          <div className="space-y-2">
            <div className="pl-skel-bar h-6 w-48 rounded-lg" />
            <div className="pl-skel-bar h-3.5 w-36 rounded" />
          </div>
        </div>
        <div className="pl-skel-bar h-10 w-32 rounded-full" />
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
        {[0, 1, 2, 3, 4].map((idx) => (
          <div key={idx} className="pl-skel-bar h-12 rounded-xl" />
        ))}
      </div>
    </SkeletonWrapper>
  );
}

export function ParlaysSkeleton(): React.JSX.Element {
  return (
    <SkeletonWrapper label="Cargando armador de parlays">
      <div className="pl-skel-card rounded-2xl p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="pl-skel-bar h-6 w-44 rounded-lg" />
          <div className="pl-skel-bar h-8 w-28 rounded-full" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {[0, 1, 2, 3].map((idx) => (
            <div key={idx} className="pl-skel-bar h-11 rounded-xl" />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4">
        <div className="space-y-3">
          {[0, 1, 2, 3].map((idx) => (
            <div key={idx} className="pl-skel-card rounded-2xl p-4 space-y-2.5">
              <div className="pl-skel-bar h-4 w-52 rounded" />
              <div className="pl-skel-bar h-10 rounded-xl" />
            </div>
          ))}
        </div>
        <div className="pl-skel-card rounded-2xl p-5 space-y-3">
          <div className="pl-skel-bar h-5 w-36 rounded" />
          <div className="pl-skel-bar h-24 rounded-xl" />
          <div className="pl-skel-bar h-11 rounded-full" />
        </div>
      </div>
    </SkeletonWrapper>
  );
}

export function CompareHubSkeleton(): React.JSX.Element {
  return (
    <SkeletonWrapper label="Cargando comparador">
      <div className="pl-skel-card rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="pl-skel-bar h-6 w-48 rounded-lg" />
          <div className="pl-skel-bar h-9 w-40 rounded-full" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="pl-skel-bar h-12 rounded-xl" />
          <div className="pl-skel-bar h-12 rounded-xl" />
        </div>
      </div>

      <div className="pl-skel-card rounded-2xl p-5 space-y-3">
        {[0, 1, 2, 3, 4].map((idx) => (
          <div key={idx} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <div className="pl-skel-bar h-4 rounded" />
            <div className="pl-skel-bar h-4 w-24 rounded" />
            <div className="pl-skel-bar h-4 rounded" />
          </div>
        ))}
      </div>
    </SkeletonWrapper>
  );
}

export function PicksSkeleton(): React.JSX.Element {
  return (
    <SkeletonWrapper label="Cargando catálogo de picks">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1.5">
          <div className="pl-skel-bar h-6 w-48 rounded-lg" />
          <div className="pl-skel-bar h-3.5 w-64 rounded" />
        </div>
        <div className="flex items-center gap-2">
          <div className="pl-skel-bar h-10 w-24 rounded-full" />
          <div className="pl-skel-bar h-10 w-28 rounded-full" />
          <div className="pl-skel-bar h-10 w-24 rounded-full" />
        </div>
      </div>

      <div className="pl-skel-card rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2 flex-1">
            <div className="pl-skel-bar h-4 w-32 rounded" />
            <div className="pl-skel-bar h-5 w-72 max-w-full rounded" />
            <div className="pl-skel-bar h-3.5 w-80 max-w-full rounded" />
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="pl-skel-bar h-12 w-20 rounded-xl" />
            <div className="pl-skel-bar h-11 w-32 rounded-full" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,74fr)_minmax(276px,26fr)] gap-4 items-start">
        <div className="space-y-3 min-w-0">
          <div className="flex items-center gap-2 overflow-hidden">
            {[0, 1, 2, 3, 4].map((idx) => (
              <div key={`pp-${idx}`} className="pl-skel-bar h-10 w-28 rounded-full shrink-0" />
            ))}
          </div>
          {[0, 1, 2, 3, 4, 5].map((idx) => (
            <div
              key={`pr-${idx}`}
              className="pl-skel-card rounded-2xl p-3.5 grid grid-cols-1 sm:grid-cols-[1.5fr_1fr_auto_auto] items-center gap-3"
            >
              <div className="space-y-1.5">
                <div className="pl-skel-bar h-4 w-44 max-w-full rounded" />
                <div className="pl-skel-bar h-3 w-32 rounded" />
              </div>
              <div className="space-y-1.5">
                <div className="pl-skel-bar h-4 w-36 max-w-full rounded" />
                <div className="pl-skel-bar h-3 w-24 rounded" />
              </div>
              <div className="pl-skel-bar h-7 w-16 rounded-full" />
              <div className="pl-skel-bar h-10 w-24 rounded-full" />
            </div>
          ))}
        </div>

        <aside className="hidden lg:block">
          <div className="pl-skel-card rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between gap-2 pb-2">
              <div className="pl-skel-bar h-5 w-24 rounded" />
              <div className="pl-skel-bar h-5 w-10 rounded-full" />
            </div>
            {[0, 1, 2, 3].map((grp) => (
              <div key={`prail-${grp}`} className="space-y-2">
                <div className="pl-skel-bar h-3.5 w-24 rounded" />
                <div className="pl-skel-bar h-9 w-full rounded-xl" />
              </div>
            ))}
            <div className="pl-skel-bar h-10 w-full rounded-full" />
          </div>
        </aside>
      </div>
    </SkeletonWrapper>
  );
}

export function SocialSkeleton(): React.JSX.Element {
  return (
    <SkeletonWrapper label="Cargando comunidad">
      <div className="pl-skel-card rounded-2xl p-4 space-y-3">
        <div className="pl-skel-bar h-5 w-36 rounded" />
        <div className="pl-skel-bar h-16 rounded-xl" />
      </div>

      {[0, 1, 2].map((idx) => (
        <div key={idx} className="pl-skel-card rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="pl-skel-bar h-10 w-10 rounded-full" />
            <div className="space-y-1.5">
              <div className="pl-skel-bar h-4 w-36 rounded" />
              <div className="pl-skel-bar h-3 w-24 rounded" />
            </div>
          </div>
          <div className="pl-skel-bar h-16 rounded-xl" />
        </div>
      ))}
    </SkeletonWrapper>
  );
}

export function PropsSkeleton(): React.JSX.Element {
  return (
    <SkeletonWrapper label="Cargando proyecciones de jugadores">
      <div className="pl-skel-card rounded-2xl p-4 flex flex-wrap gap-2">
        {[0, 1, 2, 3].map((idx) => (
          <div key={idx} className="pl-skel-bar h-9 w-28 rounded-full" />
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {[0, 1, 2, 3, 4, 5].map((idx) => (
          <div key={idx} className="pl-skel-card rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="pl-skel-bar h-11 w-11 rounded-full" />
              <div className="space-y-1.5 flex-1">
                <div className="pl-skel-bar h-4 w-32 rounded" />
                <div className="pl-skel-bar h-3 w-20 rounded" />
              </div>
            </div>
            <div className="pl-skel-bar h-12 rounded-xl" />
          </div>
        ))}
      </div>
    </SkeletonWrapper>
  );
}

export function RecordSkeleton(): React.JSX.Element {
  return (
    <SkeletonWrapper label="Cargando mi récord">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((idx) => (
          <div key={idx} className="pl-skel-card rounded-2xl p-4 space-y-2">
            <div className="pl-skel-bar h-3 w-24 rounded" />
            <div className="pl-skel-bar h-7 w-20 rounded-md" />
          </div>
        ))}
      </div>
      <div className="pl-skel-card rounded-2xl p-5 space-y-3">
        {[0, 1, 2, 3, 4].map((idx) => (
          <div key={idx} className="pl-skel-bar h-12 rounded-xl" />
        ))}
      </div>
    </SkeletonWrapper>
  );
}

export function AccountSkeleton(): React.JSX.Element {
  return (
    <SkeletonWrapper label="Cargando cuenta">
      <div className="pl-skel-card rounded-3xl p-5 sm:p-6 flex items-center gap-4">
        <div className="pl-skel-bar h-16 w-16 rounded-full" />
        <div className="space-y-2 flex-1">
          <div className="pl-skel-bar h-5 w-48 rounded-lg" />
          <div className="pl-skel-bar h-3.5 w-36 rounded" />
        </div>
      </div>
      <div className="pl-skel-card rounded-2xl p-5 space-y-3">
        {[0, 1, 2, 3].map((idx) => (
          <div key={idx} className="pl-skel-bar h-11 rounded-xl" />
        ))}
      </div>
    </SkeletonWrapper>
  );
}

export function PlayerProfileSkeleton(): React.JSX.Element {
  return (
    <SkeletonWrapper label="Cargando ficha del jugador">
      <div className="pl-skel-card rounded-3xl p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="pl-skel-bar h-16 w-16 rounded-full" />
          <div className="space-y-2">
            <div className="pl-skel-bar h-6 w-44 rounded-lg" />
            <div className="pl-skel-bar h-3.5 w-32 rounded" />
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
    </SkeletonWrapper>
  );
}

export function GenericSubpageSkeleton(): React.JSX.Element {
  return (
    <SkeletonWrapper label="Cargando vista">
      <div className="pl-skel-card rounded-2xl p-5 space-y-3">
        <div className="pl-skel-bar h-6 w-52 rounded-lg" />
        <div className="pl-skel-bar h-4 w-80 max-w-full rounded" />
      </div>
      <div className="pl-skel-card rounded-2xl p-5 space-y-3">
        {[0, 1, 2, 3].map((idx) => (
          <div key={idx} className="pl-skel-bar h-12 rounded-xl" />
        ))}
      </div>
    </SkeletonWrapper>
  );
}
