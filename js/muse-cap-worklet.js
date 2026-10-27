/* AudioWorklet: mono float32 at the context rate → 16 kHz int16 chunks.
   The API takes WAV (file path) or 16/24 kHz PCM (realtime); we ship 16 kHz
   mono, the cheapest intelligible shape. Plain decimation is fine for speech. */
class MuseCap extends AudioWorkletProcessor {
  constructor() { super(); this._carry = []; this._ratio = 0; }
  process(inputs) {
    var ch = inputs[0] && inputs[0][0];
    if (!ch || !ch.length) return true;
    var inRate = sampleRate || 48000, step = inRate / 16000, pos = this._ratio, out = [];
    while (pos < ch.length) {
      var i0 = Math.floor(pos), i1 = Math.min(ch.length - 1, i0 + 1), fr = pos - i0;
      var s = ch[i0] * (1 - fr) + ch[i1] * fr;
      s = Math.max(-1, Math.min(1, s));
      out.push(s < 0 ? Math.round(s * 32768) : Math.round(s * 32767));
      pos += step;
    }
    this._ratio = pos - ch.length;
    if (out.length) this.port.postMessage(new Int16Array(out));
    return true;
  }
}
registerProcessor('muse-cap', MuseCap);
