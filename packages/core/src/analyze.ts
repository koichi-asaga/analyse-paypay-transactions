import { CATEGORIES, type Analysis, type Category, type Insight, type Severity, type Transaction } from './types.ts';

const DAY_MS = 86_400_000;
const AVG_MONTH_DAYS = 30.44;

// datetime は JST ローカル時刻の文字列。タイムゾーン変換を避けるため UTC として扱って曜日・週を計算する
const toUtc = (datetime: string) => Date.parse(`${datetime.slice(0, 19)}Z`);
const dateOf = (datetime: string) => datetime.slice(0, 10);
const monthOf = (datetime: string) => datetime.slice(0, 7);
const hourOf = (datetime: string) => Number(datetime.slice(11, 13));
/** 月曜 = 0 */
const weekdayOf = (datetime: string) => (new Date(toUtc(datetime)).getUTCDay() + 6) % 7;
const weekStartOf = (datetime: string) =>
  new Date(Date.parse(`${dateOf(datetime)}T00:00:00Z`) - weekdayOf(datetime) * DAY_MS).toISOString().slice(0, 10);

const yen = (n: number) => `${Math.round(n).toLocaleString('ja-JP')}円`;
const round = (n: number) => Math.round(n);

/** 支出額（返金はマイナス）。支出に該当しない取引は null */
export function spendAmount(tx: Transaction): number | null {
  if (tx.kind === 'payment') return tx.outAmount;
  if (tx.kind === 'refund') return -(tx.inAmount || tx.outAmount);
  return null;
}

export interface AnalyzeOptions {
  /** `YYYY-MM-DD`（含む） */
  from?: string;
  /** `YYYY-MM-DD`（含む） */
  to?: string;
}

export function filterByPeriod(txs: Transaction[], { from, to }: AnalyzeOptions): Transaction[] {
  return txs.filter((t) => {
    const d = dateOf(t.datetime);
    return (!from || d >= from) && (!to || d <= to);
  });
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

const sum = (txs: Transaction[]) => txs.reduce((acc, t) => acc + (spendAmount(t) ?? 0), 0);

export function analyze(allTxs: Transaction[], options: AnalyzeOptions = {}): Analysis {
  const txs = filterByPeriod(allTxs, options).sort((a, b) => a.datetime.localeCompare(b.datetime));
  const spendTxs = txs.filter((t) => spendAmount(t) !== null);
  const payments = txs.filter((t) => t.kind === 'payment');

  const firstDate = options.from ?? (txs[0] ? dateOf(txs[0].datetime) : null);
  const lastDate = options.to ?? (txs.at(-1) ? dateOf(txs.at(-1)!.datetime) : null);
  const days =
    firstDate && lastDate ? Math.max(1, Math.round((Date.parse(lastDate) - Date.parse(firstDate)) / DAY_MS) + 1) : 0;
  // 月平均の分母。データが 1 ヶ月未満なら 1 ヶ月として扱い、過大な月換算を避ける
  const monthsEq = Math.max(1, days / AVG_MONTH_DAYS);

  const spending = payments.reduce((a, t) => a + t.outAmount, 0);
  const refunds = txs.filter((t) => t.kind === 'refund').reduce((a, t) => a + (t.inAmount || t.outAmount), 0);
  const netSpending = spending - refunds;

  const monthly = [...groupBy(spendTxs, (t) => monthOf(t.datetime))].map(([month, list]) => {
    const byCategory: Partial<Record<Category, number>> = {};
    for (const t of list) byCategory[t.category] = (byCategory[t.category] ?? 0) + spendAmount(t)!;
    return { month, spending: sum(list), count: list.filter((t) => t.kind === 'payment').length, byCategory };
  });

  const weekly = [...groupBy(spendTxs, (t) => weekStartOf(t.datetime))].map(([weekStart, list]) => ({
    weekStart,
    spending: sum(list),
    count: list.filter((t) => t.kind === 'payment').length,
  }));

  const byCategory = CATEGORIES.map((category) => {
    const list = spendTxs.filter((t) => t.category === category);
    const amount = sum(list);
    return {
      category,
      amount,
      count: list.filter((t) => t.kind === 'payment').length,
      share: netSpending > 0 ? amount / netSpending : 0,
    };
  })
    .filter((c) => c.count > 0)
    .sort((a, b) => b.amount - a.amount);

  const topMerchants = [...groupBy(spendTxs, (t) => t.merchant)]
    .map(([merchant, list]) => {
      const count = list.filter((t) => t.kind === 'payment').length;
      const amount = sum(list);
      return { merchant, category: list[0]!.category, amount, count, average: count ? round(amount / count) : 0 };
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 20);

  const byWeekday = Array.from({ length: 7 }, () => ({ spending: 0, count: 0 }));
  const byHour = Array.from({ length: 24 }, () => ({ spending: 0, count: 0 }));
  for (const t of payments) {
    byWeekday[weekdayOf(t.datetime)]!.spending += t.outAmount;
    byWeekday[weekdayOf(t.datetime)]!.count++;
    byHour[hourOf(t.datetime)]!.spending += t.outAmount;
    byHour[hourOf(t.datetime)]!.count++;
  }

  const insights = detectInsights(payments, monthly, monthsEq);

  return {
    period: { from: firstDate, to: lastDate, months: monthly.length, days },
    summary: {
      spending,
      refunds,
      netSpending,
      count: payments.length,
      dailyAverage: days ? round(netSpending / days) : 0,
      monthlyAverage: round(netSpending / monthsEq),
      charged: txs.filter((t) => t.kind === 'charge').reduce((a, t) => a + t.inAmount, 0),
      transferredOut: txs.filter((t) => t.kind === 'transfer_out').reduce((a, t) => a + t.outAmount, 0),
      potentialMonthlySaving: insights.reduce((a, i) => a + i.monthlySaving, 0),
    },
    monthly,
    weekly,
    byCategory,
    topMerchants,
    byWeekday,
    byHour,
    insights,
  };
}

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2, info: 3 };

export function detectInsights(
  payments: Transaction[],
  monthly: Analysis['monthly'],
  monthsEq: number,
): Insight[] {
  const insights: Insight[] = [];
  const perMonth = (n: number) => n / monthsEq;

  // 1. コンビニの高頻度利用
  const konbini = payments.filter((t) => t.category === 'コンビニ');
  const konbiniPerMonth = perMonth(konbini.length);
  const KONBINI_TARGET = 8; // 週 2 回程度
  if (konbiniPerMonth >= KONBINI_TARGET) {
    const avg = konbini.reduce((a, t) => a + t.outAmount, 0) / konbini.length;
    insights.push({
      id: 'convenience_store',
      type: 'convenience_store',
      severity: konbiniPerMonth >= 15 ? 'high' : 'medium',
      title: 'コンビニの利用が多めです',
      detail: `月平均 ${konbiniPerMonth.toFixed(1)} 回、1 回あたり ${yen(avg)}。週 2 回（月 ${KONBINI_TARGET} 回）までに抑えると月 ${yen((konbiniPerMonth - KONBINI_TARGET) * avg)} ほど浮きます。`,
      monthlySaving: round((konbiniPerMonth - KONBINI_TARGET) * avg),
      category: 'コンビニ',
    });
  }

  // 2. 同じ店での少額・高頻度の支出（ラテマネー）
  const SMALL = 1000;
  for (const [merchant, list] of groupBy(
    payments.filter((t) => t.outAmount < SMALL && t.category !== 'コンビニ'),
    (t) => t.merchant,
  )) {
    const freq = perMonth(list.length);
    if (freq < 6) continue;
    const monthlyAmount = perMonth(list.reduce((a, t) => a + t.outAmount, 0));
    insights.push({
      id: `small_frequent:${merchant}`,
      type: 'small_frequent',
      severity: monthlyAmount >= 5000 ? 'medium' : 'low',
      title: `${merchant} での少額の支出が積み重なっています`,
      detail: `${yen(SMALL)}未満の支払いが月平均 ${freq.toFixed(1)} 回、合計 月 ${yen(monthlyAmount)}。半分にすると月 ${yen(monthlyAmount / 2)} の節約になります。`,
      monthlySaving: round(monthlyAmount / 2),
      merchant,
      category: list[0]!.category,
    });
  }

  // 3. 毎月同額の支払い（サブスクの見直し候補）
  for (const [, list] of groupBy(
    payments.filter((t) => t.outAmount >= 300),
    (t) => `${t.merchant}\u0000${t.outAmount}`,
  )) {
    const months = new Set(list.map((t) => monthOf(t.datetime)));
    if (months.size < 3 || list.length / months.size > 1.5) continue;
    const { merchant, outAmount } = list[0]!;
    insights.push({
      id: `subscription:${merchant}:${outAmount}`,
      type: 'subscription',
      severity: 'low',
      title: `定期的な支払い: ${merchant}（${yen(outAmount)}）`,
      detail: `${months.size} ヶ月にわたり毎月 ${yen(outAmount)} を支払っています。使っていないサービスなら解約を検討しましょう。`,
      monthlySaving: outAmount,
      merchant,
      category: list[0]!.category,
      transactionIds: list.map((t) => t.id),
    });
  }

  // 4. 深夜（23 時〜翌 5 時）の支出
  const lateNight = payments.filter((t) => hourOf(t.datetime) >= 23 || hourOf(t.datetime) < 5);
  const lateNightMonthly = perMonth(lateNight.reduce((a, t) => a + t.outAmount, 0));
  if (lateNight.length >= 3 && lateNightMonthly >= 2000) {
    insights.push({
      id: 'late_night',
      type: 'late_night',
      severity: lateNightMonthly >= 10000 ? 'medium' : 'low',
      title: '深夜の支出があります',
      detail: `23 時〜翌 5 時の支払いが ${lateNight.length} 件、月平均 ${yen(lateNightMonthly)}。衝動買いになっていないか確認しましょう。`,
      monthlySaving: round(lateNightMonthly / 2),
      transactionIds: lateNight.map((t) => t.id),
    });
  }

  // 5. デリバリー
  const delivery = payments.filter((t) => t.category === 'デリバリー');
  if (perMonth(delivery.length) >= 2) {
    const monthlyAmount = perMonth(delivery.reduce((a, t) => a + t.outAmount, 0));
    insights.push({
      id: 'delivery',
      type: 'delivery',
      severity: monthlyAmount >= 10000 ? 'medium' : 'low',
      title: 'フードデリバリーの利用',
      detail: `月平均 ${perMonth(delivery.length).toFixed(1)} 回・${yen(monthlyAmount)}。配達料や店頭より高い価格を考えると、テイクアウトに切り替えれば 3〜4 割（月 ${yen(monthlyAmount * 0.35)} 程度）抑えられます。`,
      monthlySaving: round(monthlyAmount * 0.35),
      category: 'デリバリー',
    });
  }

  // 6. 支出が突出した月
  if (monthly.length >= 3) {
    const med = median(monthly.map((m) => m.spending));
    for (const m of monthly) {
      if (m.spending > med * 1.3 && m.spending - med >= 10000) {
        insights.push({
          id: `monthly_spike:${m.month}`,
          type: 'monthly_spike',
          severity: 'info',
          title: `${m.month} は支出が多い月でした`,
          detail: `${yen(m.spending)}（中央値 ${yen(med)} より ${yen(m.spending - med)} 多い）。一時的な出費か確認しましょう。`,
          monthlySaving: 0,
        });
      }
    }
  }

  // 7. 直近月でカテゴリ支出が急増
  if (monthly.length >= 3) {
    const latest = monthly.at(-1)!;
    const prev = monthly.slice(0, -1);
    for (const category of CATEGORIES) {
      const cur = latest.byCategory[category] ?? 0;
      const avg = prev.reduce((a, m) => a + (m.byCategory[category] ?? 0), 0) / prev.length;
      if (cur >= avg * 1.5 && cur - avg >= 5000) {
        insights.push({
          id: `category_spike:${latest.month}:${category}`,
          type: 'category_spike',
          severity: 'medium',
          title: `${latest.month} の「${category}」が増えています`,
          detail:
            avg < 1000
              ? `${yen(cur)}。それ以前の月はほとんど支出がなかったカテゴリです。`
              : `${yen(cur)}（それ以前の月平均 ${yen(avg)} の ${(cur / avg).toFixed(1)} 倍）。`,
          // 一時的な出費の可能性が高いため節約見込みには含めない
          monthlySaving: 0,
          category,
        });
      }
    }
  }

  // 8. 二重決済の疑い（同じ店・同額・10 分以内）
  const sorted = [...payments].sort((a, b) => a.datetime.localeCompare(b.datetime));
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i]!;
      const b = sorted[j]!;
      if (toUtc(b.datetime) - toUtc(a.datetime) > 10 * 60_000) break;
      if (a.merchant === b.merchant && a.outAmount === b.outAmount) {
        insights.push({
          id: `duplicate:${a.id}:${b.id}`,
          type: 'duplicate',
          severity: 'high',
          title: `二重決済の可能性: ${a.merchant}`,
          detail: `${a.datetime.replace('T', ' ')} と ${b.datetime.replace('T', ' ')} に同額 ${yen(a.outAmount)} の支払いがあります。意図した支払いか確認してください。`,
          monthlySaving: 0,
          merchant: a.merchant,
          transactionIds: [a.id, b.id],
        });
      }
    }
  }

  return insights.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.monthlySaving - a.monthlySaving,
  );
}
