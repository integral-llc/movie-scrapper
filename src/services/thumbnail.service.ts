import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import crypto from 'crypto';

export class ThumbnailService {
  private thumbnailCache: string;

  constructor() {
    this.thumbnailCache = path.join(process.cwd(), 'data', 'thumbnails');
    if (!fs.existsSync(this.thumbnailCache)) {
      fs.mkdirSync(this.thumbnailCache, { recursive: true });
    }
  }

  /**
   * Generate a cache key from the poster path
   */
  private getCacheKey(posterPath: string): string {
    return crypto.createHash('md5').update(posterPath).digest('hex');
  }

  /**
   * Get thumbnail path for a poster
   */
  private getThumbnailPath(posterPath: string): string {
    const cacheKey = this.getCacheKey(posterPath);
    return path.join(this.thumbnailCache, `${cacheKey}.jpg`);
  }

  /**
   * Generate optimized thumbnail from original poster
   * - Resize to max 400px wide (maintains aspect ratio)
   * - Quality 80%
   * - Progressive JPEG
   */
  async generateThumbnail(posterPath: string): Promise<string | null> {
    try {
      // Check if original poster exists
      if (!fs.existsSync(posterPath)) {
        return null;
      }

      const thumbnailPath = this.getThumbnailPath(posterPath);

      // Check if thumbnail already exists and is newer than original
      if (fs.existsSync(thumbnailPath)) {
        const posterStat = fs.statSync(posterPath);
        const thumbStat = fs.statSync(thumbnailPath);
        if (thumbStat.mtime >= posterStat.mtime) {
          return thumbnailPath;
        }
      }

      // Generate new thumbnail
      await sharp(posterPath)
        .resize(400, null, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({
          quality: 80,
          progressive: true,
        })
        .toFile(thumbnailPath);

      return thumbnailPath;
    } catch (error) {
      console.error(`Error generating thumbnail for ${posterPath}:`, error);
      return null;
    }
  }

  /**
   * Get thumbnail for a poster, generating if needed
   * Always checks if source poster has been updated since cache was created
   */
  async getThumbnail(posterPath: string): Promise<string | null> {
    // Always use generateThumbnail which properly checks modification times
    return this.generateThumbnail(posterPath);
  }

  /**
   * Clear thumbnail cache
   */
  clearCache(): void {
    if (fs.existsSync(this.thumbnailCache)) {
      const files = fs.readdirSync(this.thumbnailCache);
      for (const file of files) {
        fs.unlinkSync(path.join(this.thumbnailCache, file));
      }
    }
  }
}
