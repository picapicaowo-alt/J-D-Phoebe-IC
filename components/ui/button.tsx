import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) {
  const styles =
    variant === "primary"
      ? "bg-[hsl(var(--accent))] text-white hover:opacity-90"
      : variant === "secondary"
        ? "bg-[hsl(var(--card))] border border-[hsl(var(--border))] hover:bg-black/5 dark:hover:bg-white/5"
        : "hover:bg-black/5 dark:hover:bg-white/5";

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition disabled:opacity-50",
        styles,
        className,
      )}
      {...props}
    />
  );
}
