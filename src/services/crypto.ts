import * as crypto from 'crypto';

const BCRYPT_ROUNDS = 12;

// Dynamic import bcryptjs (avoids issues with native bindings)
let bcryptjs: any = null;
async function getBcrypt() {
  if (!bcryptjs) bcryptjs = await import('bcryptjs');
  return bcryptjs;
}

export async function hashPassword(password: string): Promise<string> {
  const bcrypt = await getBcrypt();
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const bcrypt = await getBcrypt();
  return bcrypt.compare(password, hash);
}

export function hashPin(pin: string): string {
  return crypto.createHash('sha256').update(pin).digest('hex');
}

export function verifyPin(pin: string, hash: string): boolean {
  return hashPin(pin) === hash;
}

export function generateSecureToken(bytes = 64): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function encryptSSN(ssn: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(ssn, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSSN(encrypted: string, key: Buffer): string {
  const [ivHex, tagHex, dataHex] = encrypted.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(Buffer.from(dataHex, 'hex'), undefined, 'utf8') + decipher.final('utf8');
}
