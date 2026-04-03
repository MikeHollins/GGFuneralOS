import * as fs from 'fs';
import * as path from 'path';

const STORAGE_DIR = path.join(process.cwd(), 'data', 'uploads');

export function ensureStorageDir(): void {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

export function saveFile(filename: string, buffer: Buffer): string {
  ensureStorageDir();
  const filePath = path.join(STORAGE_DIR, filename);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

export function readFile(filename: string): Buffer {
  const filePath = path.join(STORAGE_DIR, filename);
  return fs.readFileSync(filePath);
}

export function fileExists(filename: string): boolean {
  return fs.existsSync(path.join(STORAGE_DIR, filename));
}
