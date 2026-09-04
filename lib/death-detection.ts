export type DeathDetectionSample = {
  time: number;
  panelScore: number;
  flashScore: number;
};

export type DeathCandidate = {
  id: string;
  time: number;
  confidence: "high" | "medium" | "low";
  strength: number;
};

type RegionStats = {
  edgeRatio: number;
  neutralRatio: number;
  darkRatio: number;
  redRatio: number;
};

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function pixelLuma(data: Uint8ClampedArray, index: number) {
  return data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722;
}

function regionStats(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  xStart: number,
  xEnd: number,
  yStart: number,
  yEnd: number,
): RegionStats {
  const left = Math.max(0, Math.floor(width * xStart));
  const right = Math.min(width - 4, Math.ceil(width * xEnd));
  const top = Math.max(0, Math.floor(height * yStart));
  const bottom = Math.min(height - 4, Math.ceil(height * yEnd));
  let count = 0;
  let edges = 0;
  let neutral = 0;
  let dark = 0;
  let red = 0;

  for (let y = top; y < bottom; y += 3) {
    for (let x = left; x < right; x += 3) {
      const index = (y * width + x) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const luma = pixelLuma(data, index);
      const rightIndex = (y * width + Math.min(width - 1, x + 3)) * 4;
      const downIndex = (Math.min(height - 1, y + 3) * width + x) * 4;
      const edgeAmount = Math.abs(luma - pixelLuma(data, rightIndex)) + Math.abs(luma - pixelLuma(data, downIndex));

      count += 1;
      if (edgeAmount > 58) edges += 1;
      if (Math.max(r, g, b) - Math.min(r, g, b) < 25 && luma > 24 && luma < 226) neutral += 1;
      if (luma > 18 && luma < 92) dark += 1;
      if (r > 92 && r - g > 31 && r - b > 19) red += 1;
    }
  }

  const divisor = Math.max(1, count);
  return {
    edgeRatio: edges / divisor,
    neutralRatio: neutral / divisor,
    darkRatio: dark / divisor,
    redRatio: red / divisor,
  };
}

/**
 * Scores the asymmetric panel that VALORANT displays on the right after a death.
 * The mirror region on the left keeps the detector independent of resolution,
 * HUD scale and most map lighting changes.
 */
export function measureDeathFrame(data: Uint8ClampedArray, width: number, height: number) {
  const right = regionStats(data, width, height, 0.70, 0.985, 0.15, 0.82);
  const left = regionStats(data, width, height, 0.015, 0.30, 0.15, 0.82);
  const full = regionStats(data, width, height, 0.04, 0.96, 0.08, 0.92);

  const edgeScore = clamp((right.edgeRatio - left.edgeRatio - 0.012) * 8.2, 0, 0.46);
  const neutralScore = clamp((right.neutralRatio - left.neutralRatio - 0.018) * 2.5, 0, 0.27);
  const darkScore = clamp((right.darkRatio - left.darkRatio - 0.035) * 1.7, 0, 0.17);
  const redPanelScore = clamp((right.redRatio - left.redRatio - 0.012) * 2.2, 0, 0.1);

  return {
    panelScore: clamp(edgeScore + neutralScore + darkScore + redPanelScore),
    flashScore: clamp((full.redRatio - 0.045) * 3.4),
  };
}

export function extractDeathCandidates(
  samples: DeathDetectionSample[],
  duration: number,
): DeathCandidate[] {
  if (samples.length < 3) return [];
  const ordered = [...samples]
    .filter((sample) => Number.isFinite(sample.time) && Number.isFinite(sample.panelScore))
    .sort((a, b) => a.time - b.time);
  if (ordered.length < 3) return [];

  const scores = ordered.map((sample) => clamp(sample.panelScore + Math.min(0.1, sample.flashScore * 0.12)));
  const baseline = median(scores);
  const deviation = median(scores.map((score) => Math.abs(score - baseline)));
  const threshold = clamp(baseline + Math.max(0.115, deviation * 3.4), 0.255, 0.72);
  const segments: Array<{ start: number; end: number; peak: number; samples: number }> = [];
  let active: { start: number; end: number; peak: number; samples: number; gaps: number } | null = null;

  for (let index = 0; index < ordered.length; index += 1) {
    const sample = ordered[index];
    const score = scores[index];
    const isPanel = score >= threshold;
    if (isPanel) {
      if (!active) active = { start: sample.time, end: sample.time, peak: score, samples: 1, gaps: 0 };
      else {
        active.end = sample.time;
        active.peak = Math.max(active.peak, score);
        active.samples += 1;
        active.gaps = 0;
      }
      continue;
    }
    if (!active) continue;
    active.gaps += 1;
    if (active.gaps <= 1) continue;
    segments.push({ start: active.start, end: active.end, peak: active.peak, samples: active.samples });
    active = null;
  }
  if (active) segments.push({ start: active.start, end: active.end, peak: active.peak, samples: active.samples });

  const candidates: DeathCandidate[] = [];
  for (const segment of segments) {
    const segmentDuration = Math.max(0, segment.end - segment.start);
    if (segment.samples < 2 || segmentDuration > 125 || segment.peak < threshold + 0.025) continue;
    const time = clamp(segment.start - 0.45, 0, Math.max(0, duration - 0.05));
    const strength = clamp((segment.peak - threshold) / Math.max(0.12, 1 - threshold));
    const confidence: DeathCandidate["confidence"] = strength >= 0.48 && segment.samples >= 3
      ? "high"
      : strength >= 0.2
        ? "medium"
        : "low";
    const previous = candidates.at(-1);
    if (previous && time - previous.time < 12) {
      if (strength > previous.strength) {
        candidates[candidates.length - 1] = {
          id: `death-${Math.round(time * 10)}`,
          time,
          confidence,
          strength,
        };
      }
      continue;
    }
    candidates.push({ id: `death-${Math.round(time * 10)}`, time, confidence, strength });
    if (candidates.length >= 30) break;
  }

  return candidates;
}
