"use client";

import React, { createContext, useCallback, useContext, useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DashboardLoading } from "@pitchlab/ui/loading";

const DashboardEntryContext = createContext<((href: string) => void) | null>(null);

export function DashboardEntryProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [visible, setVisible] = useState(false);

  const enter = useCallback(
    (href: string) => {
      setVisible(true);
      startTransition(() => router.push(href));
    },
    [router],
  );

  useEffect(() => {
    if (!visible) return;
    if (!isPending) {
      setVisible(false);
    }
  }, [isPending, pathname, visible]);

  return (
    <DashboardEntryContext.Provider value={enter}>
      {children}
      {visible && isPending && (
        <div className="dashboard-entry-overlay">
          <DashboardLoading confirmed />
        </div>
      )}
    </DashboardEntryContext.Provider>
  );
}

export function useDashboardEntry(): (href: string) => void {
  const enter = useContext(DashboardEntryContext);
  if (!enter) throw new Error("DashboardEntryProvider is required");
  return enter;
}
