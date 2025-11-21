import fs from 'fs';
import path from 'path';
import { MovieRepository } from '../repositories/movie.repository';
import { OMDBEnhancedService } from './omdb-enhanced.service';
import { TranslateService } from './translate.service';
import { FileRenamerService } from './file-renamer.service';
import { KodiService } from './kodi.service';
import { FileScanner } from '../utils/file-scanner.util';
import { MovieNameParser } from '../utils/movie-name-parser.util';
import { Movie, MovieFileInfo, ScanResult } from '../types/movie.types';
import { CYRILLIC_COUNTRIES, ROMANIAN_COUNTRIES } from '../config/constants';
import { getConfig } from '../config/env.config';

export class MovieScannerService {
  private movieRepo: MovieRepository;
  private omdbService: OMDBEnhancedService;
  private translateService: TranslateService;
  private fileRenamer: FileRenamerService;
  private kodiService: KodiService;
  private fileScanner: FileScanner;
  private nameParser: MovieNameParser;

  constructor() {
    this.movieRepo = new MovieRepository();
    this.omdbService = new OMDBEnhancedService();
    this.translateService = new TranslateService();
    this.fileRenamer = new FileRenamerService();
    this.kodiService = new KodiService();
    this.fileScanner = new FileScanner();
    this.nameParser = new MovieNameParser();
  }

  async scanMovies(): Promise<ScanResult> {
    const result: ScanResult = {
      scanned: 0,
      updated: 0,
      created: 0,
      deleted: 0,
      errors: 0,
    };

    const folders = this.readMovieFolders();
    if (folders.length === 0) {
      console.log('No folders to scan. Check movies.txt file.');
      return result;
    }

    const allMovieFiles: MovieFileInfo[] = [];
    for (const folder of folders) {
      const files = this.fileScanner.scanDirectory(folder);
      allMovieFiles.push(...files);
    }

    console.log(`Found ${allMovieFiles.length} movie files/folders`);

    const currentPaths = new Set<string>();

    for (const fileInfo of allMovieFiles) {
      result.scanned++;
      currentPaths.add(fileInfo.fullPath);

      try {
        await this.processMovieFile(fileInfo, result);
      } catch (error) {
        result.errors++;
        console.error(`Error processing ${fileInfo.fullPath}:`, error);
      }
    }

    const deletedCount = this.markDeletedMovies(currentPaths);
    result.deleted = deletedCount;

    return result;
  }

  private async processMovieFile(fileInfo: MovieFileInfo, result: ScanResult): Promise<void> {
    const existingMovie = this.movieRepo.findByPath(fileInfo.fullPath);

    if (existingMovie) {
      existingMovie.lastScanned = new Date().toISOString();
      existingMovie.updatedAt = new Date().toISOString();
      this.movieRepo.update(existingMovie.id!, existingMovie);
      result.updated++;
      return;
    }

    const { cleanName, year } = this.nameParser.cleanMovieName(fileInfo.fileName);
    console.log(`Processing: ${cleanName}${year ? ` (${year})` : ''}`);

    const detectedLanguage = this.translateService.detectLanguage(cleanName);
    let searchTitle = cleanName;

    if (detectedLanguage !== 'en') {
      searchTitle = await this.translateService.translateToEnglish(cleanName, detectedLanguage);
      console.log(`Translated to English: ${searchTitle}`);
    }

    const imdbData = await this.omdbService.searchMovie(searchTitle, year);

    if (!imdbData) {
      console.log(`Could not find IMDB data for: ${searchTitle}`);
      this.createErrorMovie(fileInfo, 'IMDB data not found');
      result.errors++;
      return;
    }

    const movieYear = parseInt(imdbData.Year, 10);
    const imdbRating = parseFloat(imdbData.imdbRating);

    if (isNaN(imdbRating)) {
      console.log(`Invalid IMDB rating for: ${searchTitle}`);
      this.createErrorMovie(fileInfo, 'Invalid IMDB rating');
      result.errors++;
      return;
    }

    const mainCountry = this.extractMainCountry(imdbData.Country);
    let finalTitle = imdbData.Title;

    if (this.shouldUseRussian(mainCountry)) {
      finalTitle = await this.translateService.translateToRussian(imdbData.Title);
      console.log(`Translated to Russian: ${finalTitle}`);
    } else if (this.shouldUseRomanian(mainCountry)) {
      finalTitle = await this.translateService.translateToRomanian(imdbData.Title);
      console.log(`Translated to Romanian: ${finalTitle}`);
    }

    const newFileName = this.nameParser.buildFileName(
      finalTitle,
      movieYear,
      imdbRating,
      fileInfo.isFolder ? '' : fileInfo.extension
    );

    const renameResult = this.fileRenamer.renameFile(fileInfo.fullPath, newFileName);

    const movie: Omit<Movie, 'id'> = {
      originalPath: fileInfo.fullPath,
      currentPath: renameResult.success ? renameResult.newPath! : fileInfo.fullPath,
      fileName: renameResult.success ? newFileName : fileInfo.fileName,
      originalFileName: fileInfo.fileName,
      title: finalTitle,
      year: movieYear,
      imdbRating,
      imdbId: imdbData.imdbID,
      country: mainCountry,
      language: imdbData.Language,
      plot: imdbData.Plot,
      genre: imdbData.Genre,
      director: imdbData.Director,
      actors: imdbData.Actors,
      posterUrl: imdbData.Poster !== 'N/A' ? imdbData.Poster : undefined,
      isFolder: fileInfo.isFolder,
      lastScanned: new Date().toISOString(),
      status: 'active',
      errorMessage: renameResult.success ? undefined : renameResult.error,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const createdMovie = this.movieRepo.create(movie);
    result.created++;

    if (renameResult.success) {
      const directory = path.dirname(renameResult.newPath!);
      await this.kodiService.createNFOFile(createdMovie, directory);
      await this.kodiService.downloadPoster(createdMovie, directory);
    }

    console.log(`✓ Processed: ${finalTitle} (${movieYear}) - IMDB ${imdbRating}`);
  }

  private createErrorMovie(fileInfo: MovieFileInfo, errorMessage: string): void {
    const movie: Omit<Movie, 'id'> = {
      originalPath: fileInfo.fullPath,
      currentPath: fileInfo.fullPath,
      fileName: fileInfo.fileName,
      originalFileName: fileInfo.fileName,
      title: fileInfo.fileName,
      year: 0,
      imdbRating: 0,
      imdbId: '',
      country: '',
      language: '',
      isFolder: fileInfo.isFolder,
      lastScanned: new Date().toISOString(),
      status: 'error',
      errorMessage,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.movieRepo.create(movie);
  }

  private markDeletedMovies(currentPaths: Set<string>): number {
    const activePaths = this.movieRepo.getAllActivePaths();
    let deletedCount = 0;

    for (const dbPath of activePaths) {
      if (!currentPaths.has(dbPath)) {
        this.movieRepo.markAsDeleted(dbPath);
        deletedCount++;
        console.log(`Marked as deleted: ${dbPath}`);
      }
    }

    return deletedCount;
  }

  private readMovieFolders(): string[] {
    const moviesTxtPath = getConfig().moviesTxtPath;
    if (!fs.existsSync(moviesTxtPath)) {
      console.warn(`movies.txt not found at: ${moviesTxtPath}`);
      return [];
    }

    const content = fs.readFileSync(moviesTxtPath, 'utf-8');
    return content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
  }

  private extractMainCountry(countries: string): string {
    if (!countries) return '';
    return countries.split(',')[0]?.trim() || '';
  }

  private shouldUseRussian(country: string): boolean {
    return CYRILLIC_COUNTRIES.some((c) => country.toLowerCase().includes(c.toLowerCase()));
  }

  private shouldUseRomanian(country: string): boolean {
    return ROMANIAN_COUNTRIES.some((c) => country.toLowerCase().includes(c.toLowerCase()));
  }
}
