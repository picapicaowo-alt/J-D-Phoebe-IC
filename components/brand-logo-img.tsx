"use client";

import { useState } from "react";

const CANDIDATES = ["/brand/jd-phoebe-mark.png", "/brand/jd-phoebe-mark.jpg", "/brand/jd-phoebe-mark.svg"];

/** Tries raster uploads first, then the default stroke SVG. Drop your file in `public/brand/` with one of these names. */
export function BrandLogoImg({ className }: { className?: string }) {
  const [i, setI] = useState(0);
  const src = CANDIDATES[i] ?? CANDIDATES[CANDIDATES.length - 1];
  return (
    <img
      src={src}
      alt=""
      width={128}
      height={128}
      className={className}
      onError={() => {
        if (i < CANDIDATES.length - 1) setI((x) => x + 1);
      }}
    />
  );
}
