function splitExtension(fileName: string) {
  const trimmed = fileName.trim();
  const lastDot = trimmed.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === trimmed.length - 1) {
    return { stem: trimmed, extension: "" };
  }
  return {
    stem: trimmed.slice(0, lastDot),
    extension: trimmed.slice(lastDot),
  };
}

export function getDisplayFileNameStem(fileName: string | null | undefined) {
  const sanitized = sanitizeDisplayFileName(fileName);
  if (!sanitized) return "";
  return splitExtension(sanitized).stem;
}

export function sanitizeDisplayFileName(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, "")
    .replace(/[\\/]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

export function deriveUploadedDisplayFileName(params: {
  label?: string | null;
  originalFileName?: string | null;
  fallbackBaseName?: string;
}) {
  const fallbackBaseName = sanitizeDisplayFileName(params.fallbackBaseName) || "upload";
  const originalFileName = sanitizeDisplayFileName(params.originalFileName) || fallbackBaseName;
  const label = sanitizeDisplayFileName(params.label);

  if (!label) return originalFileName;

  const originalParts = splitExtension(originalFileName);
  const labelParts = splitExtension(label);
  const nextFileName = labelParts.extension ? label : `${label}${originalParts.extension}`;

  return sanitizeDisplayFileName(nextFileName) || originalFileName;
}
