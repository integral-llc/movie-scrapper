import Database from 'better-sqlite3';
import { Movie } from '../types/movie.types';
import { DatabaseConnection } from '../models/database';

export class MovieRepository {
  private db: Database.Database;

  constructor() {
    this.db = DatabaseConnection.getInstance();
  }

  create(movie: Omit<Movie, 'id'>): Movie {
    const stmt = this.db.prepare(`
      INSERT INTO movies (
        original_path, current_path, file_name, original_file_name,
        title, year, imdb_rating, imdb_id, country, language,
        plot, genre, director, actors, poster_url, is_folder,
        last_scanned, status, error_message, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      movie.originalPath,
      movie.currentPath,
      movie.fileName,
      movie.originalFileName,
      movie.title,
      movie.year,
      movie.imdbRating,
      movie.imdbId,
      movie.country ?? null,
      movie.language ?? null,
      movie.plot ?? null,
      movie.genre ?? null,
      movie.director ?? null,
      movie.actors ?? null,
      movie.posterUrl ?? null,
      movie.isFolder ? 1 : 0,
      movie.lastScanned,
      movie.status,
      movie.errorMessage ?? null,
      movie.createdAt,
      movie.updatedAt
    );

    return { ...movie, id: result.lastInsertRowid as number };
  }

  update(id: number, movie: Partial<Movie>): void {
    const fields: string[] = [];
    const values: any[] = [];

    Object.entries(movie).forEach(([key, value]) => {
      if (key !== 'id') {
        const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
        fields.push(`${snakeKey} = ?`);
        // Convert undefined to null and booleans to 0/1 for SQLite
        if (value === undefined) {
          values.push(null);
        } else if (typeof value === 'boolean') {
          values.push(value ? 1 : 0);
        } else {
          values.push(value);
        }
      }
    });

    if (fields.length === 0) return;

    values.push(id);
    const stmt = this.db.prepare(`UPDATE movies SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
  }

  findByPath(path: string): Movie | undefined {
    const stmt = this.db.prepare('SELECT * FROM movies WHERE current_path = ?');
    const row = stmt.get(path) as any;
    return row ? this.mapRowToMovie(row) : undefined;
  }

  findById(id: number): Movie | undefined {
    const stmt = this.db.prepare('SELECT * FROM movies WHERE id = ?');
    const row = stmt.get(id) as any;
    return row ? this.mapRowToMovie(row) : undefined;
  }

  findAll(status?: 'active' | 'deleted' | 'error'): Movie[] {
    let query = 'SELECT * FROM movies';
    if (status) {
      query += ' WHERE status = ?';
    }
    query += ' ORDER BY created_at DESC';

    const stmt = this.db.prepare(query);
    const rows = status ? stmt.all(status) : stmt.all();
    return (rows as any[]).map((row) => this.mapRowToMovie(row));
  }

  markAsDeleted(path: string): void {
    const stmt = this.db.prepare('UPDATE movies SET status = ?, updated_at = ? WHERE current_path = ?');
    stmt.run('deleted', new Date().toISOString(), path);
  }

  delete(id: number): void {
    const stmt = this.db.prepare('DELETE FROM movies WHERE id = ?');
    stmt.run(id);
  }

  deleteByPath(path: string): void {
    const stmt = this.db.prepare('DELETE FROM movies WHERE current_path = ?');
    stmt.run(path);
  }

  getAllActivePaths(): string[] {
    const stmt = this.db.prepare("SELECT current_path FROM movies WHERE status = 'active'");
    const rows = stmt.all() as any[];
    return rows.map((row) => row.current_path);
  }

  private mapRowToMovie(row: any): Movie {
    return {
      id: row.id,
      originalPath: row.original_path,
      currentPath: row.current_path,
      fileName: row.file_name,
      originalFileName: row.original_file_name,
      title: row.title,
      year: row.year,
      imdbRating: row.imdb_rating,
      imdbId: row.imdb_id,
      country: row.country,
      language: row.language,
      plot: row.plot,
      genre: row.genre,
      director: row.director,
      actors: row.actors,
      posterUrl: row.poster_url,
      isFolder: Boolean(row.is_folder),
      lastScanned: row.last_scanned,
      status: row.status,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
