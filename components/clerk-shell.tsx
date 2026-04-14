"use client";

import { ClerkProvider } from "@clerk/nextjs";

export function ClerkShell({ children }: { children: React.ReactNode }) {
  return <ClerkProvider>{children}</ClerkProvider>;
}
