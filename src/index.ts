import express, { Request, Response } from 'express';
import cors from 'cors';
import { initConfig, getConfig } from './config/env.config';
import { TaskRunner } from './tasks/task-runner';
import { MovieScanTask } from './tasks/movie-scan.task';
import { RetryErrorsTask } from './tasks/retry-errors.task';
import { Scheduler } from './utils/scheduler.util';
import { MovieController } from './controllers/movie.controller';
import { ThumbnailController } from './controllers/thumbnail.controller';
import { DatabaseConnection } from './models/database';

const app = express();

app.use(cors());
app.use(express.json());

// Initialize config asynchronously before starting the server
async function bootstrap() {
  // Load secrets from AWS Secrets Manager (or local .env fallback)
  await initConfig();
  const config = getConfig();

  const taskRunner = new TaskRunner();
  taskRunner.registerTask(new MovieScanTask());
  taskRunner.registerTask(new RetryErrorsTask());

  const scheduler = new Scheduler(taskRunner);
  scheduler.scheduleMovieScan();

  const movieController = new MovieController(taskRunner);
  const thumbnailController = new ThumbnailController();

  app.get('/', (_req: Request, res: Response) => {
    res.json({
      name: 'Movie Scrapper API',
      version: '1.0.0',
      endpoints: {
        'GET /': 'API information',
        'GET /movies': 'Movie library web UI',
        'GET /movies/api/list': 'Get all movies (query: ?status=active|deleted|error)',
        'GET /movies/api/details/:id': 'Get movie by ID',
        'GET /movies/api/stats': 'Get statistics',
        'GET /movies/api/thumbnails/:id': 'Get movie poster thumbnail',
        'POST /movies/api/scan': 'Trigger manual scan',
        'POST /movies/api/cleanup-duplicates': 'Clean up duplicate NFO/poster files',
        'POST /movies/api/retry-errors': 'Retry all error movies with enhanced search',
        'GET /movies/api/tasks': 'Get registered tasks',
      },
    });
  });

  // Movie service - all endpoints under /movies
  app.get('/movies/api/list', movieController.getAllMovies);
  app.get('/movies/api/details/:id', movieController.getMovieById);
  app.get('/movies/api/stats', movieController.getStats);
  app.get('/movies/api/thumbnails/:id', thumbnailController.getThumbnail);
  app.post('/movies/api/scan', movieController.triggerScan);

  app.get('/movies', (_req: Request, res: Response) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Movie Library</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #fff; }
    .header { background: #111; padding: 20px; border-bottom: 2px solid #e50914; }
    .header h1 { font-size: 32px; color: #e50914; }
    .stats { display: flex; gap: 20px; margin: 20px; }
    .stat-card { background: #1a1a1a; padding: 20px; border-radius: 8px; flex: 1; }
    .stat-card h3 { color: #888; font-size: 14px; margin-bottom: 10px; }
    .stat-card .value { font-size: 32px; color: #e50914; font-weight: bold; }
    .filters { padding: 20px; background: #111; display: flex; gap: 10px; }
    .filters select, .filters input { padding: 10px; background: #1a1a1a; color: #fff; border: 1px solid #333; border-radius: 4px; }
    .movies-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 20px; padding: 20px; }
    .movie-card { background: #1a1a1a; border-radius: 8px; overflow: hidden; transition: transform 0.2s; cursor: pointer; }
    .movie-card:hover { transform: scale(1.05); }
    .movie-poster { width: 100%; height: 300px; background: #333; display: flex; align-items: center; justify-content: center; color: #666; }
    .movie-info { padding: 15px; }
    .movie-title { font-size: 16px; font-weight: bold; margin-bottom: 5px; }
    .movie-year { color: #888; font-size: 14px; }
    .movie-rating { color: #e50914; font-weight: bold; margin-top: 5px; }
    .loading { text-align: center; padding: 40px; font-size: 20px; color: #888; }

    /* Modal Styles */
    .modal-overlay { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.9); z-index: 1000; overflow-y: auto; }
    .modal-overlay.active { display: flex; justify-content: center; align-items: flex-start; padding: 40px 20px; }
    .modal { background: #1a1a1a; border-radius: 12px; max-width: 900px; width: 100%; max-height: 90vh; overflow-y: auto; position: relative; }
    .modal-close { position: absolute; top: 15px; right: 15px; background: #e50914; color: white; border: none; width: 36px; height: 36px; border-radius: 50%; cursor: pointer; font-size: 20px; z-index: 10; }
    .modal-content { display: flex; flex-direction: column; }
    .modal-header { display: flex; gap: 30px; padding: 30px; }
    .modal-poster { width: 300px; min-width: 300px; border-radius: 8px; overflow: hidden; }
    .modal-poster img { width: 100%; height: auto; display: block; }
    .modal-details { flex: 1; }
    .modal-title { font-size: 28px; font-weight: bold; margin-bottom: 10px; color: #fff; }
    .modal-meta { display: flex; gap: 15px; flex-wrap: wrap; margin-bottom: 20px; }
    .modal-meta-item { background: #333; padding: 6px 12px; border-radius: 4px; font-size: 14px; }
    .modal-meta-item.rating { background: #e50914; color: white; font-weight: bold; }
    .modal-section { margin-top: 20px; }
    .modal-section h3 { color: #e50914; font-size: 14px; text-transform: uppercase; margin-bottom: 8px; }
    .modal-section p, .modal-section .value { color: #ccc; font-size: 14px; line-height: 1.6; }
    .modal-file-path { background: #0a0a0a; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 12px; word-break: break-all; color: #4fc3f7; border: 1px solid #333; }
    .modal-genres { display: flex; gap: 8px; flex-wrap: wrap; }
    .modal-genre { background: #333; padding: 4px 10px; border-radius: 4px; font-size: 12px; }
    .modal-footer { padding: 20px 30px; background: #111; border-top: 1px solid #333; }

    @media (max-width: 768px) {
      .modal-header { flex-direction: column; }
      .modal-poster { width: 100%; min-width: auto; max-width: 300px; margin: 0 auto; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Movie Library</h1>
    <button id="scanBtn" onclick="triggerScan()" style="padding: 10px 20px; background: #e50914; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; margin-left: 20px;">Scan Movies</button>
  </div>

  <div class="stats" id="stats">
    <div class="stat-card"><h3>TOTAL MOVIES</h3><div class="value" id="total">-</div></div>
    <div class="stat-card"><h3>ACTIVE</h3><div class="value" id="active">-</div></div>
    <div class="stat-card"><h3>ERRORS</h3><div class="value" id="errors">-</div></div>
    <div class="stat-card"><h3>AVG RATING</h3><div class="value" id="avgRating">-</div></div>
  </div>

  <div class="filters">
    <select id="statusFilter" onchange="loadMovies()">
      <option value="active">Active Movies</option>
      <option value="error">Error Movies</option>
      <option value="deleted">Deleted Movies</option>
    </select>
    <input type="text" id="searchBox" placeholder="Search movies..." onkeyup="loadMovies()" />
  </div>

  <div class="movies-grid" id="moviesGrid">
    <div class="loading">Loading movies...</div>
  </div>

  <!-- Movie Details Modal -->
  <div class="modal-overlay" id="movieModal" onclick="closeModal(event)">
    <div class="modal" onclick="event.stopPropagation()">
      <button class="modal-close" onclick="closeModal()">&times;</button>
      <div class="modal-content" id="modalContent">
        <div class="loading">Loading...</div>
      </div>
    </div>
  </div>

  <script>
    let allMovies = [];

    async function loadStats() {
      const res = await fetch('/movies/api/stats');
      const data = await res.json();
      if (data.success) {
        document.getElementById('total').textContent = data.stats.totalMovies;
        document.getElementById('active').textContent = data.stats.activeMovies;
        document.getElementById('errors').textContent = data.stats.errorMovies;
        document.getElementById('avgRating').textContent = data.stats.averageRating.toFixed(1);
      }
    }

    async function loadMovies() {
      const status = document.getElementById('statusFilter').value;
      const search = document.getElementById('searchBox').value;
      const res = await fetch('/movies/api/list?status=' + status);
      const data = await res.json();

      allMovies = data.movies || [];
      let movies = allMovies;
      if (search) {
        movies = movies.filter(m => m.title.toLowerCase().includes(search.toLowerCase()));
      }

      const grid = document.getElementById('moviesGrid');
      if (movies.length === 0) {
        grid.innerHTML = '<div class="loading">No movies found</div>';
        return;
      }

      grid.innerHTML = movies.map(movie => \`
        <div class="movie-card" onclick="showMovieDetails(\${movie.id})">
          <div class="movie-poster">
            <img src="/movies/api/thumbnails/\${movie.id}"
                 style="width:100%;height:100%;object-fit:cover;"
                 onerror="this.parentElement.innerHTML='No Poster';"
                 loading="lazy" />
          </div>
          <div class="movie-info">
            <div class="movie-title">\${movie.title}</div>
            <div class="movie-year">\${movie.year || 'N/A'}</div>
            <div class="movie-rating">\${movie.imdbRating > 0 ? movie.imdbRating.toFixed(1) : 'N/A'}</div>
          </div>
        </div>
      \`).join('');
    }

    async function showMovieDetails(movieId) {
      const modal = document.getElementById('movieModal');
      const content = document.getElementById('modalContent');
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
      content.innerHTML = '<div class="loading">Loading movie details...</div>';

      try {
        const res = await fetch('/movies/api/details/' + movieId);
        const data = await res.json();

        if (!data.success || !data.movie) {
          content.innerHTML = '<div class="loading">Movie not found</div>';
          return;
        }

        const m = data.movie;
        const genres = m.genre ? m.genre.split(',').map(g => g.trim()).filter(g => g) : [];

        content.innerHTML = \`
          <div class="modal-header">
            <div class="modal-poster">
              <img src="/movies/api/thumbnails/\${m.id}"
                   onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22300%22 height=%22450%22><rect fill=%22%23333%22 width=%22100%%22 height=%22100%%22/><text x=%2250%%22 y=%2250%%22 fill=%22%23666%22 text-anchor=%22middle%22 dy=%22.3em%22 font-size=%2240%22>No Poster</text></svg>';" />
            </div>
            <div class="modal-details">
              <h1 class="modal-title">\${m.title}</h1>
              <div class="modal-meta">
                \${m.year ? \`<span class="modal-meta-item">\${m.year}</span>\` : ''}
                \${m.imdbRating > 0 ? \`<span class="modal-meta-item rating">IMDB \${m.imdbRating.toFixed(1)}</span>\` : ''}
                \${m.runtime ? \`<span class="modal-meta-item">\${m.runtime} min</span>\` : ''}
                \${m.country ? \`<span class="modal-meta-item">\${m.country}</span>\` : ''}
                \${m.language ? \`<span class="modal-meta-item">\${m.language}</span>\` : ''}
              </div>

              \${genres.length > 0 ? \`
                <div class="modal-section">
                  <h3>Genres</h3>
                  <div class="modal-genres">
                    \${genres.map(g => \`<span class="modal-genre">\${g}</span>\`).join('')}
                  </div>
                </div>
              \` : ''}

              \${m.director ? \`
                <div class="modal-section">
                  <h3>Director</h3>
                  <p>\${m.director}</p>
                </div>
              \` : ''}

              \${m.actors ? \`
                <div class="modal-section">
                  <h3>Cast</h3>
                  <p>\${m.actors}</p>
                </div>
              \` : ''}

              \${m.plot ? \`
                <div class="modal-section">
                  <h3>Plot</h3>
                  <p>\${m.plot}</p>
                </div>
              \` : ''}
            </div>
          </div>
          <div class="modal-footer">
            <div class="modal-section" style="margin-top: 0;">
              <h3>File Location</h3>
              <div class="modal-file-path">\${m.currentPath || 'Unknown'}</div>
            </div>
            \${m.originalFileName ? \`
              <div class="modal-section">
                <h3>Original File Name</h3>
                <div class="modal-file-path">\${m.originalFileName}</div>
              </div>
            \` : ''}
            \${m.tmdbId ? \`
              <div class="modal-section">
                <h3>External IDs</h3>
                <p>TMDB: \${m.tmdbId}\${m.imdbId ? ' | IMDB: ' + m.imdbId : ''}</p>
              </div>
            \` : ''}
          </div>
        \`;
      } catch (error) {
        content.innerHTML = '<div class="loading">Error loading movie details</div>';
        console.error('Error:', error);
      }
    }

    function closeModal(event) {
      if (event && event.target !== event.currentTarget) return;
      document.getElementById('movieModal').classList.remove('active');
      document.body.style.overflow = '';
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });

    async function triggerScan() {
      const btn = document.getElementById('scanBtn');
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Scanning...';
      btn.style.opacity = '0.6';

      try {
        const res = await fetch('/movies/api/scan', { method: 'POST' });
        const data = await res.json();

        if (data.success) {
          btn.textContent = 'Scan Started!';
          setTimeout(() => {
            loadStats();
            loadMovies();
            btn.textContent = originalText;
            btn.disabled = false;
            btn.style.opacity = '1';
          }, 2000);
        } else {
          alert('Scan failed: ' + (data.error || 'Unknown error'));
          btn.textContent = originalText;
          btn.disabled = false;
          btn.style.opacity = '1';
        }
      } catch (error) {
        alert('Error triggering scan: ' + error.message);
        btn.textContent = originalText;
        btn.disabled = false;
        btn.style.opacity = '1';
      }
    }

    loadStats();
    loadMovies();
    setInterval(loadStats, 30000);
  </script>
</body>
</html>
    `);
  });

  app.post('/movies/api/cleanup-duplicates', movieController.cleanupDuplicates);

  app.post('/movies/api/retry-errors', async (_req: Request, res: Response) => {
    try {
      console.log('Retry errors triggered via API');
      res.json({ success: true, message: 'Retry started' });

      taskRunner.executeTask('RetryErrorsTask').catch((error) => {
        console.error('Retry failed:', error);
      });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to trigger retry' });
    }
  });

  app.get('/movies/api/tasks', (_req: Request, res: Response) => {
    const tasks = taskRunner.getRegisteredTasks();
    res.json({ success: true, tasks });
  });

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ success: true, status: 'healthy', timestamp: new Date().toISOString() });
  });

  DatabaseConnection.getInstance();

  const server = app.listen(config.port, () => {
    console.log('='.repeat(50));
    console.log('Movie Scrapper Server');
    console.log('='.repeat(50));
    console.log(`Server running on port: ${config.port}`);
    console.log(`API URL: http://localhost:${config.port}`);
    console.log(`Scan schedule: ${config.scanCronSchedule} (every 12 hours)`);
    console.log('='.repeat(50));
  });

  const gracefulShutdown = () => {
    console.log('\nShutting down gracefully...');
    scheduler.stopAll();
    DatabaseConnection.close();
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
}

// Start the application
bootstrap().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
