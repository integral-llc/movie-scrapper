/**
 * TV Series Name Parser Utility
 * Cleans torrent-style folder names and extracts metadata
 * Supports Russian translit detection
 */

export interface TVSeriesParseResult {
  cleanName: string;
  originalName: string;
  season?: number;
  year?: number;
  quality?: string;
  isTranslit: boolean;
  language?: string;
  suggestedSearchTerms: string[];
}

export interface TranslitDetectionResult {
  isTranslit: boolean;
  language?: string;
  confidence: number;
}

export class TVSeriesNameParser {
  // Quality tags to strip
  private static readonly QUALITY_TAGS = [
    '2160p', '4K', 'UHD',
    '1080p', '1080i',
    '720p', '480p',
    'HDR', 'HDR10', 'HDR10+', 'DV', 'Dolby Vision',
    'SDR',
  ];

  // Source/codec tags to strip
  private static readonly SOURCE_CODEC_TAGS = [
    'WEB-DL', 'WEBDL', 'WEBRip', 'WEB',
    'BluRay', 'BDRip', 'BRRip', 'Blu-ray',
    'DVDRip', 'DVDScr', 'HDTV', 'PDTV',
    'HEVC', 'x265', 'H.265', 'H265',
    'x264', 'H.264', 'H264', 'AVC',
    'AV1', 'VP9',
    'REMUX', 'Hybrid',
  ];

  // Audio codec tags to strip
  private static readonly AUDIO_TAGS = [
    'DTS', 'DTS-HD', 'DTS-HD.MA', 'DTS-X',
    'TrueHD', 'Atmos',
    'AC3', 'AAC', 'FLAC', 'EAC3', 'DD5.1', 'DDP5.1',
    'LPCM', 'PCM',
    '7.1', '5.1', '2.0',
  ];

  // Common release groups to strip
  private static readonly RELEASE_GROUPS = [
    'RARBG', 'YIFY', 'YTS', 'FGT', 'NTb', 'LOL', 'DEMAND', 'FLUX',
    'ExKinoRay', 'KinoRay', 'Jaskier', 'NewStudio', 'LostFilm',
    'Kerob', 'HDRezka', 'Hamster', 'NewComers',
    'SPARKS', 'GECKOS', 'TERMINAL', 'EPSILON',
  ];

  // Russian translit character patterns that suggest transliteration
  private static readonly RUSSIAN_TRANSLIT_PATTERNS = [
    // Common Russian word endings in translit
    /\b\w+iy\b/i,          // -ий (Barankiny, Likvidatsiy)
    /\b\w+aya?\b/i,        // -ая, -а (Brigada)
    /\b\w+ova?\b/i,        // -ова, -ов
    /\b\w+sky?\b/i,        // -ский, -ский
    /\b\w+nya\b/i,         // -ня
    /\b\w+tsy?a?\b/i,      // -ция, -цы
    /\b\w+shch\w*/i,       // щ sound
    /\b\w+zh\w*/i,         // ж sound
    /\b\w+ch\w*/i,         // ч sound (but common in English too)
    /\b\w+kh\w*/i,         // х sound
    /\b\w+ts\w*/i,         // ц sound
    /\bya\b|\byu\b|\bye\b/i, // Cyrillic vowels
  ];

  // Known Russian translit words/names
  private static readonly KNOWN_RUSSIAN_WORDS = [
    'barankiny', 'kamni', 'sily', 'brigada', 'likvidatsiya', 'ottepel',
    'chernobyl', 'zona', 'otchuzhdeniya', 'metod', 'brat', 'voyna', 'mir',
    'lyubov', 'smert', 'zhizn', 'dom', 'noch', 'den', 'gorod', 'chelovek',
    'devushka', 'muzhchina', 'vremya', 'leto', 'zima', 'vesna', 'osen',
    'nebo', 'zemlya', 'voda', 'ogon', 'solntse', 'luna', 'zvezda',
    'slovo', 'delo', 'put', 'doroga', 'konets', 'nachalo',
  ];

  /**
   * Parse a TV series folder name and extract all metadata
   */
  parse(folderName: string): TVSeriesParseResult {
    const cleanResult = this.cleanFolderName(folderName);
    const translitResult = this.detectTranslit(cleanResult.cleanName);

    const suggestedSearchTerms: string[] = [cleanResult.cleanName];

    // If it looks like translit, we might want to add variations
    if (translitResult.isTranslit) {
      // The AI service will handle actual translation
      suggestedSearchTerms.push(cleanResult.cleanName);
    }

    return {
      ...cleanResult,
      isTranslit: translitResult.isTranslit,
      language: translitResult.language,
      suggestedSearchTerms,
    };
  }

  /**
   * Clean a folder name by stripping technical tags
   */
  cleanFolderName(folderName: string): Omit<TVSeriesParseResult, 'isTranslit' | 'language' | 'suggestedSearchTerms'> {
    let name = folderName;
    let season: number | undefined;
    let year: number | undefined;
    let quality: string | undefined;

    // Store original
    const originalName = folderName;

    // Handle Russian folder names with " - S01" pattern
    const russianSeasonMatch = name.match(/^(.+?)\s*-\s*S(\d{1,2})$/i);
    if (russianSeasonMatch) {
      name = russianSeasonMatch[1].trim();
      season = parseInt(russianSeasonMatch[2], 10);
      return { cleanName: name, originalName, season, year, quality };
    }

    // Handle folders with IMDB rating pattern: "Name (Year) (IMDB X.X)"
    const imdbMatch = name.match(/^(.+?)\s*\((\d{4})\)\s*\(IMDB\s*[\d.]+\)$/i);
    if (imdbMatch) {
      name = imdbMatch[1].trim();
      year = parseInt(imdbMatch[2], 10);
      return { cleanName: name, originalName, season, year, quality };
    }

    // Extract year FIRST (before season stripping) - look for 4 digits that look like a year
    // Allow year to be followed by dot, space, or end of string
    const yearInOriginal = folderName.match(/[.\s](19\d{2}|20\d{2})(?:[.\s]|$)/);
    if (yearInOriginal) {
      year = parseInt(yearInOriginal[1], 10);
    }

    // Extract quality from original name before any stripping
    const originalWithSpaces = folderName.replace(/\./g, ' ');
    for (const q of TVSeriesNameParser.QUALITY_TAGS) {
      const qRegex = new RegExp(`\\b${this.escapeRegex(q)}\\b`, 'i');
      if (qRegex.test(originalWithSpaces)) {
        quality = q;
        break;
      }
    }

    // Extract season marker (S01, S02, etc.) - must be done before dots conversion
    const seasonMatch = name.match(/S(\d{1,2})(?:\.|$|\s)/i);
    if (seasonMatch) {
      season = parseInt(seasonMatch[1], 10);
      // Remove the season marker and everything after it
      name = name.replace(/\.?S\d{1,2}.*$/i, '');
    }

    // Convert dots to spaces (torrent naming convention)
    name = name.replace(/\./g, ' ');

    // Strip quality tags
    for (const tag of TVSeriesNameParser.QUALITY_TAGS) {
      const tagRegex = new RegExp(`\\b${this.escapeRegex(tag)}\\b`, 'gi');
      name = name.replace(tagRegex, ' ');
    }

    // Strip source/codec tags
    for (const tag of TVSeriesNameParser.SOURCE_CODEC_TAGS) {
      const tagRegex = new RegExp(`\\b${this.escapeRegex(tag)}\\b`, 'gi');
      name = name.replace(tagRegex, ' ');
    }

    // Strip audio tags
    for (const tag of TVSeriesNameParser.AUDIO_TAGS) {
      const tagRegex = new RegExp(`\\b${this.escapeRegex(tag)}\\b`, 'gi');
      name = name.replace(tagRegex, ' ');
    }

    // Strip release groups (including bracketed ones)
    for (const group of TVSeriesNameParser.RELEASE_GROUPS) {
      const groupRegex = new RegExp(`\\[?${this.escapeRegex(group)}\\]?`, 'gi');
      name = name.replace(groupRegex, ' ');
    }

    // Strip anything after a space-dash that looks like a release group (DEMAND, FLUX, etc.)
    // Require space before dash to avoid stripping hyphenated titles like "Spider-Man"
    name = name.replace(/\s-\s*[A-Z][A-Za-z0-9]*\s*$/, '');

    // Clean up
    name = name
      .replace(/\s+/g, ' ')      // Multiple spaces to single
      .replace(/^\s+|\s+$/g, '') // Trim
      .replace(/\s+-\s*$/, '')   // Trailing dash
      .replace(/^-\s*/, '');     // Leading dash

    return { cleanName: name, originalName, season, year, quality };
  }

  /**
   * Detect if a name appears to be Russian transliteration
   */
  detectTranslit(name: string): TranslitDetectionResult {
    const lowerName = name.toLowerCase();
    const words = lowerName.split(/\s+/);

    let translitScore = 0;
    let totalChecks = 0;

    // Check for known Russian words
    for (const word of words) {
      if (TVSeriesNameParser.KNOWN_RUSSIAN_WORDS.includes(word)) {
        translitScore += 2;
      }
      totalChecks++;
    }

    // Check for translit patterns
    for (const pattern of TVSeriesNameParser.RUSSIAN_TRANSLIT_PATTERNS) {
      if (pattern.test(name)) {
        translitScore += 1;
      }
      totalChecks++;
    }

    // Check for uncommon English character combinations
    const uncommonCombos = ['kh', 'zh', 'shch', 'tsy', 'iya', 'iye'];
    for (const combo of uncommonCombos) {
      if (lowerName.includes(combo)) {
        translitScore += 1.5;
      }
    }

    // Calculate confidence
    const confidence = Math.min(1, translitScore / 5);

    return {
      isTranslit: confidence >= 0.4,
      language: confidence >= 0.4 ? 'ru' : undefined,
      confidence,
    };
  }

  /**
   * Escape regex special characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
