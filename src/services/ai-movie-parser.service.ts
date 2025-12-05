import OpenAI from 'openai';
import axios from 'axios';
import { getConfig } from '../config/env.config';

interface ParsedMovieInfo {
  title: string;
  year?: number;
  isMovie: boolean;
  isTVSeries: boolean;
  isTVEpisode: boolean;
  isAudioFile: boolean;
  confidence: number;
  reasoning?: string;
}

interface IMDbSearchResult {
  imdbId: string;
  title: string;
  year: number;
  rating: number;
  type: string;
  posterUrl?: string;
}

export class AIMovieParserService {
  private openai: OpenAI | null = null;

  private getOpenAI(): OpenAI {
    if (!this.openai) {
      this.openai = new OpenAI({
        apiKey: getConfig().openaiApiKey,
      });
    }
    return this.openai;
  }

  /**
   * Use AI to intelligently parse a movie filename and extract metadata
   */
  async parseFileName(fileName: string): Promise<ParsedMovieInfo> {
    const prompt = `Analyze this movie/video filename and extract information:

Filename: "${fileName}"

Determine:
1. The actual movie/show title (remove quality tags, release groups, codecs, etc.)
2. The year if present
3. Is this a MOVIE (standalone film)?
4. Is this a TV SERIES folder (collection of episodes)?
5. Is this a TV EPISODE (single episode file)?
6. Is this an audio/music file?

IMPORTANT RULES FOR TITLE EXTRACTION:
- Movie titles often have subtitles after a colon, e.g., "Predator: Badlands", "Spider-Man: No Way Home"
- Words like "Badlands", "Resurrection", "Uprising", "Legacy", "Origins" are often PART OF THE TITLE, not release groups
- Release groups typically start with a dash and contain random letters/numbers: -YIFY, -RARBG, -EniaHD, -playHD
- If a word appears BEFORE quality tags (720p, 1080p, BluRay, etc.), it's likely part of the title
- Example: "Predator.Badlands.CHDRip.1080p" -> title is "Predator Badlands" (Badlands comes before CHDRip)
- Example: "Movie.Name.2024.1080p.BluRay-YIFY" -> title is "Movie Name" (YIFY is release group after quality)

Common patterns to recognize:
- Quality: 720p, 1080p, 2160p, 4K, BluRay, WEB-DL, HDRip, BDRip, CHDRip, REMUX, etc.
- Codecs: x264, x265, HEVC, AVC, H264, H265, etc.
- Release groups: -YIFY, -RARBG, -EniaHD, -playHD (usually at the end after a dash)
- Audio: DD5.1, DTS, AAC, AC3, Atmos
- Russian episodes: "01 сер", "серия 01", "сер. 01"
- English episodes: S01E01, Season 1, Episode 1, "01. Title"
- Audio/demo indicators: "Atmos Mix", "Atmos Test", "DAR Atmos", "OST", "Soundtrack", "Demo", "Test", "SG DAR", "SG Atmos"
- If filename contains "Atmos Mix" or "SG DAR" or similar audio demo patterns, mark isAudioFile: true

Respond in JSON format only:
{
  "title": "Clean movie title",
  "year": 2023 or null,
  "isMovie": true/false,
  "isTVSeries": true/false,
  "isTVEpisode": true/false,
  "isAudioFile": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation"
}`;

    try {
      const response = await this.getOpenAI().chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from AI');
      }

      const parsed = JSON.parse(content);
      return {
        title: parsed.title || fileName,
        year: parsed.year || undefined,
        isMovie: parsed.isMovie ?? true,
        isTVSeries: parsed.isTVSeries ?? false,
        isTVEpisode: parsed.isTVEpisode ?? false,
        isAudioFile: parsed.isAudioFile ?? false,
        confidence: parsed.confidence ?? 0.5,
        reasoning: parsed.reasoning,
      };
    } catch (error) {
      console.error('AI parsing failed:', error);
      // Fallback to basic parsing
      return {
        title: fileName,
        isMovie: true,
        isTVSeries: false,
        isTVEpisode: false,
        isAudioFile: false,
        confidence: 0.1,
      };
    }
  }

  /**
   * Search IMDB and use AI to parse the results
   */
  async searchIMDb(title: string, year?: number): Promise<IMDbSearchResult | null> {
    try {
      // Build search URL
      const searchQuery = year ? `${title} ${year}` : title;
      const searchUrl = `https://www.imdb.com/find/?q=${encodeURIComponent(searchQuery)}&s=tt&ttype=ft,tv`;

      console.log(`  Searching IMDB: ${searchQuery}`);

      // Fetch IMDB search results
      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 15000,
      });

      const html = response.data;

      // Use AI to parse the HTML and find the best match
      const parsePrompt = `Parse this IMDB search results HTML and find the EXACT matching movie/TV show.

IMPORTANT: You MUST find a result where the title closely matches "${title}"${year ? ` and year is around ${year}` : ''}.
DO NOT return a different movie just because it appears in the search results.
If no result matches the search query title, set "found": false.

Search query: "${title}"${year ? ` (${year})` : ''}

HTML snippet (search results section):
${this.extractSearchResults(html)}

Rules for matching:
1. The title MUST be very similar to "${title}" (minor differences like "The" prefix or punctuation are OK)
2. If the year is provided, prefer results within 1-2 years
3. DO NOT match a completely different movie (e.g., don't match "Spider-Man" when searching for "Kingsman")
4. If no good match exists in the results, return found: false

Extract:
1. IMDB ID (format: tt1234567)
2. Title (exact title from IMDB)
3. Year
4. Type (movie/tvSeries)

Respond in JSON format only:
{
  "found": true/false,
  "imdbId": "tt1234567",
  "title": "Movie Title",
  "year": 2023,
  "type": "movie"
}

CRITICAL: If no result matches "${title}", you MUST return {"found": false}.`;

      const aiResponse = await this.getOpenAI().chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: parsePrompt }],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      });

      const content = aiResponse.choices[0]?.message?.content;
      if (!content) return null;

      const parsed = JSON.parse(content);
      if (!parsed.found || !parsed.imdbId) return null;

      // Get detailed info from IMDB page
      const details = await this.getIMDbDetails(parsed.imdbId);

      const finalTitle = details?.title || parsed.title;

      // Double-check: validate that the returned title is similar to the search query
      // This prevents the AI from returning completely wrong movies
      if (!this.isTitleSimilar(title, finalTitle)) {
        console.log(`  IMDB validation failed: "${finalTitle}" doesn't match search "${title}"`);
        return null;
      }

      return {
        imdbId: parsed.imdbId,
        title: finalTitle,
        year: details?.year || parsed.year,
        rating: details?.rating || 0,
        type: parsed.type,
        posterUrl: details?.posterUrl,
      };
    } catch (error) {
      console.error('IMDB search failed:', error instanceof Error ? error.message : error);
      return null;
    }
  }

  /**
   * Check if two titles are similar enough to be considered a match
   */
  private isTitleSimilar(searchTitle: string, resultTitle: string): boolean {
    const normalize = (t: string) => t
      .toLowerCase()
      .replace(/&amp;/g, '&')
      .replace(/&apos;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/^the\s+/i, '')
      .replace(/,\s*the$/i, '')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const n1 = normalize(searchTitle);
    const n2 = normalize(resultTitle);

    // Exact match after normalization
    if (n1 === n2) return true;

    // Check if one contains the other (for cases like "Dune" vs "Dune: Part One")
    if (n1.includes(n2) || n2.includes(n1)) return true;

    // Check word overlap - at least 50% of words should match for longer titles
    const words1 = n1.split(' ').filter(w => w.length > 2);
    const words2 = n2.split(' ').filter(w => w.length > 2);

    if (words1.length === 0 || words2.length === 0) return false;

    const commonWords = words1.filter(w => words2.includes(w));
    const overlapRatio = commonWords.length / Math.min(words1.length, words2.length);

    return overlapRatio >= 0.5;
  }

  /**
   * Get detailed movie info from IMDB page
   */
  private async getIMDbDetails(imdbId: string): Promise<{ title: string; year: number; rating: number; posterUrl?: string } | null> {
    try {
      const url = `https://www.imdb.com/title/${imdbId}/`;
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 15000,
      });

      const html = response.data;

      // Extract JSON-LD data which contains structured movie info
      const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      if (jsonLdMatch) {
        try {
          const jsonLd = JSON.parse(jsonLdMatch[1]);

          // IMDB uses 'name' for original title, but we want English title
          // Try to find English title from the page title or alternateName
          let title = jsonLd.name || '';

          // Check if there's an alternate English name
          if (jsonLd.alternateName) {
            // alternateName is often the English title for foreign films
            title = jsonLd.alternateName;
          }

          // Also try to extract from page title: "Movie Name (Year) - IMDb"
          const pageTitleMatch = html.match(/<title>([^(]+)\s*\(\d{4}\)/);
          if (pageTitleMatch) {
            const pageTitle = this.decodeHtmlEntities(pageTitleMatch[1].trim());
            // Use page title if it's different and looks like English
            if (pageTitle && pageTitle !== title && /^[A-Za-z0-9\s:'\-&,.!?]+$/.test(pageTitle)) {
              title = pageTitle;
            }
          }

          return {
            title: this.decodeHtmlEntities(title),
            year: parseInt(jsonLd.datePublished?.substring(0, 4)) || 0,
            rating: parseFloat(jsonLd.aggregateRating?.ratingValue) || 0,
            posterUrl: jsonLd.image,
          };
        } catch {
          // JSON-LD parsing failed, continue with AI
        }
      }

      // Fallback: Use AI to parse the page
      const parsePrompt = `Extract movie details from this IMDB page HTML.

HTML snippet:
${html.substring(0, 15000)}

Extract:
1. Title
2. Year
3. IMDB Rating (out of 10)

Respond in JSON format only:
{
  "title": "Movie Title",
  "year": 2023,
  "rating": 7.5
}`;

      const aiResponse = await this.getOpenAI().chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: parsePrompt }],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      });

      const content = aiResponse.choices[0]?.message?.content;
      if (!content) return null;

      const parsed = JSON.parse(content);
      return {
        title: parsed.title,
        year: parsed.year,
        rating: parsed.rating,
      };
    } catch (error) {
      console.error('IMDB details fetch failed:', error instanceof Error ? error.message : error);
      return null;
    }
  }

  /**
   * Extract search results section from IMDB HTML
   */
  private extractSearchResults(html: string): string {
    // Try to find the search results section
    const resultsMatch = html.match(/find-title-result[\s\S]*?(?=<\/section>|$)/);
    if (resultsMatch) {
      return resultsMatch[0].substring(0, 10000);
    }

    // Fallback: just get a chunk around title results
    const titleIdx = html.indexOf('ipc-metadata-list');
    if (titleIdx > -1) {
      return html.substring(titleIdx, Math.min(titleIdx + 10000, html.length));
    }

    return html.substring(0, 15000);
  }

  /**
   * Decode HTML entities in a string
   */
  private decodeHtmlEntities(text: string): string {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
  }

  /**
   * Use LLM to intelligently determine if two titles refer to the same movie.
   * This handles cases like:
   * - "Transformers - Dark of the Moon" vs "Transformers: Dark of the Moon"
   * - Different punctuation, capitalization
   * - Subtitle variations
   * - Minor formatting differences
   */
  async areTitlesSameMovie(title1: string, title2: string, year?: number): Promise<{ isSame: boolean; confidence: number; reasoning?: string }> {
    const prompt = `Determine if these two strings refer to the SAME movie title.

Title 1: "${title1}"
Title 2: "${title2}"
${year ? `Expected Year: ${year}` : ''}

Consider:
- Punctuation differences (colon vs dash vs hyphen)
- Subtitle separators (: - — –)
- Minor spelling variations
- "The" prefix/suffix variations
- Numbering formats (2, II, Two)
- Translations or transliterations

IMPORTANT: Only return true if these titles clearly refer to the same specific movie.
Do NOT match different movies that happen to share some words.

Examples of SAME movie:
- "Transformers - Dark of the Moon" and "Transformers: Dark of the Moon" → SAME
- "Spider-Man: No Way Home" and "Spider-Man - No Way Home" → SAME
- "The Lord of the Rings: The Two Towers" and "Lord of the Rings: Two Towers" → SAME

Examples of DIFFERENT movies:
- "The Baker" and "Christmas at the Amish Bakery" → DIFFERENT
- "What If" and "What If: Aka Laow" → DIFFERENT (different movies/shows)
- "Dune" and "Dune: Part Two" → Could be DIFFERENT (sequels)

Respond in JSON format only:
{
  "isSame": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation"
}`;

    try {
      const response = await this.getOpenAI().chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return { isSame: false, confidence: 0 };
      }

      const parsed = JSON.parse(content);
      return {
        isSame: parsed.isSame ?? false,
        confidence: parsed.confidence ?? 0.5,
        reasoning: parsed.reasoning,
      };
    } catch (error) {
      console.error('LLM title matching failed:', error);
      return { isSame: false, confidence: 0 };
    }
  }

  /**
   * Analyze a folder to determine if it's a TV series
   */
  async analyzeFolder(folderName: string, fileNames: string[]): Promise<{ isTVSeries: boolean; seriesName?: string; confidence: number }> {
    const prompt = `Analyze this folder and its contents to determine if it's a TV series.

Folder name: "${folderName}"
Files inside:
${fileNames.slice(0, 20).map((f, i) => `${i + 1}. ${f}`).join('\n')}
${fileNames.length > 20 ? `... and ${fileNames.length - 20} more files` : ''}

Determine:
1. Is this a TV series folder with episodes?
2. What is the series name?
3. How confident are you?

Respond in JSON format only:
{
  "isTVSeries": true/false,
  "seriesName": "Name of the series" or null,
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation"
}`;

    try {
      const response = await this.getOpenAI().chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return { isTVSeries: false, confidence: 0.1 };
      }

      const parsed = JSON.parse(content);
      return {
        isTVSeries: parsed.isTVSeries ?? false,
        seriesName: parsed.seriesName || undefined,
        confidence: parsed.confidence ?? 0.5,
      };
    } catch (error) {
      console.error('AI folder analysis failed:', error);
      return { isTVSeries: false, confidence: 0.1 };
    }
  }
}
