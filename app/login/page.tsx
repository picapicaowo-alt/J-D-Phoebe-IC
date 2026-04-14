import Link from "next/link";
import { redirect } from "next/navigation";
import { loginAction } from "@/app/actions/auth";
import { isClerkEnabled } from "@/lib/clerk-config";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default async function LoginPage() {
  if (isClerkEnabled()) redirect("/sign-in");

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16">
      <div className="mb-8 space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">J.D. Phoebe Group</h1>
        <p className="text-sm text-[hsl(var(--muted))]">Internal management platform (prototype)</p>
      </div>

      <Card className="space-y-4 p-6">
        <CardTitle>Sign in</CardTitle>
        <form action={loginAction} className="space-y-3">
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
          <Button type="submit" className="w-full">
            Continue
          </Button>
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
