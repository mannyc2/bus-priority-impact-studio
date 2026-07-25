# MTA Wiki v1-rc28 public-release attestation

Verified at `2026-07-25T14:46:22Z` against the public GitHub prerelease:

- Release: `https://github.com/mannyc2/mta-wiki/releases/tag/v1-rc28`
- Release ID: `v1-rc28`
- Manifest version: `6`
- Downloaded assets: `manifest.json`, `SHA256SUMS`, and `v1-rc28.tar.zst`

## Asset verification

`sha256sum -c SHA256SUMS` passed for both addressed assets:

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| `manifest.json` | 82,497 | `b47a105dc78501210f2d32e6f597f878203b8cfc35654cebc4de445d575a453c` |
| `v1-rc28.tar.zst` | 20,661,360 | `311bfd9d960f8aa341920ffc327830e3e10a0f7797fc4ab02d1c2589fbb4a096` |

The separately downloaded `manifest.json` and the archive member
`v1-rc28/manifest.json` are byte-identical.

## Tracker input comparison

Every source consumed by
`docs/research/reviews/closure-plan-042/artifacts/producer-import.json`
matches the public archive byte-for-byte:

| Role | Public archive path beneath `v1-rc28/` | Bytes | Rows | SHA-256 |
| --- | --- | ---: | ---: | --- |
| occurrence | `operational_occurrences.jsonl` | 865,769 | 131 | `6cb8654efee370d7444405ce3a0cdb8ce6fa394e6ada2347982cbec49df701ef` |
| member extent | `member-extent/data/contracts/operational-occurrence-member-extent/v1/operational_occurrence_member_extents.jsonl` | 379,210 | 308 | `5ca1ba253a75a577c0e32b249508873d5a5114f2bbb2565dba80e7fa60deab0e` |
| member grain | `study-frontier-closure/data/contracts/operational-occurrence-member-grain/v1/operational_occurrence_member_grain.jsonl` | 353,242 | 308 | `d5555770fe4b82764f685eb2f2f755d9790a09ad153fd7ace10bb81ae06b7679` |
| identity verdict | `study-frontier-closure/data/contracts/bus-lane-identity-verdicts-v1/bus_lane_identity_verdicts.jsonl` | 241,856 | 321 | `6f98d0975aeb9e0cc2786db528b6196a5bb1b8ccf8dc880d061245adf6d1434d` |
| bridge v2 | `study-frontier-closure/data/quality/study-readiness/v2/bridge-ledger.jsonl` | 1,244,111 | 484 | `4744dee6e246393460959412e8dbfd7f05ee7a6dd14a1fca408d8a8cf13d988e` |

The byte counts, line counts, and SHA-256 values match the committed producer
import exactly. This attests transport from the reviewed producer cut to the
public release. It does not change any Plan 042 authority flag: study,
publication, occurrence creation, D1/R2 mutation, and deployment remain
unauthorized.
