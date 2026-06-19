// scripts/validate-recipes.cjs
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const RECIPES_DIR = './recipes';
const CATEGORIES_FILE = './categories.yml';

const VARIABLE_KINDS = ['text', 'number', 'boolean', 'select'];
const MODE_KINDS = ['system', 'docker', 'connect'];

const SEMVER_DIR = /^\d+\.\d+\.\d+/;

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
          const localDockerfile = path.join(recipeVersionPath, 'Dockerfile');
          if (!fs.existsSync(localDockerfile)) {
            this.log('warning', 'dockerfileUrl declared but no local Dockerfile found', recipeId);
          }
        } else if (!mode.dockerfile) {
          this.log('warning', 'Docker mode has neither dockerfile nor dockerfileUrl', recipeId);
        }
      }
    }
  }

  validateManifest(recipeVersionPath, recipeId, categoryId, validCategories) {
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

    if (manifest.description && manifest.description.length < 20) {
      this.log('warning', 'Description is quite short, consider adding more detail', recipeId);
    }

    this.validateVariables(manifest, recipeId);
    this.validateModes(manifest, recipeId, recipeVersionPath);

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
