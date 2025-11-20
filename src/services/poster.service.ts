import fs from 'fs';
import path from 'path';
import axios from 'axios';
import sharp from 'sharp';

export class PosterService {
  async downloadAndWatermarkPoster(
    posterUrl: string,
    outputPath: string,
    imdbRating: number
  ): Promise<boolean> {
    if (!posterUrl || posterUrl === 'N/A') {
      return false;
    }

    try {
      // Clean up old poster files with different ratings
      this.cleanupOldPosters(outputPath);

      console.log(`  Downloading 4K poster...`);

      // Download poster
      const response = await axios.get(posterUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
      });

      const imageBuffer = Buffer.from(response.data);

      // Get image dimensions
      const metadata = await sharp(imageBuffer).metadata();
      const width = metadata.width || 2000;
      const height = metadata.height || 3000;

      // Create rating badge
      const fontSize = Math.floor(width * 0.08); // 8% of width
      const badgeSize = fontSize * 2.5;
      const padding = Math.floor(width * 0.03);

      // Create SVG for IMDB rating badge
      const ratingText = imdbRating.toFixed(1);
      const svgBadge = `
        <svg width="${badgeSize}" height="${badgeSize}">
          <!-- Background circle with shadow -->
          <defs>
            <filter id="shadow">
              <feDropShadow dx="0" dy="4" stdDeviation="8" flood-opacity="0.8"/>
            </filter>
          </defs>

          <!-- Outer circle (gold border) -->
          <circle cx="${badgeSize / 2}" cy="${badgeSize / 2}" r="${badgeSize / 2 - 5}"
                  fill="#1a1a1a" stroke="#f5c518" stroke-width="6" filter="url(#shadow)"/>

          <!-- IMDB text -->
          <text x="${badgeSize / 2}" y="${badgeSize / 2 - fontSize * 0.3}"
                text-anchor="middle"
                font-family="Arial, sans-serif"
                font-size="${fontSize * 0.35}"
                font-weight="bold"
                fill="#f5c518">IMDB</text>

          <!-- Rating number -->
          <text x="${badgeSize / 2}" y="${badgeSize / 2 + fontSize * 0.5}"
                text-anchor="middle"
                font-family="Arial, sans-serif"
                font-size="${fontSize * 0.8}"
                font-weight="bold"
                fill="#ffffff">${ratingText}</text>

          <!-- /10 text -->
          <text x="${badgeSize / 2}" y="${badgeSize / 2 + fontSize * 0.95}"
                text-anchor="middle"
                font-family="Arial, sans-serif"
                font-size="${fontSize * 0.25}"
                fill="#cccccc">/10</text>
        </svg>
      `;

      const svgBuffer = Buffer.from(svgBadge);

      // Composite watermark on poster
      const watermarkedImage = await sharp(imageBuffer)
        .composite([
          {
            input: svgBuffer,
            top: padding,
            left: padding,
          },
        ])
        .jpeg({ quality: 95 }) // High quality
        .toBuffer();

      // Save to disk
      fs.writeFileSync(outputPath, watermarkedImage);

      console.log(`  ✓ Poster saved with IMDB ${ratingText} watermark`);
      return true;
    } catch (error) {
      console.error(`  ✗ Error processing poster:`, error instanceof Error ? error.message : error);
      return false;
    }
  }

  /**
   * Remove old poster files with different IMDB ratings for the same movie
   */
  private cleanupOldPosters(currentPosterPath: string): void {
    try {
      const directory = path.dirname(currentPosterPath);
      const currentFileName = path.basename(currentPosterPath);

      // Extract title without IMDB rating: "Title (Year) (IMDB X.X)-poster.jpg" -> "Title"
      const titleMatch = currentFileName.match(/^(.+?)\s*\((?:19|20)\d{4}\)\s*\(IMDB/);
      if (!titleMatch) return;

      const baseTitle = titleMatch[1];

      // Find all poster files with same title but different IMDB ratings
      const files = fs.readdirSync(directory);
      const pattern = new RegExp(`^${this.escapeRegex(baseTitle)}\\s*\\((?:19|20)\\d{4}\\)\\s*\\(IMDB\\s*[0-9.]+\\)-poster\\.jpg$`);

      files.forEach(file => {
        if (pattern.test(file) && file !== currentFileName) {
          const filePath = path.join(directory, file);
          try {
            fs.unlinkSync(filePath);
            console.log(`  Removed old poster: ${file}`);
          } catch (err) {
            // Ignore errors (file might not exist or be locked)
          }
        }
      });
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
