import { describe, expect, it } from 'vitest';
import { addAliasWith } from '@/lib/admin';
import { getExtraAliases, syncGroupMeetups, upsertGroup } from '@/lib/store';
import { testDb } from './helpers/pglite';

async function seeded() {
  const db = await testDb();
  await upsertGroup(db, { source: 'somoim', externalId: 'g', name: 'G', url: 'u' });
  await syncGroupMeetups(db, 'somoim', 'g', [{
    source: 'somoim', externalId: 'm', groupExternalId: 'g', title: 'x', startsAt: new Date('2030-01-01T10:00:00Z'), participants: 3,
    capacity: null, placeText: '신촌해변암장', placeLat: null, placeLon: null, url: 'u', gymId: null,
  }], new Date('2026-10-23T00:00:00Z'));
  return db;
}

describe('addAliasWith', () => {
  it('rejects a wrong key without touching the db', async () => {
    const db = await seeded();
    expect(await addAliasWith(db, 'secret', 'nope', '신촌해변암장', 'peakers-sinchon')).toEqual({ ok: false, rematched: 0 });
    expect(await getExtraAliases(db)).toEqual({});
  });

  it('rejects an unconfigured admin key', async () => {
    const db = await seeded();
    expect(await addAliasWith(db, undefined, '', '신촌해변암장', 'peakers-sinchon')).toEqual({ ok: false, rematched: 0 });
  });

  it('rejects an unknown gym', async () => {
    const db = await seeded();
    expect(await addAliasWith(db, 'secret', 'secret', '신촌해변암장', 'no-such-gym')).toEqual({ ok: false, rematched: 0 });
  });

  it('adds the alias and rematches', async () => {
    const db = await seeded();
    expect(await addAliasWith(db, 'secret', 'secret', '신촌해변암장', 'peakers-sinchon')).toEqual({ ok: true, rematched: 1 });
  });
});
