// src/api.ts
import {
  RecipesAPI,
  RecipeEntry,
  RecipeCategory,
  RecipeManifest,
} from './types';

export class RecipesApiClient {
  private baseUrl: string;
  private cache: RecipesAPI | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  constructor(baseUrl = 'https://texlyre.github.io/chelys-recipes') {
    this.baseUrl = baseUrl;
  }

  async getRecipes(useCache = true): Promise<RecipesAPI> {
    const now = Date.now();

    if (useCache && this.cache && now - this.cacheTimestamp < this.CACHE_DURATION) {
      return this.cache;
    }

    const response = await fetch(`${this.baseUrl}/api/recipes.json`);
    if (!response.ok) {
      throw new Error(`Failed to fetch recipes: ${response.statusText}`);
    }

    const data = await response.json();
    this.cache = data;
    this.cacheTimestamp = now;
    return data;
  }

  async getRecipesByCategory(categoryId: string): Promise<RecipeEntry[]> {
    const api = await this.getRecipes();
    const category = api.categories.find((cat) => cat.id === categoryId);
    return category?.recipes || [];
  }

  async searchRecipes(query: string): Promise<RecipeEntry[]> {
    const api = await this.getRecipes();
    const allRecipes = api.categories.flatMap((cat) => cat.recipes);

    const lowercaseQuery = query.toLowerCase();
    return allRecipes.filter(
      (recipe) =>
        recipe.name.toLowerCase().includes(lowercaseQuery) ||
        recipe.description.toLowerCase().includes(lowercaseQuery) ||
        recipe.tags.some((tag) => tag.toLowerCase().includes(lowercaseQuery)) ||
        recipe.author.toLowerCase().includes(lowercaseQuery)
    );
  }

  async getCategories(): Promise<RecipeCategory[]> {
    const api = await this.getRecipes();
    return api.categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      description: cat.description,
    }));
  }

  async getManifest(recipe: RecipeEntry, version?: string): Promise<RecipeManifest> {
    const manifestUrl = version
      ? recipe.versions?.find((v) => v.version === version)?.manifestUrl ??
        recipe.manifestUrl
      : recipe.manifestUrl;
    const response = await fetch(manifestUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch manifest: ${response.statusText}`);
    }
    return response.json();
  }

  clearCache(): void {
    this.cache = null;
    this.cacheTimestamp = 0;
  }
}

export const recipesApi = new RecipesApiClient();
