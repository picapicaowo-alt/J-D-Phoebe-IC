"use server";

import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { isCompanyAdmin, isGroupAdmin, isSuperAdmin, type AccessUser } from "@/lib/access";
import { assertPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const MAX_BYTES = 6 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function safeReturnTo(formData: FormData, fallbackPath: string) {
  const raw = String(formData.get("returnTo") ?? "").trim();
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallbackPath;
  return raw;
}

function toUserMessage(error: unknown) {
  const text = error instanceof Error ? error.message : "Upload failed. Please try again.";
  return text.length > 220 ? "Upload failed. Please try again." : text;
}

function redirectWithUploadError(formData: FormData, fallbackPath: string, error: unknown): never {
  const pathname = safeReturnTo(formData, fallbackPath);
  const qs = new URLSearchParams({ uploadError: toUserMessage(error) });
  redirect(`${pathname}?${qs.toString()}`);
}

async function persistImage(buf: Buffer, mime: string, folder: string): Promise<string> {
  if (!ALLOWED.has(mime)) {
    if (mime === "image/heic" || mime === "image/heif") {
      throw new Error("HEIC/HEIF is not supported yet. Please convert to JPEG, PNG, WebP, or GIF.");
    }
    throw new Error("Only JPEG, PNG, WebP, or GIF images are allowed.");
  }
  if (buf.length > MAX_BYTES) throw new Error("Image is too large (max 6MB).");

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : mime === "image/gif" ? "gif" : "jpg";
    const key = `${folder}/${randomUUID()}.${ext}`;
    const blob = await put(key, buf, { access: "public", token: process.env.BLOB_READ_WRITE_TOKEN });
    return blob.url;
  }

  if (process.env.VERCEL === "1") {
    throw new Error(
      "Image upload on Vercel requires BLOB_READ_WRITE_TOKEN (Vercel Blob). Add it under Project → Settings → Environment Variables, then redeploy.",
    );
  }

  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : mime === "image/gif" ? "gif" : "jpg";
  const relDir = path.join("public", "uploads", folder);
  const dir = path.join(process.cwd(), relDir);
  await mkdir(dir, { recursive: true });
  const name = `${randomUUID()}.${ext}`;
  const diskPath = path.join(dir, name);
  await writeFile(diskPath, buf);
  return `/${path.join("uploads", folder, name).replace(/\\/g, "/")}`;
}

export async function uploadUserAvatarAction(formData: FormData) {
  const userId = String(formData.get("userId") ?? "").trim();
  const fallbackPath = userId ? `/staff/${userId}` : "/settings/profile";

  try {
    const actor = (await requireUser()) as AccessUser;
    if (!userId) throw new Error("Missing userId");
    if (actor.id !== userId) await assertPermission(actor, "staff.update");

    const file = formData.get("file");
    if (!file || typeof file === "string" || !("arrayBuffer" in file)) throw new Error("Choose an image file.");

    const buf = Buffer.from(await file.arrayBuffer());
    const mime = file.type || "application/octet-stream";
    const url = await persistImage(buf, mime, `avatars/${userId}`);

    await prisma.user.update({ where: { id: userId }, data: { avatarUrl: url } });
    revalidatePath(`/staff/${userId}`);
    revalidatePath("/staff");
    revalidatePath("/settings/profile");
  } catch (error) {
    redirectWithUploadError(formData, fallbackPath, error);
  }
}

export async function removeUserAvatarAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) throw new Error("Missing userId");
  if (actor.id !== userId) await assertPermission(actor, "staff.update");

  await prisma.user.update({ where: { id: userId }, data: { avatarUrl: null } });
  revalidatePath(`/staff/${userId}`);
  revalidatePath("/staff");
  revalidatePath("/settings/profile");
}

export async function uploadCompanyLogoAction(formData: FormData) {
  const companyId = String(formData.get("companyId") ?? "").trim();
  const fallbackPath = companyId ? `/companies/${companyId}` : "/companies";

  try {
    const actor = (await requireUser()) as AccessUser;
    await assertPermission(actor, "company.update");
    if (!companyId) throw new Error("Missing companyId");

    const company = await prisma.company.findFirst({ where: { id: companyId, deletedAt: null } });
    if (!company) throw new Error("Not found");
    if (!isSuperAdmin(actor) && !isGroupAdmin(actor, company.orgGroupId) && !isCompanyAdmin(actor, companyId)) {
      throw new Error("Forbidden");
    }

    const file = formData.get("file");
    if (!file || typeof file === "string" || !("arrayBuffer" in file)) throw new Error("Choose an image file.");

    const buf = Buffer.from(await file.arrayBuffer());
    const mime = file.type || "application/octet-stream";
    const url = await persistImage(buf, mime, `company-logos/${companyId}`);

    await prisma.company.update({ where: { id: companyId }, data: { logoUrl: url } });
    revalidatePath(`/companies/${companyId}`);
    revalidatePath("/companies");
    revalidatePath("/group");
  } catch (error) {
    redirectWithUploadError(formData, fallbackPath, error);
  }
}

export async function removeCompanyLogoAction(formData: FormData) {
  const actor = (await requireUser()) as AccessUser;
  await assertPermission(actor, "company.update");
  const companyId = String(formData.get("companyId") ?? "").trim();
  if (!companyId) throw new Error("Missing companyId");

  const company = await prisma.company.findFirst({ where: { id: companyId, deletedAt: null } });
  if (!company) throw new Error("Not found");
  if (!isSuperAdmin(actor) && !isGroupAdmin(actor, company.orgGroupId) && !isCompanyAdmin(actor, companyId)) {
    throw new Error("Forbidden");
  }

  await prisma.company.update({ where: { id: companyId }, data: { logoUrl: null } });
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/companies");
  revalidatePath("/group");
}
