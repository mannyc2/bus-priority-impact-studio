import { describe, expect, test } from "bun:test";
import {
  buildSocrataMetadataUrl,
  parseSocrataMetadata,
  SocrataDatasetIdSchema,
  summarizeSocrataMetadata,
} from "@bp/sources/clients/socrata";

describe("Socrata source contracts", () => {
  test("parses source metadata fixtures with extra Socrata fields", () => {
    const metadata = parseSocrataMetadata({
      id: "kufs-yh3x",
      name: "MTA Bus Speeds Sample",
      rowsUpdatedAt: 1_766_256_000,
      columns: [
        { name: "route_id", dataTypeName: "text", fieldName: "route_id" },
        { name: "average_speed", dataTypeName: "number", fieldName: "average_speed" },
      ],
      unexpectedSocrataField: "allowed by passthrough",
    });

    expect(summarizeSocrataMetadata(metadata)).toContain("columns=2");
  });

  test("builds metadata URLs without string concatenation in callers", () => {
    const datasetId = SocrataDatasetIdSchema.parse("kufs-yh3x");

    expect(buildSocrataMetadataUrl("data.ny.gov", datasetId).toString()).toBe(
      "https://data.ny.gov/api/views/kufs-yh3x",
    );
  });

  test("rejects invalid dataset IDs before network calls", () => {
    expect(() => SocrataDatasetIdSchema.parse("not-a-real-id")).toThrow();
  });
});
