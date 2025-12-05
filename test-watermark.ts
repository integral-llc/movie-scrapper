import { PosterService } from './src/services/poster.service';

async function test() {
  const posterService = new PosterService();

  // Test with a TMDb poster URL
  const testPosterUrl = 'https://image.tmdb.org/t/p/original/vpnVM9B6NMmQpWeZvzLvDESb2QY.jpg'; // Coco
  const outputPath = '/Users/dev/projects/IG/MovieScrapper/test-poster.jpg';
  const imdbRating = 8.4;

  console.log('Testing watermark functionality...');
  console.log(`Poster URL: ${testPosterUrl}`);
  console.log(`Output: ${outputPath}`);
  console.log(`Rating: ${imdbRating}`);

  const result = await posterService.downloadAndWatermarkPoster(
    testPosterUrl,
    outputPath,
    imdbRating
  );

  console.log(`\nResult: ${result ? 'SUCCESS' : 'FAILED'}`);
}

test().catch(console.error);
