import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

// Seven bars, one tall: "this week, one busy day".
const BARS = [30, 45, 100, 25, 60, 40, 20];

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 8, padding: 30, background: '#fff7ef' }}>
        {BARS.map((h, i) => (
          <div key={i} style={{ width: 10, height: `${h}%`, borderRadius: 3, background: h === 100 ? '#e4572e' : '#f8b26a' }} />
        ))}
      </div>
    ),
    size,
  );
}
