"use client";

import { SignOutButton } from "@clerk/nextjs";
import { logoutAction } from "@/app/actions/auth";
import { FormSubmitButton } from "@/components/form-submit-button";
import { cn } from "@/lib/utils";

const ghostBtn =
  "inline-flex h-8 items-center justify-center rounded-md px-2 text-xs font-medium transition hover:bg-black/5 dark:hover:bg-white/5";

export function SignOutControl({ clerkEnabled }: { clerkEnabled: boolean }) {
  if (clerkEnabled) {
    return (
      <SignOutButton redirectUrl="/login">
        <button type="button" className={cn(ghostBtn)}>
          Sign out
        </button>
      </SignOutButton>
    );
  }
  return (
    <form action={logoutAction}>
      <FormSubmitButton type="submit" variant="ghost" className="h-8 px-2 text-xs">
        Sign out
      </FormSubmitButton>
    </form>
  );
}
