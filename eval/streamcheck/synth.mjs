// Deterministic stand-in signals for the Stream Check eval. Frames are pure
// functions of (stream, fault, second): no wall clock, no network, no random
// drift, so a rerun reproduces every sample bit-for-bit. Controls are tuned
// to sit clear of the shipped thresholds: dark-live stays above the black
// cut, low-motion stays above the still cut.
import { WINDOW } from './faults.mjs';

export const W = 32;
export const H = 18;
export const AUDIO_N = 480;

function inWin(t) {
  return t >= WINDOW.start && t < WINDOW.end;
}

// Integer hash noise in [-half, half]: stable across runs and platforms.
function noise(x, y, t, half) {
  const h = (Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663) ^ Math.imul(t + 1, 83492791)) >>> 0;
  return (h % (half * 2 + 1)) - half;
}

function liveLuma(streamId, x, y, t) {
  if (streamId === 'dark-live') return 46 + ((x + t * 2) % 32 < 4 ? 44 : 0) + noise(x, y, t, 6);
  if (streamId === 'low-motion') return 120 + (((x * H + y) % 12 === t % 12) ? 50 : 0) + noise(x, y, t, 4);
  return 140 + ((x + t * 3) % 32 < 6 ? 60 : 0) + noise(x, y, t, 8);
}

function liveFrame(streamId, t) {
  const data = new Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = Math.max(0, Math.min(255, Math.round(liveLuma(streamId, x, y, t))));
      const i = (y * W + x) * 4;
      data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
    }
  }
  return { data, w: W, h: H };
}

function blackFrame() {
  const data = new Array(W * H * 4);
  for (let i = 0; i < W * H; i++) { data[i * 4] = 0; data[i * 4 + 1] = 0; data[i * 4 + 2] = 0; data[i * 4 + 3] = 255; }
  return { data, w: W, h: H };
}

// Picture the viewer sees at second t. Frozen holds the fault-start frame
// for the whole window; black is zero luma; down is a transport fault so
// the picture path is untouched (the harness scores it over HTTP instead).
export function frameAt(streamId, faultType, t) {
  if (faultType === 'black' && inWin(t)) return blackFrame();
  if (faultType === 'frozen' && inWin(t)) return liveFrame(streamId, WINDOW.start);
  return liveFrame(streamId, t);
}

// PCM-ish samples at second t: a steady tone plus hash noise, or digital
// silence while muted.
export function audioAt(faultType, t) {
  const out = new Array(AUDIO_N);
  if (faultType === 'muted' && inWin(t)) { out.fill(0); return out; }
  for (let i = 0; i < AUDIO_N; i++) {
    out[i] = 0.2 * Math.sin((i / AUDIO_N) * Math.PI * 2 + t) + noise(i, t, 7, 2) / 100;
  }
  return out;
}
