"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { FormEvent } from "react";
import {
  createCompanyOnboardingMaterialAction,
  deleteCompanyOnboardingMaterialAction,
  type CompanyOnboardingMaterialMutationResult,
  updateCompanyOnboardingMaterialAction,
} from "@/app/actions/company";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  deserializeResolvedCompanyOnboardingMaterial,
  resolveMaterialDisplayName,
  type ResolvedCompanyOnboardingMaterial,
} from "@/lib/company-onboarding-materials";
import type { Locale } from "@/lib/locale";
import { t } from "@/lib/messages";
import { getDisplayFileNameStem, sanitizeDisplayFileName } from "@/lib/upload-file-name";

type LocalMaterial = ResolvedCompanyOnboardingMaterial & {
  pending?: boolean;
  pendingAction?: "adding" | "saving" | "deleting";
};

function withCurrentFlag(materials: LocalMaterial[]) {
  return materials.map((material, index) => ({
    ...material,
    isCurrent: index === 0,
  }));
}

function getFileFromFormData(formData: FormData, key: string) {
  const value = formData.get(key);
  if (!value || typeof value === "string" || value.size <= 0) return null;
  return value;
}

function buildOptimisticMaterial(params: {
  companyId: string;
  formData: FormData;
  fallback?: LocalMaterial;
  id: string;
  pendingAction: LocalMaterial["pendingAction"];
}): LocalMaterial {
  const title = sanitizeDisplayFileName(String(params.formData.get("onboardingMaterialTitle") ?? "")) || null;
  const description = String(params.formData.get("onboardingMaterialDescription") ?? "").trim() || null;
  const packageUrl = String(params.formData.get("onboardingPackageUrl") ?? "").trim();
  const videoUrl = String(params.formData.get("onboardingVideoUrl") ?? "").trim() || null;
  const deadlineDays = Math.max(1, Math.min(365, Number(params.formData.get("onboardingDeadlineDays") ?? 14) || 14));
  const file = getFileFromFormData(params.formData, "onboardingPackageFile");
  const uploadedFileName = file?.name ? sanitizeDisplayFileName(file.name) : null;
  const derivedTitle =
    title ||
    (uploadedFileName ? getDisplayFileNameStem(uploadedFileName) || uploadedFileName : null) ||
    params.fallback?.title ||
    params.fallback?.displayName ||
    null;
  const displayName = resolveMaterialDisplayName({
    title: derivedTitle,
    packageUrl: file ? "" : packageUrl,
    videoUrl,
    packageAttachment: uploadedFileName ? { fileName: uploadedFileName } : null,
    videoAttachment: null,
  });
  const now = new Date();

  return {
    id: params.id,
    companyId: params.companyId,
    title: derivedTitle,
    description,
    packageUrl: file ? "" : packageUrl,
    videoUrl,
    packageVersion: String(params.formData.get("onboardingPackageVersion") ?? params.fallback?.packageVersion ?? "v1").trim() || "v1",
    deadlineDays,
    packageAttachmentId: file ? null : params.fallback?.packageAttachmentId ?? null,
    videoAttachmentId: params.fallback?.videoAttachmentId ?? null,
    createdAt: params.fallback?.createdAt ?? now,
    updatedAt: now,
    packageHref: file ? "" : packageUrl,
    videoHref: videoUrl,
    packageAttachmentName: uploadedFileName || params.fallback?.packageAttachmentName || null,
    videoAttachmentName: params.fallback?.videoAttachmentName || null,
    videoMimeType: params.fallback?.videoMimeType || null,
    displayName,
    displayDescription: description,
    source: params.fallback?.source ?? "db",
    isCurrent: params.fallback?.isCurrent ?? false,
    pending: true,
    pendingAction: params.pendingAction,
  };
}

function materialFromResult(
  result: CompanyOnboardingMaterialMutationResult,
): ResolvedCompanyOnboardingMaterial | null {
  if (!result.material) return null;
  return deserializeResolvedCompanyOnboardingMaterial(result.material);
}

function pendingLabel(locale: Locale, action: LocalMaterial["pendingAction"]) {
  if (locale === "zh") {
    if (action === "adding") return "添加中…";
    if (action === "deleting") return "删除中…";
    return "保存中…";
  }
  if (action === "adding") return "Adding...";
  if (action === "deleting") return "Deleting...";
  return "Saving...";
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
  const addFormRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [localMaterials, setLocalMaterials] = useState<LocalMaterial[]>(() => withCurrentFlag(materials));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [activeMutation, setActiveMutation] = useState<{ id: string; action: LocalMaterial["pendingAction"] } | null>(null);

  useEffect(() => {
    setLocalMaterials(withCurrentFlag(materials));
  }, [materials]);

  function clearRowError(materialId: string) {
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[materialId];
      return next;
    });
  }

  function handleAddSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const file = getFileFromFormData(formData, "onboardingPackageFile");
    const hasAnySource = Boolean(
      String(formData.get("onboardingPackageUrl") ?? "").trim() ||
        String(formData.get("onboardingVideoUrl") ?? "").trim() ||
        file,
    );

    setCreateError(null);
    const optimisticId = `pending-${Date.now()}`;
    const optimisticMaterial = buildOptimisticMaterial({
      companyId,
      formData,
      id: optimisticId,
      pendingAction: "adding",
    });

    if (hasAnySource) {
      setLocalMaterials((prev) => withCurrentFlag([optimisticMaterial, ...prev]));
    }

    setActiveMutation({ id: "create", action: "adding" });
    startTransition(async () => {
      try {
        const result = await createCompanyOnboardingMaterialAction(formData);
        if (!result.ok) {
          if (hasAnySource) {
            setLocalMaterials((prev) => withCurrentFlag(prev.filter((material) => material.id !== optimisticId)));
          }
          setCreateError(result.error);
          return;
        }

        const savedMaterial = materialFromResult(result);
        if (!savedMaterial) {
          throw new Error("Saved onboarding material was missing from the response.");
        }

        setLocalMaterials((prev) =>
          withCurrentFlag([savedMaterial, ...prev.filter((material) => material.id !== optimisticId)]),
        );
        addFormRef.current?.reset();
        setCreateError(null);
      } catch (error) {
        console.error("[company onboarding create]", error);
        if (hasAnySource) {
          setLocalMaterials((prev) => withCurrentFlag(prev.filter((material) => material.id !== optimisticId)));
        }
        setCreateError(locale === "zh" ? "添加入职材料失败。" : "Unable to add the onboarding material.");
      } finally {
        setActiveMutation(null);
      }
    });
  }

  function handleSaveSubmit(material: LocalMaterial, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const previousMaterials = localMaterials;
    const optimisticMaterial = buildOptimisticMaterial({
      companyId,
      formData,
      fallback: material,
      id: material.id,
      pendingAction: "saving",
    });

    clearRowError(material.id);
    setLocalMaterials((prev) =>
      withCurrentFlag(prev.map((entry) => (entry.id === material.id ? optimisticMaterial : entry))),
    );
    setActiveMutation({ id: material.id, action: "saving" });

    startTransition(async () => {
      try {
        const result = await updateCompanyOnboardingMaterialAction(formData);
        if (!result.ok) {
          setLocalMaterials(previousMaterials);
          setRowErrors((prev) => ({ ...prev, [material.id]: result.error ?? (locale === "zh" ? "保存失败。" : "Unable to save.") }));
          return;
        }

        const savedMaterial = materialFromResult(result);
        if (!savedMaterial) {
          throw new Error("Updated onboarding material was missing from the response.");
        }

        setLocalMaterials((prev) =>
          withCurrentFlag(prev.map((entry) => (entry.id === material.id ? savedMaterial : entry))),
        );
        setEditingId((current) => (current === material.id ? null : current));
      } catch (error) {
        console.error("[company onboarding update]", error);
        setLocalMaterials(previousMaterials);
        setRowErrors((prev) => ({ ...prev, [material.id]: locale === "zh" ? "保存失败。" : "Unable to save." }));
      } finally {
        setActiveMutation(null);
      }
    });
  }

  function handleDelete(material: LocalMaterial) {
    const previousMaterials = localMaterials;
    clearRowError(material.id);
    setLocalMaterials((prev) => withCurrentFlag(prev.filter((entry) => entry.id !== material.id)));
    setActiveMutation({ id: material.id, action: "deleting" });
    setEditingId((current) => (current === material.id ? null : current));

    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("companyId", companyId);
        formData.set("materialId", material.id);
        const result = await deleteCompanyOnboardingMaterialAction(formData);
        if (!result.ok) {
          setLocalMaterials(previousMaterials);
          setRowErrors((prev) => ({ ...prev, [material.id]: result.error ?? (locale === "zh" ? "删除失败。" : "Unable to delete.") }));
          return;
        }
      } catch (error) {
        console.error("[company onboarding delete]", error);
        setLocalMaterials(previousMaterials);
        setRowErrors((prev) => ({ ...prev, [material.id]: locale === "zh" ? "删除失败。" : "Unable to delete." }));
      } finally {
        setActiveMutation(null);
      }
    });
  }

  return (
    <div className="space-y-4">
      {!localMaterials.length ? (
        <p className="rounded-[10px] border border-dashed border-[hsl(var(--border))] px-4 py-3 text-sm text-[hsl(var(--muted))]">
          {t(locale, "onboardingHubManagePackageMissing")}
        </p>
      ) : (
        <div className="space-y-2">
          {localMaterials.map((material) => {
            const isEditing = editingId === material.id;
            const isBusy = activeMutation?.id === material.id;

            return (
              <div key={material.id} className="rounded-[10px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-[hsl(var(--foreground))]">{material.displayName}</p>
                      {material.isCurrent ? (
                        <span className="rounded-full bg-[hsl(var(--primary))]/10 px-2 py-0.5 text-[11px] font-semibold text-[hsl(var(--primary))]">
                          {t(locale, "onboardingHubManageCurrentMaterial")}
                        </span>
                      ) : null}
                      {material.pending && material.pendingAction ? (
                        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                          {pendingLabel(locale, material.pendingAction)}
                        </span>
                      ) : null}
                    </div>
                    {material.displayDescription ? (
                      <p className="mt-1 text-sm text-[hsl(var(--muted))]">{material.displayDescription}</p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-[hsl(var(--muted))]">
                      {material.packageHref ? (
                        <a href={material.packageHref} target="_blank" rel="noreferrer" className="font-medium text-[hsl(var(--primary))] hover:underline">
                          {t(locale, "onboardingOpenPackage")}
                        </a>
                      ) : null}
                      {material.videoHref ? (
                        <a href={material.videoHref} target="_blank" rel="noreferrer" className="font-medium text-[hsl(var(--primary))] hover:underline">
                          {t(locale, "onboardingVideoOpenLink")}
                        </a>
                      ) : null}
                      {material.packageAttachmentName ? (
                        <span>
                          {t(locale, "companyOnboardingUploadedFile")}: {material.packageAttachmentName}
                        </span>
                      ) : null}
                    </div>
                    {rowErrors[material.id] ? (
                      <p className="mt-2 text-sm text-[hsl(var(--error))]">{rowErrors[material.id]}</p>
                    ) : null}
                  </div>

                  {!material.pending ? (
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button type="button" variant="secondary" disabled={pending} onClick={() => setEditingId(isEditing ? null : material.id)}>
                        {isEditing ? t(locale, "commonCancel") : t(locale, "commonEdit")}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={pending}
                        className="border border-rose-600/30 bg-rose-600/5 text-rose-900 dark:text-rose-100"
                        onClick={() => handleDelete(material)}
                      >
                        {isBusy && activeMutation?.action === "deleting"
                          ? pendingLabel(locale, "deleting")
                          : t(locale, "onboardingHubManageDeleteContent")}
                      </Button>
                    </div>
                  ) : null}
                </div>

                {isEditing && !material.pending ? (
                  <form className="mt-3 grid gap-3 border-t border-[hsl(var(--border))] pt-3" onSubmit={(event) => handleSaveSubmit(material, event)}>
                    <input type="hidden" name="companyId" value={companyId} />
                    <input type="hidden" name="materialId" value={material.id} />
                    <input type="hidden" name="onboardingPackageVersion" value={material.packageVersion} />
                    <input type="hidden" name="onboardingDeadlineDays" value={String(material.deadlineDays)} />

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1">
                        <label className="text-xs font-medium">{t(locale, "commonName")}</label>
                        <Input name="onboardingMaterialTitle" defaultValue={material.title ?? material.displayName} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium">{t(locale, "commonDescription")}</label>
                        <Input name="onboardingMaterialDescription" defaultValue={material.description ?? ""} />
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1">
                        <label className="text-xs font-medium">{t(locale, "companyOnboardingUrl")}</label>
                        <Input name="onboardingPackageUrl" defaultValue={material.packageUrl} placeholder="https://..." />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium">{t(locale, "companyOnboardingVideoUrl")}</label>
                        <Input name="onboardingVideoUrl" defaultValue={material.videoUrl ?? ""} placeholder="https://..." />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium">{t(locale, "companyOnboardingReplaceFile")}</label>
                      <input type="file" name="onboardingPackageFile" className="text-xs" />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" disabled={pending}>
                        {isBusy && activeMutation?.action === "saving"
                          ? pendingLabel(locale, "saving")
                          : t(locale, "onboardingHubManageSaveContent")}
                      </Button>
                      <Button type="button" variant="secondary" disabled={pending} onClick={() => setEditingId(null)}>
                        {t(locale, "commonCancel")}
                      </Button>
                    </div>
                  </form>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-[10px] border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted))]">
          {t(locale, "companyOnboardingAddMore")}
        </p>
        <form ref={addFormRef} className="mt-3 grid gap-3" onSubmit={handleAddSubmit}>
          <input type="hidden" name="companyId" value={companyId} />
          <input type="hidden" name="onboardingPackageVersion" value="v1" />

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "commonName")}</label>
              <Input name="onboardingMaterialTitle" placeholder="Onboarding video" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "commonDescription")}</label>
              <Input name="onboardingMaterialDescription" placeholder={locale === "zh" ? "可选说明" : "Optional description"} />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "companyOnboardingUrl")}</label>
              <Input name="onboardingPackageUrl" placeholder="https://..." />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "companyOnboardingVideoUrl")}</label>
              <Input name="onboardingVideoUrl" placeholder="https://..." />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "companyOnboardingUploadPackage")}</label>
              <input type="file" name="onboardingPackageFile" className="text-xs" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "companyOnboardingDeadlineDays")}</label>
              <Input name="onboardingDeadlineDays" type="number" min={1} max={365} defaultValue="14" />
            </div>
          </div>

          {createError ? <p className="text-sm text-[hsl(var(--error))]">{createError}</p> : null}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>
              {activeMutation?.id === "create" && activeMutation.action === "adding"
                ? pendingLabel(locale, "adding")
                : t(locale, "onboardingHubManageAddContent")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
