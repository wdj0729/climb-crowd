import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '암장 혼잡도',
    short_name: '암장 혼잡도',
    description: '이번 주 서울 암장에 크루 정모가 얼마나 몰리는지 미리 확인해요.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#e4572e',
    icons: [{ src: '/apple-icon', sizes: '180x180', type: 'image/png' }],
  };
}
