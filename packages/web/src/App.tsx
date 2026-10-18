import { useState } from 'react';
import { Dashboard } from './components/Dashboard.tsx';
import { Transactions } from './components/Transactions.tsx';
import { Upload } from './components/Upload.tsx';

const TABS = [
  { id: 'dashboard', label: 'ダッシュボード' },
  { id: 'transactions', label: '取引一覧' },
  { id: 'upload', label: 'CSV アップロード' },
] as const;
type Tab = (typeof TABS)[number]['id'];

export function App({ userLabel, onSignOut }: { userLabel?: string; onSignOut?: () => void }) {
  const [tab, setTab] = useState<Tab>('dashboard');
  // アップロード後にダッシュボードを再取得させるためのキー
  const [dataVersion, setDataVersion] = useState(0);

  return (
    <div className="app">
      <header className="app-header">
        <h1>PayPay 家計分析</h1>
        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="user">
          <span>{userLabel}</span>
          {onSignOut && (
            <button className="ghost" onClick={onSignOut}>
              ログアウト
            </button>
          )}
        </div>
      </header>
      <main>
        {tab === 'dashboard' && <Dashboard key={dataVersion} onGoUpload={() => setTab('upload')} />}
        {tab === 'transactions' && <Transactions key={dataVersion} />}
        {tab === 'upload' && (
          <Upload
            onChanged={() => setDataVersion((v) => v + 1)}
            onDone={() => setTab('dashboard')}
          />
        )}
      </main>
    </div>
  );
}
