import { Request, Response } from 'express';
import { MovieRepository } from '../repositories/movie.repository';
import { TaskRunner } from '../tasks/task-runner';

export class MovieController {
  private movieRepo: MovieRepository;
  private taskRunner: TaskRunner;

  constructor(taskRunner: TaskRunner) {
    this.movieRepo = new MovieRepository();
    this.taskRunner = taskRunner;
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
}
