import fs from 'fs';
import { ITask } from '../types/task.types';
import { MediaOrganizerService } from '../services/media-organizer.service';
import { getConfig } from '../config/env.config';

export class MediaOrganizeTask implements ITask {
    name = 'MediaOrganizeTask';
    private organizerService: MediaOrganizerService;

    constructor() {
        this.organizerService = new MediaOrganizerService();
    }

    async execute(): Promise<void> {
        console.log(`\n[${new Date().toISOString()}] Starting ${this.name}...`);

        try {
            const folders = this.readMovieFolders();
            if (folders.length === 0) {
                console.log('No folders to organize. Check movies.txt file.');
                return;
            }

            let totalScanned = 0;
            let totalRenamed = 0;
            let totalNfoCreated = 0;
            let totalPostersDownloaded = 0;
            let totalErrors = 0;

            for (const folder of folders) {
                console.log(`\n${'='.repeat(60)}`);
                const result = await this.organizerService.organizeDirectory(folder);
                
                totalScanned += result.scanned;
                totalRenamed += result.renamed;
                totalNfoCreated += result.nfoCreated;
                totalPostersDownloaded += result.postersDownloaded;
                totalErrors += result.errors;
            }

            console.log('\n' + '='.repeat(60));
            console.log('=== Media Organize Results ===');
            console.log(`Scanned: ${totalScanned}`);
            console.log(`Renamed: ${totalRenamed}`);
            console.log(`NFO Created: ${totalNfoCreated}`);
            console.log(`Posters Downloaded: ${totalPostersDownloaded}`);
            console.log(`Errors: ${totalErrors}`);
            console.log('='.repeat(60) + '\n');
        } catch (error) {
            console.error(`Error executing ${this.name}:`, error);
            throw error;
        }
    }

    private readMovieFolders(): string[] {
        const moviesTxtPath = getConfig().moviesTxtPath;
        if (!fs.existsSync(moviesTxtPath)) {
            console.warn(`movies.txt not found at: ${moviesTxtPath}`);
            return [];
        }

        const content = fs.readFileSync(moviesTxtPath, 'utf-8');
        return content
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line && !line.startsWith('#'));
    }
}
