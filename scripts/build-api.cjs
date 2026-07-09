// scripts/build-api.cjs
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const RECIPES_DIR = './recipes';
const CATEGORIES_FILE = './categories.yml';
const OUTPUT_FILE = './api/recipes.json';
const BASE_URL = 'https://texlyre.github.io/chelys-recipes';

function loadCategories() {
  if (!fs.existsSync(CATEGORIES_FILE)) {
    console.error(`Categories file not found: ${CATEGORIES_FILE}`);
    process.exit(1);
  }

  try {
    const categoriesData = yaml.load(fs.readFileSync(CATEGORIES_FILE, 'utf8'));

    if (!categoriesData || !Array.isArray(categoriesData.categories)) {
      throw new Error('Invalid categories.yml structure. Expected { categories: [...] }');
    }

    for (const category of categoriesData.categories) {
      if (!category.id || !category.name || !category.description) {
        throw new Error(`Invalid category structure: ${JSON.stringify(category)}`);
      }
    }

    return categoriesData.categories;
  } catch (error) {
    console.error(`Error reading categories.yml: ${error.message}`);
    process.exit(1);
  }
}

function discoverRecipeCategories() {
  if (!fs.existsSync(RECIPES_DIR)) {
    return [];
  }

  return fs
    .readdirSync(RECIPES_DIR, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);
}

function resolveImageUrl(metadataUrl, categoryId, recipeId) {
  if (!metadataUrl) {
    return undefined;
  }
  if (metadataUrl.startsWith('http://') || metadataUrl.startsWith('https://')) {
    return metadataUrl;
  }
  return `${BASE_URL}/recipes/${categoryId}/${recipeId}/${metadataUrl}`;
}

const SEMVER_DIR = /^\d+\.\d+\.\d+/;

function compareVersionsDesc(a, b) {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function discoverRecipeVersions(recipePath) {
  const versionDirs = fs
    .readdirSync(recipePath, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory() && SEMVER_DIR.test(dirent.name))
    .map((dirent) => dirent.name)
    .filter((name) => fs.existsSync(path.join(recipePath, name, 'recipe.json')))
    .sort(compareVersionsDesc);

  if (versionDirs.length > 0) {
    return versionDirs.map((version) => ({
      version,
      dir: version,
      manifestPath: path.join(recipePath, version, 'recipe.json'),
    }));
  }

  const flatManifest = path.join(recipePath, 'recipe.json');
  if (fs.existsSync(flatManifest)) {
    return [{ version: null, dir: null, manifestPath: flatManifest }];
  }

  return [];
}

async function buildApi() {
  console.log('Building recipes API...');

  try {
    const categories = loadCategories();
    const discoveredCategories = discoverRecipeCategories();

    console.log(`Configured categories: ${categories.map((c) => c.id).join(', ')}`);
    console.log(`Discovered category directories: ${discoveredCategories.join(', ')}`);

    const apiData = {
      lastUpdated: new Date().toISOString(),
      version: '1.0.0',
      categories: categories.map((cat) => ({ ...cat, recipes: [] })),
    };

    for (const categoryId of discoveredCategories) {
      const category = apiData.categories.find((cat) => cat.id === categoryId);

      if (!category) {
        console.warn(`Skipping category '${categoryId}' - not defined in categories.yml`);
        continue;
      }

      const categoryPath = path.join(RECIPES_DIR, categoryId);
      const recipeDirs = fs
        .readdirSync(categoryPath, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name);

      console.log(`Processing category '${categoryId}': ${recipeDirs.length} recipes`);

      for (const recipeId of recipeDirs) {
        const recipePath = path.join(categoryPath, recipeId);
        const versions = discoverRecipeVersions(recipePath);

        if (versions.length === 0) {
          console.warn(`  No recipe.json found for '${recipeId}'`);
          continue;
        }

        try {
          const versionEntries = [];
          let latestManifest = null;

          for (const versionInfo of versions) {
            const manifest = JSON.parse(
              fs.readFileSync(versionInfo.manifestPath, 'utf8'),
            );

            if (!manifest.id || !manifest.name || !manifest.description) {
              console.warn(`  Recipe '${recipeId}' missing required fields`);
              continue;
            }

            if (manifest.id !== recipeId) {
              console.warn(`  Recipe ID mismatch: ${manifest.id} != ${recipeId}`);
            }

            if (manifest.type !== categoryId) {
              console.warn(`  Recipe type mismatch: ${manifest.type} != ${categoryId}`);
            }

            const manifestUrl = versionInfo.dir
              ? `${BASE_URL}/recipes/${categoryId}/${recipeId}/${versionInfo.dir}/recipe.json`
              : `${BASE_URL}/recipes/${categoryId}/${recipeId}/recipe.json`;

            versionEntries.push({ version: manifest.version, manifestUrl });
            if (!latestManifest) latestManifest = manifest;
          }

          if (!latestManifest) {
            continue;
          }

          const entry = {
            id: recipeId,
            type: categoryId,
            name: latestManifest.name,
            description: latestManifest.description,
            tags: latestManifest.tags || [],
            author: latestManifest.author,
            version: latestManifest.version,
            lastUpdated: latestManifest.lastUpdated,
            manifestUrl: versionEntries[0].manifestUrl,
            versions: versionEntries,
            previewImage: resolveImageUrl(
              latestManifest.previewImage,
              categoryId,
              recipeId,
            ),
          };

          if (Array.isArray(latestManifest.extraFiles) && latestManifest.extraFiles.length > 0) {
            entry.extraFiles = latestManifest.extraFiles;
          }

          category.recipes.push(entry);
          console.log(
            `  + Added recipe: ${entry.name} (${versionEntries.length} version${versionEntries.length === 1 ? '' : 's'})`,
          );
        } catch (error) {
          console.error(`  Error parsing recipe '${recipeId}': ${error.message}`);
        }
      }
    }

    const apiDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(apiDir)) {
      fs.mkdirSync(apiDir, { recursive: true });
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(apiData, null, 2));

    const totalRecipes = apiData.categories.reduce((sum, cat) => sum + cat.recipes.length, 0);
    const activeCategories = apiData.categories.filter((cat) => cat.recipes.length > 0).length;

    console.log('\n' + '='.repeat(50));
    console.log('API BUILD SUMMARY');
    console.log('='.repeat(50));
    console.log(`Total recipes: ${totalRecipes}`);
    console.log(`Active categories: ${activeCategories}/${apiData.categories.length}`);
    console.log(`Output: ${OUTPUT_FILE}`);

    if (totalRecipes === 0) {
      console.warn('\nWarning: No recipes were processed. Check your recipes directory structure.');
    }
  } catch (error) {
    console.error('Error building API:', error);
    process.exit(1);
  }
}

buildApi();
