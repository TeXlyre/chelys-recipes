// src/utils.ts
import { RecipeManifest, RecipeCategory, RecipeVariable } from './types';

const VARIABLE_KINDS = ['text', 'number', 'boolean', 'select'];
const MODE_KINDS = ['system', 'docker', 'connect'];

export function validateRecipeManifest(manifest: any): RecipeManifest {
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
      throw new Error(`Missing required field: ${field}`);
    }
  }

  if (!Array.isArray(manifest.tags)) {
    throw new Error('Tags must be an array');
  }

  if (!Array.isArray(manifest.modes) || manifest.modes.length === 0) {
    throw new Error('Recipe must declare at least one install mode');
  }

  for (const mode of manifest.modes) {
    if (!MODE_KINDS.includes(mode.kind)) {
      throw new Error(`Invalid mode kind: ${mode.kind}`);
    }
  }

  if (manifest.variables) {
    if (!Array.isArray(manifest.variables)) {
      throw new Error('Variables must be an array');
    }
    for (const variable of manifest.variables) {
      validateVariable(variable);
    }
  }

  if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    throw new Error('Version must follow semantic versioning (x.y.z)');
  }

  if (isNaN(new Date(manifest.lastUpdated).getTime())) {
    throw new Error('Invalid lastUpdated date format');
  }

  return manifest as RecipeManifest;
}

export function validateVariable(variable: any): RecipeVariable {
  if (!variable.key || !variable.label || !variable.kind) {
    throw new Error('Variable must have key, label, and kind');
  }

  if (!VARIABLE_KINDS.includes(variable.kind)) {
    throw new Error(`Invalid variable kind: ${variable.kind}`);
  }

  if (variable.kind === 'select' && (!Array.isArray(variable.options) || variable.options.length === 0)) {
    throw new Error(`Select variable "${variable.key}" must declare options`);
  }

  return variable as RecipeVariable;
}

export function validateCategory(category: any): RecipeCategory {
  const requiredFields = ['id', 'name', 'description'];

  for (const field of requiredFields) {
    if (!category[field]) {
      throw new Error(`Missing required category field: ${field}`);
    }
  }

  if (!/^[a-z0-9-]+$/.test(category.id)) {
    throw new Error('Category ID must contain only lowercase letters, numbers, and hyphens');
  }

  return category as RecipeCategory;
}

export function createManifestUrl(
  baseUrl: string,
  categoryId: string,
  recipeId: string,
  filename = 'recipe.json',
  version?: string
): string {
  const versionSegment = version ? `/${version}` : '';
  return `${baseUrl}/recipes/${categoryId}/${recipeId}${versionSegment}/${filename}`;
}

export function sanitizeRecipeId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
