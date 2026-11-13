"use client";

import React, { useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  PlatformProvider,
  type PaymentMode,
  type PlatformDataset,
  type ViewerIdentity,
  type ViewerRole,
  type ViewerVia,
} from "@pitchlab/ui";

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

  const handleNavigate = useCallback(
    (href: string) => {
      router.push(href);
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
      {children}
    </PlatformProvider>
  );
}
