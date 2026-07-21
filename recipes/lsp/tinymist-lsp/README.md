# Tinymist (Typst)

Tinymist is an integrated language service for Typst. It provides diagnostics,
autocompletion, hover, go-to-definition, document symbols, and formatting for
`.typ` files. It speaks LSP over stdio, so Chelys connects to it through a
WebSocket proxy (`lsp-ws-proxy`):

```
TeXlyre  ⇄ WebSocket ⇄  lsp-ws-proxy  ⇄ stdio ⇄  tinymist lsp
```

## Variables

| Key | Description | Default |
| --- | --- | --- |
| `wsPort` | Port the WebSocket proxy listens on | `7030` |

Editable from the Chelys GUI after installing and re-applied on every run.

## Modes

- **System**: builds `tinymist` and `lsp-ws-proxy` from source with `cargo`
  (requires the Rust toolchain) and runs the proxy against `tinymist lsp`.
- **Docker**: builds a self-contained image (`Dockerfile`) that compiles
  `tinymist` from source and bundles the proxy, publishing `${wsPort}`. No host
  toolchain needed.
- **Connect**: attach to a proxy already listening on `${wsPort}`.

## Notes

- The first build compiles `tinymist` from source and can take several minutes.
  To pin a version, replace the `cargo install --git ...` target with a tagged
  ref or use a published release binary instead.
- Changing `wsPort` updates the run command, Docker port mapping, Dockerfile,
  and the `transportUrl` Chelys injects into TeXlyre.
- The Docker image installs DejaVu and Liberation fonts so Typst has fonts
  available; add more font packages to the image if your documents need them.
- Tinymist also offers preview and tracing servers; this recipe runs only the
  language server (`tinymist lsp`).
