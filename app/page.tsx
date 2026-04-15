import Link from "next/link";
import { HomeRegisterForm } from "@/components/home-register-form";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { isClerkEnabled } from "@/lib/clerk-config";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/messages";

export default async function HomePage() {
  const locale = await getLocale();
  const signHref = isClerkEnabled() ? "/sign-in" : "/login";
  const clerk = isClerkEnabled();

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

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="space-y-3 p-6">
          <CardTitle>{t(locale, "signIn")}</CardTitle>
          <p className="text-sm text-[hsl(var(--muted))]">
            {clerk
              ? t(locale, "homeRegisterClerkHint")
              : locale === "zh"
                ? "已有账号？前往登录页，或使用演示账号（执行 seed 后密码为 demo1234）。"
                : "Already have an account? Open the sign-in page, or use a seeded demo account (password demo1234 after seed)."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href={signHref}>
              <Button type="button">{t(locale, "signIn")}</Button>
            </Link>
            <Link href="/group">
              <Button type="button" variant="secondary">
                {locale === "zh" ? "组织（需登录）" : "Group (after login)"}
              </Button>
            </Link>
          </div>
        </Card>

        <Card className="space-y-3 p-6">
          <CardTitle>{t(locale, "homeRegisterTitle")}</CardTitle>
          <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "homeRegisterLead")}</p>
          {clerk ? <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "homeRegisterClerkHint")}</p> : <HomeRegisterForm locale={locale} />}
        </Card>
      </div>

      <Card className="space-y-3">
        <CardTitle>Run locally</CardTitle>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-[hsl(var(--muted))]">
          <li>
            <code className="rounded bg-black/5 px-1 dark:bg-white/10">cp .env.example .env</code> and set{" "}
            <code className="rounded bg-black/5 px-1">SESSION_SECRET</code> (32+ chars). For Supabase, set both{" "}
            <code className="rounded bg-black/5 px-1">DATABASE_URL</code> and{" "}
            <code className="rounded bg-black/5 px-1">DIRECT_URL</code> (local Docker can use the same value for both).
          </li>
          <li>
            <code className="rounded bg-black/5 px-1">npm install</code> then{" "}
            <code className="rounded bg-black/5 px-1">npm run db:push</code> then{" "}
            <code className="rounded bg-black/5 px-1">npm run db:seed</code> (optional demo data).
          </li>
          <li>
            <code className="rounded bg-black/5 px-1">npm run dev</code> → register on this page or open{" "}
            <code className="rounded bg-black/5 px-1">{signHref}</code>
            {clerk ? " (Clerk)" : ""}.
          </li>
        </ol>
      </Card>
    </main>
  );
}
