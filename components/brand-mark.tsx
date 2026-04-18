import Link from "next/link";
import { BrandLogoImg } from "@/components/brand-logo-img";

export function BrandMark() {
  return (
    <Link
      href="/home"
      className="group flex flex-col items-center gap-3 py-1 text-center text-zinc-900 outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] dark:text-zinc-50"
    >
      <span
        className="inline-flex h-28 w-28 shrink-0 items-center justify-center sm:h-32 sm:w-32 md:h-36 md:w-36"
        aria-hidden
      >
        <BrandLogoImg className="h-full w-full object-contain" />
      </span>
      <span className="font-display text-xl font-semibold tracking-[-0.02em] sm:text-2xl">Internal Management</span>
    </Link>
  );
}
