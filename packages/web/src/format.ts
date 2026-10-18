export const yen = (n: number) => `¥${Math.round(n).toLocaleString('ja-JP')}`;
export const yenShort = (n: number) => (Math.abs(n) >= 10000 ? `¥${(n / 10000).toFixed(n % 10000 === 0 ? 0 : 1)}万` : yen(n));
export const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
export const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日'];
