import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { handle, type ApiRequest } from '../src/app.ts';
import { FsStore } from '../src/store.ts';

const csv = new Uint8Array(readFileSync(new URL('../../../samples/paypay-sample.csv', import.meta.url)));

describe('API', () => {
  const store = new FsStore(mkdtempSync(join(tmpdir(), 'paypay-')));
  const call = (r: Partial<ApiRequest>) =>
    handle({ method: 'GET', path: '/', query: {}, body: null, userId: 'u1', ...r }, store);

  it('アップロード → 再アップロードで重複排除 → 分析 → 削除', async () => {
    const first = await call({ method: 'POST', path: '/api/uploads', body: csv, query: { name: 'a.csv' } });
    expect(first).toMatchObject({ status: 201, body: { imported: 192, duplicates: 0, from: '2026-07-01', to: '2026-09-30' } });

    const second = await call({ method: 'POST', path: '/api/uploads', body: csv });
    expect(second.body).toMatchObject({ imported: 0, duplicates: 192 });

    const uploads = await call({ path: '/api/uploads' });
    expect((uploads.body as { uploads: unknown[] }).uploads).toHaveLength(2);

    const analysis = await call({ path: '/api/analysis', query: { from: '2026-08-01', to: '2026-08-31' } });
    expect(analysis.status).toBe(200);
    expect((analysis.body as { monthly: { month: string }[] }).monthly.map((m) => m.month)).toEqual(['2026-08']);

    // 他ユーザーからは見えない
    const other = await handle({ method: 'GET', path: '/api/analysis', query: {}, body: null, userId: 'u2' }, store);
    expect((other.body as { summary: { count: number } }).summary.count).toBe(0);

    expect((await call({ method: 'DELETE', path: '/api/data' })).status).toBe(200);
    expect(((await call({ path: '/api/transactions' })).body as { transactions: unknown[] }).transactions).toEqual([]);
  });

  it('不正な入力を拒否する', async () => {
    expect((await call({ method: 'POST', path: '/api/uploads', body: new TextEncoder().encode('a,b\n1,2') })).status).toBe(400);
    expect((await call({ path: '/api/analysis', query: { from: '2026/01/01' } })).status).toBe(400);
    expect((await call({ path: '/api/analysis', userId: '../x' })).status).toBe(401);
    expect((await call({ path: '/api/unknown' })).status).toBe(404);
  });
});
