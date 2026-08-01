import { describe, expect, test } from "bun:test";
import { plan106ArchiveRelativePath } from "../../src/lib/plan106-release-input";

const candidateId = "b647f0f12a5dc037e0e9776e03c0cf9a4f78081728b7f4470e58e4558e4e77ef";

describe("Plan 106 immutable release-input layout", () => {
  test("maps candidate-qualified physical keys to archive-root files", () => {
    expect(
      plan106ArchiveRelativePath(
        candidateId,
        `studio/v2/candidates/${candidateId}/public-episodes.json`,
      ),
    ).toBe("public-episodes.json");
    expect(
      plan106ArchiveRelativePath(
        candidateId,
        `studio/v2/candidates/${candidateId}/routes/b11/intervention-history.json`,
      ),
    ).toBe("routes/b11/intervention-history.json");
  });

  test("rejects cross-candidate and traversal paths", () => {
    expect(() =>
      plan106ArchiveRelativePath(candidateId, "studio/v2/candidates/other/public-episodes.json"),
    ).toThrow("outside its candidate namespace");
    expect(() =>
      plan106ArchiveRelativePath(
        candidateId,
        `studio/v2/candidates/${candidateId}/routes/../public-episodes.json`,
      ),
    ).toThrow("archive-relative path is unsafe");
  });
});
