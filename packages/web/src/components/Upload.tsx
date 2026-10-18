import { useEffect, useState } from 'react';
import { api } from '../config.ts';

interface UploadMeta {
  uploadId: string;
  fileName: string;
  uploadedAt: string;
  rows: number;
  imported: number;
  duplicates: number;
  skipped: number;
  from: string | null;
  to: string | null;
}

const MAX_BYTES = 4 * 1024 * 1024;

export function Upload({ onChanged, onDone }: { onChanged: () => void; onDone: () => void }) {
  const [uploads, setUploads] = useState<UploadMeta[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [dragging, setDragging] = useState(false);

  const refresh = () => api<{ uploads: UploadMeta[] }>('/api/uploads').then((d) => setUploads(d.uploads));
  useEffect(() => {
    refresh().catch((e: Error) => setMessage({ type: 'error', text: e.message }));
  }, []);

  async function upload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setMessage({ type: 'error', text: 'ファイルサイズは 4MB までです。期間を分けてダウンロードしてください。' });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const meta = await api<UploadMeta>(`/api/uploads?name=${encodeURIComponent(file.name)}`, {
        method: 'POST',
        headers: { 'content-type': 'text/csv' },
        body: await file.arrayBuffer(),
      });
      setMessage({
        type: 'ok',
        text: `${meta.from} 〜 ${meta.to} の ${meta.rows} 行を読み込みました（新規 ${meta.imported} 件・重複 ${meta.duplicates} 件・スキップ ${meta.skipped} 件）`,
      });
      onChanged();
      await refresh();
    } catch (e) {
      setMessage({ type: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function deleteAll() {
    if (!confirm('アップロードしたファイルと取引データをすべて削除します。よろしいですか？')) return;
    await api('/api/data', { method: 'DELETE' });
    setUploads([]);
    setMessage({ type: 'ok', text: 'すべてのデータを削除しました' });
    onChanged();
  }

  return (
    <div className="upload">
      <section className="card">
        <h2>PayPay の取引履歴 CSV をアップロード</h2>
        <p className="muted">
          PayPay アプリの「取引履歴」→ 右上の「取引履歴のダウンロード」で CSV を取得できます（1 回あたり最大 365 日）。同じ取引は自動で重複排除されるので、期間が重なっても問題ありません。
        </p>
        <label
          className={`dropzone${dragging ? ' dragging' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void upload(e.dataTransfer.files);
          }}
        >
          <input type="file" accept=".csv,text/csv" disabled={busy} onChange={(e) => void upload(e.target.files)} />
          {busy ? 'アップロード中…' : 'ここに CSV をドロップ、またはクリックして選択'}
        </label>
        {message && (
          <p className={message.type === 'ok' ? 'ok' : 'error'} role="status">
            {message.text}
            {message.type === 'ok' && uploads.length > 0 && (
              <>
                {' '}
                <button className="link" onClick={onDone}>
                  分析を見る →
                </button>
              </>
            )}
          </p>
        )}
      </section>

      <section className="card">
        <h2>アップロード履歴</h2>
        {uploads.length === 0 ? (
          <p className="muted">まだアップロードされていません</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>日時</th>
                <th>ファイル</th>
                <th>期間</th>
                <th className="num">新規</th>
                <th className="num">重複</th>
              </tr>
            </thead>
            <tbody>
              {uploads.map((u) => (
                <tr key={u.uploadId}>
                  <td className="nowrap">{new Date(u.uploadedAt).toLocaleString('ja-JP')}</td>
                  <td>{u.fileName}</td>
                  <td className="nowrap">
                    {u.from} 〜 {u.to}
                  </td>
                  <td className="num">{u.imported}</td>
                  <td className="num">{u.duplicates}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <button className="danger" onClick={() => void deleteAll()}>
          すべてのデータを削除
        </button>
      </section>
    </div>
  );
}
