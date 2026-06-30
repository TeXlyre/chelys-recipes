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
│   ├── icon.svg     # Optional: version specific icon
│   └── Dockerfile
├── icon.svg         # Optional: shared across versions
└── README.md
```

The build picks the highest semver folder as the latest and exposes every
version in the API entry's `versions` array (newest first). A recipe folder is
treated as versioned when it contains `x.y.z` sub-folders with a `recipe.json`;
otherwise the flat `recipe.json` is used.

- `<type>` must match a category `id` in `categories.yml` (currently `lsp`).
- `<recipe-id>` must use lowercase letters, numbers, and hyphens only, and must
  equal the manifest's `id` (the version folder name is not the id).

## Manifest Requirements

Required fields: `id`, `type`, `name`, `description`, `tags`, `author`,
`version`, `lastUpdated`, `env`, `modes`, `typeConfig`.

- `version` must follow semantic versioning (`x.y.z`).
- `description` should be at least twenty characters.
- `modes` must contain at least one of `system`, `docker`, or `connect`.
- A `system` mode requires a `runCommand`; a `docker` mode requires an `image`.
- A `system` mode may declare optional `uninstallSteps` (same shape as
  `installSteps`) that Chelys runs when uninstalling. Docker images are removed
  by name, so no extra fields are needed for docker uninstall.

## Variables

Declare GUI-settable inputs under `variables`. Each needs a `key`, `label`, and
`kind` (`text`, `number`, `boolean`, or `select`). `select` variables must list
`options`. Reference them anywhere with `${key}` since they are substituted into run
arguments, Docker run args, environment values, the Dockerfile, `transportUrl`,
and `clientConfig` on every install and run.

## Dockerfiles

If a docker mode sets `dockerfileUrl`, place the corresponding `Dockerfile`
beside `recipe.json`. Chelys fetches it, applies variable substitution, writes
it to disk, and runs `docker build`. The `Dockerfile` may use `${key}`
placeholders too.

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
