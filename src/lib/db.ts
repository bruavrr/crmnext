import { config } from "dotenv";
config({ path: process.env.DOTENV_CONFIG_PATH || ".env.local", quiet: true });
config({ quiet: true });
import { Pool, PoolClient } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
const globalDb = globalThis as typeof globalThis & { crmPool?: Pool };
export const pool =
  globalDb.crmPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
  });
globalDb.crmPool = pool;
export const db = drizzle(pool);
export async function transaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const result = await fn(c);
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
