import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        "w-full rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-base text-zinc-900 outline-none ring-zinc-400/30 focus:ring-2 dark:border-[hsl(var(--border))] dark:text-zinc-100",
        className,
      )}
      {...props}
    />
  );
});
