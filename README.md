# Radiant Review / VALORANT

VALORANT録画から場面を切り出し、立ち回り・AIMをレビューする標準Next.js App Routerアプリです。既存の画面構造とCSSを維持しています。

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

Node.js組み込みSQLiteを使用します。SQLITE_PATHに永続ディスク上のファイルを指定してください。未指定なら.data/radiant.sqliteを作成します。初回接続時にdrizzle/の既存マイグレーションをトランザクション内で適用し、適用履歴を記録します。複数SQLのbatchもまとめてコミットし、失敗時はロールバックします。

永続ディスク付きの単一Node.jsホストを前提とします。Vercelなど一時ファイルシステムのサーバーレス環境や、複数ホストへの水平分散では共有データベースへの変更が必要です。DBファイルはGitに含めません。バックアップにはSQLiteの整合性を保つバックアップ手段を使ってください。

既存のDrizzleクエリとの互換性のためD1ドライバーのSQL変換部分を利用しますが、Cloudflare WorkerやD1バインディングは起動に不要です。

## 認証・解析・決済の設定

.env.exampleを参照し、実際の値を.env.localまたはホスト側で設定します。

- Supabase：SUPABASE_URL、SUPABASE_PUBLISHABLE_KEY、AUTH_SITE_URL。Google/Xを有効にし、AUTH_SITE_URL/auth/callbackをSupabaseの許可済みリダイレクトURLへ追加します。本番ではAUTH_SITE_URLを実際のHTTPS URLに変更します。
- AI解析：OPENAI_API_KEYなどのサーバー環境変数。キーをブラウザ公開用の変数にしないでください。
- 決済：Stripeのキー・Webhookシークレット、販売者情報など既存の条件を設定します。Webhook送信先は新しいホストの/api/billing/webhookです。
- 設定がない場合は画面を閲覧できますが、認証や有料機能は利用可能になりません。

標準Next.jsでは、外部リクエストのoai-authenticated-user-*ヘッダーを認証に使用しません。本人確認はSupabaseの検証済みセッションで行います。Sites専用のログインやヘッダーだけによる旧履歴の所有者確認は使えません。

## 公開中のSitesからデータを引き継ぐ場合

GitHubへのpushは公開中のSitesやD1を更新しません。この移行で本番データを自動コピー・削除していません。

1. 書き込みを止めた状態でD1のスキーマ・データをバックアップします。
2. 隔離したSQLiteへ取り込み、外部キー整合性、件数、auth_accountsと各user_idの対応を検証します。
3. 既存マイグレーションとの対応を確認してrr_node_migrationsへ適用済みtagを記録します。既存テーブルに初期マイグレーションを再実行しないでください。
4. 同じSupabaseプロジェクトを使う場合もアカウント対応を検証します。Sitesのみの旧アカウントは別途本人確認を伴う移行が必要です。
5. 検証済みDBをSQLITE_PATHに指定して起動し、実際のログイン・保存・決済Webhookを確認してから切り替えます。

このデータ移行と外部サービスの本番設定はまだ実行していません。

## 検証

```sh
npm run build
npm test
```

テストは標準Next.jsの本番サーバー起動、主要ルート、認証ヘッダー偽装の拒否、SQLiteの再読込・ロールバック、既存の解析枠・決済・ミッション・アカウント分離を確認します。Viteは既存単体テストでTypeScriptを読み込むためだけに使用します。

worker/、build/、vite.config.ts、.openai/と旧Sitesスクリプトは元の構成の参照用です。標準Next.jsの起動・ビルドには使用しません。
