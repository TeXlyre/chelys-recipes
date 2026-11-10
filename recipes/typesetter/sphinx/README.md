# Sphinx (Typesetter)

Builds [Sphinx](https://www.sphinx-doc.org/) projects written in
reStructuredText or MyST Markdown and exposes the engine to TeXlyre over a local
WebSocket compile bridge.

The Docker image layers TeX Live, a Sphinx virtualenv, and the shared
[Chelys typesetter bridge](../../../bridges/typesetter/1/README.md) with a Sphinx-specific
engine adapter (`engine.cjs`). It uses the same `texlive/texlive:latest-full`
base as the TeX Live recipe, because PDF output goes through the `latex` builder
and `latexmk`.

## Sphinx builds projects

Like PreTeXt, Sphinx operates on a configured project rather than a source file.
A `conf.py` must exist at the project root or in `source/`, `doc/`, `docs/`, or
`docs/source/`; `sphinx-quickstart` scaffolds the standard layout. The adapter
resolves that directory, or uses the one named in the **Source Directory**
field, and runs `sphinx-build -M <builder>` into `_build/chelys`. If no `conf.py`
is found the compile fails with a message saying so rather than a Python
traceback.

## Preview is PDF, everything else is Export

- **Compile tab**: PDF and Canvas (PDF), via the `latexpdf` builder.
- **Export**: PDF, Web site (ZIP), EPUB, LaTeX sources (ZIP).

The `html` and `latex` builders produce a *directory* of cross-linked files, so
the adapter zips the builder's output directory and returns it as a download.

## Markdown and notebooks

`myst-parser` and `myst-nb` are installed, so `.md` and `.ipynb` sources build
alongside `.rst` once the extensions are enabled in `conf.py`. Pandoc is present
for `nbsphinx`, and `ipykernel` and `matplotlib` are available for notebooks
that execute at build time.

## Bundled extensions

- Themes: Read the Docs, Furo, PyData, Sphinx Book
- `sphinxcontrib-bibtex` for BibTeX citations
- `sphinxcontrib-plantuml` with a headless JRE, plus Graphviz for
  `sphinx.ext.graphviz`
- `sphinxcontrib-mermaid` and `sphinxcontrib-svg2pdfconverter`
- `sphinx-copybutton`, `sphinx-design`, `sphinx-tabs`, `sphinx-togglebutton`
- `sphinx-autodoc-typehints` for API documentation

There is no per-project install step, so anything else a project imports has to
be in the image. Add it with the **Extra Python packages** variable rather than
forking the recipe; it is appended to the pip install when the image is built.

## Modes

- **Docker** (recommended): builds an image containing TeX Live, Sphinx, and the
  bridge.
- **Connect**: point TeXlyre at an existing bridge you run yourself.

## Variables

- `wsPort`: port the compile bridge listens on (default `7048`).
- `pythonPackages`: extra pip packages added into the image, e.g.
  `sphinx-gallery sphinxcontrib-katex`.

Changing `pythonPackages` means the image no longer matches the published tag,
so Chelys builds it locally instead of pulling.

## Options

- **Source Directory**: directory containing `conf.py`. Blank auto-detects.
- **Nitpicky mode**: `-n`, warning about every missing cross-reference target.
- **Rebuild from scratch**: `-E`, discarding the cached environment. Needed
  after `conf.py` changes.
- **Treat warnings as errors** (export): `-W --keep-going`.
- **Include log file**: export the build log alongside the artifact.

Parallel builds (`-j auto`) are on by default.

## Performance

This is a heavy recipe. The image carries TeX Live full plus a Sphinx
virtualenv, and a first build of a large project can take minutes, so
`ENGINE_TIMEOUT` is raised to 15 minutes.

`typeConfig.incrementalSync` is enabled, which matters more here than for
lighter engines: the bridge keeps a per-connection working tree, so only changed
files transfer after the first compile, and Sphinx's doctree cache under
`_build/` survives between builds. Clearing the cache discards both and the next
build starts from the beginning.
