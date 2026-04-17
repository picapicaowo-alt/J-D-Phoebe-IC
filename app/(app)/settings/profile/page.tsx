import Link from "next/link";
import { redirect } from "next/navigation";
import { removeUserAvatarAction, uploadUserAvatarAction } from "@/app/actions/profile-media";
import { updateStaffAction } from "@/app/actions/staff";
import { requireUser } from "@/lib/auth";
import type { AccessUser } from "@/lib/access";
import { isClerkEnabled } from "@/lib/clerk-config";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/messages";
import { getZodiacSignLabel, MBTI_OPTIONS } from "@/lib/profile-labels";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/access";
import { getCompanionManifest, getCompanionManifestForUser } from "@/lib/companion-manifest";
import { updateCompanionAction } from "@/app/actions/companion";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatTimeZoneInputValue, getTimeZoneInputOptions } from "@/lib/timezone";

export default async function ProfileSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ uploadError?: string | string[] }>;
}) {
  const actor = (await requireUser()) as AccessUser;
  const locale = await getLocale();
  const sp = (await searchParams) ?? {};
  const uploadError = Array.isArray(sp.uploadError) ? sp.uploadError[0] : sp.uploadError;

  const user = await prisma.user.findFirst({
    where: { id: actor.id, deletedAt: null },
    include: { companionProfile: true },
  });
  if (!user) redirect("/login");
  const timeZoneOptions = getTimeZoneInputOptions();
  const zodiacLabel = getZodiacSignLabel(user.birthday, locale);

  const companion = user.companionProfile;
  const asset = companion ? getCompanionManifest().find((e) => e.species === companion.species) : null;
  const companionSpeciesOptions =
    isSuperAdmin(actor) && user.companionIntroCompletedAt
      ? getCompanionManifest()
      : getCompanionManifestForUser(actor);

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[hsl(var(--foreground))]">{t(locale, "profileSettingsTitle")}</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted))]">{t(locale, "profileSettingsLead")}</p>
      </div>

      <Card className="space-y-4 p-5">
        <CardTitle className="text-base">{t(locale, "staffProfile")}</CardTitle>
        <div className="space-y-2 border-b border-[hsl(var(--border))] pb-4">
          <p className="text-sm font-medium">{t(locale, "profileAvatarLabel")}</p>
          <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "profileAvatarHelp")}</p>
          {uploadError ? (
            <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-900 dark:text-rose-100">
              {uploadError}
            </p>
          ) : null}
          <form action={uploadUserAvatarAction} encType="multipart/form-data" className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="userId" value={user.id} />
            <input type="hidden" name="returnTo" value="/settings/profile" />
            <input type="file" name="file" accept="image/jpeg,image/png,image/webp,image/gif" className="max-w-xs text-sm" />
            <FormSubmitButton type="submit" variant="secondary" className="h-10 text-sm">
              {t(locale, "btnSave")}
            </FormSubmitButton>
          </form>
          {user.avatarUrl ? (
            <form action={removeUserAvatarAction}>
              <input type="hidden" name="userId" value={user.id} />
              <FormSubmitButton type="submit" variant="secondary" className="h-9 text-sm">
                {t(locale, "profileAvatarRemove")}
              </FormSubmitButton>
            </form>
          ) : null}
        </div>

        <form action={updateStaffAction} className="space-y-4">
          <input type="hidden" name="userId" value={user.id} />
          <div className="space-y-1">
            <label className="text-sm font-medium">{t(locale, "profileLoginEmail")}</label>
            <p className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/10 px-3 py-2 text-sm text-[hsl(var(--foreground))]">{user.email}</p>
            <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "profileLoginEmailHint")}</p>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">{t(locale, "staffName")}</label>
            <Input name="name" defaultValue={user.name} required className="text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">{t(locale, "staffTitle")}</label>
            <Input name="title" defaultValue={user.title ?? ""} className="text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="profile-signature">
              {t(locale, "profileSignatureLabel")}
            </label>
            <textarea
              id="profile-signature"
              name="signature"
              rows={3}
              defaultValue={user.signature ?? ""}
              maxLength={280}
              placeholder={t(locale, "profileSignaturePlaceholder")}
              className="w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm"
            />
            <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "profileSignatureHelp")}</p>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">{t(locale, "profileContactEmailsLabel")}</label>
            <Input name="contactEmails" defaultValue={user.contactEmails ?? ""} className="text-sm" placeholder="name@firm.com; alias@…" />
            <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "profileContactEmailsHelp")}</p>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">{t(locale, "profilePhoneLabel")}</label>
            <Input name="phone" defaultValue={user.phone ?? ""} className="text-sm" placeholder="+1 …" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="profile-birthday">
                {t(locale, "profileBirthdayLabel")}
              </label>
              <Input id="profile-birthday" name="birthday" type="date" defaultValue={user.birthday ?? ""} className="text-sm" />
              <p className="text-xs text-[hsl(var(--muted))]">
                {zodiacLabel
                  ? t(locale, "profileBirthdayHelpWithZodiac").replace("{zodiac}", zodiacLabel)
                  : t(locale, "profileBirthdayHelp")}
              </p>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="profile-mbti">
                {t(locale, "profileMbtiLabel")}
              </label>
              <Select id="profile-mbti" name="mbti" defaultValue={user.mbti ?? ""} className="text-sm">
                <option value="">{t(locale, "commonOptional")}</option>
                {MBTI_OPTIONS.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "profileMbtiHelp")}</p>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="birthdayHidden" defaultChecked={user.birthdayHidden} />
            {t(locale, "profileBirthdayHiddenLabel")}
          </label>
          <p className="-mt-2 text-xs text-[hsl(var(--muted))]">{t(locale, "profileBirthdayHiddenHelp")}</p>
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="profile-timezone">
              {t(locale, "profileTimezoneLabel")}
            </label>
            <Input
              id="profile-timezone"
              name="timezone"
              list="profile-timezone-options"
              defaultValue={formatTimeZoneInputValue(user.timezone)}
              className="text-sm"
              placeholder="Beijing (Asia/Shanghai, UTC+08:00)"
              required
            />
            <datalist id="profile-timezone-options">
              {timeZoneOptions.map((timeZone) => (
                <option key={timeZone} value={timeZone} />
              ))}
            </datalist>
            <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "profileTimezoneHelp").replace("{tz}", user.timezone)}</p>
          </div>
          {actor.isSuperAdmin ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={user.active} />
              {t(locale, "staffActive")}
            </label>
          ) : null}
          <FormSubmitButton type="submit" className="min-w-[8rem]">
            {t(locale, "staffSave")}
          </FormSubmitButton>
        </form>
      </Card>

      <Card className="space-y-3 p-5">
        <CardTitle className="text-base">{t(locale, "profileSecurityTitle")}</CardTitle>
        <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "profileSecurityLead")}</p>
        {isClerkEnabled() ? (
          <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "profilePasswordManagedBySso")}</p>
        ) : (
          <Link href="/settings/change-password" className="inline-block text-sm font-medium text-[hsl(var(--primary))] underline-offset-4 hover:underline">
            {t(locale, "settingsChangePasswordManage")}
          </Link>
        )}
      </Card>

      <Card className="space-y-3 p-5">
        <CardTitle className="text-base">{t(locale, "profileCompanionCardTitle")}</CardTitle>
        <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "profileCompanionCardLead")}</p>
        {!user.companionIntroCompletedAt ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">{t(locale, "companionPermanentWarning")}</p>
        ) : !isSuperAdmin(actor) ? (
          <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "companionPermanentWarning")}</p>
        ) : null}
        {companion && asset ? (
          <div className="flex items-start gap-4 rounded-xl border border-[hsl(var(--border))] p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={asset.file} alt="" width={64} height={64} className="h-16 w-16 shrink-0 rounded-2xl object-contain" />
            <div className="min-w-0 space-y-1 text-sm">
              <p className="font-medium text-[hsl(var(--foreground))]">
                {companion.name ?? (locale === "zh" ? "小伙伴" : "Companion")} · {t(locale, "homeMood")} {companion.mood} · {t(locale, "homeLevel")}{" "}
                {companion.level}
              </p>
              {!user.companionIntroCompletedAt ? (
                <Link href="/onboarding/companion" className="inline-block text-sm font-medium text-[hsl(var(--primary))] underline-offset-4 hover:underline">
                  {t(locale, "profileCompanionManage")}
                </Link>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="text-sm text-[hsl(var(--muted))]">
            <Link href="/onboarding/companion" className="font-medium text-[hsl(var(--primary))] underline-offset-4 hover:underline">
              {t(locale, "profileCompanionManage")}
            </Link>
          </p>
        )}
        {isSuperAdmin(actor) && user.companionIntroCompletedAt && companion ? (
          <form action={updateCompanionAction} className="flex flex-wrap items-end gap-2 border-t border-[hsl(var(--border))] pt-4">
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "staffSpecies")}</label>
              <Select name="species" defaultValue={companion.species}>
                {companionSpeciesOptions.map((e) => (
                  <option key={e.id} value={e.species}>
                    {locale === "zh" ? e.name_zh : e.name_en}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "staffDisplayName")}</label>
              <Input name="name" placeholder={t(locale, "commonOptional")} defaultValue={companion.name ?? ""} />
            </div>
            <FormSubmitButton type="submit" variant="secondary" className="h-9 text-sm">
              {t(locale, "staffSaveCompanion")}
            </FormSubmitButton>
          </form>
        ) : null}
      </Card>
    </div>
  );
}
