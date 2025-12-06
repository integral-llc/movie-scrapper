import axios from 'axios';
import { getConfig } from '../config/env.config';

// Kinopoisk Unofficial API for Russian movies/series
// Get API key from: https://kinopoiskapiunofficial.tech/

interface KinopoiskFilm {
    kinopoiskId: number;
    imdbId?: string;
    nameRu?: string;
    nameEn?: string;
    nameOriginal?: string;
    posterUrl?: string;
    posterUrlPreview?: string;
    ratingKinopoisk?: number;
    ratingImdb?: number;
    year?: number;
    type: 'FILM' | 'TV_SERIES' | 'TV_SHOW' | 'MINI_SERIES' | 'ALL';
    description?: string;
    countries?: { country: string }[];
    genres?: { genre: string }[];
}

interface KinopoiskSearchResponse {
    keyword: string;
    pagesCount: number;
    films: KinopoiskFilm[];
    searchFilmsCountResult: number;
}

export interface KinopoiskData {
    kinopoiskId: number;
    title: string;           // Russian title (nameRu)
    originalTitle?: string;  // Original title
    year: number;
    rating?: number;         // Kinopoisk rating
    imdbRating?: number;
    type: string;
}

export class KinopoiskService {
    private readonly baseUrl = 'https://kinopoiskapiunofficial.tech/api';
    
    private getApiKey(): string {
        const config = getConfig();
        // @ts-ignore - kinopoiskApiKey may not be in EnvConfig yet
        return config.kinopoiskApiKey || process.env.KINOPOISK_API_KEY || '';
    }
    
    /**
     * Search for films/series by keyword
     */
    async searchByKeyword(keyword: string): Promise<KinopoiskData | null> {
        const apiKey = this.getApiKey();
        if (!apiKey) {
            console.log('    ⚠️ Kinopoisk API key not configured');
            return null;
        }
        
        try {
            console.log(`🎬 Kinopoisk search: "${keyword}"`);
            
            const response = await axios.get<KinopoiskSearchResponse>(
                `${this.baseUrl}/v2.1/films/search-by-keyword`,
                {
                    params: { keyword, page: 1 },
                    headers: {
                        'X-API-KEY': apiKey,
                        'Content-Type': 'application/json',
                    },
                }
            );
            
            const films = response.data.films;
            if (!films || films.length === 0) {
                console.log('    ✗ No Kinopoisk results found');
                return null;
            }
            
            // Find best match (prefer exact Russian title match)
            const best = films[0];
            
            console.log(`    ✓ Found on Kinopoisk: "${best.nameRu}" (${best.year})`);
            
            return {
                kinopoiskId: best.kinopoiskId,
                title: best.nameRu || best.nameOriginal || best.nameEn || keyword,
                originalTitle: best.nameOriginal,
                year: best.year || new Date().getFullYear(),
                rating: best.ratingKinopoisk,
                imdbRating: best.ratingImdb,
                type: best.type,
            };
        } catch (error: any) {
            if (error.response?.status === 401) {
                console.log('    ✗ Kinopoisk API key invalid');
            } else if (error.response?.status === 402) {
                console.log('    ✗ Kinopoisk API limit exceeded');
            } else {
                console.log(`    ✗ Kinopoisk API error: ${error.message}`);
            }
            return null;
        }
    }
    
    /**
     * Search for TV series specifically
     */
    async searchTVSeries(keyword: string): Promise<KinopoiskData | null> {
        const apiKey = this.getApiKey();
        if (!apiKey) {
            return null;
        }
        
        try {
            console.log(`📺 Kinopoisk TV search: "${keyword}"`);
            
            const response = await axios.get<{ items: KinopoiskFilm[], total: number }>(
                `${this.baseUrl}/v2.2/films`,
                {
                    params: {
                        keyword,
                        type: 'TV_SERIES',
                        page: 1,
                    },
                    headers: {
                        'X-API-KEY': apiKey,
                        'Content-Type': 'application/json',
                    },
                }
            );
            
            const items = response.data.items;
            if (!items || items.length === 0) {
                console.log('    ✗ No Kinopoisk TV results found');
                return null;
            }
            
            const best = items[0];
            
            console.log(`    ✓ Found TV on Kinopoisk: "${best.nameRu}" (${best.year})`);
            
            return {
                kinopoiskId: best.kinopoiskId,
                title: best.nameRu || best.nameOriginal || best.nameEn || keyword,
                originalTitle: best.nameOriginal,
                year: best.year || new Date().getFullYear(),
                rating: best.ratingKinopoisk,
                imdbRating: best.ratingImdb,
                type: best.type,
            };
        } catch (error: any) {
            console.log(`    ✗ Kinopoisk TV search error: ${error.message}`);
            return null;
        }
    }
    
    /**
     * Get film details by Kinopoisk ID
     */
    async getFilmDetails(kinopoiskId: number): Promise<KinopoiskFilm | null> {
        const apiKey = this.getApiKey();
        if (!apiKey) {
            return null;
        }
        
        try {
            const response = await axios.get<KinopoiskFilm>(
                `${this.baseUrl}/v2.2/films/${kinopoiskId}`,
                {
                    headers: {
                        'X-API-KEY': apiKey,
                        'Content-Type': 'application/json',
                    },
                }
            );
            
            return response.data;
        } catch (error) {
            return null;
        }
    }
}
