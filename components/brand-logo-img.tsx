export function BrandLogoImg({ className }: { className?: string }) {
  return (
    <img
      src="/brand/jd-phoebe-mark.png"
      alt=""
      width={128}
      height={128}
      className={className}
      loading="eager"
      fetchPriority="high"
      decoding="async"
    />
  );
}
