import { cn } from "@/lib/utils";
import type { SelectHTMLAttributes } from "react";

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-base outline-none ring-[hsl(var(--accent))] focus:ring-2",
        className,
      )}
      {...props}
    />
  );
}
