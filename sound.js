/** All sound is synthesised locally after a player gesture. No network or autoplay. */
export function createSound() {
  let ctx, master, engine, motor, wind, windGain, tire, tireGain, noiseBuffer;
  let enabled = true;
  function init() {
    if (ctx) {
      ctx.resume().catch(() => {});
      return;
    }
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    ctx = new Audio();
    master = ctx.createGain();
    master.gain.value = enabled ? 0.27 : 0;
    master.connect(ctx.destination);
    engine = ctx.createOscillator();
    engine.type = "triangle";
    engine.frequency.value = 70;
    motor = ctx.createGain();
    motor.gain.value = 0;
    engine.connect(motor);
    motor.connect(master);
    engine.start();
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const a = noiseBuffer.getChannelData(0);
    let seed = 173;
    for (let i = 0; i < a.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      a[i] = (seed / 2147483648) * 0.6;
    }
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    wind = ctx.createBiquadFilter();
    wind.type = "lowpass";
    wind.frequency.value = 450;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    source.connect(wind);
    wind.connect(windGain);
    windGain.connect(master);
    source.start();
    tire = ctx.createBiquadFilter();
    tire.type = "bandpass";
    tire.frequency.value = 1000;
    tire.Q.value = 0.7;
    tireGain = ctx.createGain();
    tireGain.gain.value = 0;
    source.connect(tire);
    tire.connect(tireGain);
    tireGain.connect(master);
  }
  function burst(duration, frequency, volume) {
    if (!ctx || !enabled) return;
    const now = ctx.currentTime,
      source = ctx.createBufferSource(),
      filter = ctx.createBiquadFilter(),
      gain = ctx.createGain();
    source.buffer = noiseBuffer;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(frequency, now);
    filter.frequency.exponentialRampToValueAtTime(80, now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
    source.start(now);
    source.stop(now + duration);
  }
  function tone(freq, duration = 0.2, volume = 0.15, delay = 0) {
    if (!ctx || !enabled) return;
    const now = ctx.currentTime + delay,
      o = ctx.createOscillator(),
      g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(volume, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    o.connect(g);
    g.connect(master);
    o.start(now);
    o.stop(now + duration + 0.01);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  }
  return {
    init,
    setEnabled(value) {
      enabled = value;
      if (master)
        master.gain.setTargetAtTime(value ? 0.27 : 0, ctx.currentTime, 0.06);
    },
    update(s, playing) {
      if (!ctx) return;
      engine.frequency.setTargetAtTime(
        52 + s.speed * 2.7 + (s.boosting ? 55 : 0),
        ctx.currentTime,
        0.1,
      );
      motor.gain.setTargetAtTime(playing ? 0.085 : 0, ctx.currentTime, 0.15);
      const speed = Math.min(1, s.speed / 85),
        draft = s.drafting || 0;
      wind.frequency.setTargetAtTime(
        350 + speed * 1800 + (s.airborne ? 700 : 0),
        ctx.currentTime,
        0.2,
      );
      windGain.gain.setTargetAtTime(
        playing
          ? (0.035 + speed * speed * 0.25 + (s.airborne ? 0.08 : 0)) *
              (1 - draft * 0.45)
          : 0,
        ctx.currentTime,
        0.15,
      );
      tire.frequency.setTargetAtTime(
        750 + (s.drift || 0) * 1900 + speed * 250,
        ctx.currentTime,
        0.08,
      );
      tireGain.gain.setTargetAtTime(
        playing && !s.airborne && s.attachedRamp < 0
          ? speed * 0.025 +
              (s.drift || 0) * 0.18 +
              (s.course.theme === "night" ? speed * 0.012 : 0)
          : 0,
        ctx.currentTime,
        0.1,
      );
    },
    event(type) {
      if (type === "contact") {
        // A short padded bump, distinctly quieter than a damage collision.
        burst(0.075, 320, 0.14);
        tone(105, 0.08, 0.055);
      } else if (type === "land") {
        burst(0.16, 420, 0.38);
        tone(62, 0.16, 0.13);
      } else if (type === "draft") {
        tone(294, 0.25, 0.09);
        tone(440, 0.32, 0.07, 0.08);
      } else if (type === "branch" || type === "overtake") {
        tone(440, 0.2, 0.1);
        tone(659, 0.28, 0.08, 0.08);
      } else if (type === "gate" || type === "stunt") {
        tone(523, 0.28, 0.22);
        tone(784, 0.35, 0.16, 0.08);
        tone(1047, 0.4, 0.1, 0.16);
      } else if (type === "hit" || type === "fail") {
        burst(0.35, 2400, 0.55);
        tone(80, 0.35, 0.35);
        tone(57, 0.45, 0.2, 0.1);
      } else if (type === "pad" || type === "launch") {
        tone(196, 0.22, 0.16);
        tone(392, 0.3, 0.15, 0.07);
        tone(784, 0.35, 0.1, 0.14);
      } else if (type === "gap") {
        tone(392, 0.25, 0.17);
        tone(587, 0.35, 0.15, 0.12);
      } else if (type === "finish") {
        [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.8, 0.2, i * 0.13));
      } else if (type === "start") tone(659, 0.3, 0.2);
    },
  };
}
