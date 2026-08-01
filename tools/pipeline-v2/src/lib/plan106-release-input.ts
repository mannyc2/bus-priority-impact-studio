export function plan106ArchiveRelativePath(candidateId: string, physicalKey: string): string {
  if (!/^[a-f0-9]{64}$/u.test(candidateId)) throw new Error("Invalid Plan 106 candidate id.");
  const prefix = `studio/v2/candidates/${candidateId}/`;
  if (!physicalKey.startsWith(prefix)) {
    throw new Error("Plan 106 physical key is outside its candidate namespace.");
  }
  const relativePath = physicalKey.slice(prefix.length);
  if (
    relativePath.length === 0 ||
    relativePath.startsWith("/") ||
    relativePath.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error("Plan 106 archive-relative path is unsafe.");
  }
  return relativePath;
}
