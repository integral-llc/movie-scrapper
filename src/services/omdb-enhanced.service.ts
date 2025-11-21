import axios from 'axios';
import { getConfig } from '../config/env.config';
import { IMDBMovieData } from '../types/movie.types';
import { compareTwoStrings } from 'string-similarity';

interface SearchResult {
  Title: string;
  Year: string;
  imdbID: string;
  Type: string;
  Poster: string;
}

interface SearchResponse {
  Search?: SearchResult[];
  Response: string;
  Error?: string;
}

export class OMDBEnhancedService {
  private readonly baseUrl = 'http://www.omdbapi.com/';
  private readonly minSimilarity = 0.6; // 60% similarity threshold

  private get apiKey(): string {
    return getConfig().omdbApiKey;
  }

  /**
   * Multi-strategy search with fallbacks
   */
  async searchMovieIntelligent(
    title: string,
    year?: number
  ): Promise<IMDBMovieData | null> {
    console.log(`🔍 Intelligent search for: "${title}"${year ? ` (${year})` : ''}`);

    // Strategy 1: Direct exact match with year
    if (year) {
      const exactMatch = await this.searchByTitle(title, year);
      if (exactMatch) {
        console.log(`✓ Found via exact match with year`);
        return exactMatch;
      }
    }

    // Strategy 2: Direct exact match without year
    const exactMatchNoYear = await this.searchByTitle(title);
    if (exactMatchNoYear) {
      console.log(`✓ Found via exact match without year`);
      return exactMatchNoYear;
    }

    // Strategy 3: Search and find best match using fuzzy matching
    const fuzzyMatch = await this.searchWithFuzzyMatching(title, year);
    if (fuzzyMatch) {
      console.log(`✓ Found via fuzzy matching`);
      return fuzzyMatch;
    }

    // Strategy 4: Try variations of the title
    const variations = this.generateTitleVariations(title);
    for (const variation of variations) {
      console.log(`  Trying variation: "${variation}"`);
      const result = await this.searchByTitle(variation, year);
      if (result) {
        console.log(`✓ Found via title variation`);
        return result;
      }
    }

    // Strategy 5: Remove special characters and try again
    const cleanedTitle = this.aggressiveClean(title);
    if (cleanedTitle !== title) {
      console.log(`  Trying aggressively cleaned: "${cleanedTitle}"`);
      const result = await this.searchByTitle(cleanedTitle, year);
      if (result) {
        console.log(`✓ Found via aggressive cleaning`);
        return result;
      }
    }

    console.log(`✗ No match found after all strategies`);
    return null;
  }

  /**
   * Direct title search (existing method)
   */
  private async searchByTitle(
    title: string,
    year?: number
  ): Promise<IMDBMovieData | null> {
    try {
      const params: any = {
        apikey: this.apiKey,
        t: title,
        type: 'movie',
        plot: 'full',
      };

      if (year) {
        params.y = year;
      }

      const response = await axios.get<IMDBMovieData>(this.baseUrl, {
        params,
        timeout: 10000,
      });

      if (response.data.Response === 'True') {
        return response.data;
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Search with fuzzy matching - finds similar titles
   */
  private async searchWithFuzzyMatching(
    title: string,
    year?: number
  ): Promise<IMDBMovieData | null> {
    try {
      const params: any = {
        apikey: this.apiKey,
        s: title, // 's' parameter returns search results
        type: 'movie',
      };

      if (year) {
        params.y = year;
      }

      const response = await axios.get<SearchResponse>(this.baseUrl, {
        params,
        timeout: 10000,
      });

      if (response.data.Response === 'True' && response.data.Search) {
        const results = response.data.Search;

        // Find best match using string similarity
        let bestMatch: SearchResult | null = null;
        let bestScore = 0;

        for (const result of results) {
          const similarity = compareTwoStrings(
            title.toLowerCase(),
            result.Title.toLowerCase()
          );

          // Also check year proximity if provided
          let yearScore = 1;
          if (year) {
            const resultYear = parseInt(result.Year, 10);
            const yearDiff = Math.abs(resultYear - year);
            yearScore = yearDiff === 0 ? 1 : yearDiff <= 1 ? 0.8 : yearDiff <= 2 ? 0.5 : 0;
          }

          const totalScore = similarity * 0.7 + yearScore * 0.3;

          if (totalScore > bestScore && similarity >= this.minSimilarity) {
            bestScore = totalScore;
            bestMatch = result;
          }
        }

        if (bestMatch) {
          console.log(
            `  Best fuzzy match: "${bestMatch.Title}" (${bestMatch.Year}) - Score: ${(bestScore * 100).toFixed(0)}%`
          );
          // Fetch full details
          return await this.searchMovieByImdbId(bestMatch.imdbID);
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Generate title variations to try
   */
  private generateTitleVariations(title: string): string[] {
    const variations: string[] = [];

    // Remove "The", "A", "An" from beginning
    const withoutArticles = title.replace(/^(The|A|An)\s+/i, '');
    if (withoutArticles !== title) {
      variations.push(withoutArticles);
    }

    // Add "The" if not present
    if (!/^The\s+/i.test(title)) {
      variations.push(`The ${title}`);
    }

    // Replace special characters with spaces
    const normalized = title.replace(/[:\-_]/g, ' ').replace(/\s+/g, ' ').trim();
    if (normalized !== title) {
      variations.push(normalized);
    }

    // Remove year if accidentally left in title
    const withoutYear = title.replace(/\s*\(?\d{4}\)?/g, '').trim();
    if (withoutYear !== title) {
      variations.push(withoutYear);
    }

    // Try with ampersand variations
    if (title.includes('&')) {
      variations.push(title.replace(/&/g, 'and'));
    }
    if (title.includes(' and ')) {
      variations.push(title.replace(/ and /g, ' & '));
    }

    return variations;
  }

  /**
   * Aggressive cleaning for difficult cases
   */
  private aggressiveClean(title: string): string {
    return title
      .replace(/[^\w\s]/g, ' ') // Remove all special chars
      .replace(/\s+/g, ' ') // Collapse spaces
      .trim();
  }

  /**
   * Fetch by IMDB ID
   */
  async searchMovieByImdbId(imdbId: string): Promise<IMDBMovieData | null> {
    try {
      const response = await axios.get<IMDBMovieData>(this.baseUrl, {
        params: {
          apikey: this.apiKey,
          i: imdbId,
          plot: 'full',
        },
        timeout: 10000,
      });

      if (response.data.Response === 'True') {
        return response.data;
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Legacy method for backward compatibility
   */
  async searchMovie(title: string, year?: number): Promise<IMDBMovieData | null> {
    return this.searchMovieIntelligent(title, year);
  }
}
