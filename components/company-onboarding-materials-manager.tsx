"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createCompanyOnboardingMaterialAction,
  deleteCompanyOnboardingMaterialAction,
  updateCompanyOnboardingMaterialAction,
  uploadCompanyOnboardingPackageAction,
} from "@/app/actions/company";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ResolvedCompanyOnboardingMaterial } from "@/lib/company-onboarding-materials";
import type { Locale } from "@/lib/locale";
import { t } from "@/lib/messages";

type PendingMaterial = ResolvedCompanyOnboardingMaterial & {
  pending: true;
};

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function createPendingMaterial(params: {
  companyId: string;
  packageUrl: string;
  videoUrl: string | null;
  packageVersion: string;
  deadlineDays: number;
  fileName: string | null;
  index: number;
}): PendingMaterial {
  const now = new Date();
  return {
    id: `pending-${now.getTime()}-${params.index}`,
    companyId: params.companyId,
    packageUrl: params.packageUrl,
    videoUrl: params.videoUrl,
    packageVersion: params.packageVersion,
    deadlineDays: params.deadlineDays,
    packageAttachmentId: null,
    videoAttachmentId: null,
    createdAt: now,
    updatedAt: now,
    packageHref: params.packageUrl,
    videoHref: params.videoUrl,
    packageAttachmentName: params.fileName,
    videoAttachmentName: null,
    videoMimeType: null,
    source: "db",
    isCurrent: true,
    pending: true,
  };
}

function buildPendingMaterials(formData: FormData) {
  const companyId = String(formData.get("companyId") ?? "").trim();
  const packageUrl = String(formData.get("onboardingPackageUrl") ?? "").trim();
  const videoUrl = String(formData.get("onboardingVideoUrl") ?? "").trim() || null;
  const packageVersion = String(formData.get("onboardingPackageVersion") ?? "").trim() || "v1";
  const deadlineDays = Math.max(1, Math.min(365, Number(formData.get("onboardingDeadlineDays") ?? 14) || 14));
  const files = formData
    .getAll("onboardingPackageFiles")
    .filter((entry): entry is File => typeof entry !== "string" && entry.size > 0);

  if (files.length > 0) {
    return files.map((file, index) =>
      createPendingMaterial({
        companyId,
        packageUrl: "",
        videoUrl,
        packageVersion,
        deadlineDays,
        fileName: file.name || null,
        index,
      }),
    );
  }

  if (!packageUrl) return [];

  return [
    createPendingMaterial({
      companyId,
      packageUrl,
      videoUrl,
      packageVersion,
      deadlineDays,
      fileName: null,
      index: 0,
    }),
  ];
}

export function CompanyOnboardingMaterialsManager({
  companyId,
  locale,
  materials,
}: {
  companyId: string;
  locale: Locale;
  materials: ResolvedCompanyOnboardingMaterial[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pendingMaterials, setPendingMaterials] = useState<PendingMaterial[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const pendingBadgeLabel = locale === "zh" ? "上传中…" : "Uploading...";
  const pendingPackageLabel = locale === "zh" ? "文件上传中…" : "Upload in progress...";
  const pendingQueuedLabel = locale === "zh" ? "已开始上传，完成后页面会自动刷新。" : "Upload queued. The page will refresh automatically when it finishes.";
  const createPendingLabel = locale === "zh" ? "上传中…" : "Uploading...";
  const createMissingLabel = locale === "zh" ? "请提供资料链接或上传资料文件。" : "Provide a material URL or upload a material file.";

  useEffect(() => {
    setPendingMaterials([]);
  }, [materials]);

  const visibleMaterials = [...pendingMaterials, ...materials];

  async function handleCreate(formData: FormData) {
    setCreateError(null);

    const nextPendingMaterials = buildPendingMaterials(formData);
    if (nextPendingMaterials.length === 0) {
      setCreateError(createMissingLabel);
      return;
    }

    const pendingIds = new Set(nextPendingMaterials.map((material) => material.id));
    setPendingMaterials((current) => [...nextPendingMaterials, ...current]);
    setIsCreating(true);
    formRef.current?.reset();

    try {
      await createCompanyOnboardingMaterialAction(formData);
      router.refresh();
    } catch (error) {
      setPendingMaterials((current) => current.filter((material) => !pendingIds.has(material.id)));
      setCreateError(toErrorMessage(error));
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="space-y-3">
      {!visibleMaterials.length ? (
        <p className="rounded-[10px] border border-dashed border-[hsl(var(--border))] px-4 py-3 text-sm text-[hsl(var(--muted))]">
          {t(locale, "onboardingHubManagePackageMissing")}
        </p>
      ) : (
        visibleMaterials.map((material, index) => {
          const isPending = "pending" in material;
          const isCurrent = index === 0;

          return (
            <div key={material.id} className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_420px]">
              <div className="rounded-[10px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted))]">
                    {t(locale, "companyOnboardingTitle")}
                  </p>
                  {isCurrent ? (
                    <span className="rounded-full bg-[hsl(var(--primary))]/10 px-2 py-0.5 text-[11px] font-semibold text-[hsl(var(--primary))]">
                      {t(locale, "onboardingHubManageCurrentMaterial")}
                    </span>
                  ) : null}
                  {isPending ? (
                    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                      {pendingBadgeLabel}
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 space-y-2 text-sm">
                  {material.packageHref ? (
                    <a
                      href={material.packageHref}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex font-medium text-[hsl(var(--primary))] underline-offset-4 hover:underline"
                    >
                      {t(locale, "onboardingOpenPackage")}
                    </a>
                  ) : isPending ? (
                    <p className="text-[hsl(var(--muted))]">{pendingPackageLabel}</p>
                  ) : (
                    <p className="text-[hsl(var(--muted))]">{t(locale, "onboardingHubManagePackageMissing")}</p>
                  )}
                  {material.packageAttachmentName ? (
                    <p className="text-[hsl(var(--muted))]">
                      {t(locale, "companyOnboardingUploadedFile")}: {material.packageAttachmentName}
                    </p>
                  ) : null}
                  <p className="text-[hsl(var(--muted))]">
                    {t(locale, "companyOnboardingVersion")}: {material.packageVersion}
                  </p>
                  <p className="text-[hsl(var(--muted))]">
                    {t(locale, "companyOnboardingDeadlineDays")}: {material.deadlineDays}
                  </p>
                  {material.videoHref ? (
                    <a
                      href={material.videoHref}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex font-medium text-[hsl(var(--primary))] underline-offset-4 hover:underline"
                    >
                      {t(locale, "onboardingVideoOpenLink")}
                    </a>
                  ) : null}
                  {material.videoAttachmentName ? (
                    <p className="text-[hsl(var(--muted))]">
                      {t(locale, "companyOnboardingUploadedFile")}: {material.videoAttachmentName}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="rounded-[10px] border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4">
                {isPending ? (
                  <div className="grid gap-2 text-sm text-[hsl(var(--muted))]">
                    <p>{pendingQueuedLabel}</p>
                  </div>
                ) : (
                  <>
                    <form action={updateCompanyOnboardingMaterialAction} className="grid gap-3">
                      <input type="hidden" name="companyId" value={companyId} />
                      <input type="hidden" name="materialId" value={material.id} />
                      <div className="space-y-1">
                        <label className="text-xs font-medium">{t(locale, "companyOnboardingUrl")}</label>
                        <Input name="onboardingPackageUrl" defaultValue={material.packageUrl} placeholder="https://..." />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium">{t(locale, "companyOnboardingVideoUrl")}</label>
                        <Input name="onboardingVideoUrl" defaultValue={material.videoUrl ?? ""} placeholder="https://..." />
                        <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "companyOnboardingVideoUrlHelp")}</p>
                      </div>
                      <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "companyOnboardingUploadHelp")}</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <label className="text-xs font-medium">{t(locale, "companyOnboardingVersion")}</label>
                          <Input name="onboardingPackageVersion" defaultValue={material.packageVersion} />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium">{t(locale, "companyOnboardingDeadlineDays")}</label>
                          <Input name="onboardingDeadlineDays" type="number" min={1} max={365} defaultValue={String(material.deadlineDays)} />
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <FormSubmitButton type="submit" variant="secondary">
                          {t(locale, "onboardingHubManageSaveContent")}
                        </FormSubmitButton>
                      </div>
                    </form>
                    <div className="mt-3 grid gap-3 border-t border-[hsl(var(--border))] pt-3">
                      <form action={uploadCompanyOnboardingPackageAction} encType="multipart/form-data" className="grid gap-2">
                        <input type="hidden" name="companyId" value={companyId} />
                        <input type="hidden" name="materialId" value={material.id} />
                        <label className="text-xs font-medium">{t(locale, "companyOnboardingUploadPackage")}</label>
                        <input type="file" name="file" required className="text-xs" />
                        <FormSubmitButton type="submit" variant="secondary">
                          {t(locale, "companyOnboardingUploadPackage")}
                        </FormSubmitButton>
                      </form>
                    </div>
                    <form action={deleteCompanyOnboardingMaterialAction} className="mt-3">
                      <input type="hidden" name="companyId" value={companyId} />
                      <input type="hidden" name="materialId" value={material.id} />
                      <FormSubmitButton
                        type="submit"
                        variant="secondary"
                        className="border border-rose-600/30 bg-rose-600/5 text-rose-900 dark:text-rose-100"
                      >
                        {t(locale, "onboardingHubManageDeleteContent")}
                      </FormSubmitButton>
                    </form>
                  </>
                )}
              </div>
            </div>
          );
        })
      )}

      <div className="rounded-[10px] border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted))]">
          {t(locale, "onboardingHubManageAddContent")}
        </p>
        <form ref={formRef} action={handleCreate} encType="multipart/form-data" className="mt-3 grid gap-3">
          <input type="hidden" name="companyId" value={companyId} />
          <div className="space-y-1">
            <label className="text-xs font-medium">{t(locale, "companyOnboardingUrl")}</label>
            <Input name="onboardingPackageUrl" placeholder="https://..." disabled={isCreating} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">{t(locale, "companyOnboardingVideoUrl")}</label>
            <Input name="onboardingVideoUrl" placeholder="https://..." disabled={isCreating} />
            <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "companyOnboardingVideoUrlHelp")}</p>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">{t(locale, "companyOnboardingUploadPackage")}</label>
            <input type="file" name="onboardingPackageFiles" multiple className="text-xs" disabled={isCreating} />
          </div>
          <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "companyOnboardingUploadHelp")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "companyOnboardingVersion")}</label>
              <Input name="onboardingPackageVersion" defaultValue="v1" disabled={isCreating} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "companyOnboardingDeadlineDays")}</label>
              <Input name="onboardingDeadlineDays" type="number" min={1} max={365} defaultValue="14" disabled={isCreating} />
            </div>
          </div>
          {createError ? <p className="text-sm text-[hsl(var(--error))]">{createError}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={isCreating}>
              {isCreating ? createPendingLabel : t(locale, "onboardingHubManageAddContent")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
