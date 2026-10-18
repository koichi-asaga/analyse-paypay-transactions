# PayPay 家計分析

PayPay の取引履歴 CSV をアップロードすると、週別・月別の支出の傾向と「無駄遣いの候補」を分析する Web アプリです。

## 構成

```
CloudFront ─┬─ /*      → S3（React SPA + config.json）
            └─ /api/*  → API Gateway (HTTP API, Cognito JWT 認証) → Lambda → S3（取引データ）
Cognito User Pool（メール + パスワード）
```

| パッケージ | 内容 |
|---|---|
| `packages/core` | CSV パース（UTF-8 / Shift_JIS 自動判定）、カテゴリ分類、集計・無駄遣い検出 |
| `packages/api` | API 本体（Lambda ハンドラ + ローカル開発サーバー） |
| `packages/web` | React + Vite のフロントエンド（Amplify UI でログイン） |
| `packages/infra` | AWS CDK スタック |

### S3 のデータ配置

```
users/{Cognito sub}/uploads/{uploadId}.csv     元の CSV
users/{Cognito sub}/uploads/{uploadId}.json    取り込み結果
users/{Cognito sub}/transactions/{YYYY-MM}.json 正規化済みの取引（取引番号で重複排除）
```

ユーザー ID は JWT から取得するため、他人のデータにはアクセスできません。バケットは非公開・SSE-S3 暗号化・バージョニング有効です。

### API

| メソッド | パス | 内容 |
|---|---|---|
| POST | `/api/uploads?name=` | CSV（本文そのまま、4MB まで）を取り込む |
| GET | `/api/uploads` | アップロード履歴 |
| GET | `/api/analysis?from=&to=` | 分析結果（期間は `YYYY-MM-DD`、省略で全期間） |
| GET | `/api/transactions?from=&to=` | 取引一覧 |
| DELETE | `/api/data` | 自分のデータをすべて削除 |

### 無駄遣いの検出ルール

`packages/core/src/analyze.ts` の `detectInsights` に定義しています。

- コンビニの利用が月 8 回を超える
- 同じ店での 1,000 円未満の支払いが月 6 回以上
- 同じ店・同じ金額の支払いが 3 ヶ月以上続く（サブスクの見直し候補）
- 23 時〜翌 5 時の支払い
- フードデリバリーが月 2 回以上
- 支出が中央値の 1.3 倍を超えた月、直近月で 1.5 倍以上に増えたカテゴリ
- 同じ店・同額・10 分以内の支払い（二重決済の疑い）

カテゴリは店名のキーワードで分類しています（`packages/core/src/classify.ts`）。

## ローカル開発

認証なし・固定ユーザーで動作し、データは `.local-data/` に保存されます。

```sh
npm install
npm run dev:api   # http://localhost:3001
npm run dev:web   # http://localhost:5173（/api は dev:api にプロキシ）
```

動作確認用のダミー CSV は `samples/paypay-sample.csv` にあります（`npx tsx scripts/generate-sample.ts > samples/paypay-sample.csv` で再生成）。

```sh
npm test          # vitest
npm run typecheck
```

## デプロイ

前提: AWS の認証情報が設定済みで、対象アカウント・リージョン（既定は `ap-northeast-1`）で CDK の bootstrap が済んでいること。

```sh
npx cdk bootstrap --app "npx tsx packages/infra/bin/app.ts"   # 初回のみ
npm run deploy    # Web をビルド → cdk deploy
```

出力される `Url` にアクセスします。

### ユーザーの作成

既定ではセルフサインアップを無効にしています。管理者がユーザーを作成してください（初回ログイン時にパスワードの変更を求められます）。

```sh
aws cognito-idp admin-create-user \
  --user-pool-id <出力の UserPoolId> \
  --username you@example.com \
  --user-attributes Name=email,Value=you@example.com Name=email_verified,Value=true
```

誰でもサインアップできるようにする場合は `packages/infra/cdk.json` の `allowSelfSignUp` を `true` にして再デプロイします。

### 削除

```sh
npm run destroy -w @paypay/infra
```

データバケットと User Pool はデータ保護のため `RETAIN` にしており、スタック削除後も残ります。不要なら手動で削除してください。

## 制約と今後の課題

- PayPay の CSV の列名は「取引日」「出金金額（円）」「入金金額（円）」「取引内容」「取引先」「取引方法」「取引番号」を前提にしています（`packages/core/src/parse.ts` の `HEADER_ALIASES`）。実際のファイルで列名が違う場合はここに追加してください。
- カテゴリ分類はキーワードのみです。ユーザーごとの分類の上書きは未対応です。
- 1 回のアップロードは 4MB まで（Lambda のペイロード上限のため）。
