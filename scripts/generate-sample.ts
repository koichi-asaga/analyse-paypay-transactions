// 動作確認用のダミー PayPay 取引履歴 CSV を生成する: npx tsx scripts/generate-sample.ts > samples/paypay-sample.csv
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)]!;
const fmt = (n: number) => n.toLocaleString('en-US');
const pad = (n: number) => String(n).padStart(2, '0');

const header = ['取引日', '出金金額（円）', '入金金額（円）', '海外出金金額', '通貨', '変換レート（円）', '利用国', '取引内容', '取引先', '取引方法', '支払い区分', '利用者', '取引番号'];
const rows: string[][] = [];
let no = 1;
const add = (d: Date, kind: string, merchant: string, out: number, inn = 0) =>
  rows.push([
    `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
    out ? fmt(out) : '-',
    inn ? fmt(inn) : '-',
    '-', '-', '-', '-',
    kind, merchant,
    kind === 'チャージ' ? '銀行口座' : 'PayPay残高',
    '-', '-',
    String(10_000_000_000 + no++),
  ]);

for (let day = new Date(2026, 6, 1); day < new Date(2026, 9, 1); day.setDate(day.getDate() + 1)) {
  const at = (h: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, Math.floor(rand() * 60), Math.floor(rand() * 60));
  if (rand() < 0.6) add(at(8), '支払い', pick(['セブン-イレブン 渋谷店', 'ローソン 新宿店', 'ファミリーマート 代々木店']), 200 + Math.floor(rand() * 900));
  if (rand() < 0.35) add(at(15), '支払い', 'スターバックス コーヒー 渋谷店', 450 + Math.floor(rand() * 300));
  if (rand() < 0.4) add(at(19), '支払い', pick(['まいばすけっと', 'イオン', '成城石井']), 1500 + Math.floor(rand() * 3000));
  if (rand() < 0.15) add(at(23), '支払い', pick(['Amazon.co.jp', 'Yahoo!ショッピング']), 1000 + Math.floor(rand() * 6000));
  if (rand() < 0.12) add(at(20), '支払い', 'Uber Eats', 1800 + Math.floor(rand() * 1500));
  if (rand() < 0.2) add(at(12), '支払い', pick(['松屋', '丸亀製麺', 'サイゼリヤ']), 600 + Math.floor(rand() * 600));
  if (day.getDate() === 5) add(at(3), '支払い', 'Netflix', 1590);
  if (day.getDate() === 10) add(at(9), '支払い', 'Spotify', 1080);
  if (day.getDate() === 1) add(at(10), 'チャージ', 'みずほ銀行', 0, 50000);
  if (day.getMonth() === 8 && day.getDate() === 20) add(at(14), '支払い', 'ビックカメラ', 32800);
}
// 二重決済の例
add(new Date(2026, 8, 12, 13, 1, 0), '支払い', 'ドトールコーヒー 原宿店', 520);
add(new Date(2026, 8, 12, 13, 3, 0), '支払い', 'ドトールコーヒー 原宿店', 520);
add(new Date(2026, 8, 15, 18, 0, 0), '返金', 'Amazon.co.jp', 0, 1980);
add(new Date(2026, 8, 18, 18, 0, 0), '送った', '山田 太郎', 3000);

rows.sort((a, b) => b[0]!.localeCompare(a[0]!)); // アプリの出力と同じく新しい順
const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
process.stdout.write('﻿' + [header, ...rows].map((r) => r.map(q).join(',')).join('\r\n') + '\r\n');
