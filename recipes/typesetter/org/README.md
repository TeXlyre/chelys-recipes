# Org Mode (Typesetter)

Exports [Org Mode](https://orgmode.org/) `.org` documents with GNU Emacs and
exposes the workflow to TeXlyre over a local WebSocket compile bridge.

The Docker image layers GNU Emacs and Org 9.8.7 on the same
`texlive/texlive:latest-full` base used by the TeX Live and Sphinx recipes, then
adds the shared [Chelys typesetter bridge](../../../bridges/typesetter/1/README.md) and an
Org-specific engine adapter (`engine.cjs`). Org itself is pinned from GNU ELPA
instead of relying on the older version bundled by the distribution's Emacs.

## PDF through Org and TeX Live

PDF preview is a two-stage build. Emacs first exports the selected `.org` file
to `chelys-output.tex` with Org's `ox-latex` backend, then `latexmk` compiles that
file with the selected engine:

- pdfLaTeX
- LuaLaTeX
- XeLaTeX

Because the image contains TeX Live full, the generated LaTeX can use the same
package set as the TeX Live recipe. `latexmk` also handles the normal multi-pass
bibliography and cross-reference workflow, including BibTeX and Biber when the
exported document requires them.

## Preview is PDF, everything else is Export

- **Compile tab**: PDF and Canvas (PDF).
- **Export**: PDF, HTML, LaTeX, Markdown.

HTML is Org's normal `ox-html` output. Local images and other linked assets remains
as relative references instead of being embedded into the HTML file. LaTeX and
Markdown are source exports and are therefore download-only (export).

## Babel execution

Org can evaluate source blocks while exporting. That is useful for literate
programming and computational notebooks, as wellas executing document-provided
code. The recipe therefore leaves **Evaluate Babel blocks** disabled by default.
When enabled, Org stops prompting and evaluates blocks using whatever language
runtimes are available inside the container. Only enable it for trusted
projects.

## Language tooling

The LTeX LS Plus recipe maps `.org` files to the `org` language ID, so Org
projects can use its grammar and spell checking alongside this typesetter.

## Modes

- **Docker** (recommended): builds an image containing GNU Emacs, Org 9.8.7,
  TeX Live full, `latexmk`, and the bridge.
- **Connect**: point TeXlyre at an existing Org compile bridge you run yourself.

## Variables

- `wsPort`: port the compile bridge listens on (default `7049`).

## Options

- **LaTeX Engine**: pdfLaTeX, LuaLaTeX, or XeLaTeX for PDF builds and LaTeX exports.
- **Evaluate Babel blocks**: executes Org source blocks during export (disabled by default).
- **Include log file**: available from Export through the normal compile bridge
  artifact handling.

Document-specific Org export settings such as `#+OPTIONS`, `#+LATEX_CLASS`,
`#+LATEX_HEADER`, bibliography declarations, and HTML metadata remain in the Org
file and are handled by the corresponding Org export backend.

## Incremental sync

`typeConfig.incrementalSync` is enabled. The bridge keeps a per-connection
working tree and reconciles it against the manifest TeXlyre sends with each
request, so only changed files transfer after the first compile. Org's generated
LaTeX and `latexmk` auxiliary files remain in that working tree and can be reused
between builds. The tree is discarded when the socket closes or when TeXlyre
requests a cache clear.
