export type TxKind =
  | 'payment' // 支払い
  | 'refund' // 返金・取り消し
  | 'charge' // チャージ
  | 'transfer_out' // 送った
  | 'transfer_in' // 受け取った
  | 'withdrawal' // 出金
  | 'point' // ポイント
  | 'other';

export const CATEGORIES = [
  'コンビニ',
  'カフェ',
  'デリバリー',
  '飲食',
  'スーパー',
  'ドラッグストア',
  'EC・通販',
  '交通',
  'サブスク・デジタル',
  '日用品・衣料',
  '通信・公共料金',
  'その他',
] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Transaction {
  /** 取引番号（無い場合は行内容のハッシュ） */
  id: string;
  /** JST のローカル日時 `YYYY-MM-DDTHH:mm:ss` */
  datetime: string;
  outAmount: number;
  inAmount: number;
  kind: TxKind;
  /** CSV の「取引内容」そのまま */
  rawKind: string;
  merchant: string;
  method: string;
  category: Category;
}

export interface ParseResult {
  transactions: Transaction[];
  skipped: { line: number; reason: string }[];
}

export type Severity = 'high' | 'medium' | 'low' | 'info';

export interface Insight {
  id: string;
  type:
    | 'convenience_store'
    | 'small_frequent'
    | 'subscription'
    | 'late_night'
    | 'delivery'
    | 'monthly_spike'
    | 'category_spike'
    | 'duplicate';
  severity: Severity;
  title: string;
  detail: string;
  /** 見直した場合に見込める月あたりの節約額（目安） */
  monthlySaving: number;
  merchant?: string;
  category?: Category;
  transactionIds?: string[];
}

export interface PeriodTotal {
  spending: number;
  count: number;
}

export interface Analysis {
  period: { from: string | null; to: string | null; months: number; days: number };
  summary: {
    spending: number;
    refunds: number;
    netSpending: number;
    count: number;
    dailyAverage: number;
    monthlyAverage: number;
    charged: number;
    transferredOut: number;
    potentialMonthlySaving: number;
  };
  monthly: (PeriodTotal & { month: string; byCategory: Partial<Record<Category, number>> })[];
  weekly: (PeriodTotal & { weekStart: string })[];
  byCategory: { category: Category; amount: number; count: number; share: number }[];
  topMerchants: { merchant: string; category: Category; amount: number; count: number; average: number }[];
  /** 月曜始まり 0..6 */
  byWeekday: PeriodTotal[];
  /** 0..23 時 */
  byHour: PeriodTotal[];
  insights: Insight[];
}
