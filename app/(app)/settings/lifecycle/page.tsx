import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { isSuperAdmin, type AccessUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/messages";
import { createLifecycleTriggerRuleAction, deleteLifecycleTriggerRuleAction } from "@/app/actions/lifecycle";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { LifecycleCategoryMode, LifecycleTriggerKind, LifecycleTriggerScope } from "@prisma/client";

export default async function LifecycleSettingsPage() {
  const user = (await requireUser()) as AccessUser;
  const isGa = user.groupMemberships.some((m) => m.roleDefinition.key === "GROUP_ADMIN");
  if (!isSuperAdmin(user) && !isGa) redirect("/home");

  const [rules, fires, companies] = await Promise.all([
    prisma.lifecycleTriggerRule.findMany({ orderBy: { createdAt: "desc" }, include: { company: true } }),
    prisma.lifecycleTriggerFire.findMany({
      orderBy: { triggeredAt: "desc" },
      take: 25,
      include: { rule: true, subject: true },
    }),
    prisma.company.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
  ]);

  const locale = await getLocale();

  return (
    <div className="mx-auto max-w-[1280px] space-y-8">
      <div className="text-xs text-[hsl(var(--muted))]">
        <Link href="/home" className="hover:underline">
          {t(locale, "navHome")}
        </Link>{" "}
        / {t(locale, "lifecyclePageTitle")}
      </div>
      <div>
        <h1 className="font-display text-2xl font-bold tracking-[-0.03em] text-[hsl(var(--foreground))] md:text-3xl">{t(locale, "lifecyclePageTitle")}</h1>
        <p className="mt-2 max-w-3xl text-sm text-[hsl(var(--muted))]">{t(locale, "lifecyclePageLead")}</p>
      </div>

      <Card className="space-y-4 rounded-[12px] border border-[hsl(var(--border))] p-5">
        <CardTitle className="font-display text-base font-bold">{t(locale, "lifecycleAddRule")}</CardTitle>
        <form action={createLifecycleTriggerRuleAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1">
            <label className="text-sm font-medium text-[hsl(var(--muted))]">Kind</label>
            <Select name="kind" className="rounded-[6px]" defaultValue={LifecycleTriggerKind.FEEDBACK}>
              <option value={LifecycleTriggerKind.FEEDBACK}>{t(locale, "lifecycleKindFeedback")}</option>
              <option value={LifecycleTriggerKind.RECOGNITION}>{t(locale, "lifecycleKindRecognition")}</option>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-[hsl(var(--muted))]">Scope</label>
            <Select name="scope" className="rounded-[6px]" defaultValue={LifecycleTriggerScope.GLOBAL}>
              <option value={LifecycleTriggerScope.GLOBAL}>{t(locale, "lifecycleScopeGlobal")}</option>
              <option value={LifecycleTriggerScope.COMPANY}>{t(locale, "lifecycleScopeCompany")}</option>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-[hsl(var(--muted))]">{t(locale, "scopeCompany")}</label>
            <Select name="companyId" className="rounded-[6px]" defaultValue="">
              <option value="">—</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-[hsl(var(--muted))]">{t(locale, "lifecycleWindowDays")}</label>
            <Input name="windowDays" type="number" min={1} max={366} defaultValue={30} className="rounded-[6px]" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-[hsl(var(--muted))]">{t(locale, "lifecycleThreshold")}</label>
            <Input name="threshold" type="number" min={1} max={100} defaultValue={3} className="rounded-[6px]" />
          </div>
          <div className="space-y-1 sm:col-span-2 lg:col-span-1">
            <label className="text-sm font-medium text-[hsl(var(--muted))]">{t(locale, "lifecycleCategoryMode")}</label>
            <Select name="categoryMode" className="rounded-[6px]" defaultValue={LifecycleCategoryMode.TOTAL_COUNT}>
              <option value={LifecycleCategoryMode.TOTAL_COUNT}>{t(locale, "lifecycleCategoryModeTotal")}</option>
              <option value={LifecycleCategoryMode.PER_CATEGORY}>{t(locale, "lifecycleCategoryModePerCategory")}</option>
              <option value={LifecycleCategoryMode.ANY_CATEGORY}>{t(locale, "lifecycleCategoryModeAny")}</option>
            </Select>
          </div>
          <div className="flex items-end">
            <Button type="submit" className="rounded-[6px]">
              {t(locale, "lifecycleSaveRule")}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="rounded-[12px] border border-[hsl(var(--border))] p-5">
        <CardTitle className="font-display mb-3 text-base font-bold">{t(locale, "lifecycleRulesTitle")}</CardTitle>
        <ul className="space-y-2 text-sm">
          {rules.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[hsl(var(--border))] px-3 py-2">
              <span>
                {r.kind === "FEEDBACK" ? t(locale, "lifecycleKindFeedback") : t(locale, "lifecycleKindRecognition")} · {r.windowDays}d ·{" "}
                {r.threshold}x · {r.scope} · {r.categoryMode}
                {r.company ? ` · ${r.company.name}` : ""}
              </span>
              <form action={deleteLifecycleTriggerRuleAction}>
                <input type="hidden" name="ruleId" value={r.id} />
                <Button type="submit" variant="secondary" className="h-8 rounded-[6px] text-xs">
                  {t(locale, "lifecycleDeleteRule")}
                </Button>
              </form>
            </li>
          ))}
          {!rules.length ? <li className="text-[hsl(var(--muted))]">—</li> : null}
        </ul>
      </Card>

      <Card className="rounded-[12px] border border-[hsl(var(--border))] p-5">
        <CardTitle className="font-display mb-3 text-base font-bold">{t(locale, "lifecycleRecentFires")}</CardTitle>
        <ul className="space-y-2 text-sm text-[hsl(var(--muted))]">
          {fires.map((f) => (
            <li key={f.id} className="rounded-[8px] border border-[hsl(var(--border))] px-3 py-2">
              {f.triggeredAt.toISOString().slice(0, 19)} · {f.subject.name} · rule {f.rule.kind}{" "}
              <Link className="text-[hsl(var(--primary))] hover:underline" href={`/staff/${f.subjectUserId}`}>
                profile
              </Link>
            </li>
          ))}
          {!fires.length ? <li>—</li> : null}
        </ul>
      </Card>
    </div>
  );
}
