import axios from 'axios';
import { getConfig } from '../config/env.config';

// TMDb API - FREE and MUCH better for international titles
// Get API key from: https://www.themoviedb.org/settings/api

interface TMDbMovie {
  id: number;
  title: string;
  original_title: string;
  release_date: string;
  vote_average: number;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  genre_ids: number[];
  original_language: string;
  popularity: number;
}

interface TMDbMovieDetails {
  id: number;
  imdb_id: string;
  title: string;
  original_title: string;
  release_date: string;
  vote_average: number;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  genres: { id: number; name: string }[];
  production_countries: { iso_3166_1: string; name: string }[];
  spoken_languages: { iso_639_1: string; name: string }[];
  runtime: number;
  tagline: string;
}

interface TMDbSearchResponse {
  results: TMDbMovie[];
  total_results: number;
}

export interface MovieData {
  title: string;
  originalTitle: string;
  year: number;
  imdbRating: number;
  imdbId: string;
  tmdbId: number;
  country: string;
  language: string;
  plot: string;
  genre: string;
  posterUrl: string;
  backdropUrl: string;
}

export class TMDbService {
  private readonly baseUrl = 'https://api.themoviedb.org/3';

  private get apiKey(): string {
    return getConfig().tmdbApiKey;
  }

  async searchMovie(title: string, year?: number): Promise<MovieData | null> {
    try {
      console.log(`🎬 TMDb search: "${title}"${year ? ` (${year})` : ''}`);

      // Search for movie
      const searchUrl = `${this.baseUrl}/search/movie`;
      const searchParams: any = {
        api_key: this.apiKey,
        query: title,
        language: 'en-US',
        include_adult: false,
      };

      if (year) {
        searchParams.year = year;
        searchParams.primary_release_year = year;
      }

      const searchResponse = await axios.get<TMDbSearchResponse>(searchUrl, {
        params: searchParams,
        timeout: 10000,
      });

      if (!searchResponse.data.results || searchResponse.data.results.length === 0) {
        // Try without year
        if (year) {
          console.log(`  No results with year, trying without...`);
          delete searchParams.year;
          delete searchParams.primary_release_year;
          const retryResponse = await axios.get<TMDbSearchResponse>(searchUrl, {
            params: searchParams,
            timeout: 10000,
          });
          if (retryResponse.data.results.length > 0) {
            return await this.getMovieDetails(retryResponse.data.results[0].id);
          }
        }
        console.log(`  ✗ No results found`);
        return null;
      }

      // Get best match
      const bestMatch = this.findBestMatch(searchResponse.data.results, title, year);
      if (!bestMatch) {
        console.log(`  ✗ No good match found`);
        return null;
      }

      console.log(`  ✓ Found: "${bestMatch.title}" (${bestMatch.release_date?.substring(0, 4)})`);

      // Get full details including IMDB ID
      return await this.getMovieDetails(bestMatch.id);
    } catch (error) {
      console.error(`  ✗ TMDb error:`, error instanceof Error ? error.message : error);
      return null;
    }
  }

  private findBestMatch(results: TMDbMovie[], searchTitle: string, searchYear?: number): TMDbMovie | null {
    if (results.length === 0) return null;

    // Sort by popularity and vote_average
    const sorted = results.sort((a, b) => {
      const aScore = a.popularity * 0.7 + a.vote_average * 0.3;
      const bScore = b.popularity * 0.7 + b.vote_average * 0.3;
      return bScore - aScore;
    });

    // If year provided, prefer exact year match
    if (searchYear) {
      const exactYearMatch = sorted.find((m) => {
        const movieYear = m.release_date ? parseInt(m.release_date.substring(0, 4)) : 0;
        return movieYear === searchYear;
      });
      if (exactYearMatch) return exactYearMatch;
    }

    // Return most popular
    return sorted[0];
  }

  private async getMovieDetails(tmdbId: number): Promise<MovieData | null> {
    try {
      const detailsUrl = `${this.baseUrl}/movie/${tmdbId}`;
      const response = await axios.get<TMDbMovieDetails>(detailsUrl, {
        params: {
          api_key: this.apiKey,
          language: 'en-US',
        },
        timeout: 10000,
      });

      const movie = response.data;
      const year = movie.release_date ? parseInt(movie.release_date.substring(0, 4)) : 0;

      // Get IMDB rating using IMDB ID
      let imdbRating = movie.vote_average; // TMDb rating as fallback
      if (movie.imdb_id) {
        const imdbData = await this.getIMDbRating(movie.imdb_id);
        if (imdbData) {
          imdbRating = imdbData;
        }
      }

      const movieData: MovieData = {
        title: movie.title,
        originalTitle: movie.original_title,
        year,
        imdbRating: Math.round(imdbRating * 10) / 10, // Round to 1 decimal
        imdbId: movie.imdb_id || `tmdb${tmdbId}`,
        tmdbId: movie.id,
        country: movie.production_countries[0]?.name || '',
        language: movie.spoken_languages[0]?.name || '',
        plot: movie.overview || '',
        genre: movie.genres.map((g) => g.name).join(', '),
        posterUrl: movie.poster_path
          ? `https://image.tmdb.org/t/p/original${movie.poster_path}` // Original = 4K quality
          : '',
        backdropUrl: movie.backdrop_path
          ? `https://image.tmdb.org/t/p/original${movie.backdrop_path}`
          : '',
      };

      return movieData;
    } catch (error) {
      console.error(`  ✗ Error getting movie details:`, error instanceof Error ? error.message : error);
      return null;
    }
  }

  private async getIMDbRating(imdbId: string): Promise<number | null> {
    try {
      // Use OMDb just for IMDB rating
      const omdbUrl = 'http://www.omdbapi.com/';
      const response = await axios.get(omdbUrl, {
        params: {
          apikey: '572052bc',
          i: imdbId,
        },
        timeout: 5000,
      });

      if (response.data.Response === 'True' && response.data.imdbRating !== 'N/A') {
        return parseFloat(response.data.imdbRating);
      }
    } catch (error) {
      // Ignore errors, use TMDb rating
    }
    return null;
  }

  async searchByOriginalTitle(originalTitle: string, year?: number): Promise<MovieData | null> {
    console.log(`  Trying original title search: "${originalTitle}"`);
    return await this.searchMovie(originalTitle, year);
  }
}
