# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

```bash
# Install dependencies
npm install

# Build TypeScript to JavaScript
npm run build

# Start production server (requires build first)
npm start

# Development mode with hot-reloading
npm run dev

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm run test:international
```

## Architecture Overview

MovieScrapper is a movie library management system that scans directories, identifies movies via TMDb/OMDb APIs, renames files with standardized naming, and generates Kodi-compatible metadata.

### Layer Architecture

```
Presentation Layer (Express + Controllers)
         ↓
Business Logic Layer (Services + Tasks)
         ↓
Data Access Layer (Repositories + Models)
         ↓
External Services (TMDb, OMDb, AWS Translate, Filesystem)
```

### Key Components

- **Entry Point**: `src/index.ts` - Express server, task registration, API routes
- **Main Orchestrator**: `src/services/movie-scanner-tmdb.service.ts` - Coordinates the entire scan workflow (Facade pattern)
- **Database**: SQLite via better-sqlite3, singleton connection in `src/models/database.ts`
- **Task System**: `ITask` interface in `src/types/task.types.ts`, executed by `src/tasks/task-runner.ts`

### Service Layer (`src/services/`)

| Service | Purpose |
|---------|---------|
| `movie-scanner-tmdb.service.ts` | Main orchestrator for scanning workflow |
| `tmdb.service.ts` | TMDb API integration |
| `omdb.service.ts` | OMDb API integration |
| `translate.service.ts` | AWS Translate for non-English titles |
| `file-renamer.service.ts` | File rename operations |
| `kodi.service.ts` | NFO metadata generation |
| `poster.service.ts` | Poster download with IMDB watermark |
| `ai-movie-parser.service.ts` | OpenAI-based fallback parser |

### Design Patterns Used

- **Repository Pattern**: `MovieRepository` abstracts database access
- **Singleton**: `DatabaseConnection.getInstance()`
- **Strategy**: Different handling for files vs BDRip folders in `FileScanner`
- **Facade**: `MovieScannerTMDbService` hides subsystem complexity
- **Template Method**: `ITask` interface with `execute()` method

## Configuration

- **Environment**: `.env` file (copy from `.env.example`)
- **Movie Folders**: `movies.txt` file with one path per line
- **Constants**: `src/config/constants.ts` - file extensions, regex patterns, country lists

## API Endpoints

All movie endpoints are under `/movies/api/`:
- `GET /movies/api/list?status=active|deleted|error` - List movies
- `GET /movies/api/details/:id` - Movie details
- `GET /movies/api/stats` - Library statistics
- `POST /movies/api/scan` - Trigger manual scan
- `POST /movies/api/retry-errors` - Retry failed movies
- `GET /movies` - Web UI

## File Naming Convention

Output format: `Movie Title (Year) (IMDB X.X).extension`

Movie files are identified by extensions in `MOVIE_EXTENSIONS` constant. TV episodes (S01E02 pattern) and audio files are automatically skipped.

## Adding New Tasks

1. Implement `ITask` interface in `src/tasks/`
2. Register with `taskRunner.registerTask()` in `src/index.ts`
3. Optionally schedule with `scheduler.scheduleTask()`
