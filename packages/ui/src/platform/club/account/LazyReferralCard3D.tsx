"use client";

import React, { Suspense, useState } from "react";
import { useSafeEffect } from "../../hooks";
import type { ReferralCard3DProps } from "../../public/ReferralCard3D";

const ReferralCard3DLazy = React.lazy(() =>
  import("../../public/ReferralCard3D").then((mod) => ({
    default: mod.ReferralCard3D,
  })),
);

function ReferralCardPlaceholder({
  bottomLeftLabel,
  code,
  tierLabel = "ULTRA",
}: {
  bottomLeftLabel?: string;
  code: string;
  tierLabel?: string;
}): React.JSX.Element {
  return (
    <div className="pl-acct-card-placeholder" aria-hidden="true">
      <div className="pl-acct-card-placeholder-row">
        <span className="pl-acct-card-placeholder-brand">PitchLab</span>
        <span className="pl-acct-card-placeholder-tier">{tierLabel}</span>
      </div>
      <div className="pl-acct-card-placeholder-row pl-acct-card-placeholder-row--bottom num">
        <span>{bottomLeftLabel ?? "@socio"}</span>
        <span className="pl-acct-mono">{code}</span>
      </div>
    </div>
  );
}

export function LazyReferralCard3D(props: ReferralCard3DProps): React.JSX.Element {
  const [mounted, setMounted] = useState(false);
  useSafeEffect(() => {
    setMounted(true);
  }, []);

  const placeholder = (
    <ReferralCardPlaceholder
      bottomLeftLabel={props.bottomLeftLabel}
      code={props.code}
      tierLabel={props.tierLabel}
    />
  );

  if (!mounted) {
    return placeholder;
  }

  return <Suspense fallback={placeholder}><ReferralCard3DLazy {...props} /></Suspense>;
}
