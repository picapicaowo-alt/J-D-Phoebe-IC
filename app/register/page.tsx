import Link from "next/link";
import { redirect } from "next/navigation";
import { HomeRegisterForm } from "@/components/home-register-form";
import { Card, CardTitle } from "@/components/ui/card";
import { isClerkEnabled } from "@/lib/clerk-config";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/messages";

export default async function RegisterPage() {
  if (isClerkEnabled()) redirect("/sign-up");

  const locale = await getLocale();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16">
      <div className="mb-8 space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">J.D. Phoebe Group</h1>
        <p className="text-sm text-[hsl(var(--muted))]">Internal management platform (prototype)</p>
      </div>

      <Card className="space-y-4 p-6">
        <CardTitle>{t(locale, "homeRegisterTitle")}</CardTitle>
        <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "homeRegisterLead")}</p>
        <HomeRegisterForm locale={locale} />
      </Card>

      <p className="mt-6 text-center text-sm text-[hsl(var(--muted))]">
        <Link className="underline" href="/login">
          {t(locale, "homeRegisterBackToLogin")}
        </Link>
      </p>
    </main>
  );
}
