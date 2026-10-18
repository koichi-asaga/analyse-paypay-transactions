import type { Analysis, Insight } from '@paypay/core/types';
import { useEffect, useState } from 'react';
import { api } from '../config.ts';
import { pct, WEEKDAYS, yen } from '../format.ts';
import { BarPanel } from './BarPanel.tsx';
import { PeriodPicker, toQuery, type Period } from './PeriodPicker.tsx';

const SEVERITY_LABEL: Record<Insight['severity'], string> = {
  high: '要確認',
  medium: '見直し推奨',
  low: '参考',
  info: 'お知らせ',
};
const SEVERITY_ICON: Record<Insight['severity'], string> = { high: '!', medium: '▲', low: '●', info: 'i' };

export function Dashboard({ onGoUpload }: { onGoUpload: () => void }) {
  const [period, setPeriod] = useState<Period>({});
  const [data, setData] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api<Analysis>(`/api/analysis${toQuery(period)}`)
      .then((d) => !cancelled && setData(d))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [period]);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">読み込み中…</p>;

  const s = data.summary;
  return (
    <div className="dashboard">
      <PeriodPicker value={period} onChange={setPeriod} />

      {s.count === 0 ? (
        <section className="card empty">
          <p>この期間の支払いデータがありません。</p>
          <button onClick={onGoUpload}>PayPay の CSV をアップロード</button>
        </section>
      ) : (
        <>
          <p className="muted period">
            {data.period.from} 〜 {data.period.to}（{data.period.days} 日間・{s.count} 件の支払い）
          </p>
          <div className="stats">
            <Stat label="支出合計（返金差引）" value={yen(s.netSpending)} />
            <Stat label="月平均" value={yen(s.monthlyAverage)} />
            <Stat label="1日平均" value={yen(s.dailyAverage)} />
            <Stat label="見直しで浮きそうな額 / 月" value={yen(s.potentialMonthlySaving)} accent />
          </div>

          <section className="card">
            <h2>無駄遣いチェック</h2>
            {data.insights.length === 0 ? (
              <p className="muted">気になる支出のパターンは見つかりませんでした。</p>
            ) : (
              <ul className="insights">
                {data.insights.map((i) => (
                  <li key={i.id} className={`insight sev-${i.severity}`}>
                    <span className="badge">
                      <span aria-hidden>{SEVERITY_ICON[i.severity]}</span> {SEVERITY_LABEL[i.severity]}
                    </span>
                    <div>
                      <strong>{i.title}</strong>
                      <p>{i.detail}</p>
                    </div>
                    {i.monthlySaving > 0 && <span className="saving">月 −{yen(i.monthlySaving)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="grid-2">
            <BarPanel
              title="月別の支出"
              data={data.monthly.map((m) => ({ label: m.month, value: m.spending, sub: `${m.count} 件` }))}
            />
            <BarPanel
              title="週別の支出（月曜始まり）"
              data={data.weekly.map((w) => ({ label: w.weekStart.slice(5).replace('-', '/'), value: w.spending, sub: `${w.weekStart} の週・${w.count} 件` }))}
            />
            <BarPanel
              title="カテゴリ別"
              horizontal
              data={data.byCategory.map((c) => ({ label: c.category, value: c.amount, sub: `${c.count} 件・${pct(c.share)}` }))}
            />
            <section className="card">
              <h2>よく使うお店</h2>
              <table className="merchants">
                <thead>
                  <tr>
                    <th>お店</th>
                    <th className="num">回数</th>
                    <th className="num">平均</th>
                    <th className="num">合計</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topMerchants.slice(0, 10).map((m) => (
                    <tr key={m.merchant}>
                      <td>
                        {m.merchant}
                        <div className="muted small">{m.category}</div>
                      </td>
                      <td className="num">{m.count}</td>
                      <td className="num">{yen(m.average)}</td>
                      <td className="num">{yen(m.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <BarPanel
              title="曜日別の支出"
              data={data.byWeekday.map((d, i) => ({ label: WEEKDAYS[i]!, value: d.spending, sub: `${d.count} 件` }))}
            />
            <BarPanel
              title="時間帯別の支出"
              data={data.byHour.map((d, i) => ({ label: `${i}時`, value: d.spending, sub: `${d.count} 件` }))}
            />
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`card stat${accent ? ' accent' : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}
