import Link from "next/link";

export default function PendingAccessPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16 text-center">
      <h1 className="text-xl font-semibold tracking-tight">Account not linked</h1>
      <p className="mt-3 text-sm text-[hsl(var(--muted))]">
        You are signed in with Clerk, but no matching user record was found (by Clerk ID or primary email). Ask a group
        admin to create your account or link your email, then try again.
      </p>
      <p className="mt-6 text-sm">
        <Link className="text-[hsl(var(--accent))] underline" href="/">
          Home
        </Link>
      </p>
    </main>
  );
}
