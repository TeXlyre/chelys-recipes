# JabRef LSP

JabRef's language server (`jabls`) provides BibTeX/BibLaTeX integrity
diagnostics for `.bib` files, surfacing consistency, citation-key, and
formatting problems as you edit.

Unlike the other LSP recipes here, `jabls` does **not** speak LSP over stdio.
Its only transport is a TCP socket (`--port`). To reach it from TeXlyre over a
WebSocket, this recipe runs `jabls` as a local TCP server and bridges it with
`socat` (stdio ⇄ TCP) behind `lsp-ws-proxy` (WebSocket ⇄ stdio):

```
TeXlyre  ⇄ WebSocket ⇄  lsp-ws-proxy  ⇄ stdio ⇄  socat  ⇄ TCP ⇄  jabls -p 2087
```

The server is the same component that powers JabRef's official VS Code
extension; here it is run standalone and bridged to TeXlyre.

## Variables

| Key | Description | Default |
| --- | --- | --- |
| `wsPort` | Port the WebSocket proxy listens on | `7021` |

The internal `jabls` TCP port is fixed at `2087` inside the container and is not
exposed; only `wsPort` is user-facing.

## Modes

- **Docker** (recommended): builds a self-contained image (`Dockerfile`)
  bundling Java 21, JBang, `socat`, and the proxy. The entrypoint starts
  `jabls` on the internal TCP port, waits for it, then serves the bridge on
  `${wsPort}`. No host toolchain needed.
- **System**: starts `jabls` as a background TCP server and bridges it via
  `socat` + `lsp-ws-proxy` in a single run command. Requires Java 21, JBang,
  `socat`, and `cargo` on the host.
- **Connect**: attach to a bridge already listening on `${wsPort}`.

## Notes

- `jabls` is run from JabRef's `JabLsLauncher.java` directly from GitHub via
  JBang; the source is registered with `jbang trust add` so it runs
  non-interactively. The first run downloads and compiles it.
- Changing `wsPort` updates the run command, Docker port mapping, and the
  `transportUrl` Chelys injects into TeXlyre. The internal TCP port is constant.
- Diagnostics are read-only integrity checks; the server does not modify your
  `.bib` files.
- Because `jabls` uses TCP rather than stdio, `socat` is a required dependency
  in both Docker and system modes.
