import fs from 'fs';
import path from 'path';
import { MovieRepository } from '../repositories/movie.repository';
import { TMDbService } from './tmdb.service';
import { TranslateService } from './translate.service';
import { FileRenamerService } from './file-renamer.service';
import { KodiService } from './kodi.service';
import { PosterService } from './poster.service';
import { AIMovieParserService } from './ai-movie-parser.service';
import { TitleMatcherService } from './title-matcher.service';
import { FileScanner } from '../utils/file-scanner.util';
import { MovieNameParser } from '../utils/movie-name-parser.util';
import { TVSeriesNameParser } from '../utils/tv-series-name-parser.util';
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
  private tvSeriesParser: TVSeriesNameParser;
  private aiParser: AIMovieParserService;
  private titleMatcher: TitleMatcherService;

  constructor() {
    this.movieRepo = new MovieRepository();
    this.tmdbService = new TMDbService();
    this.translateService = new TranslateService();
    this.fileRenamer = new FileRenamerService();
    this.kodiService = new KodiService();
    this.posterService = new PosterService();
    this.fileScanner = new FileScanner();
    this.nameParser = new MovieNameParser();
    this.tvSeriesParser = new TVSeriesNameParser();
    this.aiParser = new AIMovieParserService();
    this.titleMatcher = new TitleMatcherService();
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
      // For TV series with generic "Season XX" names, fix the title to include parent folder
      // Check both fileInfo.isTVSeries (new detection) and existingMovie.genre (previous detection)
      if (fileInfo.isTVSeries || existingMovie.genre === 'TV Series') {
        const genericSeasonPattern = /^(season|сезон)\s*\d+$/i;
        const isGenericSeason = genericSeasonPattern.test(fileInfo.fileName);
        // fileInfo.directory is path.dirname(fullPath), e.g., /mnt/movies/CyberStalker for Season 01 folder
        const parentFolder = path.basename(fileInfo.directory);
        let betterTitle = existingMovie.title;
        let searchTitle = fileInfo.fileName;

        console.log(`  TV Series check: fileName="${fileInfo.fileName}", parentFolder="${parentFolder}", isGenericSeason=${isGenericSeason}`);

        if (isGenericSeason && parentFolder && parentFolder !== 'movies') {
          betterTitle = `${parentFolder} - ${fileInfo.fileName}`;
          searchTitle = parentFolder; // Search TMDB using parent folder name, not "Season 01"
          console.log(`  Will update title: "${existingMovie.title}" → "${betterTitle}"`);
        } else {
          // For non-generic TV series folders, parse and clean the folder name
          const tvParsed = this.tvSeriesParser.parse(fileInfo.fileName);
          betterTitle = tvParsed.cleanName;
          searchTitle = tvParsed.cleanName;
          console.log(`  TV series parsed: "${fileInfo.fileName}" → "${searchTitle}" (year: ${tvParsed.year}, season: ${tvParsed.season}, translit: ${tvParsed.isTranslit})`);
        }

        // Check if poster is missing and needs to be downloaded
        const posterPath = path.join(fileInfo.fullPath, `${fileInfo.fileName}-poster.jpg`);
        const hasPoster = fs.existsSync(posterPath);

        if (!hasPoster || !existingMovie.posterUrl) {
          console.log(`  TV series "${betterTitle}" missing poster, searching TMDB for: "${searchTitle}"`);
          const movieData = await this.tmdbService.searchTV(searchTitle);
          if (movieData && movieData.posterUrl) {
            // Use TMDB title (which is in original language, e.g., Cyrillic for Russian)
            const tmdbTitle = movieData.title || betterTitle;
            console.log(`  ✓ Found TV poster for "${searchTitle}" → "${tmdbTitle}"`);
            await this.posterService.downloadAndWatermarkPoster(
              movieData.posterUrl,
              posterPath,
              0 // No IMDB rating for TV series
            );
            // Update record with poster URL and TMDB title (in original language)
            this.movieRepo.update(existingMovie.id!, {
              title: tmdbTitle,
              posterUrl: movieData.posterUrl,
              lastScanned: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
            result.updated++;
            return;
          } else {
            console.log(`  ✗ No TV poster found for "${searchTitle}"`);
          }
        }

        // Only update if title needs to change - but search TMDb to get proper Cyrillic title
        if (existingMovie.title !== betterTitle) {
          // Search TMDb to get proper title in original language (e.g., Cyrillic for Russian)
          console.log(`  TV series title needs update, searching TMDb for proper title: "${searchTitle}"`);
          const movieData = await this.tmdbService.searchTV(searchTitle);
          const finalTitle = movieData?.title || betterTitle;
          console.log(`  Fixing TV series title: "${existingMovie.title}" → "${finalTitle}"`);
          this.movieRepo.update(existingMovie.id!, {
            title: finalTitle,
            lastScanned: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          result.updated++;
          return;
        }

        // TV series - just update timestamps
        this.movieRepo.update(existingMovie.id!, {
          lastScanned: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        result.updated++;
        return;
      }

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

    // Handle TV series folders specially - don't try to match to TMDb, just track as-is
    if (fileInfo.isTVSeries) {
      console.log(`\nTV Series folder: ${fileInfo.fileName}`);
      await this.createTVSeriesEntry(fileInfo);
      result.created++;
      return;
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
    // Use AI year if available, otherwise try to extract from filename using regex
    let year = aiParsed.year;
    if (!year) {
      // Fallback: extract year from filename using regex (e.g., "Грейхаунд.2020.WEB-DL" -> 2020)
      const yearMatch = fileInfo.fileName.match(/[.\s(]?((?:19|20)\d{2})[.\s)]/);
      if (yearMatch) {
        year = parseInt(yearMatch[1], 10);
        console.log(`  Year extracted from filename: ${year}`);
      }
    }

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

    let movieData = null;

    // For non-English titles, skip IMDB and go straight to TMDb (better at translations)
    if (detectedLanguage !== 'en') {
      console.log(`  Non-English title detected (${detectedLanguage}), using TMDb directly...`);
      movieData = await this.tmdbService.searchMovie(cleanName, year);

      // If TMDb finds a match with matching year, accept it (bypass strict title match)
      if (movieData && year && movieData.year && Math.abs(year - movieData.year) <= 1) {
        console.log(`  ✓ TMDb found: ${movieData.title} (${movieData.year}) - accepting via year match`);
        // Mark that we already validated via year match
        searchTitle = movieData.title; // This ensures later title validation passes
      } else if (movieData) {
        // Year doesn't match well - be more careful
        console.log(`  Year mismatch: searched ${year || 'unknown'} but found ${movieData.year} - checking title...`);
        // Keep the result but let the later validation check it
      }

      // If nothing found with original, try translating
      if (!movieData) {
        console.log(`  Not found, translating to English...`);
        searchTitle = await this.translateService.translateToEnglish(cleanName, detectedLanguage);
        console.log(`  Translated: ${searchTitle}`);
        movieData = await this.tmdbService.searchMovie(searchTitle, year);
      }
    } else {
      // For English titles, try AI-powered IMDB search FIRST for better accuracy
      console.log(`  Searching IMDB directly...`);
      const imdbResult = await this.aiParser.searchIMDb(cleanName, year);

      // Validate IMDB result matches search title before accepting (use TitleMatcherService)
      const imdbMatchResult = imdbResult && imdbResult.rating > 0 ?
        await this.titleMatcher.areSameMovie(cleanName, imdbResult.title, { year, useLLM: false }) : null;
      const imdbTitleMatches = imdbMatchResult && imdbMatchResult.isMatch;

      if (imdbResult && imdbResult.rating > 0 && imdbTitleMatches) {
        // Found on IMDB - use TMDb to get additional metadata
        console.log(`  ✓ IMDB found: ${imdbResult.title} (${imdbResult.year}) - Rating ${imdbResult.rating}`);
        const tmdbData = await this.tmdbService.searchMovie(imdbResult.title, imdbResult.year);

        // Validate that TMDb result matches IMDB result (use TitleMatcherService)
        const tmdbMatchResult = tmdbData ? await this.titleMatcher.areSameMovie(imdbResult.title, tmdbData.title, { useLLM: false }) : null;
        if (tmdbData && tmdbMatchResult && tmdbMatchResult.isMatch) {
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
        // IMDB search failed or returned wrong movie, fall back to TMDb
        if (imdbResult && imdbResult.rating > 0 && !imdbTitleMatches) {
          console.log(`  IMDB returned wrong movie: "${imdbResult.title}" - trying TMDb directly...`);
        } else {
          console.log(`  IMDB search failed, trying TMDb...`);
        }
        movieData = await this.tmdbService.searchMovie(cleanName, year);
      }
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

    // CRITICAL: Validate that the found movie actually matches the search title
    // Use simple normalized comparison first, then TitleMatcherService for edge cases

    // Simple normalized comparison - handles punctuation variants like : vs -
    const simpleNormalize = (title: string) => {
      return title
        .toLowerCase()
        .replace(/&amp;/g, '&')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove accents
        .replace(/^the\s+/i, '') // Remove "The" prefix
        .replace(/,\s*the$/i, '') // Remove ", The" suffix
        .replace(/[^\w\s]/g, ' ') // Replace all punctuation with spaces
        .replace(/\s+/g, ' ')
        .trim();
    };

    const normalizedClean = simpleNormalize(cleanName);
    const normalizedTmdb = simpleNormalize(movieData.title);
    const normalizedOriginal = movieData.originalTitle ? simpleNormalize(movieData.originalTitle) : null;

    // Fast path: normalized titles match directly
    const directNormalizedMatch = normalizedClean === normalizedTmdb ||
      (normalizedOriginal && normalizedClean === normalizedOriginal);

    let titleMatchesOriginal = directNormalizedMatch;

    // If direct match fails, use TitleMatcherService for fuzzy/LLM matching
    if (!directNormalizedMatch) {
      const titleMatchResult = await this.titleMatcher.areSameMovie(cleanName, movieData.title, { year, useLLM: true });
      titleMatchesOriginal = titleMatchResult.isMatch ||
        (movieData.originalTitle && (await this.titleMatcher.areSameMovie(cleanName, movieData.originalTitle, { year, useLLM: false })).isMatch);

      if (titleMatchResult.isMatch) {
        console.log(`  ✓ Title match (${titleMatchResult.method}, ${(titleMatchResult.confidence * 100).toFixed(0)}%): "${cleanName}" ↔ "${movieData.title}"`);
      }
    } else {
      console.log(`  ✓ Title match (normalized): "${cleanName}" ↔ "${movieData.title}"`);
    }

    // Also check translated title if different from cleanName
    const titleMatchesTranslated = searchTitle !== cleanName &&
      ((await this.titleMatcher.areSameMovie(searchTitle, movieData.title, { year, useLLM: false })).isMatch ||
       (movieData.originalTitle && (await this.titleMatcher.areSameMovie(searchTitle, movieData.originalTitle, { year, useLLM: false })).isMatch));

    // When source title is non-English and TMDb found a result, allow it if:
    // 1. The year matches or is close (strong indicator it's the same movie)
    // 2. TMDb explicitly matched on this foreign title search
    // This handles cases like "Грейхаунд" -> "Greyhound" where TMDb internally translates
    const yearMatches = year && movieData.year && Math.abs(year - movieData.year) <= 1;
    const nonEnglishWithYearMatch = detectedLanguage !== 'en' && yearMatches;

    if (nonEnglishWithYearMatch) {
      console.log(`  ✓ Accepting non-English title "${cleanName}" matching "${movieData.title}" (${movieData.year}) via year match`);
    }

    // If no match found, reject
    if (!titleMatchesOriginal && !titleMatchesTranslated && !nonEnglishWithYearMatch) {
      console.log(`  ✗ Title mismatch: "${cleanName}" vs "${movieData.title}" - different movies`);
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

    // Check if file already has the correct name (rename returned "file already exists")
    const alreadyCorrectName = !renameResult.success &&
      renameResult.error?.includes('already exists') &&
      fileInfo.fileName === newFileName;

    const finalPath = renameResult.success ? renameResult.newPath! : fileInfo.fullPath;
    const finalFileName = renameResult.success ? newFileName : fileInfo.fileName;

    const movie: Omit<Movie, 'id'> = {
      originalPath: fileInfo.fullPath,
      currentPath: finalPath,
      fileName: finalFileName,
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
      errorMessage: (renameResult.success || alreadyCorrectName) ? null : (renameResult.error || null),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const createdMovie = this.movieRepo.create(movie);
    result.created++;

    // Always clean up old metadata files, regardless of rename success
    const directory = path.dirname(finalPath);
    this.fileRenamer.cleanupOldMetadataFiles(directory, finalTitle, movieData.imdbRating);

    // Create NFO and poster if rename succeeded OR file already had correct name
    if (renameResult.success || alreadyCorrectName) {
      // Update currentPaths with renamed path
      if (renameResult.success) {
        currentPaths.delete(fileInfo.fullPath);
        currentPaths.add(renameResult.newPath!);
      }

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

  private async createTVSeriesEntry(fileInfo: MovieFileInfo): Promise<void> {
    // Generate a meaningful title first
    // If folder name is generic like "Season 01" or "Сезон 01", use parent folder name
    let title = fileInfo.fileName;
    let searchTitle = fileInfo.fileName; // Title to use for TMDB search
    let parsedYear: number | undefined;
    const genericSeasonPattern = /^(season|сезон)\s*\d+$/i;
    const isGenericSeason = genericSeasonPattern.test(fileInfo.fileName);
    // fileInfo.directory is path.dirname(fullPath), e.g., /mnt/movies/CyberStalker for Season 01 folder
    const parentFolder = path.basename(fileInfo.directory);

    if (isGenericSeason && parentFolder && parentFolder !== 'movies') {
      title = `${parentFolder} - ${fileInfo.fileName}`;
      searchTitle = parentFolder; // Search TMDB using parent folder name, not "Season 01"
    } else {
      // For non-generic TV series folders (like torrent-style names), parse and clean
      const tvParsed = this.tvSeriesParser.parse(fileInfo.fileName);
      title = tvParsed.cleanName;
      searchTitle = tvParsed.cleanName;
      parsedYear = tvParsed.year;
      console.log(`  TV series parsed: "${fileInfo.fileName}" → "${title}" (year: ${parsedYear}, season: ${tvParsed.season}, translit: ${tvParsed.isTranslit})`);
    }

    // Check if already exists
    const existing = this.movieRepo.findByPath(fileInfo.fullPath);
    if (existing) {
      // Check if we need to download a poster (missing or wrong one)
      const posterPath = path.join(fileInfo.directory, `${fileInfo.fileName}-poster.jpg`);
      const hasPoster = fs.existsSync(posterPath);

      if (!hasPoster && isGenericSeason) {
        // Need to fetch poster using parent folder name - use TV search endpoint
        console.log(`  Searching TMDB for TV series poster (update): "${searchTitle}"`);
        const movieData = await this.tmdbService.searchTV(searchTitle);
        if (movieData && movieData.posterUrl) {
          console.log(`  Found poster for "${searchTitle}"`);
          await this.posterService.downloadAndWatermarkPoster(
            movieData.posterUrl,
            posterPath,
            0 // No IMDB rating for TV series
          );
          // Update record with poster URL
          this.movieRepo.update(existing.id!, {
            title: title,
            posterUrl: movieData.posterUrl,
            lastScanned: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          return;
        }
      }

      // Update existing record with the correct title
      this.movieRepo.update(existing.id!, {
        title: title,
        lastScanned: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    // Try to find poster from TMDB using the series name (not "Season 01") - use TV search endpoint
    let posterUrl: string | null = null;
    console.log(`  Searching TMDB for TV series poster: "${searchTitle}"`);
    const movieData = await this.tmdbService.searchTV(searchTitle);
    if (movieData && movieData.posterUrl) {
      posterUrl = movieData.posterUrl;
      console.log(`  Found poster for "${searchTitle}"`);

      // Download poster with IMDB 0.0 watermark (to indicate TV series)
      const posterPath = path.join(fileInfo.directory, `${fileInfo.fileName}-poster.jpg`);
      await this.posterService.downloadAndWatermarkPoster(
        posterUrl,
        posterPath,
        0 // No IMDB rating for TV series
      );
    }

    const movie: Omit<Movie, 'id'> = {
      originalPath: fileInfo.fullPath,
      currentPath: fileInfo.fullPath,
      fileName: fileInfo.fileName,
      originalFileName: fileInfo.fileName,
      title: title, // Use folder name or parent + folder name for generic season folders
      year: parsedYear || 0,
      imdbRating: 0,
      imdbId: '',
      country: '',
      language: '',
      plot: 'TV Series',
      genre: 'TV Series',
      director: null,
      actors: null,
      posterUrl: posterUrl,
      isFolder: true,
      lastScanned: new Date().toISOString(),
      status: 'active',
      errorMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.movieRepo.create(movie);
    console.log(`  ✓ TV Series: ${title}`);
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
}
