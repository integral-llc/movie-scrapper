import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

interface EnvConfig {
  port: number;
  omdbApiKey: string;
  awsRegion: string;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  databasePath: string;
  moviesTxtPath: string;
  scanCronSchedule: string;
}

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  if (!value) {
    throw new Error(`Environment variable ${key} is required`);
  }
  return value;
}

export const config: EnvConfig = {
  port: parseInt(getEnvVar('PORT', '9988'), 10),
  omdbApiKey: getEnvVar('OMDB_API_KEY'),
  awsRegion: getEnvVar('AWS_REGION', 'us-east-1'),
  awsAccessKeyId: getEnvVar('AWS_ACCESS_KEY_ID'),
  awsSecretAccessKey: getEnvVar('AWS_SECRET_ACCESS_KEY'),
  databasePath: getEnvVar('DATABASE_PATH', './data/movies.db'),
  moviesTxtPath: getEnvVar('MOVIES_TXT_PATH', './movies.txt'),
  scanCronSchedule: getEnvVar('SCAN_CRON_SCHEDULE', '0 */12 * * *'),
};
