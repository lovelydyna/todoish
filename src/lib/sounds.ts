/**
 * Completion tones, synthesised rather than loaded from files — no assets to
 * bundle and nothing for the CSP to block.
 *
 * The desktop catch: an AudioContext does not stay running. Browsers create it
 * suspended until a user gesture, and WebKit (which is what Tauri renders with
 * on macOS) suspends it again whenever the window is hidden — which this app
 * does constantly, since it lives in the tray. A suspended context accepts
 * every call and plays nothing, so without an explicit resume the sounds work
 * once and are silent forever after the first hide.
 */

let ctx: AudioContext | null = null;

/** Returns a *running* context, resuming or rebuilding it as needed. */
async function getCtx(): Promise<AudioContext | null> {
  const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
  if (!Ctor) return null;

  // A closed context can never be resumed — only replaced.
  if (!ctx || ctx.state === "closed") {
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
  }

  if (ctx.state !== "running") {
    try {
      await ctx.resume();
    } catch {
      return null;
    }
  }

  // WebKit can report "interrupted"; treat anything but running as unusable
  // rather than scheduling notes into a context that will never play them.
  return ctx.state === "running" ? ctx : null;
}

/**
 * Nudges the context back awake when the window returns. Resuming on the way
 * back in means the first completion after un-hiding is audible, instead of
 * being the one that silently gets dropped.
 */
export function initAudio(): () => void {
  const wake = () => { if (!document.hidden) void getCtx(); };
  document.addEventListener("visibilitychange", wake);
  window.addEventListener("focus", wake);
  return () => {
    document.removeEventListener("visibilitychange", wake);
    window.removeEventListener("focus", wake);
  };
}

function bell(ac: AudioContext) {
  const now = ac.currentTime;
  const partials: [number, number, number][] = [
    [880, 0.5, 0.6],
    [1760, 0.2, 0.4],
    [2640, 0.1, 0.25],
    [3520, 0.05, 0.15],
  ];
  partials.forEach(([freq, amp, decay]) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(amp, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);
    osc.start(now);
    osc.stop(now + decay);
  });
}

function chime(ac: AudioContext) {
  const now = ac.currentTime;
  [523.25, 783.99].forEach((freq, i) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.type = "sine";
    osc.frequency.value = freq;
    const t = now + i * 0.12;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.25, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.start(t);
    osc.stop(t + 0.35);
  });
}

function click(ac: AudioContext) {
  const now = ac.currentTime;
  const buf = ac.createBuffer(1, ac.sampleRate * 0.05, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.005));
  }
  const src = ac.createBufferSource();
  const gain = ac.createGain();
  const filter = ac.createBiquadFilter();
  src.buffer = buf;
  filter.type = "bandpass";
  filter.frequency.value = 3000;
  src.connect(filter);
  filter.connect(gain);
  gain.connect(ac.destination);
  gain.gain.setValueAtTime(0.4, now);
  src.start(now);
}

/** Fire-and-forget: a tone must never delay or break the action that caused it. */
export function playComplete(tone = "bell"): void {
  if (tone === "none") return;
  void getCtx().then((ac) => {
    if (!ac) return;
    if (tone === "chime") return chime(ac);
    if (tone === "click") return click(ac);
    bell(ac);
  });
}
