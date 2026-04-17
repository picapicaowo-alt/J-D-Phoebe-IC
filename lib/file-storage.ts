import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { resolveBlobReadWriteToken } from "@/lib/blob";

export function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180) || "file";
}

export async function storeUploadedFile(
  buf: Buffer,
  fileName: string,
  mimeType: string,
  folderKey: string,
): Promise<{ storageKey: string; blobUrl: string | null }> {
  const safeName = sanitizeFileName(fileName);
  const blobToken = resolveBlobReadWriteToken();
  if (blobToken.token) {
    const { put } = await import("@vercel/blob");
    const key = `${folderKey}/${randomUUID()}-${safeName}`;
    const blob = await put(key, buf, { access: "public", token: blobToken.token });
    return { storageKey: key, blobUrl: blob.url };
  }
  if (process.env.VERCEL === "1") {
    if (blobToken.ambiguousEnvVarNames.length > 0) {
      throw new Error(
        `Multiple Blob read/write tokens were found (${blobToken.ambiguousEnvVarNames.join(", ")}). Set BLOB_READ_WRITE_TOKEN explicitly for this app and redeploy.`,
      );
    }
    throw new Error(
      "File upload on Vercel requires BLOB_READ_WRITE_TOKEN or a single Vercel Blob *_READ_WRITE_TOKEN variable. Add one under Project → Settings → Environment Variables, then redeploy.",
    );
  }
  const relDir = path.join("uploads", folderKey);
  const dir = path.join(process.cwd(), relDir);
  await mkdir(dir, { recursive: true });
  const diskName = `${randomUUID()}-${safeName}`;
  const full = path.join(dir, diskName);
  await writeFile(full, buf);
  return { storageKey: path.join(relDir, diskName), blobUrl: null };
}
