import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL environment variable is required');

export const sql = neon(DATABASE_URL);

/** Run a parameterized query and return rows */
export async function query<T = Record<string, any>>(
  text: string,
  params: any[] = []
): Promise<T[]> {
  const rows = await sql(text, params);
  return rows as T[];
}

/** Run a parameterized query and return the first row or null */
export async function queryOne<T = Record<string, any>>(
  text: string,
  params: any[] = []
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
