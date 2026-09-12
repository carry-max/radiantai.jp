# radiantai.jp：Vercel + Supabase + Railway

## 構成

- Vercel：Next.js App Routerの画面とRoute Handlerを公開
- Supabase：Google・XのOAuth認証とセッション検証
- Railway：全利用者のミッション、XP、成長記録、解析枠、決済状態を保存するPostgreSQL
- Cloudflare DNS：`radiantai.jp`と`www.radiantai.jp`をVercelへ接続

Vercelのファイルシステムには利用者データを保存しません。`DATABASE_URL`がある場合はRailway PostgreSQLを使います。ローカル開発で`DATABASE_URL`が空の場合だけSQLiteを使います。

## 1. Railway

1. RailwayプロジェクトでPostgreSQLサービスを追加します。
2. PostgreSQLサービスのSettings → NetworkingでPublic Accessを追加します。
3. Variablesに作成される`DATABASE_PUBLIC_URL`を確認します。
4. URLにSSL指定がない場合は末尾へ`?sslmode=require`を追加します。すでにクエリがある場合は`&sslmode=require`です。
5. この値をVercelの`DATABASE_URL`へSensitiveとして登録します。値をGitHubや`NEXT_PUBLIC_*`へ入れないでください。

初回の`/api/health`アクセス時に必要なテーブルとインデックスをトランザクション内で作成します。複数のVercel Functionが同時起動しても、PostgreSQLのadvisory lockで初期化を直列化します。

## 2. Supabase

Supabase Authentication → URL Configurationへ次を登録します。

| 項目 | 値 |
| --- | --- |
| Site URL | `https://radiantai.jp` |
| Redirect URL | `https://radiantai.jp/auth/callback` |

GoogleとX（OAuth 2.0）のProviderを有効化します。各Provider側のCallback URLには、Supabase画面に表示される`https://<project-ref>.supabase.co/auth/v1/callback`を使います。

## 3. Vercel

GitHubの`carry-max/radiantai.jp`を新しいVercel ProjectとしてImportし、Framework PresetをNext.js、Production Branchを`main`にします。Root Directoryはリポジトリ直下です。

Productionへ次の変数を登録します。秘密値はSensitiveにします。Preview環境を有効にする場合は、本番とは別のRailway PostgreSQLとStripeテストキーを使います。

| 変数 | 公開範囲 | 値・用途 |
| --- | --- | --- |
| `DATABASE_URL` | Sensitive | Railwayの`DATABASE_PUBLIC_URL` |
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Supabase anon key。新形式は`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`も可 |
| `AUTH_SITE_URL` | Server | `https://radiantai.jp` |
| `NEXT_PUBLIC_SITE_URL` | Public | `https://radiantai.jp` |
| `OPENAI_API_KEY` | Sensitive | 運営用OpenAI APIキー |
| `OPENAI_REVIEW_MODEL` | Server | `gpt-5.6-luna` |
| `REVIEW_DAILY_LIMIT` | Server | `200`から開始 |
| `STRIPE_SECRET_KEY` | Sensitive | Stripe本番Secret key |
| `STRIPE_WEBHOOK_SECRET` | Sensitive | `https://radiantai.jp/api/billing/webhook`のSigning secret |
| `PAYPAY_ENABLED` | Server | StripeでPayPay利用確認後に`true` |
| `RIOT_PRODUCT_APPROVED` | Server | Riotの承認確認後に`true` |
| `MERCHANT_NAME` | Server | 特定商取引法表示の事業者名 |
| `MERCHANT_REPRESENTATIVE` | Server | 代表者名 |
| `MERCHANT_ADDRESS` | Server | 所在地 |
| `MERCHANT_PHONE` | Server | 電話番号 |
| `SUPPORT_EMAIL` | Server | 問い合わせ先 |

環境変数を変更した後は再デプロイします。`NEXT_PUBLIC_*`はビルド時に画面へ組み込まれるため、変数の追加だけでは既存デプロイへ反映されません。

## 4. ドメイン

Vercel Projectへ`radiantai.jp`と`www.radiantai.jp`を追加し、Vercelが表示するDNSレコードをCloudflareへ設定します。`www`は`radiantai.jp`へ転送します。DNSが有効になった後、次を確認します。

1. `https://radiantai.jp/api/health`が`{"status":"ok"}`を返す。
2. GoogleとXでログインし、再読み込み後もログイン状態が続く。
3. 成長記録を保存し、別ブラウザでも同じアカウントから読める。
4. OpenAI解析を1件行い、解析枠と成長グラフが更新される。
5. Stripeテストモードで購入、Webhook、更新停止を確認してから本番キーへ切り替える。
