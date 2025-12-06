/**
 * Unit tests for TV Series name parsing and cleaning
 * Tests the complete pipeline: raw folder name → cleaned name → translit detection
 */

import { TVSeriesNameParser } from '../utils/tv-series-name-parser.util';

describe('TVSeriesNameParser', () => {
  let parser: TVSeriesNameParser;

  beforeEach(() => {
    parser = new TVSeriesNameParser();
  });

  describe('cleanFolderName - Basic cleaning', () => {
    test('should convert dots to spaces', () => {
      const input = 'Barankiny.i.kamni.sily';
      const result = parser.cleanFolderName(input);
      expect(result.cleanName).toBe('Barankiny i kamni sily');
    });

    test('should strip season marker S01', () => {
      const input = 'Barankiny.i.kamni.silyS01';
      const result = parser.cleanFolderName(input);
      expect(result.cleanName).toBe('Barankiny i kamni sily');
      expect(result.season).toBe(1);
    });

    test('should strip season marker S02', () => {
      const input = 'Some.Series.S02';
      const result = parser.cleanFolderName(input);
      expect(result.cleanName).toBe('Some Series');
      expect(result.season).toBe(2);
    });

    test('should strip year from folder name', () => {
      const input = 'Barankiny.i.kamni.silyS01.2025';
      const result = parser.cleanFolderName(input);
      expect(result.cleanName).toBe('Barankiny i kamni sily');
      expect(result.year).toBe(2025);
    });

    test('should strip video quality tags', () => {
      const input = 'Barankiny.i.kamni.silyS01.2025.WEB-DL.HEVC.2160p.SDR';
      const result = parser.cleanFolderName(input);
      expect(result.cleanName).toBe('Barankiny i kamni sily');
    });

    test('should strip release group', () => {
      const input = 'Barankiny.i.kamni.silyS01.2025.WEB-DL.HEVC.2160p.SDR.ExKinoRay';
      const result = parser.cleanFolderName(input);
      expect(result.cleanName).toBe('Barankiny i kamni sily');
    });

    test('should handle complete torrent-style folder name', () => {
      const input = 'Barankiny.i.kamni.silyS01.2025.WEB-DL.HEVC.2160p.SDR.ExKinoRay';
      const result = parser.cleanFolderName(input);

      expect(result.cleanName).toBe('Barankiny i kamni sily');
      expect(result.season).toBe(1);
      expect(result.year).toBe(2025);
      expect(result.quality).toBe('2160p');
    });
  });

  describe('cleanFolderName - Quality tag stripping', () => {
    test('should strip 1080p', () => {
      const input = 'Series.Name.S01.1080p.BluRay';
      const result = parser.cleanFolderName(input);
      expect(result.cleanName).toBe('Series Name');
      expect(result.quality).toBe('1080p');
    });

    test('should strip 720p', () => {
      const input = 'Series.Name.S01.720p.WEB-DL';
      const result = parser.cleanFolderName(input);
      expect(result.cleanName).toBe('Series Name');
    });

    test('should strip 4K/2160p', () => {
      const input = 'Series.Name.S01.2160p.UHD';
      const result = parser.cleanFolderName(input);
      expect(result.cleanName).toBe('Series Name');
    });

    test('should strip HDR tags', () => {
      const input = 'Series.Name.S01.2160p.HDR10.DV';
      const result = parser.cleanFolderName(input);
      expect(result.cleanName).toBe('Series Name');
    });
  });

  describe('cleanFolderName - Source/codec stripping', () => {
    test('should strip WEB-DL', () => {
      const input = 'Series.Name.S01.WEB-DL';
      const result = parser.cleanFolderName(input);
      expect(result.cleanName).toBe('Series Name');
    });

    test('should strip WEBRip', () => {
      const input = 'Series.Name.S01.WEBRip';
      const result = parser.cleanFolderName(input);
      expect(result.cleanName).toBe('Series Name');
    });

    test('should strip BluRay/BDRip', () => {
      const input = 'Series.Name.S01.BluRay.BDRip';
      const result = parser.cleanFolderName(input);
      expect(result.cleanName).toBe('Series Name');
    });

    test('should strip HEVC/x265', () => {
      const input = 'Series.Name.S01.HEVC.x265';
      const result = parser.cleanFolderName(input);
      expect(result.cleanName).toBe('Series Name');
    });

    test('should strip x264/H264', () => {
      const input = 'Series.Name.S01.x264.H264';
      const result = parser.cleanFolderName(input);
      expect(result.cleanName).toBe('Series Name');
    });

    test('should strip AV1', () => {
      const input = 'Series.Name.S01.AV1';
      const result = parser.cleanFolderName(input);
      expect(result.cleanName).toBe('Series Name');
    });
  });

  describe('cleanFolderName - Audio codec stripping', () => {
    test('should strip DTS/DTS-HD', () => {
      const input = 'Series.Name.S01.DTS-HD.MA';
      const result = parser.cleanFolderName(input);
      expect(result.cleanName).toBe('Series Name');
    });

    test('should strip Atmos/TrueHD', () => {
      const input = 'Series.Name.S01.TrueHD.Atmos';
      const result = parser.cleanFolderName(input);
      expect(result.cleanName).toBe('Series Name');
    });

    test('should strip AC3/AAC/FLAC', () => {
      const input = 'Series.Name.S01.AC3.AAC.FLAC';
      const result = parser.cleanFolderName(input);
      expect(result.cleanName).toBe('Series Name');
    });
  });

  describe('cleanFolderName - Release group stripping', () => {
    test('should strip common release groups', () => {
      const inputs = [
        'Series.Name.S01.RARBG',
        'Series.Name.S01.YIFY',
        'Series.Name.S01.YTS',
        'Series.Name.S01.FGT',
        'Series.Name.S01.NTb',
        'Series.Name.S01.LOL',
      ];

      inputs.forEach(input => {
        const result = parser.cleanFolderName(input);
        expect(result.cleanName).toBe('Series Name');
      });
    });

    test('should strip ExKinoRay release group', () => {
      const input = 'Series.Name.S01.ExKinoRay';
      const result = parser.cleanFolderName(input);
      expect(result.cleanName).toBe('Series Name');
    });

    test('should strip release groups in brackets', () => {
      const input = 'Series.Name.S01.[ExKinoRay]';
      const result = parser.cleanFolderName(input);
      expect(result.cleanName).toBe('Series Name');
    });
  });

  describe('cleanFolderName - Edge cases', () => {
    test('should handle Russian folder names with English translit', () => {
      const input = 'Аутсорс - S01';
      const result = parser.cleanFolderName(input);
      expect(result.cleanName).toBe('Аутсорс');
      expect(result.season).toBe(1);
    });

    test('should handle folder with IMDB rating', () => {
      const input = 'Злые люди (2025) (IMDB 6.8)';
      const result = parser.cleanFolderName(input);
      expect(result.cleanName).toBe('Злые люди');
      expect(result.year).toBe(2025);
    });

    test('should handle sequel markers like -2', () => {
      const input = 'Обратная сторона Луны-2';
      const result = parser.cleanFolderName(input);
      // Should keep the -2 as it's part of the title (sequel)
      expect(result.cleanName).toBe('Обратная сторона Луны-2');
    });

    test('should handle spaces in folder names', () => {
      const input = 'Game of Thrones S01 1080p';
      const result = parser.cleanFolderName(input);
      expect(result.cleanName).toBe('Game of Thrones');
      expect(result.season).toBe(1);
    });

    test('should preserve hyphenated titles', () => {
      const input = 'Spider-Man.S01.1080p';
      const result = parser.cleanFolderName(input);
      expect(result.cleanName).toBe('Spider-Man');
    });

    test('should handle double dots', () => {
      const input = 'Series..Name..S01';
      const result = parser.cleanFolderName(input);
      expect(result.cleanName).toBe('Series Name');
    });
  });

  describe('detectTranslit', () => {
    test('should detect Russian translit in Latin characters', () => {
      const input = 'Barankiny i kamni sily';
      const result = parser.detectTranslit(input);
      expect(result.isTranslit).toBe(true);
      expect(result.language).toBe('ru');
    });

    test('should not flag pure English titles as translit', () => {
      const input = 'Game of Thrones';
      const result = parser.detectTranslit(input);
      expect(result.isTranslit).toBe(false);
    });

    test('should detect common translit patterns', () => {
      const translitExamples = [
        'Brigada',
        'Likvidatsiya',
        'Ottepel',
        'Chernobyl Zona Otchuzhdeniya',
        'Metod',
        'Brat',
        'Voyna i mir',
      ];

      translitExamples.forEach(input => {
        const result = parser.detectTranslit(input);
        expect(result.isTranslit).toBe(true);
      });
    });
  });

  describe('parse - Complete pipeline', () => {
    test('should parse complete torrent folder name', () => {
      const input = 'Barankiny.i.kamni.silyS01.2025.WEB-DL.HEVC.2160p.SDR.ExKinoRay';
      const result = parser.parse(input);

      expect(result.cleanName).toBe('Barankiny i kamni sily');
      expect(result.season).toBe(1);
      expect(result.year).toBe(2025);
      expect(result.isTranslit).toBe(true);
      expect(result.suggestedSearchTerms).toContain('Barankiny i kamni sily');
    });

    test('should provide both cleaned and original name for search', () => {
      const input = 'Likvidatsiya.S01.2007.DVDRip';
      const result = parser.parse(input);

      expect(result.cleanName).toBe('Likvidatsiya');
      expect(result.suggestedSearchTerms.length).toBeGreaterThan(0);
    });
  });
});

describe('Real-world folder name examples', () => {
  let parser: TVSeriesNameParser;

  beforeEach(() => {
    parser = new TVSeriesNameParser();
  });

  test('Barankiny.i.kamni.silyS01.2025.WEB-DL.HEVC.2160p.SDR.ExKinoRay', () => {
    const input = 'Barankiny.i.kamni.silyS01.2025.WEB-DL.HEVC.2160p.SDR.ExKinoRay';
    const result = parser.parse(input);

    expect(result.cleanName).toBe('Barankiny i kamni sily');
    expect(result.season).toBe(1);
    expect(result.year).toBe(2025);
  });

  test('Аутсорс - S01', () => {
    const input = 'Аутсорс - S01';
    const result = parser.parse(input);

    expect(result.cleanName).toBe('Аутсорс');
    expect(result.season).toBe(1);
  });

  test('Злые люди (2025) (IMDB 6.8)', () => {
    const input = 'Злые люди (2025) (IMDB 6.8)';
    const result = parser.parse(input);

    expect(result.cleanName).toBe('Злые люди');
    expect(result.year).toBe(2025);
  });

  test('Breaking.Bad.S01.1080p.BluRay.x264-DEMAND', () => {
    const input = 'Breaking.Bad.S01.1080p.BluRay.x264-DEMAND';
    const result = parser.parse(input);

    expect(result.cleanName).toBe('Breaking Bad');
    expect(result.season).toBe(1);
  });

  test('The.Mandalorian.S03.2160p.WEB-DL.DDP5.1.Atmos.DV.HDR.H.265-FLUX', () => {
    const input = 'The.Mandalorian.S03.2160p.WEB-DL.DDP5.1.Atmos.DV.HDR.H.265-FLUX';
    const result = parser.parse(input);

    expect(result.cleanName).toBe('The Mandalorian');
    expect(result.season).toBe(3);
  });
});
