type BlobTokenResolution = {
  token: string | null;
  envVarName: string | null;
  ambiguousEnvVarNames: string[];
};

export function resolveBlobReadWriteToken(): BlobTokenResolution {
  const direct = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (direct) {
    return { token: direct, envVarName: "BLOB_READ_WRITE_TOKEN", ambiguousEnvVarNames: [] };
  }

  const candidates = Object.entries(process.env)
    .filter(([key, value]) => key.endsWith("_READ_WRITE_TOKEN") && typeof value === "string" && value.trim())
    .map(([key, value]) => ({ key, value: value!.trim() }))
    .sort((a, b) => a.key.localeCompare(b.key));

  if (candidates.length === 1) {
    return { token: candidates[0]!.value, envVarName: candidates[0]!.key, ambiguousEnvVarNames: [] };
  }

  return {
    token: null,
    envVarName: null,
    ambiguousEnvVarNames: candidates.map((candidate) => candidate.key),
  };
}
