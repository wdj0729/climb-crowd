import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '암장 혼잡도',
  description: '이번 주 서울 암장에 크루 정모가 얼마나 몰리는지 미리 확인해요.',
  appleWebApp: { capable: true, title: '암장 혼잡도', statusBarStyle: 'default' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#e4572e' };

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
