import { TVSeriesNameParser } from '../utils/tv-series-name-parser.util';
import { MovieFileInfo } from '../types/movie.types';

/**
 * Unit tests for TV series title processing in the movie scanner service.
 * These tests use mock FileInfo objects instead of actual filesystem operations.
 */
describe('TV Series Title Processing', () => {
  let tvParser: TVSeriesNameParser;

  beforeEach(() => {
    tvParser = new TVSeriesNameParser();
  });

  /**
   * Helper function to create a mock MovieFileInfo object
   */
  function createMockFileInfo(
    fileName: string,
    directory: string,
    fullPath?: string
  ): MovieFileInfo {
    return {
      fullPath: fullPath || `${directory}/${fileName}`,
      directory,
      fileName,
      extension: '',
      isFolder: true,
      isTVSeries: true,
    };
  }

  describe('Generic Season Pattern Detection', () => {
    const genericSeasonPattern = /^(season|сезон)\s*\d+$/i;

    test.each([
      ['Season 01', true],
      ['Season 1', true],
      ['Season 10', true],
      ['season 01', true],
      ['SEASON 01', true],
      ['Сезон 01', true],
      ['сезон 1', true],
      ['Season01', true],
    ])('"%s" should be detected as generic season: %s', (folderName, expected) => {
      expect(genericSeasonPattern.test(folderName)).toBe(expected);
    });

    test.each([
      ['Barankiny.i.kamni.silyS01.2025.WEB-DL.HEVC.2160p.SDR.ExKinoRay', false],
      ['Game of Thrones S01', false],
      ['Breaking Bad Season 1 1080p', false],
      ['CyberStalker', false],
      ['Stranger Things', false],
      ['The.Walking.Dead.S01.1080p.BluRay', false],
    ])('"%s" should NOT be detected as generic season: %s', (folderName, expected) => {
      expect(genericSeasonPattern.test(folderName)).toBe(expected);
    });
  });

  describe('Title Processing for Generic Seasons', () => {
    /**
     * When a folder is named "Season 01", the title should be constructed
     * from the parent folder name + " - Season 01"
     */
    test('should construct title from parent folder for generic Season 01', () => {
      const fileInfo = createMockFileInfo(
        'Season 01',
        '/mnt/movies/CyberStalker'
      );

      const genericSeasonPattern = /^(season|сезон)\s*\d+$/i;
      const isGenericSeason = genericSeasonPattern.test(fileInfo.fileName);
      const parentFolder = fileInfo.directory.split('/').pop() || '';

      expect(isGenericSeason).toBe(true);
      expect(parentFolder).toBe('CyberStalker');

      // This is the logic from movie-scanner-tmdb.service.ts
      const betterTitle = `${parentFolder} - ${fileInfo.fileName}`;
      const searchTitle = parentFolder;

      expect(betterTitle).toBe('CyberStalker - Season 01');
      expect(searchTitle).toBe('CyberStalker');
    });

    test('should handle Cyrillic season folder', () => {
      const fileInfo = createMockFileInfo(
        'Сезон 01',
        '/mnt/movies/Обратная сторона Луны'
      );

      const genericSeasonPattern = /^(season|сезон)\s*\d+$/i;
      const isGenericSeason = genericSeasonPattern.test(fileInfo.fileName);
      const parentFolder = fileInfo.directory.split('/').pop() || '';

      expect(isGenericSeason).toBe(true);
      expect(parentFolder).toBe('Обратная сторона Луны');

      const betterTitle = `${parentFolder} - ${fileInfo.fileName}`;
      const searchTitle = parentFolder;

      expect(betterTitle).toBe('Обратная сторона Луны - Сезон 01');
      expect(searchTitle).toBe('Обратная сторона Луны');
    });
  });

  describe('Title Processing for Torrent-Style TV Series Names', () => {
    /**
     * When a folder has a torrent-style name like "Barankiny.i.kamni.silyS01.2025...",
     * the TVSeriesNameParser should clean it to extract the actual title.
     */
    test('should parse and clean torrent-style TV series folder name', () => {
      const fileInfo = createMockFileInfo(
        'Barankiny.i.kamni.silyS01.2025.WEB-DL.HEVC.2160p.SDR.ExKinoRay',
        '/mnt/movies'
      );

      const genericSeasonPattern = /^(season|сезон)\s*\d+$/i;
      const isGenericSeason = genericSeasonPattern.test(fileInfo.fileName);

      expect(isGenericSeason).toBe(false);

      // For non-generic TV series folders, use the parser
      const tvParsed = tvParser.parse(fileInfo.fileName);

      expect(tvParsed.cleanName).toBe('Barankiny i kamni sily');
      expect(tvParsed.year).toBe(2025);
      expect(tvParsed.season).toBe(1);
      expect(tvParsed.isTranslit).toBe(true);

      // These would be used in the service
      const betterTitle = tvParsed.cleanName;
      const searchTitle = tvParsed.cleanName;

      expect(betterTitle).toBe('Barankiny i kamni sily');
      expect(searchTitle).toBe('Barankiny i kamni sily');
    });

    test('should parse Walking Dead style torrent name', () => {
      const fileInfo = createMockFileInfo(
        'The.Walking.Dead.S01.1080p.BluRay.x264-DEMAND',
        '/mnt/movies'
      );

      const tvParsed = tvParser.parse(fileInfo.fileName);

      expect(tvParsed.cleanName).toBe('The Walking Dead');
      expect(tvParsed.season).toBe(1);
    });

    test('should parse Game of Thrones style name', () => {
      const fileInfo = createMockFileInfo(
        'Game.of.Thrones.S01.2160p.UHD.BluRay.REMUX.HDR.HEVC.Atmos',
        '/mnt/movies'
      );

      const tvParsed = tvParser.parse(fileInfo.fileName);

      expect(tvParsed.cleanName).toBe('Game of Thrones');
      expect(tvParsed.season).toBe(1);
    });

    test('should parse Stranger Things style name', () => {
      const fileInfo = createMockFileInfo(
        'Stranger.Things.S04.2022.2160p.NF.WEB-DL.DDP.5.1.Atmos.DV.HDR.HEVC-HONE',
        '/mnt/movies'
      );

      const tvParsed = tvParser.parse(fileInfo.fileName);

      expect(tvParsed.cleanName).toBe('Stranger Things');
      expect(tvParsed.season).toBe(4);
      expect(tvParsed.year).toBe(2022);
    });

    test('should parse Russian translit TV series name', () => {
      const fileInfo = createMockFileInfo(
        'Obratnaya.storona.Luny.S02.2016.WEB-DL.1080p',
        '/mnt/movies'
      );

      const tvParsed = tvParser.parse(fileInfo.fileName);

      expect(tvParsed.cleanName).toBe('Obratnaya storona Luny');
      expect(tvParsed.season).toBe(2);
      expect(tvParsed.year).toBe(2016);
      // Note: isTranslit detection depends on pattern matching, not all translit names are detected
    });
  });

  describe('Complete Title Processing Flow', () => {
    /**
     * This test simulates the exact flow from processMovieFile for existing TV series
     */
    interface MockExistingMovie {
      id: number;
      title: string;
      genre: string;
      status: string;
    }

    function simulateProcessMovieFile(
      fileInfo: MovieFileInfo,
      existingMovie: MockExistingMovie
    ): { betterTitle: string; searchTitle: string; shouldUpdate: boolean } {
      const genericSeasonPattern = /^(season|сезон)\s*\d+$/i;
      const isGenericSeason = genericSeasonPattern.test(fileInfo.fileName);
      const parentFolder = fileInfo.directory.split('/').pop() || '';

      let betterTitle = existingMovie.title;
      let searchTitle = fileInfo.fileName;

      if (isGenericSeason && parentFolder && parentFolder !== 'movies') {
        betterTitle = `${parentFolder} - ${fileInfo.fileName}`;
        searchTitle = parentFolder;
      } else {
        // For non-generic TV series folders, parse and clean the folder name
        const tvParsed = tvParser.parse(fileInfo.fileName);
        betterTitle = tvParsed.cleanName;
        searchTitle = tvParsed.cleanName;
      }

      const shouldUpdate = existingMovie.title !== betterTitle;

      return { betterTitle, searchTitle, shouldUpdate };
    }

    test('Barankiny torrent folder should be cleaned when record already exists', () => {
      const fileInfo = createMockFileInfo(
        'Barankiny.i.kamni.silyS01.2025.WEB-DL.HEVC.2160p.SDR.ExKinoRay',
        '/mnt/movies'
      );

      // Simulate existing record with raw torrent name as title
      const existingMovie: MockExistingMovie = {
        id: 1,
        title: 'Barankiny.i.kamni.silyS01.2025.WEB-DL.HEVC.2160p.SDR.ExKinoRay',
        genre: 'TV Series',
        status: 'active',
      };

      const result = simulateProcessMovieFile(fileInfo, existingMovie);

      expect(result.betterTitle).toBe('Barankiny i kamni sily');
      expect(result.searchTitle).toBe('Barankiny i kamni sily');
      expect(result.shouldUpdate).toBe(true);
    });

    test('CyberStalker Season 01 should get parent folder as title', () => {
      const fileInfo = createMockFileInfo(
        'Season 01',
        '/mnt/movies/CyberStalker'
      );

      const existingMovie: MockExistingMovie = {
        id: 2,
        title: 'Season 01',
        genre: 'TV Series',
        status: 'active',
      };

      const result = simulateProcessMovieFile(fileInfo, existingMovie);

      expect(result.betterTitle).toBe('CyberStalker - Season 01');
      expect(result.searchTitle).toBe('CyberStalker');
      expect(result.shouldUpdate).toBe(true);
    });

    test('should not update if title is already correct', () => {
      const fileInfo = createMockFileInfo(
        'Season 01',
        '/mnt/movies/CyberStalker'
      );

      const existingMovie: MockExistingMovie = {
        id: 3,
        title: 'CyberStalker - Season 01',
        genre: 'TV Series',
        status: 'active',
      };

      const result = simulateProcessMovieFile(fileInfo, existingMovie);

      expect(result.betterTitle).toBe('CyberStalker - Season 01');
      expect(result.shouldUpdate).toBe(false);
    });

    test('Walking Dead torrent name should be cleaned', () => {
      const fileInfo = createMockFileInfo(
        'The.Walking.Dead.S01.1080p.BluRay.x264-DEMAND',
        '/mnt/movies'
      );

      const existingMovie: MockExistingMovie = {
        id: 4,
        title: 'The.Walking.Dead.S01.1080p.BluRay.x264-DEMAND',
        genre: 'TV Series',
        status: 'active',
      };

      const result = simulateProcessMovieFile(fileInfo, existingMovie);

      expect(result.betterTitle).toBe('The Walking Dead');
      expect(result.searchTitle).toBe('The Walking Dead');
      expect(result.shouldUpdate).toBe(true);
    });

    test('Russian Cyrillic season folder should use parent name', () => {
      const fileInfo = createMockFileInfo(
        'Сезон 02',
        '/mnt/movies/Обратная сторона Луны'
      );

      const existingMovie: MockExistingMovie = {
        id: 5,
        title: 'Сезон 02',
        genre: 'TV Series',
        status: 'active',
      };

      const result = simulateProcessMovieFile(fileInfo, existingMovie);

      expect(result.betterTitle).toBe('Обратная сторона Луны - Сезон 02');
      expect(result.searchTitle).toBe('Обратная сторона Луны');
      expect(result.shouldUpdate).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    test('should handle folders at root level (parent = movies)', () => {
      const fileInfo = createMockFileInfo(
        'Season 01',
        '/mnt/movies'
      );

      const genericSeasonPattern = /^(season|сезон)\s*\d+$/i;
      const isGenericSeason = genericSeasonPattern.test(fileInfo.fileName);
      const parentFolder = fileInfo.directory.split('/').pop() || '';

      expect(isGenericSeason).toBe(true);
      // When parent is 'movies', we should NOT use it as the show name
      expect(parentFolder).toBe('movies');

      // In this case, the service would use the parser instead
      if (isGenericSeason && parentFolder && parentFolder !== 'movies') {
        // This branch would NOT be taken
        fail('Should not use parent folder when it is "movies"');
      }
    });

    test('should handle complex nested paths', () => {
      const fileInfo = createMockFileInfo(
        'Season 01',
        '/mnt/movies/TV Shows/Drama/CyberStalker'
      );

      const parentFolder = fileInfo.directory.split('/').pop() || '';
      expect(parentFolder).toBe('CyberStalker');
    });

    test('should handle special characters in folder names', () => {
      const fileInfo = createMockFileInfo(
        'Season 01',
        "/mnt/movies/Marvel's Agents of S.H.I.E.L.D."
      );

      const parentFolder = fileInfo.directory.split('/').pop() || '';
      expect(parentFolder).toBe("Marvel's Agents of S.H.I.E.L.D.");

      const betterTitle = `${parentFolder} - Season 01`;
      expect(betterTitle).toBe("Marvel's Agents of S.H.I.E.L.D. - Season 01");
    });

    test('should handle release group at the end', () => {
      const fileInfo = createMockFileInfo(
        'House.of.the.Dragon.S01.2022.2160p.HMAX.WEB-DL.DDP.5.1.Atmos.DV.MKV.x265-SMURF',
        '/mnt/movies'
      );

      const tvParsed = tvParser.parse(fileInfo.fileName);

      expect(tvParsed.cleanName).toBe('House of the Dragon');
      expect(tvParsed.season).toBe(1);
      expect(tvParsed.year).toBe(2022);
    });
  });
});
