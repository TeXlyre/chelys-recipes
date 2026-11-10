# Slidev (Typesetter)

Compiles [Slidev](https://sli.dev/) Markdown decks and exposes the engine to
TeXlyre over a local WebSocket compile bridge.

The Docker image layers the Slidev CLI on Playwright's Chromium base with the
shared [Chelys typesetter bridge](../../../bridges/typesetter/1/README.md) and a
Slidev-specific engine adapter (`engine.cjs`).

## Slidev compiles a deck

Slidev builds a Markdown deck rather than an arbitrary document. The adapter
uses the project's main file and falls back to `slides.md` at the project root,
failing with a message that says so rather than a Vite stack trace.

## Preview is PDF, everything else is Export

- **Compile tab**: PDF and Canvas (PDF).
- **Export**: PDF, PowerPoint (PPTX), Images (PNG ZIP), Static site (ZIP).

PPTX and PNG are captured images and the static site is a directory of files,
so none of them can be rendered in the preview pane. PDF, PPTX, and PNG are
rendered with Playwright's bundled Chromium; the static-site build uses Vite
and needs no browser.

## Modes

- **Docker** (recommended): builds an image containing Slidev, Chromium, and
  the bridge.
- **Connect**: point TeXlyre at an existing bridge you run yourself.

## Variables

- `wsPort`: port the compile bridge listens on (default `7044`).
- `npmPackages`: extra themes and addons added into the image, e.g.
  `slidev-theme-penguin slidev-addon-python-runner`.

Changing `npmPackages` means the image no longer matches the published tag, so
Chelys builds it locally instead of pulling.

## Options

- **Export click steps**: one page per click animation instead of one per
  slide.
- **Dark theme**: renders the deck in dark mode.
- **Slide range** (export): slides to export, e.g. `1,4-5,6`.
- **Include PDF outline** (export): adds a table of contents to the PDF.

## Themes

The image installs the default, Seriph, Apple Basic, Bricks, and Shibainu
themes globally and links them into `/workspace/node_modules` so decks resolve
them. There is no per-project install step, so any other theme or addon has to
be in the image: add it with the **Extra themes and addons** variable, which is
appended to the global npm install at build time. Every `@slidev`,
`slidev-theme-`, and `slidev-addon-` package found in the global root is linked
into the workspace, so additions are detected up automatically.

## Incremental sync

`typeConfig.incrementalSync` is enabled. The bridge keeps a per-connection
working tree and reconciles it against the manifest TeXlyre sends with each
request, so only changed files are transferred after the first compile. The
tree is discarded when the socket closes or when TeXlyre requests a cache
clear.
