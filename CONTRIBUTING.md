# Contributing to Chelys Recipes

This guide explains how to add a recipe
that Chelys can install and run for [TeXlyre](https://texlyre.github.io/texlyre/).

## Recipe Structure

A recipe can use a single flat layout or a versioned layout. The flat layout
holds one version:

```
recipes/<type>/<recipe-id>/
├── recipe.json     # Required: the recipe manifest
├── Dockerfile      # Optional: referenced by a docker mode's dockerfileUrl
└── README.md       # Recommended: install and run notes
```

The versioned layout keeps each version in its own `x.y.z` sub-folder, letting
Chelys offer version selection and detect updates:

```
recipes/<type>/<recipe-id>/
├── 18.7.0/
│   ├── recipe.json
│   └── Dockerfile
├── 18.6.0/
│   ├── recipe.json
│   └── Dockerfile
├── icon.svg         # Optional: shared across versions
└── README.md
```

A recipe's `iconUrl` is an absolute URL pointing at the recipe folder, not the
version folder, so icons live alongside `README.md` and are shared by every
version. Icons keep their upstream license rather than this repository's; see
[`CONTRIBUTING.md#recipe-icons`](CONTRIBUTING.md#recipe-icons) for the format, size, notice, and
attribution requirements.

The build picks the highest semver folder as the latest and exposes every
version in the API entry's `versions` array (newest first). A recipe folder is
treated as versioned when it contains `x.y.z` sub-folders with a `recipe.json`;
otherwise the flat `recipe.json` is used.

- `<type>` must match a category `id` in `categories.yml` (currently `lsp`,
  `typesetter`, and `acp`).
- `<recipe-id>` must use lowercase letters, numbers, and hyphens only, and must
  equal the manifest's `id` (the version folder name is not the id).

## Manifest Requirements

Required fields: `id`, `type`, `name`, `description`, `tags`, `author`,
`version`, `lastUpdated`, `env`, `modes`, `typeConfig`.

- `version` must follow semantic versioning (`x.y.z`).
- `description` must be a single sentence of 20 to 140 characters. It is shown
  on the tool card in Chelys; put longer background in `notes` and in the
  recipe's `README.md`.
- `modes` must contain at least one of `system`, `docker`, or `connect`.
- A `system` mode requires a `runCommand`; a `docker` mode requires an `image`.
- A `system` mode may declare optional `uninstallSteps` (same shape as
  `installSteps`) that Chelys runs when uninstalling. Docker images are removed
  by name, so no extra fields are needed for docker uninstall.
- A `docker` mode may declare `volumes`, a list of `{ "id", "target" }`, for
  data that should survive restarts. Chelys names each volume after the recipe
  and the `id` (`chelys-<recipe>-<id>`) and mounts it at `target`.

## Dockerfiles

Pin every upstream artefact through a build argument rather than a literal, so a
new version directory is a copy plus one edited default:

```dockerfile
ARG LTEX_VERSION=18.7.0
```

The default must match the version directory the Dockerfile sits in, since the
publish workflow builds without passing `--build-arg`. Values needed at run time
as well as build time need a matching `ENV`, because `ARG` is not available to
the entrypoint:

```dockerfile
ARG LTEX_VERSION=18.7.0
ENV LTEX_HOME=/opt/ltex-ls-plus-${LTEX_VERSION}
```

A docker mode's `dockerfileUrl` is resolved against the manifest, so it is just
`Dockerfile` when the file sits beside `recipe.json`. Use an absolute URL only
when it does not. Chelys fetches it, applies `${key}` substitution, writes it to
disk, and runs `docker build`.

Anything the `Dockerfile` copies in must be listed in `extraFiles`, since that
is what puts it in the build context:

```dockerfile
COPY engine.cjs /opt/chelys/engine.cjs
```

```json
"extraFiles": ["engine.cjs"]
```

## Variables

Declare GUI-settable inputs under `variables`. Each needs a `key`, `label`, and
`kind` (`text`, `number`, `boolean`, `select`, or `secret`). `select` variables must list
`options`. Reference them anywhere with `${key}` since they are substituted into run
arguments, Docker run args, environment values, the Dockerfile, `transportUrl`,
and `clientConfig` on every install and run.

`secret` variables are for API keys and the like. Chelys masks them, leaves them
out of downloaded recipes, and substitutes them only into `env`, so they can't
end up in logged commands or in the config TeXlyre receives. Use one only as a
whole env value with no default, e.g. `"env": {"API_KEY": "${apiKey}"}`. When it
is left empty, the env entry is dropped and the variable from Chelys's own
environment applies.

## Agent recipes

Agent recipes (type `acp`) run the agent behind `texlyre-acp-bridge.cjs`, which
gives it TeXlyre's project tools over the same connection. The canonical bridge
lives in [`acp-bridge/1/`](acp-bridge/1/README.md); since a recipe can only ship
files from its own version directory, each agent recipe keeps a copy beside its
`recipe.json` and lists it in `extraFiles`. The validator fails when a copy
differs from the canonical one, and `npm run sync:acp-bridge` refreshes every
copy after the bridge changes.

Agent options, such as limiting the agent to TeXlyre's tools, go in a JSON file
beside the bridge, listed in `extraFiles` and passed to it with
`--session-meta <file>`. The bridge sends them with every new session and drops
whatever options and MCP servers the client asks for, so whoever reaches the
WebSocket can't lift the restrictions. `typeConfig.sessionMeta` is sent by
TeXlyre instead, so the bridge ignores it, and the validator warns when a
bridged recipe sets it.

## Validation

Run the validator before opening a pull request:

```bash
npm install
npm run validate
```

Fix any reported errors. Warnings are advisory but worth addressing.

## Submitting

1. Add your recipe directory under `recipes/<type>/`.
2. Ensure `npm run validate` passes.
3. Open a pull request. The build workflow regenerates `api/recipes.json` and
   deploys to GitHub Pages on merge to `main`.

# Recipe Icons

Icons live at `recipes/<type>/<recipe-id>/icon.{svg,png}` and are referenced by
an absolute `iconUrl` in `recipe.json`. They are shared across every version
directory of a recipe.

The repository's own code and manifests are MIT. Icons are not: each one is an
aggregated third-party work that keeps its upstream license, recorded below and
in a notice inside the file itself (an XML comment for SVG, the `Copyright`
text chunk for PNG). Aggregation under GPLv3 section 5 does not extend those
terms to anything else here.

Marks remain the trademarks of their respective owners regardless of the
copyright license. They identify the tool each recipe installs and imply no
affiliation or endorsement.

## Included

| Recipe | File | Upstream | License |
| --- | --- | --- | --- |
| `lsp/harper-ls` | `icon.svg` | [Automattic/harper](https://github.com/Automattic/harper) `logo.svg` | Apache-2.0 |
| `lsp/jabref-ls` | `icon.svg` | [JabRef/jabref](https://github.com/JabRef/jabref) | MIT |
| `lsp/ltex-ls-plus` | `icon.svg` | [ltex-plus/ltex-ls-plus](https://github.com/ltex-plus/ltex-ls-plus) | MPL-2.0 |
| `lsp/texlab` | `icon.png` | [latex-lsp/texlab](https://github.com/latex-lsp/texlab) | GPL-3.0 |
| `lsp/tinymist-lsp` | `icon.png` | [Myriad-Dreamin/tinymist](https://github.com/Myriad-Dreamin/tinymist) `editors/vscode/icons/ti-white.png` | Apache-2.0 |
| `typesetter/asciidoctor` | `icon.svg` | [asciidoctor/brand](https://github.com/asciidoctor/brand) `logo/icon/logo-fill-color.svg` | MIT, with explicit usage grant in the brand README |
| `typesetter/lilypond` | `icon.png` | [lilypond/lilypond](https://github.com/lilypond/lilypond) `Documentation/pictures/double-lily-modified3.png`, cropped square | GPL-3.0 |
| `typesetter/org` | `icon.svg` | [simple-icons/simple-icons](https://github.com/simple-icons/simple-icons) `icons/org.svg` | CC0-1.0 |
| `typesetter/sile` | `icon.svg` | [sile-typesetter/sile](https://github.com/sile-typesetter/sile) `documentation/sile-logo.pdf`, glyph extracted to SVG | MIT |
| `typesetter/slidev` | `icon.svg` | [slidevjs/slidev](https://github.com/slidevjs/slidev) | MIT |
| `typesetter/sphinx` | `icon.svg` | [sphinx-doc/sphinx](https://github.com/sphinx-doc/sphinx) `doc/_static/favicon.svg` | BSD-2-Clause |
| `typesetter/tinymist` | `icon.png` | [Myriad-Dreamin/tinymist](https://github.com/Myriad-Dreamin/tinymist) `editors/vscode/icons/ti-white.png` | Apache-2.0 |

## Excluded

These recipes are included without an icon. Chelys falls back to a generic recipe icon.

| Recipe | Reason |
| --- | --- |
| `acp/claude-agent` | the Claude and Anthropic marks are published without a copyright license for redistribution |
| `lsp/vale-ls` | no icon is bundled without a clear upstream redistribution grant; Chelys falls back to the generic recipe icon |
| `typesetter/context` | ConTeXt's code is GPLv2, incompatible with the GPLv3 texts here, and its documentation and branding are CC BY-NC-SA, whose NonCommercial clause rules out redistribution |
| `typesetter/pretext` | PreTeXt is GPL-3.0, so the license is not the obstacle; no logo is published in a locatable form |
| `typesetter/quarto` | Posit trademark, published without any copyright license |
| `typesetter/tectonic` | no icon is bundled without a clear upstream redistribution grant; Chelys falls back to the generic recipe icon |
| `typesetter/texlive` | the TeX Live mark contains Duane Bibby's lion, licensed to TUG only, with no public grant |

## Adding an icon

The license must be one that permits redistribution. Copyleft is acceptable,
since icons are aggregated rather than linked; a bare trademark with no
copyright grant is not.

Prefer SVG. Use PNG only when the upstream project publishes no vector form, at
96 to 128 px square. Optimise with `svgo --multipass` or an equivalent PNG
optimiser and keep the file under about 4 KB.

Then embed a notice naming the copyright holder and license:

```xml
<!-- SILE logo, Copyright (c) Simon Cozens, Caleb Maclennan. Licensed under MIT. See LICENSE -->
```

```bash
convert icon.png -set Copyright "<notice>" icon.png
```

Add the license text to `LICENSES/` if it is not already there, and add a row to the table above.
