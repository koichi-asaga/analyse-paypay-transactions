import type { Category, TxKind } from './types.ts';

/** 上から順に評価し、最初にマッチしたカテゴリを採用する */
const RULES: [Category, RegExp][] = [
  ['コンビニ', /セブン[-‐－ー]?イレブン|ローソン|ファミリーマート|ファミマ|ミニストップ|デイリーヤマザキ|セイコーマート|NEWDAYS|ポプラ|7-ELEVEN|LAWSON|FamilyMart/i],
  ['デリバリー', /Uber ?Eats|ウーバーイーツ|出前館|\bmenu\b|Wolt|ロケットナウ/i],
  ['カフェ', /スターバックス|スタバ|ドトール|タリーズ|コメダ|エクセルシオール|サンマルク|ブルーボトル|ベローチェ|カフェ|喫茶|珈琲|\bCAFE\b|COFFEE|STARBUCKS/i],
  ['飲食', /マクドナルド|すき家|吉野家|松屋|ガスト|サイゼリヤ|モスバーガー|ケンタッキー|くら寿司|スシロー|はま寿司|丸亀|王将|ココイチ|CoCo壱|日高屋|バーミヤン|ジョナサン|デニーズ|食堂|レストラン|ラーメン|らーめん|居酒屋|焼肉|寿司|鮨|そば|うどん|定食|ピザ|バーガー|ダイニング|酒場|ビストロ/i],
  ['スーパー', /イオン|イトーヨーカドー|ヨーカドー|西友|ライフ|マルエツ|サミット|オーケー|業務スーパー|まいばすけっと|成城石井|ヤオコー|コープ|生協|スーパー|マックスバリュ|ベルク|東急ストア|いなげや|ロピア|トライアル/],
  ['ドラッグストア', /マツモトキヨシ|マツキヨ|ウエルシア|ツルハ|スギ薬局|サンドラッグ|ココカラファイン|コスモス薬品|クリエイト|ドラッグ|薬局/],
  ['EC・通販', /Amazon|アマゾン|楽天|Yahoo!?ショッピング|ヤフーショッピング|LOHACO|ZOZO|メルカリ|PayPayフリマ|Qoo10|SHEIN|Temu/i],
  ['交通', /\bJR\b|鉄道|メトロ|タクシー|\bGO\b|DiDi|S\.RIDE|バス|ENEOS|エネオス|出光|コスモ石油|ガソリン|駐車場|タイムズ|パーキング|レンタカー/i],
  ['サブスク・デジタル', /Netflix|Spotify|Apple|Google|YouTube|Disney|U-NEXT|Hulu|DAZN|ABEMA|ニンテンドー|Nintendo|PlayStation|Steam|Kindle|Audible|Adobe|ChatGPT|OpenAI|Claude|Anthropic|LINE|DMM/i],
  ['日用品・衣料', /ダイソー|セリア|キャンドゥ|無印良品|ニトリ|ドン・キホーテ|ドンキ|カインズ|コーナン|ユニクロ|\bGU\b|しまむら|ロフト|ハンズ|ビックカメラ|ヨドバシ|ヤマダ電機|ケーズデンキ|ホームセンター/],
  ['通信・公共料金', /電力|でんき|ガス|水道|税|NHK|ソフトバンク|ワイモバイル|ドコモ|\bau\b|楽天モバイル|携帯|請求書払い/],
];

export function classify(merchant: string): Category {
  for (const [category, re] of RULES) if (re.test(merchant)) return category;
  return 'その他';
}

export function toKind(rawKind: string, outAmount: number, inAmount: number): TxKind {
  if (/返金|取り?消し|取消|キャンセル/.test(rawKind)) return 'refund';
  if (/チャージ/.test(rawKind)) return 'charge';
  if (/出金/.test(rawKind)) return 'withdrawal';
  if (/ポイント/.test(rawKind)) return 'point';
  if (/送っ|送金|送る/.test(rawKind)) return 'transfer_out';
  if (/受け?取/.test(rawKind)) return 'transfer_in';
  if (/支払/.test(rawKind)) return 'payment';
  if (outAmount > 0 && inAmount === 0) return 'payment';
  return 'other';
}
