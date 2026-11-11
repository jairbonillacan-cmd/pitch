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
  children,
}: {
  dataset: PlatformDataset;
  initialRole: ViewerRole;
  allowRoleSimulation?: boolean;
  accountsEnabled?: boolean;
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
      onNavigate={handleNavigate}
    >
      {children}
    </PlatformProvider>
  );
}
