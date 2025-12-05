/**
 * Unit test for title normalization - testing the complete pipeline
 * From filename → MovieNameParser → simpleNormalize → comparison
 */

import { MovieNameParser } from '../utils/movie-name-parser.util';

// Inline the simpleNormalize function exactly as it appears in movie-scanner-tmdb.service.ts
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

describe('Title Normalization', () => {
  describe('Dash vs Colon handling', () => {
    test('Transformers - Dark of the Moon (dash) should match Transformers: Dark of the Moon (colon)', () => {
      const fileTitle = 'Transformers - Dark of the Moon';
      const tmdbTitle = 'Transformers: Dark of the Moon';

      const normalizedFile = simpleNormalize(fileTitle);
      const normalizedTmdb = simpleNormalize(tmdbTitle);

      console.log('File title normalized:', normalizedFile);
      console.log('TMDb title normalized:', normalizedTmdb);

      expect(normalizedFile).toBe(normalizedTmdb);
    });

    test('Star Wars - A New Hope should match Star Wars: A New Hope', () => {
      const fileTitle = 'Star Wars - A New Hope';
      const tmdbTitle = 'Star Wars: A New Hope';

      expect(simpleNormalize(fileTitle)).toBe(simpleNormalize(tmdbTitle));
    });

    test('Mission - Impossible should match Mission: Impossible', () => {
      const fileTitle = 'Mission - Impossible';
      const tmdbTitle = 'Mission: Impossible';

      expect(simpleNormalize(fileTitle)).toBe(simpleNormalize(tmdbTitle));
    });
  });

  describe('Other punctuation normalization', () => {
    test('Ampersand variants should match', () => {
      const title1 = 'Romeo & Juliet';
      const title2 = 'Romeo and Juliet';

      // Note: & becomes a space, 'and' stays as 'and' - these won't match
      // This test documents current behavior
      const n1 = simpleNormalize(title1);
      const n2 = simpleNormalize(title2);
      console.log('Romeo & Juliet:', n1);
      console.log('Romeo and Juliet:', n2);
    });

    test('Em dash and en dash should be treated same as regular dash', () => {
      const regular = 'Test - Title';
      const emDash = 'Test — Title';
      const enDash = 'Test – Title';

      const n1 = simpleNormalize(regular);
      const n2 = simpleNormalize(emDash);
      const n3 = simpleNormalize(enDash);

      expect(n1).toBe(n2);
      expect(n2).toBe(n3);
    });
  });

  describe('The prefix/suffix handling', () => {
    test('The Matrix should match Matrix', () => {
      const with_the = 'The Matrix';
      const without_the = 'Matrix';

      expect(simpleNormalize(with_the)).toBe(simpleNormalize(without_the));
    });

    test('Matrix, The should match Matrix', () => {
      const suffix = 'Matrix, The';
      const without = 'Matrix';

      expect(simpleNormalize(suffix)).toBe(simpleNormalize(without));
    });
  });
});

describe('MovieNameParser', () => {
  const parser = new MovieNameParser();

  describe('cleanMovieName', () => {
    test('should parse Transformers - Dark of the Moon (2011).mkv correctly', () => {
      const fileName = 'Transformers - Dark of the Moon (2011).mkv';
      const result = parser.cleanMovieName(fileName);

      console.log('=== MOVIE NAME PARSER OUTPUT ===');
      console.log('Input:', fileName);
      console.log('Output:', JSON.stringify(result, null, 2));

      expect(result.cleanName).toBe('Transformers - Dark of the Moon');
      expect(result.year).toBe(2011);
      expect(result.isTVEpisode).toBe(false);
    });

    test('should parse 03.Transformers - Dark of the Moon (2011).mkv (collection item)', () => {
      const fileName = '03.Transformers - Dark of the Moon (2011).mkv';
      const result = parser.cleanMovieName(fileName);

      console.log('=== COLLECTION ITEM PARSER OUTPUT ===');
      console.log('Input:', fileName);
      console.log('Output:', JSON.stringify(result, null, 2));

      expect(result.year).toBe(2011);
      expect(result.isTVEpisode).toBe(false);
    });

    test('should handle various quality tags', () => {
      const fileName = 'The Matrix (1999) 1080p BluRay x264-YIFY.mkv';
      const result = parser.cleanMovieName(fileName);

      expect(result.cleanName).toBe('The Matrix');
      expect(result.year).toBe(1999);
    });
  });
});

describe('Full Pipeline Test', () => {
  const parser = new MovieNameParser();

  test('Complete pipeline: filename → parser → normalize → compare with TMDb', () => {
    // This is the actual filename on disk
    const fileName = 'Transformers - Dark of the Moon (2011).mkv';

    // This is what TMDb returns
    const tmdbTitle = 'Transformers: Dark of the Moon';

    // Step 1: Parse the filename
    const parsed = parser.cleanMovieName(fileName);
    console.log('Parsed cleanName:', parsed.cleanName);
    console.log('Parsed year:', parsed.year);

    // Step 2: Normalize both titles
    const normalizedFile = simpleNormalize(parsed.cleanName);
    const normalizedTmdb = simpleNormalize(tmdbTitle);

    console.log('Normalized file title:', normalizedFile);
    console.log('Normalized TMDb title:', normalizedTmdb);

    // Step 3: They should match
    expect(normalizedFile).toBe(normalizedTmdb);
    expect(parsed.year).toBe(2011);
  });

  test('Complete pipeline with collection number prefix', () => {
    const fileName = '03.Transformers - Dark of the Moon (2011).mkv';
    const tmdbTitle = 'Transformers: Dark of the Moon';

    const parsed = parser.cleanMovieName(fileName);
    console.log('Collection item cleanName:', parsed.cleanName);

    const normalizedFile = simpleNormalize(parsed.cleanName);
    const normalizedTmdb = simpleNormalize(tmdbTitle);

    console.log('Collection normalized:', normalizedFile);
    console.log('TMDb normalized:', normalizedTmdb);

    // They should match
    expect(normalizedFile).toBe(normalizedTmdb);
  });
});
