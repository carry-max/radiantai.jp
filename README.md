# Radiant Review / VALORANT

Riot APIとOverwolfの自動クリップから、立ち回り・ミクロ・Deepをレビューする標準Next.js App Routerアプリです。

## 起動

Node.js 24 LTSを推奨します（最低22.16.0）。Windows、macOS、LinuxのNode.jsサーバーで実行できます。

```sh
npm ci
# .env.exampleを.env.localへコピーして必要な値を設定
npm run dev
```

開発URLは http://localhost:3000 です。本番起動は次の順序です。

```sh
npm run build
npm start
```

## radiantai.jpへの公開

本番はVercel、Railway動画解析サービス、Supabaseで構成します。具体的な作成順序と環境変数は[DEPLOYMENT.md](./DEPLOYMENT.md)を参照してください。

- Vercel：Next.jsの画面・API
- Railway：動画解析API、FFmpeg、AI呼び出し、長時間ジョブ
- Supabase：Google・Xログイン、唯一のPostgreSQL、必要時のStorage
- Cloudflare：`radiantai.jp`のDNS

`vercel.json`は東京リージョンを指定します。運営用AI解析はVercelからRailwayへ渡し、RailwayがOpenAIを呼び出します。

`Dockerfile`はVercelを使わない自己ホストや復旧用として残しています。

## 画面構成

| URL | Server Component | Client Component |
| --- | --- | --- |
| / | app/page.tsx | 共通ヘッダー |
| /login | app/login/page.tsx | components/account-view.tsx |
| /dashboard | app/dashboard/page.tsx | components/dashboard-view.tsx |
| /analysis | app/analysis/page.tsx | components/analysis-workspace.tsx |
| /pricing | app/pricing/page.tsx | components/pricing-view.tsx |
| /account | app/account/page.tsx | /loginへ転送 |

APIはapp/api/、認証はapp/auth/、画面別metadataは各layout.tsxにあります。

## データ保存

本番では`SUPABASE_DATABASE_URL`経由でSupabase PostgreSQLを使用します。必要なテーブルは初回接続時に安全に作成します。複数SQLのbatchはPostgreSQLトランザクションにまとめ、失敗時はロールバックします。

ローカル開発では`SUPABASE_DATABASE_URL`が空の場合だけNode.js組み込みSQLiteを使い、`.data/radiant.sqlite`へ保存します。`SQLITE_PATH`で保存場所を変更できます。Vercel上でSupabase DBが未設定の場合はエラーにします。

既存のDrizzleクエリとの互換性のためD1ドライバーのSQL変換部分を利用しますが、Cloudflare WorkerやD1バインディングは起動に不要です。

## 認証・解析・決済の設定

.env.exampleを参照し、実際の値を.env.localまたはホスト側で設定します。

- Supabase：`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`AUTH_SITE_URL`。Google/Xを有効にし、`https://radiantai.jp/auth/callback`をSupabaseの許可済みリダイレクトURLへ追加します。新しいpublishable keyを使う場合は`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`にも対応しています。
- Riot：公開後にProduction KeyとRiot Sign Onを申請します。承認前は連携ボタンを無効化し、Development KeyやPersonal Keyで公開しません。承認後のCallback URLは`https://radiantai.jp/auth/riot/callback`です。
- AI解析：Railwayへ`OPENAI_API_KEY`とミクロ用の`GEMINI_API_KEY`、両サービスへ同じ`VIDEO_ANALYSIS_BACKEND_TOKEN`を設定します。立ち回りは、リプレイを利用者が選ぶ手動解析、またはRiot API → Jev → GPTによる自動判断を選べます。ミクロはOverwolf → Gemini → GPTの順で処理します。
- ミクロ自動クリップ：承認済みOverwolf WindowsアプリがVALORANTの`death`を検出し、死亡前25秒＋死亡後5秒をローカル保存します。利用者による録画操作や動画選択は不要です。
- Riot AI高速分類：Vercelへ`JEV_API_KEY`（または`AI_GATEWAY_API_KEY`）を設定します。WindowsアプリがRiot API／Replayの結果をテキストと数値へ整形し、`POST /api/riot/classify`へ最大50試合を送ります。Jevは映像そのものを受け取りません。
- 開発者コンソール：Vercelの`DEVELOPER_EMAILS`へ許可メールを設定すると、そのログインだけが`/developer/jev`を開けます。ナビゲーションには表示されず、画面へ入力したキーは保存されません。
- 決済：Stripeのキー・Webhookシークレット、販売者情報など既存の条件を設定します。Webhook送信先は`https://radiantai.jp/api/billing/webhook`です。
- 設定がない場合は画面を閲覧できますが、認証や有料機能は利用可能になりません。

標準Next.jsでは、外部リクエストのoai-authenticated-user-*ヘッダーを認証に使用しません。本人確認はSupabaseの検証済みセッションで行います。Sites専用のログインやヘッダーだけによる旧履歴の所有者確認は使えません。

## 公開中のSitesからデータを引き継ぐ場合

GitHubへのpushは公開中のSitesやD1を更新しません。この移行で本番データを自動コピー・削除していません。

1. 書き込みを止めた状態でD1のスキーマ・データをバックアップします。
2. 隔離したSupabase PostgreSQLへ変換して取り込み、外部キー整合性、件数、auth_accountsと各user_idの対応を検証します。
3. アプリが作成したPostgreSQLテーブル定義との対応を確認します。利用開始後の本番DBへ未検証データを直接取り込まないでください。
4. 同じSupabaseプロジェクトを使う場合もアカウント対応を検証します。Sitesのみの旧アカウントは別途本人確認を伴う移行が必要です。
5. 検証済みSupabase Pooler URLをVercelの`SUPABASE_DATABASE_URL`に設定し、実際のログイン・保存・決済Webhookを確認してから切り替えます。

このデータ移行と外部サービスの本番設定はまだ実行していません。

## 検証

```sh
npm run build
npm test
```

テストは標準Next.jsの本番サーバー起動、主要ルート、認証ヘッダー偽装の拒否、SQLiteの再読込・ロールバック、既存の解析枠・決済・ミッション・アカウント分離を確認します。Viteは既存単体テストでTypeScriptを読み込むためだけに使用します。
