# Quarto (Typesetter)

Renders [Quarto](https://quarto.org/) `.qmd` documents and exposes the engine to
TeXlyre over a local WebSocket compile bridge.

The Docker image layers TeX Live, the Quarto CLI, and its Python and R
execution stacks with the shared
[Chelys typesetter bridge](../../../bridges/typesetter/1/README.md) and a Quarto-specific
engine adapter (`engine.cjs`). Pandoc and Typst are packaged inside Quarto itself, so
the `pdf` format renders through LaTeX while `typst` uses the bundled Typst
binary.

## Files and projects

The adapter runs `quarto render` on the main file, which works both standalone
and inside a project. Outside a project it passes `--output` so the artifact
lands at a known path. Inside a project (`_quarto.yml` or `_quarto.yaml`) Quarto
owns output placement, so the adapter instead locates the newest matching
artifact after the render, skipping `.cache` and `_freeze`.

## Preview is PDF, everything else is Export

- **Compile tab**: PDF, Canvas (PDF), and PDF (Typst).
- **Export**: PDF, PDF (Typst), Beamer, HTML, reveal.js, DOCX, PPTX, EPUB.

HTML and reveal.js are rendered with `embed-resources`, so each download is one
self-contained file rather than a directory of assets.

## Execution

Code cells run by default. The image includes:

- a Python virtualenv with the Jupyter stack, matplotlib, pandas, numpy, plotly,
  and tabulate, wired up through `QUARTO_PYTHON`
- Chromium, wired up through `QUARTO_CHROMIUM`, for diagram rendering

R is opt-in. An R project's package set is specific to that project, so baking a
fixed selection into every image costs several hundred megabytes for something
that rarely matches; **Include R and knitr** adds R with knitr, rmarkdown, and
jsonlite, and **Extra R packages** takes apt `r-cran-*` names on top.
**Extra Python packages** does the same for pip.

Turn **Execute code cells** off while drafting prose; it is much faster, and
cached results are reused unless **Refresh execution cache** is set.

## Modes

- **Docker** (recommended): builds an image containing TeX Live, Quarto, the
  execution stacks, and the bridge.
- **Connect**: point TeXlyre at an existing bridge you run yourself.

## Variables

- `wsPort`: port the compile bridge listens on (default `7049`).
- `pythonPackages`: extra pip packages baked into the image, e.g.
  `scikit-learn seaborn`.
- `includeR`: adds R with knitr and rmarkdown. Off by default.
- `rPackages`: extra apt `r-cran-*` packages, e.g. `r-cran-ggplot2 r-cran-dplyr`.

The published tag is built from the defaults, so any of these three means
Chelys builds the image locally instead of pulling it.

## Options

- **Execute code cells**: passes `--no-execute` when off.
- **Refresh execution cache** (export): passes `--cache-refresh`.
- **Profile**: optional Quarto profile name passed through `--profile`.
- **Include log file**: export the render log alongside the artifact.

## Performance

This is a heavy recipe, though less so than it looks: the base is the same
`texlive/texlive:latest-full` used by the TeX Live, ConTeXt, PreTeXt, and Sphinx
recipes, so Docker shares those layers with any of them you already have
installed. A first render that executes a notebook can take minutes, so
`ENGINE_TIMEOUT` is raised to 15 minutes.

`typeConfig.incrementalSync` is enabled: the bridge keeps a per-connection
working tree, so only changed files transfer after the first render and Quarto's
freeze cache survives between renders. Clearing the cache discards both and the
next render starts from the beginning.