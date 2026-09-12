# Radiant Review — Google・Xログインの接続

認証はSupabase Auth、GoogleとXはOAuth 2.0、アプリ側はサーバーだけでセッションを処理する構成です。ミッション・XP・成長記録・契約情報は、標準Next.jsサーバーの永続SQLiteディスクへ保存します。Supabaseのデータベースへ記録を移す必要はありません。

## 1. Supabaseプロジェクト

自分のSupabaseプロジェクトでProject URLとPublishable keyを確認してください。このアプリにservice_roleキーやsecret keyは不要です。

公開するNode.jsホストへ、以下を環境変数として登録します。設定値はローカルの例示ファイルやGitHubへ保存しないでください。

| 設定名 | 設定する値 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | SupabaseのProject URL。例: `https://<project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key。新しいpublishable keyは`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`でも設定可能 |
| `AUTH_SITE_URL` | `https://radiantai.jp` |
| `NEXT_PUBLIC_SITE_URL` | `https://radiantai.jp` |
| `SQLITE_PATH` | 永続ディスク上のDBパス。Docker構成では`/data/radiant.sqlite` |

2つのSupabase設定が両方空の間はGoogle・Xボタンが準備中になります。両方を同時に登録してください。片方だけ、無効なキー、接続障害の場合は、認証を安全に停止します。

SupabaseのAuthentication → URL Configuration:

| 項目 | 値 |
| --- | --- |
| Site URL | `https://radiantai.jp` |
| Redirect URLs | `https://radiantai.jp/auth/callback` |

本番には完全一致のRedirect URLを登録します。`www.radiantai.jp`も公開する場合は、正規ドメインへリダイレクトするか、対応するCallback URLも追加します。

## 2. Google

Google Auth PlatformでWeb applicationのOAuthクライアントを作成し、Audience・Branding・Data Accessを設定します。

- 許可するJavaScript origin: `https://radiantai.jp`
- Google側のAuthorized redirect URI: SupabaseのGoogle Provider設定画面で表示される `https://<project-ref>.supabase.co/auth/v1/callback`
- 基本の認証・プロフィールの権限: `openid`、email、profile
- 作成したClient ID・Client Secretを、Supabase → Authentication → Sign In / Providers → Googleに入力し有効化
- GoogleのAudienceがテスト中なら、試用するGoogleアカウントをテストユーザーとして追加

Google側に登録するURIと、このアプリの `/auth/callback` は異なります。Client SecretはSupabaseに保存し、サイトの画面やソースには含めません。

公式: https://supabase.com/docs/guides/auth/social-login/auth-google

## 3. X（Twitter）

X DeveloperのアプリでUser authentication settingsを設定します。

- Type of App: Web App
- Request email from usersを有効化
- Callback URL: SupabaseのX Provider設定画面にある `https://<project-ref>.supabase.co/auth/v1/callback`
- Website URL: `https://radiantai.jp`
- Privacy policy URL: `https://radiantai.jp/privacy`
- Terms of service URL: `https://radiantai.jp/legal`（公開前に運営者が内容と連絡先を確定）
- OAuth 2.0のClient ID・Client Secretを、Supabase → Authentication → Sign In / Providers → **X / Twitter (OAuth 2.0)** に設定し有効化

アプリのprovider識別子は **`x`** です。旧OAuth 1.0aの `twitter` や、そのAPI Key/Secretとは異なります。

公式: https://supabase.com/docs/guides/auth/social-login/auth-twitter

## 4. 同じ記録をGoogle・Xで使う

同じメールを持つOAuth identityの連携はSupabaseの検証と標準動作に任せます。このアプリでメール一致を理由に記録を統合しません。

異なるメールのGoogleとXも同じアカウントへ連携する場合は、SupabaseのManual linkingを有効化します。ログイン後のアカウント画面で「Googleを連携」「Xを連携」を使います。この機能はSupabaseでbeta扱いです。すでに別のアカウントへ紐づくidentityは自動で統合できません。

公式: https://supabase.com/docs/guides/auth/auth-identity-linking

## 5. 以前のChatGPTアカウントの記録

1. 以前と同じChatGPTアカウントでサイトへ入った状態で、GoogleまたはXでログインします。
2. 新しい解析・記録・購入の操作を始める前に、アカウント画面の「以前のアカウントを引き継ぐ」を押します。
3. サーバーが両方のログインを確認し、旧ユーザーIDとSupabaseのユーザーを結び付けます。月間ミッション、XP、解析枠、成長記録、既存の契約は旧IDのまま参照します。
4. 端末内だけに保存していた旧レポート・単発ミッションのXPは「自分の旧レポートを取り込む」で明示的に取り込みます。新しい端末へ自動同期する機能ではありません。

使い始めた2アカウントを上書き統合したり、他のSupabaseユーザーが引き継いだIDを再利用したりする処理は拒否します。解析・記録・購入などの操作を開始するとIDの対応を固定します。決済画面を開いている間の引き継ぎで、契約の持ち主が食い違うことを防ぐためです。旧記録は削除しません。

## 6. 接続後の実アカウント確認

- GoogleとXをそれぞれ使ってログインし、表示名と連携済み表示を確認する。
- ブラウザの別プロフィールで別の利用者になり、他人のミッション・成長記録・課金状態が見えないことを確認する。
- ページ再読み込み、期限切れセッションの更新、キャンセル、ログアウトを確認する。
- 別タブでアカウントを変更したとき、古いアカウントの画面から記録・購入・解析できないことを確認する。
- 同じ本人によるGoogle/Xの連携と旧記録の引き継ぎを確認する。
- 公開先の設定値変更後は再デプロイしてから実機確認する。

実装ではHTTPOnly・Secure・SameSite=LaxのCookie、PKCE、Supabase AuthへのgetUser検証、アカウントごとのSQLite所有権確認を使います。開始・連携・引き継ぎ・ログアウトは同じサイトからのPOSTだけを受け付けます。認証結果と個人データをキャッシュしません。投稿・DM送信やタイムライン取得の機能は追加していません。

Supabase・Google・Xの実プロジェクトの登録や設定は未実施です。実アカウントのログインと連携は、設定後に上記の確認が必要です。

参考: https://supabase.com/docs/guides/auth/server-side/advanced-guide
