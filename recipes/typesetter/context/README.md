# ConTeXt LMTX (Typesetter)

Compiles [ConTeXt](https://www.contextgarden.net/) `.tex` documents to PDF and
exposes the engine to TeXlyre over a local WebSocket compile bridge.

The Docker image uses the same `texlive/texlive:latest-full` base as the TeX
Live recipe, layered with the shared
[Chelys typesetter bridge](../../../bridges/typesetter/1/README.md) and a ConTeXt-specific
engine adapter (`engine.cjs`).

## LuaMetaTeX by default

The `context` command runs LuaMetaTeX; the recipe does not pass `--luatex`, so
this is ConTeXt LMTX rather than MkIV. The image generates the file database
and formats at build time (`mtxrun --generate`, `context --make`) so the first
compile does not pay for it, and `TEXMFCACHE` is world-writable inside the
container.

## Modes

- **Docker** (recommended): builds an image containing ConTeXt and the bridge.
- **Connect**: point TeXlyre at an existing bridge you run yourself.

## Variables

- `wsPort`: port the compile bridge listens on (default `7042`).

## Options

- **Mode**: optional comma-separated ConTeXt mode list.
- **Environment**: optional environment file or comma-separated list.
- **Output Name**: optional job name passed through `--result`.
- **Include log file**: export the build log alongside the PDF.

## SyncTeX

The adapter enables `--synctex=repeat` so the emitted SyncTeX data is
compatible with standard external consumers, then returns it through the
generic compile-artifact protocol.

## Incremental sync

`typeConfig.incrementalSync` is enabled. The bridge keeps a per-connection
working tree and reconciles it against the manifest TeXlyre sends with each
request, so only changed files are transferred after the first compile. The
tree is discarded when the socket closes or when TeXlyre requests a cache
clear.

Once running, TeXlyre selects this compiler for projects whose type is
`context`.
