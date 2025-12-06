import { TMDbService, MovieData } from '../services/tmdb.service';
import { MovieNameParser } from './movie-name-parser.util';
import { AIMovieParserService } from '../services/ai-movie-parser.service';
import { KinopoiskService, KinopoiskData } from '../services/kinopoisk.service';

export enum ItemType {
    Folder,
    SingleMovie,
    TVShowSeriesRootFolder,
    TVShowSeriesEpisode,
    TVShowSeasonFolder,
    BDRipRootFolder,
    DVDRipRootFolder,
    CollectionFolder,
    SubtitleFile,
    Other
}

export interface ItemMetadata {
    title: string;
    originalTitle?: string;
    year: number;
    imdbId?: string;
    imdbRating?: number;
    kinopoiskId?: number;
    kinopoiskRating?: number;
    tmdbId?: number;
    plot?: string;
    genre?: string;
    country?: string;
    language?: string;
    director?: string;
    actors?: string;
    posterUrl?: string;
    backdropUrl?: string;
}

export class FileScannerItem {
    name: string;
    itemType: ItemType;
    metadata?: ItemMetadata;

    constructor(name: string, itemType: ItemType, metadata?: ItemMetadata) {
        this.name = name;
        this.itemType = itemType;
        this.metadata = metadata;
    }
}

export class File {
    name: string;
    originalPath?: string;  // Full path on disk for file operations
    parsedItem?: FileScannerItem;

    setParsedItem(parsedItem: FileScannerItem): void {
        this.parsedItem = parsedItem;
    }

    getParsedItem(): FileScannerItem | undefined {
        return this.parsedItem;
    }

    constructor(name: string, originalPath?: string) {
        this.name = name;
        this.originalPath = originalPath;
    }
}

export class Folder {
    parsedItem?: FileScannerItem;
    name: string;
    originalPath?: string;  // Full path on disk for file operations
    files?: File[];
    folders?: Folder[];

    constructor(name: string, files?: File[], folders?: Folder[], originalPath?: string) {
        this.name = name;
        this.files = files;
        this.folders = folders;
        this.originalPath = originalPath;
    }

    setParsedItem(parsedItem: FileScannerItem): void {
        this.parsedItem = parsedItem;
    }

    getParsedItem(): FileScannerItem | undefined {
        return this.parsedItem;
    }
}

export class FileScanner {
    private tmdbService: TMDbService;
    private movieNameParser: MovieNameParser;
    private aiParser: AIMovieParserService;
    private kinopoiskService: KinopoiskService;
    
    // Caches to avoid duplicate API calls
    private tmdbMovieCache: Map<string, MovieData | null> = new Map();
    private tmdbTVCache: Map<string, MovieData | null> = new Map();
    private kinopoiskCache: Map<string, KinopoiskData | null> = new Map();
    private transliterationCache: Map<string, string> = new Map();
    private folderAnalysisCache: Map<string, { isTVSeries: boolean; seriesName?: string }> = new Map();
    
    constructor() {
        this.tmdbService = new TMDbService();
        this.movieNameParser = new MovieNameParser();
        this.aiParser = new AIMovieParserService();
        this.kinopoiskService = new KinopoiskService();
    }
    
    // Cached TMDb movie search
    private async cachedTmdbMovie(title: string, year?: number): Promise<MovieData | null> {
        const key = `${title.toLowerCase()}|${year || ''}`;
        if (this.tmdbMovieCache.has(key)) {
            console.log(`    📋 Cache hit: TMDb movie "${title}"`);
            return this.tmdbMovieCache.get(key)!;
        }
        const result = await this.tmdbService.searchMovie(title, year);
        this.tmdbMovieCache.set(key, result);
        return result;
    }
    
    // Cached TMDb TV search
    private async cachedTmdbTV(title: string): Promise<MovieData | null> {
        const key = title.toLowerCase();
        if (this.tmdbTVCache.has(key)) {
            console.log(`    📋 Cache hit: TMDb TV "${title}"`);
            return this.tmdbTVCache.get(key)!;
        }
        const result = await this.tmdbService.searchTV(title);
        this.tmdbTVCache.set(key, result);
        return result;
    }
    
    // Cached Kinopoisk search
    private async cachedKinopoisk(title: string): Promise<KinopoiskData | null> {
        const key = title.toLowerCase();
        if (this.kinopoiskCache.has(key)) {
            console.log(`    📋 Cache hit: Kinopoisk "${title}"`);
            return this.kinopoiskCache.get(key)!;
        }
        const result = await this.kinopoiskService.searchTVSeries(title);
        this.kinopoiskCache.set(key, result);
        return result;
    }
    
    // Cached transliteration
    private async cachedTransliterate(text: string): Promise<string> {
        const key = text.toLowerCase();
        if (this.transliterationCache.has(key)) {
            console.log(`    📋 Cache hit: Transliteration "${text}"`);
            return this.transliterationCache.get(key)!;
        }
        const result = await this.transliterateToCyrillic(text);
        this.transliterationCache.set(key, result);
        return result;
    }
    
    // Cached folder analysis
    private async cachedFolderAnalysis(folderName: string, fileNames: string[]): Promise<{ isTVSeries: boolean; seriesName?: string }> {
        const key = folderName.toLowerCase();
        if (this.folderAnalysisCache.has(key)) {
            console.log(`    📋 Cache hit: Folder analysis "${folderName}"`);
            return this.folderAnalysisCache.get(key)!;
        }
        const result = await this.aiParser.analyzeFolder(folderName, fileNames);
        this.folderAnalysisCache.set(key, result);
        return result;
    }
    
    // this traverse the existing structure and sets correctly the parsedItem property
    async parse(rootFolder: Folder, franchiseName?: string, seriesName?: string): Promise<void> {
        // Check if this folder is a TV series (already parsed)
        const isSeriesFolder = rootFolder.parsedItem?.itemType === ItemType.TVShowSeriesRootFolder;
        // Extract series name without year, rating, or season suffix
        const currentSeriesName = isSeriesFolder && rootFolder.parsedItem 
            ? rootFolder.parsedItem.name
                .replace(/\s*\(KP\s*[\d.]+\)/, '')     // Remove Kinopoisk rating
                .replace(/\s*\(\d{4}\)/, '')           // Remove year
                .replace(/\s*S\d{2}$/, '')             // Remove season suffix
                .trim()
            : seriesName;
        
        // Process all files in the folder
        if (rootFolder.files) {
            for (const file of rootFolder.files) {
                await this.parseFile(file, franchiseName, currentSeriesName);
            }
        }
        
        // Recursively process subfolders
        if (rootFolder.folders) {
            for (const folder of rootFolder.folders) {
                await this.parseFolder(folder, franchiseName, currentSeriesName);
                // If this folder is a collection, extract franchise for children
                const childFranchise = folder.parsedItem?.itemType === ItemType.CollectionFolder
                    ? this.extractFranchiseFromCollectionName(folder.parsedItem.name)
                    : franchiseName;
                // If this folder is a TV series, pass the series name (without year/rating)
                const childSeriesName = folder.parsedItem?.itemType === ItemType.TVShowSeriesRootFolder
                    ? folder.parsedItem.name
                        .replace(/\s*\(KP\s*[\d.]+\)/, '')     // Remove Kinopoisk rating
                        .replace(/\s*\(\d{4}\)/, '')           // Remove year
                        .replace(/\s*S\d{2}$/, '')             // Remove season suffix
                        .trim()
                    : currentSeriesName;
                await this.parse(folder, childFranchise, childSeriesName);
            }
        }
    }
    
    private extractFranchiseFromCollectionName(collectionName: string): string {
        // Remove " Collection" suffix to get franchise name
        return collectionName.replace(/\s+Collection$/i, '');
    }
    
    private getAllFileNames(folder: Folder): string[] {
        // Get all file names including from subfolders (recursive)
        const fileNames: string[] = folder.files?.map(f => f.name) || [];
        if (folder.folders) {
            for (const subfolder of folder.folders) {
                fileNames.push(...this.getAllFileNames(subfolder));
            }
        }
        return fileNames;
    }
    
    private async parseFolder(folder: Folder, franchiseName?: string, seriesName?: string): Promise<void> {
        const folderName = folder.name;
        const fileNames = folder.files?.map(f => f.name) || [];
        // Also get file names from subfolders for analysis (useful for series root folders)
        const allFileNames = this.getAllFileNames(folder);
        
        // Check if this is a BD-Rip folder (contains BDMV or CERTIFICATE)
        if (this.isBDRipFolder(fileNames)) {
            await this.parseBDRipFolder(folder, franchiseName);
            return;
        }
        
        // Check if this is a season folder (inside a series, contains episode files)
        if (seriesName && this.isSeasonFolder(folderName, fileNames)) {
            const seasonNum = this.extractSeasonNumber(folderName);
            folder.setParsedItem(new FileScannerItem(`${seriesName} S${seasonNum.toString().padStart(2, '0')}`, ItemType.TVShowSeriesRootFolder));
            return;
        }
        
        // Use AI to analyze the folder (include subfolder files for context) - CACHED
        const analysis = await this.cachedFolderAnalysis(folderName, allFileNames);
        
        if (analysis.isTVSeries && analysis.seriesName) {
            // Extract year from files or folder name (more reliable for recent content)
            const yearFromFiles = this.extractYearFromFiles(folderName, allFileNames);
            const hasCyrillic = /[\u0400-\u04FF]/.test(folderName);
            
            // Look up TV series in TMDB - CACHED
            let tvData = await this.cachedTmdbTV(analysis.seriesName);
            
            // If TMDB not found, try Kinopoisk with Cyrillic transliteration
            if (!tvData) {
                // Transliterate to Cyrillic for better Kinopoisk search - CACHED
                const cyrillicName = await this.cachedTransliterate(analysis.seriesName);
                const kinopoiskData = await this.cachedKinopoisk(cyrillicName);
                if (kinopoiskData) {
                    const yearToUse = yearFromFiles || kinopoiskData.year;
                    const rating = kinopoiskData.rating ? ` (KP ${kinopoiskData.rating})` : '';
                    const metadata: ItemMetadata = {
                        title: kinopoiskData.title,
                        originalTitle: kinopoiskData.originalTitle,
                        year: yearToUse,
                        kinopoiskId: kinopoiskData.kinopoiskId,
                        kinopoiskRating: kinopoiskData.rating,
                        imdbRating: kinopoiskData.imdbRating,
                    };
                    folder.setParsedItem(new FileScannerItem(
                        `${kinopoiskData.title} (${yearToUse})${rating}`,
                        ItemType.TVShowSeriesRootFolder,
                        metadata
                    ));
                    return;
                }
            }
            
            if (tvData) {
                // Use original title if input has Cyrillic, strip any existing year
                let titleToUse = hasCyrillic ? folderName : tvData.title;
                // Remove any existing year, season suffix, and quality tags from title
                titleToUse = titleToUse
                    .replace(/\s*\(\d{4}\)/g, '')           // Remove (YYYY)
                    .replace(/\s*\(IMDB\s*[\d.]+\)/gi, '')  // Remove (IMDB X.X)
                    .replace(/\s*\(KP\s*[\d.]+\)/gi, '')    // Remove (KP X.X)
                    .replace(/[-.\s]*S\d{2}$/i, '')          // Remove S01 suffix
                    .replace(/\.\d{4}\..*/i, '')             // Remove .2025.WEB-DL... style
                    .replace(/[._]/g, ' ')                   // Replace dots/underscores
                    .trim();
                // Prefer year from files over TMDB (files are more accurate for recent releases)
                const yearToUse = yearFromFiles || tvData.year;
                const metadata: ItemMetadata = {
                    title: titleToUse,
                    originalTitle: tvData.originalTitle,
                    year: yearToUse,
                    tmdbId: tvData.tmdbId,
                    imdbRating: tvData.imdbRating,
                    imdbId: tvData.imdbId,
                    plot: tvData.plot,
                    genre: tvData.genre,
                    country: tvData.country,
                    language: tvData.language,
                    posterUrl: tvData.posterUrl,
                    backdropUrl: tvData.backdropUrl,
                };
                folder.setParsedItem(new FileScannerItem(`${titleToUse} (${yearToUse})`, ItemType.TVShowSeriesRootFolder, metadata));
            } else {
                // Neither TMDB nor Kinopoisk found - use AI to get proper title and year
                const seriesInfo = await this.extractSeriesInfo(folderName, fileNames);
                const yearToUse = yearFromFiles || seriesInfo.year;
                folder.setParsedItem(new FileScannerItem(`${seriesInfo.title} (${yearToUse})`, ItemType.TVShowSeriesRootFolder));
            }
        } else if (this.isCollectionFolder(folderName, fileNames)) {
            const collectionName = await this.extractCollectionName(folderName, fileNames);
            folder.setParsedItem(new FileScannerItem(collectionName, ItemType.CollectionFolder));
        } else {
            folder.setParsedItem(new FileScannerItem(folderName, ItemType.Folder));
        }
    }
    
    private isSeasonFolder(folderName: string, fileNames: string[]): boolean {
        // Season folder has episode files (S##E## pattern) and may have season number in name
        const hasEpisodeFiles = fileNames.some(f => /S\d{1,2}E\d{1,2}/i.test(f));
        return hasEpisodeFiles;
    }
    
    private extractSeasonNumber(folderName: string): number {
        // Try to extract season number from folder name
        // Patterns: "Series-2", "Series 2", "Season 2", "S02", etc.
        const seasonMatch = folderName.match(/[-\s](\d+)$/) ||          // "Series-2" or "Series 2" at end
                           folderName.match(/Season\s*(\d+)/i) ||       // "Season 2"
                           folderName.match(/S(\d{1,2})(?!\d)/i);       // "S02" not followed by digit
        return seasonMatch ? parseInt(seasonMatch[1]) : 1;  // Default to season 1
    }
    
    private extractYearFromFiles(folderName: string, fileNames: string[]): number | null {
        // Try to extract year from folder name first
        const folderYearMatch = folderName.match(/\b(20\d{2})\b/);
        if (folderYearMatch) {
            return parseInt(folderYearMatch[1]);
        }
        // Then try from file names
        for (const fileName of fileNames) {
            const fileYearMatch = fileName.match(/\b(20\d{2})\b/);
            if (fileYearMatch) {
                return parseInt(fileYearMatch[1]);
            }
        }
        return null;
    }
    
    private isBDRipFolder(fileNames: string[]): boolean {
        // BD-Rip folders contain BDMV, CERTIFICATE, or similar Blu-ray structure files
        return fileNames.some(f => /^(BDMV|CERTIFICATE|BACKUP)$/i.test(f));
    }
    
    private async parseBDRipFolder(folder: Folder, franchiseName?: string): Promise<void> {
        const folderName = folder.name;
        
        // Use AI to extract movie title from folder name
        const aiParsed = await this.aiParser.parseFileName(folderName);
        const titleToSearch = aiParsed.title || folderName;
        
        // Look up the movie in TMDB - CACHED
        let movieData = await this.cachedTmdbMovie(titleToSearch, aiParsed.year);
        
        if (!movieData) {
            folder.setParsedItem(new FileScannerItem(folderName, ItemType.BDRipRootFolder));
            return;
        }
        
        // Apply franchise prefix if inside a collection and title doesn't already have it
        let titleToUse = movieData.title;
        if (franchiseName && !titleToUse.toLowerCase().startsWith(franchiseName.toLowerCase())) {
            titleToUse = `${franchiseName}: ${titleToUse}`;
        }
        
        // Build metadata for NFO generation
        const metadata: ItemMetadata = {
            title: titleToUse,
            originalTitle: movieData.originalTitle,
            year: movieData.year,
            imdbId: movieData.imdbId,
            imdbRating: movieData.imdbRating,
            tmdbId: movieData.tmdbId,
            plot: movieData.plot,
            genre: movieData.genre,
            country: movieData.country,
            language: movieData.language,
            posterUrl: movieData.posterUrl,
            backdropUrl: movieData.backdropUrl,
        };
        
        // Build the formatted name (like a movie file but without extension)
        const formattedName = this.movieNameParser.buildFileName(
            titleToUse,
            movieData.year,
            movieData.imdbRating,
            '.mkv'  // BD-Rips are typically remuxed to mkv
        );
        
        folder.setParsedItem(new FileScannerItem(formattedName, ItemType.BDRipRootFolder, metadata));
    }
    
    private isCollectionFolder(folderName: string, fileNames: string[]): boolean {
        // Only treat as collection if folder name explicitly contains "collection"
        // Folders with multiple unrelated movies (like "kids") should NOT be collections
        return /collection/i.test(folderName);
    }
    
    private async transliterateToCyrillic(text: string): Promise<string> {
        // If already has Cyrillic, return as-is
        if (/[\u0400-\u04FF]/.test(text)) {
            return text;
        }
        
        // Use AI to transliterate Latin (transliterated Russian) back to Cyrillic
        const prompt = `Convert this transliterated Russian text back to Cyrillic.

Input: "${text}"

Rules:
- This is Russian text written in Latin letters (transliteration)
- Convert it back to proper Russian Cyrillic
- Examples:
  - "Barankiny i kamni sily" → "Баранкины и камни силы"
  - "Autsors" → "Аутсорс"
  - "Obratnaya storona luny" → "Обратная сторона луны"
- If the text is NOT transliterated Russian (e.g., English), return it unchanged

Respond with ONLY the converted text, nothing else.`;

        try {
            const response = await this.aiParser['getOpenAI']().chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.1,
            });
            
            const content = response.choices[0]?.message?.content?.trim();
            if (content) {
                console.log(`    🔤 Transliterated "${text}" → "${content}"`);
                return content;
            }
        } catch {
            // Fallback: return original
        }
        
        return text;
    }
    
    private async extractSeriesInfo(folderName: string, fileNames: string[]): Promise<{ title: string; year: number }> {
        // Use AI to extract series title (with proper translation) and year
        const prompt = `Extract the TV series information from this folder.

Folder name: "${folderName}"
Files inside:
${fileNames.slice(0, 5).map((f, i) => `${i + 1}. ${f}`).join('\n')}

IMPORTANT:
- If the folder/file names are in transliterated Russian (Latin letters representing Russian words), translate to proper Cyrillic Russian
- Example: "Barankiny i kamni sily" → "Баранкины и камни силы"
- Extract the year from the folder name or files (look for 4-digit year like 2025, 2024, etc.)

Respond in JSON format only:
{
  "title": "Series title in original language (Cyrillic if Russian)",
  "year": 2025
}`;

        try {
            const response = await this.aiParser['getOpenAI']().chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.1,
                response_format: { type: 'json_object' },
            });
            
            const content = response.choices[0]?.message?.content;
            if (content) {
                const parsed = JSON.parse(content);
                return {
                    title: parsed.title || folderName,
                    year: parsed.year || new Date().getFullYear()
                };
            }
        } catch {
            // Fallback: extract year from folder name
        }
        
        // Fallback: use folder name and extract year with regex
        const yearMatch = folderName.match(/\b(19|20)\d{2}\b/);
        return {
            title: folderName.replace(/\.\d{4}\..*$/, '').replace(/\./g, ' '),
            year: yearMatch ? parseInt(yearMatch[0]) : new Date().getFullYear()
        };
    }
    
    private async extractCollectionName(folderName: string, fileNames: string[]): Promise<string> {
        // Use AI to extract collection name from folder and file names
        const prompt = `Extract the movie collection/franchise name from this folder.

Folder name: "${folderName}"
Files inside:
${fileNames.map((f, i) => `${i + 1}. ${f}`).join('\n')}

Rules:
- Identify the common movie franchise (e.g., "Transformers", "Harry Potter", "Star Wars")
- Return ONLY the franchise name followed by "Collection"
- Examples: "Transformers Collection", "Harry Potter Collection", "Marvel Collection"
- Do NOT include release groups, quality tags, or other metadata

Respond with just the collection name, nothing else.`;

        try {
            const response = await this.aiParser['getOpenAI']().chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.1,
            });
            
            const content = response.choices[0]?.message?.content?.trim();
            return content || `${folderName} Collection`;
        } catch {
            return `${folderName} Collection`;
        }
    }
    
    private async parseFile(file: File, franchiseName?: string, seriesName?: string): Promise<void> {
        const fileName = file.name;
        
        // Extract extension
        const extMatch = fileName.match(/\.[^.]+$/);
        const extension = extMatch ? extMatch[0].toLowerCase() : '';
        
        // Skip BD-Rip/DVD-Rip indicator "files" (actually folders used as markers)
        if (['BDMV', 'VIDEO_TS', 'CERTIFICATE'].includes(fileName.toUpperCase())) {
            // Don't parse these - they're just markers for rip detection
            return;
        }
        
        // Skip subtitle and audio files - keep original name
        const subtitleExtensions = ['.srt', '.sub', '.idx', '.ass', '.ssa', '.vtt', '.ac3', '.dts', '.mka'];
        if (subtitleExtensions.includes(extension)) {
            file.setParsedItem(new FileScannerItem(fileName, ItemType.SubtitleFile));
            return;
        }
        
        // Check if this is a TV episode file
        // Pattern 1: S01E01, S1E1, S01.E01
        const episodeMatchStandard = fileName.match(/S(\d{1,2})[\.\s]*E(\d{1,2})/i);
        // Pattern 2: Russian "01 сер", "серия 01", "сер. 01"
        const episodeMatchRussian = fileName.match(/(\d{1,2})\s*сер/i) || fileName.match(/серия\s*(\d{1,2})/i);
        // Pattern 3: Just episode number at start "01.", "01 -"
        const episodeMatchSimple = fileName.match(/^(\d{1,2})[\.\s-]/);
        
        if (seriesName) {
            let season = '01'; // Default to season 1
            let episode: string | null = null;
            
            if (episodeMatchStandard) {
                season = episodeMatchStandard[1].padStart(2, '0');
                episode = episodeMatchStandard[2].padStart(2, '0');
            } else if (episodeMatchRussian) {
                episode = episodeMatchRussian[1].padStart(2, '0');
            } else if (episodeMatchSimple) {
                episode = episodeMatchSimple[1].padStart(2, '0');
            }
            
            if (episode) {
                const formattedName = `${seriesName} S${season}E${episode}${extension}`;
                file.setParsedItem(new FileScannerItem(formattedName, ItemType.TVShowSeriesEpisode));
                return;
            }
        }
        
        // Check if file is already in processed format: "Title (Year) (IMDB X.X).ext"
        const alreadyProcessedMatch = fileName.match(/^(.+)\s\((\d{4})\)\s\(IMDB\s([\d.]+)\)(\.\w+)$/);
        if (alreadyProcessedMatch) {
            // Already processed - extract info and look up metadata for NFO/poster
            const [, title, year, imdbRating, ext] = alreadyProcessedMatch;
            const movieData = await this.cachedTmdbMovie(title, parseInt(year));
            
            const metadata: ItemMetadata = {
                title: title,
                year: parseInt(year),
                imdbRating: parseFloat(imdbRating),
                posterUrl: movieData?.posterUrl,
                plot: movieData?.plot,
                genre: movieData?.genre,
                country: movieData?.country,
                language: movieData?.language,
                imdbId: movieData?.imdbId,
                tmdbId: movieData?.tmdbId,
            };
            
            file.setParsedItem(new FileScannerItem(fileName, ItemType.SingleMovie, metadata));
            return;
        }
        
        // Parse the filename to get clean name and year
        const parsed = this.movieNameParser.cleanMovieName(fileName);
        
        // Look up the movie in TMDB - CACHED
        let movieData = await this.cachedTmdbMovie(parsed.cleanName, parsed.year);
        
        // If not found, try AI-based parsing for better title extraction
        if (!movieData) {
            const aiParsed = await this.aiParser.parseFileName(fileName);
            if (aiParsed.title && aiParsed.title !== fileName) {
                movieData = await this.cachedTmdbMovie(aiParsed.title, aiParsed.year);
            }
        }
        
        if (!movieData) {
            file.setParsedItem(new FileScannerItem(fileName, ItemType.Other));
            return;
        }
        
        // Determine which title to use:
        // 1. If input has Cyrillic, use original title (preserve Russian)
        // 2. If original title has Cyrillic (Russian movie), use original title
        // 3. Otherwise use English title
        const hasCyrillic = /[\u0400-\u04FF]/.test(fileName);
        const originalHasCyrillic = movieData.originalTitle && /[\u0400-\u04FF]/.test(movieData.originalTitle);
        let titleToUse = (hasCyrillic || originalHasCyrillic) && movieData.originalTitle 
            ? movieData.originalTitle 
            : movieData.title;
        
        // Apply franchise prefix if inside a collection and title doesn't already have it
        if (franchiseName && !titleToUse.toLowerCase().startsWith(franchiseName.toLowerCase())) {
            titleToUse = `${franchiseName}: ${titleToUse}`;
        }
        
        // Build metadata for NFO generation
        const metadata: ItemMetadata = {
            title: titleToUse,
            originalTitle: movieData.originalTitle,
            year: movieData.year,
            imdbId: movieData.imdbId,
            imdbRating: movieData.imdbRating,
            tmdbId: movieData.tmdbId,
            plot: movieData.plot,
            genre: movieData.genre,
            country: movieData.country,
            language: movieData.language,
            posterUrl: movieData.posterUrl,
            backdropUrl: movieData.backdropUrl,
        };
        
        // Build the formatted filename
        const formattedName = this.movieNameParser.buildFileName(
            titleToUse,
            movieData.year,
            movieData.imdbRating,
            extension
        );
        
        file.setParsedItem(new FileScannerItem(formattedName, ItemType.SingleMovie, metadata));
    }
}