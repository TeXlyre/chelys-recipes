# Harper LS

Harper LS (`harper-ls`) is an offline, privacy-first grammar and spelling
checker exposed as a Language Server. It works well for prose-heavy formats such
as TeX, LaTeX, Typst, BibTeX, Markdown, and plain text. Chelys connects to it
over a WebSocket proxy (`lsp-ws-proxy`).

This recipe maps all supported file types to the `markdown` language ID so
Harper LS treats them consistently as prose.

## Variables

| Key | Description | Default |
| --- | --- | --- |
| `wsPort` | Port the WebSocket proxy listens on | `7000` |
| `dialect` | Spelling dialect Harper checks against | `American` |

## Modes

- **System**: installs `harper-ls` and `lsp-ws-proxy` via Cargo (requires the
  Rust toolchain) and runs the proxy against `harper-ls --stdio`. The Cargo
  pipeline is identical on Linux, macOS, and Windows, so no per-OS override is
  needed.
- **Docker**: builds `harper-ls` and the proxy from source in a multi-stage
  image (`Dockerfile`) and publishes `${wsPort}`. No host toolchain needed.
- **Connect**: attach to a Harper server already listening on `${wsPort}`.

## Notes

- If you change `wsPort`, the run command, Docker port mapping, Dockerfile, and
  the injected `transportUrl` all update together.
- Harper provides diagnostics and code actions such as ignoring rules or adding
  words to a dictionary. Dictionary edits are functional but not yet stable in
  TeXlyre.
