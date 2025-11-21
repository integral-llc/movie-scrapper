import fs from 'fs';
import path from 'path';
import { MovieRepository } from '../repositories/movie.repository';
import { TMDbService } from './tmdb.service';
import { TranslateService } from './translate.service';
import { FileRenamerService } from './file-renamer.service';
import { KodiService } from './kodi.service';
import { PosterService } from './poster.service';
import { AIMovieParserService } from './ai-movie-parser.service';
import { FileScanner } from '../utils/file-scanner.util';
import { MovieNameParser } from '../utils/movie-name-parser.util';
import { Movie, MovieFileInfo, ScanResult } from '../types/movie.types';
import { CYRILLIC_COUNTRIES, ROMANIAN_COUNTRIES } from '../config/constants';
import { getConfig } from '../config/env.config';

export class MovieScannerTMDbService {
  private movieRepo: MovieRepository;
  private tmdbService: TMDbService;
  private translateService: TranslateService;
  private fileRenamer: FileRenamerService;
  private kodiService: KodiService;
  private posterService: PosterService;
  private fileScanner: FileScanner;
  private nameParser: MovieNameParser;
  private aiParser: AIMovieParserService;

  constructor() {
    this.movieRepo = new MovieRepository();
    this.tmdbService = new TMDbService();
    this.translateService = new TranslateService();
    this.fileRenamer = new FileRenamerService();
    this.kodiService = new KodiService();
    this.posterService = new PosterService();
    this.fileScanner = new FileScanner();
    this.nameParser = new MovieNameParser();
    this.aiParser = new AIMovieParserService();
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

    // Quick pre-check for obvious demo/test files (skip AI parsing for these)
    const demoPatterns = /atmos\s*(mix|test)|sg\s*dar|demo\s*test|audio\s*test|test\s*file/i;
    if (demoPatterns.test(fileInfo.fileName) || demoPatterns.test(fileInfo.fullPath)) {
      console.log(`\nSkipping demo/test file: ${fileInfo.fileName}`);
      this.createErrorMovie(fileInfo, 'Demo/test file - not a movie');
      result.errors++;
      return;
    }

    // Use AI to parse the filename intelligently
    console.log(`\nAnalyzing: ${fileInfo.fileName}`);
    const aiParsed = await this.aiParser.parseFileName(fileInfo.fileName);

    const cleanName = aiParsed.title;
    const year = aiParsed.year;

    // Skip TV episodes (AI detection)
    if (aiParsed.isTVEpisode) {
      console.log(`  AI detected TV episode (confidence: ${aiParsed.confidence})`);
      this.createErrorMovie(fileInfo, 'TV episode - not a movie');
      result.errors++;
      return;
    }

    // Skip audio/music files (AI detection)
    if (aiParsed.isAudioFile) {
      console.log(`  AI detected audio file (confidence: ${aiParsed.confidence})`);
      this.createErrorMovie(fileInfo, 'Audio/music file - not a movie');
      result.errors++;
      return;
    }

    console.log(`  AI parsed: "${cleanName}"${year ? ` (${year})` : ''} [confidence: ${aiParsed.confidence}]`);

    const detectedLanguage = this.translateService.detectLanguage(cleanName);
    let searchTitle = cleanName;
    let originalTitle = cleanName;

    // Try AI-powered IMDB search FIRST for better accuracy
    console.log(`  Searching IMDB directly...`);
    const imdbResult = await this.aiParser.searchIMDb(cleanName, year);

    let movieData = null;

    if (imdbResult && imdbResult.rating > 0) {
      // Found on IMDB - use TMDb to get additional metadata
      console.log(`  ✓ IMDB found: ${imdbResult.title} (${imdbResult.year}) - Rating ${imdbResult.rating}`);
      const tmdbData = await this.tmdbService.searchMovie(imdbResult.title, imdbResult.year);

      // Validate that TMDb result matches IMDB result (title similarity check)
      if (tmdbData && this.isTitleMatch(imdbResult.title, tmdbData.title)) {
        movieData = tmdbData;
        // Override with accurate IMDB data
        movieData.imdbRating = imdbResult.rating;
        movieData.imdbId = imdbResult.imdbId;
        if (imdbResult.posterUrl && !movieData.posterUrl) {
          movieData.posterUrl = imdbResult.posterUrl;
        }
        console.log(`  TMDb metadata enriched: ${tmdbData.title}`);
      } else {
        // TMDb returned a different movie or nothing - use IMDB data only
        if (tmdbData) {
          console.log(`  TMDb returned different movie: "${tmdbData.title}" - using IMDB data instead`);
        } else {
          console.log(`  TMDb doesn't have this movie, using IMDB data only`);
        }
        movieData = {
          title: imdbResult.title,
          originalTitle: imdbResult.title,
          year: imdbResult.year,
          imdbRating: imdbResult.rating,
          imdbId: imdbResult.imdbId,
          tmdbId: 0,
          country: '',
          language: '',
          plot: '',
          genre: '',
          posterUrl: imdbResult.posterUrl || '',
          backdropUrl: '',
        };
      }
    } else {
      // IMDB search failed, fall back to TMDb
      console.log(`  IMDB search failed, trying TMDb...`);
      movieData = await this.tmdbService.searchMovie(cleanName, year);
    }

    // If not found and non-English
    if (!movieData && detectedLanguage !== 'en') {
      // For Russian titles, don't translate - try IMDB directly with AI
      if (detectedLanguage === 'ru') {
        console.log(`  ✗ Russian title not found in TMDb - searching IMDB directly...`);

        // Try AI-powered IMDB search
        const imdbResult = await this.aiParser.searchIMDb(cleanName, year);

        let finalRating = 0;
        let finalImdbId = '';
        let finalPosterUrl: string | undefined;

        if (imdbResult) {
          console.log(`  ✓ Found on IMDB: ${imdbResult.title} (${imdbResult.year}) - Rating ${imdbResult.rating}`);
          finalRating = imdbResult.rating;
          finalImdbId = imdbResult.imdbId;
          finalPosterUrl = imdbResult.posterUrl;
        } else {
          console.log(`  ✗ Not found on IMDB either - preserving original name`);
        }

        const extension = fileInfo.isFolder ? '' : path.extname(fileInfo.fullPath);
        const newFileName = finalRating > 0
          ? this.nameParser.buildFileName(cleanName, year || 0, finalRating, extension)
          : this.buildMissingMovieFileName(cleanName, year, extension);
        const renameResult = this.fileRenamer.renameFile(fileInfo.fullPath, newFileName);

        const movie: Omit<Movie, 'id'> = {
          originalPath: fileInfo.fullPath,
          currentPath: renameResult.success ? renameResult.newPath! : fileInfo.fullPath,
          fileName: renameResult.success ? newFileName : fileInfo.fileName,
          originalFileName: fileInfo.fileName,
          title: cleanName,
          year: year || 0,
          imdbRating: finalRating,
          imdbId: finalImdbId,
          country: 'Russia',
          language: 'Russian',
          plot: null,
          genre: null,
          director: null,
          actors: null,
          posterUrl: finalPosterUrl || null,
          isFolder: fileInfo.isFolder,
          lastScanned: new Date().toISOString(),
          status: 'active',
          errorMessage: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const createdMovie = this.movieRepo.create(movie);
        result.created++;

        // Always clean up old metadata files, regardless of rename success
        const directory = path.dirname(renameResult.success ? renameResult.newPath! : fileInfo.fullPath);
        this.fileRenamer.cleanupOldMetadataFiles(directory, cleanName, finalRating);

        // Update currentPaths with renamed path
        if (renameResult.success && renameResult.newPath) {
          currentPaths.delete(fileInfo.fullPath);
          currentPaths.add(renameResult.newPath);

          // Create NFO
          await this.kodiService.createNFOFile(createdMovie, directory);

          // Download poster if available
          if (finalPosterUrl && finalRating > 0) {
            const baseFileName = newFileName.replace(extension, '');
            const posterPath = path.join(directory, `${baseFileName}-poster.jpg`);
            await this.posterService.downloadAndWatermarkPoster(
              finalPosterUrl,
              posterPath,
              finalRating
            );
          }
        }

        console.log(`  ✓ ${cleanName} (${year}) - IMDB ${finalRating > 0 ? finalRating : 'N/A'}`);
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
          plot: null,
          genre: null,
          director: null,
          actors: null,
          posterUrl: null,
          isFolder: fileInfo.isFolder,
          lastScanned: new Date().toISOString(),
          status: 'active',
          errorMessage: null,
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

    // CRITICAL: Validate that the found movie actually matches the original search title
    // This prevents completely wrong movies (e.g., "Pi" instead of "The Ninth Gate")
    if (!this.isTitleMatch(cleanName, movieData.title) && !this.isTitleMatch(cleanName, movieData.originalTitle)) {
      console.log(`  ✗ Title mismatch: searched "${cleanName}" but found "${movieData.title}" - rejecting`);
      this.createErrorMovie(fileInfo, `Title mismatch: found "${movieData.title}" instead of "${cleanName}"`);
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
      plot: movieData.plot || null,
      genre: movieData.genre || null,
      director: null, // TMDb doesn't provide in basic search
      actors: null, // TMDb doesn't provide in basic search
      posterUrl: movieData.posterUrl || null,
      isFolder: fileInfo.isFolder,
      lastScanned: new Date().toISOString(),
      status: 'active',
      errorMessage: renameResult.success ? null : (renameResult.error || null),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const createdMovie = this.movieRepo.create(movie);
    result.created++;

    // Always clean up old metadata files, regardless of rename success
    const directory = path.dirname(renameResult.success ? renameResult.newPath! : fileInfo.fullPath);
    this.fileRenamer.cleanupOldMetadataFiles(directory, finalTitle, movieData.imdbRating);

    if (renameResult.success) {
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
      plot: null,
      genre: null,
      director: null,
      actors: null,
      posterUrl: null,
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

  private shouldUseRussian(country: string): boolean {
    return CYRILLIC_COUNTRIES.some((c) => country.toLowerCase().includes(c.toLowerCase()));
  }

  private shouldUseRomanian(country: string): boolean {
    return ROMANIAN_COUNTRIES.some((c) => country.toLowerCase().includes(c.toLowerCase()));
  }

  /**
   * Check if two movie titles are a reasonable match
   * Handles minor variations like "The Baker" vs "Baker, The"
   * But rejects different movies like "The Baker" vs "Christmas at the Amish Bakery"
   */
  private isTitleMatch(title1: string, title2: string): boolean {
    const normalize = (t: string) => t
      .toLowerCase()
      .replace(/^the\s+/i, '')
      .replace(/,\s*the$/i, '')
      .replace(/[^\w\s]/g, '')
      .trim();

    const n1 = normalize(title1);
    const n2 = normalize(title2);

    // Exact match after normalization
    if (n1 === n2) return true;

    // For short titles (1-2 words), require exact match after normalization
    const words1 = n1.split(/\s+/).filter(w => w.length > 1);
    const words2 = n2.split(/\s+/).filter(w => w.length > 1);

    if (words1.length <= 2 || words2.length <= 2) {
      // Short titles - one must be equal to or contain the other exactly
      return n1 === n2;
    }

    // For longer titles, check if one is a prefix/suffix of the other
    // This handles cases like "The Baker" vs "The Baker: A Story"
    if (n1.startsWith(n2) || n2.startsWith(n1)) return true;

    return false;
  }
}
