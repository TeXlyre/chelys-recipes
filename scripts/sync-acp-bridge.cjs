// scripts/sync-acp-bridge.cjs
// Copies the canonical ACP bridge into every acp recipe that ships it.
const fs = require('fs');
const path = require('path');

const { ACP_BRIDGE_FILE, ACP_BRIDGE_SOURCE } = require('./acp-bridge.cjs');

const RECIPES_DIR = path.join('recipes', 'acp');
const source = fs.readFileSync(ACP_BRIDGE_SOURCE);
let updated = 0;

for (const recipeId of fs.existsSync(RECIPES_DIR) ? fs.readdirSync(RECIPES_DIR) : []) {
  const recipePath = path.join(RECIPES_DIR, recipeId);
  if (!fs.statSync(recipePath).isDirectory()) continue;

  for (const version of fs.readdirSync(recipePath)) {
    const versionPath = path.join(recipePath, version);
    const manifestPath = path.join(versionPath, 'recipe.json');
    if (!fs.existsSync(manifestPath)) continue;

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (!(manifest.extraFiles || []).includes(ACP_BRIDGE_FILE)) continue;

    const target = path.join(versionPath, ACP_BRIDGE_FILE);
    if (fs.existsSync(target) && fs.readFileSync(target).equals(source)) continue;

    fs.writeFileSync(target, source);
    updated++;
    console.log(`updated ${target}`);
  }
}

console.log(updated ? `${updated} bridge copies updated` : 'all bridge copies are current');
