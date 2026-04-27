import { describe, expect, test } from "bun:test";
import { parseSourceManifest } from "../src/source-manifest.js";

describe("source manifest parser", () => {
  test("parses every MVP manifest source class with Bun's YAML parser", () => {
    const manifest = parseSourceManifest(`
verified_at: 2026-04-27
sources:
  - id: speed_dataset
    type: socrata_dataset
    priority: core
    domain: data.ny.gov
    dataset_id: kufs-yh3x
    url: https://data.ny.gov/Transportation/example/kufs-yh3x
    api_json: https://data.ny.gov/resource/kufs-yh3x.json
    columns_json: https://data.ny.gov/api/views/kufs-yh3x/columns.json
    rows_csv: https://data.ny.gov/api/views/kufs-yh3x/rows.csv?accessType=DOWNLOAD
    purpose: Core schema probe.
    status: needs_schema_probe
  - id: docs
    type: web_page
    priority: core
    url: https://www.mta.info/open-data
    purpose: Documentation page.
    status: seed_verified
  - id: gtfs_static
    type: gtfs_static_zip
    priority: secondary
    url: https://example.com/gtfs.zip
    purpose: Static GTFS zip.
    status: needs_download
  - id: realtime
    type: gtfs_realtime_api
    priority: optional
    url: https://gtfsrt.prod.obanyc.com/alerts?key=<YOUR_KEY>
    purpose: GTFS realtime feed.
    status: needs_api_key
  - id: pdf
    type: pdf_or_doc
    priority: secondary
    url: https://www.mta.info/document/90881
    purpose: PDF documentation.
    status: needs_capture
  - id: standard
    type: standard_doc
    priority: secondary
    url: https://gtfs.org/documentation/realtime/reference/
    purpose: Standard documentation.
    status: seed_verified
`);

    expect(manifest.sources.map((source) => source.type)).toEqual([
      "socrata_dataset",
      "web_page",
      "gtfs_static_zip",
      "gtfs_realtime_api",
      "pdf_or_doc",
      "standard_doc",
    ]);
  });
});
