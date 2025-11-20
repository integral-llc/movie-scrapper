import fs from 'fs';
import path from 'path';
import { MovieRepository } from '../repositories/movie.repository';
import { TMDbService } from './tmdb.service';
import { TranslateService } from './translate.service';
import { FileRenamerService } from './file-renamer.service';
import { KodiService } from './kodi.service';
import { PosterService } from './poster.service';
import { FileScanner } from '../utils/file-scanner.util';
import { MovieNameParser } from '../utils/movie-name-parser.util';
import { Movie, MovieFileInfo, ScanResult } from '../types/movie.types';
import { CYRILLIC_COUNTRIES, ROMANIAN_COUNTRIES } from '../config/constants';
import { config } from '../config/env.config';

export class MovieScannerTMDbService {
  private movieRepo: MovieRepository;
  private tmdbService: TMDbService;
  private translateService: TranslateService;
  private fileRenamer: FileRenamerService;
  private kodiService: KodiService;
  private posterService: PosterService;
  private fileScanner: FileScanner;
  private nameParser: MovieNameParser;

  constructor() {
    this.movieRepo = new MovieRepository();
    this.tmdbService = new TMDbService();
    this.translateService = new TranslateService();
    this.fileRenamer = new FileRenamerService();
    this.kodiService = new KodiService();
    this.posterService = new PosterService();
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
        await this.processMovieFile(fileInfo, result, currentPaths);
      } catch (error) {
        result.errors++;
        console.error(`Error processing ${fileInfo.fullPath}:`, error);
      }
    }

    const deletedCount = this.markDeletedMovies(currentPaths);
    result.deleted = deletedCount;

    return result;
  }

  private async processMovieFile(
    fileInfo: MovieFileInfo,
    result: ScanResult,
    currentPaths: Set<string>
  ): Promise<void> {
    const existingMovie = this.movieRepo.findByPath(fileInfo.fullPath);

    if (existingMovie && existingMovie.status === 'active') {
      // Check if poster needs to be regenerated
      if (!existingMovie.posterUrl || existingMovie.posterUrl === 'N/A') {
        console.log(`\nRegenerating poster for: ${existingMovie.fileName}`);
        // Search TMDb again to get poster URL
        const { cleanName, year } = this.nameParser.cleanMovieName(existingMovie.fileName);
        const movieData = await this.tmdbService.searchMovie(cleanName, year);

        if (movieData && movieData.posterUrl) {
          const directory = path.dirname(fileInfo.fullPath);
          const extension = path.extname(fileInfo.fullPath);
          const baseFileName = existingMovie.fileName.replace(extension, '');
          const posterPath = path.join(directory, `${baseFileName}-poster.jpg`);

          await this.posterService.downloadAndWatermarkPoster(
            movieData.posterUrl,
            posterPath,
            existingMovie.imdbRating
          );

          existingMovie.posterUrl = movieData.posterUrl;
        }
      }

      // Update only specific fields to avoid SQLite binding errors
      this.movieRepo.update(existingMovie.id!, {
        posterUrl: existingMovie.posterUrl,
        lastScanned: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      result.updated++;
      return;
    }

    // If movie exists but is in error or deleted status, treat it as a new movie
    // by deleting the old record and processing fresh
    if (existingMovie) {
      console.log(`  Existing ${existingMovie.status} record found, reprocessing...`);
      this.movieRepo.delete(existingMovie.id!);
    }

    const { cleanName, year, isTVEpisode, isAudioFile } = this.nameParser.cleanMovieName(fileInfo.fileName);

    // Skip TV episodes
    if (isTVEpisode) {
      console.log(`\nSkipping TV episode: ${fileInfo.fileName}`);
      this.createErrorMovie(fileInfo, 'TV episode - not a movie');
      result.errors++;
      return;
    }

    // Skip audio/music files
    if (isAudioFile) {
      console.log(`\nSkipping audio file: ${fileInfo.fileName}`);
      this.createErrorMovie(fileInfo, 'Audio/music file - not a movie');
      result.errors++;
      return;
    }

    console.log(`\nProcessing: ${cleanName}${year ? ` (${year})` : ''}`);

    const detectedLanguage = this.translateService.detectLanguage(cleanName);
    let searchTitle = cleanName;
    let originalTitle = cleanName;

    // Try original title FIRST (TMDb handles international titles!)
    let movieData = await this.tmdbService.searchMovie(cleanName, year);

    // If not found and non-English
    if (!movieData && detectedLanguage !== 'en') {
      // For Russian titles, don't translate - just keep original
      if (detectedLanguage === 'ru') {
        console.log(`  ✗ Russian title not found in TMDb - preserving original name`);
        const extension = fileInfo.isFolder ? '' : path.extname(fileInfo.fullPath);
        const newFileName = this.buildMissingMovieFileName(cleanName, year, extension);
        const renameResult = this.fileRenamer.renameFile(fileInfo.fullPath, newFileName);

        const movie: Omit<Movie, 'id'> = {
          originalPath: fileInfo.fullPath,
          currentPath: renameResult.success ? renameResult.newPath! : fileInfo.fullPath,
          fileName: renameResult.success ? newFileName : fileInfo.fileName,
          originalFileName: fileInfo.fileName,
          title: cleanName,
          year: year || 0,
          imdbRating: 0,
          imdbId: '',
          country: 'Russia',
          language: 'Russian',
          plot: undefined,
          genre: undefined,
          director: undefined,
          actors: undefined,
          posterUrl: undefined,
          isFolder: fileInfo.isFolder,
          lastScanned: new Date().toISOString(),
          status: 'active',
          errorMessage: undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        this.movieRepo.create(movie);
        result.created++;

        // Update currentPaths with renamed path
        if (renameResult.success && renameResult.newPath) {
          currentPaths.delete(fileInfo.fullPath);
          currentPaths.add(renameResult.newPath);
        }

        console.log(`  ✓ ${cleanName} (${year}) - Russian title preserved`);
        return;
      }

      // For other languages, try translation
      console.log(`  Original title not found, translating...`);
      searchTitle = await this.translateService.translateToEnglish(cleanName, detectedLanguage);
      console.log(`  Translated: ${searchTitle}`);
      movieData = await this.tmdbService.searchMovie(searchTitle, year);
    }

    if (!movieData) {
      console.log(`  ✗ Could not find movie in TMDb`);

      // For TV series folders not found, preserve original name (likely regional content)
      if (fileInfo.isFolder) {
        console.log(`  Preserving original folder name for TV series`);

        // If transliterated Russian (Latin), convert to Cyrillic
        let finalName = cleanName;
        if (detectedLanguage === 'en' && this.looksLikeTransliteratedRussian(cleanName)) {
          console.log(`  Transliterated Russian detected, converting to Cyrillic...`);
          finalName = await this.translateService.translateToRussian(cleanName);
          console.log(`  Cyrillic: ${finalName}`);
        }

        const extension = fileInfo.isFolder ? '' : path.extname(fileInfo.fullPath);
        const newFileName = this.buildMissingMovieFileName(finalName, year, extension);
        const renameResult = this.fileRenamer.renameFile(fileInfo.fullPath, newFileName);

        const movie: Omit<Movie, 'id'> = {
          originalPath: fileInfo.fullPath,
          currentPath: renameResult.success ? renameResult.newPath! : fileInfo.fullPath,
          fileName: renameResult.success ? newFileName : fileInfo.fileName,
          originalFileName: fileInfo.fileName,
          title: finalName,
          year: year || 0,
          imdbRating: 0,
          imdbId: '',
          country: '',
          language: '',
          isFolder: fileInfo.isFolder,
          lastScanned: new Date().toISOString(),
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        this.movieRepo.create(movie);
        result.created++;

        // Update currentPaths with renamed path
        if (renameResult.success && renameResult.newPath) {
          currentPaths.delete(fileInfo.fullPath);
          currentPaths.add(renameResult.newPath);
        }

        console.log(`  ✓ ${finalName} (${year}) - TV series folder preserved`);
        return;
      }

      // Russian titles already handled above before translation
      this.createErrorMovie(fileInfo, 'Movie not found in TMDb');
      result.errors++;
      return;
    }

    const mainCountry = movieData.country;
    let finalTitle = movieData.title;

    // For Russian/Romanian movies, use original title or translate
    if (this.shouldUseRussian(mainCountry)) {
      if (detectedLanguage === 'ru') {
        finalTitle = cleanName; // Keep original Russian name
      } else {
        finalTitle = await this.translateService.translateToRussian(movieData.title);
      }
      console.log(`  Using Russian: ${finalTitle}`);
    } else if (this.shouldUseRomanian(mainCountry)) {
      if (detectedLanguage === 'ro') {
        finalTitle = cleanName;
      } else {
        finalTitle = await this.translateService.translateToRomanian(movieData.title);
      }
      console.log(`  Using Romanian: ${finalTitle}`);
    }

    const extension = fileInfo.isFolder ? '' : path.extname(fileInfo.fullPath);
    const newFileName = this.nameParser.buildFileName(
      finalTitle,
      movieData.year,
      movieData.imdbRating,
      extension
    );

    const renameResult = this.fileRenamer.renameFile(fileInfo.fullPath, newFileName);

    const movie: Omit<Movie, 'id'> = {
      originalPath: fileInfo.fullPath,
      currentPath: renameResult.success ? renameResult.newPath! : fileInfo.fullPath,
      fileName: renameResult.success ? newFileName : fileInfo.fileName,
      originalFileName: fileInfo.fileName,
      title: finalTitle,
      year: movieData.year,
      imdbRating: movieData.imdbRating,
      imdbId: movieData.imdbId,
      country: movieData.country,
      language: movieData.language,
      plot: movieData.plot,
      genre: movieData.genre,
      director: '', // TMDb doesn't provide in basic search
      actors: '', // TMDb doesn't provide in basic search
      posterUrl: movieData.posterUrl,
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

      // Update currentPaths with renamed path
      currentPaths.delete(fileInfo.fullPath);
      currentPaths.add(renameResult.newPath!);

      // Create NFO
      await this.kodiService.createNFOFile(createdMovie, directory);

      // Download 4K poster with IMDB watermark
      if (movieData.posterUrl) {
        const baseFileName = newFileName.replace(extension, '');
        const posterPath = path.join(directory, `${baseFileName}-poster.jpg`);
        await this.posterService.downloadAndWatermarkPoster(
          movieData.posterUrl,
          posterPath,
          movieData.imdbRating
        );
      }
    }

    console.log(`  ✓ ${finalTitle} (${movieData.year}) - IMDB ${movieData.imdbRating}`);
  }

  private buildMissingMovieFileName(title: string, year: number | undefined, extension: string): string {
    // For missing movies, just add year if available
    if (year) {
      return `${title} (${year})${extension}`;
    }
    return `${title}${extension}`;
  }

  private looksLikeTransliteratedRussian(text: string): boolean {
    // Common patterns in transliterated Russian: -yj endings, shch, zh, kh, etc.
    const translitPatterns = [
      /yj\b/i,      // -yj ending (волшебный = volshebnyj)
      /shch/i,      // щ = shch
      /zh/i,        // ж = zh
      /kh/i,        // х = kh
      /uchastok/i,  // участок (common word)
      /volsheb/i,   // волшеб (magic-related)
      /lyudi/i,     // люди (people)
      /zlye/i,      // злые (evil/bad)
    ];

    return translitPatterns.some(pattern => pattern.test(text));
  }

  private createErrorMovie(fileInfo: MovieFileInfo, errorMessage: string): void {
    // Check if already exists (avoid UNIQUE constraint error)
    const existing = this.movieRepo.findByPath(fileInfo.fullPath);
    if (existing) {
      // Update existing error record
      this.movieRepo.update(existing.id!, {
        errorMessage,
        status: 'error',
        lastScanned: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return;
    }

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
    if (!fs.existsSync(config.moviesTxtPath)) {
      console.warn(`movies.txt not found at: ${config.moviesTxtPath}`);
      return [];
    }

    const content = fs.readFileSync(config.moviesTxtPath, 'utf-8');
    return content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
  }

  private shouldUseRussian(country: string): boolean {
    return CYRILLIC_COUNTRIES.some((c) => country.toLowerCase().includes(c.toLowerCase()));
  }

  private shouldUseRomanian(country: string): boolean {
    return ROMANIAN_COUNTRIES.some((c) => country.toLowerCase().includes(c.toLowerCase()));
  }
}
