# radiantai.jp：Vercel + Railway + Supabase

## 分担

- **Vercel**：Next.js App Routerの画面、ログイン入口、ダッシュボード、解析開始、結果表示、決済API
- **Railway**：動画解析API、FFmpegフレーム抽出、OpenAI呼び出し、長時間ジョブ、バックグラウンド処理
- **Supabase**：ユーザー、Authentication、唯一のPostgreSQL、必要な場合のStorage
- **Cloudflare DNS**：`radiantai.jp`と`www.radiantai.jp`をVercelへ接続

利用者・解析枠・成長記録・ミッション・契約・解析ジョブはすべてSupabase PostgreSQLへ保存します。Railwayに別のデータベースは作りません。ローカル開発で`SUPABASE_DATABASE_URL`が空の場合だけSQLiteを使います。

## 1. Supabase

Authentication → URL Configurationへ次を登録します。

| 項目 | 値 |
| --- | --- |
| Site URL | `https://radiantai.jp` |
| Redirect URL | `https://radiantai.jp/auth/callback` |

Database → Connectで、サーバーレス接続に対応したPooler URLを取得します。VercelとRailwayの`SUPABASE_DATABASE_URL`へSensitiveとして登録し、GitHubや`NEXT_PUBLIC_*`へは入れません。

GoogleとX（OAuth 2.0）のProviderは、各Provider側のClient ID・Secretを用意してから有効化します。Callback URLはSupabase画面に表示される`https://<project-ref>.supabase.co/auth/v1/callback`です。

動画をサーバー処理する場合だけStorageに非公開bucketを作り、短時間のsigned URLをRailwayへ渡します。公開bucketや恒久URLは使いません。

## 2. Railway動画解析サービス

GitHubの同じリポジトリからサービスを作り、Root Directoryを`services/video-analysis`にします。DockerfileにはFFmpegが含まれます。

Railwayへ次を登録します。

| 変数 | 公開範囲 | 用途 |
| --- | --- | --- |
| `OPENAI_API_KEY` | Secret | 運営用AIキー |
| `VIDEO_ANALYSIS_BACKEND_TOKEN` | Secret | Vercelとの共有トークン |
| `SUPABASE_DATABASE_URL` | Secret | Supabase Pooler URL。バックグラウンドジョブ保存用 |
| `SUPABASE_STORAGE_HOST` | Server | 例：`<project-ref>.supabase.co`。FFmpeg入力URLの送信先制限 |

公開ドメインを1つ発行します。`/health`は認証不要、`/v1/analyze`、`/v1/frames`、`/v1/jobs`は共有トークンが必要です。

- `/v1/analyze`：Vercelが作成した画像解析リクエストをOpenAIへ送る
- `/v1/frames`：Supabase Storageの短時間signed URLからFFmpegで2〜6枚を抽出
- `/v1/jobs`：長時間解析をSupabase DBへ登録し、バックグラウンド実行
- `/v1/jobs/:id`：ジョブ状態と結果を取得

利用者が自分で入力したOpenAIキーはRailwayへ送りません。その場合だけVercelからOpenAIへ直接送ります。

## 3. Vercel

GitHubの`carry-max/radiantai.jp`をImportし、Framework PresetをNext.js、Production Branchを`main`、Root Directoryをリポジトリ直下にします。

| 変数 | 公開範囲 | 値・用途 |
| --- | --- | --- |
| `SUPABASE_DATABASE_URL` | Sensitive | Supabase Pooler URL |
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public | Supabase publishable key |
| `AUTH_SITE_URL` | Server | `https://radiantai.jp` |
| `NEXT_PUBLIC_SITE_URL` | Public | `https://radiantai.jp` |
| `VIDEO_ANALYSIS_BACKEND_URL` | Server | Railway動画解析サービスのHTTPS URL |
| `VIDEO_ANALYSIS_BACKEND_TOKEN` | Sensitive | Railwayと同じ共有トークン |
| `OPENAI_REVIEW_MODEL` | Server | `gpt-5.6-luna` |
| `REVIEW_DAILY_LIMIT` | Server | `200`から開始 |
| `STRIPE_SECRET_KEY` | Sensitive | Stripe本番Secret key |
| `STRIPE_WEBHOOK_SECRET` | Sensitive | Billing Webhook Signing secret |
| `PAYPAY_ENABLED` | Server | 利用確認後に`true` |
| `RIOT_PRODUCT_APPROVED` | Server | Riotの承認確認後に`true` |
| `RIOT_RSO_CLIENT_ID` | Server | 承認後に発行されるRSO Client ID |
| `RIOT_RSO_CLIENT_SECRET` | Sensitive | 承認後に発行されるRSO Client Secret |
| `RIOT_RSO_AUTHORIZE_URL` | Server | Riotから案内される認可URL |
| `RIOT_RSO_TOKEN_URL` | Server | Riotから案内されるトークンURL |
| `RIOT_RSO_USERINFO_URL` | Server | Riotから案内されるユーザー情報URL |
| `RIOT_RSO_SCOPES` | Server | Riotから承認されたscope。初期値は`openid` |
| `MERCHANT_*`、`SUPPORT_EMAIL` | Server | 特定商取引法表示の実情報 |

運営用`OPENAI_API_KEY`はRailwayだけへ置き、Vercelへ重複保存しません。環境変数を変更した後は再デプロイします。

Riot連携のコールバックURLは`https://radiantai.jp/auth/riot/callback`です。VALORANTの個人データ連携にはProduction KeyとRSO承認が必要なため、申請前は`RIOT_PRODUCT_APPROVED=false`のままにします。Development KeyやPersonal Keyで公開機能を有効化しません。

## 4. 公開確認

1. Railwayの`/health`が`status: ok`を返す。
2. Vercelの`/api/health`がSupabase DBへ接続して`status: ok`を返す。
3. Google/Xログイン後、再読み込みしてもセッションが続く。
4. 解析結果、解析枠、ミッション、成長グラフが同じSupabase DBへ保存される。
5. FFmpeg抽出、同期解析、長時間ジョブをそれぞれ確認する。
6. Stripeテストモードで購入、Webhook、更新停止を確認してから本番へ切り替える。
