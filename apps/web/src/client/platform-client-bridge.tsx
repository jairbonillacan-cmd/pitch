"use client";

import React, { useCallback, useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PlatformProvider, type ViewerIdentity } from "@pitchlab/ui/platform-provider";
import type {
  PaymentMode,
  PlatformDataset,
  ViewerRole,
  ViewerVia,
} from "@pitchlab/ui/types";

export function PlatformClientBridge({
  dataset,
  initialRole,
  allowRoleSimulation = false,
  accountsEnabled = false,
  viewerVia,
  paymentMode = "transfer",
  serverMonth1NoCardMode,
  viewerIdentity = null,
  children,
}: {
  dataset: PlatformDataset;
  initialRole: ViewerRole;
  allowRoleSimulation?: boolean;
  accountsEnabled?: boolean;
  viewerVia?: ViewerVia;
  paymentMode?: PaymentMode;
  serverMonth1NoCardMode?: boolean;
  viewerIdentity?: ViewerIdentity | null;
  children: React.ReactNode;
}): React.JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [navPending, setNavPending] = useState(false);

  useEffect(() => {
    setNavPending(false);
  }, [pathname]);

  useEffect(() => {
    if (!navPending) return;
    const timeout = window.setTimeout(() => setNavPending(false), 4000);
    return () => window.clearTimeout(timeout);
  }, [navPending]);

  const handleNavigate = useCallback(
    (href: string) => {
      if (typeof window !== "undefined" && !href.includes("#")) {
        const nextPath = href.split("?")[0] || "/";
        if (nextPath !== window.location.pathname) {
          setNavPending(true);
          window.scrollTo({ top: 0, left: 0, behavior: "instant" });
          document.documentElement.scrollTop = 0;
          document.body.scrollTop = 0;
        }
      }
      startTransition(() => {
        router.push(href, { scroll: !href.includes("#") });
      });
    },
    [router],
  );

  return (
    <PlatformProvider
      dataset={dataset}
      initialRole={initialRole}
      allowRoleSimulation={allowRoleSimulation}
      accountsEnabled={accountsEnabled}
      viewerVia={viewerVia}
      paymentMode={paymentMode}
      serverMonth1NoCardMode={serverMonth1NoCardMode}
      viewerIdentity={viewerIdentity}
      onNavigate={handleNavigate}
    >
      {navPending || isPending ? (
        <div
          className="pl-route-progress"
          role="progressbar"
          aria-label="Cargando pantalla"
          aria-busy="true"
        />
      ) : null}
      {children}
    </PlatformProvider>
  );
}
