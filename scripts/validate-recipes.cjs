// scripts/validate-recipes.cjs
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const { ACP_BRIDGE_FILE, ACP_BRIDGE_SOURCE } = require('./acp-bridge.cjs');

const RECIPES_DIR = './recipes';
const CATEGORIES_FILE = './categories.yml';

const VARIABLE_KINDS = ['text', 'number', 'boolean', 'select', 'secret'];
const MODE_KINDS = ['system', 'docker', 'connect'];

const BRIDGE_REF = /chelys-typeset-bridge:(\d+)/;
const INCREMENTAL_SYNC_MIN_BRIDGE = 1;

const SEMVER_DIR = /^\d+\.\d+\.\d+/;

const DESCRIPTION_MIN_LENGTH = 20;
const DESCRIPTION_MAX_LENGTH = 140;

const COPY_INSTRUCTION = /^\s*COPY\s+(?!--)(\S+)\s+\S+\s*$/i;

function discoverRecipeVersions(recipePath) {
  const versionDirs = fs
    .readdirSync(recipePath, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory() && SEMVER_DIR.test(dirent.name))
    .map((dirent) => dirent.name)
    .filter((name) => fs.existsSync(path.join(recipePath, name, 'recipe.json')));

  if (versionDirs.length > 0) {
    return versionDirs.map((version) => ({
      version,
      path: path.join(recipePath, version),
    }));
  }

  return [{ version: null, path: recipePath }];
}

class RecipeValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  log(level, message, recipe = null) {
    const fullMessage = recipe ? `${recipe}: ${message}` : message;
    if (level === 'error') {
      this.errors.push(fullMessage);
      console.error(`ERROR ${fullMessage}`);
    } else if (level === 'warning') {
      this.warnings.push(fullMessage);
      console.warn(`WARN  ${fullMessage}`);
    } else {
      console.log(`OK    ${fullMessage}`);
    }
  }

  validateRequiredFiles(recipeVersionPath, recipeId) {
    const manifestPath = path.join(recipeVersionPath, 'recipe.json');
    const readmePath = path.join(recipeVersionPath, 'README.md');

    if (!fs.existsSync(manifestPath)) {
      this.log('error', 'Missing recipe.json', recipeId);
      return false;
    }

    if (!fs.existsSync(readmePath)) {
      this.log('warning', 'Missing README.md (recommended)', recipeId);
    }

    return true;
  }

  validateIcon(manifest, recipeId, categoryId, recipePath) {
    if (manifest.iconUrl === undefined) {
      return;
    }
    if (typeof manifest.iconUrl !== 'string' || !manifest.iconUrl.trim()) {
      this.log('error', 'iconUrl must be a non-empty string', recipeId);
      return;
    }
    if (!/^https?:\/\//.test(manifest.iconUrl)) {
      this.log('error', 'iconUrl must be an absolute URL', recipeId);
      return;
    }

    const prefix = `/recipes/${categoryId}/${recipeId}/`;
    const index = manifest.iconUrl.indexOf(prefix);
    if (index === -1) {
      this.log('error', `iconUrl must point at ${prefix}`, recipeId);
      return;
    }

    const file = manifest.iconUrl.slice(index + prefix.length);
    if (!file || file.includes('/')) {
      this.log('error', `iconUrl must name a file directly under ${prefix}`, recipeId);
      return;
    }
    if (!fs.existsSync(path.join(recipePath, file))) {
      this.log('error', `iconUrl target not found: ${file}`, recipeId);
    }
  }

  validateDockerfile(mode, manifest, recipeId, recipeVersionPath) {
    if (/^https?:\/\//.test(mode.dockerfileUrl)) {
      this.log('warning', 'dockerfileUrl should be relative to the recipe version directory', recipeId);
    }

    const dockerfilePath = /^https?:\/\//.test(mode.dockerfileUrl)
      ? path.join(recipeVersionPath, 'Dockerfile')
      : path.join(recipeVersionPath, mode.dockerfileUrl);

    if (!fs.existsSync(dockerfilePath)) {
      this.log('error', `dockerfileUrl target not found: ${mode.dockerfileUrl}`, recipeId);
      return;
    }

    const declared = new Set(
      (manifest.extraFiles || []).map((entry) => entry.trim().replace(/^\.\//, '')),
    );

    for (const line of fs.readFileSync(dockerfilePath, 'utf8').split('\n')) {
      const match = line.match(COPY_INSTRUCTION);
      if (!match) {
        continue;
      }
      const source = match[1];
      if (!declared.has(source)) {
        this.log(
          'error',
          `Dockerfile copies "${source}" but it is not declared in extraFiles`,
          recipeId,
        );
      }
    }
  }

  validateVariables(manifest, recipeId) {
    if (!manifest.variables) {
      return;
    }
    if (!Array.isArray(manifest.variables)) {
      this.log('error', 'Variables must be an array', recipeId);
      return;
    }
    for (const variable of manifest.variables) {
      if (!variable.key || !variable.label || !variable.kind) {
        this.log('error', 'Variable must have key, label, and kind', recipeId);
        continue;
      }
      if (!VARIABLE_KINDS.includes(variable.kind)) {
        this.log('error', `Invalid variable kind "${variable.kind}" (${variable.key})`, recipeId);
      }
      if (variable.kind === 'select' && (!Array.isArray(variable.options) || variable.options.length === 0)) {
        this.log('error', `Select variable "${variable.key}" must declare options`, recipeId);
      }
      if (variable.kind === 'secret') this.validateSecret(manifest, variable, recipeId);
    }
  }

  // A secret (e.g. an API key) ships empty and is only used as a whole env
  // value: Chelys substitutes it nowhere else, and leaves the env entry out
  // when it is empty so the user's own environment variable still applies.
  validateSecret(manifest, variable, recipeId) {
    const token = `\${${variable.key}}`;
    if (variable.default) {
      this.log('error', `Secret variable "${variable.key}" must not have a default`, recipeId);
    }
    const envUses = Object.values(manifest.env ?? {}).filter((value) => value === token).length;
    const { env, ...rest } = manifest;
    if (JSON.stringify(rest).includes(token)
      || Object.values(env ?? {}).some((value) => value !== token && String(value).includes(token))) {
      this.log('error', `Secret variable "${variable.key}" may only be used as a whole env value`, recipeId);
    }
    if (envUses === 0) {
      this.log('warning', `Secret variable "${variable.key}" is not used in env`, recipeId);
    }
  }

  validateModes(manifest, recipeId, recipeVersionPath) {
    if (!Array.isArray(manifest.modes) || manifest.modes.length === 0) {
      this.log('error', 'Recipe must declare at least one install mode', recipeId);
      return;
    }
    for (const mode of manifest.modes) {
      if (!MODE_KINDS.includes(mode.kind)) {
        this.log('error', `Invalid mode kind: ${mode.kind}`, recipeId);
        continue;
      }
      if (mode.kind === 'system' && (!mode.runCommand || !mode.runCommand.command)) {
        this.log('error', 'System mode requires a runCommand', recipeId);
      }
      if (mode.kind === 'docker') {
        if (!mode.image) {
          this.log('error', 'Docker mode requires an image', recipeId);
        }
        if (mode.dockerfileUrl) {
          this.validateDockerfile(mode, manifest, recipeId, recipeVersionPath);
        } else if (!mode.dockerfile) {
          this.log('warning', 'Docker mode has neither dockerfile nor dockerfileUrl', recipeId);
        }
      }
    }
  }

  validateExtraFiles(manifest, recipeId, recipeVersionPath) {
    if (manifest.extraFiles === undefined) {
      return;
    }
    if (!Array.isArray(manifest.extraFiles)) {
      this.log('error', 'extraFiles must be an array of relative paths', recipeId);
      return;
    }

    for (const raw of manifest.extraFiles) {
      if (typeof raw !== 'string' || !raw.trim()) {
        this.log('error', 'extraFiles entries must be non-empty strings', recipeId);
        continue;
      }

      const entry = raw.trim().replace(/^\.\//, '');
      const unsafe =
        entry.startsWith('/') ||
        entry.startsWith('\\') ||
        /^[a-zA-Z]:/.test(entry) ||
        entry.split('/').some((segment) => segment === '' || segment === '..');
      if (unsafe) {
        this.log('error', `Unsafe extraFiles path: ${raw}`, recipeId);
        continue;
      }

      const filePath = path.join(recipeVersionPath, entry);
      if (!fs.existsSync(filePath)) {
        this.log('error', `extraFiles path not found in recipe directory: ${entry}`, recipeId);
      }
    }
  }

  validateTypesetter(manifest, recipeId, recipeVersionPath) {
    if (manifest.type !== 'typesetter') {
      return;
    }

    const typeConfig = manifest.typeConfig || {};
    const hasDockerMode = Array.isArray(manifest.modes)
      && manifest.modes.some((mode) => mode.kind === 'docker');

    const dockerfilePath = path.join(recipeVersionPath, 'Dockerfile');
    const dockerfile = fs.existsSync(dockerfilePath)
      ? fs.readFileSync(dockerfilePath, 'utf8')
      : '';

    const match = dockerfile.match(BRIDGE_REF);
    const bridgeVersion = match ? Number(match[1]) : null;

    if (typeConfig.incrementalSync === true && hasDockerMode) {
      if (bridgeVersion === null) {
        this.log('error', 'typeConfig.incrementalSync is true but the Dockerfile does not pin chelys-typeset-bridge', recipeId);
      } else if (bridgeVersion < INCREMENTAL_SYNC_MIN_BRIDGE) {
        this.log('error', `typeConfig.incrementalSync requires chelys-typeset-bridge:${INCREMENTAL_SYNC_MIN_BRIDGE} or later (found :${bridgeVersion})`, recipeId);
      }
    }

    if (hasDockerMode && dockerfile && bridgeVersion === null) {
      this.log('warning', 'Typesetter Dockerfile does not use chelys-typeset-bridge; the compile protocol is reimplemented inline', recipeId);
    }
  }

  validateAcp(manifest, recipeId, recipeVersionPath) {
    if (manifest.type !== 'acp') {
      return;
    }

    const typeConfig = manifest.typeConfig || {};
    for (const key of ['sessionMeta', 'mcpServers']) {
      if (typeConfig[key] === undefined) continue;
      try {
        JSON.parse(typeConfig[key]);
      } catch (error) {
        this.log('error', `typeConfig.${key} must be a JSON string: ${error.message}`, recipeId);
      }
    }

    if (!(manifest.extraFiles || []).includes(ACP_BRIDGE_FILE)) {
      return;
    }
    if (typeConfig.sessionMeta !== undefined) {
      this.log('warning', `typeConfig.sessionMeta is ignored behind ${ACP_BRIDGE_FILE}; pass the options with --session-meta instead`, recipeId);
    }
    const copy = path.join(recipeVersionPath, ACP_BRIDGE_FILE);
    if (
      fs.existsSync(copy) &&
      !fs.readFileSync(copy).equals(fs.readFileSync(ACP_BRIDGE_SOURCE))
    ) {
      this.log('error', `${ACP_BRIDGE_FILE} differs from ${ACP_BRIDGE_SOURCE}; run npm run sync:acp-bridge`, recipeId);
    }
  }

  validateManifest(recipeVersionPath, recipePath, recipeId, categoryId, validCategories) {
    const manifestPath = path.join(recipeVersionPath, 'recipe.json');

    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (error) {
      this.log('error', `Invalid JSON in recipe.json: ${error.message}`, recipeId);
      return null;
    }

    const requiredFields = [
      'id',
      'type',
      'name',
      'description',
      'tags',
      'author',
      'version',
      'lastUpdated',
      'env',
      'modes',
      'typeConfig',
    ];
    for (const field of requiredFields) {
      if (manifest[field] === undefined || manifest[field] === null) {
        this.log('error', `Missing required field: ${field}`, recipeId);
      }
    }

    if (manifest.id !== recipeId) {
      this.log('error', `ID mismatch: manifest.id (${manifest.id}) != directory name (${recipeId})`, recipeId);
    }

    if (manifest.type !== categoryId) {
      this.log('error', `Type mismatch: manifest.type (${manifest.type}) != parent directory (${categoryId})`, recipeId);
    }

    if (!validCategories.includes(manifest.type)) {
      this.log('error', `Invalid type: ${manifest.type}`, recipeId);
    }

    if (!Array.isArray(manifest.tags)) {
      this.log('error', 'Tags must be an array', recipeId);
    } else if (manifest.tags.length === 0) {
      this.log('warning', 'No tags specified', recipeId);
    }

    if (manifest.version && !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
      this.log('warning', 'Version should follow semantic versioning (x.y.z)', recipeId);
    }

    if (manifest.lastUpdated && isNaN(new Date(manifest.lastUpdated).getTime())) {
      this.log('error', 'Invalid lastUpdated date format', recipeId);
    }

    if (manifest.description) {
      if (manifest.description.length < DESCRIPTION_MIN_LENGTH) {
        this.log('warning', 'Description is quite short, consider adding more detail', recipeId);
      } else if (manifest.description.length > DESCRIPTION_MAX_LENGTH) {
        this.log(
          'warning',
          `Description is ${manifest.description.length} characters; keep it under ${DESCRIPTION_MAX_LENGTH} and move detail into notes or the README`,
          recipeId,
        );
      }
    }

    this.validateIcon(manifest, recipeId, categoryId, recipePath);
    this.validateVariables(manifest, recipeId);
    this.validateModes(manifest, recipeId, recipeVersionPath);
    this.validateExtraFiles(manifest, recipeId, recipeVersionPath);
    this.validateTypesetter(manifest, recipeId, recipeVersionPath);
    this.validateAcp(manifest, recipeId, recipeVersionPath);

    return manifest;
  }

  validateCategories() {
    if (!fs.existsSync(CATEGORIES_FILE)) {
      this.log('error', 'Missing categories.yml file');
      return [];
    }

    try {
      const categoriesData = yaml.load(fs.readFileSync(CATEGORIES_FILE, 'utf8'));
      const categories = categoriesData.categories || [];

      if (categories.length === 0) {
        this.log('error', 'No categories defined in categories.yml');
        return [];
      }

      const validCategories = [];
      for (const category of categories) {
        if (!category.id || !category.name || !category.description) {
          this.log('error', 'Category missing required fields (id, name, description)');
        } else {
          validCategories.push(category.id);
        }
      }

      this.log('info', `Found ${validCategories.length} valid categories`);
      return validCategories;
    } catch (error) {
      this.log('error', `Error reading categories.yml: ${error.message}`);
      return [];
    }
  }

  async validateAll() {
    console.log('Validating Chelys Recipes...\n');

    const validCategories = this.validateCategories();
    if (validCategories.length === 0) {
      return false;
    }

    if (!fs.existsSync(RECIPES_DIR)) {
      this.log('error', 'Recipes directory not found');
      return false;
    }

    const categoryDirs = fs
      .readdirSync(RECIPES_DIR, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    if (categoryDirs.length === 0) {
      this.log('error', 'No recipe categories found');
      return false;
    }

    let totalRecipes = 0;
    let validRecipes = 0;

    for (const categoryId of categoryDirs) {
      if (!validCategories.includes(categoryId)) {
        this.log('warning', `Category directory "${categoryId}" not found in categories.yml`);
        continue;
      }

      const categoryPath = path.join(RECIPES_DIR, categoryId);
      const recipeDirs = fs
        .readdirSync(categoryPath, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name);

      console.log(`\nValidating category: ${categoryId} (${recipeDirs.length} recipes)`);

      for (const recipeId of recipeDirs) {
        totalRecipes++;
        const recipePath = path.join(categoryPath, recipeId);
        const versions = discoverRecipeVersions(recipePath);

        console.log(`\n  ${recipeId}`);

        let recipeValid = true;
        for (const versionInfo of versions) {
          const label = versionInfo.version
            ? `${recipeId}@${versionInfo.version}`
            : recipeId;

          if (!this.validateRequiredFiles(versionInfo.path, label)) {
            recipeValid = false;
            continue;
          }

          const manifest = this.validateManifest(
            versionInfo.path,
            recipePath,
            recipeId,
            categoryId,
            validCategories,
          );
          if (!manifest) {
            recipeValid = false;
            continue;
          }

          this.log('info', 'Recipe validation passed', label);
        }

        if (recipeValid) {
          validRecipes++;
        }
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('VALIDATION SUMMARY');
    console.log('='.repeat(50));
    console.log(`Total recipes: ${totalRecipes}`);
    console.log(`Valid recipes: ${validRecipes}`);
    console.log(`Errors: ${this.errors.length}`);
    console.log(`Warnings: ${this.warnings.length}`);

    if (this.errors.length > 0) {
      console.log('\nERRORS:');
      this.errors.forEach((error) => console.log(`  - ${error}`));
    }

    if (this.warnings.length > 0) {
      console.log('\nWARNINGS:');
      this.warnings.forEach((warning) => console.log(`  - ${warning}`));
    }

    const success = this.errors.length === 0;
    console.log(`\n${success ? 'All validations passed!' : 'Validation failed - please fix errors above'}`);

    return success;
  }
}

async function main() {
  const validator = new RecipeValidator();
  const success = await validator.validateAll();
  process.exit(success ? 0 : 1);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = RecipeValidator;
