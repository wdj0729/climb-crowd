import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { isAdminKey } from '@/lib/admin';
import { neonDb } from '@/lib/db';
import { GYMS } from '@/lib/gyms/seed';
import { listUnmatched } from '@/lib/store';
import { addAliasAction } from './actions';

const gymOptions = [...GYMS].sort((a, b) => a.name.localeCompare(b.name, 'ko'));

export default function AdminPage({ searchParams }: PageProps<'/admin'>) {
  return (
    <Suspense fallback={<main className="px-4 py-6 text-sm opacity-60">불러오는 중…</main>}>
      <AdminContent searchParams={searchParams} />
    </Suspense>
  );
}

async function AdminContent({ searchParams }: Pick<PageProps<'/admin'>, 'searchParams'>) {
  const params = await searchParams;
  const key = typeof params.key === 'string' ? params.key : undefined;
  if (!isAdminKey(process.env.ADMIN_KEY, key)) notFound();

  const unmatched = await listUnmatched(neonDb(process.env.DATABASE_URL!), new Date());
  const rematched = typeof params.rematched === 'string' ? params.rematched : null;

  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <h1 className="text-xl font-bold">암장을 못 찾은 정모 장소</h1>
      <p className="text-sm opacity-70">
        다가오는 정모 중 암장에 연결되지 않은 장소/제목이에요. 암장을 고르면 별칭으로 저장되고, 같은 이름의 정모가 다시 연결돼요.
      </p>
      {rematched && <p className="text-sm font-medium text-[#e4572e]">저장했어요. 정모 {rematched}개가 새로 연결됐어요.</p>}
      <ul className="divide-y divide-black/10 dark:divide-white/15">
        {unmatched.map((u) => (
          <li key={u.text} className="py-2">
            <form action={addAliasAction} className="flex flex-wrap items-center gap-2 text-sm">
              <input type="hidden" name="key" value={key} />
              <input type="hidden" name="alias" value={u.text} />
              <a href={u.exampleUrl} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate underline-offset-2 hover:underline">
                {u.text} <span className="opacity-60">({u.count})</span>
              </a>
              <select name="gymId" required defaultValue="" className="max-w-48 rounded border border-black/15 bg-transparent px-1 py-1 dark:border-white/20">
                <option value="" disabled>암장 선택</option>
                {gymOptions.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <button type="submit" className="rounded bg-[#e4572e] px-2 py-1 text-white">연결</button>
            </form>
          </li>
        ))}
      </ul>
      {unmatched.length === 0 && <p className="text-sm opacity-60">연결 안 된 정모가 없어요.</p>}
    </main>
  );
}
