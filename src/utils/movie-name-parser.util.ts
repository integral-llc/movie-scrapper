import { MOVIE_NAME_PATTERNS } from '../config/constants';

export class MovieNameParser {
  cleanMovieName(fileName: string): { cleanName: string; year?: number; isTVEpisode?: boolean; isAudioFile?: boolean } {
    let name = fileName;

    const ext = name.lastIndexOf('.');
    if (ext > 0) {
      name = name.substring(0, ext);
    }

    // Check for audio/music files
    const isAudioFile = MOVIE_NAME_PATTERNS.AUDIO_FILE.test(name);

    // Check if file has a year (indicates it's a movie, not TV episode)
    const hasYear = /\((?:19|20)\d{2}\)/.test(name);

    // Check if it's a movie collection item (01-, 02., etc. followed by movie title with year)
    // Only matches if number is followed by dash or dot, NOT space (to avoid "3 Days to Kill")
    const isMovieCollectionItem = /^(\d{1,2})[-.].*\((?:19|20)\d{2}\)/.test(name);

    // Check for TV episode patterns
    // - Must NOT have a year (hasYear = false)
    // - Must NOT be a movie collection item
    // - Must match episode patterns
    const isTVEpisode = !hasYear && !isMovieCollectionItem &&
      (MOVIE_NAME_PATTERNS.EPISODE.test(name) || MOVIE_NAME_PATTERNS.TV_EPISODE.test(name));

    // Remove episode/collection number prefix ONLY if it's a collection item or TV episode
    if (isMovieCollectionItem || isTVEpisode) {
      name = name.replace(/^(\d{1,2})[-.\s]+/, '');
    }

    const yearMatch = name.match(MOVIE_NAME_PATTERNS.YEAR);
    const year = yearMatch ? parseInt(yearMatch[0], 10) : undefined;

    // Remove release group tags (e.g., -SOFCJ, -YIFY, i Ton, i.Ton)
    name = name.replace(/-[A-Z0-9]+\b/gi, ' ');
    name = name.replace(/\b[a-z]\s+[A-Z][a-z]+$/i, ' '); // i Ton at end
    name = name.replace(/\b[a-z]\.\s*[A-Z][a-z]+$/i, ' '); // i.Ton, i. Ton at end

    name = name.replace(MOVIE_NAME_PATTERNS.QUALITY, ' ');
    name = name.replace(MOVIE_NAME_PATTERNS.CODEC, ' ');
    name = name.replace(MOVIE_NAME_PATTERNS.AUDIO, ' ');
    name = name.replace(MOVIE_NAME_PATTERNS.LANGUAGE, ' ');
    name = name.replace(MOVIE_NAME_PATTERNS.FOLDER_QUALITY, ' ');

    if (year) {
      const yearIndex = name.indexOf(year.toString());
      if (yearIndex > 0) {
        name = name.substring(0, yearIndex);
      }
    }

    name = name.replace(MOVIE_NAME_PATTERNS.BRACKETS, ' ');
    name = name.replace(MOVIE_NAME_PATTERNS.DOTS_UNDERSCORES, ' ');
    name = name.replace(MOVIE_NAME_PATTERNS.MULTI_SPACES, ' ');
    name = name.trim();

    return { cleanName: name, year, isTVEpisode, isAudioFile };
  }

  buildFileName(
    title: string,
    year: number,
    imdbRating: number,
    extension: string
  ): string {
    const rating = imdbRating.toFixed(1);
    return `${title} (${year}) (IMDB ${rating})${extension}`;
  }
}
