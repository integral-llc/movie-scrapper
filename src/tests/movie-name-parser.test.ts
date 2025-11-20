import { MovieNameParser } from '../utils/movie-name-parser.util';

describe('MovieNameParser', () => {
  const parser = new MovieNameParser();

  describe('Language indicators removal', () => {
    test('should clean Toy Story 3 with Rus Ukr Eng', () => {
      const result = parser.cleanMovieName('Toy.Story.3.BluRay.1080p.Rus.Ukr.Eng.mkv');
      expect(result.cleanName).toBe('Toy Story 3');
      expect(result.isTVEpisode).toBe(false);
    });

    test('should clean Monsters Inc with KP suffix', () => {
      const result = parser.cleanMovieName('Monsters.Inc.WEB-DL.KP.1080p-SOFCJ.mkv');
      expect(result.cleanName).toBe('Monsters Inc');
      expect(result.isTVEpisode).toBe(false);
    });

    test('should clean Finding Nemo with KP suffix', () => {
      const result = parser.cleanMovieName('Finding.Nemo.WEB-DL.KP.1080p-SOFCJ.mkv');
      expect(result.cleanName).toBe('Finding Nemo');
      expect(result.isTVEpisode).toBe(false);
    });
  });

  describe('Cyrillic and special characters', () => {
    test('should handle Madagascar in Cyrillic with AI UPSCALE', () => {
      const result = parser.cleanMovieName('[R23-K] Мадагаскар - Madagascar [UHD.BDRip.2160p.HEVC.AI.UPSCALE].mkv');
      expect(result.cleanName).toContain('Мадагаскар');
      expect(result.cleanName).toContain('Madagascar');
      expect(result.isTVEpisode).toBe(false);
    });

    test('should handle Madagascar 2 in Cyrillic', () => {
      const result = parser.cleanMovieName('[R23-K] Мадагаскар 2 - Madagascar Escape 2 Africa [UHD.BDRip.2160p.HEVC.AI.UPSCALE].mkv');
      expect(result.cleanName).toContain('Мадагаскар 2');
      expect(result.cleanName).toContain('Madagascar');
      expect(result.isTVEpisode).toBe(false);
    });

    test('should handle Madagascar 3 in Cyrillic', () => {
      const result = parser.cleanMovieName('[R23-K] Мадагаскар 3 - Madagascar 3 Europe\'s Most Wanted [UHD.BDRip.2160p.HEVC.AI.UPSCALE].mkv');
      expect(result.cleanName).toContain('Мадагаскар 3');
      expect(result.cleanName).toContain('Madagascar 3');
      expect(result.isTVEpisode).toBe(false);
    });
  });

  describe('Movie collections with numbers', () => {
    test('should handle numbered movie "3 Days to Kill"', () => {
      const result = parser.cleanMovieName('3 Days to Kill (2014) (IMDB 6.2).mkv');
      expect(result.cleanName).toBe('3 Days to Kill');
      expect(result.year).toBe(2014);
      expect(result.isTVEpisode).toBe(false);
    });

    test('should handle numbered movie "57 Seconds"', () => {
      const result = parser.cleanMovieName('57 Seconds (2023) (IMDB 5.4).mkv');
      expect(result.cleanName).toBe('57 Seconds');
      expect(result.year).toBe(2023);
      expect(result.isTVEpisode).toBe(false);
    });

    test('should handle collection item "01-John Wick"', () => {
      const result = parser.cleanMovieName('01-John Wick (2014) (IMDB 7.4).mkv');
      expect(result.cleanName).toBe('John Wick');
      expect(result.year).toBe(2014);
      expect(result.isTVEpisode).toBe(false);
    });

    test('should handle collection item "02. The Matrix"', () => {
      const result = parser.cleanMovieName('02. The Matrix (1999) (IMDB 8.7).mkv');
      expect(result.cleanName).toBe('The Matrix');
      expect(result.year).toBe(1999);
      expect(result.isTVEpisode).toBe(false);
    });
  });

  describe('Simple numbered files without year', () => {
    test('should handle "Shrek 1" without year', () => {
      const result = parser.cleanMovieName('Shrek 1.mkv');
      expect(result.cleanName).toBe('Shrek 1');
      expect(result.year).toBeUndefined();
      expect(result.isTVEpisode).toBe(false);
    });

    test('should handle "Shrek 2" with year', () => {
      const result = parser.cleanMovieName('Shrek 2 (2004) (IMDB 7.4).mkv');
      expect(result.cleanName).toBe('Shrek 2');
      expect(result.year).toBe(2004);
      expect(result.isTVEpisode).toBe(false);
    });
  });

  describe('TV Episode detection', () => {
    test('should detect S01E01 pattern as TV episode', () => {
      const result = parser.cleanMovieName('Breaking Bad S01E01.mkv');
      expect(result.isTVEpisode).toBe(true);
    });

    test('should detect "06. Episode" pattern as TV episode (no year)', () => {
      const result = parser.cleanMovieName('06. The Heist.mkv');
      expect(result.isTVEpisode).toBe(true);
    });

    test('should NOT detect "06-Movie (2020)" as TV episode', () => {
      const result = parser.cleanMovieName('06-The Avengers (2012) (IMDB 8.0).mkv');
      expect(result.isTVEpisode).toBe(false);
      expect(result.cleanName).toBe('The Avengers');
    });
  });

  describe('Audio file detection', () => {
    test('should detect Atmos Mix as audio file', () => {
      const result = parser.cleanMovieName('Cradles SG DAR Atmos Mix.mp4');
      expect(result.isAudioFile).toBe(true);
    });

    test('should detect Soundtrack as audio file', () => {
      const result = parser.cleanMovieName('Movie Soundtrack OST.mp3');
      expect(result.isAudioFile).toBe(true);
    });
  });

  describe('Quality and codec patterns', () => {
    test('should remove 4K quality indicator', () => {
      const result = parser.cleanMovieName('The Hunt 4 Red October.2160p.mkv');
      expect(result.cleanName).toBe('The Hunt 4 Red October');
      expect(result.isTVEpisode).toBe(false);
    });

    test('should remove BluRay and 1080p', () => {
      const result = parser.cleanMovieName('Avatar.BluRay.1080p.x264.mkv');
      expect(result.cleanName).toBe('Avatar');
    });

    test('should remove HEVC codec', () => {
      const result = parser.cleanMovieName('Dune.2160p.HEVC.mkv');
      expect(result.cleanName).toBe('Dune');
    });
  });

  describe('Year extraction', () => {
    test('should extract year from standard format', () => {
      const result = parser.cleanMovieName('Inception (2010) (IMDB 8.8).mkv');
      expect(result.year).toBe(2010);
      expect(result.cleanName).toBe('Inception');
    });

    test('should extract year from dot-separated format', () => {
      const result = parser.cleanMovieName('Avatar.2009.BluRay.mkv');
      expect(result.year).toBe(2009);
    });

    test('should handle no year', () => {
      const result = parser.cleanMovieName('Unknown Movie.mkv');
      expect(result.year).toBeUndefined();
    });
  });

  describe('Real problematic cases', () => {
    test('should handle X-Men folder names', () => {
      const result = parser.cleanMovieName('XMEN_F3');
      expect(result.cleanName).toBe('XMEN F3');
      expect(result.isTVEpisode).toBe(false);
    });

    test('should handle underscore-separated names', () => {
      const result = parser.cleanMovieName('X_MEN_F1_D2');
      expect(result.cleanName).toBe('X MEN F1 D2');
      expect(result.isTVEpisode).toBe(false);
    });

    test('should handle release group suffix', () => {
      const result = parser.cleanMovieName('Mr. and Mrs.Smith(2005).by Relase group.mkv');
      expect(result.cleanName).toBe('Mr and Mrs Smith');
      expect(result.year).toBe(2005);
    });
  });

  describe('buildFileName', () => {
    test('should build correct filename format', () => {
      const result = parser.buildFileName('Inception', 2010, 8.8, '.mkv');
      expect(result).toBe('Inception (2010) (IMDB 8.8).mkv');
    });

    test('should format rating to 1 decimal place', () => {
      const result = parser.buildFileName('Avatar', 2009, 7, '.mkv');
      expect(result).toBe('Avatar (2009) (IMDB 7.0).mkv');
    });

    test('should handle folder (no extension)', () => {
      const result = parser.buildFileName('The Matrix', 1999, 8.7, '');
      expect(result).toBe('The Matrix (1999) (IMDB 8.7)');
    });
  });

  describe('Folder quality indicators', () => {
    test('should remove 60 FPS from folder name', () => {
      const result = parser.cleanMovieName('SHREK 60 FPS');
      expect(result.cleanName).toBe('SHREK');
    });

    test('should remove AI UPSCALE from folder name', () => {
      const result = parser.cleanMovieName('Madagascar AI UPSCALE');
      expect(result.cleanName).toBe('Madagascar');
    });

    test('should remove 30fps from folder name', () => {
      const result = parser.cleanMovieName('Transformers 30fps Collection');
      expect(result.cleanName).toBe('Transformers Collection');
    });

    test('should remove Remastered from folder name', () => {
      const result = parser.cleanMovieName('The Godfather Remastered');
      expect(result.cleanName).toBe('The Godfather');
    });
  });

  describe('Edge cases', () => {
    test('should handle dots as separators', () => {
      const result = parser.cleanMovieName('The.Lord.of.the.Rings.2001.mkv');
      expect(result.cleanName).toBe('The Lord of the Rings');
      expect(result.year).toBe(2001);
    });

    test('should handle multiple spaces', () => {
      const result = parser.cleanMovieName('The    Matrix    Reloaded.mkv');
      expect(result.cleanName).toBe('The Matrix Reloaded');
    });

    test('should handle brackets', () => {
      const result = parser.cleanMovieName('[720p] Movie Name [x264].mkv');
      expect(result.cleanName).toBe('Movie Name');
    });

    test('should handle mixed case quality indicators', () => {
      const result = parser.cleanMovieName('Movie.BDRip.720P.mkv');
      expect(result.cleanName).toBe('Movie');
    });
  });
});
