import { neonDb } from '@/lib/db';
import { getWeek } from '@/lib/week';

export async function GET() {
  const url = process.env.DATABASE_URL;
  if (!url) return Response.json({ error: 'DATABASE_URL is not set' }, { status: 500 });
  const week = await getWeek(neonDb(url), new Date());
  // Data changes three times a day; let the CDN serve it for ten minutes.
  return Response.json(week, { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=600' } });
}
