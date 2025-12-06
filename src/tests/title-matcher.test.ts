/**
 * Unit Tests for TitleMatcherService
 *
 * IMPORTANT: These tests call the REAL LLM (no mocking!)
 * This ensures the matching logic actually works in production.
 *
 * Run with: npx ts-node src/tests/title-matcher.test.ts
 */

import { TitleMatcherService } from '../services/title-matcher.service';
import { initConfig } from '../config/env.config';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const matcher = new TitleMatcherService();

interface TestCase {
  title1: string;
  title2: string;
  expectedMatch: boolean;
  description: string;
  year?: number;
}

// Test cases organized by category
const testCases: TestCase[] = [
  // === PUNCTUATION VARIATIONS (should match) ===
  {
    title1: 'Transformers - Dark of the Moon',
    title2: 'Transformers: Dark of the Moon',
    expectedMatch: true,
    description: 'Dash vs colon separator',
    year: 2011,
  },
  {
    title1: 'Spider-Man: No Way Home',
    title2: 'Spider-Man - No Way Home',
    expectedMatch: true,
    description: 'Colon vs dash separator',
    year: 2021,
  },
  {
    title1: 'Mission: Impossible – Dead Reckoning',
    title2: 'Mission Impossible - Dead Reckoning',
    expectedMatch: true,
    description: 'En-dash vs hyphen, with/without colon',
    year: 2023,
  },
  {
    title1: "Pirates of the Caribbean: At World's End",
    title2: "Pirates of the Caribbean - At World's End",
    expectedMatch: true,
    description: 'Long title with colon vs dash',
    year: 2007,
  },

  // === CASE AND SPACING (should match) ===
  {
    title1: 'THE DARK KNIGHT',
    title2: 'The Dark Knight',
    expectedMatch: true,
    description: 'All caps vs title case',
    year: 2008,
  },
  {
    title1: 'Star  Wars',
    title2: 'Star Wars',
    expectedMatch: true,
    description: 'Extra space',
    year: 1977,
  },

  // === "THE" PREFIX/SUFFIX (should match) ===
  {
    title1: 'The Lord of the Rings: The Two Towers',
    title2: 'Lord of the Rings: Two Towers',
    expectedMatch: true,
    description: 'With/without "The"',
    year: 2002,
  },
  {
    title1: 'Batman, The',
    title2: 'The Batman',
    expectedMatch: true,
    description: '"The" as suffix vs prefix',
    year: 2022,
  },

  // === NUMBERING FORMATS (should match) ===
  {
    title1: 'John Wick: Chapter 2',
    title2: 'John Wick: Chapter Two',
    expectedMatch: true,
    description: 'Number vs word (2 vs Two)',
    year: 2017,
  },
  {
    title1: 'Rocky II',
    title2: 'Rocky 2',
    expectedMatch: true,
    description: 'Roman numeral vs arabic',
    year: 1979,
  },

  // === DIFFERENT MOVIES (should NOT match) ===
  {
    title1: 'Dune',
    title2: 'Dune: Part Two',
    expectedMatch: false,
    description: 'Original vs sequel',
    year: 2021,
  },
  {
    title1: 'The Baker',
    title2: 'Christmas at the Amish Bakery',
    expectedMatch: false,
    description: 'Completely different movies',
  },
  {
    title1: 'Avatar',
    title2: 'Avatar: The Way of Water',
    expectedMatch: false,
    description: 'Original vs sequel',
    year: 2009,
  },
  {
    title1: 'Alien',
    title2: 'Aliens',
    expectedMatch: false,
    description: 'Original vs sequel (singular vs plural)',
    year: 1979,
  },
  {
    title1: 'Fast & Furious',
    title2: 'The Fast and the Furious',
    expectedMatch: false,
    description: 'Different entries in franchise',
  },

  // === SUBTITLE VARIATIONS (should match) ===
  {
    title1: 'Avengers: Infinity War',
    title2: 'Avengers - Infinity War',
    expectedMatch: true,
    description: 'Colon vs dash in subtitle',
    year: 2018,
  },
  {
    title1: 'Star Wars: Episode IV - A New Hope',
    title2: 'Star Wars Episode IV A New Hope',
    expectedMatch: true,
    description: 'With/without punctuation separators',
    year: 1977,
  },

  // === SPECIAL CHARACTERS (should match) ===
  {
    title1: "Harry Potter and the Philosopher's Stone",
    title2: "Harry Potter and the Philosopher's Stone",
    expectedMatch: true,
    description: 'Apostrophe handling',
    year: 2001,
  },
  {
    title1: 'Amélie',
    title2: 'Amelie',
    expectedMatch: true,
    description: 'Accented characters',
    year: 2001,
  },

  // === REAL PROBLEMATIC CASES (from production) ===
  {
    title1: 'Predator Badlands',
    title2: 'Predator: Badlands',
    expectedMatch: true,
    description: 'Missing colon in filename',
    year: 2025,
  },
  {
    title1: 'Fairy Tail Phoenix Priestess',
    title2: 'Fairy Tail: Phoenix Priestess',
    expectedMatch: true,
    description: 'Anime with missing colon',
    year: 2012,
  },
];

async function runTests(): Promise<void> {
  // Initialize config to load API keys from AWS Secrets Manager
  await initConfig();

  console.log('=' .repeat(70));
  console.log('TitleMatcherService Unit Tests (REAL LLM CALLS - NO MOCKS)');
  console.log('=' .repeat(70));
  console.log('');

  let passed = 0;
  let failed = 0;
  const failures: { test: TestCase; result: any }[] = [];

  for (const test of testCases) {
    process.stdout.write(`Testing: ${test.description}... `);

    try {
      const result = await matcher.areSameMovie(test.title1, test.title2, {
        year: test.year,
        useLLM: true,
        llmConfidenceThreshold: 0.7,
      });

      const testPassed = result.isMatch === test.expectedMatch;

      if (testPassed) {
        console.log(`✓ PASS (method: ${result.method}, confidence: ${(result.confidence * 100).toFixed(0)}%)`);
        passed++;
      } else {
        console.log(`✗ FAIL`);
        console.log(`    Expected: ${test.expectedMatch ? 'MATCH' : 'NO MATCH'}`);
        console.log(`    Got:      ${result.isMatch ? 'MATCH' : 'NO MATCH'} (${result.method}, ${(result.confidence * 100).toFixed(0)}%)`);
        console.log(`    Title1:   "${test.title1}"`);
        console.log(`    Title2:   "${test.title2}"`);
        console.log(`    Reason:   ${result.reasoning || 'N/A'}`);
        failed++;
        failures.push({ test, result });
      }
    } catch (error) {
      console.log(`✗ ERROR: ${error instanceof Error ? error.message : error}`);
      failed++;
      failures.push({ test, result: { error } });
    }
  }

  console.log('');
  console.log('=' .repeat(70));
  console.log(`Results: ${passed} passed, ${failed} failed out of ${testCases.length} tests`);
  console.log('=' .repeat(70));

  if (failures.length > 0) {
    console.log('');
    console.log('Failed tests:');
    for (const { test, result } of failures) {
      console.log(`  - ${test.description}: "${test.title1}" vs "${test.title2}"`);
    }
  }

  // Exit with error code if any tests failed
  process.exit(failed > 0 ? 1 : 0);
}

// Also export individual test functions for granular testing
export async function testNormalization(): Promise<void> {
  console.log('Testing normalize() function:');
  const cases = [
    { input: 'Transformers - Dark of the Moon', expected: 'transformers dark of the moon' },
    { input: 'Transformers: Dark of the Moon', expected: 'transformers dark of the moon' },
    { input: 'THE DARK KNIGHT', expected: 'dark knight' },
    { input: "Harry Potter and the Philosopher's Stone", expected: 'harry potter and philosopher s stone' },
  ];

  for (const { input, expected } of cases) {
    const result = matcher.normalize(input);
    const passed = result === expected;
    console.log(`  ${passed ? '✓' : '✗'} "${input}" -> "${result}" (expected: "${expected}")`);
  }
}

export async function testFuzzyMatch(): Promise<void> {
  console.log('Testing isFuzzyMatch():');
  const cases = [
    { title1: 'The Dark Knight Rises', title2: 'Dark Knight Rises', expectedMatch: true },
    { title1: 'Transformers Dark Moon', title2: 'Transformers Dark of the Moon', expectedMatch: true },
    { title1: 'Avatar', title2: 'The Way of Water', expectedMatch: false },
  ];

  for (const { title1, title2, expectedMatch } of cases) {
    const result = matcher.isFuzzyMatch(title1, title2);
    const passed = result.isMatch === expectedMatch;
    console.log(`  ${passed ? '✓' : '✗'} "${title1}" vs "${title2}" -> ${result.isMatch} (confidence: ${(result.confidence * 100).toFixed(0)}%)`);
  }
}

export async function testSingleCase(title1: string, title2: string, year?: number): Promise<void> {
  console.log(`Testing: "${title1}" vs "${title2}"`);
  const result = await matcher.areSameMovie(title1, title2, { year, useLLM: true });
  console.log(`  Result: ${result.isMatch ? 'MATCH' : 'NO MATCH'}`);
  console.log(`  Method: ${result.method}`);
  console.log(`  Confidence: ${(result.confidence * 100).toFixed(0)}%`);
  console.log(`  Reasoning: ${result.reasoning || 'N/A'}`);
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}
