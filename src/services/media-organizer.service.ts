import fs from 'fs';
import path from 'path';
import { FileScanner, File, Folder, ItemType, FileScannerItem, ItemMetadata } from '../utils/file-scanner';
import { KodiService } from './kodi.service';
import { PosterService } from './poster.service';
import { FileRenamerService } from './file-renamer.service';
import { Movie } from '../types/movie.types';
import { MOVIE_EXTENSIONS, BDRIP_INDICATORS } from '../config/constants';

export interface OrganizeResult {
    scanned: number;
    renamed: number;
    nfoCreated: number;
    postersDownloaded: number;
    errors: number;
}

/**
 * MediaOrganizerService integrates FileScanner with file operations:
 * - Scans directories and builds folder structure
 * - Parses with FileScanner to get proper names and metadata
 * - Renames files/folders
 * - Generates NFO files for Kodi
 * - Downloads and watermarks posters
 */
export class MediaOrganizerService {
    private fileScanner: FileScanner;
    private kodiService: KodiService;
    private posterService: PosterService;
    private fileRenamer: FileRenamerService;

    constructor() {
        this.fileScanner = new FileScanner();
        this.kodiService = new KodiService();
        this.posterService = new PosterService();
        this.fileRenamer = new FileRenamerService();
    }

    /**
     * Scan and organize a directory
     */
    async organizeDirectory(directoryPath: string): Promise<OrganizeResult> {
        const result: OrganizeResult = {
            scanned: 0,
            renamed: 0,
            nfoCreated: 0,
            postersDownloaded: 0,
            errors: 0,
        };

        console.log(`\n📁 Scanning directory: ${directoryPath}`);

        // Build folder structure from disk
        const rootFolder = this.buildFolderStructure(directoryPath);
        if (!rootFolder) {
            console.error(`Failed to scan directory: ${directoryPath}`);
            return result;
        }

        // Parse with FileScanner to get proper names and metadata
        console.log(`\n🔍 Analyzing files and folders...`);
        await this.fileScanner.parse(rootFolder);

        // Process the parsed results
        console.log(`\n📝 Processing results...`);
        await this.processFolder(rootFolder, result);

        return result;
    }

    /**
     * Build a Folder structure from disk
     */
    private buildFolderStructure(directoryPath: string, depth: number = 0): Folder | null {
        if (!fs.existsSync(directoryPath)) {
            console.error(`Directory does not exist: ${directoryPath}`);
            return null;
        }

        // Limit recursion depth
        if (depth > 5) {
            return null;
        }

        const folderName = path.basename(directoryPath);
        const files: File[] = [];
        const folders: Folder[] = [];

        try {
            const entries = fs.readdirSync(directoryPath, { withFileTypes: true });
            const entryNames = entries.map(e => e.name.toLowerCase());
            
            // CHECK FIRST: Is this a BD-Rip or DVD-Rip folder?
            // If it contains BDMV, VIDEO_TS, etc. - it's a rip folder, DON'T recurse!
            const isRipFolder = entryNames.some(name => BDRIP_INDICATORS.includes(name));
            
            if (isRipFolder) {
                // This is a rip folder - just add the indicator as a file marker, no recursion
                console.log(`  💿 Rip folder detected: ${folderName}`);
                for (const entry of entries) {
                    if (entry.isDirectory() && BDRIP_INDICATORS.includes(entry.name.toLowerCase())) {
                        files.push(new File(entry.name, path.join(directoryPath, entry.name)));
                        break; // Only need one indicator
                    }
                }
                return new Folder(folderName, files, undefined, directoryPath);
            }

            // Not a rip folder - scan normally
            for (const entry of entries) {
                const fullPath = path.join(directoryPath, entry.name);

                if (entry.isDirectory()) {
                    // Recursively build subfolder
                    const subFolder = this.buildFolderStructure(fullPath, depth + 1);
                    if (subFolder) {
                        folders.push(subFolder);
                    }
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase();
                    // Include video files and other relevant files
                    if (MOVIE_EXTENSIONS.includes(ext) || this.isRelevantFile(entry.name)) {
                        files.push(new File(entry.name, fullPath));
                    }
                }
            }
        } catch (error) {
            console.error(`Error scanning ${directoryPath}:`, error);
            return null;
        }

        // Only return folder if it has content
        if (files.length === 0 && folders.length === 0) {
            return null;
        }

        console.log(`  📂 Found: ${folderName} (${files.length} files, ${folders.length} subfolders)`);

        return new Folder(
            folderName,
            files.length > 0 ? files : undefined,
            folders.length > 0 ? folders : undefined,
            directoryPath
        );
    }

    /**
     * Check if a file is relevant (subtitle, audio, etc.)
     */
    private isRelevantFile(fileName: string): boolean {
        const ext = path.extname(fileName).toLowerCase();
        const relevantExtensions = ['.srt', '.sub', '.idx', '.ass', '.ssa', '.vtt', '.ac3', '.dts', '.mka'];
        return relevantExtensions.includes(ext);
    }

    /**
     * Process a parsed folder and its contents
     */
    private async processFolder(folder: Folder, result: OrganizeResult): Promise<void> {
        const parsedItem = folder.getParsedItem();
        
        // Process files in this folder
        if (folder.files) {
            for (const file of folder.files) {
                await this.processFile(file, folder.originalPath!, result);
            }
        }

        // Process subfolders
        if (folder.folders) {
            for (const subFolder of folder.folders) {
                await this.processFolder(subFolder, result);
            }
        }

        // Handle folder rename and metadata (for BD-Rip, TV series, etc.)
        if (parsedItem && folder.originalPath) {
            // Always process TV series folders (need rename + metadata)
            // For other folders, only process if name changed
            const needsProcessing = 
                parsedItem.itemType === ItemType.TVShowSeriesRootFolder ||
                parsedItem.itemType === ItemType.BDRipRootFolder ||
                parsedItem.itemType === ItemType.DVDRipRootFolder ||
                parsedItem.name !== folder.name;
            
            if (needsProcessing) {
                await this.processFolderRename(folder, parsedItem, result);
            }
        }
    }

    /**
     * Process a single file - rename, create NFO, download poster
     */
    private async processFile(file: File, directory: string, result: OrganizeResult): Promise<void> {
        result.scanned++;
        const parsedItem = file.getParsedItem();
        
        if (!parsedItem) {
            return;
        }

        // Skip subtitle files - no processing needed
        if (parsedItem.itemType === ItemType.SubtitleFile) {
            return;
        }

        // Skip already processed files
        if (parsedItem.itemType === ItemType.Other) {
            return;
        }

        const originalPath = file.originalPath || path.join(directory, file.name);
        const newName = parsedItem.name;

        // Rename file if needed
        if (newName !== file.name) {
            try {
                const renameResult = this.fileRenamer.renameFile(originalPath, newName);
                if (renameResult.success) {
                    result.renamed++;
                    console.log(`  ✓ Renamed: ${file.name} → ${newName}`);
                    file.originalPath = renameResult.newPath;
                } else if (!renameResult.error?.includes('already exists')) {
                    console.log(`  ✗ Rename failed: ${renameResult.error}`);
                    result.errors++;
                }
            } catch (error) {
                console.error(`  Error renaming ${file.name}:`, error);
                result.errors++;
            }
        }

        // Create NFO and download poster for movies
        if (parsedItem.itemType === ItemType.SingleMovie && parsedItem.metadata) {
            await this.createMovieMetadata(file, directory, parsedItem, result);
        }
    }

    /**
     * Process folder rename and metadata
     */
    private async processFolderRename(folder: Folder, parsedItem: FileScannerItem, result: OrganizeResult): Promise<void> {
        const originalPath = folder.originalPath!;
        const directory = path.dirname(originalPath);
        
        // For BD-Rip folders, rename and create metadata
        if (parsedItem.itemType === ItemType.BDRipRootFolder || 
            parsedItem.itemType === ItemType.DVDRipRootFolder) {
            
            // The new name is the formatted movie name (without .mkv extension for folders)
            let newFolderName = parsedItem.name.replace(/\.mkv$/, '');
            const newPath = path.join(directory, newFolderName);

            if (originalPath !== newPath && !fs.existsSync(newPath)) {
                try {
                    fs.renameSync(originalPath, newPath);
                    result.renamed++;
                    console.log(`  ✓ Renamed folder: ${folder.name} → ${newFolderName}`);
                    folder.originalPath = newPath;
                } catch (error) {
                    console.error(`  Error renaming folder ${folder.name}:`, error);
                    result.errors++;
                }
            }

            // Create NFO and poster for BD-Rip
            if (parsedItem.metadata) {
                await this.createFolderMetadata(folder, parsedItem, result);
            }
        }

        // For TV series root folders - RENAME and create metadata
        if (parsedItem.itemType === ItemType.TVShowSeriesRootFolder) {
            // Extract clean folder name from parsed name (remove ratings, prevent duplicate years)
            let newFolderName = parsedItem.name
                .replace(/\s*\(KP\s*[\d.]+\)/, '')  // Remove Kinopoisk rating
                .replace(/\s*\(IMDB\s*[\d.]+\)/, '') // Remove IMDB rating from name
                .replace(/(\s*\(\d{4}\))+/g, (match) => {
                    // Keep only the first year, remove duplicates
                    const firstYear = match.match(/\((\d{4})\)/);
                    return firstYear ? ` (${firstYear[1]})` : '';
                })
                .trim();
            
            const newPath = path.join(directory, newFolderName);
            const oldFolderName = folder.name;

            // Rename folder if name changed
            if (oldFolderName !== newFolderName && originalPath !== newPath && !fs.existsSync(newPath)) {
                try {
                    // First, clean up old poster/nfo files inside the folder
                    this.cleanupOldMetadataFiles(originalPath);
                    
                    fs.renameSync(originalPath, newPath);
                    result.renamed++;
                    console.log(`  ✓ Renamed series folder: ${oldFolderName} → ${newFolderName}`);
                    folder.originalPath = newPath;
                } catch (error) {
                    console.error(`  Error renaming series folder ${oldFolderName}:`, error);
                    result.errors++;
                }
            }

            // Always clean up old/mismatched poster files
            const currentPath = folder.originalPath!;
            this.cleanupOldMetadataFiles(currentPath);

            // Create metadata
            if (parsedItem.metadata) {
                await this.createTVSeriesMetadata(folder, parsedItem, result);
            }
        }
    }
    
    /**
     * Clean up old poster and NFO files that don't match current folder name
     */
    private cleanupOldMetadataFiles(folderPath: string): void {
        try {
            const currentFolderName = path.basename(folderPath);
            const expectedPoster = `${currentFolderName}-poster.jpg`;
            
            const files = fs.readdirSync(folderPath);
            for (const file of files) {
                // Delete poster files that don't match current folder name
                if (file.endsWith('-poster.jpg') && file !== expectedPoster) {
                    const filePath = path.join(folderPath, file);
                    fs.unlinkSync(filePath);
                    console.log(`  🗑️ Removed old poster: ${file}`);
                }
            }
        } catch (error) {
            // Ignore cleanup errors
        }
    }

    /**
     * Create NFO file and download poster for a movie file
     */
    private async createMovieMetadata(
        file: File,
        directory: string,
        parsedItem: FileScannerItem,
        result: OrganizeResult
    ): Promise<void> {
        const metadata = parsedItem.metadata!;
        const currentPath = file.originalPath || path.join(directory, file.name);
        const extension = path.extname(currentPath);
        const baseFileName = parsedItem.name.replace(extension, '');

        // Create Movie object for KodiService
        const movie: Movie = {
            originalPath: currentPath,
            currentPath: currentPath,
            fileName: parsedItem.name,
            originalFileName: file.name,
            title: metadata.title,
            year: metadata.year,
            imdbRating: metadata.imdbRating || 0,
            imdbId: metadata.imdbId || '',
            country: metadata.country || '',
            language: metadata.language || '',
            plot: metadata.plot || null,
            genre: metadata.genre || null,
            director: metadata.director || null,
            actors: metadata.actors || null,
            posterUrl: metadata.posterUrl || null,
            isFolder: false,
            lastScanned: new Date().toISOString(),
            status: 'active',
            errorMessage: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        // Always check disk for NFO existence (fast operation)
        const nfoPath = path.join(directory, `${baseFileName}.nfo`);
        const nfoExists = fs.existsSync(nfoPath);
        if (!nfoExists) {
            const nfoCreated = await this.kodiService.createNFOFile(movie, directory);
            if (nfoCreated) {
                result.nfoCreated++;
            }
        }

        // Always check disk for poster existence (fast operation)
        const posterPath = path.join(directory, `${baseFileName}-poster.jpg`);
        const posterExists = fs.existsSync(posterPath);
        if (!posterExists && metadata.posterUrl) {
            const posterDownloaded = await this.posterService.downloadAndWatermarkPoster(
                metadata.posterUrl,
                posterPath,
                metadata.imdbRating || 0
            );
            if (posterDownloaded) {
                result.postersDownloaded++;
            }
        }
    }

    /**
     * Create NFO and poster for BD-Rip/DVD-Rip folder
     */
    private async createFolderMetadata(
        folder: Folder,
        parsedItem: FileScannerItem,
        result: OrganizeResult
    ): Promise<void> {
        const metadata = parsedItem.metadata!;
        const folderPath = folder.originalPath!;
        const folderName = path.basename(folderPath);

        // Create Movie object for KodiService
        const movie: Movie = {
            originalPath: folderPath,
            currentPath: folderPath,
            fileName: folderName,
            originalFileName: folder.name,
            title: metadata.title,
            year: metadata.year,
            imdbRating: metadata.imdbRating || 0,
            imdbId: metadata.imdbId || '',
            country: metadata.country || '',
            language: metadata.language || '',
            plot: metadata.plot || null,
            genre: metadata.genre || null,
            director: metadata.director || null,
            actors: metadata.actors || null,
            posterUrl: metadata.posterUrl || null,
            isFolder: true,
            lastScanned: new Date().toISOString(),
            status: 'active',
            errorMessage: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        // Always check disk for NFO existence (fast operation)
        const parentDir = path.dirname(folderPath);
        const nfoPath = path.join(parentDir, `${folderName}.nfo`);
        const nfoExists = fs.existsSync(nfoPath);
        if (!nfoExists) {
            const nfoCreated = await this.kodiService.createNFOFile(movie, parentDir);
            if (nfoCreated) {
                result.nfoCreated++;
            }
        }

        // Always check disk for poster existence (fast operation)
        const posterPath = path.join(parentDir, `${folderName}-poster.jpg`);
        const posterExists = fs.existsSync(posterPath);
        if (!posterExists && metadata.posterUrl) {
            const posterDownloaded = await this.posterService.downloadAndWatermarkPoster(
                metadata.posterUrl,
                posterPath,
                metadata.imdbRating || 0
            );
            if (posterDownloaded) {
                result.postersDownloaded++;
            }
        }
    }

    /**
     * Create metadata for TV series folder
     */
    private async createTVSeriesMetadata(
        folder: Folder,
        parsedItem: FileScannerItem,
        result: OrganizeResult
    ): Promise<void> {
        const metadata = parsedItem.metadata!;
        const folderPath = folder.originalPath!;
        const folderName = path.basename(folderPath);

        // Always check disk for poster existence (fast operation)
        const posterPath = path.join(folderPath, `${folderName}-poster.jpg`);
        const posterExists = fs.existsSync(posterPath);
        if (!posterExists && metadata.posterUrl) {
            // Use Kinopoisk rating if available, otherwise IMDB
            const rating = metadata.kinopoiskRating || metadata.imdbRating || 0;
            const posterDownloaded = await this.posterService.downloadAndWatermarkPoster(
                metadata.posterUrl,
                posterPath,
                rating
            );
            if (posterDownloaded) {
                result.postersDownloaded++;
            }
        }

        // Always check disk for tvshow.nfo existence (fast operation)
        const nfoPath = path.join(folderPath, 'tvshow.nfo');
        const nfoExists = fs.existsSync(nfoPath);
        if (!nfoExists) {
            const nfoContent = this.generateTVShowNFO(metadata, parsedItem.name);
            try {
                fs.writeFileSync(nfoPath, nfoContent, 'utf-8');
                result.nfoCreated++;
                console.log(`  ✓ Created tvshow.nfo for ${parsedItem.name}`);
            } catch (error) {
                console.error(`  Error creating tvshow.nfo:`, error);
            }
        }
    }

    /**
     * Generate tvshow.nfo content for Kodi
     */
    private generateTVShowNFO(metadata: ItemMetadata, displayName: string): string {
        const escapeXml = (str: string) => str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');

        return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<tvshow>
  <title>${escapeXml(metadata.title)}</title>
  <originaltitle>${escapeXml(metadata.originalTitle || metadata.title)}</originaltitle>
  <year>${metadata.year}</year>
  <rating>${metadata.imdbRating || metadata.kinopoiskRating || 0}</rating>
  <plot>${escapeXml(metadata.plot || '')}</plot>
  <thumb>${escapeXml(metadata.posterUrl || '')}</thumb>
  <genre>${escapeXml(metadata.genre || '')}</genre>
  <premiered>${metadata.year}-01-01</premiered>
  ${metadata.imdbId ? `<id>${metadata.imdbId}</id>` : ''}
  ${metadata.tmdbId ? `<tmdbid>${metadata.tmdbId}</tmdbid>` : ''}
  ${metadata.kinopoiskId ? `<kinopoiskid>${metadata.kinopoiskId}</kinopoiskid>` : ''}
</tvshow>`;
    }
}
