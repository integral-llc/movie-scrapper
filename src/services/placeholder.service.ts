import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

export class PlaceholderService {
  private placeholderPath: string;

  constructor() {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.placeholderPath = path.join(dataDir, 'tv-series-placeholder.jpg');
  }

  /**
   * Get or generate the TV series placeholder image
   */
  async getPlaceholder(): Promise<string> {
    if (fs.existsSync(this.placeholderPath)) {
      return this.placeholderPath;
    }

    // Generate a 400x600 placeholder image with TV series icon
    const svg = `
      <svg width="400" height="600" xmlns="http://www.w3.org/2000/svg">
        <rect width="400" height="600" fill="#1a1a1a"/>
        <rect x="50" y="150" width="300" height="200" rx="10" fill="#333"/>
        <rect x="80" y="180" width="240" height="140" fill="#0a0a0a"/>
        <circle cx="200" cy="250" r="40" fill="#e50914"/>
        <text x="200" y="420" font-family="Arial, sans-serif" font-size="24" fill="#888" text-anchor="middle">TV SERIES</text>
        <text x="200" y="460" font-family="Arial, sans-serif" font-size="16" fill="#666" text-anchor="middle">No Poster Available</text>
      </svg>
    `;

    await sharp(Buffer.from(svg))
      .jpeg({ quality: 80 })
      .toFile(this.placeholderPath);

    return this.placeholderPath;
  }
}
