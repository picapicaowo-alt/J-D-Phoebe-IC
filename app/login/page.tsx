import Link from "next/link";
import { redirect } from "next/navigation";
import { loginAction } from "@/app/actions/auth";
import { isClerkEnabled } from "@/lib/clerk-config";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (isClerkEnabled()) redirect("/sign-in");

  const sp = await searchParams;
  const err = sp.error;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16">
      <div className="mb-8 space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">J.D. Phoebe Group</h1>
        <p className="text-sm text-[hsl(var(--muted))]">Internal management platform (prototype)</p>
      </div>

      <Card className="space-y-4 p-6">
        <CardTitle>Sign in</CardTitle>
        <form action={loginAction} className="space-y-3">
          {err === "invalid" ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
              Invalid email or password. If this is a new database, run <code className="font-mono">npm run db:seed</code>{" "}
              against the same <code className="font-mono">DATABASE_URL</code> as production, then use password{" "}
              <code className="font-mono">demo1234</code>.
            </p>
          ) : null}
          {err === "sso" ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
              This account uses SSO. Sign in with the configured provider instead.
            </p>
          ) : null}
          <div className="space-y-1">
            <label className="text-xs font-medium text-[hsl(var(--muted))]" htmlFor="email">
              Email
            </label>
            <Input id="email" name="email" type="email" autoComplete="username" required placeholder="admin@jdphoebe.local" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-[hsl(var(--muted))]" htmlFor="password">
              Password
            </label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          <FormSubmitButton type="submit" className="w-full" pendingLabel="Signing in…">
            Continue
          </FormSubmitButton>
        </form>
        <p className="text-xs text-[hsl(var(--muted))]">
          Demo accounts use password <span className="font-mono text-[hsl(var(--foreground))]">demo1234</span> after seed.
        </p>
      </Card>

      <p className="mt-6 text-center text-xs text-[hsl(var(--muted))]">
        <Link className="underline" href="/">
          About this build
        </Link>
      </p>
    </main>
  );
}
