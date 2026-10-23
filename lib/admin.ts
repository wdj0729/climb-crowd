import { timingSafeEqual } from 'node:crypto';
import type { Db } from './db';
import { GYMS } from './gyms/seed';
import { addAlias, rematchUnmatched } from './store';

export function isAdminKey(adminKey: string | undefined, key: string | undefined): boolean {
  if (!adminKey || !key) return false;
  const a = Buffer.from(adminKey);
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function addAliasWith(
  db: Db,
  adminKey: string | undefined,
  key: string,
  alias: string,
  gymId: string,
): Promise<{ ok: boolean; rematched: number }> {
  if (!isAdminKey(adminKey, key) || !alias.trim() || !GYMS.some((g) => g.id === gymId)) return { ok: false, rematched: 0 };
  await addAlias(db, alias, gymId);
  return { ok: true, rematched: await rematchUnmatched(db) };
}
