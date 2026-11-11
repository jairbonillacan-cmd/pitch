"use client";

import React, { useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  PlatformProvider,
  type PlatformDataset,
  type ViewerRole,
} from "@pitchlab/ui";

export function PlatformClientBridge({
  dataset,
  initialRole,
  allowRoleSimulation = false,
  accountsEnabled = false,
  serverMonth1NoCardMode,
  children,
}: {
  dataset: PlatformDataset;
  initialRole: ViewerRole;
  allowRoleSimulation?: boolean;
  accountsEnabled?: boolean;
  serverMonth1NoCardMode?: boolean;
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
      serverMonth1NoCardMode={serverMonth1NoCardMode}
      onNavigate={handleNavigate}
    >
      {children}
    </PlatformProvider>
  );
}
