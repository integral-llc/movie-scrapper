import { ITask } from '../types/task.types';
import { MovieRepository } from '../repositories/movie.repository';
import { TMDbService, MovieData } from '../services/tmdb.service';
import { TranslateService } from '../services/translate.service';
import { FileRenamerService } from '../services/file-renamer.service';
import { KodiService } from '../services/kodi.service';
import { MovieNameParser } from '../utils/movie-name-parser.util';
import { CYRILLIC_COUNTRIES, ROMANIAN_COUNTRIES } from '../config/constants';
import path from 'path';

export class RetryErrorsTask implements ITask {
  name = 'RetryErrorsTask';

  private movieRepo: MovieRepository;
  private tmdbService: TMDbService;
  private translateService: TranslateService;
  private fileRenamer: FileRenamerService;
  private kodiService: KodiService;
  private nameParser: MovieNameParser;

  constructor() {
    this.movieRepo = new MovieRepository();
    this.tmdbService = new TMDbService();
    this.translateService = new TranslateService();
    this.fileRenamer = new FileRenamerService();
    this.kodiService = new KodiService();
    this.nameParser = new MovieNameParser();
  }

  async execute(): Promise<void> {
    console.log(`\n[${new Date().toISOString()}] Starting ${this.name}...`);
    console.log('Retrying all error movies with enhanced search...\n');

    const errorMovies = this.movieRepo.findAll('error');
    console.log(`Found ${errorMovies.length} movies with errors\n`);

    let fixed = 0;
    let stillFailed = 0;

    for (const movie of errorMovies) {
      console.log(`\n[${fixed + stillFailed + 1}/${errorMovies.length}] Processing: ${movie.originalFileName}`);

      const { cleanName, year } = this.nameParser.cleanMovieName(movie.originalFileName);

      const detectedLanguage = this.translateService.detectLanguage(cleanName);
      let searchTitle = cleanName;

      if (detectedLanguage !== 'en') {
        console.log(`  Original: ${cleanName} (${detectedLanguage})`);
        searchTitle = await this.translateService.translateToEnglish(cleanName, detectedLanguage);
        console.log(`  Translated: ${searchTitle}`);
      }

      // Use TMDb service with improved matching algorithm
      const movieData = await this.tmdbService.searchMovie(searchTitle, year);

      if (!movieData) {
        console.log(`  ✗ Still not found`);
        stillFailed++;
        continue;
      }

      if (!movieData.imdbRating || movieData.imdbRating <= 0) {
        console.log(`  ✗ Invalid IMDB rating`);
        stillFailed++;
        continue;
      }

      const mainCountry = this.extractMainCountry(movieData.country);
      let finalTitle = movieData.title;

      if (this.shouldUseRussian(mainCountry)) {
        finalTitle = await this.translateService.translateToRussian(movieData.title);
        console.log(`  Translated to Russian: ${finalTitle}`);
      } else if (this.shouldUseRomanian(mainCountry)) {
        finalTitle = await this.translateService.translateToRomanian(movieData.title);
        console.log(`  Translated to Romanian: ${finalTitle}`);
      }

      const extension = movie.isFolder ? '' : path.extname(movie.currentPath);
      const newFileName = this.nameParser.buildFileName(
        finalTitle,
        movieData.year,
        movieData.imdbRating,
        extension
      );

      const renameResult = this.fileRenamer.renameFile(movie.currentPath, newFileName);

      this.movieRepo.update(movie.id!, {
        currentPath: renameResult.success ? renameResult.newPath! : movie.currentPath,
        fileName: renameResult.success ? newFileName : movie.fileName,
        title: finalTitle,
        year: movieData.year,
        imdbRating: movieData.imdbRating,
        imdbId: movieData.imdbId,
        country: mainCountry,
        language: movieData.language,
        plot: movieData.plot,
        genre: movieData.genre,
        posterUrl: movieData.posterUrl || undefined,
        status: 'active',
        errorMessage: renameResult.success ? undefined : renameResult.error,
        updatedAt: new Date().toISOString(),
      });

      if (renameResult.success) {
        const directory = path.dirname(renameResult.newPath!);
        const updatedMovie = this.movieRepo.findById(movie.id!);
        if (updatedMovie) {
          await this.kodiService.createNFOFile(updatedMovie, directory);
          await this.kodiService.downloadPoster(updatedMovie, directory);
        }
      }

      console.log(`  ✓ FIXED: ${finalTitle} (${movieData.year}) - IMDB ${movieData.imdbRating}`);
      fixed++;
    }

    console.log('\n=== Retry Results ===');
    console.log(`Fixed: ${fixed}`);
    console.log(`Still Failed: ${stillFailed}`);
    console.log(`Success Rate: ${((fixed / errorMovies.length) * 100).toFixed(1)}%`);
    console.log('===================\n');
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
