import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

export interface AppSecrets {
  OPENAI_API_KEY: string;
  TMDB_API_KEY: string;
  OMDB_API_KEY: string;
  KINOPOISK_API_KEY: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
}

class SecretsService {
  private client: SecretsManagerClient;
  private secretName = 'movie-scrapper/api-keys';
  private cachedSecrets: AppSecrets | null = null;
  private region = process.env.AWS_REGION || 'us-east-1';

  constructor() {
    this.client = new SecretsManagerClient({ region: this.region });
  }

  async getSecrets(): Promise<AppSecrets> {
    // Return cached secrets if available
    if (this.cachedSecrets) {
      return this.cachedSecrets;
    }

    // Check if we should use local .env (for development/fallback)
    if (process.env.USE_LOCAL_SECRETS === 'true') {
      console.log('Using local .env secrets (USE_LOCAL_SECRETS=true)');
      return this.getLocalSecrets();
    }

    try {
      console.log(`Fetching secrets from AWS Secrets Manager: ${this.secretName}`);

      const command = new GetSecretValueCommand({
        SecretId: this.secretName,
      });

      const response = await this.client.send(command);

      if (!response.SecretString) {
        throw new Error('Secret value is empty');
      }

      this.cachedSecrets = JSON.parse(response.SecretString) as AppSecrets;
      console.log('Secrets loaded successfully from AWS Secrets Manager');

      return this.cachedSecrets;
    } catch (error) {
      console.warn('Failed to fetch from AWS Secrets Manager, falling back to local .env');
      console.warn(error instanceof Error ? error.message : error);
      return this.getLocalSecrets();
    }
  }

  private getLocalSecrets(): AppSecrets {
    const secrets: AppSecrets = {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
      TMDB_API_KEY: process.env.TMDB_API_KEY || '',
      OMDB_API_KEY: process.env.OMDB_API_KEY || '',
      KINOPOISK_API_KEY: process.env.KINOPOISK_API_KEY || '',
      AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || '',
      AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || '',
    };

    // Validate required secrets
    const missing = Object.entries(secrets)
      .filter(([key, value]) => !value && key !== 'OMDB_API_KEY' && key !== 'KINOPOISK_API_KEY') // OMDB and KINOPOISK are optional
      .map(([key]) => key);

    if (missing.length > 0) {
      console.warn(`Missing secrets: ${missing.join(', ')}`);
    }

    this.cachedSecrets = secrets;
    return secrets;
  }

  // Clear cache (useful for testing or refreshing secrets)
  clearCache(): void {
    this.cachedSecrets = null;
  }
}

// Singleton instance
export const secretsService = new SecretsService();
