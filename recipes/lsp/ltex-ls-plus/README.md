# LTeX LS Plus

Grammar and spell checker for LaTeX, Markdown, Typst, and BibTeX, built on
LanguageTool. Chelys connects to it over a WebSocket proxy (`lsp-ws-proxy`).

## Variables

| Key | Description | Default |
| --- | --- | --- |
| `language` | Primary language LanguageTool checks against | `en-US` |
| `motherTongue` | Enables false-friend detection; leave blank to disable | _empty_ |
| `wsPort` | Port the WebSocket proxy listens on | `7020` |

These are editable from the Chelys GUI after installing and are re-applied on
every run.

## Modes

- **System**: downloads LTeX LS Plus, installs `lsp-ws-proxy` via Cargo, and
  runs the proxy against `ltex-ls-plus`. Requires Java 21. Per-OS pipelines
  fetch the correct archive (`linux-x64`/`macos-x64` tarballs, `windows-x64`
  zip) and run the matching launcher (`bin/ltex-ls-plus` or
  `bin/ltex-ls-plus.bat` on Windows).
- **Docker**: builds a self-contained image (`Dockerfile`) bundling Java 21 and
  the proxy, publishing `${wsPort}`.
- **Connect**: attach to an LTeX server already listening on `${wsPort}`.

## Notes

- If your default `java` is older than 21, set `JAVA_HOME` in the recipe
  environment for system mode.
- Changing `wsPort` updates the run command, Docker port mapping, Dockerfile,
  and the `transportUrl` Chelys injects into TeXlyre.
