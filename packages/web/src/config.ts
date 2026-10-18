import { Amplify } from 'aws-amplify';
import { fetchAuthSession } from 'aws-amplify/auth';

export interface AppConfig {
  auth: 'cognito' | 'none';
  region?: string;
  userPoolId?: string;
  userPoolClientId?: string;
  allowSelfSignUp?: boolean;
}

/** デプロイ時に CDK が書き出す /config.json を読む。ローカル開発で無ければ認証なしモード */
export async function loadConfig(): Promise<AppConfig> {
  try {
    const res = await fetch('/config.json', { cache: 'no-store' });
    if (res.ok) {
      const config = (await res.json()) as AppConfig;
      if (config.auth === 'cognito') {
        Amplify.configure({
          Auth: { Cognito: { userPoolId: config.userPoolId!, userPoolClientId: config.userPoolClientId! } },
        });
      }
      return config;
    }
  } catch {
    // dev サーバーは存在しないパスに index.html を返すので JSON パースに失敗する
  }
  if (import.meta.env.DEV) return { auth: 'none' };
  throw new Error('config.json を読み込めませんでした');
}

let authEnabled = false;
export const setAuthEnabled = (v: boolean) => {
  authEnabled = v;
};

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (authEnabled) {
    const token = (await fetchAuthSession()).tokens?.idToken?.toString();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }
  const res = await fetch(path, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
  return body as T;
}
