"use client";

import React, { createContext, useCallback, useContext, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DashboardLoading } from "@pitchlab/ui";

const DashboardEntryContext = createContext<((href: string) => void) | null>(null);
const ENTRY_REVEAL_MS = 680;

export function DashboardEntryProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [visible, setVisible] = useState(false);
  const [introDone, setIntroDone] = useState(false);

  const enter = useCallback((href: string) => {
    setVisible(true);
    setIntroDone(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    startTransition(() => router.push(href));
  }, [router]);

  useEffect(() => {
    if (!visible || introDone) return;
    // Give the PIN confirmation time to play even when the route is cached.
    const timer = window.setTimeout(() => setIntroDone(true), ENTRY_REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [visible, introDone]);

  useEffect(() => {
    if (visible && introDone && !isPending) setVisible(false);
  }, [visible, introDone, isPending]);

  return (
    <DashboardEntryContext.Provider value={enter}>
      <div inert={visible}>{children}</div>
      {visible && (
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
