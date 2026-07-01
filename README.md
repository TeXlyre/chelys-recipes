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
          "description": "Offline grammar and spelling checker.",
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
  "description": "A short description of at least twenty characters.",
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
  `dockerfileUrl` Chelys fetches and writes before `docker build`
- `connect`: attach to a server already running on the configured port

## Included Recipes

- **LTeX LS Plus** (`recipes/lsp/ltex-ls-plus`): LanguageTool grammar and spell
  checker with `language` and `motherTongue` options.
- **Harper LS** (`recipes/lsp/harper-ls`): offline, privacy-first grammar and
  spelling checker with a configurable English `dialect`.

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

MIT
