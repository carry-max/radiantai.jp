# RadiantAI Windows

VALORANTの試合中はイベント検出と録画だけを行い、試合後にRadiantAIへ解析を依頼するWindowsクライアントです。UIはReact + TypeScript、デスクトップ基盤はOverwolf Electron、動画の検査・フレーム抽出・再エンコードはRust CLIとFFmpegで処理します。

```text
React + TypeScript
        ↓
Overwolf Electron (GEP / Recorder)
        ↓
VALORANT起動・Kill・Death検出・自動クリップ
        ↓
Rust worker + FFmpeg / FFprobe
        ↓
RadiantAI API → private Supabase Storage → Gemini / GPT
```

試合中にオーバーレイや助言を表示しません。Deathイベントでは35秒の録画バッファから死亡前25秒を取り出し、死亡後5秒を待って30秒のMP4を端末へ保存します。解析を実行したクリップだけを非公開Storageへ一時送信し、解析要求が終わるとサーバーが削除します。

## 必要なもの

- Windows 10/11 x64
- Node.js 22.16以上
- Rust stable GNU toolchain（ネイティブワーカーをビルドする場合）
- Overwolf Electronの開発者アカウントとDev Key
- RadiantAIへログインできる公開サイトまたはローカル環境

Overwolfの本番配布には、GEP・Recorderを含むアプリ審査と署名設定が必要です。Riotの公開API申請とは別の手続きです。

提出用の英語文面、QA計画、本番署名手順は[`docs/overwolf`](../../docs/overwolf)にあります。

## セットアップ

```powershell
cd apps/windows-overwolf
npm ci
npm run typecheck
npm run build
```

開発時は次を設定します。

| 変数 | 用途 |
| --- | --- |
| `RADIANTAI_SITE_URL` | 接続先。既定値は`https://radiantai.jp` |
| `OW_DEV_KEY` | Overwolf Electronの開発実行 |
| `OW_CLI_EMAIL` / `OW_CLI_API_KEY` | Overwolf CLI認証 |
| `OW_BUILD_KEY` | 審査・配布用ビルドキー |

起動は`npm start`、Windowsインストーラー生成は`npm run build:ow-electron`です。インストーラーには`native/target/release/radiantai-native.exe`が同梱されます。

## Web側の設定

Supabase Storageに`radiantai-aim-clips`という**非公開**bucketを作成し、Vercelへ次を追加します。

| 変数 | 公開範囲 | 用途 |
| --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret / サーバーのみ | 署名付きアップロード・読取URLの発行と一時ファイル削除 |
| `SUPABASE_AIM_CLIPS_BUCKET` | Server | 非公開bucket名。未設定時は`radiantai-aim-clips` |

Service Role Keyを`NEXT_PUBLIC_*`へ設定したり、Windowsアプリへ埋め込んだりしないでください。アプリはRadiantAIのログインCookieを使い、利用者専用の署名付きURLだけを取得します。

## 動作確認

```powershell
npm run typecheck
npm run build:ui
npm run build:electron
cargo test --manifest-path native/Cargo.toml
cargo build --manifest-path native/Cargo.toml --release
```

ブラウザ用のUIプレビューは`npm run dev:ui`で確認できます。GEPとRecorderの実機確認はOverwolf Electron上でVALORANTを起動して行います。
