import dotenv from 'dotenv';
import { secretsService, AppSecrets } from '../services/secrets.service';

dotenv.config();

export interface EnvConfig {
  port: number;
  omdbApiKey: string;
  tmdbApiKey: string;
  openaiApiKey: string;
  kinopoiskApiKey: string;
  awsRegion: string;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  databasePath: string;
  moviesTxtPath: string;
  scanCronSchedule: string;
}

// Non-sensitive config that can be loaded synchronously from .env
const baseConfig = {
  port: parseInt(process.env.PORT || '9988', 10),
  awsRegion: process.env.AWS_REGION || 'us-east-1',
  databasePath: process.env.DATABASE_PATH || './data/movies.db',
  moviesTxtPath: process.env.MOVIES_TXT_PATH || './movies.txt',
  scanCronSchedule: process.env.SCAN_CRON_SCHEDULE || '0 */12 * * *',
};

// Full config that requires secrets - will be populated by initConfig()
let fullConfig: EnvConfig | null = null;

/**
 * Initialize configuration by loading secrets from AWS Secrets Manager
 * Must be called before using the config
 */
export async function initConfig(): Promise<EnvConfig> {
  if (fullConfig) {
    return fullConfig;
  }

  const secrets = await secretsService.getSecrets();

  fullConfig = {
    ...baseConfig,
    openaiApiKey: secrets.OPENAI_API_KEY,
    tmdbApiKey: secrets.TMDB_API_KEY,
    omdbApiKey: secrets.OMDB_API_KEY,
    kinopoiskApiKey: secrets.KINOPOISK_API_KEY || process.env.KINOPOISK_API_KEY || '',
    awsAccessKeyId: secrets.AWS_ACCESS_KEY_ID,
    awsSecretAccessKey: secrets.AWS_SECRET_ACCESS_KEY,
  };

  return fullConfig;
}

/**
 * Get the current config (throws if not initialized)
 */
export function getConfig(): EnvConfig {
  if (!fullConfig) {
    throw new Error('Config not initialized. Call initConfig() first.');
  }
  return fullConfig;
}

// Export base config for immediate access to non-sensitive values
export const config = baseConfig as EnvConfig;
