let ctx: AudioContext | null = null;

function getCtx() {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

function bell() {
  const ac = getCtx();
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

function chime() {
  const ac = getCtx();
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

function click() {
  const ac = getCtx();
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

export function playComplete(tone = "bell") {
  if (tone === "none") return;
  if (tone === "chime") return chime();
  if (tone === "click") return click();
  bell();
}
