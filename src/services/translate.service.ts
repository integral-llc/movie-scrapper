import { TranslateClient, TranslateTextCommand } from '@aws-sdk/client-translate';
import { getConfig } from '../config/env.config';

export class TranslateService {
  private client: TranslateClient | null = null;

  private getClient(): TranslateClient {
    if (!this.client) {
      const config = getConfig();
      this.client = new TranslateClient({
        region: config.awsRegion,
        credentials: {
          accessKeyId: config.awsAccessKeyId,
          secretAccessKey: config.awsSecretAccessKey,
        },
      });
    }
    return this.client;
  }

  async translateToEnglish(text: string, sourceLanguage: string = 'auto'): Promise<string> {
    try {
      const command = new TranslateTextCommand({
        Text: text,
        SourceLanguageCode: sourceLanguage,
        TargetLanguageCode: 'en',
      });

      const response = await this.getClient().send(command);
      return response.TranslatedText || text;
    } catch (error) {
      console.error('Translation error:', error);
      return text;
    }
  }

  async translateToRussian(text: string): Promise<string> {
    try {
      const command = new TranslateTextCommand({
        Text: text,
        SourceLanguageCode: 'en',
        TargetLanguageCode: 'ru',
      });

      const response = await this.getClient().send(command);
      return response.TranslatedText || text;
    } catch (error) {
      console.error('Translation to Russian error:', error);
      return text;
    }
  }

  async translateToRomanian(text: string): Promise<string> {
    try {
      const command = new TranslateTextCommand({
        Text: text,
        SourceLanguageCode: 'en',
        TargetLanguageCode: 'ro',
      });

      const response = await this.getClient().send(command);
      return response.TranslatedText || text;
    } catch (error) {
      console.error('Translation to Romanian error:', error);
      return text;
    }
  }

  detectLanguage(text: string): string {
    const cyrillicPattern = /[\u0400-\u04FF]/;
    const latinPattern = /[a-zA-Z]/;

    if (cyrillicPattern.test(text)) {
      return 'ru';
    } else if (latinPattern.test(text)) {
      return 'en';
    }

    return 'auto';
  }
}
