# TeXlyre storage bridge

Canonical WebSocket implementation of the `texlyre-storage` protocol (version 1).
It handles requests, binary streaming, uploads, and deletion challenge responses;
backends supply the storage operations separately through `storage-backend.cjs`.
The bridge does not depend on Garage or S3.

Storage recipes list `bridge.cjs` in `extraFiles`, with a synchronized copy beside
their `recipe.json`. Run `npm run sync:bridges` to update copies and
`npm run validate` to check them. The Garage recipe implements the backend using
`storage-core.cjs` and `s3-store.cjs` without changing storage wire semantics.

Unlike the typesetter bridge, this is not a separately published Docker layer:
the bridge and backend run inside the storage provider's container. The backend
module exports an object implementing the storage operations consumed by the
bridge (`getCatalogue`, `putCatalogue`, `registerOwner`,
`verifyDeletionProof`, `deleteProject`, `getHead`, `getRevision`,
`getObjectStream`, `createObjectUpload`, `commitHead`, and
`migrateLegacyPrefixes`). Set `WS_PORT` for the listening port (default `7060`).
