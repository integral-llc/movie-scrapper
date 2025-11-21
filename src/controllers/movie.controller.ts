import { Request, Response } from 'express';
import fs from 'fs';
import { MovieRepository } from '../repositories/movie.repository';
import { TaskRunner } from '../tasks/task-runner';
import { FileRenamerService } from '../services/file-renamer.service';
import { getConfig } from '../config/env.config';

export class MovieController {
  private movieRepo: MovieRepository;
  private taskRunner: TaskRunner;
  private fileRenamer: FileRenamerService;

  constructor(taskRunner: TaskRunner) {
    this.movieRepo = new MovieRepository();
    this.taskRunner = taskRunner;
    this.fileRenamer = new FileRenamerService();
  }

  getAllMovies = async (req: Request, res: Response): Promise<void> => {
    try {
      const status = req.query.status as 'active' | 'deleted' | 'error' | undefined;
      const movies = this.movieRepo.findAll(status);
      res.json({ success: true, count: movies.length, movies });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to fetch movies' });
    }
  };

  getMovieById = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id, 10);
      const movie = this.movieRepo.findById(id);

      if (!movie) {
        res.status(404).json({ success: false, error: 'Movie not found' });
        return;
      }

      res.json({ success: true, movie });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to fetch movie' });
    }
  };

  triggerScan = async (req: Request, res: Response): Promise<void> => {
    try {
      console.log('Manual scan triggered via API');

      res.json({ success: true, message: 'Scan started' });

      this.taskRunner.executeTask('MovieScanTask').catch((error) => {
        console.error('Scan failed:', error);
      });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to trigger scan' });
    }
  };

  getStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const activeMovies = this.movieRepo.findAll('active');
      const deleted = this.movieRepo.findAll('deleted').length;
      const errors = this.movieRepo.findAll('error').length;

      const totalMovies = activeMovies.length + deleted + errors;
      const activeMoviesCount = activeMovies.length;

      // Calculate average rating for active movies with valid ratings
      const moviesWithRatings = activeMovies.filter(m => m.imdbRating > 0);
      const averageRating = moviesWithRatings.length > 0
        ? moviesWithRatings.reduce((sum, m) => sum + m.imdbRating, 0) / moviesWithRatings.length
        : 0;

      res.json({
        success: true,
        stats: {
          totalMovies,
          activeMovies: activeMoviesCount,
          errorMovies: errors,
          deletedMovies: deleted,
          averageRating,
          active: activeMoviesCount,
          deleted,
          errors,
          total: totalMovies,
        },
      });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to fetch stats' });
    }
  };

  cleanupDuplicates = async (req: Request, res: Response): Promise<void> => {
    try {
      console.log('Cleanup duplicates triggered via API');

      // Read movie folders from movies.txt
      const moviesTxtPath = getConfig().moviesTxtPath;
      if (!fs.existsSync(moviesTxtPath)) {
        res.status(400).json({ success: false, error: 'movies.txt not found' });
        return;
      }

      const content = fs.readFileSync(moviesTxtPath, 'utf-8');
      const folders = content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));

      let totalCleaned = 0;
      let totalKept = 0;

      for (const folder of folders) {
        if (fs.existsSync(folder)) {
          console.log(`Cleaning duplicates in: ${folder}`);
          const result = this.fileRenamer.cleanupAllDuplicateMetadata(folder);
          totalCleaned += result.cleaned;
          totalKept += result.kept;
        }
      }

      res.json({
        success: true,
        message: `Cleanup completed: ${totalCleaned} duplicate files removed, ${totalKept} files kept`,
        cleaned: totalCleaned,
        kept: totalKept,
      });
    } catch (error) {
      console.error('Cleanup failed:', error);
      res.status(500).json({ success: false, error: 'Failed to cleanup duplicates' });
    }
  };
}
