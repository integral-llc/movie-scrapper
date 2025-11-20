import fs from 'fs';
import path from 'path';

export class FileRenamerService {
  renameFile(oldPath: string, newFileName: string): { success: boolean; newPath?: string; error?: string } {
    try {
      const directory = path.dirname(oldPath);
      const newPath = path.join(directory, newFileName);

      if (fs.existsSync(newPath)) {
        return {
          success: false,
          error: `File already exists: ${newPath}`,
        };
      }

      fs.renameSync(oldPath, newPath);

      return {
        success: true,
        newPath,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to rename file: ${oldPath}`, errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  fileExists(filePath: string): boolean {
    return fs.existsSync(filePath);
  }

  getFileStats(filePath: string): fs.Stats | null {
    try {
      return fs.statSync(filePath);
    } catch {
      return null;
    }
  }
}
