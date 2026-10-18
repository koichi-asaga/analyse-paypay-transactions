import { randomUUID } from 'node:crypto';
import {
  analyze,
  decodeCsv,
  filterByPeriod,
  mergeTransactions,
  parsePayPayCsv,
  splitByMonth,
  type Transaction,
} from '@paypay/core';
import type { Store } from './store.ts';

export interface ApiRequest {
  method: string;
  path: string;
  query: Record<string, string | undefined>;
  body: Uint8Array | null;
  /** 認証済みユーザーの ID（Cognito の sub） */
  userId: string;
}

export interface ApiResponse {
  status: number;
  body: unknown;
}

export interface UploadMeta {
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

// Lambda のペイロード上限 6MB に base64 化しても収まるサイズ
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const json = (v: unknown) => JSON.stringify(v);
const parseJson = <T>(bytes: Uint8Array) => JSON.parse(new TextDecoder().decode(bytes)) as T;

/** S3 上のキー設計: users/{userId}/{uploads|transactions}/... */
const keys = (userId: string) => ({
  root: `users/${userId}/`,
  uploads: `users/${userId}/uploads/`,
  transactions: `users/${userId}/transactions/`,
  month: (m: string) => `users/${userId}/transactions/${m}.json`,
});

function period(query: ApiRequest['query']) {
  const { from, to } = query;
  if ((from && !DATE_RE.test(from)) || (to && !DATE_RE.test(to))) {
    throw new HttpError(400, 'from / to は YYYY-MM-DD 形式で指定してください');
  }
  return { from: from || undefined, to: to || undefined };
}

async function loadTransactions(store: Store, userId: string, range: { from?: string; to?: string }) {
  const k = keys(userId);
  const monthKeys = (await store.list(k.transactions)).filter((key) => {
    const month = key.slice(k.transactions.length, -'.json'.length);
    return (!range.from || month >= range.from.slice(0, 7)) && (!range.to || month <= range.to.slice(0, 7));
  });
  const chunks = await Promise.all(monthKeys.map((key) => store.get(key)));
  return filterByPeriod(
    chunks.flatMap((c) => (c ? parseJson<Transaction[]>(c) : [])),
    range,
  );
}

async function importCsv(store: Store, userId: string, body: Uint8Array, fileName: string): Promise<UploadMeta> {
  let parsed;
  try {
    parsed = parsePayPayCsv(decodeCsv(body));
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  const k = keys(userId);
  const uploadId = `${new Date().toISOString().replace(/[:.]/g, '-')}_${randomUUID().slice(0, 8)}`;
  await store.put(`${k.uploads}${uploadId}.csv`, body, 'text/csv');

  let imported = 0;
  let duplicates = 0;
  for (const [month, incoming] of splitByMonth(parsed.transactions)) {
    const existing = await store.get(k.month(month));
    const result = mergeTransactions(existing ? parseJson<Transaction[]>(existing) : [], incoming);
    imported += result.added;
    duplicates += result.duplicates;
    if (result.added > 0) await store.put(k.month(month), json(result.merged), 'application/json');
  }

  const dates = parsed.transactions.map((t) => t.datetime.slice(0, 10)).sort();
  const meta: UploadMeta = {
    uploadId,
    fileName,
    uploadedAt: new Date().toISOString(),
    rows: parsed.transactions.length + parsed.skipped.length,
    imported,
    duplicates,
    skipped: parsed.skipped.length,
    from: dates[0] ?? null,
    to: dates.at(-1) ?? null,
  };
  await store.put(`${k.uploads}${uploadId}.json`, json(meta), 'application/json');
  return meta;
}

export async function handle(req: ApiRequest, store: Store): Promise<ApiResponse> {
  // userId はキーのパスに使うため、想定外の文字を含むものは拒否する
  if (!/^[\w-]{1,128}$/.test(req.userId)) return { status: 401, body: { message: 'Unauthorized' } };
  const k = keys(req.userId);
  const route = `${req.method} ${req.path.replace(/\/+$/, '')}`;

  try {
    switch (route) {
      case 'POST /api/uploads': {
        if (!req.body || req.body.length === 0) throw new HttpError(400, 'CSV ファイルが空です');
        if (req.body.length > MAX_UPLOAD_BYTES) throw new HttpError(413, 'ファイルサイズは 4MB までです');
        const fileName = (req.query.name ?? 'upload.csv').slice(0, 200);
        return { status: 201, body: await importCsv(store, req.userId, req.body, fileName) };
      }
      case 'GET /api/uploads': {
        const metaKeys = (await store.list(k.uploads)).filter((key) => key.endsWith('.json'));
        const metas = await Promise.all(metaKeys.map((key) => store.get(key)));
        const uploads = metas
          .flatMap((m) => (m ? [parseJson<UploadMeta>(m)] : []))
          .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
        return { status: 200, body: { uploads } };
      }
      case 'GET /api/analysis': {
        const range = period(req.query);
        return { status: 200, body: analyze(await loadTransactions(store, req.userId, range), range) };
      }
      case 'GET /api/transactions': {
        const range = period(req.query);
        const txs = await loadTransactions(store, req.userId, range);
        return { status: 200, body: { transactions: txs.reverse() } };
      }
      case 'DELETE /api/data': {
        const all = await store.list(k.root);
        await store.deleteMany(all);
        return { status: 200, body: { deleted: all.length } };
      }
      default:
        return { status: 404, body: { message: 'Not Found' } };
    }
  } catch (e) {
    if (e instanceof HttpError) return { status: e.status, body: { message: e.message } };
    console.error(e);
    return { status: 500, body: { message: 'Internal Server Error' } };
  }
}
