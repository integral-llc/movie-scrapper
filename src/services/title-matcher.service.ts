import OpenAI from 'openai';
import { getConfig } from '../config/env.config';

/**
 * Result from a title match operation
 */
export interface TitleMatchResult {
  isMatch: boolean;
  confidence: number;
  method: 'exact' | 'normalized' | 'fuzzy' | 'llm';
  reasoning?: string;
}

/**
 * Options for title matching
 */
export interface TitleMatchOptions {
  year?: number;
  useLLM?: boolean;
  llmConfidenceThreshold?: number;
}

/**
 * TitleMatcherService - DRY/SOLID approach to movie title matching
 *
 * This service provides multiple strategies for comparing movie titles:
 * 1. Exact match - direct string comparison
 * 2. Normalized match - after cleaning punctuation, case, etc.
 * 3. Fuzzy match - word overlap analysis
 * 4. LLM match - intelligent AI-based comparison for edge cases
 *
 * Each method is isolated and testable independently.
 */
export class TitleMatcherService {
  private openai: OpenAI | null = null;

  /**
   * Get OpenAI client (lazy initialization)
   */
  private getOpenAI(): OpenAI {
    if (!this.openai) {
      this.openai = new OpenAI({
        apiKey: getConfig().openaiApiKey,
      });
    }
    return this.openai;
  }

  /**
   * Main entry point: Check if two titles refer to the same movie
   * Tries multiple strategies in order of cost/speed
   */
  async areSameMovie(
    title1: string,
    title2: string,
    options: TitleMatchOptions = {}
  ): Promise<TitleMatchResult> {
    const { useLLM = true, llmConfidenceThreshold = 0.7 } = options;

    // Strategy 1: Exact match (fastest)
    if (this.isExactMatch(title1, title2)) {
      return {
        isMatch: true,
        confidence: 1.0,
        method: 'exact',
        reasoning: 'Exact string match',
      };
    }

    // Strategy 2: Normalized match (fast)
    const normalizedResult = this.isNormalizedMatch(title1, title2);
    if (normalizedResult.isMatch) {
      return normalizedResult;
    }

    // Strategy 3: Fuzzy match (fast)
    const fuzzyResult = this.isFuzzyMatch(title1, title2);
    if (fuzzyResult.isMatch && fuzzyResult.confidence >= 0.8) {
      return fuzzyResult;
    }

    // Strategy 4: LLM match (slower, but handles edge cases)
    if (useLLM) {
      const llmResult = await this.isLLMMatch(title1, title2, options.year);
      if (llmResult.isMatch && llmResult.confidence >= llmConfidenceThreshold) {
        return llmResult;
      }
      // Return LLM result even if not a match (for debugging/logging)
      return llmResult;
    }

    // No match found
    return {
      isMatch: false,
      confidence: fuzzyResult.confidence,
      method: 'fuzzy',
      reasoning: `No match: "${title1}" vs "${title2}"`,
    };
  }

  /**
   * Strategy 1: Exact string match
   */
  isExactMatch(title1: string, title2: string): boolean {
    return title1 === title2;
  }

  /**
   * Strategy 2: Normalized match
   * Handles: punctuation differences, case, "The" prefix/suffix, extra spaces
   */
  isNormalizedMatch(title1: string, title2: string): TitleMatchResult {
    const n1 = this.normalize(title1);
    const n2 = this.normalize(title2);

    if (n1 === n2) {
      return {
        isMatch: true,
        confidence: 0.95,
        method: 'normalized',
        reasoning: `Normalized match: "${n1}"`,
      };
    }

    // Check if one contains the other (handles subtitle variations)
    // BUT: be careful not to match "Alien" with "Aliens" (plurals are different movies)
    if (n1.includes(n2) || n2.includes(n1)) {
      const shorter = n1.length < n2.length ? n1 : n2;
      const longer = n1.length < n2.length ? n2 : n1;
      const ratio = shorter.length / longer.length;

      // Avoid matching singular vs plural (e.g., "Alien" vs "Aliens")
      // If they differ only by an 's' at the end, don't match
      const isSingularVsPlural =
        longer === shorter + 's' || longer === shorter + 'es';

      if (ratio >= 0.7 && !isSingularVsPlural) {
        return {
          isMatch: true,
          confidence: 0.85,
          method: 'normalized',
          reasoning: `Partial match: one title contains the other`,
        };
      }
    }

    return {
      isMatch: false,
      confidence: 0,
      method: 'normalized',
    };
  }

  /**
   * Strategy 3: Fuzzy match using word overlap
   */
  isFuzzyMatch(title1: string, title2: string): TitleMatchResult {
    const words1 = this.extractSignificantWords(title1);
    const words2 = this.extractSignificantWords(title2);

    if (words1.length === 0 || words2.length === 0) {
      return { isMatch: false, confidence: 0, method: 'fuzzy' };
    }

    const commonWords = words1.filter(w => words2.includes(w));
    const minWords = Math.min(words1.length, words2.length);
    const maxWords = Math.max(words1.length, words2.length);

    // Calculate overlap ratio
    const overlapRatio = commonWords.length / minWords;

    // Penalize if there's a big difference in word count
    const lengthPenalty = minWords / maxWords;

    const confidence = overlapRatio * lengthPenalty;

    return {
      isMatch: confidence >= 0.8,
      confidence,
      method: 'fuzzy',
      reasoning: `Word overlap: ${commonWords.length}/${minWords} words match (${(confidence * 100).toFixed(0)}%)`,
    };
  }

  /**
   * Strategy 4: LLM-based intelligent matching
   * Handles: punctuation variants (colon vs dash), subtitle separators, translations
   */
  async isLLMMatch(
    title1: string,
    title2: string,
    year?: number
  ): Promise<TitleMatchResult> {
    const prompt = `Determine if these two strings refer to the SAME movie title.

Title 1: "${title1}"
Title 2: "${title2}"
${year ? `Expected Year: ${year}` : ''}

Consider:
- Punctuation differences (colon vs dash vs hyphen: ":" "-" "–" "—")
- Subtitle separators may vary
- Minor spelling variations
- "The" prefix/suffix variations
- Numbering formats (2, II, Two)

IMPORTANT: Only return true if these titles clearly refer to the same specific movie.
Do NOT match different movies that happen to share some words.

Examples of SAME movie:
- "Transformers - Dark of the Moon" and "Transformers: Dark of the Moon" → SAME
- "Spider-Man: No Way Home" and "Spider-Man - No Way Home" → SAME
- "The Lord of the Rings: The Two Towers" and "Lord of the Rings: Two Towers" → SAME

Examples of DIFFERENT movies:
- "The Baker" and "Christmas at the Amish Bakery" → DIFFERENT
- "Dune" and "Dune: Part Two" → DIFFERENT (they are sequels)

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
        return { isMatch: false, confidence: 0, method: 'llm', reasoning: 'No LLM response' };
      }

      const parsed = JSON.parse(content);
      return {
        isMatch: parsed.isSame ?? false,
        confidence: parsed.confidence ?? 0.5,
        method: 'llm',
        reasoning: parsed.reasoning,
      };
    } catch (error) {
      console.error('LLM title matching failed:', error);
      return {
        isMatch: false,
        confidence: 0,
        method: 'llm',
        reasoning: `LLM error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Normalize a title for comparison
   * Removes punctuation, normalizes whitespace, handles "The" prefix/suffix
   */
  normalize(title: string): string {
    return title
      .toLowerCase()
      // Decode HTML entities
      .replace(/&amp;/g, '&')
      .replace(/&apos;/g, "'")
      .replace(/&#39;/g, "'")
      // Remove accented characters (normalize é -> e, ü -> u, etc)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      // Remove "The" prefix or suffix
      .replace(/^the\s+/i, '')
      .replace(/,\s*the$/i, '')
      // Replace all punctuation with spaces (catches : - – — etc)
      .replace(/[^\w\s]/g, ' ')
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Extract significant words from a title (ignoring short words)
   */
  extractSignificantWords(title: string): string[] {
    return this.normalize(title)
      .split(' ')
      .filter(word => word.length > 2);
  }
}
