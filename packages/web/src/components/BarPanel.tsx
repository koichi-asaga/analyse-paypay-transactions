import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { yen, yenShort } from '../format.ts';

export interface BarDatum {
  label: string;
  value: number;
  sub?: string;
}

/** 単一系列の棒グラフ + 表表示の切り替え */
export function BarPanel({
  title,
  data,
  horizontal = false,
  height = 260,
}: {
  title: string;
  data: BarDatum[];
  horizontal?: boolean;
  height?: number;
}) {
  const axisTick = { fill: 'var(--text-muted)', fontSize: 12 };
  return (
    <section className="card">
      <h2>{title}</h2>
      {data.length === 0 ? (
        <p className="muted">データがありません</p>
      ) : (
        <ResponsiveContainer width="100%" height={horizontal ? Math.max(160, data.length * 32) : height}>
          <BarChart
            data={data}
            layout={horizontal ? 'vertical' : 'horizontal'}
            margin={{ top: 8, right: 16, bottom: 0, left: horizontal ? 8 : 0 }}
            barCategoryGap={2}
          >
            <CartesianGrid stroke="var(--grid)" vertical={horizontal} horizontal={!horizontal} />
            {horizontal ? (
              <>
                <XAxis type="number" tickFormatter={yenShort} tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="label" width={130} tick={axisTick} axisLine={{ stroke: 'var(--axis)' }} tickLine={false} />
              </>
            ) : (
              <>
                <XAxis dataKey="label" tick={axisTick} axisLine={{ stroke: 'var(--axis)' }} tickLine={false} minTickGap={8} />
                <YAxis tickFormatter={yenShort} tick={axisTick} axisLine={false} tickLine={false} width={56} />
              </>
            )}
            <Tooltip
              cursor={{ fill: 'var(--hover-wash)' }}
              content={({ active, payload }) => {
                const d = payload?.[0]?.payload as BarDatum | undefined;
                if (!active || !d) return null;
                return (
                  <div className="tooltip">
                    <div className="tooltip-label">{d.label}</div>
                    <div className="tooltip-value">{yen(d.value)}</div>
                    {d.sub && <div className="muted">{d.sub}</div>}
                  </div>
                );
              }}
            />
            <Bar
              dataKey="value"
              fill="var(--series-1)"
              radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
              maxBarSize={horizontal ? 20 : 40}
              stroke="var(--surface)"
              strokeWidth={1}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
      <details>
        <summary>表で見る</summary>
        <table>
          <tbody>
            {data.map((d) => (
              <tr key={d.label}>
                <th scope="row">{d.label}</th>
                <td className="num">{yen(d.value)}</td>
                <td className="muted">{d.sub}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
