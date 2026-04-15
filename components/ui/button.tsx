import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) {
  const styles =
    variant === "primary"
      ? "rounded-[6px] bg-[hsl(var(--primary))] text-white shadow-[0_4px_12px_rgba(99,102,241,0.25)] hover:-translate-y-px hover:bg-[hsl(var(--primary-hover))]"
      : variant === "secondary"
        ? "rounded-[6px] bg-[hsl(var(--card))] border border-[hsl(var(--border))] hover:bg-black/5 dark:hover:bg-white/5"
        : "rounded-[6px] hover:bg-black/5 dark:hover:bg-white/5";

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center px-3 py-2 text-sm font-medium transition disabled:opacity-50",
        styles,
        className,
      )}
      {...props}
    />
  );
}
