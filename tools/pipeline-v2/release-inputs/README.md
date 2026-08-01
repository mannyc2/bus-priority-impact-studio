# Immutable serving release inputs

`plan106-public-serving-candidate.tar.zst` is the small, deterministic staging
bundle for the completed Plan 106 candidate
`b647f0f12a5dc037e0e9776e03c0cf9a4f78081728b7f4470e58e4558e4e77ef`.

The archive contains the original closed artifact map
(`403d9d570d42b8284b6c86b0db64d75b14ede3f2b5f67298cf26995b79e684b5`),
one global public body, and 188 public route-history bodies. It deliberately
excludes the private operator conformance body. The Plan 098 builder verifies
the map identity and all 189 declared body hashes before it can construct a
serving candidate. Archive entries are rooted at `public-episodes.json` and
`routes/`; the builder removes the already-verified
`studio/v2/candidates/<candidate-id>/` prefix from each physical key before
resolving those local source paths.

Archive SHA-256:
`eb08bb84a8e8f3c99c8be8f6e5595d3f34694e523ec7fd7d4ae8fc52a51326c7`.
