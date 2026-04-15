import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import { ClerkShell } from "@/components/clerk-shell";
import { isClerkEnabled } from "@/lib/clerk-config";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Multi-Company Progress Tracker",
  description: "Prototype workspace for projects, tasks, blockers, and deadlines.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const body = (
    <body className={`${dmSans.variable} ${jetbrainsMono.variable} min-h-dvh font-sans antialiased`}>
      {isClerkEnabled() ? <ClerkShell>{children}</ClerkShell> : children}
    </body>
  );

  return (
    <html lang="en">
      <head>
        <link
          href="https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600,700&display=swap"
          rel="stylesheet"
        />
      </head>
      {body}
    </html>
  );
}
