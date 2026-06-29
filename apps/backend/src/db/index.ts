import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

const pool = connectionString
  ? new Pool({
      connectionString,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    })
  : ({
      query: async () => {
        throw new Error('DATABASE_URL is not set');
      },
      end: async () => undefined,
    } as any);

export { pool };
export const db = drizzle(pool as any, { schema });
export { schema };
