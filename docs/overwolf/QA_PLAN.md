# RadiantAI Overwolf QA Plan

## Submission target

- Product: RadiantAI Windows 0.1.0
- Framework: Overwolf Electron
- Game: VALORANT
- Packages: GEP, Recorder, Utility
- Window: branded desktop window, 1280×820 default, 920×680 minimum
- In-game overlay: none

## Test environment matrix

| Area | Required checks |
| --- | --- |
| Windows | Windows 10 22H2 and Windows 11 current release, x64 |
| Display | 1920×1080 at 100% and 125%, 2560×1440 at 100%, second monitor |
| VALORANT | Windowed fullscreen and fullscreen; app and game at matching privilege levels |
| Audio | Default game audio present, missing microphone, output-device change |
| Network | Online, login expired, upload interrupted, backend unavailable |
| Storage | Normal Videos folder, low disk space, clip moved or deleted |

## Functional acceptance

1. Launching RadiantAI always shows a desktop window and a clear status.
2. Starting VALORANT changes the app from waiting to detected without showing an in-game overlay.
3. Kill increments only the local kill counter.
4. Death increments only the local death counter and saves one MP4 containing approximately 25 seconds before and 5 seconds after the event.
5. Repeated or duplicate Recorder callbacks do not create duplicate records.
6. Exiting VALORANT stops the replay buffer and keeps saved clips available.
7. The user can open the local clip folder without exposing another user's files.
8. The user can sign in through the RadiantAI modal and the session persists only in the dedicated Electron partition.
9. Pressing Analyze uploads only the selected clip to private storage.
10. A completed response is saved locally; failed analysis releases the usage reservation and shows a retryable error.
11. The temporary Storage object is deleted for success, failure, quota rejection, and cached results.
12. Three analyzed scenes are allowed for one match; monthly mode limits remain shared with the web account.

## Competitive-integrity checks

- No overlay package is included.
- No window appears over active VALORANT gameplay.
- No tactical, aim, economy, enemy, timer, or upgrade notification appears during a match.
- GEP data is used only for local-player event labels and app status.
- Analysis can be started only from the desktop window by the user.
- The Riot non-endorsement notice is visible in the desktop window and privacy page.

## Security and privacy checks

- `SUPABASE_SERVICE_ROLE_KEY`, Gemini, GPT, and Overwolf signing credentials are absent from `app.asar` and renderer bundles.
- Renderer has `nodeIntegration: false` and `contextIsolation: true`.
- Authentication uses an isolated persistent session partition.
- Upload tickets require a verified session, same-origin request, MP4 content type, and a maximum declared size of 120 MB.
- Storage paths are scoped to the authenticated Supabase UUID.
- Railway accepts only signed Supabase URLs and a server-to-server bearer token.
- Logs contain no OAuth tokens, signed URLs, API keys, or raw video bytes.

## Evidence to attach to QA

- Desktop window screenshot while VALORANT is not running
- Desktop window screenshot while Recorder is buffering
- Post-match clip list screenshot
- 30-second example clip with visible timestamps
- Screen recording showing launch → death capture → game exit → user-started analysis
- `npm test`, TypeScript, Next.js, Rust, and Authenticode validation results
- Riot third-party application approval or current approval reference requested by Overwolf

## Release gate

Production submission is allowed only when every item above passes, the Overwolf app proposal is approved, Riot approval is available, the Overwolf App UID and Build Key are issued, and the generated installer has a valid trusted Authenticode signature.
