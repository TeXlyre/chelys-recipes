// scripts/sync-bridges.cjs
const fs = require('node:fs');
const path = require('node:path');
const bridges = require('./bridges.cjs');

let updated = 0;

for (const [type, { file, source }] of Object.entries(bridges)) {
  const recipesDir = path.join('recipes', type);
  if (!fs.existsSync(recipesDir)) continue;
  const content = fs.readFileSync(source);

  for (const recipe of fs.readdirSync(recipesDir, { withFileTypes: true })) {
    if (!recipe.isDirectory()) continue;
    const recipeDir = path.join(recipesDir, recipe.name);
    for (const version of fs.readdirSync(recipeDir, { withFileTypes: true })) {
      if (!version.isDirectory()) continue;
      const directory = path.join(recipeDir, version.name);
      const manifestFile = path.join(directory, 'recipe.json');
      if (!fs.existsSync(manifestFile)) continue;
      const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
      if (!(manifest.extraFiles || []).includes(file)) continue;

      const target = path.join(directory, file);
      if (fs.existsSync(target) && fs.readFileSync(target).equals(content)) continue;
      fs.writeFileSync(target, content);
      console.log(`updated ${target}`);
      updated++;
    }
  }
}

console.log(updated ? `${updated} bridge copies updated` : 'all bridge copies are current');
