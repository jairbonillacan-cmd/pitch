"use client";

import React, { useCallback, useState } from "react";

export interface ProgressiveImageProps
  extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "onLoad" | "onError"> {
  readonly onLoad?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  readonly onError?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
}

export function ProgressiveImage({
  className,
  src,
  loading,
  onLoad,
  onError,
  ...rest
}: ProgressiveImageProps): React.JSX.Element {
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const srcKey = typeof src === "string" ? src : "";
  const isEager = loading === "eager";
  const isLoaded = isEager || (loadedSrc === srcKey && srcKey.length > 0);

  const handleImgRef = useCallback(
    (el: HTMLImageElement | null) => {
      if (el && el.complete && el.naturalWidth > 0 && srcKey) {
        setLoadedSrc((prev) => (prev === srcKey ? prev : srcKey));
      }
    },
    [srcKey],
  );

  return (
    <img
      ref={handleImgRef}
      src={src}
      loading={loading}
      {...rest}
      data-loaded={isLoaded ? "true" : "false"}
      className={`pl-prog-img${className ? ` ${className}` : ""}`}
      onLoad={(e) => {
        if (srcKey) setLoadedSrc(srcKey);
        onLoad?.(e);
      }}
      onError={(e) => {
        if (srcKey) setLoadedSrc(srcKey);
        onError?.(e);
      }}
    />
  );
}
