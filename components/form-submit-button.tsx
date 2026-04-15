"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  pendingLabel?: string;
};

export function FormSubmitButton({ children, className, variant = "primary", pendingLabel, disabled, ...rest }: Props) {
  const { pending } = useFormStatus();
  const busy = pending || disabled;
  return (
    <Button type="submit" variant={variant} disabled={busy} className={cn(className)} {...rest}>
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
