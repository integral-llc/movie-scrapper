import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { Movie } from '../types/movie.types';

export class KodiService {
  async createNFOFile(movie: Movie, directory: string): Promise<boolean> {
    try {
      const baseFileName = movie.fileName.replace(path.extname(movie.fileName), '');

      // Remove old NFO files with different ratings for the same movie
      this.cleanupOldFiles(directory, movie.title, baseFileName, '.nfo');

      const nfoContent = this.generateNFOContent(movie);
      const nfoPath = path.join(directory, `${baseFileName}.nfo`);

      fs.writeFileSync(nfoPath, nfoContent, 'utf-8');
      console.log(`NFO file created: ${nfoPath}`);
      return true;
    } catch (error) {
      console.error('Error creating NFO file:', error);
      return false;
    }
  }

  async downloadPoster(movie: Movie, directory: string): Promise<boolean> {
    if (!movie.posterUrl || movie.posterUrl === 'N/A') {
      return false;
    }

    try {
      const baseFileName = movie.fileName.replace(path.extname(movie.fileName), '');

      // Remove old poster files with different ratings for the same movie
      this.cleanupOldFiles(directory, movie.title, baseFileName, '-poster.jpg');

      const response = await axios.get(movie.posterUrl, {
        responseType: 'arraybuffer',
        timeout: 10000,
      });

      const posterPath = path.join(directory, `${baseFileName}-poster.jpg`);

      fs.writeFileSync(posterPath, response.data);
      console.log(`Poster downloaded: ${posterPath}`);
      return true;
    } catch (error) {
      console.error('Error downloading poster:', error);
      return false;
    }
  }

  private generateNFOContent(movie: Movie): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<movie>
  <title>${this.escapeXml(movie.title)}</title>
  <originaltitle>${this.escapeXml(movie.title)}</originaltitle>
  <year>${movie.year}</year>
  <rating>${movie.imdbRating}</rating>
  <plot>${this.escapeXml(movie.plot || '')}</plot>
  <tagline></tagline>
  <runtime>0</runtime>
  <thumb>${this.escapeXml(movie.posterUrl || '')}</thumb>
  <fanart>
    <thumb>${this.escapeXml(movie.posterUrl || '')}</thumb>
  </fanart>
  <mpaa></mpaa>
  <id>${movie.imdbId}</id>
  <genre>${this.escapeXml(movie.genre || '')}</genre>
  <country>${this.escapeXml(movie.country || '')}</country>
  <director>${this.escapeXml(movie.director || '')}</director>
  ${this.generateActorTags(movie.actors || '')}
</movie>`;
  }

  private generateActorTags(actors: string): string {
    if (!actors) return '';

    return actors
      .split(',')
      .map((actor) => actor.trim())
      .filter((actor) => actor)
      .map(
        (actor) => `  <actor>
    <name>${this.escapeXml(actor)}</name>
  </actor>`
      )
      .join('\n');
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Remove old NFO/poster files with different IMDB ratings for the same movie
   */
  private cleanupOldFiles(directory: string, movieTitle: string, currentFileName: string, suffix: string): void {
    try {
      // Extract title without IMDB rating from current filename
      const titleMatch = currentFileName.match(/^(.+?)\s*\((?:19|20)\d{4}\)\s*\(IMDB/);
      if (!titleMatch) return;

      const baseTitle = titleMatch[1];

      // Find all files with same title but different IMDB ratings
      const files = fs.readdirSync(directory);
      const pattern = new RegExp(`^${this.escapeRegex(baseTitle)}\\s*\\((?:19|20)\\d{4}\\)\\s*\\(IMDB\\s*[0-9.]+\\)${this.escapeRegex(suffix)}$`);

      files.forEach(file => {
        if (pattern.test(file) && file !== currentFileName + suffix) {
          const filePath = path.join(directory, file);
          try {
            fs.unlinkSync(filePath);
            console.log(`  Removed old file: ${file}`);
          } catch (err) {
            // Ignore errors (file might not exist or be locked)
          }
        }
      });
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
