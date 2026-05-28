import * as fs from 'fs';
import * as path from 'path';
import { ensureStorageRoot, resolveStoragePath } from './storage-root';

export function ensureStorageDir(): void {
  ensureStorageRoot();
}

export function saveFile(filename: string, buffer: Buffer): string {
  const filePath = resolveStoragePath(filename);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

export function readFile(filename: string): Buffer {
  const filePath = resolveStoragePath(filename);
  return fs.readFileSync(filePath);
}

export function fileExists(filename: string): boolean {
  return fs.existsSync(resolveStoragePath(filename));
}
