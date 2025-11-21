import Database from 'better-sqlite3';
import { getConfig } from '../config/env.config';
import fs from 'fs';
import path from 'path';

export class DatabaseConnection {
  private static instance: Database.Database;

  private constructor() {}

  public static getInstance(): Database.Database {
    if (!DatabaseConnection.instance) {
      const config = getConfig();
      const dbDir = path.dirname(config.databasePath);

      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      DatabaseConnection.instance = new Database(config.databasePath);
      DatabaseConnection.instance.pragma('journal_mode = WAL');
      DatabaseConnection.initializeTables();
    }

    return DatabaseConnection.instance;
  }

  private static initializeTables(): void {
    const db = DatabaseConnection.instance;

    db.exec(`
      CREATE TABLE IF NOT EXISTS movies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        original_path TEXT NOT NULL,
        current_path TEXT NOT NULL,
        file_name TEXT NOT NULL,
        original_file_name TEXT NOT NULL,
        title TEXT NOT NULL,
        year INTEGER NOT NULL,
        imdb_rating REAL NOT NULL,
        imdb_id TEXT NOT NULL,
        country TEXT,
        language TEXT,
        plot TEXT,
        genre TEXT,
        director TEXT,
        actors TEXT,
        poster_url TEXT,
        is_folder INTEGER NOT NULL DEFAULT 0,
        last_scanned TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(current_path)
      );

      CREATE INDEX IF NOT EXISTS idx_movies_status ON movies(status);
      CREATE INDEX IF NOT EXISTS idx_movies_imdb_id ON movies(imdb_id);
      CREATE INDEX IF NOT EXISTS idx_movies_current_path ON movies(current_path);
    `);
  }

  public static close(): void {
    if (DatabaseConnection.instance) {
      DatabaseConnection.instance.close();
    }
  }
}
