import { Request, Response } from 'express';
import { MovieRepository } from '../repositories/movie.repository';
import { ThumbnailService } from '../services/thumbnail.service';
import { PlaceholderService } from '../services/placeholder.service';
import fs from 'fs';
import path from 'path';

export class ThumbnailController {
  private movieRepo: MovieRepository;
  private thumbnailService: ThumbnailService;
  private placeholderService: PlaceholderService;

  constructor() {
    this.movieRepo = new MovieRepository();
    this.thumbnailService = new ThumbnailService();
    this.placeholderService = new PlaceholderService();
  }

  /**
   * Serve optimized poster thumbnail for a movie
   * GET /api/thumbnails/:id
   */
  getThumbnail = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id, 10);
      const movie = this.movieRepo.findById(id);

      if (!movie) {
        res.status(404).json({ success: false, error: 'Movie not found' });
        return;
      }

      // Determine poster path - try exact match first
      const directory = path.dirname(movie.currentPath);
      const extension = path.extname(movie.currentPath);
      const baseFileName = movie.fileName.replace(extension, '');
      let posterPath = path.join(directory, `${baseFileName}-poster.jpg`);

      // If exact match doesn't exist, look for any poster matching the title
      if (!fs.existsSync(posterPath)) {
        try {
          // Extract title from filename (everything before the year if it exists)
          const titleMatch = movie.fileName.match(/^(.+?)\s*\(\d{4}\)/);
          const titlePrefix = titleMatch ? titleMatch[1].trim() : baseFileName;

          const files = fs.readdirSync(directory);
          const posterFile = files.find(f =>
            f.startsWith(titlePrefix) && f.endsWith('-poster.jpg')
          );

          if (posterFile) {
            posterPath = path.join(directory, posterFile);
          }
        } catch (err) {
          // Directory read failed, continue to final check
        }
      }

      // If no poster exists, use placeholder
      if (!fs.existsSync(posterPath)) {
        const placeholderPath = await this.placeholderService.getPlaceholder();
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day for placeholders
        res.sendFile(placeholderPath);
        return;
      }

      // Get or generate thumbnail
      const thumbnailPath = await this.thumbnailService.getThumbnail(posterPath);

      if (!thumbnailPath || !fs.existsSync(thumbnailPath)) {
        // Fallback to placeholder if thumbnail generation fails
        const placeholderPath = await this.placeholderService.getPlaceholder();
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.sendFile(placeholderPath);
        return;
      }

      // Serve thumbnail with caching headers
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year
      res.sendFile(thumbnailPath);
    } catch (error) {
      console.error('Thumbnail error:', error);
      res.status(500).json({ success: false, error: 'Failed to serve thumbnail' });
    }
  };
}
