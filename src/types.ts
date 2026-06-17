// src/types.ts
export interface RecipeCategory {
  id: string;
  name: string;
  description: string;
}

export type InstallModeKind = 'system' | 'docker' | 'connect';

export type VariableKind = 'text' | 'number' | 'boolean' | 'select';

export interface RecipeVariable {
  key: string;
  label: string;
  kind: VariableKind;
  default?: string;
  help?: string;
  options?: string[];
}

export interface InstallStep {
  label: string;
  command: string;
  args: string[];
}

export interface SystemMode {
  kind: 'system';
  installSteps: InstallStep[];
  uninstallSteps?: InstallStep[];
  runCommand: { command: string; args: string[] };
}

export interface DockerMode {
  kind: 'docker';
  image: string;
  buildSteps: InstallStep[];
  runArgs: string[];
  dockerfile?: string;
  dockerfileUrl?: string;
}

export interface ConnectMode {
  kind: 'connect';
}

export type InstallMode = SystemMode | DockerMode | ConnectMode;

export interface RecipeManifest {
  id: string;
  type: string;
  name: string;
  description: string;
  notes?: string;
  tags: string[];
  author: string;
  version: string;
  lastUpdated: string;
  variables?: RecipeVariable[];
  env: Record<string, string>;
  cwd?: string;
  modes: InstallMode[];
  selectedMode?: InstallModeKind;
  typeConfig: Record<string, unknown>;
  previewImage?: string;
}

export interface RecipeVersion {
  version: string;
  manifestUrl: string;
}

export interface RecipeEntry {
  id: string;
  type: string;
  name: string;
  description: string;
  tags: string[];
  author: string;
  version: string;
  lastUpdated: string;
  manifestUrl: string;
  versions?: RecipeVersion[];
  previewImage?: string;
}

export interface RecipesAPI {
  lastUpdated: string;
  version: string;
  categories: Array<{
    id: string;
    name: string;
    description: string;
    recipes: RecipeEntry[];
  }>;
}
