# Chelys typesetter bridge

Shared implementation of the TeXlyre typesetter WebSocket protocol. Typesetter
recipes copy it in  the same way LSP recipes reuse
`lsp-ws-proxy`.

## Usage

```dockerfile
FROM ghcr.io/texlyre/chelys-typeset-bridge:1 AS bridge

FROM <your-engine-image>
COPY --from=bridge /opt/chelys /opt/chelys

ENV WS_PORT=7040
ENV ENGINE_CMD=sile
ENV ENGINE_ARGS='-o ${output} ${mainFile}'
ENV ENGINE_OUTPUT=output.pdf
ENV ENGINE_MIME=application/pdf

WORKDIR /workspace
EXPOSE 7040
ENTRYPOINT ["/opt/chelys/bin/node", "/opt/chelys/bridge.cjs"]
```

The base image must be glibc-based (Debian/Ubuntu derived).

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `WS_PORT` | `7040` | Listen port. |
| `CACHE_DIR` | `/workspace/.cache` | Root for per-connection working trees. |
| `ENGINE_TIMEOUT` | `120000` | Per-compile timeout in ms. |
| `ENGINE_CMD` | — | Executable to run. |
| `ENGINE_ARGS` | — | Space-separated, or a JSON array for arguments containing spaces. |
| `ENGINE_OUTPUT` | — | Artifact path the engine writes, relative to the working tree. |
| `ENGINE_MIME` | `application/octet-stream` | MIME type of the artifact. |
| `ENGINE_ADAPTER` | — | Path to a CommonJS module; overrides the `ENGINE_*` variables above. |

`ENGINE_ARGS` and `ENGINE_OUTPUT` support `${mainFile}`, `${output}`,
`${format}`, and `${opt:key}` for any key in the request's `options` object
(populated from the recipe's `ui.compile` / `ui.export` fields).

## Adapter

Engines needing real logic like target selection, multi-pass builds, export a
`compile` function instead:

```js
// engine.cjs
exports.compile = async ({ mainFile, format, options, workDir }) => ({
  status: 0,
  log: '…',
  format,
  mimeType: 'application/pdf',
  outputPath: 'output/main.pdf',
});
```

```dockerfile
COPY engine.cjs /opt/chelys/engine.cjs
ENV ENGINE_ADAPTER=/opt/chelys/engine.cjs
```

`outputPath` is relative to `workDir`. A non-zero `status` returns the log to
TeXlyre without reading any artifacts.

## Protocol

One JSON message per request and one per response  correlated by `requestId`.

Request:

```json
{
  "requestId": "…",
  "mainFile": "main.sil",
  "format": "pdf",
  "options": { "includeLog": false },
  "manifest": [{ "path": "main.sil", "hash": "…" }],
  "files": [{ "path": "main.sil", "content": "<base64>" }]
}
```

Response:

```json
{ "requestId": "…", "status": 0, "log": "…", "format": "pdf",
  "mimeType": "application/pdf", "output": "<base64>" }
```

`options.action === 'clear-cache'` wipes the working tree and returns status 0
without compiling.

### Incremental sync

When `manifest` is present the bridge keeps its working tree between compiles:
it writes `files` (the changed subset), deletes any tracked path absent from
`manifest`, and verifies every manifest entry exists. If any are missing it
replies `status: -2` with `missing: [...]`, and TeXlyre resends the full set
once.

Without `manifest` the bridge wipes and rewrites the tree  (the pre-1 behaviour),
so clients that never send a manifest are unaffected.

Working trees are per-connection and removed on close, which matches TeXlyre's
client-side reset of its sent-hash map when the socket drops for p2p file sync. A recipe advertising
`typeConfig.incrementalSync: true` must pin this image.
