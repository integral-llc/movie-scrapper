import { ITask } from '../types/task.types';
import { MovieScannerTMDbService } from '../services/movie-scanner-tmdb.service';

export class MovieScanTask implements ITask {
  name = 'MovieScanTask';
  private scannerService: MovieScannerTMDbService;

  constructor() {
    this.scannerService = new MovieScannerTMDbService();
  }

  async execute(): Promise<void> {
    console.log(`\n[${new Date().toISOString()}] Starting ${this.name}...`);

    try {
      const result = await this.scannerService.scanMovies();

      console.log('\n=== Scan Results ===');
      console.log(`Scanned: ${result.scanned}`);
      console.log(`Created: ${result.created}`);
      console.log(`Updated: ${result.updated}`);
      console.log(`Deleted: ${result.deleted}`);
      console.log(`Errors: ${result.errors}`);
      console.log('===================\n');
    } catch (error) {
      console.error(`Error executing ${this.name}:`, error);
      throw error;
    }
  }
}
