const VALORANT_FEATURES = ["death", "game_info", "match_info"];
const PAST_DURATION_MS = 25_000;
const FUTURE_DURATION_MS = 5_000;

/**
 * Connect this module to the approved Radiant AI Overwolf background window.
 * The Windows shell owns local persistence and uploads clips only after match_end.
 */
export function startDeathClipCapture({ onClip, onStatus }) {
  let captureInProgress = false;
  let matchActive = false;
  let deathIndex = 0;

  const report = (message, detail) => onStatus?.({ message, detail });
  const captureDeath = () => {
    if (!matchActive || captureInProgress) return;
    captureInProgress = true;
    const index = ++deathIndex;
    overwolf.media.replays.capture(
      PAST_DURATION_MS,
      FUTURE_DURATION_MS,
      result => {
        captureInProgress = false;
        if (!result?.success || !result.url) return report("clip_failed", result?.error);
        onClip?.({ index, path: result.url, beforeSeconds: 25, afterSeconds: 5, capturedAt: new Date().toISOString() });
      },
      result => {
        if (!result?.success) {
          captureInProgress = false;
          report("capture_start_failed", result?.error);
        }
      },
    );
  };

  overwolf.games.events.onNewEvents.addListener(({ events = [] }) => {
    for (const event of events) {
      if (event.name === "match_start") { matchActive = true; deathIndex = 0; report("match_started"); }
      if (event.name === "death") captureDeath();
      if (event.name === "match_end") { matchActive = false; report("match_finished"); }
    }
  });

  overwolf.games.events.setRequiredFeatures(VALORANT_FEATURES, result => {
    if (!result?.success) report("features_unavailable", result?.error);
    else report("death_detection_ready");
  });
}
