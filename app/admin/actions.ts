'use server';

import { redirect } from 'next/navigation';
import { addAliasWith } from '@/lib/admin';
import { neonDb } from '@/lib/db';

export async function addAliasAction(formData: FormData) {
  const key = String(formData.get('key') ?? '');
  const alias = String(formData.get('alias') ?? '');
  const gymId = String(formData.get('gymId') ?? '');
  const result = await addAliasWith(neonDb(process.env.DATABASE_URL!), process.env.ADMIN_KEY, key, alias, gymId);
  if (!result.ok) throw new Error('alias was not added');
  redirect(`/admin?key=${encodeURIComponent(key)}&rematched=${result.rematched}`);
}
