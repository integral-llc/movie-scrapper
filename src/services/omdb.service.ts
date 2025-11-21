import axios from 'axios';
import { getConfig } from '../config/env.config';
import { IMDBMovieData } from '../types/movie.types';

export class OMDBService {
  private readonly baseUrl = 'http://www.omdbapi.com/';

  private get apiKey(): string {
    return getConfig().omdbApiKey;
  }

  async searchMovie(title: string, year?: number): Promise<IMDBMovieData | null> {
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

      const response = await axios.get<IMDBMovieData>(this.baseUrl, { params });

      if (response.data.Response === 'True') {
        return response.data;
      }

      console.log(`Movie not found: ${title}${year ? ` (${year})` : ''}`);
      return null;
    } catch (error) {
      console.error(`Error searching movie in OMDB:`, error);
      return null;
    }
  }

  async searchMovieByImdbId(imdbId: string): Promise<IMDBMovieData | null> {
    try {
      const response = await axios.get<IMDBMovieData>(this.baseUrl, {
        params: {
          apikey: this.apiKey,
          i: imdbId,
          plot: 'full',
        },
      });

      if (response.data.Response === 'True') {
        return response.data;
      }

      return null;
    } catch (error) {
      console.error(`Error fetching movie by IMDB ID:`, error);
      return null;
    }
  }
}
