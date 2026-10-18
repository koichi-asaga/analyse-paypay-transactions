import type { Transaction } from './types.ts';

/** 取引 ID で重複排除しながらマージする。既存の取引が優先される */
export function mergeTransactions(existing: Transaction[], incoming: Transaction[]) {
  const byId = new Map(existing.map((t) => [t.id, t]));
  let added = 0;
  for (const t of incoming) {
    if (byId.has(t.id)) continue;
    byId.set(t.id, t);
    added++;
  }
  const merged = [...byId.values()].sort((a, b) => a.datetime.localeCompare(b.datetime));
  return { merged, added, duplicates: incoming.length - added };
}

/** `YYYY-MM` ごとに分割する（S3 上の保存単位） */
export function splitByMonth(txs: Transaction[]): Map<string, Transaction[]> {
  const map = new Map<string, Transaction[]>();
  for (const t of txs) {
    const month = t.datetime.slice(0, 7);
    const list = map.get(month);
    if (list) list.push(t);
    else map.set(month, [t]);
  }
  return map;
}
