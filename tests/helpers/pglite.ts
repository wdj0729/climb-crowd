import { PGlite } from '@electric-sql/pglite';
import { migrate, type Db } from '@/lib/db';

export async function testDb(): Promise<Db> {
  const pg = new PGlite();
  const db: Db = {
    async query<T>(text: string, params: unknown[] = []) {
      const res = await pg.query<T>(text, params);
      return res.rows;
    },
  };
  await migrate(db);
  return db;
}
