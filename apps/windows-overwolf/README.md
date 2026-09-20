# Radiant AI Windows / Overwolf AIM capture

This directory contains the capture contract for the Windows app. It is intended to be included in the approved Overwolf background app, not executed by Next.js.

1. Start Overwolf replay buffering when VALORANT starts.
2. Subscribe to `death`, `game_info`, and `match_info`.
3. On the local player's `death` event, call `overwolf.media.replays.capture(25000, 5000, ...)`.
4. Keep the returned clips locally during the match.
5. After `match_end`, show `CLIP 01`, `CLIP 02`, and so on in the Windows app.
6. Upload a selected clip to the private Supabase Storage bucket and send its short-lived signed URL to `POST /api/aim/analyze`.
7. Railway downloads the signed clip and sends it to `gemini-3.8-flash` for post-match micro analysis.

The Overwolf manifest must request GameInfo and VideoCaptureSettings permissions and declare VALORANT game events. Packaging and Store submission are intentionally separate from the web deployment because the final app ID, signing identity, and review approval are issued by Overwolf.
