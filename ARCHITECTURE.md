# Architecture Documentation

This document explains the architectural decisions, design patterns, and structure of the Movie Scrapper system.

## Design Principles

The system is built following professional software engineering principles:

### SOLID Principles

1. **Single Responsibility Principle (SRP)**
   - Each class has one clear purpose
   - `FileScanner`: Only scans directories
   - `MovieNameParser`: Only parses and cleans names
   - `OMDBService`: Only handles IMDB API calls
   - `TranslateService`: Only handles translations

2. **Open/Closed Principle (OCP)**
   - System is open for extension, closed for modification
   - New tasks can be added without changing existing code
   - New movie parsers can be added by implementing `ITask`

3. **Liskov Substitution Principle (LSP)**
   - All tasks implement `ITask` interface
   - Can be swapped/added without breaking TaskRunner

4. **Interface Segregation Principle (ISP)**
   - Lean interfaces: `ITask` only requires `name` and `execute()`
   - Services don't depend on methods they don't use

5. **Dependency Inversion Principle (DIP)**
   - High-level modules depend on abstractions (`ITask`)
   - Dependencies injected via constructors
   - Database accessed through Repository pattern

## Design Patterns (Gang of Four)

### 1. Singleton Pattern
**Location**: `DatabaseConnection` ([src/models/database.ts](src/models/database.ts))

**Purpose**: Ensure single database connection throughout application

```typescript
public static getInstance(): Database.Database {
  if (!DatabaseConnection.instance) {
    DatabaseConnection.instance = new Database(config.databasePath);
  }
  return DatabaseConnection.instance;
}
```

**Benefits**:
- No connection conflicts
- Efficient resource usage
- Centralized connection management

### 2. Repository Pattern
**Location**: `MovieRepository` ([src/repositories/movie.repository.ts](src/repositories/movie.repository.ts))

**Purpose**: Abstract database operations from business logic

```typescript
class MovieRepository {
  create(movie: Omit<Movie, 'id'>): Movie
  update(id: number, movie: Partial<Movie>): void
  findByPath(path: string): Movie | undefined
  findAll(status?: string): Movie[]
}
```

**Benefits**:
- Business logic doesn't know about SQL
- Easy to switch databases (e.g., PostgreSQL)
- Centralized data access logic
- Simplified testing

### 3. Strategy Pattern
**Location**: File scanning logic ([src/utils/file-scanner.util.ts](src/utils/file-scanner.util.ts))

**Purpose**: Different strategies for files vs BDRip folders

**Implementation**:
- Files: Add individual movie files
- BDRip folders: Detect structure and add parent folder

**Benefits**:
- Flexible handling of different movie formats
- Easy to add new detection strategies

### 4. Factory Pattern
**Location**: Service instantiation in `MovieScannerService`

**Purpose**: Create appropriate service instances

```typescript
constructor() {
  this.movieRepo = new MovieRepository();
  this.omdbService = new OMDBService();
  this.translateService = new TranslateService();
  // ... etc
}
```

**Benefits**:
- Centralized object creation
- Easy to swap implementations
- Testability through dependency injection

### 5. Template Method Pattern
**Location**: `ITask` interface and implementations

**Purpose**: Define task execution skeleton, let subtasks implement details

```typescript
interface ITask {
  name: string;
  execute(): Promise<void>;
}
```

**Benefits**:
- Consistent task structure
- Easy to add new tasks
- TaskRunner works with any task

### 6. Facade Pattern
**Location**: `MovieScannerService` ([src/services/movie-scanner.service.ts](src/services/movie-scanner.service.ts))

**Purpose**: Provide simple interface to complex subsystem

**Complexity Hidden**:
- File scanning
- Name parsing
- Translation
- IMDB lookup
- File renaming
- Database operations
- Kodi file generation

**Simple Interface**:
```typescript
scanMovies(): Promise<ScanResult>
```

**Benefits**:
- Simple API for complex operations
- Orchestrates multiple services
- Hides implementation details

## System Architecture

### Layer Architecture

```
┌─────────────────────────────────────────────┐
│          Presentation Layer                  │
│  (Express REST API + Controllers)            │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│          Business Logic Layer                │
│  (Services + Tasks + Utils)                  │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│          Data Access Layer                   │
│  (Repositories + Models)                     │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│          External Services                   │
│  (OMDb API, AWS Translate, File System)     │
└─────────────────────────────────────────────┘
```

### Component Diagram

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Express    │────▶│  Controller  │────▶│  TaskRunner  │
│    Server    │     │              │     │              │
└──────────────┘     └──────────────┘     └──────────────┘
                                                   │
                                                   ▼
                                           ┌──────────────┐
                     ┌─────────────────────│     Task     │
                     │                     │  (ITask)     │
                     │                     └──────────────┘
                     ▼                             │
            ┌──────────────┐                       ▼
            │   Scheduler  │             ┌──────────────────┐
            │  (node-cron) │             │ MovieScanService │
            └──────────────┘             └──────────────────┘
                                                   │
                     ┌────────────────────────────┼────────────────┐
                     ▼                            ▼                ▼
            ┌──────────────┐          ┌──────────────┐  ┌──────────────┐
            │ OMDBService  │          │   Translate  │  │ FileScanner  │
            │              │          │   Service    │  │              │
            └──────────────┘          └──────────────┘  └──────────────┘
                     │                        │                  │
                     ▼                        ▼                  ▼
            ┌──────────────┐          ┌──────────────┐  ┌──────────────┐
            │  IMDB API    │          │ AWS Translate│  │ File System  │
            └──────────────┘          └──────────────┘  └──────────────┘
```

## Data Flow

### Movie Scan Process

```
1. Trigger (API/Schedule)
         │
         ▼
2. TaskRunner.executeTask('MovieScanTask')
         │
         ▼
3. MovieScannerService.scanMovies()
         │
         ├─▶ Read movies.txt
         │
         ├─▶ FileScanner.scanDirectory()
         │       │
         │       ├─▶ Find movie files (.mkv, .mp4, etc.)
         │       └─▶ Detect BDRip folders
         │
         ├─▶ For each movie:
         │       │
         │       ├─▶ MovieNameParser.cleanMovieName()
         │       │       └─▶ Remove quality, codec tags
         │       │
         │       ├─▶ TranslateService.detectLanguage()
         │       │       └─▶ Check if Cyrillic/Latin
         │       │
         │       ├─▶ TranslateService.translateToEnglish()
         │       │       └─▶ AWS Translate API
         │       │
         │       ├─▶ OMDBService.searchMovie()
         │       │       └─▶ OMDb API
         │       │
         │       ├─▶ Check country origin
         │       │       └─▶ Translate to Russian/Romanian if needed
         │       │
         │       ├─▶ MovieNameParser.buildFileName()
         │       │       └─▶ "Title (Year) (IMDB X.X).ext"
         │       │
         │       ├─▶ FileRenamerService.renameFile()
         │       │       └─▶ fs.renameSync()
         │       │
         │       ├─▶ MovieRepository.create()
         │       │       └─▶ SQLite INSERT
         │       │
         │       ├─▶ KodiService.createNFOFile()
         │       │       └─▶ Generate XML
         │       │
         │       └─▶ KodiService.downloadPoster()
         │               └─▶ HTTP GET + fs.writeFileSync()
         │
         └─▶ Return ScanResult
                 └─▶ { scanned, created, updated, deleted, errors }
```

## Directory Structure

```
src/
├── config/              # Configuration and constants
│   ├── constants.ts     # File extensions, patterns, countries
│   └── env.config.ts    # Environment variable management
│
├── controllers/         # HTTP request handlers
│   └── movie.controller.ts
│
├── models/              # Database models
│   └── database.ts      # Singleton DB connection
│
├── repositories/        # Data access layer (Repository Pattern)
│   └── movie.repository.ts
│
├── services/            # Business logic (Service Layer)
│   ├── movie-scanner.service.ts  # Main orchestrator (Facade)
│   ├── omdb.service.ts           # IMDB API integration
│   ├── translate.service.ts      # AWS Translate integration
│   ├── file-renamer.service.ts   # File operations
│   └── kodi.service.ts           # NFO & poster generation
│
├── tasks/               # Scheduled tasks (Template Method)
│   ├── movie-scan.task.ts        # ITask implementation
│   └── task-runner.ts            # Task executor
│
├── types/               # TypeScript interfaces
│   ├── movie.types.ts
│   └── task.types.ts
│
├── utils/               # Utility classes
│   ├── file-scanner.util.ts      # Directory scanning (Strategy)
│   ├── movie-name-parser.util.ts # Name cleaning
│   └── scheduler.util.ts         # Cron job management
│
└── index.ts             # Application entry point
```

## Key Interfaces

### ITask
```typescript
interface ITask {
  name: string;
  execute(): Promise<void>;
}
```

**Purpose**: Standard interface for all scheduled tasks
**Implementations**: `MovieScanTask`, (extensible)

### Movie
```typescript
interface Movie {
  id?: number;
  originalPath: string;
  currentPath: string;
  fileName: string;
  originalFileName: string;
  title: string;
  year: number;
  imdbRating: number;
  imdbId: string;
  country: string;
  status: 'active' | 'deleted' | 'error';
  // ... etc
}
```

**Purpose**: Core data model for movies

## Extensibility Points

### Adding New Tasks

1. Create class implementing `ITask`:
```typescript
export class MyCustomTask implements ITask {
  name = 'MyCustomTask';

  async execute(): Promise<void> {
    // Your logic here
  }
}
```

2. Register in `index.ts`:
```typescript
taskRunner.registerTask(new MyCustomTask());
```

3. Schedule if needed:
```typescript
scheduler.scheduleTask('MyCustomTask', '0 0 * * *');
```

### Adding New Movie Detection Strategies

Extend `FileScanner` class with new detection methods:
```typescript
private isSpecialFormat(folderPath: string): boolean {
  // Custom detection logic
}
```

### Adding New Translation Services

Implement translation interface in `TranslateService`:
```typescript
async translateWithGoogle(text: string): Promise<string> {
  // Google Translate implementation
}
```

### Adding New Metadata Sources

Create new service similar to `OMDBService`:
```typescript
export class TMDBService {
  async searchMovie(title: string): Promise<MovieData> {
    // TMDB API integration
  }
}
```

## Error Handling Strategy

### Graceful Degradation
- File rename fails → Save to DB with error status
- Translation fails → Use original name
- Poster download fails → Continue without poster
- IMDB lookup fails → Mark as error, don't crash

### Error Recording
```typescript
status: 'error'
errorMessage: string  // Detailed error for debugging
```

### Retry Strategy
- No automatic retries (avoid API quota burnout)
- Manual retry via re-scan
- Failed movies stay in DB for manual review

## Performance Considerations

### Database
- **SQLite WAL mode**: Better concurrent access
- **Indexes**: On `current_path`, `status`, `imdb_id`
- **Batch operations**: Single transaction per scan

### API Rate Limiting
- **OMDb**: 1,000 requests/day (free tier)
- **AWS Translate**: 2M characters/month (free tier)
- **Sequential processing**: Avoid parallel API hammering

### File Operations
- **Streaming**: Not needed (metadata only)
- **Error recovery**: Graceful failures on permission issues

## Security Considerations

### Credentials
- Environment variables (`.env`)
- Never committed to git (`.gitignore`)
- Dedicated IAM user (least privilege)

### File System
- Validate paths before operations
- Handle permission errors gracefully
- No arbitrary code execution

### SQL Injection
- Prepared statements everywhere
- No string concatenation in queries

## Testing Strategy

**Recommended approach**:

1. **Unit Tests**
   - Test individual services in isolation
   - Mock external dependencies (APIs, DB, filesystem)

2. **Integration Tests**
   - Test service interactions
   - Use test database

3. **End-to-End Tests**
   - Test full scan workflow
   - Use sample movie files

## Future Enhancements

**Potential additions following same architecture**:

1. **Duplicate Detection**
   - New service: `DuplicateDetectorService`
   - Strategy: Compare IMDB IDs

2. **Subtitle Download**
   - New service: `SubtitleService`
   - Integrate with OpenSubtitles API

3. **Quality Upgrade Detection**
   - New task: `QualityCheckTask`
   - Compare resolutions, suggest upgrades

4. **Web Dashboard**
   - Add React frontend
   - Use existing REST API

5. **Notification System**
   - New service: `NotificationService`
   - Strategy pattern for email/Slack/Discord

All follow same patterns - easy to extend!

## Conclusion

This architecture provides:
- ✅ Clear separation of concerns
- ✅ Easy testability
- ✅ High extensibility
- ✅ Professional code organization
- ✅ SOLID principles throughout
- ✅ Proven design patterns
- ✅ Maintainable codebase

**Result**: Enterprise-grade movie organization system that's simple to understand and extend.
