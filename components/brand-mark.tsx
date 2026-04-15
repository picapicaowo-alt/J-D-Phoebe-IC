import Link from "next/link";
import { BrandLogoImg } from "@/components/brand-logo-img";

export function BrandMark() {
  return (
    <Link
      href="/home"
      className="group flex flex-col items-start gap-2.5 py-0.5 text-zinc-900 outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] dark:text-zinc-50"
    >
      <span
        className="inline-flex h-24 w-24 shrink-0 items-center justify-center sm:h-28 sm:w-28 md:h-32 md:w-32"
        aria-hidden
      >
        <BrandLogoImg className="h-full w-full object-contain" />
      </span>
      <span className="font-display text-xl font-semibold tracking-[-0.02em] sm:text-2xl">J D Phoebe Group</span>
    </Link>
  );
}
