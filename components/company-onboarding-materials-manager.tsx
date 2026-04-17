"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormState } from "react-dom";
import {
  createCompanyOnboardingMaterialAction,
  type CompanyOnboardingMaterialActionResult,
  deleteCompanyOnboardingMaterialAction,
  updateCompanyOnboardingMaterialAction,
  uploadCompanyOnboardingPackageAction,
} from "@/app/actions/company";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Input } from "@/components/ui/input";
import type { ResolvedCompanyOnboardingMaterial } from "@/lib/company-onboarding-materials";
import type { Locale } from "@/lib/locale";
import { t } from "@/lib/messages";
import { deriveUploadedDisplayFileName, getDisplayFileNameStem } from "@/lib/upload-file-name";

type PendingMaterial = ResolvedCompanyOnboardingMaterial & {
  pending: true;
};

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

function buildPendingMaterials(params: {
  companyId: string;
  packageUrl: string;
  videoUrl: string | null;
  packageVersion: string;
  deadlineDays: number;
  requestedFileName: string;
  files: File[];
}) {
  const { companyId, packageUrl, videoUrl, packageVersion, deadlineDays, requestedFileName, files } = params;

  if (files.length > 0) {
    return files.map((file, index) =>
      createPendingMaterial({
        companyId,
        packageUrl: "",
        videoUrl,
        packageVersion,
        deadlineDays,
        fileName: deriveUploadedDisplayFileName({
          label: files.length === 1 ? requestedFileName : "",
          originalFileName: file.name || "upload",
          fallbackBaseName: "upload",
        }),
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
  const packageUrlInputRef = useRef<HTMLInputElement>(null);
  const videoUrlInputRef = useRef<HTMLInputElement>(null);
  const packageFileNameInputRef = useRef<HTMLInputElement>(null);
  const packageFilesInputRef = useRef<HTMLInputElement>(null);
  const packageVersionInputRef = useRef<HTMLInputElement>(null);
  const deadlineDaysInputRef = useRef<HTMLInputElement>(null);
  const initialCreateState: CompanyOnboardingMaterialActionResult = { ok: false, error: null };
  const [createState, createFormAction] = useFormState(createCompanyOnboardingMaterialAction, initialCreateState);
  const [pendingMaterials, setPendingMaterials] = useState<PendingMaterial[]>([]);
  const pendingBadgeLabel = locale === "zh" ? "上传中…" : "Uploading...";
  const pendingPackageLabel = locale === "zh" ? "文件上传中…" : "Upload in progress...";
  const pendingProgressLabel =
    locale === "zh" ? "上传进行中。完成后此卡片会自动更新。" : "Upload in progress. This card will update when it finishes.";

  useEffect(() => {
    if (createState.ok) {
      setPendingMaterials([]);
      formRef.current?.reset();
      router.refresh();
      return;
    }
    if (createState.error) {
      setPendingMaterials([]);
    }
  }, [createState, router]);

  const visibleMaterials = [...pendingMaterials, ...materials];

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
                    <p>{pendingProgressLabel}</p>
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
                      <div className="space-y-1">
                        <label className="text-xs font-medium">{t(locale, "companyOnboardingFileName")}</label>
                        <Input name="onboardingPackageFileName" defaultValue={material.packageAttachmentName ?? ""} placeholder="Onboarding video" />
                        <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "companyOnboardingFileNameHelp")}</p>
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
                        <div className="space-y-1">
                          <label className="text-xs font-medium">{t(locale, "companyOnboardingFileName")}</label>
                          <Input
                            name="onboardingPackageFileName"
                            defaultValue={getDisplayFileNameStem(material.packageAttachmentName)}
                            placeholder="Onboarding video"
                          />
                        </div>
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
        <form
          ref={formRef}
          action={createFormAction}
          encType="multipart/form-data"
          className="mt-3 grid gap-3"
          onSubmit={() => {
            const nextPendingMaterials = buildPendingMaterials({
              companyId,
              packageUrl: packageUrlInputRef.current?.value.trim() ?? "",
              videoUrl: videoUrlInputRef.current?.value.trim() || null,
              packageVersion: packageVersionInputRef.current?.value.trim() || "v1",
              deadlineDays: Math.max(1, Math.min(365, Number(deadlineDaysInputRef.current?.value ?? 14) || 14)),
              requestedFileName: packageFileNameInputRef.current?.value.trim() ?? "",
              files: Array.from(packageFilesInputRef.current?.files ?? []).filter((file) => file.size > 0),
            });
            setPendingMaterials(nextPendingMaterials);
          }}
        >
          <input type="hidden" name="companyId" value={companyId} />
          <div className="space-y-1">
            <label className="text-xs font-medium">{t(locale, "companyOnboardingUrl")}</label>
            <Input ref={packageUrlInputRef} name="onboardingPackageUrl" placeholder="https://..." />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">{t(locale, "companyOnboardingVideoUrl")}</label>
            <Input ref={videoUrlInputRef} name="onboardingVideoUrl" placeholder="https://..." />
            <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "companyOnboardingVideoUrlHelp")}</p>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">{t(locale, "companyOnboardingFileName")}</label>
            <Input ref={packageFileNameInputRef} name="onboardingPackageFileName" placeholder="Onboarding video" />
            <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "companyOnboardingFileNameHelp")}</p>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">{t(locale, "companyOnboardingUploadPackage")}</label>
            <input ref={packageFilesInputRef} type="file" name="onboardingPackageFiles" className="text-xs" />
          </div>
          <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "companyOnboardingUploadHelp")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "companyOnboardingVersion")}</label>
              <Input ref={packageVersionInputRef} name="onboardingPackageVersion" defaultValue="v1" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "companyOnboardingDeadlineDays")}</label>
              <Input ref={deadlineDaysInputRef} name="onboardingDeadlineDays" type="number" min={1} max={365} defaultValue="14" />
            </div>
          </div>
          {createState.error ? <p className="text-sm text-[hsl(var(--error))]">{createState.error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <FormSubmitButton type="submit" pendingLabel={locale === "zh" ? "上传中…" : "Uploading..."}>
              {t(locale, "onboardingHubManageAddContent")}
            </FormSubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
