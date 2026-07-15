# PreTeXt (Typesetter)

Builds [PreTeXt](https://pretextbook.org/) `.ptx` projects and exposes the engine to TeXlyre over a local WebSocket compile bridge.

The Docker image layers TeX Live, a PreTeXt virtualenv, and the shared [Chelys typesetter bridge](../../../bridge/1/README.md) with a PreTeXt-specific engine adapter (`engine.cjs`).

## PreTeXt builds projects

Unlike SILE or ConTeXt, PreTeXt operates on a **project manifest**, rather than a source file. The project root must contain `project.ptx` declaring named targets, each with a format (`html`, `pdf`, `latex`, `epub`, `braille`) and an output directory. `pretext new book` scaffolds the standard layout:

```
project.ptx
source/main.ptx
publication/publication.ptx
```

The adapter reads `project.ptx`, selects the target matching the requested format  oor the one named in the **Target** field and runs `pretext build <target>`. If there's no `project.ptx`, the compile fails with a message saying so rather than a PreTeXt stack trace.

## Preview is PDF, everything else is Export

- **Compile tab**: PDF and Canvas (PDF), from the first `pdf` target.
- **Export**: PDF, Web site (ZIP), EPUB (ZIP).

The `html` and `epub` targets produce a *directory* of cross-linked files like pages, CSS, Runestone JS, generated images, and one file per knowl. That can't be rendered in the preview pane, so the adapter zips the target's output directory and returns it as a download.

## Modes

- **Docker** (recommended): builds an image containing TeX Live, PreTeXt and the bridge.
- **Connect**: point TeXlyre at an existing bridge you run yourself.

## Variables

- `wsPort`: port the compile bridge listens on (default `7041`).

## Options

- **Target**: a `project.ptx` target name. Blank picks the first target of the requested format.
- **Generate assets**: adds `-g`, running `latex-image`, Asymptote and Sage generation before the build. Slow; needed after changing any generated figure.
- **Include PreTeXt log**: export the build log alongside the artifact.

## Performance

This is a heavy recipe. The image carries TeX Live full plus a PreTeXt virtualenv, and a first textbook build can take minutes, so `ENGINE_TIMEOUT` is raised to 15 minutes.

`typeConfig.incrementalSync` is enabled, which is more important more here than for lighter engines: the bridge keeps a per-connection working tree, so only changed files transfer after the first compile, and PreTeXt's generated assets under `output/` survive between builds. Clearing the cache discards both and the next build starts from the beginning.
