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
  vote_count: number;
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

interface TMDbTVShow {
  id: number;
  name: string;
  original_name: string;
  first_air_date: string;
  vote_average: number;
  vote_count: number;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  genre_ids: number[];
  original_language: string;
  popularity: number;
}

interface TMDbTVSearchResponse {
  results: TMDbTVShow[];
  total_results: number;
}

interface TMDbTVDetails {
  id: number;
  external_ids?: { imdb_id: string };
  name: string;
  original_name: string;
  first_air_date: string;
  vote_average: number;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  genres: { id: number; name: string }[];
  origin_country: string[];
  spoken_languages: { iso_639_1: string; name: string }[];
  number_of_seasons: number;
  number_of_episodes: number;
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

      // Search for movie - start WITHOUT year filter to get most popular results
      // Then use findBestMatch to filter by year
      const searchUrl = `${this.baseUrl}/search/movie`;
      const searchParams: any = {
        api_key: this.apiKey,
        query: title,
        language: 'en-US',
        include_adult: false,
      };

      // First search: no year filter to get all popular results
      const searchResponse = await axios.get<TMDbSearchResponse>(searchUrl, {
        params: searchParams,
        timeout: 10000,
      });

      let results = searchResponse.data.results || [];

      if (results.length === 0) {
        console.log(`  ✗ No results found`);
        return null;
      }

      // Get best match
      const bestMatch = this.findBestMatch(results, title, year);
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

    const normalizeTitle = (t: string) => t
      .toLowerCase()
      .replace(/^the\s+/i, '')
      .replace(/,\s*the$/i, '')
      .replace(/[^\w\s]/g, '')
      .trim();

    const normalizedSearch = normalizeTitle(searchTitle);

    // First, look for exact title matches only
    const exactMatches = results.filter((m) => {
      const n1 = normalizeTitle(m.title);
      const n2 = normalizeTitle(m.original_title);
      return n1 === normalizedSearch || n2 === normalizedSearch;
    });

    // If we have exact matches, use those; otherwise fall back to partial matches
    let candidates: TMDbMovie[];
    if (exactMatches.length > 0) {
      candidates = exactMatches;
    } else {
      // Look for close title matches (prefix/suffix)
      const partialMatches = results.filter((m) => {
        const n1 = normalizeTitle(m.title);
        const n2 = normalizeTitle(m.original_title);
        return n1.startsWith(normalizedSearch + ' ') || n2.startsWith(normalizedSearch + ' ') ||
               normalizedSearch.startsWith(n1 + ' ') || normalizedSearch.startsWith(n2 + ' ');
      });
      candidates = partialMatches.length > 0 ? partialMatches : results;
    }

    // Filter by year if provided (within 1 year tolerance)
    if (searchYear) {
      const yearMatches = candidates.filter((m) => {
        const movieYear = m.release_date ? parseInt(m.release_date.substring(0, 4)) : 0;
        return Math.abs(movieYear - searchYear) <= 1;
      });
      if (yearMatches.length > 0) {
        candidates = yearMatches;
      }
    }

    // Score and sort candidates - prioritize:
    // 1. English language films (most file names are in English)
    // 2. Vote count (indicates more well-known films)
    // 3. Popularity
    // 4. Vote average
    const scored = candidates.map((m) => {
      let score = 0;

      // English language bonus (significant boost)
      if (m.original_language === 'en') {
        score += 1000;
      }

      // Vote count is most important indicator of well-known films
      // Use log scale to prevent extremely popular films from dominating
      const voteCountScore = Math.log10(Math.max(m.vote_count || 1, 1)) * 100;
      score += voteCountScore;

      // Popularity adds to score
      score += m.popularity * 0.5;

      // Vote average adds a small bonus
      score += m.vote_average * 5;

      return { movie: m, score };
    });

    scored.sort((a, b) => b.score - a.score);

    // Log top candidates for debugging
    if (scored.length > 1) {
      console.log(`  TMDb candidates for "${searchTitle}":`);
      scored.slice(0, 3).forEach((s, i) => {
        const year = s.movie.release_date?.substring(0, 4) || '????';
        console.log(`    ${i + 1}. "${s.movie.title}" (${year}) [${s.movie.original_language}] votes:${s.movie.vote_count || 0} pop:${s.movie.popularity?.toFixed(1)} score:${s.score.toFixed(0)}`);
      });
    }

    return scored[0]?.movie || null;
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

  async searchTV(title: string): Promise<MovieData | null> {
    try {
      console.log(`📺 TMDb TV search: "${title}"`);

      const searchUrl = `${this.baseUrl}/search/tv`;
      const searchParams = {
        api_key: this.apiKey,
        query: title,
        language: 'en-US',
        include_adult: false,
      };

      const searchResponse = await axios.get<TMDbTVSearchResponse>(searchUrl, {
        params: searchParams,
        timeout: 10000,
      });

      const results = searchResponse.data.results || [];

      if (results.length === 0) {
        console.log(`  ✗ No TV results found`);
        return null;
      }

      // Find best match - prefer exact title matches
      const normalizeTitle = (t: string) => t
        .toLowerCase()
        .replace(/^the\s+/i, '')
        .replace(/,\s*the$/i, '')
        .replace(/[^\w\s]/g, '')
        .trim();

      const normalizedSearch = normalizeTitle(title);

      // Score and sort results
      const scored = results.map((show) => {
        let score = 0;
        const n1 = normalizeTitle(show.name);
        const n2 = normalizeTitle(show.original_name);

        // Exact match bonus
        if (n1 === normalizedSearch || n2 === normalizedSearch) {
          score += 2000;
        } else if (n1.includes(normalizedSearch) || n2.includes(normalizedSearch)) {
          score += 1000;
        }

        // English language bonus
        if (show.original_language === 'en') {
          score += 500;
        }

        // Vote count (popularity indicator)
        score += Math.log10(Math.max(show.vote_count || 1, 1)) * 100;
        score += show.popularity * 0.5;
        score += show.vote_average * 5;

        return { show, score };
      });

      scored.sort((a, b) => b.score - a.score);

      const bestMatch = scored[0]?.show;
      if (!bestMatch) {
        console.log(`  ✗ No good TV match found`);
        return null;
      }

      console.log(`  ✓ Found TV: "${bestMatch.name}" (${bestMatch.first_air_date?.substring(0, 4)})`);

      // Get full details
      return await this.getTVDetails(bestMatch.id);
    } catch (error) {
      console.error(`  ✗ TMDb TV error:`, error instanceof Error ? error.message : error);
      return null;
    }
  }

  private async getTVDetails(tmdbId: number): Promise<MovieData | null> {
    try {
      const detailsUrl = `${this.baseUrl}/tv/${tmdbId}`;
      const response = await axios.get<TMDbTVDetails>(detailsUrl, {
        params: {
          api_key: this.apiKey,
          language: 'en-US',
          append_to_response: 'external_ids',
        },
        timeout: 10000,
      });

      const show = response.data;
      const year = show.first_air_date ? parseInt(show.first_air_date.substring(0, 4)) : 0;

      const movieData: MovieData = {
        title: show.name,
        originalTitle: show.original_name,
        year,
        imdbRating: Math.round(show.vote_average * 10) / 10,
        imdbId: show.external_ids?.imdb_id || `tmdb-tv${tmdbId}`,
        tmdbId: show.id,
        country: show.origin_country[0] || '',
        language: show.spoken_languages[0]?.name || '',
        plot: show.overview || '',
        genre: show.genres.map((g) => g.name).join(', '),
        posterUrl: show.poster_path
          ? `https://image.tmdb.org/t/p/original${show.poster_path}`
          : '',
        backdropUrl: show.backdrop_path
          ? `https://image.tmdb.org/t/p/original${show.backdrop_path}`
          : '',
      };

      return movieData;
    } catch (error) {
      console.error(`  ✗ Error getting TV details:`, error instanceof Error ? error.message : error);
      return null;
    }
  }
}
