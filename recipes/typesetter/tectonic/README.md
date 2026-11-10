# Tectonic (Typesetter)

Compiles LaTeX `.tex` documents to PDF with
[Tectonic](https://tectonic-typesetting.github.io/), a modern XeTeX-derived
engine that automatically obtains the TeX support files it needs.

The Docker image layers the Tectonic release binary with the shared
[Chelys typesetter bridge](../../../bridges/typesetter/1/README.md) and a small engine
adapter (`engine.cjs`). The adapter uses Tectonic's V2 `-X compile` command and
returns the generated PDF and SyncTeX data to TeXlyre.

## Versions

| Version | Tectonic | Image |
| --- | --- | --- |
| `0.17.0` | 0.17.0 | `ghcr.io/texlyre/chelys-recipe-tectonic:0.17.0` |

The Dockerfile pins the release through `ARG TECTONIC_VERSION`. It downloads
the upstream static musl binary for x86-64 or ARM64 so the runtime does not need
the native library stack required to build Tectonic from source.

## Support bundle and cache

Tectonic downloads its support bundle on the first compile and caches the files
it needs. The image sets `TECTONIC_CACHE_DIR` under `/workspace/.cache` so the
cache remains available for subsequent compiles in the same container.

Noto fonts, including CJK and colour emoji, are installed for documents that
use system fonts through the XeTeX-derived engine.

## Modes

- **Docker** (recommended): builds an image containing Tectonic and the bridge.
- **Connect**: point TeXlyre at an existing compatible compile bridge.

## Variables

- `wsPort`: port the compile bridge listens on (default `7046`).

## SyncTeX

The adapter passes `--synctex` and returns the generated `.synctex.gz` beside
the PDF as a downloadable artifact for forward and reverse search in TeXlyre.

## Incremental sync

`typeConfig.incrementalSync` is enabled. The bridge keeps a per-connection
working tree and reconciles it against the manifest TeXlyre sends with each
request, so only changed files are transferred after the first compile. The
tree is discarded when the socket closes or when TeXlyre requests a cache
clear.
