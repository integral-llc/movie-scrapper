import { TMDbService } from '../src/services/tmdb.service';
import { TranslateService } from '../src/services/translate.service';
import { MovieNameParser } from '../src/utils/movie-name-parser.util';

describe('International Title Integration Tests', () => {
  let tmdbService: TMDbService;
  let translateService: TranslateService;
  let nameParser: MovieNameParser;

  beforeAll(() => {
    tmdbService = new TMDbService();
    translateService = new TranslateService();
    nameParser = new MovieNameParser();
  });

  describe('Russian Movie Titles', () => {
    test('Should find "Всё везде и сразу" (Everything Everywhere All at Once)', async () => {
      const filename = 'Всё везде и сразу.2022.UHD.Blu-Ray.Remux.2160p.mkv';
      const { cleanName, year } = nameParser.cleanMovieName(filename);

      console.log(`\n🎬 Testing Russian: "${cleanName}" (${year})`);

      // Try original title first (TMDb should handle Cyrillic!)
      let movieData = await tmdbService.searchMovie(cleanName, year);

      // If not found, try translated
      if (!movieData) {
        const translated = await translateService.translateToEnglish(cleanName, 'ru');
        console.log(`  Translated to: "${translated}"`);
        movieData = await tmdbService.searchMovie(translated, year);
      }

      expect(movieData).not.toBeNull();
      expect(movieData?.year).toBe(2022);
      expect(movieData?.title).toContain('Everything Everywhere');
      expect(movieData?.imdbRating).toBeGreaterThan(7);
      expect(movieData?.posterUrl).toBeTruthy();

      console.log(`  ✓ Found: ${movieData?.title} (${movieData?.year})`);
      console.log(`  ✓ IMDB: ${movieData?.imdbRating}`);
      console.log(`  ✓ Poster: ${movieData?.posterUrl?.substring(0, 50)}...`);
    }, 30000);

    test('Should find "Смотрите, как они бегут" (See How They Run)', async () => {
      const filename = 'Смотрите, как они бегут.2022.WEB-DL.2160p.SDR.mkv';
      const { cleanName, year } = nameParser.cleanMovieName(filename);

      console.log(`\n🎬 Testing Russian: "${cleanName}" (${year})`);

      let movieData = await tmdbService.searchMovie(cleanName, year);

      if (!movieData) {
        const translated = await translateService.translateToEnglish(cleanName, 'ru');
        console.log(`  Translated to: "${translated}"`);
        movieData = await tmdbService.searchMovie(translated, year);
      }

      expect(movieData).not.toBeNull();
      expect(movieData?.year).toBe(2022);
      expect(movieData?.title.toLowerCase()).toContain('see how they run');

      console.log(`  ✓ Found: ${movieData?.title} (${movieData?.year})`);
      console.log(`  ✓ IMDB: ${movieData?.imdbRating}`);
    }, 30000);

    test('Should find "Брат" (Brother - Russian movie)', async () => {
      const filename = 'Брат.1997.DVDRip.avi';
      const { cleanName, year } = nameParser.cleanMovieName(filename);

      console.log(`\n🎬 Testing Russian: "${cleanName}" (${year})`);

      let movieData = await tmdbService.searchMovie(cleanName, year);

      if (!movieData) {
        const translated = await translateService.translateToEnglish(cleanName, 'ru');
        console.log(`  Translated to: "${translated}"`);
        movieData = await tmdbService.searchMovie(translated, year);
      }

      expect(movieData).not.toBeNull();
      expect(movieData?.year).toBe(1997);
      expect(movieData?.country).toContain('Russia');

      console.log(`  ✓ Found: ${movieData?.title} (${movieData?.year})`);
      console.log(`  ✓ Country: ${movieData?.country}`);
    }, 30000);
  });

  describe('Chinese Movie Titles', () => {
    test('Should find "卧虎藏龙" (Crouching Tiger, Hidden Dragon)', async () => {
      const filename = '卧虎藏龙.2000.BluRay.1080p.mkv';
      const { cleanName, year } = nameParser.cleanMovieName(filename);

      console.log(`\n🎬 Testing Chinese: "${cleanName}" (${year})`);

      let movieData = await tmdbService.searchMovie(cleanName, year);

      if (!movieData) {
        const translated = await translateService.translateToEnglish(cleanName, 'zh');
        console.log(`  Translated to: "${translated}"`);
        movieData = await tmdbService.searchMovie(translated, year);
      }

      expect(movieData).not.toBeNull();
      expect(movieData?.year).toBe(2000);
      expect(movieData?.title).toContain('Crouching Tiger');

      console.log(`  ✓ Found: ${movieData?.title} (${movieData?.year})`);
    }, 30000);
  });

  describe('Spanish Movie Titles', () => {
    test('Should find "El laberinto del fauno" (Pan\'s Labyrinth)', async () => {
      const filename = 'El laberinto del fauno.2006.BluRay.mkv';
      const { cleanName, year } = nameParser.cleanMovieName(filename);

      console.log(`\n🎬 Testing Spanish: "${cleanName}" (${year})`);

      const movieData = await tmdbService.searchMovie(cleanName, year);

      expect(movieData).not.toBeNull();
      expect(movieData?.year).toBe(2006);
      expect(movieData?.originalTitle).toContain('laberinto');

      console.log(`  ✓ Found: ${movieData?.title} (${movieData?.year})`);
      console.log(`  ✓ Original: ${movieData?.originalTitle}`);
    }, 30000);
  });

  describe('Japanese Movie Titles', () => {
    test('Should find "千と千尋の神隠し" (Spirited Away)', async () => {
      const filename = '千と千尋の神隠し.2001.BluRay.mkv';
      const { cleanName, year } = nameParser.cleanMovieName(filename);

      console.log(`\n🎬 Testing Japanese: "${cleanName}" (${year})`);

      let movieData = await tmdbService.searchMovie(cleanName, year);

      if (!movieData) {
        const translated = await translateService.translateToEnglish(cleanName, 'ja');
        console.log(`  Translated to: "${translated}"`);
        movieData = await tmdbService.searchMovie(translated, year);
      }

      expect(movieData).not.toBeNull();
      expect(movieData?.year).toBe(2001);
      expect(movieData?.title).toContain('Spirited Away');

      console.log(`  ✓ Found: ${movieData?.title} (${movieData?.year})`);
    }, 30000);
  });

  describe('French Movie Titles', () => {
    test('Should find "Le Fabuleux Destin d\'Amélie Poulain" (Amélie)', async () => {
      const filename = 'Le Fabuleux Destin d\'Amélie Poulain.2001.mkv';
      const { cleanName, year } = nameParser.cleanMovieName(filename);

      console.log(`\n🎬 Testing French: "${cleanName}" (${year})`);

      const movieData = await tmdbService.searchMovie(cleanName, year);

      expect(movieData).not.toBeNull();
      expect(movieData?.year).toBe(2001);

      console.log(`  ✓ Found: ${movieData?.title} (${movieData?.year})`);
    }, 30000);
  });

  describe('Korean Movie Titles', () => {
    test('Should find "기생충" (Parasite)', async () => {
      const filename = '기생충.2019.BluRay.1080p.mkv';
      const { cleanName, year } = nameParser.cleanMovieName(filename);

      console.log(`\n🎬 Testing Korean: "${cleanName}" (${year})`);

      let movieData = await tmdbService.searchMovie(cleanName, year);

      if (!movieData) {
        const translated = await translateService.translateToEnglish(cleanName, 'ko');
        console.log(`  Translated to: "${translated}"`);
        movieData = await tmdbService.searchMovie(translated, year);
      }

      expect(movieData).not.toBeNull();
      expect(movieData?.year).toBe(2019);
      expect(movieData?.title).toBe('Parasite');

      console.log(`  ✓ Found: ${movieData?.title} (${movieData?.year})`);
    }, 30000);
  });

  describe('Mixed Language Tests', () => {
    test('Should handle file with quality tags and special chars', async () => {
      const filename = 'Всё.везде.и.сразу.2022.REMUX.2160p.UHD.BluRay.x265.10bit.HDR.mkv';
      const { cleanName, year } = nameParser.cleanMovieName(filename);

      console.log(`\n🎬 Testing complex filename: "${cleanName}" (${year})`);

      let movieData = await tmdbService.searchMovie(cleanName, year);

      if (!movieData) {
        const translated = await translateService.translateToEnglish(cleanName, 'ru');
        movieData = await tmdbService.searchMovie(translated, year);
      }

      expect(movieData).not.toBeNull();
      expect(movieData?.year).toBe(2022);

      console.log(`  ✓ Found: ${movieData?.title}`);
    }, 30000);
  });

  describe('Poster Quality Tests', () => {
    test('Should return high-quality poster URLs', async () => {
      const movieData = await tmdbService.searchMovie('The Matrix', 1999);

      expect(movieData).not.toBeNull();
      expect(movieData?.posterUrl).toContain('original'); // TMDb original = 4K
      expect(movieData?.posterUrl).toContain('image.tmdb.org');

      console.log(`\n🎨 Poster URL: ${movieData?.posterUrl}`);
      console.log(`  ✓ Contains "original" (4K quality)`);
    }, 30000);
  });
});
