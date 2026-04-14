import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkShell } from "@/components/clerk-shell";
import { isClerkEnabled } from "@/lib/clerk-config";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Multi-Company Progress Tracker",
  description: "Prototype workspace for projects, tasks, blockers, and deadlines.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const body = (
    <body className={`${geistSans.variable} ${geistMono.variable} min-h-dvh antialiased`}>
      {isClerkEnabled() ? <ClerkShell>{children}</ClerkShell> : children}
    </body>
  );

  return (
    <html lang="en">
      {body}
    </html>
  );
}
