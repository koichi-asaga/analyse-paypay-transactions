import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

/** オブジェクトストレージの最小インターフェース。本番は S3、ローカル開発はファイルシステム */
export interface Store {
  get(key: string): Promise<Uint8Array | null>;
  put(key: string, body: Uint8Array | string, contentType: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
  deleteMany(keys: string[]): Promise<void>;
}

export class S3Store implements Store {
  constructor(
    private readonly bucket: string,
    private readonly client = new S3Client({}),
  ) {}

  async get(key: string) {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return (await res.Body?.transformToByteArray()) ?? null;
    } catch (e) {
      if (e instanceof NoSuchKey) return null;
      throw e;
    }
  }

  async put(key: string, body: Uint8Array | string, contentType: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }

  async list(prefix: string) {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const res = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }),
      );
      for (const o of res.Contents ?? []) if (o.Key) keys.push(o.Key);
      token = res.NextContinuationToken;
    } while (token);
    return keys;
  }

  async deleteMany(keys: string[]) {
    for (let i = 0; i < keys.length; i += 1000) {
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })) },
        }),
      );
    }
  }
}

export class FsStore implements Store {
  constructor(private readonly root: string) {}

  async get(key: string) {
    try {
      return new Uint8Array(await readFile(join(this.root, key)));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  }

  async put(key: string, body: Uint8Array | string) {
    const path = join(this.root, key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }

  async list(prefix: string) {
    try {
      const entries = await readdir(this.root, { recursive: true, withFileTypes: true });
      return entries
        .filter((e) => e.isFile())
        .map((e) => relative(this.root, join(e.parentPath, e.name)).split('\\').join('/'))
        .filter((k) => k.startsWith(prefix))
        .sort();
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw e;
    }
  }

  async deleteMany(keys: string[]) {
    await Promise.all(keys.map((k) => rm(join(this.root, k), { force: true })));
  }
}
