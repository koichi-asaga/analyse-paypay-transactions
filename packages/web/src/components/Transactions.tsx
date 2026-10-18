import { CATEGORIES, type Transaction } from '@paypay/core/types';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../config.ts';
import { yen } from '../format.ts';
import { PeriodPicker, toQuery, type Period } from './PeriodPicker.tsx';

const KIND_LABEL: Record<Transaction['kind'], string> = {
  payment: '支払い',
  refund: '返金',
  charge: 'チャージ',
  transfer_out: '送金',
  transfer_in: '受け取り',
  withdrawal: '出金',
  point: 'ポイント',
  other: 'その他',
};

export function Transactions() {
  const [period, setPeriod] = useState<Period>({});
  const [txs, setTxs] = useState<Transaction[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');

  useEffect(() => {
    setError(null);
    api<{ transactions: Transaction[] }>(`/api/transactions${toQuery(period)}`)
      .then((d) => setTxs(d.transactions))
      .catch((e: Error) => setError(e.message));
  }, [period]);

  const filtered = useMemo(
    () =>
      (txs ?? []).filter(
        (t) => (!category || t.category === category) && (!query || t.merchant.toLowerCase().includes(query.toLowerCase())),
      ),
    [txs, query, category],
  );
  const total = filtered.reduce((a, t) => a + (t.kind === 'payment' ? t.outAmount : t.kind === 'refund' ? -t.inAmount : 0), 0);

  if (error) return <p className="error">{error}</p>;
  return (
    <div>
      <PeriodPicker value={period} onChange={setPeriod} />
      <div className="filters">
        <input type="search" placeholder="お店の名前で検索" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">すべてのカテゴリ</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <span className="muted">
          {filtered.length} 件・支出 {yen(total)}
        </span>
      </div>
      <section className="card table-wrap">
        {!txs ? (
          <p className="muted">読み込み中…</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>日時</th>
                <th>取引先</th>
                <th>カテゴリ</th>
                <th>種別</th>
                <th className="num">金額</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 1000).map((t) => (
                <tr key={t.id}>
                  <td className="nowrap">{t.datetime.replace('T', ' ').slice(0, 16)}</td>
                  <td>{t.merchant}</td>
                  <td>{t.category}</td>
                  <td>{KIND_LABEL[t.kind]}</td>
                  <td className="num">{t.outAmount ? `−${yen(t.outAmount)}` : `+${yen(t.inAmount)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {filtered.length > 1000 && <p className="muted">先頭 1,000 件を表示しています。期間を絞り込んでください。</p>}
      </section>
    </div>
  );
}
