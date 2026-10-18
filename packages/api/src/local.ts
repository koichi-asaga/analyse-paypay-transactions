// ローカル開発用サーバー。認証なし・固定ユーザーで、データは .local-data/ に保存する
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { handle } from './app.ts';
import { FsStore } from './store.ts';

const port = Number(process.env.PORT ?? 3001);
const store = new FsStore(resolve(import.meta.dirname, '../../../.local-data'));

createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const url = new URL(req.url ?? '/', 'http://localhost');
  const result = await handle(
    {
      method: req.method ?? 'GET',
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      body: chunks.length ? new Uint8Array(Buffer.concat(chunks)) : null,
      userId: 'local-user',
    },
    store,
  );
  res.writeHead(result.status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(result.body));
}).listen(port, () => console.log(`API listening on http://localhost:${port}`));
