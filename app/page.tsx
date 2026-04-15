import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { isClerkEnabled } from "@/lib/clerk-config";

export default function HomePage() {
  const signHref = isClerkEnabled() ? "/sign-in" : "/login";

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-16">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">J.D. Phoebe Group · Internal platform (prototype)</h1>
        <p className="text-sm text-[hsl(var(--muted))]">
          Revised build: parent <strong>group</strong>, sub-<strong>companies</strong>, <strong>projects</strong> with
          search and filters, <strong>staff</strong> with password login, role definitions, and company/project
          assignments.
        </p>
      </div>

      <Card className="space-y-3">
        <CardTitle>Run locally</CardTitle>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-[hsl(var(--muted))]">
          <li>
            <code className="rounded bg-black/5 px-1 dark:bg-white/10">cp .env.example .env</code> and set a long{" "}
            <code className="rounded bg-black/5 px-1">SESSION_SECRET</code> for production.
          </li>
          <li>
            <code className="rounded bg-black/5 px-1">npm install</code> then{" "}
            <code className="rounded bg-black/5 px-1">npx prisma db push</code> then{" "}
            <code className="rounded bg-black/5 px-1">npm run db:seed</code>
          </li>
          <li>
            <code className="rounded bg-black/5 px-1">npm run dev</code> → open{" "}
            <code className="rounded bg-black/5 px-1">{signHref}</code>
            {isClerkEnabled() ? " (Clerk)" : " (demo password after seed: demo1234)"}.
          </li>
        </ol>
        <div className="flex flex-wrap gap-2">
          <Link href={signHref}>
            <Button type="button">Sign in</Button>
          </Link>
          <Link href="/group">
            <Button type="button" variant="secondary">
              Group (after login)
            </Button>
          </Link>
        </div>
      </Card>
    </main>
  );
}
