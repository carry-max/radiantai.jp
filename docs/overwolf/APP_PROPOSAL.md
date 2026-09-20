# RadiantAI — Overwolf App Proposal

## Form-ready English copy

### App name

RadiantAI

### Framework and supported game

Overwolf Electron for VALORANT on Windows 10/11 x64.

### One-line description

RadiantAI is a post-match coaching app that automatically saves short death clips and turns them into clear, evidence-based improvement tasks after the match.

### Problem and user value

VALORANT players often know that a round went wrong but cannot identify whether the cause was crosshair placement, movement before the shot, peek timing, target switching, positioning, or information use. Reviewing a full recording is time-consuming. RadiantAI detects the local player's death events, saves a 30-second local clip, and lets the player request a structured post-match review. The output focuses on one observed issue, supporting evidence, and the next practice task.

### User experience

1. The user installs RadiantAI and opens its clearly branded desktop window.
2. RadiantAI detects VALORANT through Overwolf GEP and starts a local 35-second Recorder buffer.
3. During an active match, the app records only. It displays no overlay, tactical advice, opponent information, timers, alerts, or calls to action.
4. When the local player dies, RadiantAI saves the 25 seconds before death and 5 seconds after death to the user's Videos folder.
5. After the match, the user opens the desktop window, reviews the saved clips, and explicitly selects a clip for analysis.
6. Only the selected clip is uploaded through a short-lived signed URL to private storage. The backend uses video AI to identify observable mechanics, then organizes the findings into concise coaching advice. The temporary cloud copy is deleted after processing.

### Overwolf capabilities requested

- GEP: `me`, `game_info`, `match_info`, `kill`, and `death`
- Recorder: a 35-second local replay buffer and a 30-second death clip
- Utility: desktop integration required by the Electron runtime

The app does not request the Overlay package and does not draw on top of VALORANT.

### Competitive-integrity statement

RadiantAI is strictly post-match. It does not provide live recommendations, enemy intelligence, spike timers, cooldown tracking, aim assistance, input automation, or any information that changes player decisions during active gameplay. Kill and death events are used only to label local recordings for later review. The app is designed to comply with Riot Games and Overwolf competitive-integrity requirements.

### Data and privacy

- Clips are saved locally by default.
- A clip leaves the device only after the user presses the analysis button after the match.
- Uploads use a user-scoped, short-lived signed URL to a private Supabase Storage bucket.
- Service-role credentials and AI provider keys are never included in the Windows app.
- The temporary cloud clip is deleted after the analysis request finishes.
- Account and analysis metadata are stored in Supabase. The video-analysis worker does not maintain a separate user database.
- Privacy policy: https://radiantai.jp/privacy

### Monetization plan

The initial Overwolf release will be a public free beta without ads. If monetization is added to the Overwolf-distributed app, it will use Overwolf-approved subscriptions or advertising and will be implemented only after review with Overwolf DevRel. No purchase prompt or advertisement is shown during a match.

### Current development status

The React + TypeScript desktop UI, Overwolf Electron GEP/Recorder integration, Rust + FFmpeg local worker, signed private upload flow, and Gemini-to-GPT post-match analysis pipeline are implemented. Automated tests cover the capture window, required Overwolf packages, native worker protocol, private upload flow, and shared usage allowance.

### Public links

- Product: https://radiantai.jp
- Privacy: https://radiantai.jp/privacy
- Source repository: https://github.com/carry-max/radiantai.jp

### Riot disclaimer shown in the app

RadiantAI isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games and all associated properties are trademarks or registered trademarks of Riot Games, Inc.

## Japanese reference

RadiantAIは、VALORANTのローカルプレイヤーのDeathを検出して死亡前25秒＋死亡後5秒を端末に保存し、利用者が試合後に選択したクリップだけを解析する公開Windowsアプリです。試合中は録画だけを行い、オーバーレイ、助言、敵情報、タイマー、入力補助を一切表示しません。解析時だけ非公開Storageへ一時アップロードし、処理後に削除します。
