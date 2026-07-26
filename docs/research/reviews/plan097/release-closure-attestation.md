# Plan 097 release closure attestation

Plan 097 completed on 2026-07-26 with candidate
`pub_20260725T164123260Z` active in production. The operation preserved the
existing production D1 database and its protected live-write/current-signal
tables, used the proven selective serving rollback only in the disposable
environment, and did not invoke production contingency rollback.

## Candidate identity

- Operation: `plan097:pub_20260725T164123260Z`
- Coverage: `2023-04` through `2026-05`
- Activation bundle SHA-256:
  `7f570d37839b382f0b00488ed8c7f6d03dcb80dd5a933c19c85f3d40dd17327c`
- Artifact manifest SHA-256:
  `6bc5cc028bfd20eadb7912b6022212847ba2f8087511450ac463f9e783300e70`
- Strict artifact inventory: 3,002 objects and 774,069,604 bytes
- Exact route universe: 375 routes
- Previous production release: `pub_20260605T183601689Z`

## Signed preflight

[GitHub Actions run 30180085025](https://github.com/mannyc2/bus-priority-impact-studio/actions/runs/30180085025)
completed the read-only production audit at
`2026-07-25T23:50:11.708Z`. The signed receipt:

- has SHA-256
  `f46204de5f909f81c834d92d087f73b296bad0fb5137ba3caeb41430da4ecce6`;
- is signed by key ID `plan097-20260725-rc28`;
- binds public SPKI SHA-256
  `7b6bb824b4754df8686bfc10e4295a2e47d9ab4da34a92c29af1199842adb8c6`;
- identifies the exact previous release and Worker version
  `0a85b26e-1ff5-4b2a-a63a-cc0f67f95253`;
- records the legacy migration ledger without altering it; and
- authorizes only exact 0033 map-catalog reconciliation plus the bound
  activation/restore bundles.

The rollback bundle SHA-256 is
`351454ae5c89ff5689525a323c0541ff50a75be21f638b07c1739058a6ef2abf`.
Actions artifact `8625300909` has archive digest
`sha256:ccc67bc631ab1a9d03a36757dfabb2da2bfd7fb0752e404d5b853953fbbcf8fd`.

## Disposable A→B→A proof

[GitHub Actions run 30180351221](https://github.com/mannyc2/bus-priority-impact-studio/actions/runs/30180351221)
passed the exact production-sized proof:

1. `proof-baseline` elected `pub_20260605T183601689Z`;
2. the injected transactional failure elected the same baseline and committed
   no candidate state;
3. `candidate-active` elected `pub_20260725T164123260Z` and returned 16/16
   successful `no-store` checks; and
4. `baseline-restored` elected `pub_20260605T183601689Z` with the original
   public behavior restored.

The proof emitted 3,010 remote receipts. Its immutable summary is:

- key:
  `operations/plan097/proof/pub_20260725T164123260Z/proof-summary.d5929c591580c540366fe30caac9b9270ca5c3bae687c4d4e92762043174edd2.json`;
- SHA-256:
  `d5929c591580c540366fe30caac9b9270ca5c3bae687c4d4e92762043174edd2`;
- bytes: 30,452.

Actions artifact `8625424069` has archive digest
`sha256:6418e5593e56a8324b73d4fecae7080bee61566cfaaf8be8a8de18ef25252933`.

## Production activation and completion receipt

[GitHub Actions run 30180632361](https://github.com/mannyc2/bus-priority-impact-studio/actions/runs/30180632361)
passed repository verification, deployed the protected one-time activation
Worker, reverified the immutable inputs, and executed the only production
transaction. It emitted 3,009 remote receipts.

The baseline at `2026-07-25T23:50:11.708Z` elected
`pub_20260605T183601689Z`: 14 successful endpoints were `no-store`, and the
known pre-activation map-manifest absence remained a 503. The post-activation
check at `2026-07-26T00:13:37.178Z` elected
`pub_20260725T164123260Z`; all 16 endpoints returned 200 and `no-store` from
the same production Worker version. Production contingency rollback was not
invoked.

The immutable completion receipt is:

- key:
  `operations/plan097/completion/pub_20260725T164123260Z/completion.c1758c865745c9eae47df3bc15c0e288ce69f6b988f4cb9e3e35e380ed1ff8af.json`;
- SHA-256:
  `c1758c865745c9eae47df3bc15c0e288ce69f6b988f4cb9e3e35e380ed1ff8af`;
- bytes: 17,821;
- outcome: `active`.

The receipt retains the actual D1/R2 operation counts, byte counts, cost
preview versus actual usage, critical production receipt keys, and both HTTP
comparisons without credentials or personal data. Actions artifact
`8625477286` has archive digest
`sha256:ec81a5a83c4b7ea493625dc45861f114b961c9d764706980078019a954bf2df2`.

## Independent public verification

An independent post-activation check confirmed:

- `/api/v1/status` elected `pub_20260725T164123260Z`, coverage
  `2023-04` through `2026-05`, 3,002 strict release artifacts, and zero build
  issues;
- `/api/v1/studio/routes?schema=3` returned exactly 375 routes;
- `B44` and `B44-SBS` remained distinct exact identities;
- `/api/v1/map/manifest` returned the active candidate; and
- representative B44-SBS geometry returned 12 features and byte-for-byte
  SHA-256
  `fa82049a3ee7013776f67b7915d21953e3640964975cb2607721f501afcfa22a`,
  matching the manifest.

Every checked successful response was `Cache-Control: no-store`. The status
surface truthfully distinguishes the release-month observed evidence from the
current recovered Bus Observatory signal and retains its provenance caveats.

## Temporary-control retirement

After the completion receipt and independent public checks passed, exact
post-delete reads confirmed:

- Workers `bus-priority-plan097-preflight`,
  `bus-priority-plan097-proof`, and `bus-priority-plan097-activation` are
  absent (Cloudflare code 10007);
- Access applications `8b356267-b390-4731-b918-7e3933a495a7`,
  `0d393afc-15ad-484c-8353-50e8d05e2286`, and
  `848e3df5-76a0-46f5-9d27-bfd752579fe3` are absent (HTTP 404);
- their exact one-time policies are absent with the applications;
- service token `9a57c852-0ec3-4d8e-95d3-01c08420f2af` is absent
  (HTTP 404); and
- every Plan 097 GitHub Actions secret and the temporary Access API-token
  secret were deleted. The routine `CLOUDFLARE_API_TOKEN` was retained for
  normal deployments.

The disposable proof D1 and the preflight/proof/production operations buckets
are retained as bounded audit evidence. The one-time workflow entry points
were removed from the repository. They cannot authorize a later release.

## Follow-on boundary

Plan 097 is complete. This recovery path is not a steady-state publication
control plane and must not be reused for a later artifact or schema cutover.
Plan 098 now owns the explicit immutable candidate catalog and one-pointer
activation/rollback architecture.
