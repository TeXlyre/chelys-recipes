# Chelys Recipes

Plugin recipes for [Chelys](https://github.com/TeXlyre/chelys), the local
process host that installs and runs language servers and tools for TeXlyre.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A recipe is a self-describing JSON manifest hosted on GitHub Pages. Chelys
fetches the registry index, lets you install a recipe, and runs it without any
application rebuild. Each recipe declares the commands and Dockerfile it needs,
plus a set of **variables** that are editable from the Chelys GUI.

## Features

- Recipes as uploadable data (JSON manifests + Dockerfiles)
- GUI-settable variables (e.g. `language`, `motherTongue`) substituted into
  commands, environment, Dockerfiles, and injected client config
- System, Docker, and Connect install modes per recipe

## Installation

```bash
npm install chelys-recipes
```

## Usage

```javascript
import { recipesApi } from 'chelys-recipes';

// Get every recipe grouped by type
const api = await recipesApi.getRecipes();

// Search recipes
const results = await recipesApi.searchRecipes('grammar');

// Get recipes by type
const servers = await recipesApi.getRecipesByCategory('lsp');

// Fetch a full manifest
const manifest = await recipesApi.getManifest(results[0]);
```

### Configuration Options

```javascript
import { RecipesApiClient } from 'chelys-recipes';

const client = new RecipesApiClient('https://my-custom-url.com');
recipesApi.clearCache();
```

## API Reference

### recipesApi / RecipesApiClient

```javascript
const client = new RecipesApiClient(baseUrl?);
```

Methods:
- `getRecipes(useCache?)`: every recipe grouped by type
- `searchRecipes(query)`: search by name, description, tags, or author
- `getRecipesByCategory(categoryId)`: recipes for a given type
- `getCategories()`: available recipe types
- `getManifest(entry)`: fetch a full recipe manifest
- `clearCache()`: clear the internal cache

### Direct API Access

```javascript
const response = await fetch('https://texlyre.github.io/chelys-recipes/api/recipes.json');
const data = await response.json();
```

API response structure:

```json
{
  "lastUpdated": "2025-06-01T10:00:00Z",
  "version": "1.0.0",
  "categories": [
    {
      "id": "lsp",
      "name": "Language Servers",
      "description": "Language Server Protocol recipes",
      "recipes": [
        {
          "id": "harper-ls",
          "type": "lsp",
          "name": "Harper LS",
          "iconUrl": "https://texlyre.github.io/chelys-recipes/recipes/lsp/harper-ls/icon.svg",
          "description": "Offline grammar and spell checker for Markdown and plain text.",
          "tags": ["grammar", "spell-check"],
          "author": "TeXlyre",
          "version": "1.0.0",
          "lastUpdated": "2025-06-01T10:00:00Z",
          "manifestUrl": "https://texlyre.github.io/chelys-recipes/recipes/lsp/harper-ls/recipe.json"
        }
      ]
    }
  ]
}
```

## Recipe Manifest

Each recipe lives at `recipes/<type>/<recipe-id>/recipe.json` with an optional
`Dockerfile` and `README.md` alongside it. The manifest mirrors the Chelys
`Recipe` shape and adds a `variables` array. Use `${variableKey}` placeholders
anywhere a value should be filled in from the GUI: run arguments, Docker run
args, environment values, the Dockerfile, `transportUrl`, and `clientConfig`.

```json
{
  "id": "example-ls",
  "type": "lsp",
  "name": "Example LS",
  "iconUrl": "icon.svg",
  "description": "A single sentence of 20 to 140 characters, shown on the tool card.",
  "tags": ["example"],
  "author": "You",
  "version": "1.0.0",
  "lastUpdated": "2025-06-01T10:00:00Z",
  "variables": [
    { "key": "wsPort", "label": "WebSocket port", "kind": "number", "default": "7000" }
  ],
  "env": {},
  "modes": [
    {
      "kind": "system",
      "installSteps": [
        { "label": "Install server", "command": "cargo", "args": ["install", "example-ls", "--locked"] }
      ],
      "runCommand": { "command": "lsp-ws-proxy", "args": ["-l", "127.0.0.1:${wsPort}", "--", "example-ls"] }
    },
    { "kind": "connect" }
  ],
  "typeConfig": {
    "configId": "example-ls",
    "fileExtensions": ["tex"],
    "languageIdMap": { "tex": "latex" },
    "transportUrl": "ws://localhost:${wsPort}",
    "contentLength": false,
    "clientConfig": "{\"rootUri\":\"file:///\",\"workspaceFolders\":[]}"
  }
}
```

### Variable kinds

- `text`: free-form string
- `number`: numeric input
- `boolean`: checkbox (substituted as `true` / `false`)
- `select`: fixed choice; requires an `options` array

### Install modes

- `system`: `installSteps` then a long-running `runCommand`
- `docker`: `buildSteps`, an `image`, and either an inline `dockerfile` or a
  `dockerfileUrl` Chelys fetches and writes before `docker build`. Relative
  paths resolve against the manifest, so a `Dockerfile` beside `recipe.json` is
  referenced by name. Files the build copies in are listed in `extraFiles`.
- `connect`: attach to a server already running on the configured port

## Included Recipes

Recipe `description` fields are kept to a single sentence because they are shown
on the tool card in Chelys. Longer background belongs in the manifest `notes`
field and in each recipe's `README.md`.

### Language servers

| Recipe | Inputs | Notes |
| --- | --- | --- |
| **Harper LS** (`lsp/harper-ls`) | Markdown, plain text | Offline and privacy-first, with a configurable English `dialect`. Weak on TeX, LaTeX, Typst, and BibTeX, where LTeX LS Plus is the better fit. |
| **JabRef LSP** (`lsp/jabref-ls`) | `.bib` | Integrity, key, and formatting diagnostics from JabRef's `jabls`. |
| **LTeX LS Plus** (`lsp/ltex-ls-plus`) | LaTeX, Markdown, Typst, BibTeX, AsciiDoc, Quarto, reStructuredText, Org | LanguageTool-backed, with `language` and `motherTongue` options for false-friend detection. |
| **TexLab** (`lsp/texlab`) | `.tex`, `.bib` | Diagnostics, completion, hover, go-to-definition, references, and formatting. Indexes project packages on first open. |
| **Tinymist** (`lsp/tinymist-lsp`) | `.typ` | Diagnostics, completion, hover, go-to-definition, and formatting. |
| **Vale LS** (`lsp/vale-ls`) | Markdown, MDX, reStructuredText, AsciiDoc, HTML, plain text | Configurable editorial style linting with project-specific Vale rules and packages. |

### Typesetters

| Recipe | Inputs | Preview | Exports |
| --- | --- | --- | --- |
| **Asciidoctor** (`typesetter/asciidoctor`) | `.adoc` | PDF | HTML, EPUB, reveal.js, DOCX |
| **ConTeXt LMTX** (`typesetter/context`) | `.tex` | PDF | SyncTeX alongside the PDF |
| **LilyPond** (`typesetter/lilypond`) | `.ly` | PDF | PNG, SVG, MIDI, synthesised MP3 |
| **Org Mode** (`typesetter/org`) | `.org` | PDF | HTML, LaTeX, Markdown |
| **PreTeXt** (`typesetter/pretext`) | `.ptx` | PDF | web and EPUB targets as ZIP |
| **Quarto** (`typesetter/quarto`) | `.qmd` | PDF via LaTeX or Typst | HTML, reveal.js, DOCX, PPTX, EPUB, Beamer |
| **SILE** (`typesetter/sile`) | `.sil` | PDF | — |
| **Slidev** (`typesetter/slidev`) | Markdown | PDF | PPTX, PNG, static site |
| **Sphinx** (`typesetter/sphinx`) | `.rst`, `.md` | PDF | HTML site, EPUB, LaTeX sources as ZIP |
| **Tectonic** (`typesetter/tectonic`) | `.tex` | PDF | SyncTeX alongside the PDF |
| **TeX Live** (`typesetter/texlive`) | `.tex` | PDF | switchable pdfLaTeX, LuaLaTeX, XeLaTeX, pLaTeX, upLaTeX |
| **Tinymist** (`typesetter/tinymist`) | `.typ` | PDF, PDF canvas, SVG canvas | PNG and SVG page bundles, experimental HTML |

### Agents

| Recipe | Agent | Notes |
| --- | --- | --- |
| **Claude Agent** (`acp/claude-agent`) | [`claude-agent-acp`](https://github.com/agentclientprotocol/claude-agent-acp) | Works on the open project through TeXlyre's project tools only; every edit needs the user's approval. Requires an Anthropic API key (set in the recipe's settings or as `ANTHROPIC_API_KEY`) or a Claude login. |

## Icons

An optional `iconUrl` in the manifest is an absolute URL to an icon beside the
recipe directory, shared across its version directories, and is carried through
to the API index.

Icons are third-party works aggregated into this repository, not MIT like the
rest of it. Each keeps its upstream license and carries a notice in the file;
see [`CONTRIBUTING.md#recipe-icons`](CONTRIBUTING.md#recipe-icons) for the per-icon attribution, the
license texts in [`LICENSES/`](LICENSES), and the recipes that have no icon.

## Development

```bash
git clone https://github.com/texlyre/chelys-recipes.git
cd chelys-recipes
npm install
npm run validate     # validate all recipes
npm run build:api    # generate api/recipes.json
npm run build        # build the TypeScript library
npm run pages-example
```

## License

MIT, except for the recipe icons, which are aggregated third-party works under
their own licenses. See [`LICENSE`](LICENSE) and
[`CONTRIBUTING.md#recipe-icons`](CONTRIBUTING.md#recipe-icons).
