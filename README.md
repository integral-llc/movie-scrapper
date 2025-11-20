# MovieScrapper

<div align="center">

![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)
![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)

**An intelligent movie file organizer with TMDb/OMDb integration, multi-language support, and Kodi compatibility**

[Features](#features) • [Installation](#installation) • [Usage](#usage) • [API](#api-reference) • [Contributing](#contributing) • [License](#license)

</div>

---

## Overview

MovieScrapper is an automated movie library management system that scans, identifies, organizes, and enriches your movie collection with metadata from TMDb and OMDb. It intelligently renames files, generates Kodi-compatible NFO files, downloads high-resolution posters with IMDB watermarks, and maintains a comprehensive SQLite database of your entire library.

### Why MovieScrapper?

- **Intelligent Parsing**: Advanced regex-based parser handles complex filenames with release groups, quality tags, and multi-language titles
- **Multi-Language Support**: Automatic language detection and translation for Russian, Romanian, and other languages via AWS Translate
- **Kodi Integration**: Generates NFO metadata files and 4K posters with IMDB rating badges
- **Database Tracking**: SQLite database tracks all changes, allowing you to monitor your library's evolution
- **Smart Handling**: Special logic for TV episodes, audio files, BDRip folders, and movie collections
- **REST API**: Full-featured API for integration with other tools and automation workflows
- **Scheduled Scans**: Automatic periodic scanning with configurable cron schedules

---

## Table of Contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Architecture](#architecture)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [API Reference](#api-reference)
- [File Naming Convention](#file-naming-convention)
- [Kodi Integration](#kodi-integration)
- [Project Structure](#project-structure)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)
- [Acknowledgments](#acknowledgments)

---

## Features

### Core Functionality

- 🎬 **Recursive Movie Scanning**: Scans directories recursively with support for all major video formats (MKV, MP4, AVI, MOV, etc.)
- 🔍 **TMDb & OMDb Integration**: Fetches accurate movie metadata including title, year, rating, plot, genre, cast, and more
- 🌍 **Multi-Language Support**:
  - Automatic language detection (Russian, Romanian, English, etc.)
  - AWS Translate integration for non-English titles
  - Preserves Cyrillic and Romanian characters in filenames
- 📝 **Smart File Renaming**: Standardized format: `Movie Title (Year) (IMDB Rating).ext`
- 🎨 **Poster Management**:
  - Downloads 4K posters from TMDb
  - Adds custom IMDB rating watermark badges
  - Automatic cleanup of outdated posters
- 📀 **Advanced Parsing**:
  - Release group detection and removal (e.g., YIFY, RARBG, i Ton)
  - Quality tag removal (720p, 1080p, BluRay, WEB-DL, etc.)
  - Codec detection (x264, x265, HEVC, etc.)
  - TV episode detection and skipping
  - Audio file detection and skipping
  - BDRip folder structure support

### Integration & Automation

- 🗄️ **SQLite Database**: Tracks library state, changes, and metadata history
- ⏰ **Scheduled Scanning**: Configurable cron-based automatic scans (default: every 12 hours)
- 🌐 **REST API**: Complete API for manual triggers, queries, and integration
- 🔧 **Extensible Task System**: Easy-to-extend architecture for custom tasks
- 🛡️ **Error Recovery**: Graceful error handling with detailed logging and error tracking

### Kodi Compatibility

- 📺 **NFO File Generation**: Creates Kodi-compatible XML metadata files
- 🖼️ **Poster Artwork**: Downloads and processes posters with IMDB watermarks
- 🔄 **Automatic Updates**: Regenerates metadata when movie data changes

---

## Screenshots

### File Organization

**Before:**
```
Дружба и никакого секса.720p.i.Ton.mkv
The.Matrix.1999.1080p.BluRay.x264-YIFY.mkv
gone_girl_2014_brrip.avi
```

**After:**
```
What If (2013) (IMDB 6.7).mkv
What If (2013) (IMDB 6.7).nfo
What If (2013) (IMDB 6.7)-poster.jpg

The Matrix (1999) (IMDB 8.7).mkv
The Matrix (1999) (IMDB 8.7).nfo
The Matrix (1999) (IMDB 8.7)-poster.jpg

Gone Girl (2014) (IMDB 8.1).avi
Gone Girl (2014) (IMDB 8.1).nfo
Gone Girl (2014) (IMDB 8.1)-poster.jpg
```

---

## Architecture

Built with **SOLID principles** and **Gang of Four design patterns**:

- **Repository Pattern**: Clean data access abstraction (`MovieRepository`)
- **Service Layer**: Business logic separation (`MovieScannerService`, `TMDbService`, `TranslateService`)
- **Strategy Pattern**: Flexible file/folder parsing strategies
- **Singleton Pattern**: Database connection management
- **Dependency Injection**: Loose coupling throughout the codebase
- **Factory Pattern**: Service instantiation and configuration

### Tech Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript 5.9
- **Framework**: Express.js 5
- **Database**: SQLite3 (better-sqlite3)
- **Image Processing**: Sharp
- **External APIs**: TMDb, OMDb, AWS Translate
- **Scheduling**: node-cron
- **Testing**: Jest

---

## Installation

### Prerequisites

- **Node.js**: Version 18 or higher ([Download](https://nodejs.org/))
- **TMDb API Key**: Free tier available ([Register](https://www.themoviedb.org/settings/api))
- **OMDb API Key**: Free tier (1,000 requests/day) ([Register](http://www.omdbapi.com/apikey.aspx))
- **AWS Account**: For Translate service (optional, only needed for non-English titles)

### Quick Start

1. **Clone the repository**

```bash
git clone https://github.com/yourusername/MovieScrapper.git
cd MovieScrapper
```

2. **Install dependencies**

```bash
npm install
```

3. **Configure environment**

```bash
cp .env.example .env
```

Edit `.env` with your API keys (see [Configuration](#configuration) below)

4. **Create movies.txt**

```bash
echo "/path/to/your/movies" > movies.txt
```

5. **Build and run**

```bash
npm run build
npm start
```

Or for development:

```bash
npm run dev
```

---

## Configuration

### Environment Variables

Create a `.env` file in the project root:

```env
# Server Configuration
PORT=9988

# TMDb API (https://www.themoviedb.org/settings/api)
TMDB_API_KEY=your_tmdb_api_key_here
TMDB_BASE_URL=https://api.themoviedb.org/3

# OMDb API (http://www.omdbapi.com/apikey.aspx)
OMDB_API_KEY=your_omdb_api_key_here

# AWS Translate (optional - only for non-English title translation)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key

# Database
DATABASE_PATH=./movies.db

# Movies folder list
MOVIES_TXT_PATH=./movies.txt

# Cron Schedule (default: every 12 hours)
# Format: "minute hour day month weekday"
# Examples:
#   0 */12 * * *  = Every 12 hours
#   0 0 * * *     = Daily at midnight
#   0 */6 * * *   = Every 6 hours
SCAN_CRON_SCHEDULE=0 */12 * * *
```

### AWS Translate Setup (Optional)

**Only needed if you have non-English movie titles that need translation.**

Create a dedicated IAM user with minimal permissions:

```bash
# Create IAM user
aws iam create-user --user-name movie-scrapper-translate

# Attach translate policy
aws iam attach-user-policy \
  --user-name movie-scrapper-translate \
  --policy-arn arn:aws:iam::aws:policy/TranslateReadOnly

# Create access key
aws iam create-access-key --user-name movie-scrapper-translate
```

### Movies Configuration

Create `movies.txt` in the project root with one folder path per line:

```txt
# Primary movie collection
/mnt/media/movies

# 4K movies
/mnt/media/movies-4k

# Foreign films
/mnt/media/international

# Comments are supported (lines starting with #)
```

---

## Usage

### Development Mode

Run with hot-reloading for development:

```bash
npm run dev
```

### Production Mode

1. **Build the project**

```bash
npm run build
```

2. **Start the service**

```bash
npm start
```

### Running as a System Service

#### Linux (systemd)

Create `/etc/systemd/system/movie-scrapper.service`:

```ini
[Unit]
Description=MovieScrapper Service
After=network.target

[Service]
Type=simple
User=yourusername
WorkingDirectory=/path/to/MovieScrapper
ExecStart=/usr/bin/node dist/index.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable movie-scrapper
sudo systemctl start movie-scrapper
sudo systemctl status movie-scrapper
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test suite
npm run test:international
```

---

## API Reference

The REST API runs on port `9988` by default (configurable via `PORT` in `.env`).

### Endpoints

#### `GET /`

API information and available endpoints.

**Response:**
```json
{
  "name": "MovieScrapper API",
  "version": "1.0.0",
  "endpoints": [...]
}
```

#### `GET /movies`

Retrieve all movies from the database.

**Query Parameters:**
- `status` (optional): Filter by status (`active`, `deleted`, `error`)

**Example:**
```bash
curl http://localhost:9988/movies?status=active
```

**Response:**
```json
[
  {
    "id": 1,
    "title": "The Matrix",
    "year": 1999,
    "imdbRating": 8.7,
    "imdbId": "tt0133093",
    "currentPath": "/movies/The Matrix (1999) (IMDB 8.7).mkv",
    "status": "active"
  }
]
```

#### `GET /movies/:id`

Get a specific movie by database ID.

**Example:**
```bash
curl http://localhost:9988/movies/1
```

#### `GET /movies/stats`

Get library statistics.

**Response:**
```json
{
  "active": 88,
  "deleted": 247,
  "error": 6,
  "total": 341
}
```

#### `POST /scan`

Trigger a manual movie scan.

**Example:**
```bash
curl -X POST http://localhost:9988/scan
```

**Response:**
```json
{
  "message": "Scan completed",
  "result": {
    "scanned": 95,
    "updated": 85,
    "created": 3,
    "deleted": 5,
    "errors": 2
  }
}
```

#### `GET /tasks`

Get list of registered scheduled tasks.

**Response:**
```json
[
  {
    "name": "MovieScanTask",
    "schedule": "0 */12 * * *",
    "description": "Scans movie directories every 12 hours"
  }
]
```

#### `GET /health`

Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "uptime": 86400,
  "database": "connected"
}
```

---

## File Naming Convention

MovieScrapper uses a standardized naming format:

```
Movie Title (Year) (IMDB Rating).extension
```

### Examples

| Original Filename | Renamed To |
|-------------------|------------|
| `The.Matrix.1999.1080p.BluRay.x264-YIFY.mkv` | `The Matrix (1999) (IMDB 8.7).mkv` |
| `gone_girl_2014_brrip.avi` | `Gone Girl (2014) (IMDB 8.1).avi` |
| `Брат.1997.720p.mkv` | `Брат (1997) (IMDB 8.3).mkv` |
| `Nobody.2.2025.1080p.BluRay.x264-playHD_EniaHD.mkv` | `Nobody 2 (2025) (IMDB 7.5).mkv` |

### Supported Extensions

**Video Files**: `.mkv`, `.mp4`, `.avi`, `.mov`, `.wmv`, `.flv`, `.webm`, `.m4v`, `.mpg`, `.mpeg`, `.m2v`, `.3gp`, `.ogv`

**Excluded**: TV episodes (S01E02 format), audio files, subtitle files, metadata files

---

## Kodi Integration

For each movie, MovieScrapper generates:

### 1. NFO Metadata File

**Filename**: `Movie Title (Year) (IMDB X.X).nfo`

**Format**: XML (Kodi-compatible)

**Contents:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<movie>
  <title>The Matrix</title>
  <year>1999</year>
  <rating>8.7</rating>
  <plot>A computer hacker learns...</plot>
  <genre>Action, Sci-Fi</genre>
  <director>Lana Wachowski, Lilly Wachowski</director>
  <country>United States</country>
  <language>English</language>
  <imdbid>tt0133093</imdbid>
</movie>
```

### 2. Poster Image

**Filename**: `Movie Title (Year) (IMDB X.X)-poster.jpg`

**Features:**
- High-resolution 4K poster from TMDb
- Custom IMDB rating watermark badge
- Automatic cleanup of outdated posters when ratings change

### 3. Automatic Recognition

Kodi will automatically detect and use these files when you:
1. Add the movie directory as a source
2. Set content type to "Movies"
3. Choose any scraper (MovieScrapper has already done the work!)

---

## Project Structure

```
MovieScrapper/
├── src/
│   ├── config/              # Configuration files
│   │   ├── constants.ts     # Regex patterns, file extensions
│   │   └── env.config.ts    # Environment variable loading
│   ├── controllers/         # Express route handlers
│   │   └── movie.controller.ts
│   ├── models/              # Database models
│   │   └── database.ts      # SQLite connection (Singleton)
│   ├── repositories/        # Data access layer
│   │   └── movie.repository.ts
│   ├── services/            # Business logic
│   │   ├── movie-scanner-tmdb.service.ts  # Main orchestration
│   │   ├── tmdb.service.ts                # TMDb API integration
│   │   ├── omdb.service.ts                # OMDb API integration
│   │   ├── translate.service.ts           # AWS Translate
│   │   ├── file-renamer.service.ts        # File operations
│   │   ├── kodi.service.ts                # NFO generation
│   │   └── poster.service.ts              # Poster download/watermark
│   ├── tasks/               # Scheduled tasks
│   │   ├── movie-scan.task.ts
│   │   └── task-runner.ts
│   ├── types/               # TypeScript interfaces
│   │   ├── movie.types.ts
│   │   └── task.types.ts
│   ├── utils/               # Utility classes
│   │   ├── file-scanner.util.ts         # Directory scanning
│   │   └── movie-name-parser.util.ts    # Filename parsing
│   ├── tests/               # Jest tests
│   │   └── movie-name-parser.test.ts
│   └── index.ts             # Application entry point
├── dist/                    # Compiled JavaScript (generated)
├── .env                     # Environment configuration
├── .env.example             # Environment template
├── movies.txt               # Movie directory list
├── movies.db                # SQLite database (generated)
├── package.json
├── tsconfig.json
├── jest.config.js
└── README.md
```

---

## Development

### Adding New Tasks

MovieScrapper uses an extensible task system. To create a custom task:

1. **Create task file** in `src/tasks/`:

```typescript
// src/tasks/my-custom.task.ts
import { ITask } from '../types/task.types';

export class MyCustomTask implements ITask {
  name = 'MyCustomTask';
  description = 'Does something useful';

  async execute(): Promise<void> {
    console.log('Running custom task...');
    // Your logic here
  }
}
```

2. **Register in** `src/index.ts`:

```typescript
import { MyCustomTask } from './tasks/my-custom.task';

// Register task
taskRunner.registerTask(new MyCustomTask());

// Schedule task (optional)
scheduler.scheduleTask('MyCustomTask', '0 0 * * *'); // Daily at midnight
```

### Extending Functionality

#### Adding New File Patterns

Edit `src/config/constants.ts`:

```typescript
export const MOVIE_NAME_PATTERNS = {
  // Add new pattern
  MY_PATTERN: /\b(pattern_here)\b/gi,
  // ...existing patterns
};
```

#### Supporting New Languages

Edit `src/services/movie-scanner-tmdb.service.ts`:

```typescript
// Add language detection
if (this.shouldUseMyLanguage(mainCountry)) {
  finalTitle = await this.translateService.translateToMyLanguage(movieData.title);
}

// Add country list
private shouldUseMyLanguage(country: string): boolean {
  const MY_COUNTRIES = ['Country1', 'Country2'];
  return MY_COUNTRIES.some(c => country.toLowerCase().includes(c.toLowerCase()));
}
```

### Code Style

- **TypeScript**: Strict mode enabled
- **Naming**: PascalCase for classes, camelCase for methods/variables
- **Patterns**: Follow SOLID principles and existing design patterns
- **Testing**: Write unit tests for new utilities and parsers
- **Documentation**: Add JSDoc comments for public methods

---

## Troubleshooting

### Common Issues

#### "Environment variable TMDB_API_KEY is required"

**Solution**: Create `.env` file with valid TMDb API key. Copy from `.env.example` and fill in your keys.

#### "Error searching movie in TMDb"

**Possible causes:**
- Invalid API key
- Rate limit exceeded (check TMDb API limits)
- Network connectivity issues

**Solution**: Verify API key in TMDb dashboard, check request quotas.

#### "Translation error" / AWS Translate failures

**Possible causes:**
- Invalid AWS credentials
- Missing IAM permissions
- Incorrect region configuration

**Solution**:
1. Verify AWS credentials: `aws sts get-caller-identity`
2. Check IAM user has `translate:TranslateText` permission
3. Verify `AWS_REGION` in `.env`

#### Movies not being found

**Possible causes:**
- Incorrect paths in `movies.txt`
- Permission issues
- Malformed filenames

**Solution**:
1. Check `movies.txt` paths are absolute and accessible
2. Verify read permissions: `ls -la /path/to/movies`
3. Check logs for specific errors

#### Files not being renamed

**Possible causes:**
- Write permission denied
- File in use by another process
- Filesystem restrictions

**Solution**:
1. Verify write permissions: `ls -ld /path/to/movies`
2. Check if files are open in media players
3. Review database `error` status movies for details

#### Database locked errors

**Possible causes:**
- Multiple instances running
- Database corruption
- Filesystem issues

**Solution**:
1. Ensure only one instance is running
2. Check database integrity: `sqlite3 movies.db "PRAGMA integrity_check;"`
3. Backup and recreate if corrupted

### Debug Mode

Enable verbose logging:

```bash
NODE_ENV=development npm run dev
```

Check logs for detailed error information:

```bash
# Linux systemd
sudo journalctl -u movie-scrapper -f

# Manual run
tail -f /path/to/logfile
```

---

## Contributing

Contributions are welcome! MovieScrapper is open-source software licensed under GPLv3.

### How to Contribute

1. **Fork the repository**

```bash
git clone https://github.com/yourusername/MovieScrapper.git
cd MovieScrapper
git checkout -b feature/my-new-feature
```

2. **Make your changes**

- Follow existing code style and patterns
- Add unit tests for new functionality
- Update documentation as needed

3. **Test your changes**

```bash
npm run test
npm run build
```

4. **Submit a Pull Request**

- Describe your changes clearly
- Reference any related issues
- Ensure all tests pass

### Development Guidelines

- **Code Quality**: Follow TypeScript best practices and SOLID principles
- **Testing**: Maintain or improve test coverage (run `npm test`)
- **Documentation**: Update README.md for user-facing changes
- **Commits**: Use clear, descriptive commit messages
- **Dependencies**: Avoid adding unnecessary dependencies

### Reporting Issues

When reporting bugs, please include:

- MovieScrapper version
- Node.js version (`node --version`)
- Operating system
- Error messages and logs
- Steps to reproduce

### Feature Requests

Open an issue with:

- Clear description of the feature
- Use case and benefits
- Proposed implementation (optional)

---

## License

This project is licensed under the **GNU General Public License v3.0**.

### What this means:

- ✅ **Freedom to use**: You can use this software for any purpose
- ✅ **Freedom to study**: You can examine and modify the source code
- ✅ **Freedom to share**: You can distribute copies of the software
- ✅ **Freedom to improve**: You can distribute modified versions

### Requirements:

- 📝 **Disclose source**: Modified versions must also be open-source under GPLv3
- 📝 **License notice**: Include original license and copyright notice
- 📝 **State changes**: Document modifications made to the original code
- 📝 **Same license**: Derivative works must use GPLv3

See the [LICENSE](LICENSE) file for full details.

### Third-Party Licenses

This software uses the following open-source packages:

- **Express.js** - MIT License
- **TypeScript** - Apache License 2.0
- **better-sqlite3** - MIT License
- **Sharp** - Apache License 2.0
- **Axios** - MIT License
- **node-cron** - ISC License

API services:
- **TMDb API** - [Terms of Use](https://www.themoviedb.org/terms-of-use)
- **OMDb API** - CC BY-NC 4.0
- **AWS Translate** - [AWS Service Terms](https://aws.amazon.com/service-terms/)

---

## Acknowledgments

### Built With

- [Node.js](https://nodejs.org/) - JavaScript runtime
- [TypeScript](https://www.typescriptlang.org/) - Typed JavaScript
- [Express.js](https://expressjs.com/) - Web framework
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) - SQLite database
- [Sharp](https://sharp.pixelplumbing.com/) - Image processing
- [TMDb](https://www.themoviedb.org/) - Movie metadata API
- [OMDb](http://www.omdbapi.com/) - Additional movie data
- [AWS Translate](https://aws.amazon.com/translate/) - Translation service

### Inspiration

MovieScrapper was created to solve the problem of managing large, disorganized movie collections with inconsistent naming conventions, missing metadata, and multiple languages.

---

## Support

### Documentation

- [Installation Guide](#installation)
- [API Reference](#api-reference)
- [Troubleshooting](#troubleshooting)

### Community

- **Issues**: [GitHub Issues](https://github.com/yourusername/MovieScrapper/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/MovieScrapper/discussions)

### Contact

For questions or support:
- Open an issue on GitHub
- Check existing issues for solutions
- Review logs and database for error details

---

<div align="center">

**⭐ Star this repository if you find it useful! ⭐**

Made with ❤️ for movie enthusiasts and home media server operators

[Report Bug](https://github.com/yourusername/MovieScrapper/issues) · [Request Feature](https://github.com/yourusername/MovieScrapper/issues) · [Contribute](#contributing)

</div>
