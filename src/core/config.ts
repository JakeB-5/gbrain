import { readFileSync, writeFileSync, mkdirSync, chmodSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { EngineConfig } from './types.ts';

// Lazy-evaluated to avoid calling homedir() at module scope (breaks in serverless/bundled environments)
function getConfigDir() { return join(homedir(), '.gbrain'); }
function getConfigPath() { return join(getConfigDir(), 'config.json'); }

export interface EmbeddingConfig {
  model: string;
  dimensions: number;
  base_url?: string;
  api_key?: string;
}

export interface GBrainConfig {
  engine: 'postgres' | 'pglite';
  database_url?: string;
  database_path?: string;
  openai_api_key?: string;
  anthropic_api_key?: string;
  embedding?: EmbeddingConfig;
}

/**
 * Resolve embedding configuration with precedence: env vars > config file > defaults.
 *
 * Env vars:
 *   GBRAIN_EMBEDDING_MODEL      — model name (default: bge-m3)
 *   GBRAIN_EMBEDDING_DIMENSIONS — vector dimensions (default: 1024)
 *   GBRAIN_EMBEDDING_BASE_URL   — OpenAI-compatible base URL (default: http://localhost:11434/v1)
 *   GBRAIN_EMBEDDING_API_KEY    — API key (default: ollama)
 *
 * For OpenAI hosted: set OPENAI_API_KEY and GBRAIN_EMBEDDING_MODEL=text-embedding-3-large
 */
export function resolveEmbeddingConfig(config?: GBrainConfig | null): EmbeddingConfig {
  const fileEmbed = config?.embedding;
  return {
    model: process.env.GBRAIN_EMBEDDING_MODEL || fileEmbed?.model || 'bge-m3',
    dimensions: parseInt(process.env.GBRAIN_EMBEDDING_DIMENSIONS || String(fileEmbed?.dimensions || 1024), 10),
    base_url: process.env.GBRAIN_EMBEDDING_BASE_URL || process.env.OPENAI_BASE_URL || fileEmbed?.base_url || 'http://localhost:11434/v1',
    api_key: process.env.GBRAIN_EMBEDDING_API_KEY || process.env.OPENAI_API_KEY || fileEmbed?.api_key || 'ollama',
  };
}

/**
 * Load config with credential precedence: env vars > config file.
 * Plugin config is handled by the plugin runtime injecting env vars.
 */
export function loadConfig(): GBrainConfig | null {
  let fileConfig: GBrainConfig | null = null;
  try {
    const raw = readFileSync(getConfigPath(), 'utf-8');
    fileConfig = JSON.parse(raw) as GBrainConfig;
  } catch { /* no config file */ }

  // Try env vars
  const dbUrl = process.env.GBRAIN_DATABASE_URL || process.env.DATABASE_URL;

  if (!fileConfig && !dbUrl) return null;

  // Infer engine type if not explicitly set
  const inferredEngine: 'postgres' | 'pglite' = fileConfig?.engine
    || (fileConfig?.database_path ? 'pglite' : 'postgres');

  // Merge: env vars override config file
  const merged = {
    ...fileConfig,
    engine: inferredEngine,
    ...(dbUrl ? { database_url: dbUrl } : {}),
    ...(process.env.OPENAI_API_KEY ? { openai_api_key: process.env.OPENAI_API_KEY } : {}),
  };
  return merged as GBrainConfig;
}

export function saveConfig(config: GBrainConfig): void {
  mkdirSync(getConfigDir(), { recursive: true });
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
  try {
    chmodSync(getConfigPath(), 0o600);
  } catch {
    // chmod may fail on some platforms
  }
}

export function toEngineConfig(config: GBrainConfig): EngineConfig {
  return {
    engine: config.engine,
    database_url: config.database_url,
    database_path: config.database_path,
  };
}

export function configDir(): string {
  return join(homedir(), '.gbrain');
}

export function configPath(): string {
  return join(configDir(), 'config.json');
}
