export interface Movie {
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
  language: string;
  plot?: string;
  genre?: string;
  director?: string;
  actors?: string;
  posterUrl?: string;
  isFolder: boolean;
  lastScanned: string;
  status: 'active' | 'deleted' | 'error';
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IMDBMovieData {
  Title: string;
  Year: string;
  imdbRating: string;
  imdbID: string;
  Country: string;
  Language: string;
  Plot: string;
  Genre: string;
  Director: string;
  Actors: string;
  Poster: string;
  Response: string;
  Error?: string;
}

export interface MovieFileInfo {
  fullPath: string;
  directory: string;
  fileName: string;
  extension: string;
  isFolder: boolean;
}

export interface ScanResult {
  scanned: number;
  updated: number;
  created: number;
  deleted: number;
  errors: number;
}
