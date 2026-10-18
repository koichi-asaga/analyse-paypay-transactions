export interface Period {
  from?: string;
  to?: string;
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function preset(id: string): Period {
  const now = new Date();
  const monthsAgo = (n: number) => ymd(new Date(now.getFullYear(), now.getMonth() - n, 1));
  switch (id) {
    case 'this_month':
      return { from: monthsAgo(0), to: ymd(now) };
    case 'last_month':
      return { from: monthsAgo(1), to: ymd(new Date(now.getFullYear(), now.getMonth(), 0)) };
    case '3m':
      return { from: monthsAgo(2), to: ymd(now) };
    case '6m':
      return { from: monthsAgo(5), to: ymd(now) };
    case 'year':
      return { from: `${now.getFullYear()}-01-01`, to: ymd(now) };
    default:
      return {};
  }
}

const PRESETS = [
  ['all', '全期間'],
  ['this_month', '今月'],
  ['last_month', '先月'],
  ['3m', '直近3ヶ月'],
  ['6m', '直近6ヶ月'],
  ['year', '今年'],
] as const;

export function PeriodPicker({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const selected = PRESETS.find(([id]) => {
    const p = preset(id);
    return p.from === value.from && p.to === value.to;
  })?.[0];
  return (
    <div className="period-picker">
      <div className="segmented">
        {PRESETS.map(([id, label]) => (
          <button key={id} aria-pressed={selected === id} onClick={() => onChange(preset(id))}>
            {label}
          </button>
        ))}
      </div>
      <label>
        <input type="date" value={value.from ?? ''} onChange={(e) => onChange({ ...value, from: e.target.value || undefined })} />
      </label>
      <span>〜</span>
      <label>
        <input type="date" value={value.to ?? ''} onChange={(e) => onChange({ ...value, to: e.target.value || undefined })} />
      </label>
    </div>
  );
}

export const toQuery = (p: Period) => {
  const q = new URLSearchParams();
  if (p.from) q.set('from', p.from);
  if (p.to) q.set('to', p.to);
  const s = q.toString();
  return s ? `?${s}` : '';
};
