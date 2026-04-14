import { cn } from "@/lib/utils";
import type { InputHTMLAttributes } from "react";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-sm text-zinc-900 outline-none ring-zinc-400/30 focus:ring-2 dark:border-[hsl(var(--border))] dark:text-zinc-100",
        className,
      )}
      {...props}
    />
  );
}
