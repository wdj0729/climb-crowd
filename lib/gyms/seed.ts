import seoulGyms from './seoul-gyms.json';

export interface Brand {
  id: string;
  name: string;
  aliases: string[];
}

export interface Gym {
  id: string;
  brandId: string | null;
  name: string;
  branch: string | null;
  branchAliases: string[];
  extraAliases: string[];
  address: string;
  lat: number;
  lon: number;
  /** Where the address and coordinates were checked. */
  source: string;
}

export const BRANDS: Brand[] = [
  { id: 'theclimb', name: '더클라임', aliases: ['더클라임', '더클', 'theclimb'] },
  { id: 'climbingpark', name: '클라이밍파크', aliases: ['클라이밍파크', '클팍', 'climbingpark'] },
  { id: 'seoulforest', name: '서울숲클라이밍', aliases: ['서울숲클라이밍', '서울숲'] },
  { id: 'peakers', name: '피커스', aliases: ['피커스클라이밍', '피커스', 'peakers'] },
  { id: 'sonsangwon', name: '손상원클라이밍짐', aliases: ['손상원클라이밍짐', '손상원클라이밍', '손상원'] },
  { id: 'alle', name: '알레클라이밍', aliases: ['알레클라이밍', '알레클라임', '알레'] },
  { id: 'monkeys', name: '몽키즈클라이밍', aliases: ['몽키즈클라이밍', '몽키즈'] },
  { id: 'damjang', name: '담장', aliases: ['담장클라이밍', '담장'] },
  { id: 'seoulboulders', name: '서울볼더스', aliases: ['서울볼더스'] },
  { id: 'onflick', name: '온플릭', aliases: ['온플릭클라이밍', '온플릭'] },
  { id: 'blackyak', name: '블랙야크', aliases: ['블랙야크', '야크돔'] },
  { id: 'twoyears', name: '투이얼즈 클라임 하우스', aliases: ['투이얼즈클라임하우스', '투이얼즈'] },
  { id: 'stonz', name: '스톤즈', aliases: ['스톤즈클라이밍', '스톤즈'] },
  { id: 'redpoint', name: '레드포인트클라이밍', aliases: ['레드포인트클라이밍', '레드포인트'] },
  { id: 'boulderlife', name: '볼더생활', aliases: ['볼더생활'] },
  { id: 'koala', name: '코알라', aliases: ['코알라클라이밍짐', '코알라클라이밍', '코알라'] },
  { id: 'groot', name: '그루트', aliases: ['그루트클라이밍', '그루트'] },
  { id: 'hook', name: '훅클라이밍', aliases: ['훅클라이밍', '훅클'] },
  { id: 'dotclimb', name: '닷클라임', aliases: ['닷클라이밍짐', '닷클라임', '닷클라이밍'] },
  { id: 'offthewall', name: '오프더월', aliases: ['오프더월클라이밍', '오프더월'] },
  { id: 'cracker', name: '크래커클라이밍', aliases: ['크래커클라이밍', '크래커'] },
];

interface SeedRow {
  id: string;
  brandId: string | null;
  name: string;
  branch: string | null;
  address: string;
  lat: number;
  lon: number;
  source: string;
}

// Generated from holday.rocks (Seoul section, each gym's JSON-LD address and coordinates).
export const GYMS: Gym[] = (seoulGyms as SeedRow[]).map((g) => ({
  id: g.id,
  brandId: g.brandId,
  name: g.name,
  branch: g.branch,
  branchAliases: g.branch ? [g.branch] : [],
  extraAliases: [g.name],
  address: g.address,
  lat: g.lat,
  lon: g.lon,
  source: g.source,
}));
