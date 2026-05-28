import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_UPLOAD_ROOT = path.join(process.cwd(), 'data', 'uploads');

export function getUploadRoot(): string {
  const configured = process.env.UPLOAD_ROOT || process.env.GGFC_STORAGE_ROOT;
  return configured?.trim() ? path.resolve(configured.trim()) : DEFAULT_UPLOAD_ROOT;
}

export function resolveStoragePath(...segments: string[]): string {
  const root = getUploadRoot();
  const resolved = path.resolve(root, ...segments);

  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error('Storage path escapes configured upload root');
  }

  return resolved;
}

export function ensureStorageRoot(): string {
  const root = getUploadRoot();
  fs.mkdirSync(root, { recursive: true });
  return root;
}
