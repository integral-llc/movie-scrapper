import fs from 'fs';
import path from 'path';

export class FileRenamerService {
  /**
   * Clean up old metadata files (NFO, poster) when a movie is being renamed
   * This handles cases where IMDB rating changes slightly (e.g., 6.1 → 6.2)
   */
  cleanupOldMetadataFiles(directory: string, movieTitle: string, excludeRating?: number): number {
    let cleaned = 0;

    try {
      const files = fs.readdirSync(directory);

      // Escape special regex characters in title
      const escapedTitle = movieTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // Pattern to match: "Title (Year) (IMDB X.X)-poster.jpg" or "Title (Year) (IMDB X.X).nfo"
      // Also matches without year: "Title (IMDB X.X)-poster.jpg"
      const metadataPattern = new RegExp(
        `^${escapedTitle}\\s*\\((?:\\d{4}\\)\\s*)?\\(IMDB\\s+(\\d+\\.\\d)\\)(?:-poster\\.jpg|\\.nfo)$`,
        'i'
      );

      for (const file of files) {
        const match = file.match(metadataPattern);
        if (match) {
          const fileRating = parseFloat(match[1]);

          // Don't delete if it matches the current rating we're about to create
          if (excludeRating !== undefined && Math.abs(fileRating - excludeRating) < 0.01) {
            continue;
          }

          const filePath = path.join(directory, file);
          try {
            fs.unlinkSync(filePath);
            console.log(`  Cleaned up old metadata: ${file}`);
            cleaned++;
          } catch (err) {
            console.error(`  Failed to delete old metadata: ${file}`, err);
          }
        }
      }
    } catch (err) {
      console.error(`Failed to scan directory for old metadata: ${directory}`, err);
    }

    return cleaned;
  }

  renameFile(oldPath: string, newFileName: string): { success: boolean; newPath?: string; error?: string } {
    try {
      const directory = path.dirname(oldPath);
      const newPath = path.join(directory, newFileName);

      if (fs.existsSync(newPath)) {
        return {
          success: false,
          error: `File already exists: ${newPath}`,
        };
      }

      fs.renameSync(oldPath, newPath);

      return {
        success: true,
        newPath,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to rename file: ${oldPath}`, errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  fileExists(filePath: string): boolean {
    return fs.existsSync(filePath);
  }

  getFileStats(filePath: string): fs.Stats | null {
    try {
      return fs.statSync(filePath);
    } catch {
      return null;
    }
  }

  /**
   * Scan a directory and clean up all duplicate metadata files
   * Keeps only the highest-rated version for each movie
   */
  cleanupAllDuplicateMetadata(directory: string): { cleaned: number; kept: number } {
    let cleaned = 0;
    let kept = 0;

    try {
      const files = fs.readdirSync(directory);

      // Group metadata files by movie title
      // Pattern: "Title (Year) (IMDB X.X)-poster.jpg" or "Title (Year) (IMDB X.X).nfo"
      const metadataPattern = /^(.+?)\s*\((\d{4})\)\s*\(IMDB\s+(\d+\.\d)\)((?:-poster\.jpg|\.nfo))$/i;

      const movieMetadata: Map<string, Array<{ file: string; rating: number; type: string }>> = new Map();

      for (const file of files) {
        const match = file.match(metadataPattern);
        if (match) {
          const [, title, year, ratingStr, suffix] = match;
          const key = `${title} (${year})`;
          const rating = parseFloat(ratingStr);
          const type = suffix.includes('poster') ? 'poster' : 'nfo';

          if (!movieMetadata.has(key)) {
            movieMetadata.set(key, []);
          }
          movieMetadata.get(key)!.push({ file, rating, type });
        }
      }

      // For each movie, keep only the highest-rated metadata files
      for (const [movieKey, metaFiles] of movieMetadata) {
        // Separate by type
        const posters = metaFiles.filter(m => m.type === 'poster');
        const nfos = metaFiles.filter(m => m.type === 'nfo');

        // Clean up duplicate posters (keep highest rating)
        if (posters.length > 1) {
          posters.sort((a, b) => b.rating - a.rating);
          for (let i = 1; i < posters.length; i++) {
            const filePath = path.join(directory, posters[i].file);
            try {
              fs.unlinkSync(filePath);
              console.log(`Removed duplicate poster: ${posters[i].file}`);
              cleaned++;
            } catch (err) {
              console.error(`Failed to delete: ${posters[i].file}`, err);
            }
          }
          kept++;
        } else if (posters.length === 1) {
          kept++;
        }

        // Clean up duplicate NFOs (keep highest rating)
        if (nfos.length > 1) {
          nfos.sort((a, b) => b.rating - a.rating);
          for (let i = 1; i < nfos.length; i++) {
            const filePath = path.join(directory, nfos[i].file);
            try {
              fs.unlinkSync(filePath);
              console.log(`Removed duplicate NFO: ${nfos[i].file}`);
              cleaned++;
            } catch (err) {
              console.error(`Failed to delete: ${nfos[i].file}`, err);
            }
          }
          kept++;
        } else if (nfos.length === 1) {
          kept++;
        }
      }
    } catch (err) {
      console.error(`Failed to scan directory: ${directory}`, err);
    }

    return { cleaned, kept };
  }
}
