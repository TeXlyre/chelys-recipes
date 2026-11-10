# Tinymist (Typesetter)

Compiles [Typst](https://typst.app/) `.typ` documents and exposes the engine to
TeXlyre over a local WebSocket compile bridge.

The Docker image reuses the same Tinymist binary as the
[Tinymist LSP recipe](../../lsp/tinymist-lsp/README.md), layered with the
shared [Chelys typesetter bridge](../../../bridges/typesetter/1/README.md) and a
Tinymist-specific engine adapter (`engine.cjs`). The adapter drives
`tinymist compile`, which is a drop-in for `typst compile`.

## Render targets

- **PDF** and **Canvas (PDF)** both produce a PDF.
- **Canvas (SVG)** produces Typst's native SVG output for a fast vector canvas.

PDF output supports PDF standards (1.7, 2.0, PDF/A-2b, PDF/A-3b, PDF/UA-1) and
tagged PDF for accessibility, grouped under the PDF options and shown only when
a PDF target is selected.

## Export formats

- **PDF**, with the same standard and tagging options.
- **SVG**, either one combined file or each page as a separate SVG in a ZIP.
- **Images (PNG ZIP)**, always per page, at the chosen resolution.
- **HTML (experimental)**: Typst's HTML target is still incomplete and sits
  behind a feature flag, so it is download-only and runs with
  `TYPST_FEATURES=html` set.

## Modes

- **Docker** (recommended): builds an image containing Tinymist and the bridge.
- **Connect**: point TeXlyre at an existing bridge you run yourself.

## Variables

- `wsPort`: port the compile bridge listens on (default `7046`).

## Notes

- The image installs Noto fonts for broad script coverage; add more font
  packages if your documents need them.
- `typeConfig` declares `typstyle` as the formatter and enables the outline,
  both served by the Typst tooling in the image.

## Incremental sync

`typeConfig.incrementalSync` is enabled. The bridge keeps a per-connection
working tree and reconciles it against the manifest TeXlyre sends with each
request, so only changed files are transferred after the first compile. The
tree is discarded when the socket closes or when TeXlyre requests a cache
clear.
