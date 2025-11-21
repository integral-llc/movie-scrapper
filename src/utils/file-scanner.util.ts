import fs from 'fs';
import path from 'path';
import { MOVIE_EXTENSIONS, BDRIP_INDICATORS } from '../config/constants';
import { MovieFileInfo } from '../types/movie.types';

export class FileScanner {
  scanDirectory(directory: string): MovieFileInfo[] {
    const movies: MovieFileInfo[] = [];

    if (!fs.existsSync(directory)) {
      console.warn(`Directory does not exist: ${directory}`);
      return movies;
    }

    this.scanRecursive(directory, movies);
    return movies;
  }

  private scanRecursive(directory: string, movies: MovieFileInfo[]): void {
    try {
      const entries = fs.readdirSync(directory, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
          if (this.isBDRipFolder(fullPath)) {
            movies.push({
              fullPath,
              directory: path.dirname(fullPath),
              fileName: entry.name,
              extension: '',
              isFolder: true,
            });
          } else if (this.isTVSeriesFolder(fullPath)) {
            // Process TV series folder as a movie (for folder renaming)
            movies.push({
              fullPath,
              directory: path.dirname(fullPath),
              fileName: entry.name,
              extension: '',
              isFolder: true,
            });
            // Don't scan inside - skip the episode files
          } else {
            this.scanRecursive(fullPath, movies);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (MOVIE_EXTENSIONS.includes(ext)) {
            movies.push({
              fullPath,
              directory: path.dirname(fullPath),
              fileName: entry.name,
              extension: ext,
              isFolder: false,
            });
          }
        }
      }
    } catch (error) {
      console.error(`Error scanning directory ${directory}:`, error);
    }
  }

  private isBDRipFolder(folderPath: string): boolean {
    try {
      const entries = fs.readdirSync(folderPath, { withFileTypes: true });
      const folderNames = entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name.toLowerCase());

      return BDRIP_INDICATORS.some((indicator) => folderNames.includes(indicator));
    } catch {
      return false;
    }
  }

  private isTVSeriesFolder(folderPath: string): boolean {
    try {
      const entries = fs.readdirSync(folderPath, { withFileTypes: true });
      const videoFiles = entries
        .filter((e) => e.isFile())
        .filter((e) => {
          const ext = path.extname(e.name).toLowerCase();
          return MOVIE_EXTENSIONS.includes(ext);
        });

      // Check if folder contains multiple video files with episode numbering
      if (videoFiles.length < 2) return false;

      // Check if files have episode patterns:
      // - English: "01. Title", "S01E01", "Episode 1"
      // - Russian: "Title 01 сер", "серия 01", "сер. 01"
      const episodePattern = /^(\d{1,2})[.\s-]+|s\d{1,2}[.\s]?e\d{1,2}|\d{1,2}\s*сер|\bсерия\s*\d+|\bсер\.?\s*\d+/i;
      const episodeFiles = videoFiles.filter((f) => episodePattern.test(f.name));

      // If less than 50% have episode patterns, not a TV series
      if (episodeFiles.length < videoFiles.length / 2) return false;

      // Check if files look like movie collections (have years in parentheses)
      // Movie collections: "01-Movie Name (2014).mkv", "02-Another Movie (2017).mkv"
      // TV episodes: "01. Episode Title.mkv", "S01E01. Episode.mkv"
      const moviePattern = /\((?:19|20)\d{2}\)/; // Matches (YYYY) format
      const moviesWithYears = videoFiles.filter((f) => moviePattern.test(f.name));

      // If 50% or more have years, it's a movie collection, not TV series
      if (moviesWithYears.length >= videoFiles.length / 2) return false;

      // It's a TV series folder
      return true;
    } catch {
      return false;
    }
  }
}
