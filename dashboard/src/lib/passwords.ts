import bcrypt from 'bcryptjs';
import { createHash } from 'crypto';

const BCRYPT_ROUNDS = 12;

export function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function hashPin(pin: string) {
  return createHash('sha256').update(pin).digest('hex');
}

export function verifyPin(pin: string, hash: string) {
  return hashPin(pin) === hash;
}

export function hashInviteToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
