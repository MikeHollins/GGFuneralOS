import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { query } from '../db/client';

const UPLOAD_ROOT = path.join(process.cwd(), 'data', 'uploads');

const FILE_LIMITS: Record<string, number> = {
  photo: 10 * 1024 * 1024,       // 10MB
  video: 100 * 1024 * 1024,      // 100MB
  voice_note: 25 * 1024 * 1024,  // 25MB
  document: 20 * 1024 * 1024,    // 20MB
  pdf: 20 * 1024 * 1024,         // 20MB
};

const MIME_TO_TYPE: Record<string, string> = {
  'image/jpeg': 'photo', 'image/png': 'photo', 'image/heic': 'photo', 'image/webp': 'photo',
  'video/mp4': 'video', 'video/quicktime': 'video', 'video/webm': 'video',
  'audio/mpeg': 'voice_note', 'audio/mp4': 'voice_note', 'audio/ogg': 'voice_note', 'audio/wav': 'voice_note',
  'application/pdf': 'pdf',
};

export function getCaseUploadDir(caseId: string): string {
  const dir = path.join(UPLOAD_ROOT, caseId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function classifyFileType(mimeType: string): string {
  return MIME_TO_TYPE[mimeType] || 'document';
}

export function getFileLimit(fileType: string): number {
  return FILE_LIMITS[fileType] || FILE_LIMITS.document;
}

export async function saveUploadedFile(
  caseId: string,
  buffer: Buffer,
  originalName: string,
  mimeType: string,
  uploadedBy: string
): Promise<{ fileId: string; storagePath: string }> {
  const fileType = classifyFileType(mimeType);
  const ext = path.extname(originalName) || '.bin';
  const filename = `${crypto.randomUUID()}${ext}`;
  const dir = getCaseUploadDir(caseId);
  const storagePath = path.join(dir, filename);

  fs.writeFileSync(storagePath, buffer);

  const rows = await query(
    `INSERT INTO case_files (case_id, file_type, filename, original_name, mime_type, file_size, storage_path, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [caseId, fileType, filename, originalName, mimeType, buffer.length, storagePath, uploadedBy]
  );

  const fileId = (rows[0] as any).id;
  console.log(`[uploads] Saved ${fileType}: ${originalName} (${buffer.length} bytes) → ${storagePath}`);
  return { fileId, storagePath };
}

export async function getCaseFiles(caseId: string, fileType?: string) {
  let sql = 'SELECT * FROM case_files WHERE case_id = $1';
  const params: any[] = [caseId];
  if (fileType) { sql += ' AND file_type = $2'; params.push(fileType); }
  sql += ' ORDER BY sort_order, created_at';
  return query(sql, params);
}

export function readUploadedFile(storagePath: string): Buffer {
  return fs.readFileSync(storagePath);
}
