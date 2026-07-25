# Plan 097 post-drain reader attestation

The anonymous Plan 097 reader checker completed at
`2026-07-25T14:52:47.145Z`, after the conservative 86,400-second cache-drain
deadline of `2026-07-24T17:16:05.839Z`.

## Bound deployment

- Repository SHA: `b25542b0a735636e7051be8fb70893499671366f`
- Protected workflow run: `30028518714`
- Worker version: `8c117bac-3813-4cfc-9d19-c94c4987a165`
- Request routing: ordinary production traffic
- Active release: `pub_20260605T183601689Z`
- Exact route count: 375

## Result

The strict checker passed all 15 release-aware endpoint observations:

- 14 successful endpoints returned `Cache-Control: no-store`;
- all 15 endpoint observations carried the expected Worker version;
- the known baseline map-manifest response remained HTTP 503;
- the anonymous `/__operations/plan097` request remained HTTP 404 and carried
  the expected Worker version; and
- the active release and exact route count were unchanged.

The strict-decoded receipt generated at
`/tmp/plan097-post-drain-reader.receipt.json` had SHA-256
`d656af6bf43b7ca6026dcae86842ec47cff6eabd5b785ad9a542c9af2f7ca460`.
That local receipt is supporting evidence, not a signed preflight, disposable
proof receipt, mutation token, activation receipt, or completion receipt.

## Authority boundary

This check was anonymous and read-only. It did not mutate D1, R2, Worker
configuration, serving data, schema, release pointers, recovery manifests, or
candidate artifacts. The signed preflight and disposable proof require the
isolated proof environment and its credentials. Production mutation still
requires a fresh operator execution token issued after those receipts and
commands are available for review.
